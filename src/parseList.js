import { guessSenses } from './pos.js'
import {
  clean, isPronunciation, isTitleRow, joinText, kindOf, makeItem, finalize,
} from './parseCommon.js'

// 회화 / 기본단어 / 순우리말 처럼 "한 줄에 하나" 형태의 시트를 읽습니다.
//  A: 단어 또는 문장, B: 뜻, C: 발음(한글) 또는 암기 메모
//  - A칸에 한글이 있고 B, C가 빈 줄은 "분류 제목". 다음 빈 줄 전까지의 항목에 주제로 붙습니다.
//  - 빈 줄을 만나면 주제는 기본 주제로 돌아갑니다.
//  - 단어 칸이 비고 뜻만 있는 줄은 윗줄 뜻의 이어쓰기

const NOTE_RE = /^(.*\S)\s*\(([^()]*[가-힣][^()]*)\)\s*$/ // 문장 끝의 "(한글 설명)"

function parseSimple(rawRows, opts = {}) {
  const {
    skipHeader = false,
    defaultTopic = null,
    useTitles = true,
    usePos = false,
    usePron = true,
    stripNote = false,
    meaningRequired = false,
    patternKind = false,
  } = opts

  const rows = rawRows.map((r) => [0, 1, 2, 3].map((i) => clean(r?.[i])))
  const items = []
  const warnings = []
  const notices = []

  let topic = defaultTopic
  let block = 1
  let blockHasContent = false
  let last = null
  let merged = 0
  let titles = 0
  const filled = (i) => i >= 0 && rows[i].some(Boolean)

  for (let i = skipHeader ? 1 : 0; i < rows.length; i++) {
    const [a, b, c] = rows[i]
    const excelRow = i + 1

    if (!a && !b && !c && !rows[i][3]) {
      if (blockHasContent) {
        block++
        blockHasContent = false
      }
      topic = defaultTopic
      last = null
      continue
    }
    blockHasContent = true

    if (useTitles && isTitleRow(a, b, c)) {
      topic = a
      titles++
      last = null
      continue
    }

    if (!a) {
      if (b && !c && last && filled(i - 1)) {
        const it = last
        it.meaning = joinText(it.meaning, b)
        if (usePos) {
          const g = guessSenses(it.meaning, it.word, it.kind)
          it.senses = g.senses
          it.posCheck = g.posCheck
        }
        notices.push({ row: excelRow, message: `${excelRow}행: 단어 칸이 비어 있어서 윗줄 "${it.word}"의 뜻에 이어 붙였어요.` })
        merged++
        continue
      }
      warnings.push({ type: 'no-word', row: excelRow, message: `${excelRow}행: 단어 칸이 비어 있어서 건너뛰었어요.` })
      last = null
      continue
    }

    // 문장 끝의 "(한글 설명)" 은 메모로 분리
    let text = a
    let memo = ''
    if (stripNote) {
      const m = a.match(NOTE_RE)
      if (m) {
        text = m[1]
        memo = m[2]
        notices.push({ row: excelRow, message: `${excelRow}행: 괄호 안 설명 "(${memo})"을 메모로 분리했어요.` })
      }
    }

    // C칸: 뜻이 있고 한글 발음처럼 보이면 발음, 아니면 메모
    let pron = ''
    if (c) {
      if (usePron && b && isPronunciation(c)) pron = c
      else memo = memo ? `${memo} / ${c}` : c
    }

    const kind = patternKind
      ? /~|\[[^\]]+\]/.test(text) ? 'pattern' : 'sentence'
      : kindOf(text)
    const g = usePos && b ? guessSenses(b, text, kind) : { senses: [], posCheck: false }

    if (!b) {
      if (meaningRequired) {
        warnings.push({ type: 'no-meaning', row: excelRow, message: `${excelRow}행 "${text}": 뜻이 비어 있어요.` })
      } else {
        notices.push({ row: excelRow, message: `${excelRow}행 "${text}": 뜻 칸이 비어 있어요.${memo ? ' (메모만 있는 줄이라 메모로 저장해요.)' : ''}` })
      }
    }

    const item = makeItem({
      row: excelRow,
      block,
      topic,
      word: text,
      kind,
      meaning: b,
      senses: g.senses,
      posCheck: g.posCheck,
      pron,
      memo,
    })
    items.push(item)
    last = item
  }

  for (const it of items) {
    if (/[,;/]$/.test(it.meaning)) {
      warnings.push({ type: 'cutoff', row: it.row, message: `${it.row}행 "${it.word}": 뜻이 중간에 끊긴 것 같아요.` })
    }
  }

  return finalize(items, warnings, notices, { merged, titles, blocks: block })
}

// 회화: 문장 / 뜻 / 발음, 묶음 제목, 괄호 메모 분리
export const parseConversation = (rows, o = {}) =>
  parseSimple(rows, {
    defaultTopic: '일반 회화',
    useTitles: true,
    usePos: false,
    usePron: true,
    stripNote: true,
    meaningRequired: true,
    patternKind: true,
    ...o,
  })

// 기본단어: 단어 / 뜻 / 발음 또는 메모, 분류 제목, 품사 추측
export const parseWordList = (rows, o = {}) =>
  parseSimple(rows, {
    defaultTopic: '일반 단어',
    useTitles: true,
    usePos: true,
    usePron: true,
    ...o,
  })

// 순우리말 등 한글 시트: 단어 / 뜻 (영어 품사 표시 없음)
export const parseKorean = (rows, o = {}) =>
  parseSimple(rows, {
    defaultTopic: null,
    useTitles: false,
    usePos: false,
    usePron: false,
    meaningRequired: true,
    ...o,
  })
