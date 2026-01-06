const { app, BrowserWindow } = require('electron/main')
const path = require('node:path')

// store 모듈 로드 (네이티브 모듈 로드 실패 시 null)
let store = null
try {
  store = require('./store')
  console.log('[Main] Store module loaded')
} catch (error) {
  console.error('[Main] Failed to load store module:', error.message)
}

const { registerIpcHandlers } = require('./ipc/handlers')

// 메인 윈도우 참조 (전역)
let mainWindow = null

const createWindow = () => {
  console.log('[Main] Creating window...')
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false, // 준비될 때까지 숨김
    webPreferences: {
      // Vite 빌드 후 main.js와 preload.js가 같은 디렉토리에 위치
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // 준비되면 창 표시
  mainWindow.once('ready-to-show', () => {
    console.log('[Main] Window ready to show')
    mainWindow.show()
  })

  // 로드 실패 시 에러 표시
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('[Main] Failed to load:', errorCode, errorDescription)
    mainWindow.show() // 에러가 있어도 창은 표시
  })

  // Vite 개발 서버 또는 빌드된 파일 로드
  // Electron Forge + Vite 플러그인이 환경 변수를 주입함
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    // 개발 모드: Vite dev server 사용
    console.log('[Main] Loading dev server URL:', MAIN_WINDOW_VITE_DEV_SERVER_URL)
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
  } else {
    // 프로덕션: 빌드된 파일 로드
    const indexPath = path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    console.log('[Main] Loading file:', indexPath)
    mainWindow.loadFile(indexPath).catch(err => {
      console.error('[Main] loadFile error:', err)
      mainWindow.show() // 에러가 있어도 창은 표시
    })
  }

  // 윈도우 닫힐 때 참조 정리
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  return mainWindow
}

/**
 * 메인 윈도우 참조 반환
 */
function getMainWindow() {
  return mainWindow
}

app.whenReady().then(() => {
  console.log('[Main] App ready')

  // 1. 데이터베이스 초기화 (에러 발생해도 앱은 계속 실행)
  if (store) {
    try {
      store.initialize()
      console.log('[Main] Store initialized')

      // 일일 발송 카운트 리셋 (날짜가 지난 계정 초기화)
      store.resetDailySentCount()
    } catch (error) {
      console.error('[Main] Store initialization failed:', error)
      // DB 없이도 앱은 실행 (기능 제한됨)
    }
  } else {
    console.warn('[Main] Store not available, skipping initialization')
  }

  // 2. IPC 핸들러 등록 (창 생성 전에 등록해야 함)
  // store 인스턴스를 전달하여 모든 핸들러가 동일한 초기화된 인스턴스 사용
  try {
    registerIpcHandlers(store)
    console.log('[Main] IPC handlers registered')
  } catch (error) {
    console.error('[Main] IPC registration failed:', error)
  }

  // 3. 창 생성 (항상 실행)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 앱 종료 시 데이터베이스 연결 정리
app.on('will-quit', () => {
  if (store) {
    store.close()
  }
})