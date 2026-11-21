// 엑셀로 추가할 때, 폴더에 이미 있는 단어와 비교해서 "무엇을 어떻게 할지" 계획을 세웁니다.
// (Firebase 코드가 없는 순수 함수 — 저장하기 전에 미리보기로 보여주는 용도예요.)
//
// 규칙
//  - 토익: 번호가 같은 핵심 단어가 폴더에 있으면 비교해서 "없는 부분만" 채웁니다. (뜻, 발음, 메모, 예문, 새 파생어)
//          번호는 같은데 단어가 다르면 충돌 → 그 묶음은 등록하지 않아요.
//          번호가 폴더에 없으면 새 핵심 단어(와 파생어)로 추가합니다.
//  - 같은 표현 + 같은 뜻 = 중복: 등록하지 않고, 기존 단어의 빈 칸과 새 예문만 채웁니다.
//  - 같은 표현인데 뜻이 다름 = 정보를 잃지 않게 등록하고 "중복" 표시를 붙입니다.
import { toArray } from './wordsLogic.js'

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.?!]+$/, '')
const normMeaning = (s) => String(s || '').toLowerCase().replace(/\s+/g, '')

export function planAdd({ category, items, existing = [], now = Date.now(), idPrefix = 'x' }) {
  const rows = [] // 화면에 보여줄 줄별 결과
  const creates = [] // 새로 만들 단어
  const patches = {} // 기존 단어에서 채울 값: { 단어ID: { 필드: 값 } }
  const counts = { total: items.length, created: 0, marked: 0, duplicate: 0, match: 0, conflict: 0, skipped: 0, filled: 0, examplesAdded: 0 }

  // 폴더에 이미 있는 단어들의 색인
  const byText = new Map()
  const byNo = new Map()
  let maxOrder = 0
  const tail = new Map() // 핵심 단어ID -> 그 묶음의 마지막 순서
  for (const w of existing) {
    const k = norm(w.word)
    if (!byText.has(k)) byText.set(k, [])
    byText.get(k).push(w)
    if (w.role === 'head' && w.no != null && !byNo.has(w.no)) byNo.set(w.no, w)
    maxOrder = Math.max(maxOrder, w.order || 0)
  }
  for (const w of existing) {
    if (w.role === 'head') tail.set(w.id, Math.max(tail.get(w.id) ?? 0, w.order || 0))
  }
  for (const w of existing) {
    if (w.headId && tail.has(w.headId)) tail.set(w.headId, Math.max(tail.get(w.headId), w.order || 0))
  }

  let seq = 0
  const newId = () => `${idPrefix}${now.toString(36)}${String(++seq).padStart(4, '0')}`
  const orderBase = now // 새 단어는 기존 단어들(1, 2, 3…)보다 뒤에 놓입니다.
  let nextOrder = orderBase
  const createdByText = new Map() // 이번 파일 안에서 새로 만든 단어들 (파일 안의 중복 확인용)

  // 기존 단어의 빈 칸과 새 예문 채우기. 바뀐 것이 있으면 patches 에 기록하고 true 를 돌려줍니다.
  function fill(ex, item) {
    const cur = { ...ex, ...(patches[ex.id] || {}) }
    const p = patches[ex.id] || {}
    let changed = false
    if (!(cur.meaning || '').trim() && item.meaning) { p.meaning = item.meaning; changed = true }
    if (!(cur.pron || '').trim() && item.pron) { p.pron = item.pron; changed = true }
    if (!(cur.memo || '').trim() && item.memo) { p.memo = item.memo; changed = true }
    if (!cur.topic && item.topic) { p.topic = item.topic; changed = true }
    const have = toArray(cur.examples)
    const seen = new Set(have.map((e) => norm(e.en)))
    const add = item.examples.filter((e) => !seen.has(norm(e.en)))
    if (add.length) {
      p.examples = [...have, ...add.map((e) => ({ en: e.en, ko: e.ko || '', src: 'excel' }))]
      counts.examplesAdded += add.length
      changed = true
    }
    if (changed) patches[ex.id] = p
    return changed
  }

  // 같은 표현이 이미 있는지 찾기: { same: 같은 뜻인 기존 단어, other: 뜻이 다른 같은 표현이 있는지 }
  function findSame(item) {
    const list = byText.get(norm(item.word)) || []
    const same = list.find((w) => !item.meaning || !(w.meaning || '').trim() || normMeaning(w.meaning) === normMeaning(item.meaning))
    return { same, other: list.length > 0 && !same }
  }

  function create(item, { headId, dupMark, orderValue }) {
    const id = newId()
    const rec = { id, item, headId, dup: dupMark, order: orderValue }
    creates.push(rec)
    if (dupMark) counts.marked++
    else counts.created++
    const k = norm(item.word)
    if (!createdByText.has(k)) createdByText.set(k, [])
    createdByText.get(k).push(rec)
    return rec
  }

  // 이번 파일 안에서 이미 만든 같은 표현 확인
  function inFile(item) {
    const list = createdByText.get(norm(item.word)) || []
    const same = list.find((r) => !item.meaning || !r.item.meaning || normMeaning(r.item.meaning) === normMeaning(item.meaning))
    return { same, other: list.length > 0 && !same }
  }

  // 토익: 묶음(핵심 단어 + 파생어) 단위로 처리
  let group = null // { targetId, kind: 'existing' | 'new', skip }
  const pushRow = (i, status, note = '', extra = {}) => rows.push({ index: i, item: items[i], status, note, ...extra })

  items.forEach((item, i) => {
    // ---- 핵심 단어
    if (category === 'toeic' && item.role === 'head') {
      const match = byNo.get(item.no)
      if (match) {
        if (norm(match.word) === norm(item.word)) {
          counts.match++
          const changed = fill(match, item)
          if (changed) counts.filled++
          group = { targetId: match.id, skip: false }
          pushRow(i, 'match', changed ? `${item.no}번 ${match.word}: 없는 부분을 채웠어요.` : `${item.no}번 ${match.word}: 이미 같은 내용이에요.`, { targetId: match.id, filled: changed })
        } else {
          counts.conflict++
          group = { targetId: null, skip: true }
          pushRow(i, 'conflict', `${item.no}번은 이미 "${match.word}"이에요. 단어가 달라서 등록하지 않았어요.`)
        }
        return
      }
      const { same, other } = findSame(item)
      if (same) {
        counts.duplicate++
        const changed = fill(same, item)
        if (changed) counts.filled++
        group = { targetId: same.role === 'head' ? same.id : null, skip: false }
        pushRow(i, 'duplicate', `이미 있는 단어예요.${changed ? ' 비어 있던 부분만 채웠어요.' : ''}`, { targetId: same.id, filled: changed })
        return
      }
      const f = inFile(item)
      if (f.same) {
        counts.duplicate++
        group = { targetId: f.same.id, skip: false }
        pushRow(i, 'duplicate', '이번 파일에 같은 단어가 이미 있어요.')
        return
      }
      const rec = create(item, { headId: null, dupMark: other || f.other, orderValue: nextOrder++ })
      group = { targetId: rec.id, skip: false }
      pushRow(i, rec.dup ? 'marked' : 'new', rec.dup ? '같은 표현이 있지만 뜻이 달라서 등록해요. (중복 표시)' : '', { newId: rec.id })
      return
    }

    // ---- 번호 없는 단어 (파생어, 추가 단어, 일반 단어)
    if (category === 'toeic' && item.role === 'related' && group?.skip) {
      counts.skipped++
      pushRow(i, 'skipped', '번호가 충돌한 묶음이라 등록하지 않았어요.')
      return
    }
    const { same, other } = findSame(item)
    if (same) {
      counts.duplicate++
      const changed = fill(same, item)
      if (changed) counts.filled++
      pushRow(i, 'duplicate', `이미 있는 표현이에요.${changed ? ' 비어 있던 부분만 채웠어요.' : ''}`, { targetId: same.id, filled: changed })
      return
    }
    const f = inFile(item)
    if (f.same) {
      counts.duplicate++
      pushRow(i, 'duplicate', '이번 파일에 같은 표현이 이미 있어요.')
      return
    }
    const dupMark = other || f.other

    let headId = null
    let order = nextOrder
    if (category === 'toeic' && item.role === 'related' && group?.targetId) {
      headId = group.targetId
      if (tail.has(headId)) {
        // 기존 핵심 단어에 붙는 새 파생어는, 그 묶음의 맨 끝에 놓습니다.
        const t = tail.get(headId) + 0.001
        tail.set(headId, t)
        order = t
      } else nextOrder++
    } else nextOrder++
    let role = item.role
    if (category === 'toeic' && item.role === 'related' && !headId) role = 'extra' // 붙일 핵심 단어가 없으면 추가 단어
    const rec = create({ ...item, role }, { headId, dupMark, orderValue: order })
    pushRow(i, rec.dup ? 'marked' : 'new', rec.dup ? '같은 표현이 있지만 뜻이 달라서 등록해요. (중복 표시)' : '', { newId: rec.id })
  })

  return { rows, creates, patches, counts }
}

// 결과 한 줄 요약: "등록 12건 (중복 3건) · 번호 일치 2건 · 예문 5건 추가 · 충돌 1건"
export function summaryText(c) {
  const registered = c.created + c.marked
  const parts = [`등록 ${registered}건 (중복 ${c.duplicate}건)`]
  if (c.marked) parts.push(`뜻이 달라 중복 표시 ${c.marked}건`)
  if (c.match) parts.push(`번호 일치 ${c.match}건`)
  if (c.filled) parts.push(`보강 ${c.filled}건`)
  if (c.examplesAdded) parts.push(`예문 ${c.examplesAdded}건 추가`)
  if (c.conflict) parts.push(`충돌 ${c.conflict}건`)
  if (c.skipped) parts.push(`건너뜀 ${c.skipped}건`)
  return parts.join(' · ')
}
