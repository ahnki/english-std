import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { ref, get, update } from 'firebase/database'
import { db } from './firebase'
import { parseByCategory } from './parsers'
import { CATEGORIES, guessCategory, isKnownSheet } from './categories'
import { formatSenses } from './pos'
import { buildFolderPayload, folderKeyOf } from './importPayload'
import { resetProgressPaths } from './progressLogic'

const ROLE_LABEL = { head: '핵심', related: '파생', extra: '추가', main: '' }
const PREVIEW_STEP = 60

function dbError(err) {
  const text = `${err?.code || ''} ${err?.message || ''}`
  if (/permission/i.test(text)) {
    return '데이터베이스에 접근할 권한이 없어요. 로그인 상태와 Realtime Database 규칙(users/내ID)을 확인해 주세요.'
  }
  return `오류가 발생했어요. (${err?.code || err?.message || '알 수 없음'})`
}

// 시트 표에 보여줄 "구성" 글자
function describe(p) {
  const s = p.stats
  if (p.category === 'toeic') return `핵심 ${s.head} · 파생 ${s.related} · 추가 ${s.extra}`
  return `${s.total}개` + (s.topics.length > 1 ? ` · 주제 ${s.topics.length}개` : '')
}

export default function ImportPage({ user }) {
  const [fileName, setFileName] = useState('')
  const [rawSheets, setRawSheets] = useState([]) // [{ name, rows }]
  const [catOf, setCatOf] = useState({}) // 시트 이름 -> 카테고리 id
  const [skipHeader, setSkipHeader] = useState(false)
  const [selected, setSelected] = useState({}) // 시트 이름 -> 선택 여부
  const [previewName, setPreviewName] = useState('')
  const [showCount, setShowCount] = useState(PREVIEW_STEP)
  const [existing, setExisting] = useState([]) // 이미 저장된 폴더 ("카테고리/폴더키")
  const [mode, setMode] = useState('skip') // skip | overwrite
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [message, setMessage] = useState(null) // { type: 'ok' | 'bad', text }

  async function loadExisting() {
    const snap = await get(ref(db, `users/${user.uid}/folders`))
    const value = snap.val() || {}
    const keys = []
    for (const [cat, folders] of Object.entries(value)) {
      for (const key of Object.keys(folders || {})) keys.push(`${cat}/${key}`)
    }
    setExisting(keys)
  }

  useEffect(() => {
    loadExisting().catch((err) => setMessage({ type: 'bad', text: dbError(err) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.uid])

  // 파일을 읽어서 시트별 원본 줄(rows)을 보관합니다.
  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setMessage(null)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const sheets = wb.SheetNames.map((name) => ({
        name,
        rows: XLSX.utils.sheet_to_json(wb.Sheets[name], {
          header: 1,
          defval: '',
          blankrows: true,
          raw: false,
        }),
      }))
      setFileName(file.name)
      setRawSheets(sheets)
      setCatOf(Object.fromEntries(sheets.map((s) => [s.name, guessCategory(s.name)])))
      // 이름을 아는 시트(1d~30d, 회화, 기본단어, 순우리말)만 처음부터 체크해 둡니다.
      setSelected(Object.fromEntries(sheets.map((s) => [s.name, isKnownSheet(s.name)])))
      setPreviewName(sheets[0]?.name || '')
      setShowCount(PREVIEW_STEP)
    } catch (err) {
      setRawSheets([])
      setMessage({ type: 'bad', text: `파일을 읽지 못했어요. 엑셀(.xlsx) 파일인지 확인해 주세요. (${err.message})` })
    }
  }

  // 시트마다, 고른 카테고리의 읽기 규칙을 적용합니다.
  const parsed = useMemo(
    () =>
      rawSheets.map((s) => {
        const category = catOf[s.name] || 'word'
        return { name: s.name, category, ...parseByCategory(category, s.rows, { skipHeader }) }
      }),
    [rawSheets, skipHeader, catOf],
  )

  const existsKey = (p) => `${p.category}/${folderKeyOf(p.name)}`
  const selectedSheets = parsed.filter((p) => selected[p.name])
  const totalWords = selectedSheets.reduce((sum, p) => sum + p.stats.total, 0)
  const overwriteCount = selectedSheets.filter((p) => existing.includes(existsKey(p))).length

  // 같은 카테고리 안에서 선택한 시트끼리 겹치는 단어 수
  const crossDup = useMemo(() => {
    const seen = new Map()
    for (const p of parsed) {
      if (!selected[p.name]) continue
      for (const w of new Set(p.items.map((i) => `${p.category}:${i.word.toLowerCase()}`))) {
        seen.set(w, (seen.get(w) || 0) + 1)
      }
    }
    return [...seen.values()].filter((n) => n > 1).length
  }, [parsed, selected])

  const current = parsed.find((p) => p.name === previewName)

  function toggleAll(value) {
    setSelected(Object.fromEntries(parsed.map((p) => [p.name, value])))
  }

  async function handleSave() {
    if (mode === 'overwrite' && overwriteCount > 0) {
      const ok = window.confirm(
        `이미 있는 폴더 ${overwriteCount}개를 덮어써요.\n그 폴더의 단어, 직접 추가한 예문, 학습 기록이 모두 새로 바뀝니다.\n계속할까요?`,
      )
      if (!ok) return
    }
    setBusy(true)
    setMessage(null)
    const now = Date.now()
    let savedFolders = 0
    let savedWords = 0
    let skipped = 0
    try {
      for (let idx = 0; idx < parsed.length; idx++) {
        const p = parsed[idx]
        if (!selected[p.name]) continue
        if (existing.includes(existsKey(p)) && mode === 'skip') {
          skipped++
          continue
        }
        setProgress(`${p.name} 저장 중… (${savedFolders + skipped + 1}/${selectedSheets.length})`)
        const cat = CATEGORIES.find((c) => c.id === p.category)
        const payload = buildFolderPayload({
          category: p.category,
          sheetName: p.name,
          items: p.items,
          stats: p.stats,
          fileName,
          index: idx,
          now,
        })
        // 카테고리, 폴더 정보, 단어들을 한 번에 저장합니다. (모두 성공하거나 모두 실패해요)
        await update(ref(db, `users/${user.uid}`), {
          [`categories/${cat.id}`]: { name: cat.name, template: cat.template, order: cat.order },
          [`folders/${cat.id}/${payload.key}`]: payload.folder,
          [`words/${cat.id}/${payload.key}`]: payload.words,
          ...resetProgressPaths(cat.id, payload.key), // 새로 가져온 폴더는 학습 기록도 처음부터
        })
        savedFolders++
        savedWords += p.items.length
      }
      await loadExisting()
      setMessage({
        type: 'ok',
        text:
          `저장 완료: 폴더 ${savedFolders}개, 단어 ${savedWords}개` +
          (skipped ? ` (이미 있어서 건너뜀 ${skipped}개)` : ''),
      })
    } catch (err) {
      setMessage({ type: 'bad', text: dbError(err) })
    } finally {
      setBusy(false)
      setProgress('')
    }
  }

  return (
    <div>
      <section className="card">
        <h2>엑셀 가져오기</h2>
        <p className="muted">
          엑셀 파일을 고르면 시트마다 자동으로 읽어요. 시트별로 카테고리(토익, 회화, 단어, 한글)를 확인하고,
          미리보기로 살펴본 뒤 저장해 주세요.
        </p>
        <input type="file" accept=".xlsx,.xlsm,.xls" onChange={handleFile} />
        <label className="check">
          <input type="checkbox" checked={skipHeader} onChange={(e) => setSkipHeader(e.target.checked)} />
          첫 줄은 제목이라서 건너뛰기
        </label>
        {message && <p className={`msg ${message.type === 'ok' ? 'good' : 'bad'}`}>{message.text}</p>}
      </section>

      {parsed.length > 0 && (
        <>
          <section className="card">
            <h2>
              가져올 시트 선택 <span className="muted small-text">· {fileName}</span>
            </h2>
            <div className="row-actions">
              <button type="button" className="link" onClick={() => toggleAll(true)}>전체 선택</button>
              <button type="button" className="link" onClick={() => toggleAll(false)}>전체 해제</button>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th></th>
                    <th>시트</th>
                    <th>카테고리</th>
                    <th>구성</th>
                    <th className="num">예문</th>
                    <th className="num">품사 확인</th>
                    <th className="num">경고</th>
                    <th>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.map((p) => (
                    <tr key={p.name} className={p.name === previewName ? 'active' : ''}>
                      <td>
                        <input
                          type="checkbox"
                          checked={Boolean(selected[p.name])}
                          onChange={(e) => setSelected({ ...selected, [p.name]: e.target.checked })}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="link"
                          onClick={() => {
                            setPreviewName(p.name)
                            setShowCount(PREVIEW_STEP)
                          }}
                        >
                          {p.name}
                        </button>
                      </td>
                      <td>
                        <select
                          value={p.category}
                          onChange={(e) => setCatOf({ ...catOf, [p.name]: e.target.value })}
                        >
                          {CATEGORIES.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </td>
                      <td>{describe(p)}</td>
                      <td className="num">{p.stats.examples}</td>
                      <td className="num">{p.stats.posCheck}</td>
                      <td className="num">{p.warnings.length ? <strong className="bad-text">{p.warnings.length}</strong> : 0}</td>
                      <td>{existing.includes(existsKey(p)) ? <span className="badge">이미 있음</span> : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted small-text">
              시트 이름을 누르면 아래에서 내용을 미리 볼 수 있어요. 카테고리를 바꾸면 그 카테고리의 읽기 규칙으로 다시 읽어요.
            </p>
          </section>

          {current && (
            <section className="card">
              <h2>미리보기 · {current.name} <span className="muted small-text">({CATEGORIES.find((c) => c.id === current.category)?.name})</span></h2>

              {current.stats.topics.length > 0 && (
                <div className="chips">
                  {current.stats.topics.map((t) => (
                    <span className="badge chip" key={t.name}>{t.name} {t.count}</span>
                  ))}
                </div>
              )}

              {current.warnings.length > 0 && (
                <div className="warn">
                  <p><strong>확인이 필요한 곳 {current.warnings.length}개</strong></p>
                  <ul className="plain">
                    {current.warnings.map((w, i) => (
                      <li key={i}>{w.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              {current.notices.length > 0 && (
                <details className="notices">
                  <summary>자동으로 처리한 것 {current.notices.length}개 (눌러서 보기)</summary>
                  <ul className="plain">
                    {current.notices.map((n, i) => (
                      <li key={i}>{n.message}</li>
                    ))}
                  </ul>
                </details>
              )}

              <div className="table-wrap">
                <table className="preview">
                  <thead>
                    <tr>
                      <th>구분</th>
                      <th className="num">번호</th>
                      <th>{current.category === 'conv' ? '문장' : '단어'}</th>
                      <th>뜻</th>
                      <th>발음 · 메모</th>
                      <th>예문</th>
                    </tr>
                  </thead>
                  <tbody>
                    {current.items.slice(0, showCount).map((it, i) => (
                      <tr key={i} className={`role-${it.role}`}>
                        <td>
                          {current.category === 'toeic' ? (
                            <span className={`badge role-${it.role}`}>{ROLE_LABEL[it.role]}</span>
                          ) : (
                            it.topic && <span className="badge topic">{it.topic}</span>
                          )}
                        </td>
                        <td className="num">{it.no ?? ''}</td>
                        <td>
                          {it.word}
                          {it.kind === 'pattern' && <span className="badge">패턴</span>}
                          {it.dup && <span className="badge warn-badge" title="같은 시트에 같은 표현이 또 있어요">중복</span>}
                        </td>
                        <td>
                          {it.senses.length ? formatSenses(it.senses) : it.meaning}
                          {it.posCheck && <span className="badge warn-badge" title="품사를 확인해 주세요">품사 확인</span>}
                        </td>
                        <td className="examples">
                          {it.pron && <div>{it.pron}</div>}
                          {it.memo && <div className="muted">{it.memo}</div>}
                        </td>
                        <td className="examples">
                          {it.examples.map((ex, k) => (
                            <div key={k}>
                              <div>{ex.en}</div>
                              {ex.ko && <div className="muted">{ex.ko}</div>}
                            </div>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {showCount < current.items.length && (
                <button type="button" className="secondary" onClick={() => setShowCount(showCount + PREVIEW_STEP)}>
                  더 보기 ({showCount}/{current.items.length})
                </button>
              )}
            </section>
          )}

          <section className="card">
            <h2>저장하기</h2>
            <p>
              선택한 시트 <strong>{selectedSheets.length}개</strong>, 단어 <strong>{totalWords}개</strong>를 저장해요.
              {crossDup > 0 && (
                <span className="muted"> (같은 카테고리 안에서 시트끼리 겹치는 표현 {crossDup}개는 모두 그대로 저장돼요.)</span>
              )}
            </p>

            {overwriteCount > 0 && (
              <div className="radio-group">
                <p className="small-text"><strong>이미 저장된 폴더 {overwriteCount}개가 있어요.</strong></p>
                <label className="check">
                  <input type="radio" name="mode" checked={mode === 'skip'} onChange={() => setMode('skip')} />
                  건너뛰기 (기존 단어와 학습 기록 유지)
                </label>
                <label className="check">
                  <input type="radio" name="mode" checked={mode === 'overwrite'} onChange={() => setMode('overwrite')} />
                  덮어쓰기 (그 폴더의 단어와 학습 기록이 새로 바뀜)
                </label>
              </div>
            )}

            <button type="button" className="primary" onClick={handleSave} disabled={busy || selectedSheets.length === 0}>
              {busy ? progress || '저장 중…' : 'Firebase에 저장'}
            </button>
            {message && <p className={`msg ${message.type === 'ok' ? 'good' : 'bad'}`}>{message.text}</p>}
          </section>
        </>
      )}
    </div>
  )
}
