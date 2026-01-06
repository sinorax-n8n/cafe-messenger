# Claude Code 권한 요청 시 슬랙 알림 전송
# 이 훅은 Claude가 권한을 요청할 때 자동으로 실행됩니다.
# stdin으로 JSON 데이터를 받아 권한 정보를 추출합니다.

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# stdin에서 JSON 데이터 읽기
$InputJson = [Console]::In.ReadToEnd()

# 권한 정보 추출
$ToolName = ""
$ToolInput = ""
$ProjectPath = ""
$ProjectName = ""

try {
    $HookData = $InputJson | ConvertFrom-Json
    $ToolName = $HookData.tool_name
    $ProjectPath = $HookData.cwd

    if ($ProjectPath) {
        $ProjectName = Split-Path -Leaf $ProjectPath
    }

    # tool_input에서 주요 정보 추출
    if ($HookData.tool_input) {
        $ToolInputObj = $HookData.tool_input

        # Bash 명령어
        if ($ToolInputObj.command) {
            $ToolInput = $ToolInputObj.command
        }
        # 파일 경로 (Write, Edit, Read 등)
        elseif ($ToolInputObj.file_path) {
            $ToolInput = $ToolInputObj.file_path
        }
        # 기타 입력값
        else {
            $ToolInput = ($ToolInputObj | ConvertTo-Json -Compress)
        }
    }
} catch {
    $ToolName = "알 수 없음"
}

# 메시지 생성
$Message = "Claude가 권한을 요청합니다.`n도구: $ToolName`n내용: $ToolInput`n프로젝트: $ProjectName"

& "$ScriptDir\slack-notify.ps1" `
    -EventType "권한 요청" `
    -Message $Message `
    -Color "warning"
