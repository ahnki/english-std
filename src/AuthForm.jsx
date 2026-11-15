import { useState } from 'react'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from 'firebase/auth'
import { auth } from './firebase'

// Firebase가 돌려주는 오류 코드를 알기 쉬운 한국어로 바꿔줍니다.
const ERROR_MESSAGES = {
  'auth/invalid-email': '이메일 형식이 올바르지 않아요.',
  'auth/missing-email': '이메일을 입력해 주세요.',
  'auth/missing-password': '비밀번호를 입력해 주세요.',
  'auth/weak-password': '비밀번호는 6자 이상이어야 해요.',
  'auth/email-already-in-use': '이미 가입된 이메일이에요. 로그인해 주세요.',
  'auth/invalid-credential': '이메일 또는 비밀번호가 맞지 않아요.',
  'auth/user-not-found': '가입되지 않은 이메일이에요.',
  'auth/wrong-password': '이메일 또는 비밀번호가 맞지 않아요.',
  'auth/too-many-requests': '시도가 너무 많아요. 잠시 후 다시 해주세요.',
  'auth/network-request-failed': '네트워크 연결을 확인해 주세요.',
  'auth/operation-not-allowed':
    'Firebase에서 이메일/비밀번호 로그인이 아직 켜져 있지 않아요.',
}

function toMessage(err) {
  return ERROR_MESSAGES[err.code] || `오류가 발생했어요. (${err.code || err.message})`
}

export default function AuthForm() {
  const [mode, setMode] = useState('login') // 'login' 또는 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  const isSignup = mode === 'signup'

  function switchMode(next) {
    setMode(next)
    setError('')
    setInfo('')
    setPassword('')
    setConfirm('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setInfo('')

    if (isSignup && password !== confirm) {
      setError('비밀번호 확인이 일치하지 않아요.')
      return
    }

    setBusy(true)
    try {
      if (isSignup) {
        await createUserWithEmailAndPassword(auth, email.trim(), password)
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password)
      }
      // 성공하면 App.jsx 가 로그인 상태를 감지해서 화면을 바꿔줍니다.
    } catch (err) {
      setError(toMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleReset() {
    setError('')
    setInfo('')
    if (!email.trim()) {
      setError('비밀번호를 재설정할 이메일을 먼저 입력해 주세요.')
      return
    }
    setBusy(true)
    try {
      await sendPasswordResetEmail(auth, email.trim())
      setInfo('재설정 메일을 보냈어요. 받은편지함과 스팸함을 확인해 주세요.')
    } catch (err) {
      setError(toMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <h2>{isSignup ? '회원가입' : '로그인'}</h2>

      <form onSubmit={handleSubmit} className="auth-form">
        <label>
          이메일
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            autoComplete="email"
            required
          />
        </label>

        <label>
          비밀번호
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="6자 이상"
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            required
          />
        </label>

        {isSignup && (
          <label>
            비밀번호 확인
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
            />
          </label>
        )}

        {error && <p className="msg bad">{error}</p>}
        {info && <p className="msg good">{info}</p>}

        <button type="submit" className="primary" disabled={busy}>
          {busy ? '처리 중…' : isSignup ? '가입하기' : '로그인'}
        </button>
      </form>

      <div className="auth-links">
        {isSignup ? (
          <button type="button" className="link" onClick={() => switchMode('login')}>
            이미 계정이 있어요 · 로그인
          </button>
        ) : (
          <>
            <button type="button" className="link" onClick={() => switchMode('signup')}>
              처음이에요 · 회원가입
            </button>
            <button type="button" className="link" onClick={handleReset} disabled={busy}>
              비밀번호를 잊으셨나요?
            </button>
          </>
        )}
      </div>
    </section>
  )
}
