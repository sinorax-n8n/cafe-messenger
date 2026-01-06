const { contextBridge, ipcRenderer } = require('electron')

// 버전 정보 노출
contextBridge.exposeInMainWorld('versions', {
  node: () => process.versions.node,
  chrome: () => process.versions.chrome,
  electron: () => process.versions.electron
})

// IPC API 노출 - Main 프로세스와의 안전한 통신
contextBridge.exposeInMainWorld('api', {
  // 네이버 계정 관리
  accounts: {
    getAll: () => ipcRenderer.invoke('accounts:getAll'),
    create: (data) => ipcRenderer.invoke('accounts:create', data),
    update: (id, data) => ipcRenderer.invoke('accounts:update', id, data),
    delete: (id) => ipcRenderer.invoke('accounts:delete', id),
    setActive: (id) => ipcRenderer.invoke('accounts:setActive', id),
    getActiveCredentials: () => ipcRenderer.invoke('accounts:getActiveCredentials')
  },

  // 카페 링크 관리
  cafes: {
    getAll: () => ipcRenderer.invoke('cafes:getAll'),
    create: (data) => ipcRenderer.invoke('cafes:create', data),
    update: (id, data) => ipcRenderer.invoke('cafes:update', id, data),
    delete: (id) => ipcRenderer.invoke('cafes:delete', id),
    getActive: () => ipcRenderer.invoke('cafes:getActive')
  },

  // 템플릿 관리
  templates: {
    getAll: () => ipcRenderer.invoke('templates:getAll'),
    create: (data) => ipcRenderer.invoke('templates:create', data),
    update: (id, data) => ipcRenderer.invoke('templates:update', id, data),
    delete: (id) => ipcRenderer.invoke('templates:delete', id)
  },

  // 회원 관리
  members: {
    getAll: () => ipcRenderer.invoke('members:getAll'),
    getByCafe: (cafeId) => ipcRenderer.invoke('members:getByCafe', cafeId),
    create: (data) => ipcRenderer.invoke('members:create', data),
    update: (id, data) => ipcRenderer.invoke('members:update', id, data),
    delete: (id) => ipcRenderer.invoke('members:delete', id)
  },

  // 네이버 로그인 및 크롤링 관리
  naver: {
    openLogin: () => ipcRenderer.invoke('naver:openLogin'),
    closeWindow: () => ipcRenderer.invoke('naver:closeWindow'),
    checkLogin: () => ipcRenderer.invoke('naver:checkLogin'),
    autoLogin: (credentials) => ipcRenderer.invoke('naver:autoLogin', credentials),
    startCrawling: (options) => ipcRenderer.invoke('naver:startCrawling', options),
    // 쪽지 발송
    startSending: (members, content) => ipcRenderer.invoke('naver:startSending', { members, content }),
    stopSending: () => ipcRenderer.invoke('naver:stopSending'),
    // 이벤트 리스너 (Main → Renderer)
    onLoginStatusChange: (callback) => ipcRenderer.on('naver:loginStatusChanged', callback),
    onCrawlProgress: (callback) => ipcRenderer.on('naver:crawlProgress', callback),
    onCrawlComplete: (callback) => ipcRenderer.on('naver:crawlComplete', callback),
    onLoginComplete: (callback) => ipcRenderer.on('naver:loginComplete', callback),
    onSendProgress: (callback) => ipcRenderer.on('naver:sendProgress', callback),
    onSendComplete: (callback) => ipcRenderer.on('naver:sendComplete', callback),
    onCaptchaRequired: (callback) => ipcRenderer.on('naver:captchaRequired', callback),
    onCaptchaResolved: (callback) => ipcRenderer.on('naver:captchaResolved', callback),
    // 이벤트 리스너 제거 (cleanup용)
    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
  }
})