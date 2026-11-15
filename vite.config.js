import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite 설정 파일: React를 사용하겠다고 알려주는 역할이에요.
export default defineConfig({
  plugins: [react()],
})
