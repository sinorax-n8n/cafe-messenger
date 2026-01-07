# Claude Code 작업 완료 시 슬랙 알림 전송
# 이 훅은 Claude가 작업을 완료했을 때 자동으로 실행됩니다.
# stdin으로 JSON 데이터를 받아 프로젝트 정보를 추출합니다.

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# stdin에서 JSON 데이터 읽기
$InputJson = [Console]::In.ReadToEnd()

# 프로젝트 경로 추출
$ProjectPath = ""
$ProjectName = ""
try {
    $HookData = $InputJson | ConvertFrom-Json
    $ProjectPath = $HookData.cwd
    if ($ProjectPath) {
        $ProjectName = Split-Path -Leaf $ProjectPath
    }
} catch {
    $ProjectName = "알 수 없음"
}

# 메시지 생성
$Message = "Claude가 작업을 완료했습니다.`n프로젝트: $ProjectName`n경로: $ProjectPath"

& "$ScriptDir\slack-notify.ps1" `
    -EventType "작업 완료" `
    -Message $Message `
    -Color "good"
