# 슬랙 Webhook 알림 전송 유틸리티
# Claude Code Hooks에서 사용하는 공통 슬랙 알림 함수

param(
    [string]$EventType = "테스트",
    [string]$Message = "슬랙 알림 설정이 정상적으로 완료되었습니다!",
    [string]$Color = "good"
)

# 현재 스크립트의 디렉토리 경로
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# .env 파일에서 환경 변수 로드
$EnvFile = Join-Path $ScriptDir ".env"
if (Test-Path $EnvFile) {
    Get-Content $EnvFile | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim()
            Set-Item -Path "Env:$name" -Value $value
        }
    }
}

$WebhookUrl = $env:CLAUDE_SLACK_WEBHOOK_URL

# Webhook URL 확인
if ([string]::IsNullOrEmpty($WebhookUrl)) {
    Write-Error "[ERROR] CLAUDE_SLACK_WEBHOOK_URL 환경 변수가 설정되지 않았습니다."
    exit 1
}

# 현재 디렉토리와 시간
$WorkDir = Get-Location
$CurrentTime = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

# 슬랙 메시지 페이로드 생성
$Payload = @{
    attachments = @(
        @{
            color = $Color
            title = "Claude Code $EventType"
            text = $Message
            fields = @(
                @{
                    title = "작업 디렉토리"
                    value = $WorkDir.ToString()
                    short = $true
                }
                @{
                    title = "시간"
                    value = $CurrentTime
                    short = $true
                }
            )
            footer = "Claude Code Hooks"
            footer_icon = "https://claude.ai/favicon.ico"
        }
    )
} | ConvertTo-Json -Depth 4

# 슬랙 Webhook 호출
try {
    $Response = Invoke-RestMethod -Uri $WebhookUrl -Method Post -Body $Payload -ContentType "application/json; charset=utf-8"
    Write-Host "[INFO] 슬랙 알림 전송 성공: $EventType" -ForegroundColor Green
    exit 0
} catch {
    Write-Error "[ERROR] 슬랙 알림 전송 실패: $($_.Exception.Message)"
    exit 1
}
