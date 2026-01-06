// 메인 레이아웃 컴포넌트
// 사이드바 + 메인 컨텐츠 영역으로 구성

export function createLayout() {
  return `
    <div class="flex h-screen bg-gray-100">
      <!-- 사이드바 -->
      <aside id="sidebar" class="w-64 bg-white shadow-lg">
        <!-- Sidebar 컴포넌트가 여기에 렌더링됨 -->
      </aside>

      <!-- 메인 컨텐츠 영역 -->
      <main class="flex-1 overflow-hidden">
        <div id="main-content" class="h-full p-8">
          <!-- 각 화면 컴포넌트가 여기에 렌더링됨 -->
        </div>
      </main>
    </div>
  `
}

/**
 * 메인 컨텐츠 영역에 새로운 화면 렌더링
 * @param {string} html - 렌더링할 HTML 문자열
 */
export function renderMainContent(html) {
  const mainContent = document.getElementById('main-content')
  if (mainContent) {
    mainContent.innerHTML = html
  }
}

/**
 * 사이드바 영역에 컴포넌트 렌더링
 * @param {string} html - 렌더링할 HTML 문자열
 */
export function renderSidebar(html) {
  const sidebar = document.getElementById('sidebar')
  if (sidebar) {
    sidebar.innerHTML = html
  }
}
