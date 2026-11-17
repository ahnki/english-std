import { useEffect, useMemo, useState } from 'react'
import { ref, onValue } from 'firebase/database'
import { db } from './firebase'
import { CATEGORIES } from './categories'

// 초기 화면: 카테고리(토익, 회화, 단어, 한글) 버튼 4개. 누르면 폴더 목록, 폴더를 누르면 단어 목록으로 이동합니다.
export default function Home({ user, initialOpen = '', onOpenFolder, onStudyFolder }) {
  const [folders, setFolders] = useState(null) // { 카테고리: [폴더, ...] }, null = 불러오는 중
  const [stored, setStored] = useState({}) // Firebase에 저장된 카테고리 정보
  const [open, setOpen] = useState(initialOpen) // 펼쳐 본 카테고리
  const [error, setError] = useState('')

  useEffect(() => {
    const base = `users/${user.uid}`
    const off1 = onValue(
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
      (err) => setError(`불러오지 못했어요. (${err.code || err.message})`),
    )
    const off2 = onValue(ref(db, `${base}/categories`), (snap) => setStored(snap.val() || {}), () => {})
    return () => {
      off1()
      off2()
    }
  }, [user.uid])

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

  return (
    <div>
      {error && <p className="msg bad">{error}</p>}
      {folders === null && !error && <p className="muted">불러오는 중…</p>}

      {folders && (
        <>
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
                        <th className="num">예문</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {openFolders.map((f) => (
                        <tr key={f.id} className="clickable" onClick={() => onOpenFolder(open, f.id)}>
                          <td>
                            <button type="button" className="link" onClick={() => onOpenFolder(open, f.id)}>
                              {f.name}
                            </button>
                          </td>
                          {openCat?.id === 'toeic' && <td className="num">{f.head ?? 0}</td>}
                          <td className="num">{f.count ?? 0}</td>
                          <td className="num">{f.examples ?? 0}</td>
                          <td className="num">
                            <button type="button" className="link" onClick={(e) => { e.stopPropagation(); onStudyFolder(open, f.id) }}>
                              학습
                            </button>
                          </td>
                        </tr>
                      ))}
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
