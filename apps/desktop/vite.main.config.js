import { defineConfig } from 'vite';
import path from 'path';

// Main 프로세스용 Vite 설정
// https://www.electronforge.io/config/plugins/vite

export default defineConfig({
  resolve: {
    // browserField: false,
    mainFields: ['module', 'jsnext:main', 'jsnext'],
  },
  build: {
    // Main 프로세스는 Node.js 환경
    rollupOptions: {
      external: [
        'electron',
        'electron/main',
        'better-sqlite3',
        'electron-store',
        // Node.js 내장 모듈
        'path',
        'node:path',
        'crypto',
        'node:crypto'
      ],
      output: {
        format: 'cjs',
        // 모든 로컬 모듈을 단일 번들로 인라인
        inlineDynamicImports: true
      }
    },
    // CommonJS require()를 제대로 처리하기 위한 설정
    commonjsOptions: {
      include: [/node_modules/, /src/]
    }
  }
});
