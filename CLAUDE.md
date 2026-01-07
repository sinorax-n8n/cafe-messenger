# CLAUDE.md

이 파일은 Claude Code (claude.ai/code)가 이 저장소에서 작업할 때 참고할 가이드를 제공합니다.

## 언어 및 커뮤니케이션 규칙
- **기본 응답 언어**: 한국어
- **코드 주석**: 한국어로 작성
- **커밋 메시지**: 한국어로 작성
- **문서화**: 한국어로 작성
- **변수명/함수명**: 영어 (코드 표준 준수)

## 개발 명령어

### Docker 워크플로우 (권장)

이 프로젝트는 Docker 컨테이너를 사용하여 개발합니다:

```bash
# 핫 리로드가 포함된 개발 서버 시작
docker-compose up desktop-dev

# Windows 배포판 빌드
docker-compose run desktop-build npm run make:win
```

### NPM 스크립트

이 명령어들은 Docker 컨테이너 내부에서 실행되거나, 의존성이 설치된 경우 로컬에서 실행할 수 있습니다:

```bash
npm start              # Electron 개발 모드 시작 (electron-forge start)
npm run package        # 애플리케이션 패키징
npm run make:win       # Windows x64용 빌드, artifacts/make/로 출력
npm test               # 아직 구현되지 않음 (에러로 종료됨)
```

### 개발 환경 세부사항

- **Docker 이미지**: Node 24.11.1 Bookworm Slim
- **파일 감시**: WSL/Windows 호환성을 위한 폴링 모드 사용 (CHOKIDAR_USEPOLLING=true)
- **빌드 출력**: `artifacts/make/` 디렉토리로 저장됨
- **개발 서버 포트**: 5173 (Vite dev server)
- **node_modules**: 로컬 파일시스템 오염 방지를 위해 네임드 볼륨 `desktop_node_modules`에 저장
- **컨테이너 작업 디렉토리**: `/work/apps/desktop`

## 아키텍처 개요

### Electron 멀티 프로세스 모델

이 애플리케이션은 Electron의 보안 중심 멀티 프로세스 아키텍처를 따릅니다:

```
Main Process (main.js)
    ↓ IPC 핸들러 등록
IPC Handlers (accounts, cafes, templates, members, naver)
    ↓ 데이터 저장
SQLite DataStore (better-sqlite3)
    ↓ 생성
BrowserWindow (1200x800)
    ↓ 로드
index.html (엄격한 CSP)
    ↓ 주입
preload.js (contextBridge)
    ↓ window.api 노출
renderer.js (라우팅 + 컴포넌트 초기화)
    ↓ 동적 로딩
Components (Home, AccountManager, CafeManager, TemplateManager, MemberList)
```

### 프로세스별 역할

- **Main Process** (`apps/desktop/src/main/main.js`)
  - 애플리케이션 진입점 (package.json의 `main` 필드에 정의됨)
  - IPC 핸들러 등록 (`registerIpcHandlers()`)
  - BrowserWindow 인스턴스 생성 (1200x800)
  - 앱 생명주기 이벤트 처리 (ready, activate, window-all-closed)
  - 플랫폼별 동작 처리 (macOS vs Windows/Linux)

- **IPC Handlers** (`apps/desktop/src/main/ipc/`)
  - `handlers.js`: 모든 IPC 핸들러 등록
  - `account-handler.js`: 네이버 계정 CRUD + AES-256-CBC 암호화
  - `cafe-handler.js`: 카페 링크 CRUD
  - `template-handler.js`: 쪽지 템플릿 CRUD
  - `member-handler.js`: 회원 CRUD
  - `naver-handler.js`: 네이버 로그인, 크롤링, 쪽지 발송

- **Data Store** (`apps/desktop/src/main/store/`)
  - `index.js`: SQLite 데이터 저장소 (Singleton 패턴, better-sqlite3 사용)
  - `schema.js`: 테이블 스키마 정의
  - 4개 테이블: accounts, cafes, templates, members
  - CRUD 메서드: create, getAll, getById, findOne, update, delete
  - 특수 메서드: `setSentCount()` - 발송 현황 동기화

- **Preload Script** (`apps/desktop/src/preload/preload.js`)
  - Main 프로세스와 Renderer 프로세스 간의 보안 브리지
  - `contextBridge`를 사용하여 `window.api` 객체 노출
  - 5개 네임스페이스: api.accounts, api.cafes, api.templates, api.members, api.naver
  - 각 네임스페이스는 CRUD 메서드 및 이벤트 리스너 제공

- **Renderer Process** (`apps/desktop/src/renderer/`)
  - `renderer.js`: 앱 초기화, 라우팅, 컴포넌트 로딩
  - `components/Layout.js`: 메인 레이아웃 (사이드바 + 콘텐츠 영역)
  - `components/Sidebar.js`: 네비게이션 메뉴 (5개 메뉴 항목)
  - `components/Home.js`: 홈 화면 (회원 탐색 → 쪽지 발송 플로우)
  - `components/AccountManager.js`: 네이버 계정 관리 UI
  - `components/CafeManager.js`: 카페 링크 관리 UI
  - `components/TemplateManager.js`: 쪽지 템플릿 관리 UI
  - `components/MemberList.js`: 발송 제외 회원 관리 UI

- **HTML Shell** (`apps/desktop/src/renderer/index.html`)
  - 엄격한 Content Security Policy (스크립트는 'self'만 허용)
  - TailwindCSS 스타일링
  - 빈 `<div id="app"></div>` 컨테이너 (동적 렌더링)

### 주요 아키텍처 결정사항

- **보안 우선 접근**: Context isolation 강제, 엄격한 CSP, 최소한의 renderer 접근 권한
- **Docker 우선 개발**: 모든 개발과 빌드가 컨테이너에서 수행됨
- **모노레포 구조**: `apps/` 디렉토리는 멀티 앱 아키텍처를 시사 (현재는 `desktop/`만 존재)
- **네임드 볼륨**: 호스트 파일시스템의 node_modules 오염 방지
- **Windows 전용 빌드**: forge.config.js가 win32 플랫폼만 설정됨 (ZIP 포맷)
- **SQLite 데이터 저장**: better-sqlite3 사용, 동기 API
- **AES-256-CBC 암호화**: 네이버 계정 비밀번호 보안 저장
- **컴포넌트 기반 아키텍처**: ES6 모듈, createXxx() + attachXxxEvents() 패턴
- **Vite 번들링**: `inlineDynamicImports: true`로 모든 로컬 모듈을 단일 번들로 통합
- **TailwindCSS + PostCSS**: Vite와 통합된 유틸리티 기반 스타일링

## 프로젝트 구조

```
cafe-messenger/
├── apps/desktop/                    # 메인 Electron 애플리케이션
│   ├── src/
│   │   ├── main/
│   │   │   ├── main.js             # Main 프로세스 진입점
│   │   │   ├── ipc/
│   │   │   │   ├── handlers.js     # IPC 핸들러 등록
│   │   │   │   ├── account-handler.js   # 계정 CRUD + 암호화
│   │   │   │   ├── cafe-handler.js      # 카페 CRUD
│   │   │   │   ├── template-handler.js  # 템플릿 CRUD
│   │   │   │   ├── member-handler.js    # 회원 CRUD
│   │   │   │   └── naver-handler.js     # 네이버 로그인/크롤링/발송
│   │   │   └── store/
│   │   │       ├── index.js        # SQLite 데이터 저장소
│   │   │       └── schema.js       # 테이블 스키마
│   │   ├── preload/
│   │   │   └── preload.js          # contextBridge (window.api 노출)
│   │   └── renderer/
│   │       ├── index.html          # HTML 셸
│   │       ├── renderer.js         # 앱 초기화 + 라우팅
│   │       └── components/
│   │           ├── Layout.js       # 메인 레이아웃
│   │           ├── Sidebar.js      # 네비게이션
│   │           ├── Home.js         # 홈 (탐색 → 발송 플로우)
│   │           ├── AccountManager.js    # 계정 관리 UI
│   │           ├── CafeManager.js       # 카페 관리 UI
│   │           ├── TemplateManager.js   # 템플릿 관리 UI
│   │           └── MemberList.js        # 회원 관리 UI
│   ├── package.json            # 의존성 및 스크립트
│   ├── forge.config.js         # Electron Forge 빌드 설정
│   ├── vite.main.config.js     # Main 프로세스 Vite 설정
│   ├── vite.renderer.config.js # Renderer 프로세스 Vite 설정
│   ├── tailwind.config.js      # TailwindCSS 설정
│   ├── postcss.config.js       # PostCSS 설정
│   └── Dockerfile.dev          # 개발 컨테이너
├── artifacts/                   # 빌드 산출물 (git에서 제외됨)
│   └── cafe-messenger-win32-x64/
│       └── cafe-messenger.exe  # Windows 실행 파일
├── docker-compose.yml           # 개발 및 빌드 서비스
└── .claude/                     # Claude Code 워크스페이스 설정
```

## 중요 참고사항

### 현재 상태

**개발 진행 상황:**
- ✅ **Phase 1 완료**: Vite + TailwindCSS 개발 환경 구축
- ✅ **Phase 2 완료**: IPC 인프라 및 데이터 저장소 구현 (SQLite)
- ✅ **Phase 3 완료**: UI 레이아웃 및 전체 화면 구현
- ✅ **Phase 4 완료**: 네이버 로그인 (BrowserWindow) 및 API 기반 카페 회원 크롤링
- ✅ **Phase 5 완료**: 쪽지 발송 로직 (BrowserWindow 기반 대량 발송)

**구현된 기능:**
- 네이버 계정 관리 (CRUD, 비밀번호 AES-256-CBC 암호화, 활성 계정 선택, 발송 현황 표시)
- 카페 링크 관리 (CRUD, 활성/비활성 상태 토글)
- 쪽지 템플릿 관리 (이름 + 내용, CRUD)
- 회원 관리 (카페별 필터링, 실시간 검색, CRUD, 발송 제외 목록)
- **홈 화면 크롤링**: 탐색 시작 → API 기반 회원 수집 → 메시지 전송 플로우
- **네이버 로그인**: BrowserWindow로 로그인 페이지 표시, 자동 로그인 지원
- **쪽지 대량 발송**: BrowserWindow 기반, 5~6초 딜레이, CAPTCHA 감지/알림
- **발송 중지**: 발송 중 중지 버튼, 탭 이동 시 확인 다이얼로그
- **발송 현황 동기화**: 네이버 서버 todaySentCount → DB → 계정 관리 UI
- **CAPTCHA 알림**: 시스템 트레이 알림 + UI 알림 (주황색 경고 박스)

**IPC 이벤트 (Main → Renderer):**
- `naver:loginStatusChanged` - 로그인 상태 변경
- `naver:crawlProgress` - 크롤링 진행 상황
- `naver:crawlComplete` - 크롤링 완료
- `naver:loginComplete` - 로그인 완료
- `naver:sendProgress` - 발송 진행 상황
- `naver:sendComplete` - 발송 완료
- `naver:captchaRequired` - CAPTCHA 감지됨
- `naver:captchaResolved` - CAPTCHA 해결됨

**기술 스택:**
- **순수 JavaScript**: TypeScript 없음
- **모듈 시스템**: Main process는 CommonJS, Renderer는 ES6 모듈
- **UI 프레임워크 없음**: 바닐라 HTML/JS (React/Vue 등 사용하지 않음)
- **스타일링**: TailwindCSS 3.4.17 + PostCSS
- **번들러**: Vite 6.0.7
- **데이터베이스**: SQLite (better-sqlite3)
- **테스트 프레임워크 없음**: npm test는 현재 에러로 종료됨

### 기술 선택사항

- **빌드 도구**: Electron Forge 7.10.2 (ZIP maker 사용)
- **번들러**: Vite 6.0.7 + @electron-forge/plugin-vite 7.10.2
- **모듈 시스템**: Main은 CommonJS, Renderer는 ES6 모듈
- **스타일링**: TailwindCSS 3.4.17 + PostCSS 8.4.49 + Autoprefixer 10.4.20
- **타겟 플랫폼**: Windows 전용 (win32, x64 아키텍처)
- **Node 버전**: 24.11.1
- **Electron 버전**: 39.2.7
- **암호화**: Node.js crypto 모듈 (AES-256-CBC)
- **데이터 저장**: SQLite (better-sqlite3)

### 데이터 스키마

**네이버 계정 (accounts)**
- `id`, `account_name`, `naver_id`, `naver_password` (암호화), `is_active`
- `today_sent_count`, `sent_count_date` (발송 현황)
- `created_at`, `updated_at`

**카페 (cafes)**
- `id`, `cafe_name`, `cafe_url`, `cafe_id`, `is_active`, `created_at`, `updated_at`

**템플릿 (templates)**
- `id`, `name`, `content`, `created_at`, `updated_at`

**회원 (members)** - 발송 제외 회원 목록
- `id`, `cafe_id`, `nickname`, `member_key`, `write_date`, `created_at`, `updated_at`

### 알려진 문제 및 해결 방법

**1. Vite 번들링 문제 (해결됨)**
- **문제**: main.js 빌드 시 `require('./ipc/handlers')` 외부 참조가 남아 런타임 오류 발생
- **해결**: `vite.main.config.js`에 `inlineDynamicImports: true` 설정 추가
- **결과**: 모든 로컬 모듈이 단일 번들로 통합

**2. Docker 볼륨 npm install 문제**
- **문제**: 네임드 볼륨 사용 시 Rollup 네이티브 바인딩 오류 발생
- **해결**: `docker-compose down && docker volume rm cafe-messenger_desktop_node_modules` 후 재설치
- **예방**: node_modules 재설치 필요 시 항상 볼륨 삭제 후 진행

**3. ZIP maker 오류 (일부 해결)**
- **문제**: `spawn zip ENOENT` - zip 명령어 PATH 문제
- **현재 상태**: 패키징은 성공, ZIP 생성만 실패 (실행 파일은 정상 생성됨)
- **Workaround**: `artifacts/cafe-messenger-win32-x64/` 디렉토리를 수동으로 압축

### 개발 팀

- **작성자**: 김동현
- **언어 컨텍스트**: 한국어 개발팀 (docker-compose.yml에 한글 주석 사용)
