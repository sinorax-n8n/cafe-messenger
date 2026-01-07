// IPC 핸들러 등록
// 모든 IPC 통신 핸들러를 중앙에서 관리

const { ipcMain, BrowserWindow } = require('electron');

/**
 * 메인 윈도우 참조를 동적으로 가져오는 함수
 * IPC 핸들러에서 필요할 때 호출
 * 주의: 여러 창이 열려 있을 때 올바른 메인 윈도우를 찾아야 함
 */
function getMainWindow() {
  const windows = BrowserWindow.getAllWindows();

  // 창이 없으면 null 반환
  if (windows.length === 0) return null;

  // 메인 윈도우 식별: 크기가 가장 크고, 제목에 '로그인'이 없는 창
  // (로그인 창: 500x700, 메인 창: 1200x800)
  const mainWindow = windows.find(win => {
    const bounds = win.getBounds();
    const title = win.getTitle();
    // 메인 윈도우는 크기가 크고, 제목에 '로그인'이 없음
    return bounds.width >= 800 && !title.includes('로그인');
  });

  // 찾지 못하면 첫 번째 창 반환 (fallback)
  return mainWindow || windows[0];
}

/**
 * 모든 IPC 핸들러를 등록하는 함수
 * 창 생성 전에 호출해도 됨 (mainWindow는 동적으로 참조)
 * @param {object} store - 초기화된 DataStore 인스턴스
 */
function registerIpcHandlers(store) {
  console.log('[IPC] Registering IPC handlers...');

  // 각 핸들러 모듈 가져오기
  const accountHandlers = require('./account-handler');
  const cafeHandlers = require('./cafe-handler');
  const templateHandlers = require('./template-handler');
  const memberHandlers = require('./member-handler');
  const naverHandlers = require('./naver-handler');

  // 핸들러 등록 (store 인스턴스를 의존성 주입)
  accountHandlers.register(ipcMain, store);
  cafeHandlers.register(ipcMain, store);
  templateHandlers.register(ipcMain, store);
  memberHandlers.register(ipcMain, store);
  naverHandlers.register(ipcMain, getMainWindow, store);

  console.log('[IPC] All IPC handlers registered successfully');
}

module.exports = {
  registerIpcHandlers
};
