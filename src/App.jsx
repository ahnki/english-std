import { useEffect, useState } from 'react'
import { ref, onValue } from 'firebase/database'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { isConfigured, app, auth, db } from './firebase'
import AuthForm from './AuthForm.jsx'
import Home from './Home.jsx'
import ImportPage from './ImportPage.jsx'

export default function App() {
  // user: undefined = 확인 중, null = 로그아웃 상태, 객체 = 로그인 상태
  const [user, setUser] = useState(undefined)
  // connected: null = 확인 중, true = 연결됨, false = 연결 안 됨
  const [connected, setConnected] = useState(null)
  const [page, setPage] = useState('home') // home | import

  useEffect(() => {
    if (!auth) return
    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u))
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    if (!db) return
    const unsubscribe = onValue(ref(db, '.info/connected'), (snap) => {
      setConnected(snap.val() === true)
    })
    return () => unsubscribe()
  }, [])

  if (!isConfigured) {
    return (
      <main className="page">
        <h1>영어 단어장</h1>
        <div className="warn">
          <p>아직 Firebase 설정값이 없어요.</p>
          <p>
            프로젝트 폴더의 <code>.env</code> 파일에 값이 모두 채워져 있는지 확인하고,
            개발 서버를 다시 시작해 주세요.
          </p>
        </div>
      </main>
    )
  }

  // 로그인 전: 좁은 화면, 로그인 후 가져오기: 넓은 화면
  const wide = user && page === 'import'

  return (
    <main className={wide ? 'page wide' : 'page'}>
      <h1>영어 단어장</h1>

      {user === undefined && <p className="muted">로그인 상태 확인 중…</p>}

      {user === null && (
        <>
          <p className="lead">토익 단어부터 시작하는 나만의 영어 학습 앱</p>
          <AuthForm />
        </>
      )}

      {user && (
        <>
          <div className="topbar">
            <nav>
              <button type="button" className={page === 'home' ? 'tab on' : 'tab'} onClick={() => setPage('home')}>
                홈
              </button>
              <button type="button" className={page === 'import' ? 'tab on' : 'tab'} onClick={() => setPage('import')}>
                엑셀 가져오기
              </button>
            </nav>
            <div className="who">
              <span className="muted">{user.email}</span>
              <button type="button" className="link" onClick={() => signOut(auth)}>
                로그아웃
              </button>
            </div>
          </div>

          {page === 'home' && <Home user={user} />}
          {page === 'import' && <ImportPage user={user} />}
        </>
      )}

      {(user === null || page === 'home') && (
        <section className="card small">
          <h2>Firebase 연결 상태</h2>
          <ul className="checks">
            <li className="ok">
              설정값 확인 완료 · 프로젝트: <strong>{app.options.projectId}</strong>
            </li>
            {connected === null && <li className="wait">데이터베이스 연결 확인 중…</li>}
            {connected === true && <li className="ok">Realtime Database 연결됨</li>}
            {connected === false && (
              <li className="bad">
                Realtime Database에 연결되지 않았어요. 인터넷 연결과 .env 의 DATABASE_URL 값을 확인해 주세요.
              </li>
            )}
          </ul>
        </section>
      )}
    </main>
  )
}
