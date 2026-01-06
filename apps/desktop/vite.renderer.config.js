import { defineConfig } from 'vite';
import path from 'path';

// Renderer 프로세스용 Vite 설정
// https://www.electronforge.io/config/plugins/vite

export default defineConfig({
  root: path.resolve(__dirname, 'src/renderer'),
  build: {
    // Electron Forge Vite 플러그인 규칙: renderer/{name}/ 구조
    // forge.config.js의 renderer[].name과 일치해야 함
    outDir: path.resolve(__dirname, '.vite/renderer/main_window'),
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'src/renderer/index.html')
    }
  },
  server: {
    port: 5173,
    strictPort: true
  }
});
