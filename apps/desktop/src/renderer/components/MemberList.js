// 회원 관리 컴포넌트

let members = []
let cafes = []
let selectedCafeId = null

/**
 * 회원 관리 화면 HTML 생성
 */
export function createMemberList() {
  return `
    <div class="h-full flex flex-col overflow-hidden">
      <!-- 헤더 -->
      <div class="flex justify-between items-center mb-4">
        <div>
          <h2 class="text-3xl font-bold text-gray-800">회원 관리</h2>
          <p class="text-gray-600 mt-1">쪽지 수신자를 관리합니다</p>
        </div>
        <button
          id="btn-add-member"
          class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          + 회원 추가
        </button>
      </div>

      <!-- 필터 및 검색 -->
      <div class="bg-white rounded-lg shadow-md p-4 mb-4">
        <div class="flex space-x-4">
          <div class="flex-1">
            <label class="block text-sm font-medium text-gray-700 mb-2">카페 선택</label>
            <select
              id="filter-cafe"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">전체 카페</option>
              <!-- 동적으로 채워짐 -->
            </select>
          </div>
          <div class="flex-1">
            <label class="block text-sm font-medium text-gray-700 mb-2">검색</label>
            <input
              type="text"
              id="search-member"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="닉네임 또는 ID로 검색..."
            />
          </div>
        </div>
      </div>

      <!-- 회원 목록 테이블 (스크롤 가능) -->
      <div class="flex-1 bg-white rounded-lg shadow-md flex flex-col min-h-0 overflow-hidden">
        <!-- 테이블 헤더 (고정) -->
        <table class="w-full table-fixed">
          <thead class="bg-gray-50 border-b border-gray-200">
            <tr>
              <th class="w-1/4 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">카페</th>
              <th class="w-1/4 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">닉네임</th>
              <th class="w-1/4 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">등록일</th>
              <th class="w-1/4 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">작업</th>
            </tr>
          </thead>
        </table>
        <!-- 테이블 본문 (스크롤) -->
        <div class="flex-1 overflow-y-auto min-h-0">
          <table class="w-full table-fixed">
            <tbody id="members-table-body" class="bg-white divide-y divide-gray-200">
              <!-- 동적으로 채워짐 -->
            </tbody>
          </table>
        </div>
      </div>

      <!-- 회원이 없을 때 -->
      <div id="no-members" class="hidden text-center py-12">
        <p class="text-gray-500 text-lg">등록된 회원이 없습니다</p>
        <p class="text-gray-400 text-sm mt-2">우측 상단의 "회원 추가" 버튼을 클릭하세요</p>
      </div>

      <!-- 모달: 회원 추가/수정 -->
      <div id="member-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg p-6 w-full max-w-md">
          <h3 id="modal-title" class="text-xl font-bold mb-4">회원 추가</h3>
          <form id="member-form">
            <div class="mb-4">
              <label class="block text-sm font-medium text-gray-700 mb-2">카페 선택 *</label>
              <select
                id="input-cafe-id"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">카페를 선택하세요</option>
                <!-- 동적으로 채워짐 -->
              </select>
            </div>
            <div class="mb-4">
              <label class="block text-sm font-medium text-gray-700 mb-2">닉네임 *</label>
              <input
                type="text"
                id="input-nickname"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="회원 닉네임"
                required
              />
            </div>
            <div class="flex space-x-3 mt-6">
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
 * 회원 목록 렌더링
 */
async function renderMembersTable() {
  const tbody = document.getElementById('members-table-body')
  const noMembers = document.getElementById('no-members')

  // 필터링된 회원 목록
  const filteredMembers = filterMembers()

  if (filteredMembers.length === 0) {
    tbody.innerHTML = ''
    noMembers?.classList.remove('hidden')
    return
  }

  noMembers?.classList.add('hidden')

  tbody.innerHTML = filteredMembers.map(member => {
    const cafe = cafes.find(c => c.id === member.cafe_id)
    return `
      <tr class="hover:bg-gray-50">
        <td class="w-1/4 px-6 py-4 whitespace-nowrap overflow-hidden text-ellipsis">
          <div class="text-sm font-medium text-gray-900 truncate">${cafe ? escapeHtml(cafe.cafe_name) : '-'}</div>
        </td>
        <td class="w-1/4 px-6 py-4 whitespace-nowrap overflow-hidden text-ellipsis">
          <div class="font-medium text-gray-900 truncate">${escapeHtml(member.nickname)}</div>
        </td>
        <td class="w-1/4 px-6 py-4 whitespace-nowrap">
          <div class="text-sm text-gray-500">${formatDate(member.created_at)}</div>
        </td>
        <td class="w-1/4 px-6 py-4 whitespace-nowrap text-sm font-medium">
          <button
            class="btn-delete-member text-red-600 hover:text-red-900"
            data-id="${member.id}"
          >
            삭제
          </button>
        </td>
      </tr>
    `
  }).join('')

  // 삭제 버튼 이벤트
  document.querySelectorAll('.btn-delete-member').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = parseInt(e.target.dataset.id)
      if (confirm('정말 이 회원을 삭제하시겠습니까?')) {
        try {
          await window.api.members.delete(id)
          await loadMembers()
        } catch (error) {
          console.error('회원 삭제 실패:', error)
          showToast('회원 삭제에 실패했습니다', 'error')
        }
      }
    })
  })
}

/**
 * 회원 필터링
 */
function filterMembers() {
  let filtered = [...members]

  // 카페 필터
  if (selectedCafeId) {
    filtered = filtered.filter(m => m.cafe_id === parseInt(selectedCafeId))
  }

  // 검색어 필터
  const searchTerm = document.getElementById('search-member')?.value.toLowerCase()
  if (searchTerm) {
    filtered = filtered.filter(m =>
      m.nickname.toLowerCase().includes(searchTerm) ||
      (m.user_id && m.user_id.toLowerCase().includes(searchTerm))
    )
  }

  return filtered
}

/**
 * 카페 드롭다운 렌더링
 */
function renderCafeDropdowns() {
  const filterCafe = document.getElementById('filter-cafe')
  const inputCafeId = document.getElementById('input-cafe-id')

  const cafeOptions = cafes.map(cafe =>
    `<option value="${cafe.id}">${escapeHtml(cafe.cafe_name)}</option>`
  ).join('')

  if (filterCafe) {
    filterCafe.innerHTML = '<option value="">전체 카페</option>' + cafeOptions
  }

  if (inputCafeId) {
    inputCafeId.innerHTML = '<option value="">카페를 선택하세요</option>' + cafeOptions
  }
}

/**
 * 데이터 로드
 */
async function loadMembers() {
  try {
    members = await window.api.members.getAll()
    await renderMembersTable()
  } catch (error) {
    console.error('회원 목록 로드 실패:', error)
    showToast('회원 목록을 불러올 수 없습니다', 'error')
  }
}

async function loadCafes() {
  try {
    cafes = await window.api.cafes.getAll()
    renderCafeDropdowns()
  } catch (error) {
    console.error('카페 목록 로드 실패:', error)
  }
}

/**
 * 모달 열기
 */
function openModal() {
  const modal = document.getElementById('member-modal')
  modal?.classList.remove('hidden')
}

/**
 * 모달 닫기
 */
function closeModal() {
  const modal = document.getElementById('member-modal')
  modal?.classList.add('hidden')
  document.getElementById('member-form')?.reset()
}

/**
 * 이벤트 핸들러 등록
 */
export function attachMemberListEvents() {
  // 회원 추가 버튼
  document.getElementById('btn-add-member')?.addEventListener('click', openModal)

  // 모달 취소 버튼
  document.getElementById('btn-cancel-modal')?.addEventListener('click', closeModal)

  // 카페 필터 변경
  document.getElementById('filter-cafe')?.addEventListener('change', (e) => {
    selectedCafeId = e.target.value
    renderMembersTable()
  })

  // 검색어 입력
  document.getElementById('search-member')?.addEventListener('input', () => {
    renderMembersTable()
  })

  // 회원 폼 제출
  document.getElementById('member-form')?.addEventListener('submit', async (e) => {
    e.preventDefault()

    const cafeId = document.getElementById('input-cafe-id').value
    const nickname = document.getElementById('input-nickname').value

    if (!cafeId) {
      showToast('카페를 선택해주세요', 'error')
      return
    }

    try {
      await window.api.members.create({
        cafe_id: parseInt(cafeId),
        nickname: nickname,
        user_id: null
      })

      closeModal()
      await loadMembers()
      showToast('회원이 추가되었습니다', 'success')
    } catch (error) {
      console.error('회원 추가 실패:', error)
      showToast(error.message || '회원 추가에 실패했습니다', 'error')
    }
  })

  // 초기 데이터 로드
  loadCafes()
  loadMembers()
}

// 유틸리티 함수들
function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function formatDate(dateString) {
  if (!dateString) return '-'
  const date = new Date(dateString)
  return date.toLocaleDateString('ko-KR')
}

function showToast(message, type = 'info') {
  alert(message)
}
