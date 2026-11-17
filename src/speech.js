// 브라우저의 음성 합성으로 단어를 읽어 줍니다. (지원하지 않는 브라우저에서는 조용히 무시해요)
export const canSpeak = () =>
  typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'

export function speak(text, lang = 'en-US') {
  if (!canSpeak() || !text) return
  try {
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(String(text).replace(/[~()]/g, ' '))
    u.lang = lang
    u.rate = 0.9
    window.speechSynthesis.speak(u)
  } catch {
    // 음성 기능이 없거나 막혀 있으면 넘어갑니다.
  }
}
