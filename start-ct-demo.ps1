<#
.SYNOPSIS
  One command for the whole CT companion demo: CT server (+ robot camera relay, natural voice,
  automatic ACU link), our local ACU gateway, and the ACU dashboard. The portal
  (http://localhost:8000/portal) switches every screen and the dashboard between the local ACU
  (develop/test workflows) and the hosted ACU (real robot), and picks the camera feed.

.EXAMPLE
  .\start-ct-demo.ps1
  .\start-ct-demo.ps1 -Acu local
  .\start-ct-demo.ps1 -Language de-DE -NoLocalAcu
#>
param(
    [string]$AcuUrl = "http://10.27.239.122:3000",
    [string]$LocalAcuUrl = "http://127.0.0.1:3000",
    [string]$RobotId = "8PP076724060001",
    # Start on this ACU; omitted = whatever was last chosen in the portal (default hosted).
    [ValidateSet("", "local", "hosted")][string]$Acu = "",
    [ValidateSet("en-US", "de-DE")][string]$Language = "en-US",
    [switch]$NoDashboard,
    [switch]$NoLocalAcu,
    [switch]$RobotPreview
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$ct = Join-Path $root "ct-companion-mvp"
$fe = Join-Path $root "acu\ACU.FE"
$pwa = Join-Path $root "acu\Robot.Pwa.App"
$logs = Join-Path $ct "logs"
New-Item -ItemType Directory -Force $logs | Out-Null

function Stop-Ours([int]$Port, [string]$Pattern) {
    $owners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($procId in $owners) {
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$procId"
        if ($proc -and $proc.CommandLine -match $Pattern) {
            Write-Host "  stopping PID $procId on :$Port"
            Stop-Process -Id $procId -Force
        } elseif ($proc) {
            throw "Port $Port is used by something else (PID $procId): $($proc.CommandLine)"
        }
    }
}

function Wait-Http([string]$Url, [int]$Seconds = 40) {
    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        try { Invoke-WebRequest $Url -UseBasicParsing -TimeoutSec 3 | Out-Null; return $true } catch { Start-Sleep -Milliseconds 700 }
    }
    return $false
}

Write-Host "`n== CT companion demo ==" -ForegroundColor Cyan
Write-Host "Hosted ACU: $AcuUrl   Local ACU: $LocalAcuUrl   Robot: $RobotId   Language: $Language"

try { Invoke-RestMethod "$AcuUrl/api/acu/settings" -TimeoutSec 5 | Out-Null; Write-Host "Hosted ACU reachable." -ForegroundColor Green }
catch { Write-Warning "Hosted ACU $AcuUrl is not reachable right now. The CT server keeps retrying; use the local ACU from the portal meanwhile." }

Write-Host "Stopping previous instances..."
Stop-Ours 8000 "app\.py|uvicorn"
if (-not $NoDashboard) { Stop-Ours 3100 "vite" }

# --- Local ACU gateway (for developing and testing workflows without the real robot) ---
if (-not $NoLocalAcu) {
    $gw = Join-Path $root "acu\ApiGateway"
    $dll = Join-Path $root "acu\bin\Release\net10.0\Acu.ApiGateway.dll"
    if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) {
        Write-Host "Local ACU already running on :3000"
    } elseif (Test-Path $dll) {
        $acuProc = Start-Process dotnet -ArgumentList "`"$dll`"" -WorkingDirectory $gw -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput (Join-Path $logs "local-acu.out.log") -RedirectStandardError (Join-Path $logs "local-acu.log")
        Write-Host "Local ACU PID $($acuProc.Id)"
        if (-not (Wait-Http "$LocalAcuUrl/api/acu/settings" 30)) { Write-Warning "Local ACU did not answer yet; see $logs\local-acu*.log" }
    } else {
        Write-Warning "Local ACU not built ($dll). Build it: dotnet build acu\ApiGateway -c Release"
    }
}

# --- CT server ---
$python = Join-Path $ct ".venv\Scripts\python.exe"
if (-not (Test-Path $python)) { throw "Missing $python. Create it: py -3.12 -m venv .venv; .venv\Scripts\pip install -r requirements.txt" }
$env:CT_HOST = "0.0.0.0"
Remove-Item Env:ACU_URL -ErrorAction SilentlyContinue
$env:ACU_HOSTED_URL = $AcuUrl
$env:ACU_LOCAL_URL = $LocalAcuUrl
if ($Acu) { $env:ACU_TARGET = $Acu } else { Remove-Item Env:ACU_TARGET -ErrorAction SilentlyContinue }
$env:CT_ROBOT_ID = $RobotId
$env:CT_AUTO_APPROVE = "1"
$env:CT_LANGUAGE = $Language
$env:PYTHONUNBUFFERED = "1"
$server = Start-Process $python -ArgumentList "app.py" -WorkingDirectory $ct -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $logs "ct-server.out.log") -RedirectStandardError (Join-Path $logs "ct-server.log")
Write-Host "CT server PID $($server.Id)"

# --- ACU dashboard ---
if (-not $NoDashboard) {
    # Same-origin /api calls -> Vite proxy -> CT server /acu-proxy -> whichever ACU the portal selected.
    $env:VITE_API_BASE_URL = ""
    $env:ACU_PROXY_TARGET = "http://localhost:8000/acu-proxy"
    $env:VITE_CT_COMPANION_URL = "http://localhost:8000"
    $vite = Join-Path $fe "node_modules\vite\bin\vite.js"
    $dash = Start-Process node -ArgumentList "`"$vite`" --host 127.0.0.1 --port 3100 --strictPort" -WorkingDirectory $fe `
        -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logs "dashboard.out.log") -RedirectStandardError (Join-Path $logs "dashboard.log")
    Write-Host "Dashboard PID $($dash.Id)"
}

# --- Optional browser preview of the robot app (the real robot runs the APK) ---
if ($RobotPreview) {
    Stop-Ours 8082 "expo"
    $expo = Join-Path $pwa "node_modules\expo\bin\cli"
    $prev = Start-Process node -ArgumentList "`"$expo`" start --web --offline --port 8082" -WorkingDirectory $pwa `
        -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logs "robot-preview.out.log") -RedirectStandardError (Join-Path $logs "robot-preview.log")
    Write-Host "Robot preview PID $($prev.Id)"
}

if (-not (Wait-Http "http://127.0.0.1:8000/health")) { Get-Content (Join-Path $logs "ct-server.log") -Tail 30; throw "CT server did not start." }
$link = Invoke-RestMethod "http://127.0.0.1:8000/api/link/status"
for ($i = 0; $i -lt 10 -and -not $link.checked_at; $i++) { Start-Sleep 1; $link = Invoke-RestMethod "http://127.0.0.1:8000/api/link/status" }
$journeyUrl = if ($link.journey_url) { $link.journey_url } else { "http://<this-laptop>:8000/journey" }

Write-Host "`n== Workspace ==" -ForegroundColor Cyan
Write-Host "  Open this              : http://localhost:8000/portal"
Write-Host "  Tabs                   : Patient | Technician | Tracking | Robot / API | Connections"
Write-Host "  Robot tablet (patient) : opens automatically in the robot app -> ${journeyUrl}?host=robot"
if (-not $NoDashboard) { Write-Host "  Advanced workflow editor: available inside Robot / API (port 3100)" }

Write-Host "`n== Link ==" -ForegroundColor Cyan
Write-Host "  Active ACU     : $($link.target) -> $($link.acu_url)"
Write-Host "  ACU reachable  : $($link.reachable)"
if ($link.robot) { Write-Host "  Robot          : $($link.robot.name) ($($link.robot.status), online=$($link.robot.online))" }
Write-Host "  Journey on bot : $($link.journey_assigned)"
if ($link.note) { Write-Host "  Note           : $($link.note)" -ForegroundColor Yellow }

$netProfile = (Get-NetConnectionProfile -ErrorAction SilentlyContinue | Select-Object -First 1).NetworkCategory
if ($netProfile -eq "Public") {
    Write-Host "`nThis network is 'Public': Windows may block the robot from reaching port 8000." -ForegroundColor Yellow
    Write-Host "If the robot shows a blank/timeout page, run once as administrator:"
    Write-Host "  New-NetFirewallRule -DisplayName 'CT companion 8000' -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow -Profile Any"
}
Write-Host "`nLogs: $logs"
