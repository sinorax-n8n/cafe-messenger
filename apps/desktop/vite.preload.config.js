import { defineConfig } from 'vite';

// Preload 스크립트용 Vite 설정
// Preload는 Node.js 환경에서 실행되며, contextBridge를 통해 renderer와 통신

export default defineConfig({
  build: {
    rollupOptions: {
      external: [
        'electron'
      ],
      output: {
        format: 'cjs'
      }
    }
  }
});
