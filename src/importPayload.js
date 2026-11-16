// 파싱한 결과를 Realtime Database에 저장할 모양으로 바꿉니다.
// (Firebase 코드가 없는 순수 함수라서 따로 시험해 볼 수 있어요.)
//
// 저장 구조
//   users/{uid}/categories/{카테고리}                 카테고리 정보 (이름, 카드 모양)
//   users/{uid}/folders/{카테고리}/{폴더키}           폴더 정보 (이름, 단어 수 ...)
//   users/{uid}/words/{카테고리}/{폴더키}/{단어ID}    그 폴더의 단어들

// "1d" ~ "9d" 를 "01d" ~ "09d" 로 맞춥니다. (Firebase 콘솔에서 01d, 02d, ... 10d 순서로 정렬되도록)
export function padDay(name) {
  const m = String(name).trim().match(/^(\d+)\s*d$/i)
  return m ? `${m[1].padStart(2, '0')}d` : String(name).trim()
}

// Firebase 키에는 . $ # [ ] / 를 쓸 수 없어서 _ 로 바꿉니다.
export function folderKeyOf(name) {
  const key = padDay(name).replace(/[.$#[\]/\\]/g, '_')
  return key || 'sheet'
}

// "1d", "2d", ... "30d" 를 숫자 순서로 정렬하기 위한 값
export function folderOrderOf(name, fallbackIndex) {
  const n = parseInt(name, 10)
  return Number.isFinite(n) ? n : 1000 + fallbackIndex
}

export function buildFolderPayload({ category, sheetName, items, stats, fileName, index, now }) {
  const key = folderKeyOf(sheetName)
  const ids = items.map((_, i) => 'w' + String(i + 1).padStart(4, '0'))

  const words = {}
  items.forEach((it, i) => {
    words[ids[i]] = {
      word: it.word, // 단어 또는 문장
      kind: it.kind, // word | phrase | sentence | pattern
      role: it.role, // main(일반) | head(핵심) | related(파생) | extra(추가)
      no: it.no ?? null, // 핵심 단어의 번호
      headId: it.headIndex >= 0 ? ids[it.headIndex] : null, // 파생 단어가 속한 핵심 단어
      topic: it.topic ?? null, // 분류 제목 (예: 공공질서, 일반 단어)
      block: it.block,
      meaning: it.meaning, // 엑셀 원본 뜻
      senses: it.senses.map((s) => ({ pos: s.pos, ko: s.ko })), // 품사별 뜻
      posCheck: Boolean(it.posCheck),
      pron: it.pron || '', // 한글 발음
      memo: it.memo || '', // 암기 메모
      examples: it.examples.map((e) => ({ en: e.en, ko: e.ko || '', src: e.src || 'excel' })),
      dup: Boolean(it.dup),
      order: i + 1,
      status: 'new',
      wrongCount: 0,
      nextReview: 0,
      createdAt: now,
    }
  })

  const folder = {
    name: padDay(sheetName),
    category,
    order: folderOrderOf(sheetName, index),
    count: items.length,
    head: stats.head,
    related: stats.related,
    extra: stats.extra,
    examples: stats.examples,
    topics: stats.topics.length,
    source: fileName || '',
    importedAt: now,
  }

  return { key, folder, words }
}