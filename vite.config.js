import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite 설정 파일
//  - 인터넷에 올릴 때(build)와 올리기 전에 확인할 때(preview)는 주소가
//    https://ahnki.github.io/english-std/ 처럼 "저장소 이름" 경로 아래가 되므로
//    base 를 '/english-std/' 로 맞춥니다. (저장소 이름을 바꾸면 여기도 같이 바꿔야 해요.)
//  - 내 컴퓨터에서 개발할 때(npm run dev)는 그대로 http://localhost:5173/ 를 씁니다.
//
// 참고: Vite 는 build 와 preview 모두 mode 가 'production' 이고, dev 는 'development' 입니다.
//       (preview 는 command 가 'serve' 라서 command 로는 구분할 수 없어요.)
export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/english-std/' : '/',
  plugins: [react()],
}))