// 네이버 로그인 및 API 크롤링 IPC 핸들러
// BrowserWindow를 사용한 네이버 로그인, 쿠키 기반 API 크롤링

const { BrowserWindow, session, Notification } = require('electron')

// 윈도우 인스턴스 (싱글톤)
let loginWindow = null
let messageWindow = null
let getMainWindow = null // 함수로 변경

// 발송 중지 플래그
let isSendingCancelled = false

// 네이버 URL
const NAVER_LOGIN_URL = 'https://nid.naver.com/nidlogin.login'
const NOTE_SEND_URL = 'https://note.naver.com/note/sendForm.nhn'

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

      // 창을 닫은 후 안정화 대기 (ERR_FAILED 방지)
      await new Promise(r => setTimeout(r, 500))

      const window = createMessageWindow()
      window.showInactive() // 포커스 없이 창 표시
      const url = `${NOTE_SEND_URL}?popup=1&svcType=2&targetCafeMemberKey=${targetCafeMemberKey}`

      await window.loadURL(url)
      console.log(`[Naver] 쪽지 발송 페이지 로드: ${targetCafeMemberKey}`)

      // 페이지 로드 완료 대기
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

        // 사용자가 CAPTCHA 입력할 때까지 대기 (최대 60초)
        const maxWaitTime = 60000
        const checkInterval = 1000
        let waitedTime = 0

        while (waitedTime < maxWaitTime) {
          await new Promise(r => setTimeout(r, checkInterval))
          waitedTime += checkInterval

          // 창이 닫혔거나 파괴되었으면 성공으로 처리 (발송 완료 후 창이 닫힘)
          if (!window || window.isDestroyed()) {
            console.log(`[Naver] CAPTCHA 처리 완료 (창 닫힘)`)
            getMainWindowRef()?.webContents.send('naver:captchaResolved', {
              memberKey: targetCafeMemberKey
            })
            resolve({ success: true, todaySentCount: todaySentCount + 1 }) // 발송 성공 시 +1
            return
          }

          try {
            // CAPTCHA 레이어가 사라졌는지 확인
            const checkResult = await window.webContents.executeJavaScript(`
              (function() {
                const captchaLayer = document.getElementById('note_captcha');
                // CAPTCHA 레이어가 없거나 숨겨져 있으면 성공
                if (!captchaLayer || captchaLayer.style.display === 'none') {
                  return { captchaGone: true };
                }
                return { captchaGone: false };
              })();
            `)

            if (checkResult.captchaGone) {
              console.log(`[Naver] CAPTCHA 처리 완료`)
              // CAPTCHA 완료 알림
              getMainWindowRef()?.webContents.send('naver:captchaResolved', {
                memberKey: targetCafeMemberKey
              })
              resolve({ success: true, todaySentCount: todaySentCount + 1 }) // 발송 성공 시 +1
              return
            }
          } catch (jsError) {
            // executeJavaScript 실패 = 페이지가 변경됨 = 발송 성공
            console.log(`[Naver] CAPTCHA 처리 완료 (페이지 변경)`)
            getMainWindowRef()?.webContents.send('naver:captchaResolved', {
              memberKey: targetCafeMemberKey
            })
            resolve({ success: true, todaySentCount: todaySentCount + 1 }) // 발송 성공 시 +1
            return
          }
        }

        // 타임아웃
        console.log(`[Naver] CAPTCHA 입력 타임아웃`)
        resolve({ success: false, error: 'CAPTCHA 입력 타임아웃 (60초)' })
        return
      }

      // CAPTCHA 없이 성공
      resolve({ success: true, todaySentCount: todaySentCount + 1 }) // 발송 성공 시 +1

    } catch (error) {
      console.error('[Naver] sendMessageViaBrowser 실패:', error)

      // ERR_FAILED (-2) 오류 시 재시도
      if (error.code === 'ERR_FAILED' && retryCount < MAX_RETRIES) {
        console.log(`[Naver] 재시도 ${retryCount + 1}/${MAX_RETRIES}...`)
        closeMessageWindow()
        await new Promise(r => setTimeout(r, 1000)) // 재시도 전 1초 대기
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

  // 자동 로그인 실행
  ipcMain.handle('naver:autoLogin', async (event, credentials) => {
    try {
      if (!loginWindow || loginWindow.isDestroyed()) {
        createLoginWindow()
        await loginWindow.loadURL(NAVER_LOGIN_URL)
        // 페이지 로드 대기
        await new Promise(resolve => setTimeout(resolve, 1000))
      }

      const { naver_id, naver_password } = credentials

      // 특수문자 이스케이프 처리
      const escapeForJs = (str) => {
        return str
          .replace(/\\/g, '\\\\')
          .replace(/'/g, "\\'")
          .replace(/"/g, '\\"')
          .replace(/\n/g, '\\n')
          .replace(/\r/g, '\\r')
      }

      const safeId = escapeForJs(naver_id)
      const safePw = escapeForJs(naver_password)

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
      return { success: true }
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

        await initWindow.loadURL(initUrl)
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

        // 초기 조회 시에도 DB 동기화
        const activeAccount = store.findOne('accounts', { is_active: 1 })
        if (activeAccount) {
          store.setSentCount(activeAccount.id, currentTodaySentCount)
          console.log(`[Naver] 계정 발송 현황 초기 동기화: ${activeAccount.account_name} → ${currentTodaySentCount}건`)
        }

        // 초기 조회 후 창 닫기
        closeMessageWindow()

        // 이미 50건 이상이면 발송 시작 전에 중단
        if (currentTodaySentCount >= 50) {
          console.log(`[Naver] 일일 발송 한도 이미 도달 - 발송 시작 불가`)

          getMainWindowRef()?.webContents.send('naver:sendLimitReached', {
            count: currentTodaySentCount,
            current: 0,
            total: members.length,
            todaySentCount: currentTodaySentCount
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

          // 활성 계정의 발송 카운트 동기화 (네이버 서버 값으로 DB 저장)
          const activeAccount = store.findOne('accounts', { is_active: 1 })
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

          // 일일 발송 한도 도달 시 전체 발송 중단
          if (result.limitReached) {
            console.log(`[Naver] 일일 발송 한도 도달 - 발송 중단`)

            // 한도 도달 시 todaySentCount 업데이트
            if (result.count !== undefined) {
              currentTodaySentCount = result.count
            }

            // 메시지 윈도우 닫기
            closeMessageWindow()

            // 한도 도달 이벤트 전송
            getMainWindowRef()?.webContents.send('naver:sendLimitReached', {
              count: result.count,
              current: i,
              total: total,
              todaySentCount: currentTodaySentCount
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

  console.log('[IPC] Naver handlers registered (API mode)')
}

module.exports = {
  register,
  closeLoginWindow
}
