// 단어장 화면에서 쓰는 계산 도구 (Firebase 코드가 없는 순수 함수)
import { formatSenses } from './pos.js'
import { kindOf } from './parseCommon.js'

// Realtime Database 는 배열을 객체로 돌려주기도 해서, 항상 배열로 바꿔 줍니다.
export const toArray = (v) => (Array.isArray(v) ? v : v ? Object.values(v) : [])

// 목록에 보여줄 뜻: 품사별 뜻이 있으면 그것, 없으면 엑셀 원본 뜻
export function meaningText(w) {
  const senses = toArray(w.senses)
  return senses.length ? formatSenses(senses) : w.meaning || ''
}

// 폴더의 단어들로부터 개수를 계산합니다. (폴더 정보에 저장됩니다)
export function countsOf(words) {
  const list = Object.values(words || {})
  const topics = new Set()
  let examples = 0
  for (const w of list) {
    if (w.topic) topics.add(w.topic)
    examples += toArray(w.examples).length
  }
  return {
    count: list.length,
    head: list.filter((w) => w.role === 'head').length,
    related: list.filter((w) => w.role === 'related').length,
    extra: list.filter((w) => w.role === 'extra').length,
    examples,
    topics: topics.size,
  }
}

// 검색어가 단어, 뜻, 발음, 메모, 주제, 예문 중 어디에든 들어 있으면 true
export function matchWord(w, query) {
  const q = (query || '').trim().toLowerCase()
  if (!q) return true
  const parts = [w.word, w.meaning, w.pron, w.memo, w.topic]
  for (const s of toArray(w.senses)) parts.push(s.ko)
  for (const e of toArray(w.examples)) parts.push(e.en, e.ko)
  return parts.some((x) => x && String(x).toLowerCase().includes(q))
}

// 새로 직접 추가하는 단어의 저장 모양 (엑셀에서 가져온 단어와 같은 필드)
export function buildNewWord({ category, text, meaning, pron, memo, topic, role, examples, now }) {
  const word = text.trim()
  const kind =
    category === 'conv'
      ? /~|\[[^\]]+\]/.test(word) ? 'pattern' : 'sentence'
      : kindOf(word)
  return {
    word,
    kind,
    role: role || 'main',
    no: null,
    headId: null,
    topic: topic?.trim() || null,
    block: 0,
    meaning: (meaning || '').trim(),
    pron: (pron || '').trim(),
    memo: (memo || '').trim(),
    examples: cleanExamples(examples, 'user'),
    dup: false,
    order: now, // 엑셀에서 가져온 단어(1, 2, 3…)보다 항상 뒤에 옵니다.
    status: 'new',
    wrongCount: 0,
    nextReview: 0,
    createdAt: now,
  }
}

// 예문 목록 정리: 비어 있는 예문은 빼고, 출처(src)가 없으면 지정한 값으로 채웁니다.
export function cleanExamples(list, defaultSrc = 'user') {
  return toArray(list)
    .map((e) => ({ en: (e.en || '').trim(), ko: (e.ko || '').trim(), src: e.src || defaultSrc }))
    .filter((e) => e.en)
}

// 엑셀로 추가하는 새 단어의 저장 모양 (가져오기·직접 추가한 단어와 같은 필드)
export function buildExcelWord(item, { headId = null, order, now, dup = false }) {
  return {
    word: item.word,
    kind: item.kind,
    role: item.role,
    no: item.no ?? null,
    headId,
    topic: item.topic ?? null,
    block: 0,
    meaning: item.meaning || '',
    pron: item.pron || '',
    memo: item.memo || '',
    examples: cleanExamples(item.examples, 'excel'),
    dup: Boolean(dup),
    order,
    status: 'new',
    wrongCount: 0,
    nextReview: 0,
    createdAt: now,
  }
}
