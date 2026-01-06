// 홈 화면 컴포넌트
// 신규 회원 조회 → 탐색 → 메시지 전송 플로우

let collectedMembers = []
let isCrawling = false
let isExploring = false // 탐색 시작 여부
let selectedPeriod = '1day' // 기본값: 1일
let selectedTemplate = null // 선택된 템플릿
let templates = [] // 템플릿 목록
let isSending = false // 발송 진행 중 여부
let sendProgress = { current: 0, total: 0, todaySentCount: 0 } // 발송 진행 상황

// 탐색 기한 옵션
const PERIOD_OPTIONS = [
  { value: '1day', label: '1일' },
  { value: '2days', label: '2일' },
  { value: '3days', label: '3일' },
  { value: '1week', label: '일주일' },
  { value: '1month', label: '한 달' }
]

/**
 * 홈 화면 HTML 생성
 */
export function createHome() {
  return `
    <div class="h-full flex flex-col overflow-hidden">
      <!-- 초기 화면: 신규 회원 조회 -->
      <div id="initial-view" class="flex-1 flex items-center justify-center min-h-0">
        <div class="text-center">
          <div class="text-8xl mb-6">🔍</div>
          <h2 class="text-2xl font-bold text-gray-800 mb-2">신규 회원 조회</h2>
          <p class="text-gray-500 mb-6">카페에서 새로운 회원을 찾아보세요</p>

          <!-- 탐색 기한 선택 -->
          <div class="mb-6">
            <label for="period-select" class="block text-sm font-medium text-gray-700 mb-3">
              탐색 기한
            </label>
            <select
              id="period-select"
              class="px-4 py-2 rounded-lg border-2 border-gray-300 text-gray-700 bg-white hover:border-blue-400 focus:border-blue-600 focus:outline-none transition-colors font-medium cursor-pointer min-w-32"
            >
              ${PERIOD_OPTIONS.map(opt => `
                <option value="${opt.value}" ${opt.value === '1day' ? 'selected' : ''}>
                  ${opt.label}
                </option>
              `).join('')}
            </select>
          </div>

          <button
            id="btn-start-explore"
            class="px-8 py-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-semibold text-lg shadow-lg"
          >
            탐색 시작
          </button>
        </div>
      </div>

      <!-- 탐색 화면 (숨김 상태) -->
      <div id="explore-view" class="hidden h-full flex flex-col overflow-hidden">
        <!-- 헤더 -->
        <div class="flex justify-between items-center mb-4">
          <div>
            <h2 class="text-3xl font-bold text-gray-800">회원 탐색</h2>
            <p class="text-gray-600 mt-1">카페 게시글 작성자를 수집합니다</p>
          </div>
          <div class="flex items-center space-x-3">
            <!-- 템플릿 선택 드롭다운 -->
            <select
              id="template-select"
              class="px-4 py-3 rounded-lg border-2 border-gray-300 bg-white text-gray-700
                     hover:border-green-400 focus:border-green-600 focus:outline-none
                     transition-colors font-medium cursor-pointer min-w-48 disabled:bg-gray-100 disabled:cursor-not-allowed"
              disabled
            >
              <option value="">템플릿 선택...</option>
            </select>

            <!-- 오늘 발송 현황 표시 -->
            <div id="send-count-badge" class="hidden px-3 py-2 bg-yellow-100 text-yellow-800 rounded-lg text-sm font-medium">
              오늘 발송: <span id="today-sent-count">0</span>/50
            </div>

            <button
              id="btn-send-message"
              class="px-6 py-3 bg-green-600 text-white rounded-lg transition-colors font-medium text-lg shadow-md disabled:bg-gray-400 disabled:cursor-not-allowed"
              disabled
            >
              📨 메시지 전송하기
            </button>
          </div>
        </div>

        <!-- 메인 컨텐츠 영역 -->
        <div class="flex-1 flex gap-4 min-h-0 overflow-hidden">
          <!-- 왼쪽: 탐색 상태 -->
          <div class="flex-1 bg-white rounded-lg shadow-md flex flex-col overflow-hidden">
            <div class="flex-1 flex flex-col items-center justify-center p-8">
              <!-- 크롤링 진행 상태 -->
              <div id="crawling-status" class="text-center w-full max-w-md">
                <div class="text-6xl mb-4 animate-pulse">⏳</div>
                <h3 class="text-xl font-semibold text-gray-800 mb-2">크롤링 중...</h3>
                <p id="crawling-cafe-name" class="text-gray-600 mb-4"></p>

                <div class="bg-gray-200 rounded-full h-4 mb-2">
                  <div id="crawling-progress-bar" class="bg-blue-600 rounded-full h-4 transition-all" style="width: 0%"></div>
                </div>
                <p id="crawling-progress-text" class="text-sm text-gray-600">수집 중...</p>
              </div>

              <!-- 크롤링 완료 상태 (숨김) -->
              <div id="crawling-complete" class="hidden text-center">
                <div class="text-6xl mb-4">🎉</div>
                <h3 class="text-xl font-semibold text-green-700 mb-2">수집 완료!</h3>
                <p id="crawling-result" class="text-gray-600 mb-6"></p>
                <p class="text-sm text-blue-600 font-medium">이제 메시지를 전송할 수 있습니다</p>
              </div>

              <!-- 메시지 발송 진행 상태 (숨김) -->
              <div id="sending-status" class="hidden text-center w-full max-w-md">
                <div class="text-6xl mb-4 animate-pulse">📨</div>
                <h3 class="text-xl font-semibold text-gray-800 mb-2">메시지 전송 중...</h3>
                <p id="sending-template-name" class="text-gray-600 mb-4"></p>

                <div class="bg-gray-200 rounded-full h-4 mb-2">
                  <div id="sending-progress-bar" class="bg-green-600 rounded-full h-4 transition-all" style="width: 0%"></div>
                </div>
                <p id="sending-progress-text" class="text-sm text-gray-600">0 / 0 명 발송 완료</p>

                <!-- 중지하기 버튼 -->
                <button
                  id="btn-stop-sending"
                  class="mt-4 px-6 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors font-medium"
                >
                  ⏹️ 중지하기
                </button>

                <!-- 오늘 발송 제한 경고 -->
                <div id="send-limit-warning" class="hidden mt-4 p-3 bg-yellow-100 text-yellow-800 rounded-lg text-sm">
                  ⚠️ 오늘 발송 한도(50건)에 도달했습니다.
                </div>

                <!-- CAPTCHA 입력 필요 알림 -->
                <div id="captcha-alert" class="hidden mt-4 p-4 bg-orange-100 border border-orange-400 rounded-lg">
                  <div class="flex items-center">
                    <span class="text-2xl mr-3">⚠️</span>
                    <div>
                      <p class="font-semibold text-orange-800">CAPTCHA 입력 필요</p>
                      <p class="text-sm text-orange-700">쪽지 발송 창에서 보안문자를 입력해주세요.</p>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 메시지 발송 완료 상태 (숨김) -->
              <div id="sending-complete" class="hidden text-center">
                <div class="text-6xl mb-4">✅</div>
                <h3 class="text-xl font-semibold text-green-700 mb-2">발송 완료!</h3>
                <p id="sending-result" class="text-gray-600 mb-6"></p>
                <button
                  id="btn-new-search"
                  class="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  🔍 새로운 탐색 시작
                </button>
              </div>
            </div>
          </div>

          <!-- 오른쪽: 수집된 회원 목록 -->
          <div class="w-80 bg-white rounded-lg shadow-md flex flex-col max-h-full overflow-hidden">
            <div class="bg-gray-50 px-4 py-3 border-b">
              <div class="flex justify-between items-center">
                <h3 class="font-semibold text-gray-800">수집된 회원</h3>
                <span id="member-count" class="px-2 py-1 bg-blue-100 text-blue-700 text-sm rounded-full">
                  0명
                </span>
              </div>
              <p class="text-xs text-gray-500 mt-1">게시글 작성자 닉네임</p>
            </div>

            <!-- 회원 목록 -->
            <div id="collected-members-list" class="flex-1 overflow-y-auto min-h-0 p-2">
              <div class="text-center text-gray-400 py-8">
                <p>수집된 회원이 없습니다</p>
              </div>
            </div>

            <!-- 목록 초기화 버튼 -->
            <div id="member-actions" class="hidden px-4 py-3 border-t bg-gray-50">
              <button
                id="btn-clear-members"
                class="w-full px-4 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors text-sm"
              >
                목록 초기화
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
}

/**
 * 초기 화면 ↔ 탐색 화면 전환
 */
function showExploreView(show) {
  const initialView = document.getElementById('initial-view')
  const exploreView = document.getElementById('explore-view')

  if (initialView && exploreView) {
    if (show) {
      initialView.classList.add('hidden')
      exploreView.classList.remove('hidden')
      isExploring = true
    } else {
      initialView.classList.remove('hidden')
      exploreView.classList.add('hidden')
      isExploring = false
    }
  }
}

/**
 * 탐색 상태 UI 전환
 */
function showExploreStatus(status) {
  const crawlingEl = document.getElementById('crawling-status')
  const completeEl = document.getElementById('crawling-complete')

  crawlingEl?.classList.add('hidden')
  completeEl?.classList.add('hidden')

  switch (status) {
    case 'crawling':
      crawlingEl?.classList.remove('hidden')
      break
    case 'complete':
      completeEl?.classList.remove('hidden')
      break
  }
}

/**
 * 수집된 회원 목록 렌더링
 */
function renderMembersList() {
  const listEl = document.getElementById('collected-members-list')
  const countEl = document.getElementById('member-count')
  const actionsEl = document.getElementById('member-actions')

  if (!listEl) return

  countEl.textContent = `${collectedMembers.length}명`

  // 전송 버튼 상태 업데이트
  updateSendButtonState()

  if (collectedMembers.length === 0) {
    listEl.innerHTML = `
      <div class="text-center text-gray-400 py-8">
        <p>수집된 회원이 없습니다</p>
      </div>
    `
    actionsEl?.classList.add('hidden')
    return
  }

  actionsEl?.classList.remove('hidden')

  listEl.innerHTML = collectedMembers.map((member, index) => `
    <div class="flex items-center px-3 py-2 hover:bg-gray-100 rounded ${index % 2 === 0 ? 'bg-gray-50' : ''} ${member.sent ? 'opacity-60' : ''} group relative">
      <!-- 발송 완료 체크 표시 -->
      <span class="w-6 flex-shrink-0">
        ${member.sent
          ? '<span class="text-green-600 font-bold">✓</span>'
          : '<span class="text-xs text-gray-400">' + (index + 1) + '</span>'}
      </span>
      <div class="flex-1 min-w-0">
        <span class="text-sm text-gray-800 ${member.sent ? 'line-through' : ''}">${escapeHtml(member.nickName)}</span>
        <span class="text-xs text-gray-400 ml-2">${member.memberKey.substring(0, 8)}...</span>
      </div>
      <!-- 팝오버 메뉴 버튼 (발송 완료 시 숨김) -->
      ${!member.sent ? `
        <div class="relative">
          <button
            class="member-menu-btn opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 rounded transition-opacity"
            data-member-key="${member.memberKey}"
          >
            <svg class="w-4 h-4 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z"/>
            </svg>
          </button>
          <!-- 팝오버 메뉴 -->
          <div
            class="member-popover hidden absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-36"
            data-member-key="${member.memberKey}"
          >
            <button
              class="member-add-btn w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 rounded-lg flex items-center gap-2"
              data-member-key="${member.memberKey}"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
              제외
            </button>
          </div>
        </div>
      ` : ''}
    </div>
  `).join('')

  // 팝오버 이벤트 등록
  attachPopoverEvents()
}

/**
 * 팝오버 메뉴 이벤트 등록
 */
function attachPopoverEvents() {
  // 메뉴 버튼 클릭 - 팝오버 토글
  document.querySelectorAll('.member-menu-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const memberKey = btn.dataset.memberKey
      const popover = document.querySelector(`.member-popover[data-member-key="${memberKey}"]`)

      // 다른 팝오버 닫기
      document.querySelectorAll('.member-popover').forEach(p => {
        if (p !== popover) p.classList.add('hidden')
      })

      // 현재 팝오버 토글
      popover?.classList.toggle('hidden')
    })
  })

  // 제외 버튼 클릭
  document.querySelectorAll('.member-add-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const memberKey = btn.dataset.memberKey
      await excludeMember(memberKey)
    })
  })

  // 문서 클릭 시 팝오버 닫기
  document.addEventListener('click', closeAllPopovers)
}

/**
 * 모든 팝오버 닫기
 */
function closeAllPopovers() {
  document.querySelectorAll('.member-popover').forEach(p => p.classList.add('hidden'))
}

/**
 * 회원을 DB에 저장하고 수집 목록에서 제외
 */
async function excludeMember(memberKey) {
  const member = collectedMembers.find(m => m.memberKey === memberKey)
  if (!member) return

  try {
    // DB에 회원 저장 (크롤링 시 수집된 cafeId 사용)
    await window.api.members.create({
      cafe_id: member.cafeId || null,
      nickname: member.nickName,
      member_key: member.memberKey
    })

    console.log('[Home] 회원 제외 및 DB 저장:', member.nickName)

    // 수집 목록에서 제거
    collectedMembers = collectedMembers.filter(m => m.memberKey !== memberKey)
    renderMembersList()

  } catch (error) {
    console.error('[Home] 회원 저장 실패:', error)
    // 중복 회원인 경우에도 목록에서 제거
    if (error.message?.includes('이미 등록된') || error.message?.includes('UNIQUE')) {
      console.log('[Home] 이미 등록된 회원 - 목록에서 제거')
      collectedMembers = collectedMembers.filter(m => m.memberKey !== memberKey)
      renderMembersList()
    } else {
      alert('회원 저장 실패: ' + error.message)
    }
  }
}

/**
 * 크롤링 진행 상태 업데이트
 */
function updateCrawlProgress(current, cafeName, datePeriod) {
  const barEl = document.getElementById('crawling-progress-bar')
  const textEl = document.getElementById('crawling-progress-text')
  const cafeEl = document.getElementById('crawling-cafe-name')

  // 진행 바 애니메이션 (무한 진행 표시)
  if (barEl) {
    // 수집 중일 때 50%~80% 범위에서 진행 표시
    const animatedPercent = Math.min(50 + (current * 2), 80)
    barEl.style.width = `${animatedPercent}%`
  }

  if (textEl) {
    const periodLabel = PERIOD_OPTIONS.find(p => p.value === datePeriod)?.label || datePeriod
    textEl.textContent = `${current}명 수집됨 (${periodLabel} 이내)`
  }

  if (cafeEl && cafeName) {
    cafeEl.textContent = `카페: ${cafeName}`
  }
}

/**
 * 템플릿 목록 로드
 */
async function loadTemplates() {
  try {
    templates = await window.api.templates.getAll()
    renderTemplateOptions()
    console.log('[Home] 템플릿 로드 완료:', templates.length, '개')
  } catch (error) {
    console.error('[Home] 템플릿 로드 실패:', error)
  }
}

/**
 * 템플릿 드롭다운 렌더링
 */
function renderTemplateOptions() {
  const selectEl = document.getElementById('template-select')
  if (!selectEl) return

  selectEl.innerHTML = `
    <option value="">템플릿 선택...</option>
    ${templates.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('')}
  `
}

/**
 * 전송 버튼 상태 업데이트
 */
function updateSendButtonState() {
  const sendBtn = document.getElementById('btn-send-message')
  const templateSelect = document.getElementById('template-select')

  if (sendBtn) {
    // 회원이 있고, 템플릿이 선택되었고, 발송 중이 아닐 때만 활성화
    const hasMembers = collectedMembers.length > 0
    const hasTemplate = selectedTemplate !== null
    sendBtn.disabled = !hasMembers || !hasTemplate || isSending
  }

  if (templateSelect) {
    // 회원이 있을 때만 템플릿 선택 가능
    templateSelect.disabled = collectedMembers.length === 0 || isSending
  }
}

/**
 * 발송 상태 UI 전환
 */
function showSendingStatus(status) {
  const crawlingEl = document.getElementById('crawling-status')
  const crawlCompleteEl = document.getElementById('crawling-complete')
  const sendingEl = document.getElementById('sending-status')
  const sendCompleteEl = document.getElementById('sending-complete')

  // 모두 숨김
  crawlingEl?.classList.add('hidden')
  crawlCompleteEl?.classList.add('hidden')
  sendingEl?.classList.add('hidden')
  sendCompleteEl?.classList.add('hidden')

  switch (status) {
    case 'sending':
      sendingEl?.classList.remove('hidden')
      break
    case 'complete':
      sendCompleteEl?.classList.remove('hidden')
      break
    case 'crawl-complete':
      crawlCompleteEl?.classList.remove('hidden')
      break
  }
}

/**
 * 로그인 플로우 시작
 */
async function startLoginFlow() {
  try {
    const credentials = await window.api.accounts.getActiveCredentials()
    if (!credentials) {
      alert('활성화된 계정이 없습니다.')
      return
    }

    // 로그인 창 열기
    await window.api.naver.openLogin()

    // 자동 로그인 시도
    setTimeout(async () => {
      try {
        await window.api.naver.autoLogin(credentials)
      } catch (err) {
        console.error('[Home] 자동 로그인 실패:', err)
      }
    }, 1500)

  } catch (error) {
    console.error('[Home] 로그인 플로우 실패:', error)
    alert('로그인을 시작할 수 없습니다: ' + error.message)
  }
}

/**
 * 메시지 발송 시작
 */
async function startSendingMessages() {
  if (!selectedTemplate || collectedMembers.length === 0) {
    return
  }

  isSending = true
  sendProgress = { current: 0, total: collectedMembers.length, todaySentCount: 0 }

  // UI 상태 전환
  showSendingStatus('sending')
  updateSendButtonState()

  const templateNameEl = document.getElementById('sending-template-name')
  if (templateNameEl) {
    templateNameEl.textContent = `템플릿: ${selectedTemplate.name}`
  }

  // 진행바 초기화
  const barEl = document.getElementById('sending-progress-bar')
  const textEl = document.getElementById('sending-progress-text')
  if (barEl) barEl.style.width = '0%'
  if (textEl) textEl.textContent = `0 / ${collectedMembers.length} 명 발송 완료`

  try {
    // 발송할 회원 목록 (아직 발송하지 않은 회원만)
    const membersToSend = collectedMembers.filter(m => !m.sent)

    console.log('[Home] 발송 시작:', membersToSend.length, '명')
    await window.api.naver.startSending(membersToSend, selectedTemplate.content)

  } catch (error) {
    console.error('[Home] 발송 시작 실패:', error)
    alert('메시지 발송을 시작할 수 없습니다: ' + error.message)
    isSending = false
    showSendingStatus('crawl-complete')
    updateSendButtonState()
  }
}

/**
 * 발송 진행 상황 업데이트
 */
function updateSendProgressUI(data) {
  sendProgress.current = data.current
  sendProgress.todaySentCount = data.todaySentCount

  // 진행 바 업데이트
  const barEl = document.getElementById('sending-progress-bar')
  const textEl = document.getElementById('sending-progress-text')
  const countBadge = document.getElementById('send-count-badge')
  const todayCountEl = document.getElementById('today-sent-count')
  const limitWarning = document.getElementById('send-limit-warning')

  // 오늘 발송 현황 표시 (초기 정보 또는 진행 중)
  if (countBadge && todayCountEl) {
    countBadge.classList.remove('hidden')
    todayCountEl.textContent = data.todaySentCount

    // 색상 변경: 40건 이상이면 경고 색상
    if (data.todaySentCount >= 40) {
      countBadge.className = 'px-3 py-2 bg-red-100 text-red-800 rounded-lg text-sm font-medium'
    } else if (data.todaySentCount >= 30) {
      countBadge.className = 'px-3 py-2 bg-orange-100 text-orange-800 rounded-lg text-sm font-medium'
    } else {
      countBadge.className = 'px-3 py-2 bg-yellow-100 text-yellow-800 rounded-lg text-sm font-medium'
    }
  }

  // 초기 정보만 표시하는 경우 (발송 시작 전)
  if (data.initialInfo) {
    console.log('[Home] 초기 발송 정보 수신 - 오늘 발송:', data.todaySentCount, '건')
    return
  }

  if (barEl) {
    const percent = (data.current / data.total) * 100
    barEl.style.width = `${percent}%`
  }

  if (textEl) {
    textEl.textContent = `${data.current} / ${data.total} 명 발송 완료`
  }

  // 한도 도달 경고
  if (limitWarning && data.limitReached) {
    limitWarning.classList.remove('hidden')
  }

  // 발송 성공한 회원 체크 표시
  if (data.success && data.memberKey) {
    const member = collectedMembers.find(m => m.memberKey === data.memberKey)
    if (member) {
      member.sent = true
      renderMembersList()
    }
  }
}

/**
 * 발송 완료 처리
 */
function handleSendComplete(data) {
  isSending = false

  const resultEl = document.getElementById('sending-result')
  const completeIcon = document.querySelector('#sending-complete .text-6xl')

  if (resultEl) {
    if (data.success) {
      const { results } = data
      resultEl.textContent = `성공: ${results.success}명, 실패: ${results.failed}명`
    } else if (data.cancelled) {
      // 사용자가 중지한 경우
      const { results } = data
      resultEl.textContent = `발송 중지됨 - 성공: ${results.success}명, 실패: ${results.failed}명`
      if (completeIcon) {
        completeIcon.textContent = '⏹️'
      }
    } else {
      resultEl.textContent = `오류: ${data.error}`
    }
  }

  showSendingStatus('complete')
  updateSendButtonState()
  renderMembersList()
}

/**
 * 이벤트 핸들러 등록
 */
export function attachHomeEvents() {
  // 컴포넌트 마운트 시 상태 초기화 (드롭다운 UI와 동기화)
  selectedPeriod = '1day'
  selectedTemplate = null
  collectedMembers = []
  isCrawling = false
  isExploring = false
  isSending = false
  sendProgress = { current: 0, total: 0, todaySentCount: 0 }

  // 템플릿 목록 로드
  loadTemplates()

  // 탐색 기한 드롭다운 이벤트 등록
  document.getElementById('period-select')?.addEventListener('change', (e) => {
    selectedPeriod = e.target.value
    console.log('[Home] 탐색 기한 선택:', selectedPeriod)
  })

  // 템플릿 선택 이벤트
  document.getElementById('template-select')?.addEventListener('change', (e) => {
    const templateId = e.target.value
    selectedTemplate = templateId ? templates.find(t => t.id === parseInt(templateId)) : null
    updateSendButtonState()
    console.log('[Home] 템플릿 선택:', selectedTemplate?.name)
  })

  // 탐색 시작 버튼 - 바로 크롤링 시작
  document.getElementById('btn-start-explore')?.addEventListener('click', async () => {
    console.log('[Home] 탐색 시작 클릭')

    // 활성 계정 확인
    const credentials = await window.api.accounts.getActiveCredentials()
    if (!credentials) {
      alert('활성화된 계정이 없습니다.\n계정 관리에서 계정을 추가하고 선택해주세요.')
      return
    }

    // 활성 카페 확인
    const activeCafe = await window.api.cafes.getActive()
    if (!activeCafe) {
      alert('활성화된 카페가 없습니다.\n카페 관리에서 카페를 추가하고 활성화해주세요.')
      return
    }

    // 탐색 화면으로 전환 및 크롤링 시작
    showExploreView(true)
    showExploreStatus('crawling')

    try {
      console.log('[Home] 크롤링 시작 (기간:', selectedPeriod, ')')
      isCrawling = true
      collectedMembers = []
      renderMembersList()
      updateCrawlProgress(0, '', selectedPeriod)

      await window.api.naver.startCrawling({ datePeriod: selectedPeriod })
    } catch (error) {
      console.error('[Home] 크롤링 시작 실패:', error)
      alert('크롤링 실패: ' + error.message)
      isCrawling = false
      // 초기 화면으로 돌아가기
      showExploreView(false)
    }
  })

  // 메시지 전송하기 버튼 - 로그인 확인 후 발송 시작
  document.getElementById('btn-send-message')?.addEventListener('click', async () => {
    if (collectedMembers.length === 0) {
      alert('수집된 회원이 없습니다. 탐색을 먼저 진행해주세요.')
      return
    }

    if (!selectedTemplate) {
      alert('템플릿을 선택해주세요.')
      return
    }

    console.log('[Home] 메시지 전송하기 클릭')

    try {
      // 로그인 상태 확인
      const isLoggedIn = await window.api.naver.checkLogin()

      if (!isLoggedIn) {
        // 로그인 필요 - 로그인 플로우 시작
        console.log('[Home] 로그인 필요 - 로그인 창 열기')
        await startLoginFlow()
        return
      }

      // 이미 로그인됨 - 바로 발송 시작
      console.log('[Home] 이미 로그인됨 - 발송 시작')
      await startSendingMessages()

    } catch (error) {
      console.error('[Home] 메시지 전송 실패:', error)
      alert('메시지 전송을 시작할 수 없습니다: ' + error.message)
    }
  })

  // 목록 초기화 버튼
  document.getElementById('btn-clear-members')?.addEventListener('click', () => {
    if (confirm('수집된 회원 목록을 초기화하시겠습니까?')) {
      collectedMembers = []
      selectedPeriod = '1day' // 기본값으로 초기화
      renderMembersList()

      // 드롭다운 기본값으로 초기화
      const selectEl = document.getElementById('period-select')
      if (selectEl) selectEl.value = '1day'

      // 초기 화면으로 돌아가기
      showExploreView(false)
    }
  })

  // IPC 이벤트 리스너 등록 전 기존 리스너 제거 (중복 방지)
  window.api.naver.removeAllListeners('naver:crawlProgress')
  window.api.naver.removeAllListeners('naver:crawlComplete')
  window.api.naver.removeAllListeners('naver:loginComplete')
  window.api.naver.removeAllListeners('naver:sendProgress')
  window.api.naver.removeAllListeners('naver:sendComplete')
  window.api.naver.removeAllListeners('naver:captchaRequired')
  window.api.naver.removeAllListeners('naver:captchaResolved')

  // IPC 이벤트 리스너: 크롤링 진행
  window.api.naver.onCrawlProgress((event, data) => {
    console.log('[Home] 크롤링 진행:', data)

    if (data.member) {
      if (!collectedMembers.find(m => m.memberKey === data.member.memberKey)) {
        collectedMembers.push(data.member)
        renderMembersList()
      }
    }

    updateCrawlProgress(data.current, data.cafe, data.datePeriod)
  })

  // IPC 이벤트 리스너: 크롤링 완료
  window.api.naver.onCrawlComplete((event, data) => {
    console.log('[Home] 크롤링 완료:', data)
    isCrawling = false

    // 진행바 100% 완료
    const barEl = document.getElementById('crawling-progress-bar')
    if (barEl) {
      barEl.style.width = '100%'
    }

    const resultEl = document.getElementById('crawling-result')
    if (resultEl) {
      if (data.success) {
        const periodLabel = PERIOD_OPTIONS.find(p => p.value === data.datePeriod)?.label || data.datePeriod
        resultEl.textContent = `${periodLabel} 이내 총 ${data.count}명의 회원을 수집했습니다.`
      } else {
        resultEl.textContent = `오류: ${data.error}`
      }
    }

    showExploreStatus('complete')
    renderMembersList() // 버튼 활성화 상태 업데이트
  })

  // IPC 이벤트 리스너: 로그인 완료
  console.log('[Home] onLoginComplete 이벤트 리스너 등록')
  window.api.naver.onLoginComplete((event, data) => {
    console.log('[Home] 로그인 완료 이벤트 수신:', data)
    console.log('[Home] 현재 상태 - selectedTemplate:', !!selectedTemplate, ', collectedMembers:', collectedMembers.length)
    if (data.success && selectedTemplate && collectedMembers.length > 0) {
      // 로그인 성공 시 자동으로 발송 시작
      console.log('[Home] 로그인 성공 - 자동 발송 시작')
      startSendingMessages()
    } else {
      console.log('[Home] 발송 조건 미충족 - 발송 시작 안함')
    }
  })

  // IPC 이벤트 리스너: 메시지 발송 진행
  window.api.naver.onSendProgress((event, data) => {
    console.log('[Home] 발송 진행:', data)
    updateSendProgressUI(data)
  })

  // IPC 이벤트 리스너: 메시지 발송 완료
  window.api.naver.onSendComplete((event, data) => {
    console.log('[Home] 발송 완료:', data)
    handleSendComplete(data)
  })

  // IPC 이벤트 리스너: CAPTCHA 감지됨
  window.api.naver.onCaptchaRequired((event, data) => {
    console.log('[Home] CAPTCHA 감지됨:', data)
    document.getElementById('captcha-alert')?.classList.remove('hidden')
  })

  // IPC 이벤트 리스너: CAPTCHA 해결됨
  window.api.naver.onCaptchaResolved((event, data) => {
    console.log('[Home] CAPTCHA 해결됨:', data)
    document.getElementById('captcha-alert')?.classList.add('hidden')
  })

  // 중지하기 버튼
  document.getElementById('btn-stop-sending')?.addEventListener('click', async () => {
    if (!isSending) return

    // 중지 확인
    if (!confirm('정말 메시지 발송을 중지하시겠습니까?\n이미 발송된 메시지는 취소되지 않습니다.')) {
      return
    }

    console.log('[Home] 발송 중지 요청')
    try {
      await window.api.naver.stopSending()
    } catch (error) {
      console.error('[Home] 발송 중지 실패:', error)
    }
  })

  // 새로운 탐색 시작 버튼
  document.getElementById('btn-new-search')?.addEventListener('click', () => {
    // 상태 초기화
    collectedMembers = []
    selectedPeriod = '1day'
    selectedTemplate = null
    isSending = false
    sendProgress = { current: 0, total: 0, todaySentCount: 0 }

    // 드롭다운 초기화
    const periodSelect = document.getElementById('period-select')
    const templateSelect = document.getElementById('template-select')
    if (periodSelect) periodSelect.value = '1day'
    if (templateSelect) templateSelect.value = ''

    // 발송 현황 배지 숨김
    document.getElementById('send-count-badge')?.classList.add('hidden')

    // 초기 화면으로 돌아가기
    showExploreView(false)
    renderMembersList()
  })
}

/**
 * 발송 중 상태 확인 함수 (다른 컴포넌트에서 사용)
 * @returns {boolean} 발송 중 여부
 */
export function isCurrentlySending() {
  return isSending
}

/**
 * 탭 이동 전 확인 (발송 중일 때 중지 여부 확인)
 * @returns {Promise<boolean>} 이동 가능 여부
 */
export async function confirmTabChange() {
  if (!isSending) {
    return true
  }

  // 발송 중일 때 확인
  const shouldStop = confirm('메시지 발송이 진행 중입니다.\n발송을 중지하고 다른 탭으로 이동하시겠습니까?')

  if (shouldStop) {
    try {
      await window.api.naver.stopSending()
      return true
    } catch (error) {
      console.error('[Home] 발송 중지 실패:', error)
      return false
    }
  }

  return false
}

// 유틸리티 함수
function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}
