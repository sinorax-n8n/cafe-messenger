// 카페 링크 관리 컴포넌트

let cafes = []

/**
 * 카페 관리 화면 HTML 생성
 */
export function createCafeManager() {
  return `
    <div class="max-w-6xl mx-auto">
      <!-- 헤더 -->
      <div class="flex justify-between items-center mb-6">
        <div>
          <h2 class="text-3xl font-bold text-gray-800">카페 링크 관리</h2>
          <p class="text-gray-600 mt-1">자동 접속할 네이버/다음 카페를 관리합니다</p>
        </div>
        <button
          id="btn-add-cafe"
          class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          + 카페 추가
        </button>
      </div>

      <!-- 카페 목록 테이블 -->
      <div class="bg-white rounded-lg shadow-md overflow-x-auto">
        <table class="w-full min-w-max">
          <thead class="bg-gray-50 border-b border-gray-200">
            <tr>
              <th class="w-16 px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">활성</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">카페명</th>
              <th class="w-24 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">유형</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">카페 URL</th>
              <th class="w-16 px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider sticky right-0 bg-gray-50">작업</th>
            </tr>
          </thead>
          <tbody id="cafes-table-body" class="bg-white divide-y divide-gray-200">
            <!-- 동적으로 채워짐 -->
          </tbody>
        </table>
      </div>

      <!-- 카페가 없을 때 -->
      <div id="no-cafes" class="hidden text-center py-12">
        <p class="text-gray-500 text-lg">등록된 카페가 없습니다</p>
        <p class="text-gray-400 text-sm mt-2">우측 상단의 "카페 추가" 버튼을 클릭하세요</p>
      </div>

      <!-- 모달: 카페 추가/수정 -->
      <div id="cafe-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg p-6 w-full max-w-md">
          <h3 id="modal-title" class="text-xl font-bold mb-4">카페 추가</h3>
          <form id="cafe-form">
            <div class="mb-4">
              <label class="block text-sm font-medium text-gray-700 mb-2">카페명</label>
              <input
                type="text"
                id="input-cafe-name"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="예: 부동산 카페"
                required
              />
            </div>
            <div class="mb-6">
              <label class="block text-sm font-medium text-gray-700 mb-2">카페 URL</label>
              <input
                type="url"
                id="input-cafe-url"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="https://cafe.naver.com/카페명"
                required
              />
              <p id="cafe-url-hint" class="text-xs text-gray-500 mt-1">전체 URL을 입력하세요 (카페 유형 자동 감지)</p>
            </div>
            <div class="flex space-x-3">
              <button
                type="submit"
                class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                저장
              </button>
              <button
                type="button"
                id="btn-cancel-modal"
                class="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors font-medium"
              >
                취소
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `
}

/**
 * 카페 목록 렌더링
 */
async function renderCafesTable() {
  const tbody = document.getElementById('cafes-table-body')
  const noCafes = document.getElementById('no-cafes')

  if (cafes.length === 0) {
    tbody.innerHTML = ''
    noCafes?.classList.remove('hidden')
    return
  }

  noCafes?.classList.add('hidden')

  tbody.innerHTML = cafes.map(cafe => {
    const typeBadge = getCafeTypeBadge(cafe.cafe_type)
    return `
    <tr class="group hover:bg-gray-50">
      <td class="px-6 py-4 whitespace-nowrap text-center">
        <input
          type="checkbox"
          class="cafe-active-checkbox w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
          data-id="${cafe.id}"
          ${cafe.is_active === 1 ? 'checked' : ''}
        />
      </td>
      <td class="px-6 py-4 whitespace-nowrap">
        <div class="font-medium text-gray-900">${escapeHtml(cafe.cafe_name)}</div>
      </td>
      <td class="px-6 py-4 whitespace-nowrap">
        ${typeBadge}
      </td>
      <td class="px-6 py-4">
        <div class="text-sm text-blue-600 truncate max-w-md">
          <a href="${escapeHtml(cafe.cafe_url)}" target="_blank" class="hover:underline">
            ${escapeHtml(cafe.cafe_url)}
          </a>
        </div>
      </td>
      <td class="action-cell px-6 py-4 whitespace-nowrap text-sm font-medium sticky right-0 bg-white group-hover:bg-gray-50" data-id="${cafe.id}">
        <div class="relative flex justify-center">
          <button class="btn-action-menu p-2 hover:bg-gray-200 rounded-lg" data-id="${cafe.id}">
            <span class="text-gray-500 text-lg">⋯</span>
          </button>
          <div class="action-dropdown hidden absolute right-0 top-full mt-1 w-24 bg-white rounded-lg shadow-lg border" data-id="${cafe.id}">
            <button class="btn-delete-cafe w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg" data-id="${cafe.id}">
              삭제
            </button>
          </div>
        </div>
      </td>
    </tr>
  `}).join('')

  // 활성/비활성 체크박스 이벤트
  document.querySelectorAll('.cafe-active-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', async (e) => {
      const id = parseInt(e.target.dataset.id)
      const isActive = e.target.checked ? 1 : 0

      try {
        await window.api.cafes.update(id, { is_active: isActive })
        showToast(isActive === 1 ? '카페가 활성화되었습니다' : '카페가 비활성화되었습니다', 'success')
      } catch (error) {
        console.error('카페 상태 변경 실패:', error)
        // 실패 시 체크박스 상태 복원
        e.target.checked = !e.target.checked
        showToast('카페 상태 변경에 실패했습니다', 'error')
      }
    })
  })

  // 드롭다운 메뉴 토글 이벤트
  document.querySelectorAll('.btn-action-menu').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const id = btn.dataset.id
      const dropdown = document.querySelector(`.action-dropdown[data-id="${id}"]`)
      const cell = document.querySelector(`.action-cell[data-id="${id}"]`)

      // 다른 드롭다운 모두 닫기 및 z-index 초기화
      document.querySelectorAll('.action-dropdown').forEach(d => {
        if (d !== dropdown) d.classList.add('hidden')
      })
      document.querySelectorAll('.action-cell').forEach(c => {
        if (c !== cell) c.style.zIndex = ''
      })

      // 현재 드롭다운 토글 및 z-index 설정
      const isOpening = dropdown?.classList.toggle('hidden') === false
      if (cell) cell.style.zIndex = isOpening ? '50' : ''
    })
  })

  // 외부 클릭 시 드롭다운 닫기
  document.addEventListener('click', () => {
    document.querySelectorAll('.action-dropdown').forEach(d => d.classList.add('hidden'))
    document.querySelectorAll('.action-cell').forEach(c => c.style.zIndex = '')
  })

  // 삭제 버튼 이벤트
  document.querySelectorAll('.btn-delete-cafe').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const id = parseInt(e.target.dataset.id)

      // 드롭다운 닫기
      document.querySelectorAll('.action-dropdown').forEach(d => d.classList.add('hidden'))

      if (confirm('정말 이 카페를 삭제하시겠습니까?')) {
        try {
          await window.api.cafes.delete(id)
          await loadCafes()
          showToast('카페가 삭제되었습니다', 'success')
        } catch (error) {
          console.error('카페 삭제 실패:', error)
          showToast('카페 삭제에 실패했습니다', 'error')
        }
      }
    })
  })
}

/**
 * 카페 목록 로드
 */
async function loadCafes() {
  try {
    cafes = await window.api.cafes.getAll()
    await renderCafesTable()
  } catch (error) {
    console.error('카페 목록 로드 실패:', error)
    showToast('카페 목록을 불러올 수 없습니다', 'error')
  }
}

/**
 * 모달 열기
 */
function openModal() {
  const modal = document.getElementById('cafe-modal')
  modal?.classList.remove('hidden')
}

/**
 * 모달 닫기
 */
function closeModal() {
  const modal = document.getElementById('cafe-modal')
  modal?.classList.add('hidden')
  document.getElementById('cafe-form')?.reset()

  // 힌트 초기화
  const hintEl = document.getElementById('cafe-url-hint')
  const inputEl = document.getElementById('input-cafe-url')
  if (hintEl) hintEl.textContent = '전체 URL을 입력하세요 (카페 유형 자동 감지)'
  if (inputEl) inputEl.placeholder = 'https://cafe.naver.com/카페명'
}

/**
 * 이벤트 핸들러 등록
 */
export function attachCafeManagerEvents() {
  // 카페 추가 버튼
  document.getElementById('btn-add-cafe')?.addEventListener('click', openModal)

  // 모달 취소 버튼
  document.getElementById('btn-cancel-modal')?.addEventListener('click', closeModal)

  // URL 입력 시 카페 유형 실시간 감지
  document.getElementById('input-cafe-url')?.addEventListener('input', (e) => {
    updateCafeUrlHint(e.target.value)
  })

  // 카페 폼 제출
  document.getElementById('cafe-form')?.addEventListener('submit', async (e) => {
    e.preventDefault()

    const cafeName = document.getElementById('input-cafe-name').value
    const cafeUrl = document.getElementById('input-cafe-url').value

    try {
      await window.api.cafes.create({
        cafe_name: cafeName,
        cafe_url: cafeUrl
      })

      closeModal()
      await loadCafes()
    } catch (error) {
      console.error('카페 추가 실패:', error)
      showToast(error.message || '카페 추가에 실패했습니다', 'error')
    }
  })

  // 초기 데이터 로드
  loadCafes()
}

// 유틸리티 함수들
function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function showToast(message) {
  alert(message)
}

/**
 * 카페 유형에 따른 배지 HTML 반환
 * @param {string} type - 카페 유형 ('naver' 또는 'daum')
 * @returns {string} 배지 HTML
 */
function getCafeTypeBadge(type) {
  if (type === 'daum') {
    return '<span class="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">다음</span>'
  }
  // 기본값: 네이버
  return '<span class="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">네이버</span>'
}

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
 * URL 입력에 따라 힌트 텍스트 업데이트
 * @param {string} url - 입력된 URL
 */
function updateCafeUrlHint(url) {
  const hintEl = document.getElementById('cafe-url-hint')
  const inputEl = document.getElementById('input-cafe-url')
  if (!hintEl || !inputEl) return

  const cafeType = detectCafeType(url)

  if (cafeType === 'daum') {
    hintEl.innerHTML = '<span class="text-yellow-600 font-medium">다음 카페</span> 감지됨 - 형식: https://cafe.daum.net/{카페ID}/{게시판ID}'
    inputEl.placeholder = 'https://cafe.daum.net/카페ID/게시판ID'
  } else {
    if (url && url.includes('cafe.naver.com')) {
      hintEl.innerHTML = '<span class="text-green-600 font-medium">네이버 카페</span> 감지됨'
    } else {
      hintEl.textContent = '전체 URL을 입력하세요 (카페 유형 자동 감지)'
    }
    inputEl.placeholder = 'https://cafe.naver.com/카페명'
  }
}
