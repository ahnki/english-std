import { guessSenses } from './pos.js'
import {
  HANGUL, LATIN, clean, isSentence, joinText, kindOf, makeItem, finalize,
} from './parseCommon.js'

// 토익 시트(1d ~ 30d) 읽기 규칙
//  - "1. applicant" 처럼 번호가 붙은 줄: 핵심 단어(head)
//  - 같은 블록(첫 빈 줄 전)에서 번호 없는 줄: 그 핵심 단어의 파생 단어(related)
//  - 빈 줄 아래의 줄들: 추가 단어(extra)  (두 번째, 세 번째 블록 모두 같이 취급)
//  - C열: 한글만 있으면 발음, 아니면 예문 / D열: 예문 해석
//  - 파생 줄 중 "대문자로 시작해 . ! ? 로 끝나는 문장" 은 위 핵심 단어의 예문
//  - 단어 칸(A)이 비고 뜻(B)만 있는 줄: 윗줄 뜻의 이어쓰기 → 윗줄에 이어 붙임

const HEAD_RE = /^(\d+)\s*[.．)]\s*(.+)$/

export function parseSheet(rawRows, { skipHeader = false } = {}) {
  const rows = rawRows.map((r) => [0, 1, 2, 3].map((i) => clean(r?.[i])))
  const items = []
  const warnings = []
  const notices = []
  const heads = []

  let block = 1
  let blockHasContent = false
  let currentHead = -1
  let last = null // 바로 윗줄이 만든 것: { item } 또는 { example }
  let merged = 0
  const filled = (i) => i >= 0 && rows[i].some(Boolean)

  for (let i = skipHeader ? 1 : 0; i < rows.length; i++) {
    const [a, b, c, d] = rows[i]
    const excelRow = i + 1

    if (!a && !b && !c && !d) {
      if (blockHasContent) {
        block++
        blockHasContent = false
      }
      last = null
      continue
    }
    blockHasContent = true

    if (!a) {
      // 뜻이 두 줄에 걸쳐 적힌 경우: 윗줄에 이어 붙입니다.
      if (b && !c && !d && last && filled(i - 1)) {
        if (last.item) {
          const it = last.item
          it.meaning = joinText(it.meaning, b)
          const g = guessSenses(it.meaning, it.word, it.kind)
          it.senses = g.senses
          it.posCheck = g.posCheck
          notices.push({ row: excelRow, message: `${excelRow}행: 단어 칸이 비어 있어서 윗줄 "${it.word}"의 뜻에 이어 붙였어요.` })
        } else {
          last.example.ko = joinText(last.example.ko, b)
          notices.push({ row: excelRow, message: `${excelRow}행: 윗줄 예문의 해석에 이어 붙였어요.` })
        }
        merged++
        continue
      }
      warnings.push({ type: 'no-word', row: excelRow, message: `${excelRow}행: 단어 칸이 비어 있어서 건너뛰었어요.` })
      last = null
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
      const example = { en: word, ko: b, src: 'excel' }
      items[currentHead].examples.push(example)
      last = { example }
      continue
    }

    const kind = kindOf(word)
    const { senses, posCheck } = guessSenses(b, word, kind)

    let pron = ''
    const examples = []
    if (c) {
      if (HANGUL.test(c) && !LATIN.test(c)) pron = c
      else examples.push({ en: c, ko: d, src: 'excel' })
    }
    if (d && !c) {
      warnings.push({ type: 'example', row: excelRow, message: `${excelRow}행 "${word}": 예문 해석(D열)만 있고 예문(C열)이 없어요.` })
    }
    if (!b) {
      notices.push({ row: excelRow, message: `${excelRow}행 "${word}": 뜻 칸이 비어 있어요. (설명용 줄이면 그대로 둬도 돼요.)` })
    }

    if (role === 'head') {
      currentHead = items.length
      heads.push({ no, row: excelRow, word })
    }

    const item = makeItem({
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
      pron,
      examples,
    })
    items.push(item)
    last = { item }
  }

  // 이어 붙이고도 쉼표로 끝나는 뜻은 잘린 것일 수 있어요.
  for (const it of items) {
    if (/[,;/]$/.test(it.meaning)) {
      warnings.push({ type: 'cutoff', row: it.row, message: `${it.row}행 "${it.word}": 뜻이 중간에 끊긴 것 같아요.` })
    }
  }

  // 번호가 빠지거나 순서가 이상한 곳
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

  return finalize(items, warnings, notices, { merged, blocks: block })
}
