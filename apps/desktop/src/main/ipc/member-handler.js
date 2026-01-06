// 회원 관리 IPC 핸들러

/**
 * IPC 핸들러 등록
 * @param {object} ipcMain - Electron IPC 메인 모듈
 * @param {object} store - 초기화된 DataStore 인스턴스
 */
function register(ipcMain, store) {
  // 모든 회원 조회
  ipcMain.handle('members:getAll', async () => {
    try {
      return store.getAll('members');
    } catch (error) {
      console.error('[IPC] members:getAll error:', error);
      throw error;
    }
  });

  // 특정 카페 회원 조회
  ipcMain.handle('members:getByCafe', async (event, cafeId) => {
    try {
      return store.find('members', member => member.cafe_id === cafeId);
    } catch (error) {
      console.error('[IPC] members:getByCafe error:', error);
      throw error;
    }
  });

  // 회원 생성
  ipcMain.handle('members:create', async (event, data) => {
    try {
      const { cafe_id, nickname, member_key } = data;

      // 유효성 검사 (member_key 또는 nickname 필수)
      if (!nickname && !member_key) {
        throw new Error('닉네임 또는 member_key는 필수입니다');
      }

      // member_key 기반 중복 확인 (DB 스키마에서 UNIQUE 제약)
      if (member_key) {
        const existing = store.find('members', member => member.member_key === member_key);
        if (existing.length > 0) {
          throw new Error('이미 등록된 회원입니다');
        }
      }

      // 회원 생성
      const member = store.create('members', {
        cafe_id: cafe_id || null,
        nickname,
        member_key: member_key || null
      });

      console.log(`[IPC] Created member: ${nickname} (cafe: ${cafe_id}, key: ${member_key})`);
      return member;
    } catch (error) {
      console.error('[IPC] members:create error:', error);
      throw error;
    }
  });

  // 회원 업데이트
  ipcMain.handle('members:update', async (event, id, data) => {
    try {
      const member = store.update('members', id, data);
      if (!member) {
        throw new Error('회원을 찾을 수 없습니다');
      }

      console.log(`[IPC] Updated member: ${member.nickname}`);
      return member;
    } catch (error) {
      console.error('[IPC] members:update error:', error);
      throw error;
    }
  });

  // 회원 삭제
  ipcMain.handle('members:delete', async (event, id) => {
    try {
      const success = store.delete('members', id);
      if (!success) {
        throw new Error('회원을 찾을 수 없습니다');
      }

      console.log(`[IPC] Deleted member: ${id}`);
      return { success: true };
    } catch (error) {
      console.error('[IPC] members:delete error:', error);
      throw error;
    }
  });

  console.log('[IPC] Member handlers registered');
}

module.exports = { register };
