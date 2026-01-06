// IPC 핸들러 등록
// 모든 IPC 통신 핸들러를 중앙에서 관리

const { ipcMain, BrowserWindow } = require('electron');

/**
 * 메인 윈도우 참조를 동적으로 가져오는 함수
 * IPC 핸들러에서 필요할 때 호출
 */
function getMainWindow() {
  const windows = BrowserWindow.getAllWindows();
  return windows.length > 0 ? windows[0] : null;
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
