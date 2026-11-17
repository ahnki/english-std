// 복습 주기(간격 반복)와 학습 카드 고르기 — Firebase 코드가 없는 순수 함수
//
// 상자(box) 방식: 단어마다 상자 번호(0~5)가 있어요.
//   맞히면 상자가 한 칸 올라가고, 다음 복습까지의 간격이 늘어납니다.
//   틀리면 상자 0으로 돌아가서 10분 뒤에 다시 나옵니다.
import { meaningText } from './wordsLogic.js'

const MIN = 60 * 1000
const DAY = 24 * 60 * MIN

// 상자 번호별 "다음 복습까지" 간격: 0번 10분, 1번 1일, 2번 3일, 3번 7일, 4번 14일, 5번 30일
export const BOX_INTERVAL = [10 * MIN, 1 * DAY, 3 * DAY, 7 * DAY, 14 * DAY, 30 * DAY]
export const MAX_BOX = BOX_INTERVAL.length - 1
export const KNOWN_BOX = 4 // 이 상자 이상이면 "외움"

export const isNew = (w) => (w.status || 'new') === 'new'
export const isDue = (w, now) => !isNew(w) && (w.nextReview || 0) <= now
export const hasMeaning = (w) => Boolean(meaningText(w).trim())
export const hasContent = (w) => hasMeaning(w) || Boolean((w.memo || '').trim())

// 한 번 답한 결과를 단어에 저장할 값으로 바꿉니다.
export function applyResult(w, correct, now = Date.now()) {
  const box = Math.max(0, Math.min(MAX_BOX, w.box ?? 0))
  const nextBox = correct ? Math.min(MAX_BOX, box + 1) : 0
  return {
    box: nextBox,
    status: nextBox >= KNOWN_BOX ? 'known' : 'learning',
    nextReview: now + BOX_INTERVAL[nextBox],
    wrongCount: (w.wrongCount || 0) + (correct ? 0 : 1),
    lastStudied: now,
  }
}

// 학습 대상 거르기: 구분(토익), 주제, 범위(n번째~m번째)
export function filterForStudy(list, { role = '', topic = '', from = 0, to = 0, mode = 'flash' } = {}) {
  let out = list.filter((w) => {
    if (topic && w.topic !== topic) return false
    if (role === 'headrel' && w.role !== 'head' && w.role !== 'related') return false
    if (role && role !== 'headrel' && w.role !== role) return false
    return mode === 'quiz' ? hasMeaning(w) : hasContent(w) // 뜻 맞히기는 뜻이 있는 단어만
  })
  if (from > 0 || to > 0) out = out.slice(Math.max(0, (from || 1) - 1), to > 0 ? to : undefined)
  return out
}

export function studyStats(list, now = Date.now()) {
  return {
    total: list.length,
    fresh: list.filter(isNew).length,
    due: list.filter((w) => isDue(w, now)).length,
    known: list.filter((w) => w.status === 'known').length,
  }
}

// 오늘 공부할 카드 고르기: 복습할 때가 된 단어 → 새 단어 → (원하면) 아직 때가 안 된 단어
export function pickCards(list, { limit = 20, now = Date.now(), includeNotDue = false } = {}) {
  const due = list
    .filter((w) => isDue(w, now))
    .sort((a, b) => (a.nextReview || 0) - (b.nextReview || 0) || (b.wrongCount || 0) - (a.wrongCount || 0))
  let picked = due.slice(0, limit)
  if (picked.length < limit) picked = picked.concat(list.filter(isNew).slice(0, limit - picked.length))
  if (picked.length < limit && includeNotDue) {
    const rest = list
      .filter((w) => !isNew(w) && !isDue(w, now))
      .sort((a, b) => (a.nextReview || 0) - (b.nextReview || 0))
    picked = picked.concat(rest.slice(0, limit - picked.length))
  }
  return picked
}

export function shuffle(arr, rng = Math.random) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// 뜻 맞히기 보기 만들기: 정답 1개 + 같은 종류(단어/숙어/문장)의 다른 뜻 3개, 같은 뜻은 겹치지 않게
export function makeChoices(card, pool, n = 4, rng = Math.random) {
  const correct = meaningText(card).trim()
  const seen = new Set([correct])
  const candidates = shuffle(pool.filter((w) => w.id !== card.id && hasMeaning(w)), rng)
  const ordered = [...candidates.filter((w) => w.kind === card.kind), ...candidates.filter((w) => w.kind !== card.kind)]
  const wrong = []
  for (const w of ordered) {
    const t = meaningText(w).trim()
    if (seen.has(t)) continue
    seen.add(t)
    wrong.push(t)
    if (wrong.length >= n - 1) break
  }
  return shuffle([{ text: correct, correct: true }, ...wrong.map((text) => ({ text, correct: false }))], rng)
}
