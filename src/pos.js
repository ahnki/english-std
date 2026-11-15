// 품사 추측 도구
// 한국어 뜻의 끝모양과 영어 철자를 보고 품사를 "추측"합니다.
// 100% 정확하지는 않아서, 의심스러운 단어는 posCheck(확인 필요)로 표시해 둡니다.

export const POS_LABELS = {
  n: '명사',
  v: '동사',
  adj: '형용사',
  adv: '부사',
  prep: '전치사',
  phr: '숙어·표현',
}

// 괄호 설명은 품사 판단에서 제외합니다. 예: (제도, 법률 등을)폐지하다 -> 폐지하다
function stripNotes(t) {
  return t.replace(/\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '').trim()
}

// 괄호 안에 있는 구분 기호는 무시하고 나눕니다.
export function splitTop(str, sep) {
  const out = []
  let depth = 0
  let cur = ''
  for (const ch of str) {
    if (ch === '(' || ch === '[') depth++
    if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1)
    if (ch === sep && depth === 0) {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}

// 끝모양으로는 알 수 없는 흔한 부사
const ADVERBS = new Set(['달리', '곧', '매우', '몹시', '아주', '항상', '언제나', '자주', '때때로', '이미', '아직', '거의', '결코', '전혀'])

// "한" 으로 끝나지만 명사인 경우
const NOUN_EXCEPT = /(권한|제한|기한|시한|상한|하한|무한|대한)$/

// 뜻 한 조각의 끝모양으로 품사 추측 (확신이 없으면 null)
export function koGuess(item) {
  const t = stripNotes(item)
  if (!t) return null
  if (/다$/.test(t)) return 'v'
  if (/(하게|스럽게|롭게|적으로|으로|히|다면|이면|으면)$/.test(t)) return 'adv'
  if (ADVERBS.has(t)) return 'adv'
  if (NOUN_EXCEPT.test(t)) return null
  if (/(적인|스러운|로운|다운|한|된|는|은)$/.test(t)) return 'adj'
  if (/.{2,}의$/.test(t)) return 'adj' // 2글자 "회의" 같은 명사는 제외
  return null
}

const LY_NOT = new Set([
  'apply', 'supply', 'reply', 'comply', 'rely', 'imply', 'multiply', 'family', 'assembly',
  'rally', 'ally', 'early', 'italy', 'july',
])

// 영어 철자 끝모양으로 품사 추측 (참고용)
export function enGuess(word) {
  const w = word.toLowerCase()
  const notAdv = LY_NOT.has(w) || (/ply$/.test(w) && w !== 'simply') // apply, reapply, comply ...
  if (/ly$/.test(w) && !notAdv) return 'adv'
  if (/(tion|sion|ment|ness|ity|ance|ence|ship|ism|ist|hood)$/.test(w)) return 'n'
  if (/(ive|ous|ful|less|able|ible|ical|ic|ial)$/.test(w)) return 'adj'
  if (/(ize|ify)$/.test(w)) return 'v'
  return null
}

/**
 * 뜻 문자열을 품사별로 나눕니다.
 * 반환: { senses: [{pos, ko}], posCheck }
 *  - ';' 로 나뉜 덩어리는 품사가 다른 뜻으로 봅니다.
 *  - 단어(한 단어)일 때는 '/' 도 품사 구분으로 봅니다. (숙어의 '/' 는 선택지 표현이라 나누지 않아요)
 *  - 같은 덩어리 안에서도 품사가 바뀌면 나눕니다. 예: 직접적인(adj), ~로 향하다(v)
 */
export function guessSenses(meaning, word, kind) {
  const text = (meaning || '').replace(/；/g, ';').trim()
  if (!text) return { senses: [], posCheck: false }
  if (kind !== 'word') return { senses: [{ pos: 'phr', ko: text }], posCheck: false }

  const chunks = []
  for (const semi of splitTop(text, ';')) {
    for (const part of splitTop(semi, '/')) {
      const t = part.trim()
      if (t) chunks.push(t)
    }
  }

  const raw = []
  for (const chunk of chunks) {
    let cur = null
    for (const item of splitTop(chunk, ',')) {
      const it = item.trim()
      if (!it) continue
      const g = koGuess(it)
      if (!cur) {
        cur = { pos: g || 'n', items: [it] }
        raw.push(cur)
      } else if (!g || g === cur.pos) {
        cur.items.push(it)
      } else {
        cur = { pos: g, items: [it] }
        raw.push(cur)
      }
    }
  }

  // 바로 이어지는 같은 품사는 하나로 합칩니다.
  const senses = []
  for (const s of raw) {
    const ko = s.items.join(', ')
    const last = senses[senses.length - 1]
    if (last && last.pos === s.pos) last.ko += '; ' + ko
    else senses.push({ pos: s.pos, ko })
  }

  // 영어 철자와 비교
  const e = enGuess(word)
  let posCheck = false
  if (e === 'adv' && senses.length === 1 && senses[0].pos === 'n') {
    senses[0].pos = 'adv' // -ly 로 끝나는 단어는 부사로 봅니다.
  } else if (e && !senses.some((s) => s.pos === e)) {
    posCheck = true // 한국어 뜻과 영어 철자의 느낌이 달라서 확인이 필요해요.
  }
  return { senses, posCheck }
}

// 화면에 보여줄 글자: "v. 관련시키다 / n. 동료, 부"
export function formatSenses(senses) {
  return (senses || []).map((s) => `${s.pos}. ${s.ko}`).join(' / ')
}
