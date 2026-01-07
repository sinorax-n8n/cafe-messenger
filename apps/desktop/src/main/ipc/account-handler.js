// 계정 관리 IPC 핸들러 (네이버/다음 계정 지원)

const crypto = require('crypto');

// 비밀번호 암호화/복호화
const IV_LENGTH = 16;

/**
 * 암호화 키 생성 (고정 키 사용)
 * SHA-256으로 32바이트 키 생성
 */
function getEncryptionKey() {
  return crypto.createHash('sha256').update('cafe-messenger').digest();
}

/**
 * 비밀번호 암호화
 */
function encryptPassword(password) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(password, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * 비밀번호 복호화
 */
function decryptPassword(encryptedPassword) {
  const key = getEncryptionKey();
  const parts = encryptedPassword.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * IPC 핸들러 등록
 * @param {object} ipcMain - Electron IPC 메인 모듈
 * @param {object} store - 초기화된 DataStore 인스턴스
 */
function register(ipcMain, store) {
  // 모든 계정 조회
  ipcMain.handle('accounts:getAll', async () => {
    try {
      const accounts = store.getAll('accounts');
      // 비밀번호는 마스킹하여 반환 (보안)
      return accounts.map(account => ({
        ...account,
        account_password: '********' // 비밀번호 마스킹
      }));
    } catch (error) {
      console.error('[IPC] accounts:getAll error:', error);
      throw error;
    }
  });

  // 계정 생성
  ipcMain.handle('accounts:create', async (event, data) => {
    try {
      const { account_name, account_type, account_id, account_password } = data;

      // 유효성 검사
      if (!account_name || !account_id || !account_password) {
        throw new Error('필수 필드가 누락되었습니다');
      }

      // account_type 기본값
      const type = account_type || 'naver';

      // 다음 계정 이메일 형식 검증
      if (type === 'daum') {
        if (!account_id.includes('@') || !account_id.includes('.')) {
          throw new Error('다음 계정은 이메일 형식의 ID가 필요합니다');
        }
      }

      // 중복 확인
      const existing = store.find('accounts', acc => acc.account_id === account_id);
      if (existing.length > 0) {
        throw new Error('이미 등록된 계정 ID입니다');
      }

      // 비밀번호 암호화
      const encrypted_password = encryptPassword(account_password);

      // 계정 생성
      const account = store.create('accounts', {
        account_name,
        account_type: type,
        account_id,
        account_password: encrypted_password,
        is_active: 0 // 기본값: 비활성
      });

      console.log(`[IPC] Created account: ${account_name} (${type}: ${account_id})`);

      // 비밀번호 마스킹하여 반환
      return {
        ...account,
        account_password: '********'
      };
    } catch (error) {
      console.error('[IPC] accounts:create error:', error);
      throw error;
    }
  });

  // 계정 업데이트
  ipcMain.handle('accounts:update', async (event, id, data) => {
    try {
      const updates = { ...data };

      // 비밀번호 변경 시 암호화
      if (updates.account_password && updates.account_password !== '********') {
        updates.account_password = encryptPassword(updates.account_password);
      } else {
        delete updates.account_password; // 변경하지 않음
      }

      const account = store.update('accounts', id, updates);
      if (!account) {
        throw new Error('계정을 찾을 수 없습니다');
      }

      console.log(`[IPC] Updated account: ${account.account_name}`);

      // 비밀번호 마스킹하여 반환
      return {
        ...account,
        account_password: '********'
      };
    } catch (error) {
      console.error('[IPC] accounts:update error:', error);
      throw error;
    }
  });

  // 계정 삭제
  ipcMain.handle('accounts:delete', async (event, id) => {
    try {
      const success = store.delete('accounts', id);
      if (!success) {
        throw new Error('계정을 찾을 수 없습니다');
      }

      console.log(`[IPC] Deleted account: ${id}`);
      return { success: true };
    } catch (error) {
      console.error('[IPC] accounts:delete error:', error);
      throw error;
    }
  });

  // 활성 계정 설정
  ipcMain.handle('accounts:setActive', async (event, id) => {
    try {
      // 모든 계정 비활성화
      const allAccounts = store.getAll('accounts');
      allAccounts.forEach(account => {
        store.update('accounts', account.id, { is_active: 0 });
      });

      // 선택한 계정만 활성화
      const account = store.update('accounts', id, { is_active: 1 });
      if (!account) {
        throw new Error('계정을 찾을 수 없습니다');
      }

      console.log(`[IPC] Set active account: ${account.account_name}`);

      return {
        ...account,
        account_password: '********'
      };
    } catch (error) {
      console.error('[IPC] accounts:setActive error:', error);
      throw error;
    }
  });

  // 활성 계정의 비밀번호 복호화 (로그인 시 사용)
  ipcMain.handle('accounts:getActiveCredentials', async () => {
    try {
      const activeAccounts = store.find('accounts', acc => acc.is_active === 1);
      if (activeAccounts.length === 0) {
        return null;
      }

      const account = activeAccounts[0];
      return {
        account_type: account.account_type,
        account_id: account.account_id,
        account_password: decryptPassword(account.account_password)
      };
    } catch (error) {
      console.error('[IPC] accounts:getActiveCredentials error:', error);
      throw error;
    }
  });

  console.log('[IPC] Account handlers registered');
}

module.exports = { register };
