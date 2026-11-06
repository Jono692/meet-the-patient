<#
  Meet the Patient - stand install for the ThinkStation P330 Tiny (Windows 11).

  Brings any of the three machines to an identical, ready-to-run state. ROOM_ID is
  the only thing that differs between them.

      Right-click PowerShell > Run as Administrator, then:
      .\install.ps1 -RoomId A
      .\install.ps1 -RoomId B
      .\install.ps1 -RoomId A -NoLockdown     (bench testing, skips the kiosk settings)

  Secrets are NOT in this script or the repo. Put secrets.env next to it, carrying
  TAVUS_API_KEY, the face ids, CONTROL_PIN and PEER_URL. Keep that file on the USB
  stick, not on the machines.

  Written on a Mac and never executed on Windows. Run it on the SPARE machine first.
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidateSet("A", "B")][string]$RoomId,
  [string]$AppDir      = "C:\meet-the-patient",
  [string]$SecretsFile = "$PSScriptRoot\secrets.env",
  [string]$PauseUpdatesUntil = "2026-11-12",
  [switch]$NoLockdown
)

$ErrorActionPreference = "Stop"
function Step($m) { Write-Host "`n=== $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "    $m" -ForegroundColor Green }
function Warn($m) { Write-Host "    $m" -ForegroundColor Yellow }

if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
      ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Run this in an Administrator PowerShell."
}

# ---------------------------------------------------------------- prerequisites
Step "Installing Node, Chrome and cloudflared"
function Ensure($id, $probe) {
  if (Get-Command $probe -ErrorAction SilentlyContinue) { Ok "$probe already present"; return }
  winget install --id $id --silent --accept-source-agreements --accept-package-agreements | Out-Null
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
              [Environment]::GetEnvironmentVariable("Path", "User")
  if (Get-Command $probe -ErrorAction SilentlyContinue) { Ok "$probe installed" }
  else { Warn "$probe still not on PATH - reopen PowerShell and run this again" }
}
Ensure "OpenJS.NodeJS.LTS"       "node"
Ensure "Google.Chrome"           "chrome"
Ensure "Cloudflare.cloudflared"  "cloudflared"

# ---------------------------------------------------------------- the app
Step "Building the app in $AppDir"
if (-not (Test-Path $AppDir)) { throw "$AppDir not found. Copy the project there first." }
Push-Location $AppDir
if (Test-Path "package-lock.json") { npm ci | Out-Null } else { npm install | Out-Null }
npm run build | Out-Null
Ok "dependencies installed and front end built"
Pop-Location

# ---------------------------------------------------------------- .env
Step "Writing .env for room $RoomId"
if (-not (Test-Path $SecretsFile)) { throw "secrets.env not found at $SecretsFile" }

# Everything identical across the three machines except ROOM_ID.
$common = @"
AVATAR_PROVIDER=tavus

# The stand screen: patient only. Never set this to test on a show machine.
DISPLAY_MODE=live

# Alcon blue, keyed in the browser because Tavus cannot do it on Phoenix-4.5 faces.
CHROMA_KEY=true
BACKGROUND_COLOR=#003595
CHROMA_SIMILARITY=0.05
CHROMA_SMOOTHNESS=0.025
CHROMA_SPILL=0.06

# Alcon promised surgeons nothing is recorded. Absent means off; the cutoff is a
# second guard in case anyone ever turns it on.
KEEP_TRANSCRIPTS=false
TRANSCRIPTS_CUTOFF=2026-11-06

ROTATION=margaret,peter,rami
KEY_START=PageDown
KEY_END=PageUp
KEY_SKIP=.
KEY_DEBOUNCE_MS=1500

TAVUS_MAX_CALL_SECONDS=600
"@

$envPath = Join-Path $AppDir ".env"
"ROOM_ID=$RoomId`n$common`n" | Set-Content -Path $envPath -Encoding UTF8
Get-Content $SecretsFile | Add-Content -Path $envPath -Encoding UTF8
Ok ".env written, ROOM_ID=$RoomId"

# ---------------------------------------------------------------- lockdown
if ($NoLockdown) { Warn "skipping Windows lockdown (-NoLockdown)" } else {
  Step "Locking Windows down"

  # Never sleep, never blank the screen, on mains or battery.
  powercfg /change standby-timeout-ac 0
  powercfg /change standby-timeout-dc 0
  powercfg /change monitor-timeout-ac 0
  powercfg /change monitor-timeout-dc 0
  powercfg /change hibernate-timeout-ac 0
  powercfg /hibernate off
  Ok "power: never sleeps, screen never blanks"

  function RegSet($path, $name, $value, $type = "DWord") {
    if (-not (Test-Path $path)) { New-Item -Path $path -Force | Out-Null }
    New-ItemProperty -Path $path -Name $name -Value $value -PropertyType $type -Force | Out-Null
  }

  # Screen saver and the lock screen on wake.
  RegSet "HKCU:\Control Panel\Desktop" "ScreenSaveActive" "0" "String"
  RegSet "HKLM:\SOFTWARE\Policies\Microsoft\Power\PowerSettings\0e796bdb-100d-47d6-a2d5-f7d2daa51f51" "ACSettingIndex" 0
  RegSet "HKLM:\SOFTWARE\Policies\Microsoft\Windows\Personalization" "NoLockScreen" 1
  Ok "screen saver off, no lock screen"

  # Notifications, Widgets, Game Bar: anything that can pop over a kiosk.
  RegSet "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\PushNotifications" "ToastEnabled" 0
  RegSet "HKLM:\SOFTWARE\Policies\Microsoft\Dsh" "AllowNewsAndInterests" 0
  RegSet "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\GameDVR" "AppCaptureEnabled" 0
  RegSet "HKCU:\System\GameConfigStore" "GameDVR_Enabled" 0
  # The "finish setting up your device" nag, which takes the whole screen.
  RegSet "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\UserProfileEngagement" "ScoobeSystemSettingEnabled" 0
  Ok "toasts, widgets, Game Bar and the setup nag disabled"

  # Windows Update: paused through the show, and never an automatic reboot.
  $wu = "HKLM:\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings"
  $until = ([datetime]$PauseUpdatesUntil).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  RegSet $wu "PauseFeatureUpdatesStartTime"  (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ") "String"
  RegSet $wu "PauseQualityUpdatesStartTime"  (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ") "String"
  RegSet $wu "PauseFeatureUpdatesEndTime"    $until "String"
  RegSet $wu "PauseQualityUpdatesEndTime"    $until "String"
  RegSet "HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU" "NoAutoRebootWithLoggedOnUsers" 1
  Ok "Windows Update paused until $PauseUpdatesUntil, no automatic reboot"
}

# ---------------------------------------------------------------- startup
Step "Installing the logon task"
$startScript = Join-Path $AppDir "deploy\start.ps1"
if (-not (Test-Path $startScript)) { throw "start.ps1 missing at $startScript" }

$action  = New-ScheduledTaskAction -Execute "powershell.exe" `
             -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$startScript`""
$trigger = New-ScheduledTaskTrigger -AtLogOn
$set     = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
             -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName "MeetThePatient" -Action $action -Trigger $trigger `
  -Settings $set -RunLevel Highest -Force | Out-Null
Ok "task 'MeetThePatient' runs at logon and restarts itself up to three times"

# ---------------------------------------------------------------- check
Step "Checking it comes up"
Start-ScheduledTask -TaskName "MeetThePatient"
$cfg = $null
foreach ($i in 1..20) {
  Start-Sleep -Seconds 2
  try { $cfg = Invoke-RestMethod "http://localhost:3000/api/config" -TimeoutSec 2; break } catch {}
}
if (-not $cfg) { throw "the app did not answer on localhost:3000 - check deploy\start.ps1 output" }

Write-Host ""
Write-Host "  room          $($cfg.roomId)"            -ForegroundColor White
Write-Host "  display mode  $($cfg.displayMode)"       -ForegroundColor White
Write-Host "  transcripts   $(if ($cfg.keepTranscripts) { 'ON  <-- WRONG for the show' } else { 'off' })" `
  -ForegroundColor $(if ($cfg.keepTranscripts) { "Red" } else { "White" })
Write-Host "  control PIN   $(if ($cfg.pinRequired) { 'set' } else { 'NOT SET' })" -ForegroundColor White
Write-Host "  other room    $(if ($cfg.hasPeer) { 'configured' } else { 'not configured' })" -ForegroundColor White

Write-Host "`n=== Two things this script will not do for you" -ForegroundColor Cyan
Warn "Rotate the display to portrait: Settings > System > Display > Display orientation > Portrait."
Warn "  It is once per machine and it persists, so it is not worth scripting."
Warn "Set autologin, which needs the account password: run Sysinternals Autologon,"
Warn "  or Settings > Accounts > Sign-in options. Without it the logon task never fires."
Write-Host ""
