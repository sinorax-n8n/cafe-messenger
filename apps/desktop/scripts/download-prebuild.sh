#!/bin/bash
# better-sqlite3 Windows용 prebuilt 바이너리 다운로드 스크립트 (Linux/Docker용)
#
# 사용법: ./scripts/download-prebuild.sh

set -e

# 설정
BETTER_SQLITE3_VERSION="12.5.0"
ELECTRON_ABI="140"
PLATFORM="win32"
ARCH="x64"

# 다운로드 URL
DOWNLOAD_URL="https://github.com/WiseLibs/better-sqlite3/releases/download/v${BETTER_SQLITE3_VERSION}/better-sqlite3-v${BETTER_SQLITE3_VERSION}-electron-v${ELECTRON_ABI}-${PLATFORM}-${ARCH}.tar.gz"

# 경로
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="${PROJECT_DIR}/prebuilds/${PLATFORM}-${ARCH}"
TARBALL_PATH="${PROJECT_DIR}/temp-prebuild.tar.gz"

echo "============================================================"
echo "better-sqlite3 Windows Prebuild 다운로더"
echo "============================================================"
echo "버전: ${BETTER_SQLITE3_VERSION}"
echo "Electron ABI: v${ELECTRON_ABI}"
echo "플랫폼: ${PLATFORM}-${ARCH}"
echo "다운로드 URL: ${DOWNLOAD_URL}"
echo "출력 경로: ${OUTPUT_DIR}"
echo "============================================================"

# 기존 파일 정리
if [ -d "$OUTPUT_DIR" ]; then
  echo "[Cleanup] 기존 prebuild 폴더 삭제"
  rm -rf "$OUTPUT_DIR"
fi
if [ -f "$TARBALL_PATH" ]; then
  rm -f "$TARBALL_PATH"
fi

# 출력 디렉토리 생성
mkdir -p "$OUTPUT_DIR"

# 다운로드 (curl 또는 wget 사용, 없으면 Node.js)
echo "[Download] 다운로드 중..."
if command -v curl &> /dev/null; then
  curl -L -o "$TARBALL_PATH" "$DOWNLOAD_URL"
elif command -v wget &> /dev/null; then
  wget -O "$TARBALL_PATH" "$DOWNLOAD_URL"
else
  # Node.js로 다운로드 (동기 방식)
  echo "[Download] curl/wget 없음, Node.js 사용"
  node "${SCRIPT_DIR}/download-prebuild.js"
fi
echo "[Download] 완료"

# 압축 해제
echo "[Extract] 압축 해제 중..."
tar -xzf "$TARBALL_PATH" -C "$OUTPUT_DIR"
echo "[Extract] 완료"

# tarball 삭제
rm -f "$TARBALL_PATH"

# 결과 확인
echo "============================================================"
echo "[결과] 압축 해제된 파일:"
find "$OUTPUT_DIR" -type f
echo "============================================================"

# better_sqlite3.node 파일 확인
if [ -f "${OUTPUT_DIR}/better_sqlite3.node" ]; then
  FILE_SIZE=$(ls -lh "${OUTPUT_DIR}/better_sqlite3.node" | awk '{print $5}')
  echo "[Success] better_sqlite3.node 파일 생성됨 (${FILE_SIZE})"
elif [ -f "${OUTPUT_DIR}/build/Release/better_sqlite3.node" ]; then
  # build/Release 폴더 안에 있는 경우 상위로 이동
  echo "[Info] build/Release에서 파일 이동 중..."
  mv "${OUTPUT_DIR}/build/Release/better_sqlite3.node" "${OUTPUT_DIR}/"
  rm -rf "${OUTPUT_DIR}/build"
  FILE_SIZE=$(ls -lh "${OUTPUT_DIR}/better_sqlite3.node" | awk '{print $5}')
  echo "[Success] better_sqlite3.node 파일 생성됨 (${FILE_SIZE})"
else
  echo "[Error] better_sqlite3.node 파일을 찾을 수 없습니다"
  exit 1
fi

echo "============================================================"
echo "Prebuild 다운로드 완료!"
echo "이제 'npm run make:win'으로 빌드할 수 있습니다."
echo "============================================================"
