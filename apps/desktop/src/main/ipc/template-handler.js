// 템플릿 관리 IPC 핸들러

/**
 * IPC 핸들러 등록
 * @param {object} ipcMain - Electron IPC 메인 모듈
 * @param {object} store - 초기화된 DataStore 인스턴스
 */
function register(ipcMain, store) {
  // 모든 템플릿 조회
  ipcMain.handle('templates:getAll', async () => {
    try {
      return store.getAll('templates');
    } catch (error) {
      console.error('[IPC] templates:getAll error:', error);
      throw error;
    }
  });

  // 템플릿 생성
  ipcMain.handle('templates:create', async (event, data) => {
    try {
      const { name, content } = data;

      // 유효성 검사
      if (!name || !content) {
        throw new Error('템플릿 이름과 내용은 필수입니다');
      }

      // 템플릿 생성
      const template = store.create('templates', {
        name,
        content
      });

      console.log(`[IPC] Created template: ${name}`);
      return template;
    } catch (error) {
      console.error('[IPC] templates:create error:', error);
      throw error;
    }
  });

  // 템플릿 업데이트
  ipcMain.handle('templates:update', async (event, id, data) => {
    try {
      const template = store.update('templates', id, data);
      if (!template) {
        throw new Error('템플릿을 찾을 수 없습니다');
      }

      console.log(`[IPC] Updated template: ${template.name}`);
      return template;
    } catch (error) {
      console.error('[IPC] templates:update error:', error);
      throw error;
    }
  });

  // 템플릿 삭제
  ipcMain.handle('templates:delete', async (event, id) => {
    try {
      const success = store.delete('templates', id);
      if (!success) {
        throw new Error('템플릿을 찾을 수 없습니다');
      }

      console.log(`[IPC] Deleted template: ${id}`);
      return { success: true };
    } catch (error) {
      console.error('[IPC] templates:delete error:', error);
      throw error;
    }
  });

  console.log('[IPC] Template handlers registered');
}

module.exports = { register };
