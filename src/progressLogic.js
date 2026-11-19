// 진도 요약과 오늘의 학습 계산 — Firebase 코드가 없는 순수 함수
import { KNOWN_BOX } from './srs.js'

// 하루 목표 문제 수 (나중에 설정으로 바꿀 수 있게 한 곳에 모아 둬요)
export const DAILY_GOAL = 20

const DAY = 24 * 60 * 60 * 1000

// 날짜 키: 내 기기의 현재 시간대 기준 "2026-11-18"
export function dayKey(ts = Date.now()) {
  const d = new Date(ts)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${dd}`
}

// 공부한 단어 하나의 진도 요약: n=다음 복습 시각, b=상자, w=틀린 횟수, s=나온 횟수, r=구분(핵심/파생/추가/일반)
export const progressEntry = (w) => ({
  n: w.nextReview || 0,
  b: w.box ?? 0,
  w: w.wrongCount || 0,
  s: w.seen || 0,
  r: w.role || 'main',
})

// 모든 단어(카테고리 → 폴더 → 단어)에서 진도 요약을 처음부터 만듭니다. 공부한 단어만 들어가요.
export function buildProgress(allWords) {
  const out = {}
  for (const [cat, folders] of Object.entries(allWords || {})) {
    for (const [folder, words] of Object.entries(folders || {})) {
      for (const [id, w] of Object.entries(words || {})) {
        if ((w.status || 'new') === 'new') continue
        ;((out[cat] ||= {})[folder] ||= {})[id] = progressEntry(w)
      }
    }
  }
  return out
}

// 폴더 하나의 현황
//  - 핵심 단어가 있는 폴더(토익)는 "핵심 단어" 기준으로 진도(외움, 학습 중, 새 단어)를 셉니다. (학습 화면의 기본 대상과 같아요.)
//  - 복습할 단어는 구분과 상관없이, 공부한 단어 중 복습 때가 된 것을 모두 셉니다.
export function folderStatus(entries, count, now = Date.now(), headCount = 0) {
  const all = Object.values(entries || {})
  const scoped = headCount > 0 ? all.filter((e) => e.r === 'head') : all
  const total = headCount > 0 ? headCount : count || 0
  const studied = scoped.length
  const known = scoped.filter((e) => (e.b ?? 0) >= KNOWN_BOX).length
  return {
    studied,
    known,
    learning: studied - known,
    due: all.filter((e) => (e.n || 0) <= now).length,
    fresh: Math.max(0, total - studied),
    total,
  }
}

// 전체 요약: 폴더별 현황과 합계. folders = { 카테고리: [{ id, name, count, order }, ...] }
export function summarize(progress, folders, now = Date.now()) {
  const rows = []
  for (const [cat, list] of Object.entries(folders || {})) {
    for (const f of list || []) {
      const s = folderStatus(progress?.[cat]?.[f.id], f.count, now, f.head || 0)
      rows.push({ cat, folder: f.id, name: f.name, count: f.count || 0, ...s })
    }
  }
  return {
    rows,
    dueTotal: rows.reduce((a, r) => a + r.due, 0),
    freshTotal: rows.reduce((a, r) => a + r.fresh, 0),
    knownTotal: rows.reduce((a, r) => a + r.known, 0),
    studiedTotal: rows.reduce((a, r) => a + r.studied, 0),
  }
}

// 연속 학습일: 오늘 공부했으면 오늘부터, 아직이면 어제부터 거꾸로 이어진 날 수
export function streakOf(daily, now = Date.now()) {
  const has = (t) => (daily?.[dayKey(t)]?.total || 0) > 0
  let t = new Date(now).setHours(12, 0, 0, 0) // 정오 기준 (날짜 계산이 어긋나지 않도록)
  if (!has(t)) t -= DAY
  let n = 0
  while (has(t)) {
    n++
    t -= DAY
  }
  return n
}

export function todayStats(daily, now = Date.now()) {
  const d = daily?.[dayKey(now)] || {}
  const total = d.total || 0
  const right = d.right || 0
  return { total, right, wrong: d.wrong || 0, rate: total ? Math.round((right / total) * 100) : 0 }
}

// 엑셀을 덮어써서 폴더를 새로 만들 때, 그 폴더의 학습 기록(진도, 정답 통계)도 함께 지웁니다.
export const resetProgressPaths = (cat, key) => ({
  [`progress/${cat}/${key}`]: null,
  [`stats/folders/${cat}/${key}`]: null,
})
