// 쪽지 템플릿 관리 컴포넌트

let templates = []

/**
 * 템플릿 관리 화면 HTML 생성
 */
export function createTemplateManager() {
  return `
    <div class="max-w-6xl mx-auto">
      <!-- 헤더 -->
      <div class="flex justify-between items-center mb-6">
        <div>
          <h2 class="text-3xl font-bold text-gray-800">템플릿 관리</h2>
          <p class="text-gray-600 mt-1">쪽지 발송에 사용할 템플릿을 관리합니다</p>
        </div>
        <button
          id="btn-add-template"
          class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          + 템플릿 추가
        </button>
      </div>

      <!-- 템플릿 카드 그리드 -->
      <div id="templates-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <!-- 동적으로 채워짐 -->
      </div>

      <!-- 템플릿이 없을 때 -->
      <div id="no-templates" class="hidden text-center py-12">
        <p class="text-gray-500 text-lg">등록된 템플릿이 없습니다</p>
        <p class="text-gray-400 text-sm mt-2">우측 상단의 "템플릿 추가" 버튼을 클릭하세요</p>
      </div>

      <!-- 모달: 템플릿 추가/수정 -->
      <div id="template-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg p-6 w-full max-w-2xl">
          <h3 id="modal-title" class="text-xl font-bold mb-4">템플릿 추가</h3>
          <form id="template-form">
            <div class="mb-4">
              <label class="block text-sm font-medium text-gray-700 mb-2">템플릿 이름</label>
              <input
                type="text"
                id="input-template-name"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="예: 환영 메시지"
                required
              />
            </div>
            <div class="mb-6">
              <label class="block text-sm font-medium text-gray-700 mb-2">내용</label>
              <textarea
                id="input-template-content"
                rows="8"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="쪽지 내용을 입력하세요..."
                required
              ></textarea>
              <p class="text-xs text-gray-500 mt-1">
                팁: {name}, {date} 등의 변수를 사용할 수 있습니다 (추후 구현 예정)
              </p>
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
 * 템플릿 카드 렌더링
 */
async function renderTemplatesGrid() {
  const grid = document.getElementById('templates-grid')
  const noTemplates = document.getElementById('no-templates')

  if (templates.length === 0) {
    grid.innerHTML = ''
    noTemplates?.classList.remove('hidden')
    return
  }

  noTemplates?.classList.add('hidden')

  grid.innerHTML = templates.map(template => `
    <div class="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
      <div class="flex justify-between items-start mb-3">
        <h3 class="text-lg font-bold text-gray-800">${escapeHtml(template.name)}</h3>
        <div class="flex space-x-2">
          <button
            class="btn-edit-template text-blue-600 hover:text-blue-900"
            data-id="${template.id}"
          >
            ✏️
          </button>
          <button
            class="btn-delete-template text-red-600 hover:text-red-900"
            data-id="${template.id}"
          >
            🗑️
          </button>
        </div>
      </div>
      <div class="bg-gray-50 rounded p-3 mb-3 max-h-32 overflow-y-auto">
        <p class="text-sm text-gray-700 whitespace-pre-wrap">${escapeHtml(template.content)}</p>
      </div>
      <div class="text-xs text-gray-500">
        등록일: ${formatDate(template.created_at)}
      </div>
    </div>
  `).join('')

  // 수정 버튼 이벤트
  document.querySelectorAll('.btn-edit-template').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = parseInt(e.target.dataset.id)
      editTemplate(id)
    })
  })

  // 삭제 버튼 이벤트
  document.querySelectorAll('.btn-delete-template').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = parseInt(e.target.dataset.id)
      if (confirm('정말 이 템플릿을 삭제하시겠습니까?')) {
        try {
          await window.api.templates.delete(id)
          await loadTemplates()
        } catch (error) {
          console.error('템플릿 삭제 실패:', error)
          showToast('템플릿 삭제에 실패했습니다', 'error')
        }
      }
    })
  })
}

/**
 * 템플릿 목록 로드
 */
async function loadTemplates() {
  try {
    templates = await window.api.templates.getAll()
    await renderTemplatesGrid()
  } catch (error) {
    console.error('템플릿 목록 로드 실패:', error)
    showToast('템플릿 목록을 불러올 수 없습니다', 'error')
  }
}

/**
 * 템플릿 수정
 */
function editTemplate(id) {
  const template = templates.find(t => t.id === id)
  if (!template) return

  document.getElementById('modal-title').textContent = '템플릿 수정'
  document.getElementById('input-template-name').value = template.name
  document.getElementById('input-template-content').value = template.content

  // 폼에 템플릿 ID 저장
  const form = document.getElementById('template-form')
  form.dataset.editId = id

  openModal()
}

/**
 * 모달 열기
 */
function openModal() {
  const modal = document.getElementById('template-modal')
  modal?.classList.remove('hidden')
}

/**
 * 모달 닫기
 */
function closeModal() {
  const modal = document.getElementById('template-modal')
  modal?.classList.add('hidden')
  document.getElementById('template-form')?.reset()
  delete document.getElementById('template-form').dataset.editId
  document.getElementById('modal-title').textContent = '템플릿 추가'
}

/**
 * 이벤트 핸들러 등록
 */
export function attachTemplateManagerEvents() {
  // 템플릿 추가 버튼
  document.getElementById('btn-add-template')?.addEventListener('click', () => {
    delete document.getElementById('template-form').dataset.editId
    document.getElementById('modal-title').textContent = '템플릿 추가'
    openModal()
  })

  // 모달 취소 버튼
  document.getElementById('btn-cancel-modal')?.addEventListener('click', closeModal)

  // 템플릿 폼 제출
  document.getElementById('template-form')?.addEventListener('submit', async (e) => {
    e.preventDefault()

    const form = e.target
    const editId = form.dataset.editId
    const name = document.getElementById('input-template-name').value
    const content = document.getElementById('input-template-content').value

    try {
      if (editId) {
        // 수정
        await window.api.templates.update(parseInt(editId), { name, content })
        showToast('템플릿이 수정되었습니다', 'success')
      } else {
        // 생성
        await window.api.templates.create({ name, content })
      }

      closeModal()
      await loadTemplates()
    } catch (error) {
      console.error('템플릿 저장 실패:', error)
      showToast(error.message || '템플릿 저장에 실패했습니다', 'error')
    }
  })

  // 초기 데이터 로드
  loadTemplates()
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
