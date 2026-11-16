// 여러 파서가 같이 쓰는 도구들

export const HANGUL = /[가-힣]/
export const LATIN = /[A-Za-z]/

// 칸의 글자를 정리합니다. (특수 공백, 연속 공백, 앞뒤 공백 제거)
export const clean = (v) =>
  String(v ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// "대문자로 시작하고 . ! ? 로 끝나는 3단어 이상" 을 문장으로 봅니다.
const SENTENCE_RE = /^[A-Z].*[.!?]$/
export const isSentence = (s) => SENTENCE_RE.test(s) && s.split(' ').length >= 3

// 두 줄에 걸쳐 적힌 글을 이어 붙입니다. 윗줄이 ")" 로 끝나면 붙여 쓰고, 아니면 한 칸 띄워요.
export function joinText(prev, add) {
  if (!prev) return add
  return /\)$/.test(prev) ? prev + add : prev + ' ' + add
}

// 한글 발음으로 볼 수 있는 글인지 (한글이 있고, 영문과 기호가 없는 짧은 글)
export function isPronunciation(c) {
  return HANGUL.test(c) && !LATIN.test(c) && !/[~=→:;.!?'"]/.test(c) && c.length <= 40
}

// 분류 제목 줄: A칸에 한글이 있고 B, C칸은 비어 있는 줄 (영문이 섞여도 OK: "b의 발음이 없는 단어")
export const isTitleRow = (a, b, c) => Boolean(a) && !b && !c && HANGUL.test(a)

export function kindOf(word) {
  if (isSentence(word)) return 'sentence'
  return /\s/.test(word) || word.startsWith('~') ? 'phrase' : 'word'
}

// 항목의 기본 모양
export function makeItem(partial) {
  return {
    row: 0,
    block: 1,
    role: 'main', // main(일반) | head(핵심) | related(파생) | extra(추가)
    no: null,
    headIndex: -1,
    topic: null,
    word: '',
    kind: 'word',
    meaning: '',
    senses: [],
    posCheck: false,
    pron: '',
    memo: '',
    examples: [],
    dup: false,
    ...partial,
  }
}

const dupKey = (it) => it.word.toLowerCase().replace(/[.?!]+$/, '')

// 마무리: 중복 표시와 통계 계산
export function finalize(items, warnings, notices, extra = {}) {
  const count = new Map()
  for (const it of items) count.set(dupKey(it), (count.get(dupKey(it)) || 0) + 1)
  const dupKeys = []
  for (const it of items) if (count.get(dupKey(it)) > 1) it.dup = true
  for (const [key, n] of count) if (n > 1) dupKeys.push(key)

  const topicCount = new Map()
  for (const it of items) if (it.topic) topicCount.set(it.topic, (topicCount.get(it.topic) || 0) + 1)

  const stats = {
    total: items.length,
    head: items.filter((x) => x.role === 'head').length,
    related: items.filter((x) => x.role === 'related').length,
    extra: items.filter((x) => x.role === 'extra').length,
    main: items.filter((x) => x.role === 'main').length,
    examples: items.reduce((sum, x) => sum + x.examples.length, 0),
    posCheck: items.filter((x) => x.posCheck).length,
    dupWords: dupKeys.length,
    topics: [...topicCount].map(([name, count]) => ({ name, count })),
    merged: 0,
    ...extra,
  }
  return { items, warnings, notices, stats, dupKeys }
}
