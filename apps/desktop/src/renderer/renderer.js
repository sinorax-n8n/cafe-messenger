// 컴포넌트 import
import { createLayout, renderMainContent, renderSidebar } from './components/Layout.js'
import { createSidebar, attachSidebarEvents } from './components/Sidebar.js'
import { createHome, attachHomeEvents, confirmTabChange } from './components/Home.js'
import { createAccountManager, attachAccountManagerEvents } from './components/AccountManager.js'
import { createCafeManager, attachCafeManagerEvents } from './components/CafeManager.js'
import { createTemplateManager, attachTemplateManagerEvents } from './components/TemplateManager.js'
import { createMemberList, attachMemberListEvents } from './components/MemberList.js'

// 현재 화면 상태 (초기값 null로 설정하여 첫 렌더링 보장)
let currentView = null

/**
 * 앱 초기화
 */
function initApp() {
  console.log('[App] Initializing...')
  console.log('[App] Electron:', window.versions.electron())
  console.log('[App] Chrome:', window.versions.chrome())
  console.log('[App] Node:', window.versions.node())

  // 레이아웃 렌더링
  const app = document.getElementById('app')
  app.innerHTML = createLayout()

  // 사이드바 렌더링 및 이벤트 연결
  renderSidebar(createSidebar())
  attachSidebarEvents(handleNavigation)

  // 기본 화면 표시 (홈)
  handleNavigation('home')

  console.log('[App] ✅ Initialized successfully')
}

/**
 * 화면 전환 핸들러
 * @param {string} view - 화면 ID (home, accounts, cafes, templates, members)
 */
async function handleNavigation(view) {
  // 같은 화면이면 무시
  if (view === currentView) {
    return
  }

  console.log('[Navigation] Switching to:', view)

  // 홈 화면에서 다른 화면으로 이동 시 발송 중 확인
  if (currentView === 'home' && view !== 'home') {
    const canProceed = await confirmTabChange()
    if (!canProceed) {
      console.log('[Navigation] 탭 전환 취소됨 (발송 진행 중)')
      return
    }
  }

  // 로그인 창 닫기 (홈이 아닌 다른 화면으로 이동 시)
  if (view !== 'home' && window.api.naver) {
    window.api.naver.closeWindow().catch(() => {})
  }

  // 현재 화면 업데이트
  currentView = view

  switch (view) {
    case 'home':
      renderMainContent(createHome())
      attachHomeEvents()
      break

    case 'accounts':
      renderMainContent(createAccountManager())
      attachAccountManagerEvents()
      break

    case 'cafes':
      renderMainContent(createCafeManager())
      attachCafeManagerEvents()
      break

    case 'templates':
      renderMainContent(createTemplateManager())
      attachTemplateManagerEvents()
      break

    case 'members':
      renderMainContent(createMemberList())
      attachMemberListEvents()
      break

    default:
      console.warn('[Navigation] Unknown view:', view)
      renderMainContent('<div class="p-8"><h2 class="text-2xl">준비 중입니다</h2></div>')
  }
}

// DOM 로드 완료 후 앱 초기화
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp)
} else {
  initApp()
}