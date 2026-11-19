import { useEffect, useMemo, useState } from 'react'
import { ref, onValue, update, increment } from 'firebase/database'
import { db } from './firebase'
import { getCategory } from './categories'
import { meaningText } from './wordsLogic'
import { applyResult, filterForStudy, pickCards, shuffle, studyStats } from './srs'
import { canSpeak } from './speech'
import { dayKey, progressEntry } from './progressLogic'
import StudySession from './StudySession.jsx'

// 한 번만 읽기: 아직 서버에 저장 중인 답까지 반영된 값을 돌려줍니다.
const readOnce = (r) => new Promise((resolve, reject) => onValue(r, resolve, reject, { onlyOnce: true }))

// 한 폴더 공부하기: 설정 → 학습 → 결과
export default function Study({ user, cat, folderKey, onBack, preset = {} }) {
  const category = getCategory(cat)
  const isToeic = cat === 'toeic'
  const wordsPath = `users/${user.uid}/words/${cat}/${folderKey}`

  const [folder, setFolder] = useState(null)
  const [words, setWords] = useState(null)
  const [error, setError] = useState('')
  const [phase, setPhase] = useState('setup') // setup | session | summary
  const [session, setSession] = useState(null) // { cards, mode, practice, front }
  const [summary, setSummary] = useState(null) // { results, quit }
  const [saveState, setSaveState] = useState('done') // 학습 기록 저장 상태: saving | done | error

  // 설정
  const [mode, setMode] = useState('flash') // flash | quiz
  const [limit, setLimit] = useState(20)
  const [role, setRole] = useState(preset.role ?? (isToeic ? 'head' : ''))
  const [focus, setFocus] = useState(preset.focus || 'both') // both(복습 + 새 단어) | review(복습만) | new(새 단어만)
  const [topic, setTopic] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [mix, setMix] = useState(true)
  const [front, setFront] = useState('word') // 플래시카드 앞면: word | meaning
  const [autoSpeak, setAutoSpeak] = useState(false)
  const [includeNotDue, setIncludeNotDue] = useState(false)

  // 폴더와 단어는 시작할 때 한 번만 불러옵니다. (답할 때마다 전체를 다시 받으면 느려져요.)
  // 학습 결과는 아래 handleAnswer 에서 화면의 데이터에도 바로 반영합니다.
  useEffect(() => {
    let cancelled = false
    Promise.all([readOnce(ref(db, `users/${user.uid}/folders/${cat}/${folderKey}`)), readOnce(ref(db, wordsPath))])
      .then(([f, w]) => {
        if (cancelled) return
        setFolder(f.val())
        setWords(w.val() || {})
      })
      .catch((err) => !cancelled && setError(`불러오지 못했어요. (${err.code || err.message})`))
    return () => {
      cancelled = true
    }
  }, [user.uid, cat, folderKey, wordsPath])

  const list = useMemo(
    () =>
      Object.entries(words || {})
        .map(([id, w]) => ({ id, ...w }))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [words],
  )
  const topics = useMemo(() => [...new Set(list.map((w) => w.topic).filter(Boolean))], [list])

  const target = useMemo(
    () => filterForStudy(list, { role, topic, from: Number(from) || 0, to: Number(to) || 0, mode }),
    [list, role, topic, from, to, mode],
  )
  const now = Date.now()
  const stats = studyStats(target, now)
  const pickOptions = { limit, includeNotDue, includeDue: focus !== 'new', includeNew: focus !== 'review' }
  const available = pickCards(target, { ...pickOptions, now })
  const isEnglishOrKorean = Boolean(category.speech)

  function start(cards, practice = false) {
    setSession({ id: Date.now(), cards: mix ? shuffle(cards) : cards, mode, practice, front })
    setSummary(null)
    setPhase('session')
  }

  function startNew() {
    const cards = pickCards(target, { ...pickOptions, now: Date.now() })
    if (cards.length) start(cards)
  }

  // 답을 낼 때마다 화면의 데이터를 바로 갱신하고, 서버 저장은 뒤에서 합니다.
  // 한 번에 저장하는 것: 단어의 학습 상태, 진도 요약, 오늘의 통계, 폴더별 정답 통계, 마지막으로 공부한 폴더
  // (연습 모드는 기록하지 않아요. 중간에 그만둬도 지금까지의 기록은 남아요.)
  function handleAnswer(card, correct) {
    if (session.practice) return Promise.resolve()
    const now = Date.now()
    const patch = { ...applyResult(card, correct, now), seen: (card.seen || 0) + 1 }
    setWords((prev) => (prev ? { ...prev, [card.id]: { ...prev[card.id], ...patch } } : prev))

    const day = dayKey(now)
    const kind = correct ? 'right' : 'wrong'
    const w = `words/${cat}/${folderKey}/${card.id}`
    return update(ref(db, `users/${user.uid}`), {
      [`${w}/box`]: patch.box,
      [`${w}/status`]: patch.status,
      [`${w}/nextReview`]: patch.nextReview,
      [`${w}/wrongCount`]: patch.wrongCount,
      [`${w}/lastStudied`]: patch.lastStudied,
      [`${w}/seen`]: patch.seen,
      [`progress/${cat}/${folderKey}/${card.id}`]: progressEntry({ ...card, ...patch }), // 구분(role)은 카드에서 가져와요
      [`stats/daily/${day}/total`]: increment(1),
      [`stats/daily/${day}/${kind}`]: increment(1),
      [`stats/daily/${day}/byCat/${cat}/total`]: increment(1),
      [`stats/daily/${day}/byCat/${cat}/${kind}`]: increment(1),
      [`stats/folders/${cat}/${folderKey}/total`]: increment(1),
      [`stats/folders/${cat}/${folderKey}/${kind}`]: increment(1),
      'stats/last': { cat, folder: folderKey, at: now },
    })
  }

  function finish(results, quit, pending) {
    setSummary({ results, quit })
    setPhase('summary')
    // 서버 저장이 모두 끝났는지 알려줍니다.
    setSaveState('saving')
    Promise.resolve(pending).then((rs) => setSaveState((rs || []).some((r) => r.status === 'rejected') ? 'error' : 'done'))
  }

  function retryWrong() {
    const ids = new Set(summary.results.filter((r) => !r.correct).map((r) => r.id))
    const cards = session.cards.filter((c) => ids.has(c.id))
    if (cards.length) {
      setSession({ id: Date.now(), cards: mix ? shuffle(cards) : cards, mode: session.mode, practice: true, front: session.front })
      setSummary(null)
      setPhase('session')
    }
  }

  const title = folder?.name || folderKey

  // ---------- 학습 중
  if (phase === 'session' && session) {
    return (
      <StudySession
        key={session.id}
        cards={session.cards}
        mode={session.mode}
        pool={list}
        front={session.front}
        speechLang={category.speech}
        autoSpeak={autoSpeak}
        practice={session.practice}
        onAnswer={handleAnswer}
        onFinish={finish}
      />
    )
  }

  // ---------- 결과
  if (phase === 'summary' && summary) {
    const total = summary.results.length
    const right = summary.results.filter((r) => r.correct).length
    const wrong = summary.results.filter((r) => !r.correct)
    return (
      <section className="card">
        <h2>{summary.quit ? '중간 결과' : '수고하셨어요!'}</h2>
        {total === 0 ? (
          <p className="muted">아직 푼 카드가 없어요.</p>
        ) : (
          <>
            <p className="big-score">
              {right} / {total} <span className="muted small-text">정답 {Math.round((right / total) * 100)}%</span>
            </p>
            {session?.practice && <p className="muted small-text">연습 결과는 학습 기록에 반영하지 않았어요.</p>}
            {!session?.practice && saveState === 'saving' && <p className="muted small-text">학습 기록을 저장하는 중…</p>}
            {!session?.practice && saveState === 'done' && <p className="muted small-text">학습 기록을 저장했어요.</p>}
            {!session?.practice && saveState === 'error' && (
              <p className="msg bad">학습 기록 저장에 실패한 것이 있어요. 인터넷 연결을 확인하고 다시 공부해 주세요.</p>
            )}
            {wrong.length > 0 && (
              <>
                <h3 className="sub">틀린 단어 {wrong.length}개</h3>
                <ul className="plain wrong-list">
                  {wrong.map((r) => (
                    <li key={r.id}>
                      <strong>{r.word}</strong> <span className="muted">{r.meaning}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
        <div className="study-actions left">
          {wrong.length > 0 && (
            <button type="button" className="secondary" onClick={retryWrong}>틀린 것만 다시</button>
          )}
          <button type="button" className="primary" onClick={() => { setPhase('setup'); setSession(null) }}>
            계속 공부하기
          </button>
          <button type="button" className="link" onClick={onBack}>폴더로 돌아가기</button>
        </div>
      </section>
    )
  }

  // ---------- 설정
  return (
    <div>
      <div className="crumbs">
        <button type="button" className="link" onClick={onBack}>← {category.name} · {title}</button>
      </div>
      <section className="card">
        <h2>{category.name} · {title} 공부하기</h2>
        {error && <p className="msg bad">{error}</p>}
        {words === null && !error && <p className="muted">불러오는 중…</p>}

        {words && (
          <>
            <p className="study-stats">
              대상 <strong>{stats.total}</strong>개 · 새 단어 <strong>{stats.fresh}</strong> · 복습할 단어 <strong>{stats.due}</strong> · 외움 <strong>{stats.known}</strong>
            </p>

            <div className="field">
              <span>공부 방식</span>
              <div className="seg">
                <button type="button" className={mode === 'flash' ? 'on' : ''} onClick={() => setMode('flash')}>플래시카드</button>
                <button type="button" className={mode === 'quiz' ? 'on' : ''} onClick={() => setMode('quiz')}>뜻 맞히기</button>
              </div>
              <span className="muted small-text">
                {mode === 'flash' ? '카드를 보고 뜻을 떠올린 뒤, 뒤집어서 "알아요/몰라요"를 골라요.' : '단어를 보고 4개의 보기 중 알맞은 뜻을 골라요. (뜻이 없는 단어는 빠져요.)'}
              </span>
            </div>

            <div className="field">
              <span>공부할 단어</span>
              <div className="seg">
                <button type="button" className={focus === 'both' ? 'on' : ''} onClick={() => setFocus('both')}>복습 + 새 단어</button>
                <button type="button" className={focus === 'review' ? 'on' : ''} onClick={() => setFocus('review')}>복습만</button>
                <button type="button" className={focus === 'new' ? 'on' : ''} onClick={() => setFocus('new')}>새 단어만</button>
              </div>
            </div>

            <div className="field-row">
              <label className="field">
                한 번에
                <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
                  {[10, 20, 30, 50].map((n) => (
                    <option key={n} value={n}>{n}개</option>
                  ))}
                </select>
              </label>
              {isToeic && (
                <label className="field">
                  구분
                  <select value={role} onChange={(e) => setRole(e.target.value)}>
                    <option value="head">핵심만</option>
                    <option value="headrel">핵심 + 파생</option>
                    <option value="related">파생만</option>
                    <option value="extra">추가만</option>
                    <option value="">전체</option>
                  </select>
                </label>
              )}
              {topics.length > 0 && (
                <label className="field">
                  주제
                  <select value={topic} onChange={(e) => setTopic(e.target.value)}>
                    <option value="">전체</option>
                    {topics.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            <div className="field">
              <span>범위 (선택) <span className="muted small-text">· 거른 목록의 n번째부터 m번째까지</span></span>
              <div className="range-row">
                <input type="number" min="1" placeholder="시작" value={from} onChange={(e) => setFrom(e.target.value)} />
                <span>~</span>
                <input type="number" min="1" placeholder="끝" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </div>

            {mode === 'flash' && (
              <div className="field">
                <span>카드 앞면</span>
                <div className="seg">
                  <button type="button" className={front === 'word' ? 'on' : ''} onClick={() => setFront('word')}>{category.template === 'sentence' ? '문장' : '단어'} 보고 뜻 떠올리기</button>
                  <button type="button" className={front === 'meaning' ? 'on' : ''} onClick={() => setFront('meaning')}>뜻 보고 {category.template === 'sentence' ? '문장' : '단어'} 떠올리기</button>
                </div>
              </div>
            )}

            <label className="check"><input type="checkbox" checked={mix} onChange={(e) => setMix(e.target.checked)} /> 순서를 섞어서 보기</label>
            {isEnglishOrKorean && canSpeak() && (
              <label className="check"><input type="checkbox" checked={autoSpeak} onChange={(e) => setAutoSpeak(e.target.checked)} /> 카드가 나올 때 자동으로 발음 들려주기</label>
            )}
            <label className="check"><input type="checkbox" checked={includeNotDue} onChange={(e) => setIncludeNotDue(e.target.checked)} /> 복습할 때가 안 된 단어도 포함하기</label>

            {target.length === 0 ? (
              <p className="msg bad">조건에 맞는 단어가 없어요. 구분, 주제, 범위를 확인해 주세요.</p>
            ) : available.length === 0 ? (
              <p className="msg bad">
                {focus === 'review'
                  ? '지금 복습할 단어가 없어요. 복습할 때가 되면 오늘의 학습에 알려드려요.'
                  : focus === 'new'
                    ? '새로 공부할 단어가 없어요. 조건에 맞는 단어를 모두 한 번 이상 공부했어요.'
                    : '지금은 공부할 단어가 없어요. 모두 공부했고 복습할 때가 아직 안 됐어요. 위의 "복습할 때가 안 된 단어도 포함하기"를 켜면 더 공부할 수 있어요.'}
              </p>
            ) : (
              <p className="muted small-text">
                이번에 공부할 단어: {available.length}개
                {focus === 'both' && ' (복습할 단어 먼저, 남는 자리에 새 단어)'}
                {focus === 'review' && ' (복습할 단어만)'}
                {focus === 'new' && ' (새 단어만)'}
              </p>
            )}

            <button type="button" className="primary" onClick={startNew} disabled={available.length === 0}>
              시작하기{available.length > 0 ? ` (${available.length}개)` : ''}
            </button>
          </>
        )}
      </section>
    </div>
  )
}
