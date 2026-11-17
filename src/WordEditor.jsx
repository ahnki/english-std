import { useState } from 'react'
import { cleanExamples } from './wordsLogic'

// 단어 하나를 고치는 칸 (뜻, 발음, 메모, 예문 여러 개)
export default function WordEditor({ word, isSentence, topics, childCount, onSave, onDelete }) {
  const [text, setText] = useState(word.word || '')
  const [meaning, setMeaning] = useState(word.meaning || '')
  const [pron, setPron] = useState(word.pron || '')
  const [memo, setMemo] = useState(word.memo || '')
  const [topic, setTopic] = useState(word.topic || '')
  const [examples, setExamples] = useState(
    Object.values(word.examples || {}).map((e) => ({ en: e.en || '', ko: e.ko || '', src: e.src || 'excel' })),
  )
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null) // { type: 'ok' | 'bad', text }

  const label = isSentence ? '문장' : '단어'

  function setExample(i, field, value) {
    setExamples(examples.map((e, k) => (k === i ? { ...e, [field]: value } : e)))
  }

  async function handleSave() {
    if (!text.trim()) {
      setMsg({ type: 'bad', text: `${label}를 입력해 주세요.` })
      return
    }
    setBusy(true)
    setMsg(null)
    const cleaned = cleanExamples(examples, 'user')
    const patch = {
      word: text.trim(),
      meaning: meaning.trim(),
      pron: pron.trim(),
      memo: memo.trim(),
      topic: topic.trim() || null,
      examples: cleaned.length ? cleaned : null,
    }
    // 뜻을 고쳤으면 예전에 추측해 둔 품사별 뜻은 지워서 어긋나지 않게 합니다.
    if (meaning.trim() !== (word.meaning || '').trim()) {
      patch.senses = null
      patch.posCheck = false
    }
    try {
      await onSave(patch, cleaned.length)
      setExamples(cleaned)
      setMsg({ type: 'ok', text: '저장했어요.' })
    } catch (err) {
      setMsg({ type: 'bad', text: `저장하지 못했어요. (${err.code || err.message})` })
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    const extra = childCount > 0 ? `\n이 핵심 단어에 딸린 파생 단어 ${childCount}개의 연결이 끊어져요. (파생 단어 자체는 남아요.)` : ''
    if (!window.confirm(`"${word.word}"을(를) 삭제할까요?${extra}\n삭제하면 되돌릴 수 없어요.`)) return
    setBusy(true)
    try {
      await onDelete()
    } catch (err) {
      setMsg({ type: 'bad', text: `삭제하지 못했어요. (${err.code || err.message})` })
      setBusy(false)
    }
  }

  return (
    <div className="editor" onClick={(e) => e.stopPropagation()}>
      <label className="field">
        {label}
        <input value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <label className="field">
        뜻
        <textarea rows={2} value={meaning} onChange={(e) => setMeaning(e.target.value)} />
      </label>
      <div className="field-row">
        <label className="field">
          발음 (한글)
          <input value={pron} onChange={(e) => setPron(e.target.value)} />
        </label>
        <label className="field">
          주제
          <input list="topic-list" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="없음" />
          <datalist id="topic-list">
            {topics.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
      </div>
      <label className="field">
        메모
        <input value={memo} onChange={(e) => setMemo(e.target.value)} />
      </label>

      <div className="field">
        <span>
          예문 <span className="muted small-text">({examples.length}개)</span>
        </span>
        {examples.length === 0 && <span className="muted small-text">아직 예문이 없어요. 아래 버튼으로 추가해 주세요.</span>}
        {examples.map((e, i) => (
          <div className="ex-row" key={i}>
            <input value={e.en} onChange={(ev) => setExample(i, 'en', ev.target.value)} placeholder="영어 예문" />
            <input value={e.ko} onChange={(ev) => setExample(i, 'ko', ev.target.value)} placeholder="해석" />
            <button type="button" className="icon-btn" title="이 예문 삭제" onClick={() => setExamples(examples.filter((_, k) => k !== i))}>
              ×
            </button>
          </div>
        ))}
        <button type="button" className="link left" onClick={() => setExamples([...examples, { en: '', ko: '', src: 'user' }])}>
          + 예문 추가
        </button>
      </div>

      {msg && <p className={`msg ${msg.type === 'ok' ? 'good' : 'bad'}`}>{msg.text}</p>}
      <div className="editor-actions">
        <button type="button" className="primary" onClick={handleSave} disabled={busy}>
          {busy ? '처리 중…' : '저장'}
        </button>
        <button type="button" className="danger" onClick={handleDelete} disabled={busy}>
          삭제
        </button>
      </div>
    </div>
  )
}
