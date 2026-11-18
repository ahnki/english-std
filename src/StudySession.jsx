import { useEffect, useMemo, useRef, useState } from 'react'
import { makeChoices } from './srs'
import { meaningText, toArray } from './wordsLogic'
import { canSpeak, speak } from './speech'

// 카드 한 장씩 넘기며 공부하는 화면 (플래시카드, 뜻 맞히기)
export default function StudySession({ cards, mode, pool, front, speechLang, autoSpeak, practice, onAnswer, onFinish }) {
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false) // 플래시카드: 뒷면을 봤는지
  const [picked, setPicked] = useState(-1) // 뜻 맞히기: 고른 보기 번호
  const [results, setResults] = useState([])
  const [saveError, setSaveError] = useState('')
  const resultsRef = useRef([]) // 가장 최근 결과 (빠르게 눌러도 놓치지 않도록)
  const pendingRef = useRef([]) // 아직 서버에 저장 중인 답들
  const answeredRef = useRef(-1) // 이미 답한 카드 번호 (같은 카드에 두 번 답하지 않도록)

  const card = cards[index]
  const isQuiz = mode === 'quiz'
  const sayable = canSpeak() && Boolean(speechLang)

  // 보기는 카드가 바뀔 때만 새로 만듭니다. (답을 저장하는 동안 보기가 바뀌면 안 돼요.)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const choices = useMemo(() => (isQuiz && card ? makeChoices(card, pool) : []), [isQuiz, index])

  useEffect(() => {
    if (autoSpeak && card && (isQuiz || front === 'word')) speak(card.word, speechLang)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index])

  // 답을 기록합니다. 화면은 저장을 기다리지 않고, 서버 저장은 뒤에서 진행해요.
  function record(correct) {
    const r = { id: card.id, word: card.word, meaning: meaningText(card), correct }
    const pending = Promise.resolve(onAnswer(card, correct)).catch((err) => {
      setSaveError(`학습 기록을 저장하지 못했어요. 인터넷 연결을 확인해 주세요. (${err.code || err.message})`)
      throw err
    })
    pendingRef.current.push(pending)
    resultsRef.current = [...resultsRef.current, r]
    setResults(resultsRef.current)
  }

  function finish(quit) {
    onFinish(resultsRef.current, quit, Promise.allSettled(pendingRef.current))
  }

  function judge(correct) {
    if (answeredRef.current === index) return
    answeredRef.current = index
    record(correct)
    if (index + 1 >= cards.length) finish(false)
    else {
      setIndex(index + 1)
      setFlipped(false)
    }
  }

  function choose(i) {
    if (picked >= 0 || answeredRef.current === index) return
    answeredRef.current = index
    setPicked(i)
    record(choices[i].correct)
  }

  function nextCard() {
    if (picked < 0) return
    if (index + 1 >= cards.length) finish(false)
    else {
      setIndex(index + 1)
      setPicked(-1)
    }
  }

  // 키보드: 플래시카드는 Space(뒤집기) 1(몰라요) 2(알아요), 뜻 맞히기는 1~4(고르기) Enter(다음)
  useEffect(() => {
    function onKey(e) {
      if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return
      if (isQuiz) {
        if (['1', '2', '3', '4'].includes(e.key)) {
          const n = Number(e.key) - 1
          if (n < choices.length) choose(n)
        } else if ((e.key === 'Enter' || e.key === ' ') && picked >= 0) {
          e.preventDefault()
          nextCard()
        }
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        if (!flipped) setFlipped(true)
      } else if (flipped && e.key === '1') judge(false)
      else if (flipped && e.key === '2') judge(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!card) return null
  const wrongNow = results.filter((r) => !r.correct).length
  const mean = meaningText(card)
  const examples = toArray(card.examples)

  const detail = (
    <div className="study-detail">
      {card.pron && <div className="muted">[{card.pron}]</div>}
      {card.memo && <div className="study-memo">메모: {card.memo}</div>}
      {examples.map((e, i) => (
        <div className="study-ex" key={i}>
          <div>{e.en}</div>
          {e.ko && <div className="muted">{e.ko}</div>}
        </div>
      ))}
    </div>
  )

  return (
    <div>
      <div className="study-top">
        <span className="muted small-text">
          {index + 1} / {cards.length}
          {practice && ' · 연습(기록에 반영하지 않아요)'}
          {wrongNow > 0 && ` · 틀림 ${wrongNow}`}
        </span>
        <button type="button" className="link" onClick={() => finish(true)}>그만하기</button>
      </div>
      <div className="bar"><div style={{ width: `${(index / cards.length) * 100}%` }} /></div>
      {saveError && <p className="msg bad">{saveError}</p>}

      {!isQuiz && (
        <section className="card study-card" onClick={() => !flipped && setFlipped(true)}>
          {!flipped ? (
            <>
              <div className="study-big">
                {front === 'word' ? card.word : mean || card.memo}
                {front === 'word' && sayable && (
                  <button type="button" className="icon-btn speak" onClick={(e) => { e.stopPropagation(); speak(card.word, speechLang) }} title="발음 듣기">🔊</button>
                )}
              </div>
              <p className="muted small-text">눌러서 뒤집기 (Space)</p>
            </>
          ) : (
            <>
              {front === 'meaning' && (
                <div className="study-big">
                  {card.word}
                  {sayable && (
                    <button type="button" className="icon-btn speak" onClick={() => speak(card.word, speechLang)} title="발음 듣기">🔊</button>
                  )}
                </div>
              )}
              {front === 'word' && (
                <>
                  <div className="study-small muted">{card.word}</div>
                  <div className="study-big">{mean || '(뜻 없음)'}</div>
                </>
              )}
              {detail}
            </>
          )}
        </section>
      )}

      {isQuiz && (
        <section className="card study-card">
          <div className="study-big">
            {card.word}
            {sayable && (
              <button type="button" className="icon-btn speak" onClick={() => speak(card.word, speechLang)} title="발음 듣기">🔊</button>
            )}
          </div>
          <div className="options">
            {choices.map((c, i) => {
              const state = picked < 0 ? '' : c.correct ? ' right' : i === picked ? ' wrong' : ' dim'
              return (
                <button type="button" key={i} className={`option${state}`} onClick={() => choose(i)} disabled={picked >= 0}>
                  <span className="opt-no">{i + 1}</span>
                  <span>{c.text}</span>
                </button>
              )
            })}
          </div>
          {picked >= 0 && (
            <>
              <p className={`msg ${choices[picked].correct ? 'good' : 'bad'}`}>
                {choices[picked].correct ? '정답이에요!' : '아쉬워요. 정답은 초록색이에요.'}
              </p>
              {detail}
            </>
          )}
        </section>
      )}

      <div className="study-actions">
        {!isQuiz && flipped && (
          <>
            <button type="button" className="danger" onClick={() => judge(false)}>몰라요 (1)</button>
            <button type="button" className="primary" onClick={() => judge(true)}>알아요 (2)</button>
          </>
        )}
        {!isQuiz && !flipped && (
          <button type="button" className="primary" onClick={() => setFlipped(true)}>뒤집기 (Space)</button>
        )}
        {isQuiz && picked >= 0 && (
          <button type="button" className="primary" onClick={nextCard}>
            {index + 1 >= cards.length ? '결과 보기' : '다음 (Enter)'}
          </button>
        )}
      </div>
    </div>
  )
}
