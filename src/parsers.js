import { parseSheet } from './parseSheet.js'
import { parseConversation, parseWordList, parseKorean } from './parseList.js'

const PARSERS = {
  toeic: parseSheet,
  conv: parseConversation,
  word: parseWordList,
  korean: parseKorean,
}

// 카테고리에 맞는 읽기 규칙으로 시트를 읽습니다.
export function parseByCategory(categoryId, rows, options) {
  return (PARSERS[categoryId] || parseWordList)(rows, options)
}
