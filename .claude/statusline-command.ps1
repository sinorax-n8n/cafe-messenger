# ---------------------------------------------------------
# Claude Code statusline (PowerShell version)
# Converted from bash statusline.sh
# ---------------------------------------------------------

# Claude가 JSON을 stdin으로 넘김
$inputJson = [Console]::In.ReadToEnd()
if (-not $inputJson) { exit }

$data = $null
try {
    $data = $inputJson | ConvertFrom-Json
} catch {
    Write-Output "Claude"
    exit
}

# ---- helpers ----
function ProjectRelative($currentPath, $projectPath) {
    if (-not $currentPath -or -not $projectPath) {
        return $currentPath
    }

    if ($currentPath -eq $projectPath) {
        return "."
    }

    if ($currentPath.StartsWith($projectPath)) {
        $relative = $currentPath.Substring($projectPath.Length).TrimStart('\', '/')
        if ([string]::IsNullOrEmpty($relative)) {
            return "."
        }
        return $relative
    }

    # Fallback to home-shortened path if not in project
    return $currentPath -replace [regex]::Escape($env:USERPROFILE), "~"
}

# ---- basics ----
$currentDir = "unknown"
if ($data.workspace.current_dir) {
    $projectDir = $data.workspace.project_dir
    $currentDir = ProjectRelative $data.workspace.current_dir $projectDir
} elseif ($data.cwd) {
    $currentDir = ProjectRelative $data.cwd $null
}

$modelName = $data.model.display_name
if (-not $modelName) { $modelName = "Claude" }

$modelVersion = $data.model.version
$sessionId = $data.session_id
$ccVersion = $data.version
$outputStyle = $data.output_style.name

# ---- git ----
$gitBranch = ""
if (Test-Path ".git") {
    try {
        $gitBranch = git branch --show-current 2>$null
        if (-not $gitBranch) {
            $gitBranch = git rev-parse --short HEAD 2>$null
        }
    } catch {}
}

# ---- context calculation ----
function Get-MaxContext($model) {
    switch -Wildcard ($model) {
        "*Opus*" { return 200000 }
        "*Sonnet*" { return 200000 }
        "*Haiku*" { return 200000 }
        "*Claude 3 Haiku*" { return 100000 }
        default { return 200000 }
    }
}

$contextRemainingText = ""
if ($sessionId) {
    $maxContext = Get-MaxContext $modelName
    # Use actual project directory for session file lookup
    $actualProjectDir = if ($data.workspace.project_dir) { $data.workspace.project_dir } else { $env:USERPROFILE }
    $projectDirKey = ($actualProjectDir -replace "~", $env:USERPROFILE) -replace "[\\/]", "-"
    $projectDirKey = $projectDirKey.TrimStart("-")
    $sessionFile = "$env:USERPROFILE\.claude\projects\-$projectDirKey\$sessionId.jsonl"

    if (Test-Path $sessionFile) {
        $latest = Get-Content $sessionFile -Tail 20 |
            ForEach-Object {
                try { $_ | ConvertFrom-Json } catch {}
            } |
            Where-Object { $_.message.usage } |
            Select-Object -Last 1

        if ($latest) {
            $used = ($latest.message.usage.input_tokens +
                     $latest.message.usage.cache_read_input_tokens)
            if ($used -gt 0) {
                $usedPct = [int](($used * 100) / $maxContext)
                $remainPct = 100 - $usedPct
                $contextRemainingText = "$remainPct% ctx"
            }
        }
    }
}

# ---- ccusage integration ----
$sessionText = ""
try {
    $blocksJson = npx ccusage@latest blocks --json 2>$null
    if ($blocksJson) {
        $blocks = $blocksJson | ConvertFrom-Json
        $active = $blocks.blocks | Where-Object { $_.isActive } | Select-Object -First 1
        if ($active) {
            $reset = Get-Date $active.usageLimitResetTime
            $start = Get-Date $active.startTime
            $now = Get-Date

            $total = ($reset - $start).TotalSeconds
            $elapsed = ($now - $start).TotalSeconds
            if ($total -gt 0) {
                $pct = [int](($elapsed * 100) / $total)
                $remain = $reset - $now
                $sessionText = "{0}h {1}m until reset ({2}%)" -f `
                    [int]$remain.TotalHours, `
                    $remain.Minutes, `
                    $pct
            }
        }
    }
} catch {}

# ---- render (NO colors, ONE LINE per spec) ----
$parts = @()

$parts += "📁 $currentDir"
if ($gitBranch) { $parts += "🌿 $gitBranch" }
$parts += "🤖 $modelName"

if ($modelVersion) { $parts += "🏷 $modelVersion" }
# if ($outputStyle) { $parts += "🎨 $outputStyle" }
if ($contextRemainingText) { $parts += "🧠 $contextRemainingText" }
if ($sessionText) { $parts += "⌛ $sessionText" }

Write-Output ($parts -join " | ")
