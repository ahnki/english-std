// "데이터 추가" 전용 양식 읽기 (예전 처음 가져오기 양식과는 열 위치가 달라요)
//
// [토익 · 단어 · 한글]  A 단어(토익은 번호 포함)  B 뜻  C 발음  D 예문  E 예문 해석  F 메모
//   - 토익: "41. reluctant" 처럼 번호가 있으면 핵심 단어, 번호 없는 영어는 바로 위 핵심 단어의 파생·연관어
//   - 빈 줄 아래의 번호 없는 단어는 "추가 단어" (바로 위 핵심 단어에 붙지 않아요)
//   - A, B, C가 비고 D(예문)만 있는 줄은 바로 위 단어의 예문 → 예문은 N건까지
//   - 단어·한글: A칸에 한글이 있고 나머지가 빈 줄은 "주제 제목" (다음 빈 줄 전까지 적용)
// [회화]  A 문장  B 뜻  C 발음  D 메모  (제목 줄 = 주제, 문장 끝 "(한글 설명)" = 메모)
//
// 첫 줄의 B칸이 "뜻"이면 제목 줄로 보고 자동으로 건너뜁니다.
import { clean, HANGUL, LATIN, isTitleRow, kindOf, makeItem, finalize } from './parseCommon.js'

const HEAD_RE = /^(\d+)\s*[.．)]\s*(.+)$/
const NOTE_RE = /^(.*\S)\s*\(([^()]*[가-힣][^()]*)\)\s*$/
const HEADER_B = ['뜻', '의미', '한국어 뜻', '한글 뜻']

// 첫 번째로 값이 있는 줄이 제목 줄인지 (B칸이 "뜻")
export function headerRowIndex(rawRows) {
  const i = rawRows.findIndex((r) => (r || []).some((c) => clean(c)))
  if (i < 0) return -1
  const a = clean(rawRows[i][0])
  const b = clean(rawRows[i][1])
  return HEADER_B.includes(b) && !HEAD_RE.test(a) ? i : -1
}

export function parseAddSheet(category, rawRows, { skipHeader = 'auto' } = {}) {
  const rows = rawRows.map((r) => [0, 1, 2, 3, 4, 5].map((i) => clean(r?.[i])))
  const hdr = skipHeader === true ? rows.findIndex((r) => r.some(Boolean)) : skipHeader === 'auto' ? headerRowIndex(rawRows) : -1
  const isConv = category === 'conv'
  const isToeic = category === 'toeic'
  const useTitles = category !== 'toeic' && category !== 'korean'
  const defaultTopic = isConv ? '일반 회화' : category === 'word' ? '일반 단어' : null

  const items = []
  const warnings = []
  const notices = []
  let topic = defaultTopic
  let block = 1
  let blockHas = false
  let currentHead = -1
  let last = null // 바로 윗줄의 항목 (예문을 붙일 대상)
  let titles = 0

  for (let i = 0; i < rows.length; i++) {
    if (i === hdr) {
      notices.push({ row: i + 1, message: `${i + 1}행은 제목 줄이라서 건너뛰었어요.` })
      continue
    }
    if (hdr >= 0 && i < hdr) continue
    const [a, b, c, d, e, f] = rows[i]
    const row = i + 1

    if (!rows[i].some(Boolean)) {
      if (blockHas) block++
      blockHas = false
      topic = defaultTopic
      currentHead = -1
      last = null
      continue
    }
    blockHas = true

    // 예문만 있는 줄: 바로 위 단어의 예문
    if (!isConv && !a && !b && !c && (d || e)) {
      if (!last) warnings.push({ type: 'example', row, message: `${row}행: 예문을 붙일 단어가 바로 위에 없어요. (빈 줄 바로 아래인가요?)` })
      else if (!d) warnings.push({ type: 'example', row, message: `${row}행: 예문 해석(E열)만 있고 예문(D열)이 없어요.` })
      else last.examples.push({ en: d, ko: e, src: 'excel' })
      continue
    }

    if (!a) {
      warnings.push({ type: 'no-word', row, message: `${row}행: 단어 칸(A열)이 비어 있어서 건너뛰었어요.` })
      last = null
      continue
    }

    // 주제 제목 줄
    if (useTitles && isTitleRow(a, b, c) && !d && !e && !f) {
      topic = a
      titles++
      last = null
      continue
    }

    let role = 'main'
    let no = null
    let word = a
    if (isToeic) {
      const m = a.match(HEAD_RE)
      if (m) {
        role = 'head'
        no = Number(m[1])
        word = m[2].trim()
      } else role = currentHead >= 0 ? 'related' : 'extra'
    }

    let memo = f
    if (isConv) {
      const m = a.match(NOTE_RE)
      if (m) {
        word = m[1]
        memo = memo ? `${m[2]} / ${memo}` : m[2]
        notices.push({ row, message: `${row}행: 괄호 안 설명 "(${m[2]})"을 메모로 분리했어요.` })
      }
      if (d) memo = memo ? `${memo} / ${d}` : d // 회화의 D열은 메모
    }

    const kind = isConv ? (/~|\[[^\]]+\]/.test(word) ? 'pattern' : 'sentence') : kindOf(word)
    if (c && LATIN.test(c) && !isConv) {
      warnings.push({ type: 'pron', row, message: `${row}행 "${word}": 발음 칸(C열)에 영어가 있어요. 예문은 D열에 적어 주세요. (예전 양식 파일이라면 "처음 가져오기(고급)"를 쓰세요.)` })
    }
    if (!isConv && e && !d) warnings.push({ type: 'example', row, message: `${row}행 "${word}": 예문 해석(E열)만 있고 예문(D열)이 없어요.` })
    if (!b && !memo) notices.push({ row, message: `${row}행 "${word}": 뜻 칸이 비어 있어요.` })

    const item = makeItem({
      row,
      block,
      role,
      no,
      headIndex: role === 'related' ? currentHead : -1,
      topic,
      word,
      kind,
      meaning: b,
      pron: c,
      memo,
      examples: !isConv && d ? [{ en: d, ko: e, src: 'excel' }] : [],
    })
    if (role === 'head') currentHead = items.length
    items.push(item)
    last = item
  }

  return finalize(items, warnings, notices, { titles, blocks: block })
}
