// 단어장 화면에서 쓰는 Firebase 읽기/쓰기 도구
import { ref, get, update } from 'firebase/database'
import { db } from './firebase'
import { countsOf } from './wordsLogic'

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
