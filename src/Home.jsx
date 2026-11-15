import { useEffect, useState } from 'react'
import { ref, onValue } from 'firebase/database'
import { db } from './firebase'

export default function Home({ user }) {
  const [folders, setFolders] = useState(null) // null = 불러오는 중
  const [error, setError] = useState('')

  useEffect(() => {
    const unsubscribe = onValue(
      ref(db, `users/${user.uid}/folders`),
      (snap) => {
        const value = snap.val() || {}
        const list = Object.entries(value)
          .map(([id, f]) => ({ id, ...f }))
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        setFolders(list)
      },
      (err) => setError(`폴더를 불러오지 못했어요. (${err.code || err.message})`),
    )
    return () => unsubscribe()
  }, [user.uid])

  const totalWords = (folders || []).reduce((sum, f) => sum + (f.count || 0), 0)

  return (
    <section className="card">
      <h2>내 단어장</h2>
      {error && <p className="msg bad">{error}</p>}
      {folders === null && !error && <p className="muted">불러오는 중…</p>}
      {folders && folders.length === 0 && (
        <p className="muted">
          아직 단어가 없어요. 위쪽 <strong>엑셀 가져오기</strong>에서 단어장 파일을 올려 주세요.
        </p>
      )}
      {folders && folders.length > 0 && (
        <>
          <p>
            폴더 <strong>{folders.length}개</strong> · 단어 <strong>{totalWords}개</strong>
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>폴더</th>
                  <th className="num">핵심</th>
                  <th className="num">전체</th>
                  <th className="num">예문</th>
                </tr>
              </thead>
              <tbody>
                {folders.map((f) => (
                  <tr key={f.id}>
                    <td>{f.name}</td>
                    <td className="num">{f.head ?? 0}</td>
                    <td className="num">{f.count ?? 0}</td>
                    <td className="num">{f.examples ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
