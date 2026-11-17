import { useEffect, useMemo, useState } from 'react'
import { ref, onValue, get, update, push } from 'firebase/database'
import { db } from './firebase'
import { CATEGORIES, getCategory } from './categories'
import { folderKeyOf, padDay } from './importPayload'
import { buildNewWord } from './wordsLogic'
import { syncFolderCounts } from './wordsDb'

const NEW = '__new__'
const DEFAULT_TOPIC = { conv: '일반 회화', word: '일반 단어' }

// 단어(또는 문장)를 한 개씩 직접 등록합니다. 카테고리와 폴더를 고릅니다.
export default function AddWord({ user, defaultCat, defaultFolder, onOpenFolder }) {
  const base = `users/${user.uid}`
  const [folders, setFolders] = useState(null) // { 카테고리: { 폴더키: 폴더정보 } }
  const [cat, setCat] = useState(defaultCat || 'word')
  const [folderKey, setFolderKey] = useState(defaultFolder || '')
  const [newName, setNewName] = useState('')
  const [text, setText] = useState('')
  const [meaning, setMeaning] = useState('')
  const [pron, setPron] = useState('')
  const [memo, setMemo] = useState('')
  const [topic, setTopic] = useState('')
  const [examples, setExamples] = useState([{ en: '', ko: '' }])
  const [existingTopics, setExistingTopics] = useState([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null) // { type, text, cat, key }

  const category = getCategory(cat)
  const isSentence = category.template === 'sentence'
  const label = isSentence ? '문장' : '단어'

  useEffect(() => {
    const off = onValue(ref(db, `${base}/folders`), (s) => setFolders(s.val() || {}), () => setFolders({}))
    return () => off()
  }, [base])

  const folderList = useMemo(
    () =>
      Object.entries((folders || {})[cat] || {})
        .map(([id, f]) => ({ id, ...f }))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [folders, cat],
  )

  // 선택된 폴더가 이 카테고리에 없으면: 처음 지정한 폴더 → 첫 폴더 → 새 폴더 순으로 정합니다.
  const effectiveKey = useMemo(() => {
    if (folderKey === NEW || folderList.some((f) => f.id === folderKey)) return folderKey
    if (defaultFolder && folderList.some((f) => f.id === defaultFolder)) return defaultFolder
    return folderList[0]?.id || NEW
  }, [folderKey, folderList, defaultFolder])

  // 고른 폴더에서 이미 쓰고 있는 주제를 불러옵니다.
  useEffect(() => {
    let cancelled = false
    setExistingTopics([])
    if (effectiveKey === NEW || !folders) return undefined
    get(ref(db, `${base}/words/${cat}/${effectiveKey}`))
      .then((snap) => {
        if (cancelled) return
        const topics = new Set(Object.values(snap.val() || {}).map((w) => w.topic).filter(Boolean))
        setExistingTopics([...topics])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [base, cat, effectiveKey, folders])

  function setExample(i, field, value) {
    setExamples(examples.map((e, k) => (k === i ? { ...e, [field]: value } : e)))
  }

  async function handleSave(e) {
    e.preventDefault()
    setMsg(null)
    if (!text.trim()) return setMsg({ type: 'bad', text: `${label}를 입력해 주세요.` })
    if (!meaning.trim() && !memo.trim()) return setMsg({ type: 'bad', text: '뜻이나 메모 중 하나는 입력해 주세요.' })
    const creating = effectiveKey === NEW
    if (creating && !newName.trim()) return setMsg({ type: 'bad', text: '새 폴더의 이름을 입력해 주세요.' })

    setBusy(true)
    try {
      const now = Date.now()
      const key = creating ? folderKeyOf(newName) : effectiveKey
      const exists = Boolean((folders?.[cat] || {})[key])
      const updates = {
        [`categories/${cat}`]: { name: category.name, template: category.template, order: category.order },
      }
      if (!exists) {
        const maxOrder = Math.max(0, ...folderList.map((f) => f.order || 0))
        updates[`folders/${cat}/${key}`] = {
          name: padDay(newName || key),
          category: cat,
          order: maxOrder + 1,
          count: 0, head: 0, related: 0, extra: 0, examples: 0, topics: 0,
          source: '직접 추가',
          importedAt: now,
        }
      }
      const id = push(ref(db, `${base}/words/${cat}/${key}`)).key
      updates[`words/${cat}/${key}/${id}`] = buildNewWord({
        category: cat,
        text,
        meaning,
        pron,
        memo,
        topic: topic.trim() || DEFAULT_TOPIC[cat] || '',
        role: cat === 'toeic' ? 'extra' : 'main', // 토익에 직접 추가하는 단어는 "추가 단어"
        examples,
        now,
      })
      await update(ref(db, base), updates)
      await syncFolderCounts(user.uid, cat, key)

      setMsg({ type: 'ok', text: `"${text.trim()}" 저장했어요.`, cat, key })
      setText('')
      setMeaning('')
      setPron('')
      setMemo('')
      setExamples([{ en: '', ko: '' }])
      if (creating) setFolderKey(key)
    } catch (err) {
      setMsg({ type: 'bad', text: `저장하지 못했어요. (${err.code || err.message})` })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <h2>{label} 직접 추가</h2>
      <form className="add-form" onSubmit={handleSave}>
        <div className="field-row">
          <label className="field">
            카테고리
            <select value={cat} onChange={(e) => { setCat(e.target.value); setFolderKey(''); if (msg?.type === 'bad') setMsg(null) }}>
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            폴더
            <select value={effectiveKey} onChange={(e) => setFolderKey(e.target.value)}>
              {folderList.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
              <option value={NEW}>+ 새 폴더 만들기</option>
            </select>
          </label>
        </div>

        {effectiveKey === NEW && (
          <label className="field">
            새 폴더 이름
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="예: 여행 영어" />
          </label>
        )}

        <label className="field">
          {label}
          <input value={text} onChange={(e) => { setText(e.target.value); if (msg?.type === 'bad') setMsg(null) }} placeholder={isSentence ? 'Where is the station?' : 'reluctant'} />
        </label>
        <label className="field">
          뜻
          <textarea rows={2} value={meaning} onChange={(e) => { setMeaning(e.target.value); if (msg?.type === 'bad') setMsg(null) }} />
        </label>
        <div className="field-row">
          <label className="field">
            발음 (한글, 선택)
            <input value={pron} onChange={(e) => setPron(e.target.value)} />
          </label>
          <label className="field">
            주제 (선택)
            <input
              list="add-topics"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder={DEFAULT_TOPIC[cat] || '없음'}
            />
            <datalist id="add-topics">
              {existingTopics.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </label>
        </div>
        <label className="field">
          메모 (선택)
          <input value={memo} onChange={(e) => setMemo(e.target.value)} />
        </label>

        {!isSentence && (
          <div className="field">
            예문 (선택, 여러 개 가능)
            {examples.map((ex, i) => (
              <div className="ex-row" key={i}>
                <input value={ex.en} onChange={(e) => setExample(i, 'en', e.target.value)} placeholder="영어 예문" />
                <input value={ex.ko} onChange={(e) => setExample(i, 'ko', e.target.value)} placeholder="해석" />
                {examples.length > 1 && (
                  <button type="button" className="icon-btn" title="삭제" onClick={() => setExamples(examples.filter((_, k) => k !== i))}>
                    ×
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="link left" onClick={() => setExamples([...examples, { en: '', ko: '' }])}>
              + 예문 추가
            </button>
          </div>
        )}

        {msg && (
          <p className={`msg ${msg.type === 'ok' ? 'good' : 'bad'}`}>
            {msg.text}{' '}
            {msg.type === 'ok' && (
              <button type="button" className="link" onClick={() => onOpenFolder(msg.cat, msg.key)}>
                폴더에서 보기
              </button>
            )}
          </p>
        )}

        <button type="submit" className="primary" disabled={busy}>
          {busy ? '저장 중…' : '저장'}
        </button>
      </form>
    </section>
  )
}
