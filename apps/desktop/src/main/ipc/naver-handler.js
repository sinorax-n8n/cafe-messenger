// 네이버 로그인 및 API 크롤링 IPC 핸들러
// BrowserWindow를 사용한 네이버 로그인, 쿠키 기반 API 크롤링

const { BrowserWindow, session, Notification } = require('electron')
const crypto = require('crypto')

// 비밀번호 암호화/복호화 (account-handler.js와 동일한 키 사용)
const IV_LENGTH = 16

/**
 * 암호화 키 생성 (고정 키 사용)
 * SHA-256으로 32바이트 키 생성
 */
function getEncryptionKey() {
  return crypto.createHash('sha256').update('cafe-messenger').digest()
}

/**
 * 비밀번호 복호화
 */
function decryptPassword(encryptedPassword) {
  const key = getEncryptionKey()
  const parts = encryptedPassword.split(':')
  const iv = Buffer.from(parts[0], 'hex')
  const encrypted = parts[1]
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

// 윈도우 인스턴스 (싱글톤)
let loginWindow = null
let messageWindow = null
let daumLoginWindow = null // 다음 로그인 윈도우
let getMainWindow = null // 함수로 변경

// DataStore 참조 (register 시 설정)
let dataStore = null

// 발송 중지 플래그
let isSendingCancelled = false

// 다음 카페 정보 임시 저장 (메모리)
let daumCafeInfoMap = new Map() // key: cafe.id, value: { grpid, fldid, cafeName }

// 다음(카카오) 쿠키 임시 저장 (메모리)
let daumCookieCache = {
  cookies: [],        // 쿠키 배열
  cookieString: '',   // API 호출용 쿠키 문자열
  savedAt: null,      // 저장 시간
  accountId: null     // 로그인한 계정 ID
}

// 네이버 URL
const NAVER_LOGIN_URL = 'https://nid.naver.com/nidlogin.login'
const NOTE_SEND_URL = 'https://note.naver.com/note/sendForm.nhn'

// 다음 URL
const DAUM_LOGIN_URL = 'https://logins.daum.net/accounts/oauth/login.do'

// 일일 발송 한도
const NAVER_DAILY_LIMIT = 50
const DAUM_DAILY_LIMIT = 20

/**
 * MainWindow getter 함수 설정
 */
function setMainWindowGetter(getter) {
  getMainWindow = getter
}

/**
 * MainWindow 참조 가져오기
 */
function getMainWindowRef() {
  return getMainWindow ? getMainWindow() : null
}

/**
 * 네이버 세션 쿠키 삭제 (계정 전환 전)
 */
async function clearNaverSession() {
  try {
    const ses = session.defaultSession

    // 네이버 관련 쿠키 삭제
    const cookies = await ses.cookies.get({ domain: '.naver.com' })
    for (const cookie of cookies) {
      const url = `https://${cookie.domain.replace(/^\./, '')}${cookie.path}`
      await ses.cookies.remove(url, cookie.name)
    }
    console.log(`[Naver] 세션 쿠키 ${cookies.length}개 삭제 완료`)
  } catch (error) {
    console.error('[Naver] 세션 삭제 실패:', error)
  }
}

/**
 * 발송 가능한 네이버 계정 검색 (한도 미달 계정 우선)
 * @param {number|null} excludeAccountId - 제외할 계정 ID (현재 계정)
 * @returns {{ account: object|null, remainingCount: number }} 발송 가능한 계정 및 남은 발송 가능 건수
 */
function findAvailableNaverAccount(excludeAccountId = null) {
  if (!dataStore) {
    console.error('[Naver] dataStore가 초기화되지 않았습니다')
    return { account: null, remainingCount: 0 }
  }

  const availableAccounts = dataStore.find('accounts', acc =>
    acc.account_type === 'naver' &&
    (excludeAccountId === null || acc.id !== excludeAccountId) &&
    (acc.today_sent_count === null ||
     acc.today_sent_count === undefined ||
     acc.today_sent_count < NAVER_DAILY_LIMIT)
  )

  if (availableAccounts.length === 0) {
    return { account: null, remainingCount: 0 }
  }

  // 발송 횟수가 적은 계정 우선 정렬
  availableAccounts.sort((a, b) =>
    (a.today_sent_count || 0) - (b.today_sent_count || 0)
  )

  const selected = availableAccounts[0]
  const remainingCount = NAVER_DAILY_LIMIT - (selected.today_sent_count || 0)

  return { account: selected, remainingCount }
}

/**
 * 로그인 완료 감지 핸들러 설정
 * @param {BrowserWindow} window - 로그인 윈도우
 */
function setupLoginCompleteHandler(window) {
  if (!window || window.isDestroyed()) return

  window.webContents.removeAllListeners('did-navigate')
  window.webContents.on('did-navigate', async (event, url) => {
    console.log('[Naver] 페이지 이동:', url)

    // 로그인 페이지가 아닌 곳으로 이동하면 로그인 성공으로 판단
    if (url.includes('naver.com') && !url.includes('nidlogin')) {
      const isLoggedIn = await checkLoginStatus()

      if (isLoggedIn) {
        console.log('[Naver] 로그인 성공 감지 - 창 자동 닫기')

        setTimeout(() => {
          getMainWindowRef()?.webContents.send('naver:loginComplete', {
            success: true
          })
          closeLoginWindow()
        }, 100)
      }
    }
  })
}

/**
 * 유니코드 이스케이프 문자열 디코딩
 * @param {string} str - 유니코드 이스케이프 문자열 (예: '\uC0BD\uB2E4\uB9AC')
 * @returns {string} 디코딩된 문자열 (예: '삽다리')
 */
function decodeUnicodeEscape(str) {
  return str.replace(/\\u([0-9A-Fa-f]{4})/g, (_, code) =>
    String.fromCharCode(parseInt(code, 16))
  )
}

/**
 * 다음 카페 created 문자열을 타임스탬프로 변환
 * @param {string} created - 'YY.MM.DD' 또는 'HH:MM' 형식
 * @returns {number} 타임스탬프 (밀리초)
 */
function parseDaumCreated(created) {
  if (!created) return Date.now()

  // 'HH:MM' 형식 (오늘 게시글)
  if (created.includes(':') && !created.includes('.')) {
    const today = new Date()
    const [hours, minutes] = created.split(':').map(Number)
    today.setHours(hours, minutes, 0, 0)
    return today.getTime()
  }

  // 'YY.MM.DD' 형식
  const parts = created.split('.')
  if (parts.length === 3) {
    const year = 2000 + parseInt(parts[0], 10)
    const month = parseInt(parts[1], 10) - 1
    const day = parseInt(parts[2], 10)
    return new Date(year, month, day).getTime()
  }

  return Date.now()
}

/**
 * 로그인 윈도우 생성
 */
function createLoginWindow() {
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.focus()
    return loginWindow
  }

  const mainWin = getMainWindowRef()
  loginWindow = new BrowserWindow({
    width: 500,
    height: 700,
    title: '네이버 로그인',
    parent: mainWin,
    modal: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  })

  // 윈도우 닫힐 때 참조 정리
  loginWindow.on('closed', () => {
    loginWindow = null
  })

  return loginWindow
}

/**
 * 로그인 윈도우 닫기
 */
function closeLoginWindow() {
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.close()
    loginWindow = null
  }
}

/**
 * 다음 로그인 윈도우 생성
 */
function createDaumLoginWindow() {
  if (daumLoginWindow && !daumLoginWindow.isDestroyed()) {
    daumLoginWindow.focus()
    return daumLoginWindow
  }

  const mainWin = getMainWindowRef()
  daumLoginWindow = new BrowserWindow({
    width: 500,
    height: 700,
    title: '다음 로그인',
    parent: mainWin,
    modal: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  })

  // 윈도우 닫힐 때 참조 정리
  daumLoginWindow.on('closed', () => {
    daumLoginWindow = null
  })

  return daumLoginWindow
}

/**
 * 다음 로그인 윈도우 닫기
 */
function closeDaumLoginWindow() {
  if (daumLoginWindow && !daumLoginWindow.isDestroyed()) {
    daumLoginWindow.close()
    daumLoginWindow = null
  }
}

/**
 * 다음 로그인 상태 확인 (쿠키 기반)
 */
async function checkDaumLoginStatus() {
  try {
    // 다음 인증 쿠키 확인 (HM_CU 또는 HTS)
    const cookies = await session.defaultSession.cookies.get({
      domain: '.daum.net'
    })
    // HM_CU 또는 HTS 쿠키가 있으면 로그인 상태로 판단
    const authCookie = cookies.find(c => c.name === 'HM_CU' || c.name === 'HTS')
    return authCookie !== undefined
  } catch (error) {
    console.error('[Daum] 로그인 상태 확인 실패:', error)
    return false
  }
}

/**
 * 쪽지 발송 윈도우 생성
 */
function createMessageWindow() {
  if (messageWindow && !messageWindow.isDestroyed()) {
    messageWindow.focus()
    return messageWindow
  }

  const mainWin = getMainWindowRef()
  messageWindow = new BrowserWindow({
    width: 600,
    height: 700,
    title: '쪽지 발송',
    parent: mainWin,
    modal: false,
    show: false, // 포커스 없이 표시하기 위해 초기 숨김
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  })

  // 팝업 창 차단
  messageWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  // 윈도우 닫힐 때 참조 정리
  messageWindow.on('closed', () => {
    messageWindow = null
  })

  return messageWindow
}

/**
 * 쪽지 발송 윈도우 닫기
 */
function closeMessageWindow() {
  if (messageWindow && !messageWindow.isDestroyed()) {
    messageWindow.close()
    messageWindow = null
  }
}

/**
 * BrowserWindow를 통한 쪽지 발송
 * @param {string} targetCafeMemberKey - 수신자 memberKey
 * @param {string} content - 메시지 내용
 * @param {number} retryCount - 재시도 횟수 (내부용)
 * @returns {Promise<object>} { success, error }
 */
async function sendMessageViaBrowser(targetCafeMemberKey, content, retryCount = 0) {
  const MAX_RETRIES = 2

  return new Promise(async (resolve) => {
    try {
      // 매 발송마다 기존 창을 닫고 새로 생성
      closeMessageWindow()

      // 창을 닫은 후 안정화 대기 (ERR_FAILED 방지) - 1초로 증가
      await new Promise(r => setTimeout(r, 1000))

      const window = createMessageWindow()
      window.showInactive() // 포커스 없이 창 표시
      const url = `${NOTE_SEND_URL}?popup=1&svcType=2&targetCafeMemberKey=${targetCafeMemberKey}`

      // 리다이렉트가 발생해도 최종 페이지 로드를 기다림
      await new Promise((resolveLoad, rejectLoad) => {
        const timeout = setTimeout(() => {
          rejectLoad(new Error('페이지 로드 타임아웃 (15초)'))
        }, 15000)

        window.webContents.once('did-finish-load', () => {
          clearTimeout(timeout)
          resolveLoad()
        })

        window.webContents.once('did-fail-load', (event, errorCode, errorDescription) => {
          // 리다이렉트로 인한 ERR_ABORTED는 무시
          if (errorCode === -3) {
            console.log('[Naver] 리다이렉트 감지 - 계속 대기')
            return
          }
          clearTimeout(timeout)
          rejectLoad(new Error(`페이지 로드 실패: ${errorDescription} (${errorCode})`))
        })

        window.loadURL(url).catch(() => {
          // loadURL 에러는 무시 (이벤트로 처리)
        })
      })

      console.log(`[Naver] 쪽지 발송 페이지 로드 완료: ${targetCafeMemberKey}`)

      // 페이지 로드 완료 후 안정화 대기
      await new Promise(r => setTimeout(r, 1000))

      // JavaScript alert/confirm 오버라이드 (알림창 자동 닫기)
      await window.webContents.executeJavaScript(`
        (function() {
          window.alert = function(msg) { console.log('[Alert 무시]', msg); };
          window.confirm = function(msg) { console.log('[Confirm 무시]', msg); return true; };
          return true;
        })();
      `)

      // 일일 발송 한도 확인 (oNote.todaySentCount)
      const limitCheck = await window.webContents.executeJavaScript(`
        (function() {
          if (typeof oNote !== 'undefined' && oNote.todaySentCount >= 50) {
            return { limitReached: true, count: oNote.todaySentCount };
          }
          return { limitReached: false, count: oNote?.todaySentCount || 0 };
        })();
      `)

      if (limitCheck.limitReached) {
        console.log(`[Naver] 일일 발송 한도 도달: ${limitCheck.count}건`)
        resolve({ success: false, error: '일일 발송 한도(50건) 도달', limitReached: true, count: limitCheck.count })
        return
      }

      console.log(`[Naver] 오늘 발송 건수: ${limitCheck.count}건`)

      // todaySentCount를 결과에 포함하기 위해 저장
      const todaySentCount = limitCheck.count

      // 특수문자 이스케이프 처리
      const escapeForJs = (str) => {
        return str
          .replace(/\\/g, '\\\\')
          .replace(/`/g, '\\`')
          .replace(/\$/g, '\\$')
      }

      const safeContent = escapeForJs(content)

      // 메시지 입력 및 발송
      const result = await window.webContents.executeJavaScript(`
        (function() {
          try {
            // 메시지 입력 영역 찾기 (id="writeNote")
            const textarea = document.getElementById('writeNote');

            if (textarea) {
              textarea.focus();
              textarea.value = \`${safeContent}\`;
              // 글자수 업데이트를 위해 이벤트 발생
              textarea.dispatchEvent(new Event('input', { bubbles: true }));
              textarea.dispatchEvent(new Event('keyup', { bubbles: true }));
              console.log('[AutoSend] 메시지 입력 완료');
            } else {
              console.error('[AutoSend] writeNote textarea를 찾을 수 없습니다');
              return { success: false, error: '메시지 입력 영역을 찾을 수 없습니다' };
            }

            // nWrite.clickSendMemo() 함수 직접 호출 (네이버 쪽지 발송 함수)
            if (typeof nWrite !== 'undefined' && typeof nWrite.clickSendMemo === 'function') {
              nWrite.clickSendMemo();
              console.log('[AutoSend] nWrite.clickSendMemo() 호출');
              return { success: true };
            }

            // 함수 호출 실패 시 버튼 클릭 시도
            const sendButton = document.querySelector('a._click\\\\(nWrite\\\\|clickSendMemo\\\\)') ||
                              document.querySelector('.btns a.button.b');

            if (sendButton) {
              sendButton.click();
              console.log('[AutoSend] 발송 버튼 클릭');
              return { success: true };
            } else {
              console.error('[AutoSend] 발송 버튼을 찾을 수 없습니다');
              return { success: false, error: '발송 버튼을 찾을 수 없습니다' };
            }
          } catch (e) {
            return { success: false, error: e.message };
          }
        })();
      `)

      if (!result.success) {
        console.error(`[Naver] 쪽지 발송 실패: ${result.error}`)
        resolve({ success: false, error: result.error })
        return
      }

      console.log(`[Naver] 쪽지 발송 요청 완료: ${targetCafeMemberKey}`)

      // 발송 후 CAPTCHA 확인을 위해 대기
      await new Promise(r => setTimeout(r, 1000))

      // 창이 파괴되었는지 확인 (발송 성공 후 창이 닫히는 경우)
      if (!window || window.isDestroyed()) {
        console.log(`[Naver] 발송 완료 (창 자동 닫힘)`)
        resolve({ success: true, todaySentCount: todaySentCount + 1 })
        return
      }

      // CAPTCHA 레이어 확인
      let captchaCheck = { hasCaptcha: false }
      try {
        captchaCheck = await window.webContents.executeJavaScript(`
          (function() {
            const captchaLayer = document.getElementById('note_captcha');
            if (captchaLayer && captchaLayer.style.display !== 'none') {
              return { hasCaptcha: true };
            }
            return { hasCaptcha: false };
          })();
        `)
      } catch (jsError) {
        // executeJavaScript 실패 = 창이 닫혔거나 페이지 변경됨 = 발송 성공
        console.log(`[Naver] 발송 완료 (페이지 변경됨)`)
        resolve({ success: true, todaySentCount: todaySentCount + 1 })
        return
      }

      if (captchaCheck.hasCaptcha) {
        console.log(`[Naver] CAPTCHA 감지됨 - 사용자 입력 대기`)

        // CAPTCHA 입력을 위해 창에 포커스 부여
        window.focus()

        // 시스템 알림 표시 (Slack 스타일)
        if (Notification.isSupported()) {
          const notification = new Notification({
            title: '⚠️ CAPTCHA 입력 필요',
            body: '쪽지 발송을 계속하려면 보안문자를 입력해주세요.',
            urgency: 'critical',
            silent: false
          })
          notification.show()

          // 알림 클릭 시 쪽지 발송 창으로 포커스
          notification.on('click', () => {
            if (window && !window.isDestroyed()) {
              window.focus()
            }
          })
        }

        // UI에 CAPTCHA 알림 전송
        getMainWindowRef()?.webContents.send('naver:captchaRequired', {
          memberKey: targetCafeMemberKey
        })

        // 사용자가 CAPTCHA 입력할 때까지 무제한 대기
        const checkInterval = 2000  // 2초마다 체크
        let waitedTime = 0

        console.log(`[Naver] CAPTCHA 대기 시작 (사용자 입력 완료까지 무제한 대기)`)

        while (true) {
          await new Promise(r => setTimeout(r, checkInterval))
          waitedTime += checkInterval

          // 30초마다 로그 출력 (너무 많은 로그 방지)
          if (waitedTime % 30000 === 0) {
            console.log(`[Naver] CAPTCHA 대기 중... (${waitedTime / 1000}초 경과)`)
          }

          // 창이 닫혔거나 파괴되었으면 성공으로 처리 (발송 완료 후 창이 닫힘)
          if (!window || window.isDestroyed()) {
            console.log(`[Naver] CAPTCHA 처리 완료 (창 닫힘)`)
            getMainWindowRef()?.webContents.send('naver:captchaResolved', {
              memberKey: targetCafeMemberKey
            })
            resolve({ success: true, todaySentCount: todaySentCount + 1 })
            return
          }

          try {
            // 현재 URL 확인 (페이지 이동 감지)
            const currentUrl = window.webContents.getURL()
            console.log(`[Naver] 현재 URL: ${currentUrl}`)

            // 발송 완료 페이지로 이동했는지 확인
            if (currentUrl.includes('sendComplete') || currentUrl.includes('success')) {
              console.log(`[Naver] CAPTCHA 처리 완료 (발송 완료 페이지로 이동)`)
              getMainWindowRef()?.webContents.send('naver:captchaResolved', {
                memberKey: targetCafeMemberKey
              })
              resolve({ success: true, todaySentCount: todaySentCount + 1 })
              return
            }

            // CAPTCHA 레이어가 사라졌는지 확인
            const checkResult = await window.webContents.executeJavaScript(`
              (function() {
                const captchaLayer = document.getElementById('note_captcha');
                const captchaVisible = captchaLayer && captchaLayer.style.display !== 'none';
                console.log('[CAPTCHA Check] Layer:', captchaLayer, 'Visible:', captchaVisible);
                return {
                  captchaGone: !captchaVisible,
                  hasLayer: !!captchaLayer,
                  display: captchaLayer?.style?.display
                };
              })();
            `)

            console.log(`[Naver] CAPTCHA 체크 결과:`, checkResult)

            if (checkResult.captchaGone) {
              console.log(`[Naver] CAPTCHA 처리 완료 (레이어 사라짐)`)
              getMainWindowRef()?.webContents.send('naver:captchaResolved', {
                memberKey: targetCafeMemberKey
              })
              resolve({ success: true, todaySentCount: todaySentCount + 1 })
              return
            }
          } catch (jsError) {
            console.log(`[Naver] CAPTCHA 체크 중 오류 (계속 대기):`, jsError.message)
            // 오류 발생해도 계속 대기 (페이지가 아직 로딩 중일 수 있음)
            continue
          }
        }
        // while(true)이므로 여기 도달하지 않음
      }

      // CAPTCHA 없이 성공
      resolve({ success: true, todaySentCount: todaySentCount + 1 }) // 발송 성공 시 +1

    } catch (error) {
      console.error('[Naver] sendMessageViaBrowser 실패:', error)

      // ERR_FAILED (-2) 또는 ERR_ABORTED (-3) 오류 시 재시도
      if ((error.code === 'ERR_FAILED' || error.code === 'ERR_ABORTED') && retryCount < MAX_RETRIES) {
        console.log(`[Naver] 재시도 ${retryCount + 1}/${MAX_RETRIES}...`)
        closeMessageWindow()
        await new Promise(r => setTimeout(r, 2000)) // 재시도 전 2초 대기
        const retryResult = await sendMessageViaBrowser(targetCafeMemberKey, content, retryCount + 1)
        resolve(retryResult)
        return
      }

      resolve({ success: false, error: error.message })
    }
  })
}

/**
 * 로그인 상태 확인 (쿠키 기반)
 */
async function checkLoginStatus() {
  try {
    const cookies = await session.defaultSession.cookies.get({
      domain: '.naver.com',
      name: 'NID_AUT'
    })
    return cookies.length > 0
  } catch (error) {
    console.error('[Naver] 로그인 상태 확인 실패:', error)
    return false
  }
}

/**
 * 카페 URL 파싱 - cafeId, categoryId 추출
 * URL 형식: https://cafe.naver.com/f-e/cafes/{cafeId}/menus/{categoryId}
 */
function parseCafeUrl(url) {
  const regex = /cafe\.naver\.com\/f-e\/cafes\/(\d+)\/menus\/(\d+)/
  const match = url.match(regex)
  if (match) {
    return { cafeId: match[1], categoryId: match[2] }
  }
  return null
}

/**
 * API로 카페 게시글 크롤링
 */
async function crawlArticles(cafeId, categoryId, page = 1) {
  const apiUrl = `https://apis.naver.com/cafe-web/cafe-boardlist-api/v1/cafes/${cafeId}/menus/${categoryId}/articles?page=${page}&pageSize=15&sortBy=TIME&viewType=L`

  try {
    // 네이버 쿠키 가져오기
    const cookies = await session.defaultSession.cookies.get({ domain: '.naver.com' })
    const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ')

    const response = await fetch(apiUrl, {
      headers: {
        'Cookie': cookieString,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': `https://cafe.naver.com/f-e/cafes/${cafeId}/menus/${categoryId}`
      }
    })

    if (!response.ok) {
      throw new Error(`API 응답 오류: ${response.status}`)
    }

    const data = await response.json()
    return data
  } catch (error) {
    console.error('[Naver] API 크롤링 실패:', error)
    throw error
  }
}


/**
 * 게시글에서 작성자 정보 추출
 * API 응답 구조: articleList[].item.{writerInfo.{nickName, memberKey}, writeDateTimestamp}
 */
function extractMembers(articles) {
  const members = []

  if (!articles || !Array.isArray(articles)) {
    return members
  }

  for (const article of articles) {
    // 실제 API 응답 구조: article.item
    const item = article.item
    const writerInfo = item?.writerInfo

    if (writerInfo) {
      const nickName = writerInfo.nickName
      const memberKey = writerInfo.memberKey
      const writeDateTimestamp = item?.writeDateTimestamp

      if (nickName && memberKey) {
        members.push({
          nickName,
          memberKey,
          writeDate: writeDateTimestamp ? new Date(writeDateTimestamp).toISOString() : null,
          writeDateTimestamp: writeDateTimestamp || null
        })
      }
    }
  }

  return members
}

/**
 * 날짜 필터 계산 - 선택된 기간의 최소 타임스탬프 반환
 * @param {string} datePeriod - '1day', '2days', '3days', '1week', '1month'
 * @returns {number|null} 최소 타임스탬프 (밀리초)
 */
function getDateFilter(datePeriod) {
  if (!datePeriod) return null

  const now = Date.now()
  const periods = {
    '1day': 1 * 24 * 60 * 60 * 1000,
    '2days': 2 * 24 * 60 * 60 * 1000,
    '3days': 3 * 24 * 60 * 60 * 1000,
    '1week': 7 * 24 * 60 * 60 * 1000,
    '1month': 30 * 24 * 60 * 60 * 1000
  }

  return now - (periods[datePeriod] || 0)
}

/**
 * IPC 핸들러 등록
 * @param {object} ipcMain - Electron IPC 메인 모듈
 * @param {function} mainWindowGetter - 메인 윈도우 참조 함수
 * @param {object} store - 초기화된 DataStore 인스턴스
 */
function register(ipcMain, mainWindowGetter, store) {
  setMainWindowGetter(mainWindowGetter)
  dataStore = store // 모듈 레벨에서 접근 가능하도록 저장

  // 로그인 창 열기
  ipcMain.handle('naver:openLogin', async () => {
    try {
      const window = createLoginWindow()
      await window.loadURL(NAVER_LOGIN_URL)

      // 기존 이벤트 핸들러 제거 후 새로 등록 (중복 방지)
      window.webContents.removeAllListeners('did-navigate')

      // 페이지 이동 감지하여 로그인 성공 확인
      window.webContents.on('did-navigate', async (event, url) => {
        console.log('[Naver] 페이지 이동:', url)

        // 로그인 페이지가 아닌 곳으로 이동하면 로그인 성공으로 판단
        if (url.includes('naver.com') && !url.includes('nidlogin')) {
          const isLoggedIn = await checkLoginStatus()
          getMainWindowRef()?.webContents.send('naver:loginStatusChanged', isLoggedIn)

          if (isLoggedIn) {
            console.log('[Naver] 로그인 성공 감지 - 창 자동 닫기')

            // 1초 후 로그인 창 닫기 (사용자가 성공 화면을 잠시 볼 수 있도록)
            setTimeout(() => {
               // Renderer에 로그인 완료 이벤트 전송
              getMainWindowRef()?.webContents.send('naver:loginComplete', {
                success: true
              })
              closeLoginWindow()
            }, 100)
          }
        }
      })

      console.log('[Naver] 로그인 창 열림')
      return { success: true }
    } catch (error) {
      console.error('[Naver] openLogin 실패:', error)
      throw error
    }
  })

  // 로그인 창 닫기
  ipcMain.handle('naver:closeWindow', async () => {
    try {
      closeLoginWindow()
      console.log('[Naver] 로그인 창 닫힘')
      return { success: true }
    } catch (error) {
      console.error('[Naver] closeWindow 실패:', error)
      throw error
    }
  })

  // 로그인 상태 확인
  ipcMain.handle('naver:checkLogin', async () => {
    return await checkLoginStatus()
  })

  // 자동 로그인 실행 (발송 여유가 있는 계정 자동 선택)
  ipcMain.handle('naver:autoLogin', async (event, credentials) => {
    try {
      if (!loginWindow || loginWindow.isDestroyed()) {
        createLoginWindow()
        await loginWindow.loadURL(NAVER_LOGIN_URL)
        // 페이지 로드 대기
        await new Promise(resolve => setTimeout(resolve, 1000))
      }

      // 네이버 일일 발송 한도
      const NAVER_DAILY_LIMIT = 50

      // credentials가 없으면 DB에서 발송 가능한 네이버 계정 자동 조회
      let account_id, account_password
      let selectedAccount = null

      if (credentials && credentials.account_id) {
        // 기존 방식: 전달받은 credentials 사용
        account_id = credentials.account_id
        account_password = credentials.account_password
        console.log('[Naver] 전달받은 계정으로 자동 로그인:', account_id)
      } else {
        // 새 방식: 발송 여유가 있는 계정 자동 선택
        console.log('[Naver] 발송 가능한 네이버 계정 자동 탐색 중...')

        const naverAccounts = store.find('accounts', acc =>
          acc.account_type === 'naver' &&
          (acc.today_sent_count === null || acc.today_sent_count === undefined || acc.today_sent_count < NAVER_DAILY_LIMIT)
        )

        if (naverAccounts.length === 0) {
          console.log('[Naver] 발송 가능한 네이버 계정이 없습니다')
          // UI에 알림 전송
          getMainWindowRef()?.webContents.send('naver:noAvailableAccount', {
            message: '발송 가능한 네이버 계정이 없습니다.\n모든 계정이 일일 발송 한도(50건)에 도달했습니다.'
          })
          return { success: false, error: '발송 가능한 네이버 계정이 없습니다', noAvailableAccount: true }
        }

        // 발송 가능 건수가 가장 많은 계정 선택 (null/undefined는 0으로 처리)
        naverAccounts.sort((a, b) => {
          const aCount = a.today_sent_count || 0
          const bCount = b.today_sent_count || 0
          return aCount - bCount // 발송 횟수가 적은 계정 우선
        })

        selectedAccount = naverAccounts[0]
        const remainingCount = NAVER_DAILY_LIMIT - (selectedAccount.today_sent_count || 0)
        console.log(`[Naver] 자동 선택 계정: ${selectedAccount.account_name} (발송 가능: ${remainingCount}건)`)

        account_id = selectedAccount.account_id
        // 비밀번호 복호화
        account_password = decryptPassword(selectedAccount.account_password)
      }

      // 특수문자 이스케이프 처리
      const escapeForJs = (str) => {
        return str
          .replace(/\\/g, '\\\\')
          .replace(/'/g, "\\'")
          .replace(/"/g, '\\"')
          .replace(/\n/g, '\\n')
          .replace(/\r/g, '\\r')
      }

      const safeId = escapeForJs(account_id)
      const safePw = escapeForJs(account_password)

      // JavaScript로 폼 필드 채우기 (아이디, 비밀번호 입력만)
      await loginWindow.webContents.executeJavaScript(`
        (function() {
          const idInput = document.getElementById('id');
          const pwInput = document.getElementById('pw');

          if (idInput && pwInput) {
            // 아이디 입력
            idInput.focus();
            idInput.value = '${safeId}';
            idInput.dispatchEvent(new Event('input', { bubbles: true }));

            // 비밀번호 입력
            pwInput.focus();
            pwInput.value = '${safePw}';
            pwInput.dispatchEvent(new Event('input', { bubbles: true }));
          } else {
            console.error('[AutoLogin] 입력 필드를 찾을 수 없습니다');
          }
        })();
      `)

      console.log('[Naver] 아이디/비밀번호 자동 입력 완료')

      // 로그인 완료 감지를 위한 네비게이션 이벤트 등록
      loginWindow.webContents.removeAllListeners('did-navigate')
      loginWindow.webContents.on('did-navigate', async (event, url) => {
        console.log('[Naver] autoLogin 페이지 이동:', url)

        // 로그인 페이지가 아닌 곳으로 이동하면 로그인 성공으로 판단
        if (url.includes('naver.com') && !url.includes('nidlogin')) {
          const isLoggedIn = await checkLoginStatus()

          if (isLoggedIn) {
            console.log('[Naver] autoLogin 로그인 성공 감지 - 창 자동 닫기')

            setTimeout(() => {
              getMainWindowRef()?.webContents.send('naver:loginComplete', {
                success: true
              })
              closeLoginWindow()
            }, 100)
          }
        }
      })

      return {
        success: true,
        accountName: selectedAccount?.account_name,
        accountId: account_id
      }
    } catch (error) {
      console.error('[Naver] autoLogin 실패:', error)
      throw error
    }
  })

  // API 기반 크롤링 시작 (날짜 필터링 지원)
  ipcMain.handle('naver:startCrawling', async (event, options = {}) => {
    try {
      const { datePeriod } = options

      // 탐색 기한 필수 체크
      if (!datePeriod) {
        throw new Error('탐색 기한을 선택해주세요.')
      }

      // 활성화된 카페 목록 조회
      const cafes = store.find('cafes', cafe => cafe.is_active === 1)
      if (cafes.length === 0) {
        throw new Error('활성화된 카페가 없습니다. 카페 관리에서 카페를 추가하세요.')
      }

      // 날짜 필터 계산
      const minTimestamp = getDateFilter(datePeriod)
      const now = new Date()
      console.log(`[Naver] 현재 시간: ${now.toISOString()} (KST: ${now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })})`)
      console.log(`[Naver] 탐색 기한: ${datePeriod}, 최소 타임스탬프: ${new Date(minTimestamp).toISOString()} (KST: ${new Date(minTimestamp).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })})`)

      // DB에 이미 등록된 회원 목록 조회 (제외 대상)
      const existingMembers = store.getAll('members')
      const existingMemberKeys = new Set(existingMembers.map(m => m.member_key))
      console.log(`[Naver] DB에 등록된 회원 수: ${existingMemberKeys.size}명 (제외 대상)`)

      const collectedMembers = new Map() // 중복 제거용 Map (memberKey를 키로)
      let totalProcessed = 0

      for (const cafe of cafes) {
        // URL 파싱
        const parsed = parseCafeUrl(cafe.cafe_url)
        if (!parsed) {
          console.log(`[Naver] URL 파싱 실패: ${cafe.cafe_url}`)
          continue
        }

        console.log(`[Naver] 크롤링 시작: ${cafe.cafe_name} (cafeId: ${parsed.cafeId}, categoryId: ${parsed.categoryId})`)

        // 페이지네이션 크롤링
        let page = 1
        const maxPages = 100 // 기간 내 모든 게시글 수집을 위해 페이지 제한 증가
        let reachedDateLimit = false

        while (page <= maxPages && !reachedDateLimit) {
          try {
            const data = await crawlArticles(parsed.cafeId, parsed.categoryId, page)

            // 디버깅: API 응답 구조 확인
            console.log(`[Naver] API 응답 키:`, Object.keys(data))
            if (data.result) {
              console.log(`[Naver] result 키:`, Object.keys(data.result))
            }

            // API 응답에서 게시글 배열 찾기
            const articles = data.result?.articleList || data.articleList || data.articles || []

            // 디버깅: 첫 번째 게시글 구조 확인
            if (articles.length > 0 && page === 1) {
              console.log(`[Naver] 첫 번째 게시글 구조:`, JSON.stringify(articles[0], null, 2).substring(0, 500))
            }

            if (articles.length === 0) {
              console.log(`[Naver] 더 이상 게시글 없음 (page ${page})`)
              break
            }

            const members = extractMembers(articles)

            for (const member of members) {
              // 디버깅: 게시글 날짜 정보 출력
              if (member.writeDateTimestamp) {
                const writeDate = new Date(member.writeDateTimestamp)
                console.log(`[Naver] 게시글 날짜: ${writeDate.toISOString()} (KST: ${writeDate.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}) - ${member.nickName}`)
              }

              // 날짜 필터링: 기간 외 게시글은 스킵
              if (member.writeDateTimestamp && member.writeDateTimestamp < minTimestamp) {
                // 시간순 정렬이므로 기간 외 게시글이 나오면 이후 페이지도 모두 기간 외
                console.log(`[Naver] 기간 외 게시글 도달 - 게시글: ${new Date(member.writeDateTimestamp).toISOString()}, 기준: ${new Date(minTimestamp).toISOString()}`)
                reachedDateLimit = true
                break
              }

              // DB에 이미 등록된 회원인지 확인
              if (existingMemberKeys.has(member.memberKey)) {
                console.log(`[Naver] DB 등록 회원 스킵: ${member.nickName} (${member.memberKey.substring(0, 8)}...)`)
                continue
              }

              // 중복 체크
              if (!collectedMembers.has(member.memberKey)) {
                // 카페 정보 추가
                member.cafeId = cafe.id
                member.cafeName = cafe.cafe_name
                collectedMembers.set(member.memberKey, member)

                // 진행 상황 알림
                getMainWindowRef()?.webContents.send('naver:crawlProgress', {
                  current: collectedMembers.size,
                  member: member,
                  cafe: cafe.cafe_name,
                  datePeriod: datePeriod
                })
              }
            }

            totalProcessed += articles.length
            page++

            // Rate limiting - 500ms 딜레이
            await new Promise(resolve => setTimeout(resolve, 500))

          } catch (pageError) {
            console.error(`[Naver] 페이지 ${page} 크롤링 오류:`, pageError)
            break
          }
        }

        if (reachedDateLimit) {
          console.log(`[Naver] ${cafe.cafe_name} 카페 탐색 완료 (기간 제한 도달)`)
        }
      }

      const resultMembers = Array.from(collectedMembers.values())
      console.log(`[Naver] 크롤링 완료: ${resultMembers.length}명 (${datePeriod} 이내)`)

      // 크롤링 완료 알림
      getMainWindowRef()?.webContents.send('naver:crawlComplete', {
        success: true,
        count: resultMembers.length,
        members: resultMembers,
        datePeriod: datePeriod
      })

      return { success: true, members: resultMembers }
    } catch (error) {
      console.error('[Naver] startCrawling 실패:', error)

      getMainWindowRef()?.webContents.send('naver:crawlComplete', {
        success: false,
        error: error.message
      })

      throw error
    }
  })

  // 발송 중지
  ipcMain.handle('naver:stopSending', async () => {
    console.log('[Naver] 발송 중지 요청 수신')
    isSendingCancelled = true

    // 메시지 윈도우 닫기
    closeMessageWindow()

    return { success: true }
  })

  // 대량 쪽지 발송 시작 (BrowserWindow 기반)
  ipcMain.handle('naver:startSending', async (event, { members, content }) => {
    try {
      // 발송 시작 시 취소 플래그 초기화
      isSendingCancelled = false

      const isLoggedIn = await checkLoginStatus()
      if (!isLoggedIn) {
        throw new Error('로그인이 필요합니다')
      }

      if (members.length === 0) {
        throw new Error('발송할 회원이 없습니다')
      }

      console.log(`[Naver] 대량 발송 시작 (BrowserWindow): ${members.length}명, 내용 길이: ${content.length}자`)

      const results = {
        success: 0,
        failed: 0
      }

      // 현재 발송 건수 추적 (각 발송 결과에서 업데이트됨)
      let currentTodaySentCount = 0

      // 발송 시작 전 todaySentCount 조회 (첫 번째 회원의 sendForm 페이지 접근)
      try {
        console.log('[Naver] 초기 todaySentCount 조회 중...')
        const initWindow = createMessageWindow()
        const firstMember = members[0]
        const initUrl = `${NOTE_SEND_URL}?popup=1&svcType=2&targetCafeMemberKey=${firstMember.memberKey}`

        // 리다이렉트가 발생해도 최종 페이지 로드를 기다림
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('페이지 로드 타임아웃 (10초)'))
          }, 10000)

          initWindow.webContents.once('did-finish-load', () => {
            clearTimeout(timeout)
            resolve()
          })

          initWindow.webContents.once('did-fail-load', (event, errorCode, errorDescription) => {
            // 리다이렉트로 인한 ERR_ABORTED는 무시 (did-finish-load가 이어서 발생함)
            if (errorCode === -3) {
              console.log('[Naver] 리다이렉트 감지 - 계속 대기')
              return
            }
            clearTimeout(timeout)
            reject(new Error(`페이지 로드 실패: ${errorDescription} (${errorCode})`))
          })

          initWindow.loadURL(initUrl).catch(() => {
            // loadURL 에러는 무시 (이벤트로 처리)
          })
        })

        await new Promise(r => setTimeout(r, 1000))

        const initCheck = await initWindow.webContents.executeJavaScript(`
          (function() {
            if (typeof oNote !== 'undefined') {
              return { count: oNote.todaySentCount || 0 };
            }
            return { count: 0 };
          })();
        `)

        currentTodaySentCount = initCheck.count
        console.log(`[Naver] 초기 todaySentCount: ${currentTodaySentCount}건`)

        // 초기 조회 시에도 DB 동기화 (네이버 계정만)
        const activeAccount = store.findOne('accounts', { is_active: 1, account_type: 'naver' })
        if (activeAccount) {
          store.setSentCount(activeAccount.id, currentTodaySentCount)
          console.log(`[Naver] 계정 발송 현황 초기 동기화: ${activeAccount.account_name} → ${currentTodaySentCount}건`)
        }

        // 초기 조회 후 창 닫기
        closeMessageWindow()

        // 이미 50건 이상이면 다른 계정 검색
        if (currentTodaySentCount >= 50) {
          console.log(`[Naver] 일일 발송 한도 이미 도달 - 다른 계정 검색`)

          // 현재 활성 계정 확인
          const currentAccount = store.findOne('accounts', { is_active: 1, account_type: 'naver' })

          // 발송 가능한 다른 네이버 계정 검색 (한도 50건 미만)
          const NAVER_DAILY_LIMIT = 50
          const availableAccounts = store.find('accounts', acc =>
            acc.account_type === 'naver' &&
            acc.id !== currentAccount?.id &&
            (acc.today_sent_count === null ||
             acc.today_sent_count === undefined ||
             acc.today_sent_count < NAVER_DAILY_LIMIT)
          )

          if (availableAccounts.length > 0) {
            // 발송 가능한 다른 계정 있음 → 계정 전환
            const nextAccount = availableAccounts.sort((a, b) =>
              (a.today_sent_count || 0) - (b.today_sent_count || 0)
            )[0]

            console.log(`[Naver] 전환할 계정 발견: ${nextAccount.account_name} (현재 ${nextAccount.today_sent_count || 0}건)`)

            // 세션 쿠키 삭제 (새 계정으로 깨끗하게 로그인)
            await clearNaverSession()

            // 계정 전환 필요 이벤트 전송
            getMainWindowRef()?.webContents.send('naver:accountSwitchRequired', {
              nextAccountId: nextAccount.id,
              nextAccountName: nextAccount.account_name,
              remainingMembers: members,
              currentResults: { success: 0, failed: 0 },
              templateContent: content
            })

            return {
              success: false,
              accountSwitchRequired: true,
              results: results
            }
          }

          // 모든 계정 한도 도달
          console.log('[Naver] 모든 네이버 계정 한도 도달 - 발송 불가')

          getMainWindowRef()?.webContents.send('naver:sendLimitReached', {
            count: currentTodaySentCount,
            current: 0,
            total: members.length,
            todaySentCount: currentTodaySentCount
          })

          getMainWindowRef()?.webContents.send('naver:noAvailableAccount', {
            message: '모든 네이버 계정이 일일 발송 한도(50건)에 도달했습니다.',
            results: results
          })

          getMainWindowRef()?.webContents.send('naver:sendComplete', {
            success: false,
            error: '일일 발송 한도(50건) 도달',
            limitReached: true,
            results: results
          })

          return { success: false, error: '일일 발송 한도(50건) 도달', limitReached: true, results }
        }
      } catch (initError) {
        console.error('[Naver] 초기 todaySentCount 조회 실패:', initError)

        // 초기 조회 실패 시 세션 만료로 간주하고 발송 중단
        closeMessageWindow()

        getMainWindowRef()?.webContents.send('naver:sendComplete', {
          success: false,
          error: '네이버 세션이 만료되었습니다. 다시 로그인해주세요.',
          sessionExpired: true,
          results: results
        })

        return { success: false, error: '네이버 세션 만료', sessionExpired: true, results }
      }

      // 초기 상태를 UI에 전송
      getMainWindowRef()?.webContents.send('naver:sendProgress', {
        current: 0,
        total: members.length,
        member: null,
        initialInfo: true,
        todaySentCount: currentTodaySentCount
      })

      const total = members.length

      for (let i = 0; i < members.length; i++) {
        // 발송 중지 요청 확인
        if (isSendingCancelled) {
          console.log(`[Naver] 발송 중지됨 - ${i}/${total} 완료`)

          // 메시지 윈도우 닫기
          closeMessageWindow()

          // 발송 중지 이벤트 전송
          getMainWindowRef()?.webContents.send('naver:sendComplete', {
            success: false,
            error: '사용자가 발송을 중지했습니다',
            cancelled: true,
            results: results
          })

          return { success: false, cancelled: true, results }
        }

        const member = members[i]

        console.log(`[Naver] 발송 중 (${i + 1}/${total}): ${member.nickName}`)

        // BrowserWindow를 통한 쪽지 발송
        const result = await sendMessageViaBrowser(member.memberKey, content)

        if (result.success) {
          results.success++

          // 발송 결과에서 todaySentCount 업데이트
          if (result.todaySentCount !== undefined) {
            currentTodaySentCount = result.todaySentCount
          }

          // 활성 네이버 계정의 발송 카운트 동기화 (네이버 서버 값으로 DB 저장)
          const activeAccount = store.findOne('accounts', { is_active: 1, account_type: 'naver' })
          if (activeAccount && currentTodaySentCount !== undefined) {
            store.setSentCount(activeAccount.id, currentTodaySentCount)
            console.log(`[Naver] 계정 발송 현황 동기화: ${activeAccount.account_name} → ${currentTodaySentCount}건`)
          }

          // 발송 완료 회원 DB에 저장
          try {
            store.create('members', {
              cafe_id: member.cafeId || null,
              nickname: member.nickName,
              member_key: member.memberKey
            })
            console.log(`[Naver] 회원 DB 저장 완료: ${member.nickName}`)
          } catch (dbError) {
            // 중복 회원 등 DB 오류는 무시 (이미 저장된 경우)
            console.log(`[Naver] 회원 DB 저장 스킵: ${member.nickName} (${dbError.message})`)
          }

          // 진행 상황 전송 (성공)
          getMainWindowRef()?.webContents.send('naver:sendProgress', {
            current: i + 1,
            total: total,
            member: member,
            memberKey: member.memberKey,
            success: true,
            todaySentCount: currentTodaySentCount
          })

          // 다음 발송 전 5~6초 랜덤 대기 (Rate limiting)
          if (i < members.length - 1) {
            const delay = 5000 + Math.random() * 1000 // 5000~6000ms
            console.log(`[Naver] 다음 발송까지 ${(delay / 1000).toFixed(1)}초 대기`)
            await new Promise(r => setTimeout(r, delay))
          }
        } else {
          results.failed++

          // 일일 발송 한도 도달 시 다른 계정 검색
          if (result.limitReached) {
            console.log(`[Naver] 일일 발송 한도 도달 - 다른 계정 검색`)

            // 한도 도달 시 todaySentCount 업데이트
            if (result.count !== undefined) {
              currentTodaySentCount = result.count
            }

            // 현재 활성 계정 확인
            const currentAccount = store.findOne('accounts', { is_active: 1, account_type: 'naver' })

            // 발송 가능한 다른 네이버 계정 검색 (한도 50건 미만)
            const NAVER_DAILY_LIMIT = 50
            const availableAccounts = store.find('accounts', acc =>
              acc.account_type === 'naver' &&
              acc.id !== currentAccount?.id &&
              (acc.today_sent_count === null ||
               acc.today_sent_count === undefined ||
               acc.today_sent_count < NAVER_DAILY_LIMIT)
            )

            if (availableAccounts.length > 0) {
              // 발송 가능한 다른 계정 있음 → 계정 전환
              const nextAccount = availableAccounts.sort((a, b) =>
                (a.today_sent_count || 0) - (b.today_sent_count || 0)
              )[0]

              console.log(`[Naver] 전환할 계정 발견: ${nextAccount.account_name} (현재 ${nextAccount.today_sent_count || 0}건)`)

              // 메시지 윈도우 닫기
              closeMessageWindow()

              // 세션 쿠키 삭제 (새 계정으로 깨끗하게 로그인)
              await clearNaverSession()

              // 남은 회원 목록
              const remainingMembers = members.slice(i)

              // 계정 전환 필요 이벤트 전송
              getMainWindowRef()?.webContents.send('naver:accountSwitchRequired', {
                nextAccountId: nextAccount.id,
                nextAccountName: nextAccount.account_name,
                remainingMembers: remainingMembers,
                currentResults: { success: results.success, failed: results.failed },
                templateContent: content
              })

              return {
                success: false,
                accountSwitchRequired: true,
                results: results
              }
            }

            // 모든 계정 한도 도달
            console.log('[Naver] 모든 네이버 계정 한도 도달')

            // 메시지 윈도우 닫기
            closeMessageWindow()

            // 한도 도달 이벤트 전송
            getMainWindowRef()?.webContents.send('naver:sendLimitReached', {
              count: result.count,
              current: i,
              total: total,
              todaySentCount: currentTodaySentCount
            })

            // 발송 가능한 계정 없음 이벤트 전송
            getMainWindowRef()?.webContents.send('naver:noAvailableAccount', {
              message: '모든 네이버 계정이 일일 발송 한도(50건)에 도달했습니다.',
              results: results
            })

            // 발송 완료 이벤트 전송
            getMainWindowRef()?.webContents.send('naver:sendComplete', {
              success: false,
              error: '일일 발송 한도(50건) 도달',
              limitReached: true,
              results: results
            })

            return { success: false, error: '일일 발송 한도(50건) 도달', limitReached: true, results }
          }

          // 진행 상황 전송 (실패)
          getMainWindowRef()?.webContents.send('naver:sendProgress', {
            current: i + 1,
            total: total,
            member: member,
            memberKey: member.memberKey,
            success: false,
            error: result.error,
            todaySentCount: currentTodaySentCount
          })
        }
      }

      // 발송 완료 후 메시지 윈도우 닫기
      closeMessageWindow()

      console.log(`[Naver] 대량 발송 완료: 성공 ${results.success}명, 실패 ${results.failed}명`)

      // 발송 완료 이벤트 전송
      getMainWindowRef()?.webContents.send('naver:sendComplete', {
        success: true,
        results: results
      })

      return { success: true, results }

    } catch (error) {
      console.error('[Naver] startSending 실패:', error)

      getMainWindowRef()?.webContents.send('naver:sendComplete', {
        success: false,
        error: error.message
      })

      throw error
    }
  })

  // 기존 핸들러 유지 (하위 호환성)
  ipcMain.handle('naver:closeView', async () => {
    return await ipcMain.handle('naver:closeWindow')
  })

  ipcMain.handle('naver:openCafe', async (event, cafeUrl) => {
    console.log('[Naver] openCafe는 더 이상 사용되지 않습니다. startCrawling을 사용하세요.')
    return { success: true, deprecated: true }
  })

  ipcMain.handle('naver:crawlMembers', async (event, options) => {
    return await ipcMain.handle('naver:startCrawling', event, options)
  })

  ipcMain.handle('naver:updateBounds', async () => {
    // BrowserWindow는 bounds 업데이트 불필요
    return { success: true }
  })

  // ===== 다음 로그인 핸들러 =====

  // 다음 로그인 창 열기
  ipcMain.handle('daum:openLogin', async () => {
    try {
      // 다음 카페 크롤링은 항상 로그인 창 표시 필요
      // (이전 세션이 있어도 크롤링 전 재로그인 필요)
      console.log('[Daum] 로그인 창 열기 (크롤링 전 필수)')

      // 기존 로그인 창이 있으면 닫기 (ERR_FAILED 방지)
      closeDaumLoginWindow()
      await new Promise(r => setTimeout(r, 300)) // 창 닫힘 대기

      const window = createDaumLoginWindow()

      // 시스템 알림 표시 (사용자가 다른 작업 중일 수 있음)
      if (Notification.isSupported()) {
        const notification = new Notification({
          title: '🔐 다음 로그인 필요',
          body: '다음 카페 크롤링을 위해 로그인이 필요합니다.',
          urgency: 'normal',
          silent: false
        })
        notification.show()

        // 알림 클릭 시 로그인 창으로 포커스
        notification.on('click', () => {
          if (window && !window.isDestroyed()) {
            window.focus()
          }
        })
      }

      // UI에도 알림 전송
      const mainWindow = getMainWindowRef()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('daum:loginRequired', {
          message: '다음 로그인이 필요합니다'
        })
      }

      // 기존 이벤트 핸들러 제거 후 새로 등록 (중복 방지) - loadURL 전에 등록!
      window.webContents.removeAllListeners('did-navigate')
      window.webContents.removeAllListeners('did-finish-load')

      // 로그인 완료 처리 함수 (중복 호출 방지)
      let loginCompleteHandled = false
      async function handleLoginComplete() {
        if (loginCompleteHandled) return

        const isLoggedIn = await checkDaumLoginStatus()
        if (!isLoggedIn) return

        loginCompleteHandled = true
        console.log('[Daum] 로그인 성공 감지 - 쿠키 저장 중...')

        // 다음 쿠키 가져오기
        const daumCookies = await session.defaultSession.cookies.get({ domain: '.daum.net' })
        // 카카오 쿠키도 함께 가져오기 (로그인 세션용)
        const kakaoCookies = await session.defaultSession.cookies.get({ domain: '.kakao.com' })
        const allCookies = [...daumCookies, ...kakaoCookies]

        // 쿠키 문자열 생성 (API 호출용)
        const cookieString = allCookies.map(c => `${c.name}=${c.value}`).join('; ')

        // 쿠키 캐시에 저장
        daumCookieCache = {
          cookies: allCookies,
          cookieString: cookieString,
          savedAt: new Date().toISOString(),
          accountId: null
        }

        console.log('[Daum] 쿠키 캐시 저장 완료')
        console.log(`  - 다음 쿠키: ${daumCookies.length}개`)
        console.log(`  - 카카오 쿠키: ${kakaoCookies.length}개`)
        console.log(`  - 총 쿠키: ${allCookies.length}개`)

        // 주요 인증 쿠키 확인
        const authCookies = allCookies.filter(c =>
          ['HM_CU', 'HTS', '_kawlt', '_karmt', '_kahai'].includes(c.name)
        )
        authCookies.forEach(c => console.log(`  - [인증] ${c.name}: ${c.value.substring(0, 20)}...`))

        // Renderer에 로그인 완료 이벤트 전송
        const mainWindow = getMainWindowRef()
        console.log('[Daum] mainWindow 참조:', mainWindow ? 'exists' : 'null')

        if (mainWindow && !mainWindow.isDestroyed()) {
          console.log('[Daum] daum:loginStatusChanged 이벤트 전송')
          mainWindow.webContents.send('daum:loginStatusChanged', true)

          console.log('[Daum] daum:loginComplete 이벤트 전송 (100ms 후)')
          setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              console.log('[Daum] daum:loginComplete 이벤트 전송 실행')
              mainWindow.webContents.send('daum:loginComplete', {
                success: true,
                cookieCount: allCookies.length,
                daumCookieCount: daumCookies.length,
                kakaoCookieCount: kakaoCookies.length
              })
            } else {
              console.error('[Daum] mainWindow가 파괴되어 이벤트 전송 실패')
            }
            closeDaumLoginWindow()
          }, 100)
        } else {
          console.error('[Daum] mainWindow를 찾을 수 없어 이벤트 전송 실패')
          closeDaumLoginWindow()
        }
      }

      // 페이지 로드 완료 후 카카오 로그인 버튼 자동 클릭 및 자동 로그인
      window.webContents.on('did-finish-load', async () => {
        const currentUrl = window.webContents.getURL()
        console.log('[Daum] 페이지 로드 완료:', currentUrl)

        // 로그인이 이미 완료되었는지 확인 (CAPTCHA 수동 입력 후 등)
        // 다음/카카오 메인 페이지 또는 로그인 후 리다이렉트 페이지에서 확인
        if (!currentUrl.includes('login') && !currentUrl.includes('accounts')) {
          console.log('[Daum] 로그인 후 페이지 감지 - 로그인 상태 확인')
          await handleLoginComplete()
          return
        }

        // 다음 로그인 페이지에서 카카오 버튼 자동 클릭
        if (currentUrl.includes('logins.daum.net/accounts/oauth/login')) {
          console.log('[Daum] 카카오 로그인 버튼 자동 클릭 시도')

          // 버튼이 나타날 때까지 반복 시도 (최대 5초)
          const maxAttempts = 10
          for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            await new Promise(r => setTimeout(r, 500)) // 500ms 대기

            try {
              const clicked = await window.webContents.executeJavaScript(`
                (function() {
                  // 카카오 로그인 버튼 찾기 (여러 셀렉터 시도)
                  const kakaoBtn = document.querySelector('.login__container--btn-kakao') ||
                                   document.querySelector('[data-tiara-action-name="카카오로 로그인 클릭"]') ||
                                   document.querySelector('button.btn-common') ||
                                   document.querySelector('.btn-kakao') ||
                                   document.querySelector('button[class*="kakao"]');
                  if (kakaoBtn) {
                    kakaoBtn.click();
                    console.log('[AutoClick] 카카오 로그인 버튼 클릭 성공');
                    return true;
                  }
                  return false;
                })();
              `)

              if (clicked) {
                console.log('[Daum] 카카오 버튼 클릭 성공 (시도 ' + attempt + '회)')
                break
              } else {
                console.log('[Daum] 카카오 버튼 찾는 중... (시도 ' + attempt + '/' + maxAttempts + ')')
              }
            } catch (e) {
              console.log('[Daum] 카카오 버튼 클릭 시도 실패:', e.message)
            }
          }
        }

        // 카카오 로그인 페이지에서 다음 계정 자동 입력
        if (currentUrl.includes('accounts.kakao.com')) {
          console.log('[Daum] 카카오 로그인 페이지 감지 - 다음 계정 자동 입력 시도')

          try {
            // 발송 가능한 다음 계정 조회 (account_type === 'daum' && today_sent_count < 20)
            // 카카오(다음) 계정은 일일 발송 한도가 20건
            const DAUM_DAILY_LIMIT = 20
            const daumAccounts = store.find('accounts', acc =>
              acc.account_type === 'daum' &&
              (acc.today_sent_count === null || acc.today_sent_count === undefined || acc.today_sent_count < DAUM_DAILY_LIMIT)
            )

            if (daumAccounts.length === 0) {
              console.log('[Daum] 발송 가능한 다음 계정이 없습니다 (모든 계정 일일 한도 20건 도달)')
              return
            }

            // 첫 번째 발송 가능 계정 사용
            const account = daumAccounts[0]
            console.log(`[Daum] 자동 입력 계정: ${account.account_name} (발송 가능: ${DAUM_DAILY_LIMIT - (account.today_sent_count || 0)}건)`)

            // 비밀번호 복호화
            const decryptedPassword = decryptPassword(account.account_password)

            // 특수문자 이스케이프 처리
            const escapeForJs = (str) => {
              return str
                .replace(/\\/g, '\\\\')
                .replace(/'/g, "\\'")
                .replace(/"/g, '\\"')
                .replace(/\n/g, '\\n')
                .replace(/\r/g, '\\r')
            }

            const safeId = escapeForJs(account.account_id)
            const safePw = escapeForJs(decryptedPassword)

            // 입력 필드가 나타날 때까지 반복 시도 (최대 5초)
            const maxInputAttempts = 10
            for (let attempt = 1; attempt <= maxInputAttempts; attempt++) {
              await new Promise(r => setTimeout(r, 500))

              try {
                const filled = await window.webContents.executeJavaScript(`
                  (function() {
                    // React input에 값을 설정하는 헬퍼 함수
                    function setNativeValue(element, value) {
                      // React의 value setter를 가져와서 호출 (controlled input 지원)
                      const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
                      const prototype = Object.getPrototypeOf(element);
                      const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

                      if (valueSetter && valueSetter !== prototypeValueSetter) {
                        prototypeValueSetter.call(element, value);
                      } else if (prototypeValueSetter) {
                        prototypeValueSetter.call(element, value);
                      } else {
                        element.value = value;
                      }

                      // React가 인식하는 이벤트 발생
                      element.dispatchEvent(new Event('input', { bubbles: true }));
                      element.dispatchEvent(new Event('change', { bubbles: true }));
                    }

                    // 카카오 로그인 페이지의 입력 필드 찾기 (다양한 셀렉터 시도)
                    const emailInput = document.querySelector('input[name="loginId"]') ||
                                       document.querySelector('input#loginId--1') ||
                                       document.querySelector('#loginId') ||
                                       document.querySelector('input[type="email"]') ||
                                       document.querySelector('input[placeholder*="이메일"]') ||
                                       document.querySelector('input[placeholder*="카카오메일"]') ||
                                       document.querySelector('input[placeholder*="아이디"]') ||
                                       document.querySelector('input[data-testid="login-id-input"]');
                    const pwInput = document.querySelector('input[name="password"]') ||
                                    document.querySelector('input#password--2') ||
                                    document.querySelector('#password') ||
                                    document.querySelector('input[type="password"]') ||
                                    document.querySelector('input[data-testid="login-password-input"]');

                    console.log('[AutoLogin] 이메일 입력 필드:', emailInput ? 'found' : 'not found');
                    console.log('[AutoLogin] 비밀번호 입력 필드:', pwInput ? 'found' : 'not found');

                    if (emailInput && pwInput) {
                      // 이메일 입력 (React controlled input 방식)
                      emailInput.focus();
                      setNativeValue(emailInput, '${safeId}');
                      console.log('[AutoLogin] 이메일 입력 완료: ${safeId}');

                      // 비밀번호 입력 (React controlled input 방식)
                      pwInput.focus();
                      setNativeValue(pwInput, '${safePw}');
                      console.log('[AutoLogin] 비밀번호 입력 완료');

                      console.log('[AutoLogin] 카카오 이메일/비밀번호 자동 입력 완료');

                      // 로그인 버튼 클릭 (입력 후 약간의 딜레이)
                      setTimeout(() => {
                        const loginBtn = document.querySelector('button[type="submit"]') ||
                                         document.querySelector('button[class*="submit"]') ||
                                         document.querySelector('button[class*="login"]') ||
                                         document.querySelector('.btn_confirm') ||
                                         document.querySelector('button.submit') ||
                                         document.querySelector('#login-btn') ||
                                         document.querySelector('button[data-testid="login-button"]');
                        if (loginBtn) {
                          loginBtn.click();
                          console.log('[AutoLogin] 로그인 버튼 클릭 완료');
                        } else {
                          console.log('[AutoLogin] 로그인 버튼을 찾을 수 없습니다');
                        }
                      }, 500);

                      return { success: true };
                    }
                    return { success: false, reason: 'input fields not found' };
                  })();
                `)

                if (filled.success) {
                  console.log('[Daum] 카카오 로그인 자동 입력 성공 (시도 ' + attempt + '회)')
                  break
                } else {
                  console.log('[Daum] 입력 필드 찾는 중... (시도 ' + attempt + '/' + maxInputAttempts + ')')
                }
              } catch (e) {
                console.log('[Daum] 자동 입력 시도 실패:', e.message)
              }
            }
          } catch (autoLoginError) {
            console.error('[Daum] 자동 로그인 실패:', autoLoginError)
          }
        }
      })

      // 페이지 이동 감지하여 로그인 성공 확인
      window.webContents.on('did-navigate', async (event, url) => {
        console.log('[Daum] 페이지 이동:', url)

        // 로그인/계정 페이지가 아닌 곳으로 이동하면 로그인 성공 가능성 확인
        if (!url.includes('login') && !url.includes('accounts')) {
          console.log('[Daum] 로그인 후 리다이렉트 감지 - 로그인 상태 확인')
          await handleLoginComplete()
        }
      })

      // 이벤트 리스너 등록 후 URL 로드
      await window.loadURL(DAUM_LOGIN_URL)

      console.log('[Daum] 로그인 창 열림')
      return { success: true }
    } catch (error) {
      console.error('[Daum] openLogin 실패:', error)
      throw error
    }
  })

  // 다음 로그인 창 닫기
  ipcMain.handle('daum:closeWindow', async () => {
    try {
      closeDaumLoginWindow()
      console.log('[Daum] 로그인 창 닫힘')
      return { success: true }
    } catch (error) {
      console.error('[Daum] closeWindow 실패:', error)
      throw error
    }
  })

  // 다음 로그인 상태 확인
  ipcMain.handle('daum:checkLogin', async () => {
    return await checkDaumLoginStatus()
  })

  // 다음 카페 정보 추출 (grpid, fldid)
  ipcMain.handle('daum:fetchCafeIds', async () => {
    try {
      // 1. 다음 카페 목록 조회 (cafe_type === 'daum')
      const daumCafes = store.find('cafes', cafe => cafe.cafe_type === 'daum')

      if (daumCafes.length === 0) {
        console.log('[Daum] 등록된 다음 카페가 없습니다')
        return { success: false, error: '등록된 다음 카페가 없습니다' }
      }

      console.log(`[Daum] 다음 카페 ${daumCafes.length}개 정보 추출 시작`)

      // 2. 결과 초기화
      daumCafeInfoMap.clear()

      // 3. 다음 쿠키 가져오기
      const cookies = await session.defaultSession.cookies.get({ domain: '.daum.net' })
      const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ')

      // 4. 각 카페 URL 순회
      for (let i = 0; i < daumCafes.length; i++) {
        const cafe = daumCafes[i]

        try {
          console.log(`[Daum] 카페 정보 추출 (${i + 1}/${daumCafes.length}): ${cafe.cafe_name}`)

          // fetch로 카페 URL 접속 (쿠키 포함)
          const response = await fetch(cafe.cafe_url, {
            headers: {
              'Cookie': cookieString,
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          })

          const html = await response.text()

          // HTML에서 grpid, fldid 추출
          const grpidMatch = html.match(/grpid=([A-Za-z0-9]+)/)
          const fldidMatch = html.match(/fldid=([A-Za-z0-9]+)/)

          if (grpidMatch && fldidMatch) {
            const grpid = grpidMatch[1]
            const fldid = fldidMatch[1]

            console.log(`[Daum] 추출 성공: ${cafe.cafe_name} → grpid=${grpid}, fldid=${fldid}`)

            // 권한 확인: bbs_list 페이지에서 MEMBER_ROLECODE 확인
            const bbsListUrl = `https://cafe.daum.net/_c21_/bbs_list?grpid=${grpid}&fldid=${fldid}`
            console.log(`[Daum] 권한 확인 중: ${bbsListUrl}`)

            const bbsResponse = await fetch(bbsListUrl, {
              headers: {
                'Cookie': cookieString,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
              }
            })
            const bbsHtml = await bbsResponse.text()

            // MEMBER_ROLECODE 추출 (예: MEMBER_ROLECODE = 25 또는 "MEMBER_ROLECODE":25)
            const roleCodeMatch = bbsHtml.match(/MEMBER_ROLECODE["\s:=]+(\d+)/)
            const roleCode = roleCodeMatch ? parseInt(roleCodeMatch[1], 10) : 0
            const hasPermission = roleCode >= 25

            console.log(`[Daum] ${cafe.cafe_name} - MEMBER_ROLECODE: ${roleCode}, 권한: ${hasPermission ? '정회원 이상' : '권한 미달'}`)

            if (hasPermission) {
              daumCafeInfoMap.set(cafe.id, {
                grpid: grpid,
                fldid: fldid,
                cafeName: cafe.cafe_name,
                cafeUrl: cafe.cafe_url,
                roleCode: roleCode,
                hasPermission: true
              })
            } else {
              console.log(`[Daum] ${cafe.cafe_name} - 권한 미달 (ROLECODE: ${roleCode} < 25), 스킵`)
            }

            // 진행 상황 알림
            getMainWindowRef()?.webContents.send('daum:fetchCafeIdsProgress', {
              current: i + 1,
              total: daumCafes.length,
              cafe: cafe.cafe_name,
              grpid: grpid,
              fldid: fldid,
              roleCode: roleCode,
              hasPermission: hasPermission,
              success: true
            })
          } else {
            console.log(`[Daum] 추출 실패: ${cafe.cafe_name} - grpid/fldid를 찾을 수 없음`)

            // 진행 상황 알림 (실패)
            getMainWindowRef()?.webContents.send('daum:fetchCafeIdsProgress', {
              current: i + 1,
              total: daumCafes.length,
              cafe: cafe.cafe_name,
              grpid: null,
              fldid: null,
              hasPermission: false,
              success: false
            })
          }

          // Rate limiting - 500ms 딜레이
          if (i < daumCafes.length - 1) {
            await new Promise(r => setTimeout(r, 500))
          }

        } catch (cafeError) {
          console.error(`[Daum] 카페 ${cafe.cafe_name} 정보 추출 실패:`, cafeError)
        }
      }

      const permittedCount = daumCafeInfoMap.size
      console.log(`[Daum] 카페 정보 추출 완료: ${daumCafes.length}개 중 ${permittedCount}개 권한 확인`)

      // 완료 이벤트
      getMainWindowRef()?.webContents.send('daum:fetchCafeIdsComplete', {
        success: true,
        count: permittedCount,
        total: daumCafes.length,
        permittedCount: permittedCount
      })

      return { success: true, count: permittedCount, total: daumCafes.length }

    } catch (error) {
      console.error('[Daum] fetchCafeIds 실패:', error)

      getMainWindowRef()?.webContents.send('daum:fetchCafeIdsComplete', {
        success: false,
        error: error.message
      })

      throw error
    }
  })

  // 저장된 다음 카페 정보 조회 (단일)
  ipcMain.handle('daum:getCafeInfo', async (event, cafeId) => {
    return daumCafeInfoMap.get(cafeId) || null
  })

  // 모든 다음 카페 정보 조회
  ipcMain.handle('daum:getAllCafeInfo', async () => {
    return Object.fromEntries(daumCafeInfoMap)
  })

  // 저장된 쿠키 캐시 조회
  ipcMain.handle('daum:getCookieCache', async () => {
    return {
      hasCookies: daumCookieCache.cookies.length > 0,
      cookieCount: daumCookieCache.cookies.length,
      savedAt: daumCookieCache.savedAt,
      accountId: daumCookieCache.accountId
    }
  })

  // 쿠키 캐시 초기화
  ipcMain.handle('daum:clearCookieCache', async () => {
    daumCookieCache = {
      cookies: [],
      cookieString: '',
      savedAt: null,
      accountId: null
    }
    console.log('[Daum] 쿠키 캐시 초기화됨')
    return { success: true }
  })

  // 다음 카페 회원 크롤링
  ipcMain.handle('daum:startCrawling', async (event, options = {}) => {
    try {
      const { datePeriod } = options

      // 1. 권한 있는 카페 목록 확인
      if (daumCafeInfoMap.size === 0) {
        console.log('[Daum] 권한이 확인된 다음 카페가 없습니다')
        return { success: false, error: '권한이 확인된 다음 카페가 없습니다' }
      }

      // 날짜 필터 계산
      const minTimestamp = getDateFilter(datePeriod)
      console.log(`[Daum] 다음 카페 회원 크롤링 시작: ${daumCafeInfoMap.size}개 카페, 기간: ${datePeriod || '전체'}`)
      if (minTimestamp) {
        console.log(`[Daum] 최소 타임스탬프: ${new Date(minTimestamp).toISOString()}`)
      }

      // 2. 다음 쿠키 가져오기
      const cookies = await session.defaultSession.cookies.get({ domain: '.daum.net' })
      const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ')

      const collectedMembers = new Map() // encUserId 기준 중복 제거
      let skippedByDate = 0 // 날짜 필터로 스킵된 게시글 수

      // 3. 각 카페 순회
      let cafeIndex = 0
      for (const [cafeId, cafeInfo] of daumCafeInfoMap) {
        cafeIndex++
        const { grpid, fldid, cafeName } = cafeInfo
        const bbsListUrl = `https://cafe.daum.net/_c21_/bbs_list?grpid=${grpid}&fldid=${fldid}`

        console.log(`[Daum] 카페 크롤링 (${cafeIndex}/${daumCafeInfoMap.size}): ${cafeName}`)

        try {
          // fetch로 bbs_list 접속
          const response = await fetch(bbsListUrl, {
            headers: {
              'Cookie': cookieString,
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          })
          const html = await response.text()

          // 정규식으로 created, author, encUserId 추출
          const regex = /created:\s*'([^']*)'[\s\S]*?author:\s*'([^']*)',\s*userid:\s*'[^']*',\s*encUserId:\s*'([^']*)'/g
          let match
          while ((match = regex.exec(html)) !== null) {
            const created = match[1]
            const authorUnicode = match[2]
            const encUserId = match[3]

            // 날짜 필터링
            const timestamp = parseDaumCreated(created)
            if (minTimestamp && timestamp < minTimestamp) {
              skippedByDate++
              continue // 기간 외 게시글 스킵
            }

            // 유니코드 이스케이프 → 한글 변환
            const author = decodeUnicodeEscape(authorUnicode)

            if (!collectedMembers.has(encUserId)) {
              collectedMembers.set(encUserId, {
                encUserId,
                nickName: author,  // 네이버와 동일한 필드명 사용
                cafeId,
                cafeName,
                created,
                writeDateTimestamp: timestamp
              })

              // 진행 상황 알림
              getMainWindowRef()?.webContents.send('daum:crawlProgress', {
                current: collectedMembers.size,
                cafe: cafeName,
                member: { encUserId, nickName: author, cafeName, created }
              })
            }
          }

          console.log(`[Daum] ${cafeName} 크롤링 완료 - 현재 총 ${collectedMembers.size}명 (기간 외 스킵: ${skippedByDate}건)`)

          // Rate limiting - 500ms 딜레이
          if (cafeIndex < daumCafeInfoMap.size) {
            await new Promise(r => setTimeout(r, 500))
          }

        } catch (cafeError) {
          console.error(`[Daum] 카페 ${cafeName} 크롤링 실패:`, cafeError)
        }
      }

      // 완료 이벤트
      const members = Array.from(collectedMembers.values())
      console.log(`[Daum] 다음 카페 크롤링 완료: 총 ${members.length}명 수집`)

      getMainWindowRef()?.webContents.send('daum:crawlComplete', {
        success: true,
        count: members.length,
        members
      })

      return { success: true, count: members.length, members }

    } catch (error) {
      console.error('[Daum] startCrawling 실패:', error)

      getMainWindowRef()?.webContents.send('daum:crawlComplete', {
        success: false,
        error: error.message
      })

      throw error
    }
  })

  console.log('[IPC] Naver handlers registered (API mode)')
  console.log('[IPC] Daum handlers registered')
}

module.exports = {
  register,
  closeLoginWindow,
  closeDaumLoginWindow
}
