// 단어장 화면에서 쓰는 Firebase 읽기/쓰기 도구
import { ref, get, onValue, update } from 'firebase/database'
import { db } from './firebase'
import { countsOf } from './wordsLogic'
import { buildProgress } from './progressLogic'

// 단어를 추가·삭제한 뒤, 폴더 정보의 개수(전체, 핵심, 예문 등)를 다시 계산해서 저장합니다.
export async function syncFolderCounts(uid, cat, key) {
  const base = `users/${uid}`
  const [wordsSnap, folderSnap] = await Promise.all([
    get(ref(db, `${base}/words/${cat}/${key}`)),
    get(ref(db, `${base}/folders/${cat}/${key}`)),
  ])
  if (!folderSnap.exists()) return
  await update(ref(db, `${base}/folders/${cat}/${key}`), countsOf(wordsSnap.val() || {}))
}

// 처음 한 번(또는 "진도 다시 계산"): 모든 단어를 읽어서 진도 요약을 만들어 저장합니다.
export async function rebuildProgress(uid) {
  const base = `users/${uid}`
  const all = await new Promise((resolve, reject) =>
    onValue(ref(db, `${base}/words`), (s) => resolve(s.val() || {}), reject, { onlyOnce: true }),
  )
  const progress = buildProgress(all)
  const hasAny = Object.keys(progress).length > 0
  await update(ref(db, base), {
    progress: hasAny ? progress : null,
    'meta/progressBuilt': Date.now(),
  })
  return hasAny
}
