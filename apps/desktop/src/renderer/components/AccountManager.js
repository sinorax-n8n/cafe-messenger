// 계정 관리 컴포넌트 (네이버/다음 계정 지원)

let accounts = []

/**
 * 계정 관리 화면 HTML 생성
 */
export function createAccountManager() {
  return `
    <div class="max-w-6xl mx-auto">
      <!-- 헤더 -->
      <div class="flex justify-between items-center mb-6">
        <div>
          <h2 class="text-3xl font-bold text-gray-800">계정 관리</h2>
          <p class="text-gray-600 mt-1">자동 로그인에 사용할 계정을 관리합니다</p>
        </div>
        <button
          id="btn-add-account"
          class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          + 계정 추가
        </button>
      </div>

      <!-- 계정 목록 테이블 -->
      <div class="bg-white rounded-lg shadow-md overflow-hidden">
        <table class="w-full">
          <thead class="bg-gray-50 border-b border-gray-200">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">활성</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">계정명</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">유형</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">계정 ID</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">비밀번호</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">발송 현황</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">등록일</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">작업</th>
            </tr>
          </thead>
          <tbody id="accounts-table-body" class="bg-white divide-y divide-gray-200">
            <!-- 동적으로 채워짐 -->
          </tbody>
        </table>
      </div>

      <!-- 계정이 없을 때 -->
      <div id="no-accounts" class="hidden text-center py-12">
        <p class="text-gray-500 text-lg">등록된 계정이 없습니다</p>
        <p class="text-gray-400 text-sm mt-2">우측 상단의 "계정 추가" 버튼을 클릭하세요</p>
      </div>

      <!-- 모달: 계정 추가/수정 -->
      <div id="account-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg p-6 w-full max-w-md">
          <h3 id="modal-title" class="text-xl font-bold mb-4">계정 추가</h3>
          <form id="account-form">
            <div class="mb-4">
              <label class="block text-sm font-medium text-gray-700 mb-2">계정명</label>
              <input
                type="text"
                id="input-account-name"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="예: 메인 계정"
                required
              />
            </div>
            <div class="mb-4">
              <label class="block text-sm font-medium text-gray-700 mb-2">계정 유형</label>
              <select
                id="input-account-type"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="naver">네이버</option>
                <option value="daum">다음</option>
              </select>
            </div>
            <div class="mb-4">
              <label id="label-account-id" class="block text-sm font-medium text-gray-700 mb-2">네이버 ID</label>
              <input
                type="text"
                id="input-account-id"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="네이버 아이디"
                required
              />
              <p id="account-id-hint" class="hidden mt-1 text-xs text-gray-500">다음 계정은 이메일 형식으로 입력해주세요 (예: example@daum.net)</p>
            </div>
            <div class="mb-6">
              <label id="label-account-password" class="block text-sm font-medium text-gray-700 mb-2">네이버 비밀번호</label>
              <input
                type="password"
                id="input-account-password"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="비밀번호"
                required
              />
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
 * 계정 목록 렌더링
 */
async function renderAccountsTable() {
  const tbody = document.getElementById('accounts-table-body')
  const noAccounts = document.getElementById('no-accounts')

  if (accounts.length === 0) {
    tbody.innerHTML = ''
    noAccounts?.classList.remove('hidden')
    return
  }

  noAccounts?.classList.add('hidden')

  tbody.innerHTML = accounts.map(account => {
    const sentCount = account.today_sent_count || 0
    const dailyLimit = getDailyLimit(account.account_type)
    const badgeClass = getSentCountBadgeClass(sentCount, dailyLimit)
    const typeBadge = getAccountTypeBadge(account.account_type)

    return `
    <tr class="hover:bg-gray-50">
      <td class="px-6 py-4 whitespace-nowrap">
        <input
          type="radio"
          name="active-account"
          data-id="${account.id}"
          ${account.is_active === 1 ? 'checked' : ''}
          class="w-4 h-4 text-blue-600 focus:ring-blue-500"
        />
      </td>
      <td class="px-6 py-4 whitespace-nowrap">
        <div class="font-medium text-gray-900">${escapeHtml(account.account_name)}</div>
      </td>
      <td class="px-6 py-4 whitespace-nowrap">
        ${typeBadge}
      </td>
      <td class="px-6 py-4 whitespace-nowrap">
        <div class="text-gray-900">${escapeHtml(account.account_id)}</div>
      </td>
      <td class="px-6 py-4 whitespace-nowrap">
        <div class="text-gray-500">********</div>
      </td>
      <td class="px-6 py-4 whitespace-nowrap">
        <span class="${badgeClass}">${sentCount}/${dailyLimit}</span>
      </td>
      <td class="px-6 py-4 whitespace-nowrap">
        <div class="text-sm text-gray-500">${formatDate(account.created_at)}</div>
      </td>
      <td class="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
        <button
          class="btn-delete-account text-red-600 hover:text-red-900"
          data-id="${account.id}"
        >
          삭제
        </button>
      </td>
    </tr>
  `}).join('')

  // 활성 계정 변경 이벤트
  document.querySelectorAll('input[name="active-account"]').forEach(radio => {
    radio.addEventListener('change', async (e) => {
      const id = parseInt(e.target.dataset.id)
      try {
        await window.api.accounts.setActive(id)
        await loadAccounts()
      } catch (error) {
        console.error('활성 계정 변경 실패:', error)
        showToast('활성 계정 변경에 실패했습니다', 'error')
      }
    })
  })

  // 삭제 버튼 이벤트
  document.querySelectorAll('.btn-delete-account').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = parseInt(e.target.dataset.id)
      if (confirm('정말 이 계정을 삭제하시겠습니까?')) {
        try {
          await window.api.accounts.delete(id)
          await loadAccounts()
        } catch (error) {
          console.error('계정 삭제 실패:', error)
          showToast('계정 삭제에 실패했습니다', 'error')
        }
      }
    })
  })
}

/**
 * 계정 목록 로드
 */
async function loadAccounts() {
  try {
    accounts = await window.api.accounts.getAll()
    await renderAccountsTable()
  } catch (error) {
    console.error('계정 목록 로드 실패:', error)
    showToast('계정 목록을 불러올 수 없습니다', 'error')
  }
}

/**
 * 모달 열기
 */
function openModal() {
  const modal = document.getElementById('account-modal')
  modal?.classList.remove('hidden')
}

/**
 * 모달 닫기
 */
function closeModal() {
  const modal = document.getElementById('account-modal')
  modal?.classList.add('hidden')
  document.getElementById('account-form')?.reset()
}

/**
 * 이벤트 핸들러 등록
 */
export function attachAccountManagerEvents() {
  // 계정 추가 버튼
  document.getElementById('btn-add-account')?.addEventListener('click', openModal)

  // 모달 취소 버튼
  document.getElementById('btn-cancel-modal')?.addEventListener('click', closeModal)

  // 계정 유형 드롭다운 변경 시 라벨/placeholder 동적 변경
  document.getElementById('input-account-type')?.addEventListener('change', (e) => {
    updateAccountTypeUI(e.target.value)
  })

  // 계정 폼 제출
  document.getElementById('account-form')?.addEventListener('submit', async (e) => {
    e.preventDefault()

    const accountName = document.getElementById('input-account-name').value
    const accountType = document.getElementById('input-account-type').value
    const accountId = document.getElementById('input-account-id').value
    const accountPassword = document.getElementById('input-account-password').value

    // 다음 계정 이메일 형식 검증 (클라이언트 측)
    if (accountType === 'daum') {
      if (!accountId.includes('@') || !accountId.includes('.')) {
        showToast('다음 계정은 이메일 형식의 ID가 필요합니다', 'error')
        return
      }
    }

    try {
      await window.api.accounts.create({
        account_name: accountName,
        account_type: accountType,
        account_id: accountId,
        account_password: accountPassword
      })

      closeModal()
      await loadAccounts()
      showToast('계정이 추가되었습니다', 'success')
    } catch (error) {
      console.error('계정 추가 실패:', error)
      showToast(error.message || '계정 추가에 실패했습니다', 'error')
    }
  })

  // 초기 데이터 로드
  loadAccounts()
}

/**
 * 계정 유형에 따라 UI 동적 변경
 * @param {string} type - 계정 유형 ('naver' 또는 'daum')
 */
function updateAccountTypeUI(type) {
  const labelEl = document.getElementById('label-account-id')
  const inputEl = document.getElementById('input-account-id')
  const hintEl = document.getElementById('account-id-hint')
  const pwLabelEl = document.getElementById('label-account-password')

  if (type === 'daum') {
    labelEl.textContent = '다음 이메일'
    inputEl.placeholder = 'example@daum.net'
    hintEl?.classList.remove('hidden')
    pwLabelEl.textContent = '다음 비밀번호'
  } else {
    labelEl.textContent = '네이버 ID'
    inputEl.placeholder = '네이버 아이디'
    hintEl?.classList.add('hidden')
    pwLabelEl.textContent = '네이버 비밀번호'
  }
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
  // 간단한 토스트 알림 (추후 개선 가능)
  alert(message)
}

/**
 * 계정 유형별 일일 발송 한도 반환
 * @param {string} accountType - 계정 유형 ('naver' 또는 'daum')
 * @returns {number} 일일 발송 한도
 */
function getDailyLimit(accountType) {
  return accountType === 'daum' ? 20 : 50
}

/**
 * 발송 현황에 따른 배지 클래스 반환 (비율 기반)
 * @param {number} count - 오늘 발송 수
 * @param {number} limit - 일일 발송 한도
 * @returns {string} TailwindCSS 클래스
 */
function getSentCountBadgeClass(count, limit = 50) {
  const baseClass = 'px-2 py-1 text-xs font-medium rounded-full'
  const ratio = count / limit

  if (ratio >= 1) {
    return `${baseClass} bg-red-100 text-red-800`
  } else if (ratio >= 0.8) {
    return `${baseClass} bg-orange-100 text-orange-800`
  } else if (ratio >= 0.6) {
    return `${baseClass} bg-yellow-100 text-yellow-800`
  } else {
    return `${baseClass} bg-green-100 text-green-800`
  }
}

/**
 * 계정 유형에 따른 배지 HTML 반환
 * @param {string} type - 계정 유형 ('naver' 또는 'daum')
 * @returns {string} 배지 HTML
 */
function getAccountTypeBadge(type) {
  if (type === 'daum') {
    return '<span class="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">다음</span>'
  }
  // 기본값: 네이버
  return '<span class="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">네이버</span>'
}
