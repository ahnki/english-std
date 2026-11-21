import { useEffect, useState } from 'react'
import { ref, onValue } from 'firebase/database'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { isConfigured, app, auth, db } from './firebase'
import AuthForm from './AuthForm.jsx'
import Home from './Home.jsx'
import FolderView from './FolderView.jsx'
import AddData from './AddData.jsx'
import Study from './Study.jsx'

export default function App() {
  // user: undefined = 확인 중, null = 로그아웃 상태, 객체 = 로그인 상태
  const [user, setUser] = useState(undefined)
  // connected: null = 확인 중, true = 연결됨, false = 연결 안 됨
  const [connected, setConnected] = useState(null)
  // 지금 보고 있는 화면: home | folder | study | add(데이터 추가)
  const [view, setView] = useState({ name: 'home' })
  const go = (name, params = {}) => setView({ name, ...params })

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

  // 화면 폭: 단어 목록과 가져오기는 넓게, 추가 화면은 중간, 나머지는 좁게
  const widthClass = !user ? '' : view.name === 'add' || view.name === 'folder' ? ' wide' : view.name === 'study' ? ' mid' : ''
  const tab = (name, label, on) => (
    <button type="button" className={on ? 'tab on' : 'tab'} onClick={() => go(name)}>
      {label}
    </button>
  )

  return (
    <main className={`page${widthClass}`}>
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
              {tab('home', '홈', ['home', 'folder', 'study'].includes(view.name))}
              {tab('add', '데이터 추가', view.name === 'add')}
            </nav>
            <div className="who">
              <span className="muted">{user.email}</span>
              <button type="button" className="link" onClick={() => signOut(auth)}>
                로그아웃
              </button>
            </div>
          </div>

          {view.name === 'home' && (
            <Home
              key={view.cat || 'home'}
              user={user}
              initialOpen={view.cat || ''}
              onOpenFolder={(cat, key) => go('folder', { cat, key })}
              onStudyFolder={(cat, key, preset) => go('study', { cat, key, preset })}
            />
          )}
          {view.name === 'folder' && (
            <FolderView
              key={`${view.cat}/${view.key}`}
              user={user}
              cat={view.cat}
              folderKey={view.key}
              onBack={() => go('home', { cat: view.cat })}
              onAdd={() => go('add', { cat: view.cat, key: view.key, mode: 'one' })}
              onStudy={() => go('study', { cat: view.cat, key: view.key })}
            />
          )}
          {view.name === 'study' && (
            <Study
              key={`${view.cat}/${view.key}/${JSON.stringify(view.preset || {})}`}
              user={user}
              cat={view.cat}
              folderKey={view.key}
              preset={view.preset || {}}
              onBack={() => go('folder', { cat: view.cat, key: view.key })}
            />
          )}
          {view.name === 'add' && (
            <AddData
              key={`${view.cat || ''}/${view.key || ''}/${view.mode || ''}`}
              user={user}
              defaultCat={view.cat}
              defaultFolder={view.key}
              initialMode={view.mode || 'excel'}
              onOpenFolder={(cat, key) => go('folder', { cat, key })}
            />
          )}
        </>
      )}

      {(user === null || view.name === 'home') && (
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
