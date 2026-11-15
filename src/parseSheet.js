import { guessSenses } from './pos.js'

// 시트 하나(2차원 배열)를 읽어서 단어 목록으로 바꿉니다.
//
// 읽는 규칙
//  - "1. applicant" 처럼 번호가 붙은 줄은 핵심 단어(head)
//  - 같은 블록(첫 빈 줄 전) 안에서 번호 없는 줄은 그 핵심 단어의 파생 단어(related)
//  - 빈 줄 아래의 줄들은 모두 추가 단어(extra)
//  - C·D 열에 예문과 해석이 있으면 그 단어의 예문
//  - 파생 줄 중 "대문자로 시작해 . ! ? 로 끝나는 문장"은 위 핵심 단어의 예문

const HEAD_RE = /^(\d+)\s*[.．)]\s*(.+)$/
const SENTENCE_RE = /^[A-Z].*[.!?]$/

const clean = (v) =>
  String(v ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const isSentence = (s) => SENTENCE_RE.test(s) && s.split(' ').length >= 3

export function parseSheet(rawRows, { skipHeader = false } = {}) {
  const rows = rawRows.map((r) => [0, 1, 2, 3].map((i) => clean(r?.[i])))
  const items = []
  const warnings = []
  const heads = []

  let block = 1
  let blockHasContent = false
  let currentHead = -1

  for (let i = skipHeader ? 1 : 0; i < rows.length; i++) {
    const [a, b, c, d] = rows[i]
    const excelRow = i + 1

    // 빈 줄: 새 블록의 시작
    if (!a && !b && !c && !d) {
      if (blockHasContent) {
        block++
        blockHasContent = false
      }
      continue
    }
    blockHasContent = true

    if (!a) {
      warnings.push({ type: 'no-word', row: excelRow, message: `${excelRow}행: 단어 칸이 비어 있어서 건너뛰었어요.` })
      continue
    }

    const m = a.match(HEAD_RE)
    let role
    let no = null
    let word = a

    if (m) {
      role = 'head'
      no = Number(m[1])
      word = m[2].trim()
    } else if (block === 1 && currentHead >= 0) {
      role = 'related'
    } else {
      role = 'extra'
    }

    // 파생 줄에 섞여 있는 영어 문장은 핵심 단어의 예문으로 붙입니다.
    if (role === 'related' && isSentence(word)) {
      items[currentHead].examples.push({ en: word, ko: b })
      continue
    }

    const kind = isSentence(word) ? 'sentence' : /\s/.test(word) || word.startsWith('~') ? 'phrase' : 'word'
    const { senses, posCheck } = guessSenses(b, word, kind)

    if (!b) {
      warnings.push({ type: 'no-meaning', row: excelRow, message: `${excelRow}행 "${word}": 뜻이 비어 있어요.` })
    } else if (/[,;/]$/.test(b)) {
      warnings.push({ type: 'cutoff', row: excelRow, message: `${excelRow}행 "${word}": 뜻이 중간에 끊긴 것 같아요.` })
    }
    if (d && !c) {
      warnings.push({ type: 'example', row: excelRow, message: `${excelRow}행 "${word}": 예문 해석(D열)만 있고 예문(C열)이 없어요.` })
    }

    if (role === 'head') {
      currentHead = items.length
      heads.push({ no, row: excelRow, index: items.length, word })
    }

    items.push({
      row: excelRow,
      block,
      role,
      no,
      headIndex: role === 'related' ? currentHead : -1,
      word,
      kind,
      meaning: b,
      senses,
      posCheck,
      examples: c ? [{ en: c, ko: d }] : [],
      dup: false,
    })
  }

  // 번호가 빠지거나 순서가 이상한 곳 찾기
  for (let k = 0; k < heads.length; k++) {
    const cur = heads[k]
    const prev = heads[k - 1]
    if (!prev) {
      if (cur.no !== 1) {
        warnings.push({ type: 'missing-number', row: cur.row, message: `첫 번호가 ${cur.no}번이에요. (1번부터 시작하지 않아요)` })
      }
      continue
    }
    if (cur.no <= prev.no) {
      warnings.push({ type: 'number-order', row: cur.row, message: `${cur.row}행: ${prev.no}번 다음에 ${cur.no}번이 나와서 순서가 맞지 않아요.` })
    } else if (cur.no > prev.no + 1) {
      const between = items
        .filter((it) => it.row > prev.row && it.row < cur.row && it.role === 'related')
        .map((it) => `${it.word}(${it.row}행)`)
      const missing = []
      for (let n = prev.no + 1; n < cur.no; n++) missing.push(n)
      warnings.push({
        type: 'missing-number',
        row: prev.row,
        message: `${missing.join(', ')}번이 빠졌어요. ${prev.no}번 ${prev.word}과(와) ${cur.no}번 ${cur.word} 사이에 있는 줄: ${between.join(', ') || '없음'}`,
      })
    }
  }

  // 같은 시트 안의 중복 단어 표시
  const count = new Map()
  for (const it of items) {
    const key = it.word.toLowerCase()
    count.set(key, (count.get(key) || 0) + 1)
  }
  const dupKeys = []
  for (const it of items) {
    if (count.get(it.word.toLowerCase()) > 1) it.dup = true
  }
  for (const [key, n] of count) if (n > 1) dupKeys.push(key)

  const stats = {
    total: items.length,
    head: items.filter((x) => x.role === 'head').length,
    related: items.filter((x) => x.role === 'related').length,
    extra: items.filter((x) => x.role === 'extra').length,
    examples: items.reduce((sum, x) => sum + x.examples.length, 0),
    posCheck: items.filter((x) => x.posCheck).length,
    dupWords: dupKeys.length,
    blocks: block,
  }

  return { items, warnings, stats, dupKeys }
}
