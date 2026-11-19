import { useEffect, useMemo, useState } from 'react'
import { ref, onValue, update } from 'firebase/database'
import { db } from './firebase'
import { getCategory } from './categories'
import { matchWord, meaningText, toArray } from './wordsLogic'
import { syncFolderCounts } from './wordsDb'
import WordEditor from './WordEditor.jsx'

const PAGE = 50
const ROLE_LABEL = { head: '핵심', related: '파생', extra: '추가', main: '' }

// 폴더 하나의 단어 목록: 보기, 검색, 거르기, 수정, 삭제, 예문 추가
export default function FolderView({ user, cat, folderKey, onBack, onAdd, onStudy }) {
  const category = getCategory(cat)
  const isToeic = cat === 'toeic'
  const isSentence = category.template === 'sentence'
  const base = `users/${user.uid}`
  const wordsPath = `${base}/words/${cat}/${folderKey}`

  const [folder, setFolder] = useState(undefined) // undefined = 불러오는 중, null = 없음
  const [words, setWords] = useState(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [topic, setTopic] = useState('')
  const [role, setRole] = useState('')
  const [shown, setShown] = useState(PAGE)
  const [openId, setOpenId] = useState('')

  useEffect(() => {
    const onErr = (err) => setError(`불러오지 못했어요. (${err.code || err.message})`)
    const off1 = onValue(ref(db, `${base}/folders/${cat}/${folderKey}`), (s) => setFolder(s.val()), onErr)
    const off2 = onValue(ref(db, wordsPath), (s) => setWords(s.val() || {}), onErr)
    return () => {
      off1()
      off2()
    }
  }, [base, cat, folderKey, wordsPath])

  // 검색, 거르기가 바뀌면 처음부터 다시 보여줍니다.
  useEffect(() => setShown(PAGE), [query, topic, role])

  const list = useMemo(
    () =>
      Object.entries(words || {})
        .map(([id, w]) => ({ id, ...w }))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [words],
  )
  const topics = useMemo(() => [...new Set(list.map((w) => w.topic).filter(Boolean))], [list])

  const filtered = useMemo(
    () =>
      list.filter((w) => {
        if (topic && w.topic !== topic) return false
        if (role === 'headrel' && w.role !== 'head' && w.role !== 'related') return false
        if (role && role !== 'headrel' && w.role !== role) return false
        return matchWord(w, query)
      }),
    [list, query, topic, role],
  )

  async function handleSave(w, patch, newExampleCount) {
    await update(ref(db, `${wordsPath}/${w.id}`), patch)
    if (toArray(w.examples).length !== newExampleCount) await syncFolderCounts(user.uid, cat, folderKey)
  }

  async function handleDelete(w) {
    const inFolder = `words/${cat}/${folderKey}`
    const updates = {
      [`${inFolder}/${w.id}`]: null,
      [`progress/${cat}/${folderKey}/${w.id}`]: null, // 공부 기록(진도 요약)도 함께 지웁니다.
    }
    // 핵심 단어를 지우면, 그 아래 파생 단어의 연결만 끊습니다.
    for (const c of list) if (c.headId === w.id) updates[`${inFolder}/${c.id}/headId`] = null
    await update(ref(db, `users/${user.uid}`), updates)
    await syncFolderCounts(user.uid, cat, folderKey)
    setOpenId('')
  }

  const title = folder?.name || folderKey

  return (
    <div>
      <div className="crumbs">
        <button type="button" className="link" onClick={onBack}>← {category.name}</button>
      </div>

      <section className="card">
        <div className="card-head">
          <div>
            <h2 className="no-margin">
              {category.name} · {title}
            </h2>
            {folder && (
              <p className="muted small-text no-margin">
                전체 {folder.count ?? list.length}개
                {isToeic && ` · 핵심 ${folder.head ?? 0} · 파생 ${folder.related ?? 0} · 추가 ${folder.extra ?? 0}`}
                {` · 예문 ${folder.examples ?? 0}개`}
              </p>
            )}
          </div>
          <div className="head-actions">
            <button type="button" className="primary slim" onClick={onStudy}>학습하기</button>
            <button type="button" className="secondary slim" onClick={onAdd}>+ {isSentence ? '문장' : '단어'} 추가</button>
          </div>
        </div>

        <div className="filters">
          <input
            type="search"
            className="grow"
            placeholder={`${isSentence ? '문장' : '단어'}, 뜻, 발음, 메모, 예문 검색`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {isToeic && (
            <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="구분">
              <option value="">구분: 전체</option>
              <option value="head">핵심만</option>
              <option value="headrel">핵심 + 파생</option>
              <option value="related">파생만</option>
              <option value="extra">추가만</option>
            </select>
          )}
          {topics.length > 0 && (
            <select value={topic} onChange={(e) => setTopic(e.target.value)} aria-label="주제">
              <option value="">주제: 전체</option>
              {topics.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          )}
        </div>

        {error && <p className="msg bad">{error}</p>}
        {words === null && !error && <p className="muted">불러오는 중…</p>}
        {words && folder === null && list.length === 0 && (
          <p className="muted">이 폴더를 찾을 수 없어요. 홈으로 돌아가서 다시 선택해 주세요.</p>
        )}

        {words && list.length > 0 && (
          <>
            <p className="muted small-text">
              {filtered.length === list.length ? `${list.length}개` : `${list.length}개 중 ${filtered.length}개`}
              {filtered.length > shown && ` · ${shown}개 표시 중`}
            </p>
            <ul className="wlist">
              {filtered.slice(0, shown).map((w) => {
                const open = openId === w.id
                const exCount = toArray(w.examples).length
                return (
                  <li key={w.id} className={`wrow role-${w.role}${open ? ' open' : ''}`}>
                    <div className="wsum" onClick={() => setOpenId(open ? '' : w.id)}>
                      {isToeic && ROLE_LABEL[w.role] && <span className={`badge role-${w.role}`}>{ROLE_LABEL[w.role]}</span>}
                      {w.no != null && <span className="num-tag">{w.no}</span>}
                      <span className="wtext">{w.word}</span>
                      {w.kind === 'pattern' && <span className="badge">패턴</span>}
                      <span className="wmean">{meaningText(w)}</span>
                      {w.pron && <span className="wpron">[{w.pron}]</span>}
                      {w.topic && topics.length > 1 && <span className="badge topic">{w.topic}</span>}
                      {exCount > 0 && <span className="badge">예문 {exCount}</span>}
                      {w.memo && <span className="badge">메모</span>}
                      {w.dup && <span className="badge warn-badge" title="같은 폴더에 같은 표현이 또 있어요">중복</span>}
                    </div>
                    {open && (
                      <WordEditor
                        key={w.id}
                        word={w}
                        isSentence={isSentence}
                        topics={topics}
                        childCount={list.filter((c) => c.headId === w.id).length}
                        onSave={(patch, n) => handleSave(w, patch, n)}
                        onDelete={() => handleDelete(w)}
                      />
                    )}
                  </li>
                )
              })}
            </ul>
            {filtered.length === 0 && <p className="muted">검색 결과가 없어요.</p>}
            {filtered.length > shown && (
              <button type="button" className="secondary" onClick={() => setShown(shown + PAGE)}>
                더 보기 ({shown}/{filtered.length})
              </button>
            )}
          </>
        )}
      </section>
    </div>
  )
}
