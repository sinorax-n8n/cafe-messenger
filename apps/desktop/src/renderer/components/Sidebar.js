// 사이드바 네비게이션 컴포넌트

const menuItems = [
  { id: 'home', icon: '🏠', label: '홈', description: '메시지 전송' },
  { id: 'accounts', icon: '🔑', label: '계정 관리', description: '네이버 계정 관리' },
  { id: 'cafes', icon: '🏢', label: '카페 관리', description: '카페 링크 관리' },
  { id: 'templates', icon: '📝', label: '템플릿 관리', description: '쪽지 템플릿' },
  { id: 'members', icon: '👥', label: '회원 관리', description: '수신자 관리' }
]

let currentView = 'home' // 기본 화면

/**
 * 사이드바 HTML 생성
 */
export function createSidebar() {
  return `
    <div class="flex flex-col h-full">
      <!-- 헤더 -->
      <div class="p-6 border-b border-gray-200">
        <h1 class="text-2xl font-bold text-blue-600">카페 메신저</h1>
        <p class="text-xs text-gray-500 mt-1">네이버 카페 쪽지 자동화</p>
      </div>

      <!-- 메뉴 리스트 -->
      <nav class="flex-1 p-4">
        <ul class="space-y-2">
          ${menuItems.map(item => `
            <li>
              <button
                id="menu-${item.id}"
                class="menu-item w-full text-left px-4 py-3 rounded-lg transition-colors ${
                  currentView === item.id
                    ? 'bg-blue-50 text-blue-600 font-semibold'
                    : 'text-gray-700 hover:bg-gray-100'
                }"
                data-view="${item.id}"
              >
                <div class="flex items-center">
                  <span class="text-2xl mr-3">${item.icon}</span>
                  <div>
                    <div class="font-medium">${item.label}</div>
                    <div class="text-xs text-gray-500">${item.description}</div>
                  </div>
                </div>
              </button>
            </li>
          `).join('')}
        </ul>
      </nav>

      <!-- 푸터 -->
      <div class="p-4 border-t border-gray-200">
        <p class="text-xs text-gray-500 text-center">
          Electron ${window.versions.electron()}<br/>
          Node ${window.versions.node()}
        </p>
      </div>
    </div>
  `
}

/**
 * 메뉴 아이템 클릭 핸들러 등록
 * @param {Function} onNavigate - 화면 전환 콜백
 */
export function attachSidebarEvents(onNavigate) {
  menuItems.forEach(item => {
    const button = document.getElementById(`menu-${item.id}`)
    if (button) {
      button.addEventListener('click', () => {
        // 이전 활성 메뉴 비활성화
        document.querySelectorAll('.menu-item').forEach(btn => {
          btn.classList.remove('bg-blue-50', 'text-blue-600', 'font-semibold')
          btn.classList.add('text-gray-700', 'hover:bg-gray-100')
        })

        // 현재 메뉴 활성화
        button.classList.remove('text-gray-700', 'hover:bg-gray-100')
        button.classList.add('bg-blue-50', 'text-blue-600', 'font-semibold')

        currentView = item.id
        onNavigate(item.id)
      })
    }
  })
}

/**
 * 현재 활성화된 뷰 반환
 */
export function getCurrentView() {
  return currentView
}
