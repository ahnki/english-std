import { useEffect, useState } from 'react'
import { ref, onValue } from 'firebase/database'
import { isConfigured, app, db } from './firebase'

export default function App() {
  // null: 확인 중, true: 연결됨, false: 연결 안 됨
  const [connected, setConnected] = useState(null)

  useEffect(() => {
    if (!db) return
    // Firebase가 알려주는 "지금 연결되어 있나요?" 값을 계속 지켜봅니다.
    const unsubscribe = onValue(ref(db, '.info/connected'), (snap) => {
      setConnected(snap.val() === true)
    })
    return () => unsubscribe()
  }, [])

  return (
    <main className="page">
      <h1>영어 단어장</h1>
      <p className="lead">토익 단어부터 시작하는 나만의 영어 학습 앱</p>

      <section className="status">
        <h2>Firebase 연결 상태</h2>
        {isConfigured ? (
          <ul className="checks">
            <li className="ok">
              설정값 확인 완료 · 프로젝트: <strong>{app.options.projectId}</strong>
            </li>
            {connected === null && <li className="wait">데이터베이스 연결 확인 중…</li>}
            {connected === true && <li className="ok">Realtime Database 연결됨</li>}
            {connected === false && (
              <li className="bad">
                Realtime Database에 연결되지 않았어요. 인터넷 연결과 .env 의
                DATABASE_URL 값을 확인해 주세요.
              </li>
            )}
          </ul>
        ) : (
          <div className="warn">
            <p>아직 Firebase 설정값이 없어요.</p>
            <p>
              프로젝트 폴더의 <code>.env</code> 파일에 값이 모두 채워져 있는지
              확인하고, 개발 서버를 다시 시작해 주세요.
            </p>
          </div>
        )}
      </section>
    </main>
  )
}
