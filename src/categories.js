// 카테고리(과목) 정의
// 화면의 큰 버튼 4개(토익, 회화, 단어, 한글)가 여기서 나옵니다.
// 나중에 카테고리를 늘릴 때는 이 목록(또는 Firebase의 categories)에 추가하면 돼요.
//
// template: 카드 모양
//   word     표제어 + 뜻 + (발음, 메모, 예문)
//   sentence 문장 + 뜻 + 발음
// parser: 엑셀을 읽는 방식 (parsers.js 참고)

export const CATEGORIES = [
  { id: 'toeic', name: '토익', template: 'word', order: 1, parser: 'toeic' },
  { id: 'conv', name: '회화', template: 'sentence', order: 2, parser: 'conversation' },
  { id: 'word', name: '단어', template: 'word', order: 3, parser: 'wordlist' },
  { id: 'korean', name: '한글', template: 'word', order: 4, parser: 'korean' },
]

// 시트 이름으로 카테고리를 추정합니다. (화면에서 바꿀 수 있어요)
export function guessCategory(sheetName) {
  const name = String(sheetName).trim()
  if (/^\d+\s*d$/i.test(name)) return 'toeic'
  if (name === '회화') return 'conv'
  if (name === '기본단어' || name.toLowerCase() === 'etc') return 'word'
  if (name === '순우리말') return 'korean'
  return 'word'
}

// 처음부터 체크해 둘 시트인지 (모르는 이름의 시트는 체크를 꺼 둡니다)
export function isKnownSheet(sheetName) {
  const name = String(sheetName).trim()
  return /^\d+\s*d$/i.test(name) || ['회화', '기본단어', '순우리말'].includes(name)
}
