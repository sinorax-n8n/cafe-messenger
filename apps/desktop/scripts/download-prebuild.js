#!/usr/bin/env node
/**
 * better-sqlite3 Windows용 prebuilt 바이너리 다운로드 스크립트
 *
 * Docker(Linux) 환경에서 빌드하더라도 Windows용 바이너리를 사용할 수 있도록
 * GitHub releases에서 직접 다운로드합니다.
 *
 * 사용법: node scripts/download-prebuild.js
 */

const fs = require('fs')
const path = require('path')
const https = require('https')
const { execSync } = require('child_process')

// 설정
const CONFIG = {
  // better-sqlite3 버전 (package.json과 일치해야 함)
  BETTER_SQLITE3_VERSION: '12.5.0',
  // Electron 39.x의 ABI 버전
  ELECTRON_ABI: '140',
  // 타겟 플랫폼
  PLATFORM: 'win32',
  ARCH: 'x64'
}

// 다운로드 URL 생성
const DOWNLOAD_URL = `https://github.com/WiseLibs/better-sqlite3/releases/download/v${CONFIG.BETTER_SQLITE3_VERSION}/better-sqlite3-v${CONFIG.BETTER_SQLITE3_VERSION}-electron-v${CONFIG.ELECTRON_ABI}-${CONFIG.PLATFORM}-${CONFIG.ARCH}.tar.gz`

// 출력 경로
const OUTPUT_DIR = path.join(__dirname, '..', 'prebuilds', `${CONFIG.PLATFORM}-${CONFIG.ARCH}`)
const TARBALL_PATH = path.join(__dirname, '..', 'temp-prebuild.tar.gz')

/**
 * HTTPS로 파일 다운로드 (리다이렉트 처리)
 */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    console.log(`[Download] ${url}`)

    const file = fs.createWriteStream(destPath)

    const request = (downloadUrl) => {
      https.get(downloadUrl, (response) => {
        // 리다이렉트 처리
        if (response.statusCode === 302 || response.statusCode === 301) {
          const redirectUrl = response.headers.location
          console.log(`[Redirect] ${redirectUrl}`)
          request(redirectUrl)
          return
        }

        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}`))
          return
        }

        const totalSize = parseInt(response.headers['content-length'], 10)
        let downloadedSize = 0

        response.on('data', (chunk) => {
          downloadedSize += chunk.length
          const percent = ((downloadedSize / totalSize) * 100).toFixed(1)
          process.stdout.write(`\r[Progress] ${percent}% (${(downloadedSize / 1024 / 1024).toFixed(2)} MB)`)
        })

        response.pipe(file)

        file.on('finish', () => {
          file.close()
          console.log('\n[Download] 완료')
          resolve()
        })
      }).on('error', (err) => {
        fs.unlink(destPath, () => {})
        reject(err)
      })
    }

    request(url)
  })
}

/**
 * tar.gz 압축 해제
 */
function extractTarball(tarballPath, outputDir) {
  console.log(`[Extract] ${outputDir}`)

  // 출력 디렉토리 생성
  fs.mkdirSync(outputDir, { recursive: true })

  // tar 명령어로 압축 해제 (Windows에서는 Git Bash의 tar 사용)
  try {
    execSync(`tar -xzf "${tarballPath}" -C "${outputDir}"`, { stdio: 'inherit' })
    console.log('[Extract] 완료')
  } catch (error) {
    // Windows에서 tar가 없는 경우 대안
    console.error('[Extract] tar 명령 실패, 수동으로 압축을 해제해주세요')
    throw error
  }
}

/**
 * 메인 함수
 */
async function main() {
  console.log('='.repeat(60))
  console.log('better-sqlite3 Windows Prebuild 다운로더')
  console.log('='.repeat(60))
  console.log(`버전: ${CONFIG.BETTER_SQLITE3_VERSION}`)
  console.log(`Electron ABI: v${CONFIG.ELECTRON_ABI}`)
  console.log(`플랫폼: ${CONFIG.PLATFORM}-${CONFIG.ARCH}`)
  console.log('='.repeat(60))

  try {
    // 1. 기존 파일 정리
    if (fs.existsSync(OUTPUT_DIR)) {
      console.log('[Cleanup] 기존 prebuild 폴더 삭제')
      fs.rmSync(OUTPUT_DIR, { recursive: true, force: true })
    }
    if (fs.existsSync(TARBALL_PATH)) {
      fs.unlinkSync(TARBALL_PATH)
    }

    // 2. 다운로드
    await downloadFile(DOWNLOAD_URL, TARBALL_PATH)

    // 3. 압축 해제
    extractTarball(TARBALL_PATH, OUTPUT_DIR)

    // 4. tarball 삭제
    fs.unlinkSync(TARBALL_PATH)

    // 5. 결과 확인 및 파일 위치 정리
    const nodeFile = path.join(OUTPUT_DIR, 'better_sqlite3.node')
    const altPath = path.join(OUTPUT_DIR, 'build', 'Release', 'better_sqlite3.node')

    if (fs.existsSync(nodeFile)) {
      // 이미 올바른 위치에 있음
      const stats = fs.statSync(nodeFile)
      console.log('='.repeat(60))
      console.log(`[Success] ${nodeFile}`)
      console.log(`[Size] ${(stats.size / 1024 / 1024).toFixed(2)} MB`)
      console.log('='.repeat(60))
      process.exit(0)
    } else if (fs.existsSync(altPath)) {
      // build/Release 폴더에서 상위로 이동
      console.log('[Move] build/Release에서 파일 이동 중...')
      fs.copyFileSync(altPath, nodeFile)
      fs.rmSync(path.join(OUTPUT_DIR, 'build'), { recursive: true, force: true })

      const stats = fs.statSync(nodeFile)
      console.log('='.repeat(60))
      console.log(`[Success] ${nodeFile}`)
      console.log(`[Size] ${(stats.size / 1024 / 1024).toFixed(2)} MB`)
      console.log('='.repeat(60))
      process.exit(0)
    } else {
      // 파일 찾기
      console.log('[Warning] better_sqlite3.node 파일을 찾을 수 없습니다')
      console.log('[Info] 압축 해제된 파일 목록:')
      try {
        execSync(`find "${OUTPUT_DIR}" -type f 2>/dev/null || ls -laR "${OUTPUT_DIR}"`, { stdio: 'inherit' })
      } catch (e) {
        // Windows의 경우
        try {
          execSync(`dir /s /b "${OUTPUT_DIR}"`, { stdio: 'inherit' })
        } catch (e2) {
          console.log('[Error] 파일 목록을 가져올 수 없습니다')
        }
      }
      process.exit(1)
    }

  } catch (error) {
    console.error('[Error]', error.message)
    process.exit(1)
  }
}

main()
