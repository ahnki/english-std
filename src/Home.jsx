import { useEffect, useMemo, useRef, useState } from 'react'
import { ref, onValue } from 'firebase/database'
import { db } from './firebase'
import { CATEGORIES } from './categories'
import { rebuildProgress } from './wordsDb'
import { folderStatus } from './progressLogic'
import Today from './Today.jsx'

// 초기 화면: 오늘의 학습, 카테고리(토익, 회화, 단어, 한글) 버튼 4개, 폴더 목록(진도 포함)
export default function Home({ user, initialOpen = '', onOpenFolder, onStudyFolder }) {
  const [folders, setFolders] = useState(null) // { 카테고리: [폴더, ...] }, null = 불러오는 중
  const [stored, setStored] = useState({}) // Firebase에 저장된 카테고리 정보
  const [open, setOpen] = useState(initialOpen) // 펼쳐 본 카테고리
  const [error, setError] = useState('')
  const [progress, setProgress] = useState(null) // 공부한 단어들의 진도 요약
  const [daily, setDaily] = useState({}) // 날짜별 푼 문제 수
  const [last, setLast] = useState(null) // 마지막으로 공부한 폴더
  const [built, setBuilt] = useState(undefined) // 진도 요약을 만든 시각 (undefined = 확인 중, null = 아직 안 만듦)
  const [rebuilding, setRebuilding] = useState(false)
  const rebuildStarted = useRef(false)

  useEffect(() => {
    const base = `users/${user.uid}`
    const onErr = (err) => setError(`불러오지 못했어요. (${err.code || err.message})`)
    const offs = [
      onValue(
        ref(db, `${base}/folders`),
        (snap) => {
          const value = snap.val() || {}
          const out = {}
          for (const [cat, items] of Object.entries(value)) {
            out[cat] = Object.entries(items || {})
              .map(([id, f]) => ({ id, ...f }))
              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          }
          setFolders(out)
        },
        onErr,
      ),
      onValue(ref(db, `${base}/categories`), (snap) => setStored(snap.val() || {}), () => {}),
      onValue(ref(db, `${base}/progress`), (snap) => setProgress(snap.val() || {}), onErr),
      onValue(ref(db, `${base}/stats/daily`), (snap) => setDaily(snap.val() || {}), () => {}),
      onValue(ref(db, `${base}/stats/last`), (snap) => setLast(snap.val() || null), () => {}),
      onValue(ref(db, `${base}/meta/progressBuilt`), (snap) => setBuilt(snap.val() ?? null), () => {}),
    ]
    return () => offs.forEach((off) => off())
  }, [user.uid])

  async function doRebuild() {
    setRebuilding(true)
    try {
      await rebuildProgress(user.uid)
    } catch (err) {
      setError(`진도를 정리하지 못했어요. (${err.code || err.message})`)
    } finally {
      setRebuilding(false)
    }
  }

  // 처음 한 번: 진도 요약이 아직 없으면, 이미 공부한 기록으로부터 만들어 둡니다.
  useEffect(() => {
    if (built === null && !rebuildStarted.current) {
      rebuildStarted.current = true
      doRebuild()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [built])

  // 기본 카테고리 + 나중에 추가된 카테고리
  const categories = useMemo(() => {
    const map = new Map(CATEGORIES.map((c) => [c.id, { ...c }]))
    for (const [id, c] of Object.entries(stored)) {
      map.set(id, { template: 'word', order: 99, ...(map.get(id) || {}), ...c, id })
    }
    return [...map.values()].sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
  }, [stored])

  const sumWords = (list = []) => list.reduce((sum, f) => sum + (f.count || 0), 0)
  const openFolders = open && folders ? folders[open] || [] : []
  const openCat = categories.find((c) => c.id === open)
  const now = Date.now()

  return (
    <div>
      {error && <p className="msg bad">{error}</p>}
      {folders === null && !error && <p className="muted">불러오는 중…</p>}

      {folders && (
        <>
          <Today
            categories={categories}
            folders={folders}
            progress={progress}
            daily={daily}
            last={last}
            rebuilding={rebuilding}
            onStudy={onStudyFolder}
            onRebuild={doRebuild}
          />

          <div className="cat-grid">
            {categories.map((c) => {
              const list = folders[c.id] || []
              const words = sumWords(list)
              return (
                <button
                  type="button"
                  key={c.id}
                  className={`cat-card${open === c.id ? ' on' : ''}${words === 0 ? ' empty' : ''}`}
                  onClick={() => setOpen(open === c.id ? '' : c.id)}
                >
                  <span className="cat-name">{c.name}</span>
                  <span className="cat-meta">
                    {words === 0 ? '비어 있음' : `폴더 ${list.length}개 · ${words.toLocaleString()}개`}
                  </span>
                </button>
              )
            })}
          </div>

          {!open && <p className="muted small-text">카테고리를 누르면 폴더 목록을 볼 수 있어요. 폴더를 누르면 단어를 보고 고칠 수 있어요.</p>}

          {open && (
            <section className="card">
              <h2>{openCat?.name}</h2>
              {openFolders.length === 0 ? (
                <p className="muted">
                  아직 단어가 없어요. <strong>엑셀 가져오기</strong>나 <strong>단어 추가</strong>에서 이 카테고리로 등록해 주세요.
                </p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>폴더</th>
                        {openCat?.id === 'toeic' && <th className="num">핵심</th>}
                        <th className="num">전체</th>
                        <th>진도</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {openFolders.map((f) => {
                        const s = folderStatus(progress?.[open]?.[f.id], f.count, now, f.head || 0)
                        const total = Math.max(1, s.total)
                        return (
                          <tr key={f.id} className="clickable" onClick={() => onOpenFolder(open, f.id)}>
                            <td>
                              <button type="button" className="link" onClick={() => onOpenFolder(open, f.id)}>
                                {f.name}
                              </button>
                            </td>
                            {openCat?.id === 'toeic' && <td className="num">{f.head ?? 0}</td>}
                            <td className="num">{f.count ?? 0}</td>
                            <td className="prog-cell">
                              <div className="prog-bar" title={`외움 ${s.known} · 학습 중 ${s.learning} · 새 단어 ${s.fresh}`}>
                                <span className="known" style={{ width: `${(s.known / total) * 100}%` }} />
                                <span className="learning" style={{ width: `${(s.learning / total) * 100}%` }} />
                              </div>
                              <span className="muted small-text">
                                외움 {s.known} · 학습 중 {s.learning}
                                {s.due > 0 && <strong className="due-tag"> · 복습 {s.due}</strong>}
                              </span>
                            </td>
                            <td className="num">
                              <button type="button" className="link" onClick={(e) => { e.stopPropagation(); onStudyFolder(open, f.id) }}>
                                학습
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  )
}
