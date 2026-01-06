const { VitePlugin } = require('@electron-forge/plugin-vite');
const path = require('path');
const fs = require('fs-extra');

module.exports = {
  packagerConfig: {
    // 네이티브 모듈(better-sqlite3)은 asar 압축에서 제외
    asar: {
      unpack: '**/node_modules/{better-sqlite3,bindings,file-uri-to-path}/**/*'
    },
    // prebuilds 폴더를 추가 리소스로 포함
    extraResource: [
      path.join(__dirname, 'prebuilds')
    ]
  },
  rebuildConfig: {},
  hooks: {
    // 패키징 후 네이티브 모듈 및 Windows용 prebuild 복사
    packageAfterPrune: async (_config, buildPath) => {
      const nativeModules = ['better-sqlite3', 'bindings', 'file-uri-to-path'];

      for (const moduleName of nativeModules) {
        const src = path.join(__dirname, 'node_modules', moduleName);
        const dest = path.join(buildPath, 'node_modules', moduleName);

        if (fs.existsSync(src)) {
          await fs.copy(src, dest, { overwrite: true });
          console.log(`[Forge Hook] Copied ${moduleName} to ${dest}`);
        } else {
          console.warn(`[Forge Hook] Module not found: ${src}`);
        }
      }

      // Windows용 prebuild 바이너리 복사
      // prebuilds/win32-x64/better_sqlite3.node를 node_modules/better-sqlite3/prebuilds/에 복사
      const prebuildSrc = path.join(__dirname, 'prebuilds', 'win32-x64');
      const prebuildDest = path.join(buildPath, 'node_modules', 'better-sqlite3', 'prebuilds', 'win32-x64');

      if (fs.existsSync(prebuildSrc)) {
        await fs.ensureDir(prebuildDest);
        await fs.copy(prebuildSrc, prebuildDest, { overwrite: true });
        console.log(`[Forge Hook] Copied Windows prebuild to ${prebuildDest}`);

        // 디버그: 복사된 파일 목록 출력
        const files = await fs.readdir(prebuildDest);
        console.log(`[Forge Hook] Prebuild files: ${files.join(', ')}`);
      } else {
        console.warn(`[Forge Hook] Windows prebuild not found: ${prebuildSrc}`);
        console.warn(`[Forge Hook] Run 'node scripts/download-prebuild.js' first`);
      }
    }
  },
  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['win32']
    }
  ],
  plugins: [
    new VitePlugin({
      // Main 프로세스 설정
      build: [
        {
          entry: 'src/main/main.js',
          config: 'vite.main.config.js'
        },
        {
          // Preload 스크립트 빌드
          entry: 'src/preload/preload.js',
          config: 'vite.preload.config.js'
        }
      ],
      // Renderer 프로세스 설정
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.js'
        }
      ]
    })
  ]
}