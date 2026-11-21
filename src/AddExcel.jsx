import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { ref, onValue, update } from 'firebase/database'
import { db } from './firebase'
import { CATEGORIES, getCategory, guessCategory, isKnownSheet } from './categories'
import { parseAddSheet } from './parseAdd'
import { planAdd, summaryText } from './planAdd'
import { buildExcelWord } from './wordsLogic'
import { folderKeyOf, folderOrderOf, padDay } from './importPayload'
import { syncFolderCounts } from './wordsDb'

const BASE = (import.meta.env && import.meta.env.BASE_URL) || '/'
const TEMPLATE_URL = `${BASE}templates/word-template.xlsx`
const readOnce = (r) => new Promise((resolve, reject) => onValue(r, resolve, reject, { onlyOnce: true }))
const ROWS_STEP = 100

const STATUS = {
  new: { label: '신규', cls: 'st-new' },
  marked: { label: '신규 · 중복 표시', cls: 'st-marked' },
  duplicate: { label: '중복', cls: 'st-dup' },
  match: { label: '번호 일치', cls: 'st-match' },
  conflict: { label: '충돌', cls: 'st-conflict' },
  skipped: { label: '건너뜀', cls: 'st-conflict' },
}
const FILTERS = [
  ['all', '전체'],
  ['new', '신규'],
  ['duplicate', '중복'],
  ['match', '번호 일치'],
  ['problem', '충돌 · 건너뜀'],
]
const inFilter = (status, f) =>
  f === 'all' ||
  (f === 'new' && (status === 'new' || status === 'marked')) ||
  (f === 'problem' && (status === 'conflict' || status === 'skipped')) ||
  f === status

// 양식에 맞춘 엑셀 파일로 단어를 여러 개 추가합니다. (이미 있는 폴더에는 이어 붙이고, 새 시트 이름은 새 폴더로 만들어요.)
export default function AddExcel({ user, onOpenFolder }) {
  const base = `users/${user.uid}`
  const [fileName, setFileName] = useState('')
  const [rawSheets, setRawSheets] = useState([])
  const [catOf, setCatOf] = useState({})
  const [selected, setSelected] = useState({})
  const [previewName, setPreviewName] = useState('')
  const [filter, setFilter] = useState('all')
  const [shown, setShown] = useState(ROWS_STEP)
  const [folderKeys, setFolderKeys] = useState(null) // 이미 있는 폴더 ("카테고리/폴더키"), null = 불러오는 중
  const [existingMap, setExistingMap] = useState({}) // "카테고리/폴더키" -> 기존 단어 배열
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState(null)

  async function loadFolderKeys() {
    const snap = await readOnce(ref(db, `${base}/folders`))
    const keys = new Set()
    const count = {}
    for (const [cat, folders] of Object.entries(snap.val() || {})) {
      for (const key of Object.keys(folders || {})) keys.add(`${cat}/${key}`)
      count[cat] = Object.keys(folders || {}).length
    }
    setFolderKeys({ keys, count })
  }
  useEffect(() => {
    loadFolderKeys().catch((err) => setError(`불러오지 못했어요. (${err.code || err.message})`))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setResults(null)
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const sheets = wb.SheetNames.map((name) => ({
        name,
        rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', blankrows: true, raw: false }),
      }))
      setFileName(file.name)
      setRawSheets(sheets)
      setCatOf(Object.fromEntries(sheets.map((s) => [s.name, guessCategory(s.name)])))
      setSelected(Object.fromEntries(sheets.map((s) => [s.name, isKnownSheet(s.name)])))
      setPreviewName(sheets.find((s) => isKnownSheet(s.name))?.name || sheets[0]?.name || '')
      setExistingMap({})
      setFilter('all')
      setShown(ROWS_STEP)
      await loadFolderKeys()
    } catch (err) {
      setRawSheets([])
      setError(`파일을 읽지 못했어요. 엑셀(.xlsx) 파일인지 확인해 주세요. (${err.message})`)
    }
  }

  const parsed = useMemo(
    () =>
      rawSheets.map((s) => {
        const category = catOf[s.name] || 'word'
        return { name: s.name, category, key: folderKeyOf(s.name), ...parseAddSheet(category, s.rows) }
      }),
    [rawSheets, catOf],
  )
  const folderExists = (p) => Boolean(folderKeys?.keys.has(`${p.category}/${p.key}`))

  // 선택한 시트가 가리키는 기존 폴더의 단어를 불러옵니다.
  useEffect(() => {
    if (!folderKeys) return
    for (const p of parsed) {
      const k = `${p.category}/${p.key}`
      if (!selected[p.name] || !folderKeys.keys.has(k) || existingMap[k] !== undefined) continue
      setExistingMap((m) => ({ ...m, [k]: null })) // 불러오는 중
      readOnce(ref(db, `${base}/words/${p.category}/${p.key}`))
        .then((s) => setExistingMap((m) => ({ ...m, [k]: Object.entries(s.val() || {}).map(([id, w]) => ({ id, ...w })) })))
        .catch((err) => setError(`기존 단어를 불러오지 못했어요. (${err.code || err.message})`))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, selected, folderKeys])

  // 시트마다 "무엇을 어떻게 할지" 계획 세우기
  const plans = useMemo(() => {
    const out = {}
    const now = Date.now()
    parsed.forEach((p, i) => {
      if (!folderKeys) return
      const k = `${p.category}/${p.key}`
      const exists = folderKeys.keys.has(k)
      const existing = exists ? existingMap[k] : []
      if (existing === undefined || existing === null) return // 아직 불러오는 중
      out[p.name] = planAdd({ category: p.category, items: p.items, existing, now: now + i * 100000, idPrefix: `x${i}` })
    })
    return out
  }, [parsed, existingMap, folderKeys])

  const selectedList = parsed.filter((p) => selected[p.name])
  const dupKeys = (() => {
    const seen = new Set()
    const dup = []
    for (const p of selectedList) {
      const k = `${p.category}/${p.key}`
      if (seen.has(k)) dup.push(p.name)
      seen.add(k)
    }
    return dup
  })()
  const ready = selectedList.length > 0 && selectedList.every((p) => plans[p.name]) && dupKeys.length === 0
  const totals = selectedList.reduce(
    (a, p) => {
      const c = plans[p.name]?.counts
      if (!c) return a
      a.created += c.created + c.marked
      a.duplicate += c.duplicate
      a.conflict += c.conflict
      a.work += c.created + c.marked + c.filled
      return a
    },
    { created: 0, duplicate: 0, conflict: 0, work: 0 },
  )

  const current = parsed.find((p) => p.name === previewName)
  const currentPlan = current ? plans[current.name] : null
  const shownRows = currentPlan ? currentPlan.rows.filter((r) => inFilter(r.status, filter)) : []

  async function handleSave() {
    setBusy(true)
    setError('')
    const now = Date.now()
    const done = []
    try {
      for (const p of selectedList) {
        const plan = plans[p.name]
        const cat = getCategory(p.category)
        const exists = folderExists(p)
        const wordsBase = `words/${cat.id}/${p.key}`
        const updates = {}
        for (const c of plan.creates) updates[`${wordsBase}/${c.id}`] = buildExcelWord(c.item, { headId: c.headId, order: c.order, now, dup: c.dup })
        for (const [id, patch] of Object.entries(plan.patches)) {
          for (const [field, value] of Object.entries(patch)) updates[`${wordsBase}/${id}/${field}`] = value
        }
        const wrote = Object.keys(updates).length > 0
        if (wrote) {
          updates[`categories/${cat.id}`] = { name: cat.name, template: cat.template, order: cat.order }
          if (!exists) {
            updates[`folders/${cat.id}/${p.key}`] = {
              name: padDay(p.name), category: cat.id, order: folderOrderOf(p.name, folderKeys.count[cat.id] || 0),
              count: 0, head: 0, related: 0, extra: 0, examples: 0, topics: 0, source: fileName, importedAt: now,
            }
          }
          await update(ref(db, base), updates)
          await syncFolderCounts(user.uid, cat.id, p.key)
        }
        done.push({ name: padDay(p.name), cat: cat.id, catName: cat.name, key: p.key, isNew: !exists, wrote, counts: plan.counts, text: summaryText(plan.counts) })
      }
      setResults(done)
      setRawSheets([])
      setExistingMap({})
      await loadFolderKeys()
    } catch (err) {
      setError(`저장하지 못했어요. 일부만 저장됐을 수 있으니 폴더의 단어 목록을 확인해 주세요. (${err.code || err.message})`)
    } finally {
      setBusy(false)
    }
  }

  const sum = (key) => (results || []).reduce((a, r) => a + r.counts[key], 0)

  return (
    <div>
      <section className="card">
        <h2>엑셀 파일로 여러 개 추가</h2>
        <p className="muted">
          양식에 맞춘 엑셀 파일을 올리면 <strong>이어 붙여서 추가</strong>해요. 시트 이름이 이미 있는 폴더(예: <code>05d</code>, <code>기본단어</code>)면 그 폴더에 추가하고,
          새 이름(예: <code>31d</code>)이면 새 폴더를 만들어요. 저장하기 전에 미리보기로 확인할 수 있어요.
        </p>
        <p>
          <a className="link-btn" href={TEMPLATE_URL} download="단어장_추가_양식.xlsx">⬇ 엑셀 양식 내려받기</a>
        </p>
        <details className="rules">
          <summary>양식 설명 보기</summary>
          <table>
            <thead><tr><th>열</th><th>토익 · 단어 · 한글</th><th>회화</th></tr></thead>
            <tbody>
              <tr><td>A</td><td>단어 (토익은 <code>41. reluctant</code>처럼 번호가 있으면 핵심 단어, 번호가 없으면 위 핵심 단어의 파생어)</td><td>문장</td></tr>
              <tr><td>B</td><td>뜻</td><td>뜻</td></tr>
              <tr><td>C</td><td>발음 (한글)</td><td>발음 (한글)</td></tr>
              <tr><td>D</td><td>예문</td><td>메모</td></tr>
              <tr><td>E</td><td>예문 해석</td><td></td></tr>
              <tr><td>F</td><td>메모</td><td></td></tr>
            </tbody>
          </table>
          <ul className="plain">
            <li>A·B·C가 비고 <strong>D(예문)만 있는 줄</strong>은 바로 위 단어의 예문이에요. 예문은 여러 줄(N건) 적을 수 있어요.</li>
            <li>첫 줄의 B칸이 <code>뜻</code>이면 제목 줄로 보고 자동으로 건너뛰어요.</li>
            <li>단어·회화: A칸에 한글만 있는 줄은 <strong>주제 제목</strong>이에요. 다음 빈 줄까지의 항목에 붙고, 빈 줄 아래는 <code>일반 단어</code>·<code>일반 회화</code>가 돼요.</li>
            <li>토익: 빈 줄 아래의 번호 없는 단어는 <strong>추가 단어</strong>예요. (위 핵심 단어에 붙지 않아요.)</li>
            <li><strong>같은 시트 이름 + 같은 번호</strong>가 있으면 비교해서 <strong>없는 부분만 채워요.</strong> 번호는 같은데 단어가 다르면 충돌로 표시하고 등록하지 않아요.</li>
            <li><strong>같은 표현 + 같은 뜻</strong>은 중복이에요. 등록하지 않고 비어 있던 부분과 새 예문만 채워요. 같은 표현인데 뜻이 다르면 "중복 표시"를 붙여서 등록해요.</li>
          </ul>
        </details>
        <input type="file" accept=".xlsx,.xlsm,.xls" onChange={handleFile} />
        {error && <p className="msg bad">{error}</p>}
      </section>

      {results && (
        <section className="card result-card">
          <h2>추가 결과</h2>
          <p className="big-line">
            총 등록 <strong>{sum('created') + sum('marked')}건</strong> (중복 {sum('duplicate')}건)
            {sum('conflict') > 0 && <span className="bad-text"> · 충돌 {sum('conflict')}건</span>}
          </p>
          <ul className="plain result-list">
            {results.map((r) => (
              <li key={r.cat + r.key}>
                <strong>{r.catName} · {r.name}</strong> <span className="badge">{r.isNew ? '새 폴더' : '기존 폴더에 추가'}</span>
                <div>{r.text}</div>
                {r.wrote ? (
                  <button type="button" className="link" onClick={() => onOpenFolder(r.cat, r.key)}>폴더 보기</button>
                ) : (
                  <span className="muted small-text">새로 저장할 내용이 없었어요.</span>
                )}
              </li>
            ))}
          </ul>
          <p className="muted small-text">추가한 단어는 폴더의 단어 목록에서 수정하거나 지울 수 있어요.</p>
        </section>
      )}

      {parsed.length > 0 && (
        <>
          <section className="card">
            <h2>시트 선택 <span className="muted small-text">· {fileName}</span></h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th></th><th>시트</th><th>카테고리</th><th>대상 폴더</th>
                    <th className="num">줄</th><th className="num">신규</th><th className="num">중복</th><th className="num">번호 일치</th><th className="num">충돌</th><th className="num">경고</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.map((p) => {
                    const c = plans[p.name]?.counts
                    const exists = folderExists(p)
                    return (
                      <tr key={p.name} className={p.name === previewName ? 'active' : ''}>
                        <td><input type="checkbox" checked={Boolean(selected[p.name])} onChange={(e) => setSelected({ ...selected, [p.name]: e.target.checked })} /></td>
                        <td><button type="button" className="link" onClick={() => { setPreviewName(p.name); setShown(ROWS_STEP); setFilter('all') }}>{p.name}</button></td>
                        <td>
                          <select value={p.category} onChange={(e) => setCatOf({ ...catOf, [p.name]: e.target.value })}>
                            {CATEGORIES.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                          </select>
                        </td>
                        <td>{padDay(p.name)} <span className="badge">{exists ? '기존 폴더' : '새 폴더'}</span></td>
                        <td className="num">{p.items.length}</td>
                        <td className="num">{c ? c.created + c.marked : '…'}</td>
                        <td className="num">{c ? c.duplicate : '…'}</td>
                        <td className="num">{c ? c.match : '…'}</td>
                        <td className="num">{c ? (c.conflict ? <strong className="bad-text">{c.conflict}</strong> : 0) : '…'}</td>
                        <td className="num">{p.warnings.length ? <strong className="bad-text">{p.warnings.length}</strong> : 0}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {dupKeys.length > 0 && <p className="msg bad">시트 이름이 같은 폴더를 가리키는 것이 있어요. ({dupKeys.join(', ')}) 하나만 선택해 주세요.</p>}
          </section>

          {current && (
            <section className="card">
              <h2>미리보기 · {current.name} <span className="muted small-text">({getCategory(current.category).name})</span></h2>
              {current.warnings.length > 0 && (
                <div className="warn">
                  <p><strong>확인이 필요한 곳 {current.warnings.length}개</strong></p>
                  <ul className="plain">{current.warnings.map((w, i) => <li key={i}>{w.message}</li>)}</ul>
                </div>
              )}
              {current.notices.length > 0 && (
                <details className="notices">
                  <summary>자동으로 처리한 것 {current.notices.length}개</summary>
                  <ul className="plain">{current.notices.map((n, i) => <li key={i}>{n.message}</li>)}</ul>
                </details>
              )}
              {!currentPlan && <p className="muted">기존 단어와 비교하는 중…</p>}
              {currentPlan && (
                <>
                  <div className="chips">
                    {FILTERS.map(([f, label]) => {
                      const n = currentPlan.rows.filter((r) => inFilter(r.status, f)).length
                      return (
                        <button type="button" key={f} className={`chip-btn${filter === f ? ' on' : ''}`} onClick={() => { setFilter(f); setShown(ROWS_STEP) }}>
                          {label} {n}
                        </button>
                      )
                    })}
                  </div>
                  <div className="table-wrap">
                    <table className="preview">
                      <thead><tr><th>상태</th><th className="num">번호</th><th>{current.category === 'conv' ? '문장' : '단어'}</th><th>뜻</th><th>발음 · 메모</th><th>예문</th><th>비고</th></tr></thead>
                      <tbody>
                        {shownRows.slice(0, shown).map((r) => (
                          <tr key={r.index} className={`role-${r.item.role}`}>
                            <td><span className={`badge ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span></td>
                            <td className="num">{r.item.no ?? ''}</td>
                            <td>
                              {r.item.role === 'related' && <span className="muted">↳ </span>}
                              {r.item.word}
                              {r.item.topic && current.category !== 'toeic' && <span className="badge topic">{r.item.topic}</span>}
                            </td>
                            <td>{r.item.meaning}</td>
                            <td className="examples">{r.item.pron && <div>{r.item.pron}</div>}{r.item.memo && <div className="muted">{r.item.memo}</div>}</td>
                            <td className="examples">{r.item.examples.map((e, k) => <div key={k}><div>{e.en}</div>{e.ko && <div className="muted">{e.ko}</div>}</div>)}</td>
                            <td className="examples muted">{r.note}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {shownRows.length > shown && <button type="button" className="secondary" onClick={() => setShown(shown + ROWS_STEP)}>더 보기 ({shown}/{shownRows.length})</button>}
                  {shownRows.length === 0 && <p className="muted">해당하는 줄이 없어요.</p>}
                </>
              )}
            </section>
          )}

          <section className="card">
            <h2>추가하기</h2>
            <p>
              선택한 시트 <strong>{selectedList.length}개</strong> · 등록 <strong>{totals.created}건</strong> (중복 {totals.duplicate}건)
              {totals.conflict > 0 && <span className="bad-text"> · 충돌 {totals.conflict}건은 등록하지 않아요</span>}
            </p>
            <button type="button" className="primary" onClick={handleSave} disabled={busy || !ready || totals.work === 0}>
              {busy ? '저장 중…' : '추가하기'}
            </button>
            {ready && totals.work === 0 && <p className="muted small-text">새로 등록하거나 채울 내용이 없어요. (모두 이미 있는 내용이에요.)</p>}
          </section>
        </>
      )}
    </div>
  )
}
