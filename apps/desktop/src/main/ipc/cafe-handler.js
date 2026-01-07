// 카페 링크 관리 IPC 핸들러

/**
 * URL에서 카페 유형 감지
 * @param {string} url - 카페 URL
 * @returns {string} 카페 유형 ('naver' 또는 'daum')
 */
function detectCafeType(url) {
  if (!url) return 'naver'
  const lowerUrl = url.toLowerCase()
  if (lowerUrl.includes('cafe.daum.net')) return 'daum'
  return 'naver'
}

/**
 * IPC 핸들러 등록
 * @param {object} ipcMain - Electron IPC 메인 모듈
 * @param {object} store - 초기화된 DataStore 인스턴스
 */
function register(ipcMain, store) {
  // 모든 카페 조회
  ipcMain.handle('cafes:getAll', async () => {
    try {
      return store.getAll('cafes');
    } catch (error) {
      console.error('[IPC] cafes:getAll error:', error);
      throw error;
    }
  });

  // 카페 생성
  ipcMain.handle('cafes:create', async (event, data) => {
    try {
      const { cafe_name, cafe_url, cafe_id } = data;

      // 유효성 검사
      if (!cafe_name || !cafe_url) {
        throw new Error('카페명과 URL은 필수입니다');
      }

      // 중복 확인
      const existing = store.find('cafes', cafe => cafe.cafe_url === cafe_url);
      if (existing.length > 0) {
        throw new Error('이미 등록된 카페 URL입니다');
      }

      // URL에서 카페 유형 자동 감지
      const cafe_type = detectCafeType(cafe_url);
      console.log(`[IPC] Detected cafe type: ${cafe_type} from URL: ${cafe_url}`);

      // 카페 생성
      const cafe = store.create('cafes', {
        cafe_name,
        cafe_type,
        cafe_url,
        cafe_id: cafe_id || null,
        is_active: 1 // 기본값: 활성
      });

      console.log(`[IPC] Created cafe: ${cafe_name}`);
      return cafe;
    } catch (error) {
      console.error('[IPC] cafes:create error:', error);
      throw error;
    }
  });

  // 카페 업데이트
  ipcMain.handle('cafes:update', async (event, id, data) => {
    try {
      const cafe = store.update('cafes', id, data);
      if (!cafe) {
        throw new Error('카페를 찾을 수 없습니다');
      }

      console.log(`[IPC] Updated cafe: ${cafe.cafe_name}`);
      return cafe;
    } catch (error) {
      console.error('[IPC] cafes:update error:', error);
      throw error;
    }
  });

  // 카페 삭제
  ipcMain.handle('cafes:delete', async (event, id) => {
    try {
      const success = store.delete('cafes', id);
      if (!success) {
        throw new Error('카페를 찾을 수 없습니다');
      }

      console.log(`[IPC] Deleted cafe: ${id}`);
      return { success: true };
    } catch (error) {
      console.error('[IPC] cafes:delete error:', error);
      throw error;
    }
  });

  // 활성 카페 목록 조회
  ipcMain.handle('cafes:getActive', async () => {
    try {
      return store.find('cafes', cafe => cafe.is_active === 1);
    } catch (error) {
      console.error('[IPC] cafes:getActive error:', error);
      throw error;
    }
  });

  console.log('[IPC] Cafe handlers registered');
}

module.exports = { register };
