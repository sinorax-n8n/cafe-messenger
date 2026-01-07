# Claude Code Hooks - 슬랙 알림 설정 가이드

이 디렉토리에는 Claude Code가 작업을 완료하거나 권한을 요청할 때 슬랙 알림을 전송하는 훅 스크립트가 포함되어 있습니다.

## 파일 구조

```
.claude/hooks/
├── .env                  # Webhook URL 설정 (Git 제외)
├── slack-notify.ps1      # 슬랙 알림 전송 공통 유틸리티
├── on-stop.ps1           # 작업 완료 시 실행되는 훅
├── on-notification.ps1   # 알림 발생 시 실행되는 훅
├── on-permission.ps1     # 권한 요청 시 실행되는 훅
└── README.md             # 이 파일
```

## 설정 방법

### 1단계: .env 파일 생성

`.claude/hooks/.env` 파일을 생성하고 Webhook URL을 설정하세요:

```bash
# Claude Code Slack 알림 설정
# 이 파일은 Git에 커밋하지 마세요!

CLAUDE_SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

> **참고**: `.env` 파일은 `.gitignore`에 추가되어 있어 Git에 커밋되지 않습니다.

### 2단계: 테스트

PowerShell에서 테스트 알림 전송:

```powershell
pwsh -NoProfile -File .claude/hooks/slack-notify.ps1
```

슬랙 채널에 "슬랙 알림 설정이 정상적으로 완료되었습니다!" 메시지가 나타나면 성공입니다!

## 사용 방법

설정이 완료되면 Claude Code가 자동으로 다음 상황에 슬랙 알림을 전송합니다:

1. **작업 완료 (Stop)**: Claude가 작업을 완료했을 때 - **프로젝트 이름/경로 포함**
2. **권한 요청 (PermissionRequest)**: Claude가 권한 승인을 기다릴 때 - **요청 도구/내용 포함**
3. **알림 (Notification)**: Claude가 사용자에게 알림을 보낼 때

### 알림 예시

#### 작업 완료 알림 (녹색)
```
🤖 Claude Code 작업 완료

Claude가 작업을 완료했습니다.
프로젝트: cafe-messenger
경로: c:\Users\Documents\claude\workspaces\cafe-messenger

작업 디렉토리: c:\Users\Documents\claude\workspaces\cafe-messenger
시간: 2025-12-23 21:30:45
```

#### 권한 요청 알림 (노란색)
```
🤖 Claude Code 권한 요청

Claude가 권한을 요청합니다.
도구: Bash
내용: npm run build
프로젝트: cafe-messenger

작업 디렉토리: c:\Users\Documents\claude\workspaces\cafe-messenger
시간: 2025-12-23 21:30:45
```

## Hook 데이터 구조

Claude Code는 stdin을 통해 JSON 데이터를 Hook에 전달합니다:

### Stop 이벤트 (작업 완료)
```json
{
  "session_id": "abc123",
  "cwd": "c:\\Users\\...\\cafe-messenger",
  "hook_event_name": "Stop",
  "stop_hook_active": true
}
```

### PermissionRequest 이벤트 (권한 요청)
```json
{
  "session_id": "abc123",
  "cwd": "c:\\Users\\...\\cafe-messenger",
  "hook_event_name": "PermissionRequest",
  "tool_name": "Bash",
  "tool_input": {
    "command": "npm run build"
  }
}
```

## 커스터마이징

### 알림 메시지 수정

`on-stop.ps1` 또는 `on-permission.ps1` 파일을 편집하여 메시지 내용을 변경할 수 있습니다:

```powershell
& "$ScriptDir\slack-notify.ps1" `
    -EventType "이벤트 타입" `
    -Message "여기에 원하는 메시지 작성" `
    -Color "good"  # good(녹색), warning(노란색), danger(빨간색), #hex
```

### 추가 훅 추가

`.claude/settings.json`의 `hooks` 섹션에 다른 이벤트 타입을 추가할 수 있습니다:

| 이벤트 | 설명 |
|--------|------|
| `PreToolUse` | 도구 사용 전 |
| `PostToolUse` | 도구 사용 후 |
| `SessionStart` | 세션 시작 시 |
| `SessionEnd` | 세션 종료 시 |
| `SubagentStop` | Subagent 작업 완료 시 |

### 현재 settings.json 설정

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "pwsh -NoProfile -File .claude/hooks/on-stop.ps1"
          }
        ]
      }
    ],
    "Notification": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "pwsh -NoProfile -File .claude/hooks/on-notification.ps1"
          }
        ]
      }
    ]
  }
}
```

## 문제 해결

### 알림이 전송되지 않는 경우

1. **.env 파일 확인**:
   `.claude/hooks/.env` 파일이 존재하고 Webhook URL이 올바르게 설정되어 있는지 확인하세요.

2. **Webhook URL 유효성 검증**:
   ```powershell
   $env:CLAUDE_SLACK_WEBHOOK_URL = "YOUR_WEBHOOK_URL"
   Invoke-RestMethod -Uri $env:CLAUDE_SLACK_WEBHOOK_URL -Method Post -Body '{"text":"테스트"}' -ContentType "application/json"
   ```
   `ok` 응답이 나오면 Webhook URL이 유효합니다.

3. **PowerShell 버전 확인**:
   ```powershell
   pwsh --version
   ```
   PowerShell 7.0 이상이 필요합니다.

### 로그 확인

스크립트 실행 로그는 표준 에러(stderr)로 출력됩니다:

```
[INFO] 슬랙 알림 전송 성공: 작업 완료
[ERROR] 슬랙 알림 전송 실패: 권한 요청
```

## 보안 주의사항

- **Webhook URL 보호**: Webhook URL은 비밀번호처럼 취급하세요. 이 URL을 알면 누구나 슬랙 채널에 메시지를 보낼 수 있습니다.
- **Git 제외**: `.env` 파일은 `.gitignore`에 추가되어 Git에 커밋되지 않습니다.
- **URL 공유 금지**: Webhook URL을 공개 저장소나 문서에 포함하지 마세요.

---

작성일: 2025-12-23
