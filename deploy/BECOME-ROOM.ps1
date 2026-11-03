<#
  Press the spare into service as Room A or Room B.

  Use this when a show PC dies. It does everything that makes a dormant SPARE install
  into a live room: tunnel credentials and config, ROOM_ID and PEER_URL, the Cloudflare
  service, the logon task, and optionally autologin. Then it reboots.

  It is also safe on a machine that is already a live room - it will flip it to the other
  room, which is what you want if you built the spare as A and it is B that has failed.

  Nothing is changed until Node has been found and run, the tunnel credentials for the
  target room are in hand, and the current .env and config.yml have been backed up.

  BEFORE YOU RUN THIS: power the failed PC off at the wall. If it is still alive enough
  to run cloudflared, two machines will be connected to the same tunnel and Cloudflare
  will send roughly half the traffic to the dead one. That fault looks insane and will
  cost you twenty minutes.
#>

param([Parameter(Mandatory = $true)][ValidateSet("A", "B")][string]$Room)

$ErrorActionPreference = "Stop"

# Self-elevate: this touches the registry, a service and a scheduled task.
$admin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
         ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
  Start-Process powershell -Verb RunAs -ArgumentList @(
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $PSCommandPath, "-Room", $Room)
  exit
}

$AppDir = "C:\meet-the-patient"
$CfDir  = "C:\cloudflared"
$Stamp  = Get-Date -Format "yyyyMMdd-HHmmss"
$Backup = Join-Path $AppDir "deploy\backup-room-$Stamp"

function Head ($m) { Write-Host ""; Write-Host $m -ForegroundColor Cyan }
function Ok   ($m) { Write-Host ("   " + $m) -ForegroundColor Green }
function Say  ($m) { Write-Host ("   " + $m) }
function Warn ($m) { Write-Host ("   " + $m) -ForegroundColor Yellow }
function Bad  ($m) { Write-Host ("   " + $m) -ForegroundColor Red }

$low      = $Room.ToLower()
$other    = if ($Room -eq "A") { "b" } else { "a" }
$hostName = "room-$low.meetthepatient.com.au"
$peerUrl  = "https://room-$other.meetthepatient.com.au"

Head "Make this machine Room $Room"
Warn "Is the PC you are replacing powered OFF at the wall? If not, stop and do that first."
if ((Read-Host "   Type YES to continue").Trim().ToUpper() -ne "YES") { Write-Host "Nothing changed."; exit }

# ---------------------------------------------------------------- 1. prove the basics first
Head "1. Checking this machine"
if (-not (Test-Path $AppDir))  { throw "No app folder at $AppDir. Run SETUP.cmd from the stick first." }
$startPs1 = Join-Path $AppDir "show-start.ps1"
if (-not (Test-Path $startPs1)) { throw "No show-start.ps1 in $AppDir. Run SETUP.cmd from the stick first." }

# Node is not on PATH on these machines - it was unzipped into the app folder. Find it and
# RUN it before anything is changed. On 3 Nov an update stopped the app and could not start
# it again because a script assumed a bare "node" would work.
$node = $null
foreach ($c in @(Get-ChildItem (Join-Path $AppDir "node") -Filter node.exe -Recurse -ErrorAction SilentlyContinue |
                 Select-Object -ExpandProperty FullName)) {
  try { $v = & $c -v 2>$null; if ($LASTEXITCODE -eq 0 -and $v) { $node = $c; Ok "node $v"; break } } catch {}
}
if (-not $node) { throw "No working node.exe under $AppDir\node. Nothing has been changed." }

$envPath = Join-Path $AppDir ".env"
if (-not (Test-Path $envPath)) { throw "No .env in $AppDir. Run SETUP.cmd from the stick first." }

# ---------------------------------------------------------------- 2. tunnel credentials
# Prefer what is already on the machine; fall back to the stick. Both rooms' credentials are
# staged here so a later flip needs nothing plugged in.
Head "2. Tunnel credentials for room $Room"
New-Item -ItemType Directory -Path $CfDir -Force | Out-Null

# This script normally runs FROM the stick, so look beside it first - that is exact.
# Only fall back to hunting drives, and allow the stick's files to sit at the drive root
# or inside an "ALCON USB" folder, because both shapes exist in the wild.
function Find-OnStick ($rel) {
  $tries = @()
  if ($PSScriptRoot) { $tries += (Join-Path $PSScriptRoot $rel) }
  foreach ($d in Get-PSDrive -PSProvider FileSystem) {
    $tries += (Join-Path $d.Root (Join-Path "ALCON USB" $rel))
    $tries += (Join-Path $d.Root $rel)
  }
  foreach ($t in $tries) { if (Test-Path $t) { return $t } }
  return $null
}

$idsFile = Join-Path $CfDir "ids.txt"
if (-not (Test-Path $idsFile)) {
  $src = Find-OnStick "tunnel\ids.txt"
  if (-not $src) { throw "No $idsFile and no ALCON USB stick found. Plug the stick in and run this again." }
  Copy-Item $src $idsFile -Force
  Say "ids.txt taken from $src"
}

$ids = @{}
Get-Content $idsFile | ForEach-Object { $k, $v = $_ -split "=", 2; if ($k) { $ids[$k.Trim()] = $v.Trim() } }
$tunnelId = $ids[$Room]
if (-not $tunnelId) { throw "ids.txt has no entry for room $Room." }

# Stage BOTH rooms' credentials while the stick is here, so a later flip needs nothing plugged in.
foreach ($r in @("a", "b")) {
  $id = $ids[$r.ToUpper()]
  if (-not $id) { continue }
  $dst = Join-Path $CfDir "$id.json"
  if (Test-Path $dst) { continue }
  $src = Find-OnStick "tunnel\room-$r.json"
  if ($src) { Copy-Item $src $dst -Force; Say "room $($r.ToUpper()) credentials staged" }
}
if (-not (Test-Path (Join-Path $CfDir "$tunnelId.json"))) {
  throw "No credentials file for room $Room. Plug the ALCON USB stick in and run this again. Nothing has been changed."
}
Ok "credentials for room $Room in place"

# ---------------------------------------------------------------- 3. back up
Head "3. Backing up"
New-Item -ItemType Directory -Path $Backup -Force | Out-Null
Copy-Item $envPath (Join-Path $Backup ".env") -Force
if (Test-Path "$CfDir\config.yml") { Copy-Item "$CfDir\config.yml" (Join-Path $Backup "config.yml") -Force }
Ok "saved to $Backup"

# ---------------------------------------------------------------- 4. .env
# Strip every ROOM_ID / PEER_URL line and append one of each, so there is no doubt which
# wins. Everything else in .env - the API key, the control PIN - is left untouched and is
# never printed.
Head "4. Setting the room in .env"
$keep = @(Get-Content $envPath | Where-Object { $_ -notmatch '^\s*(ROOM_ID|PEER_URL)\s*=' })
$keep += "ROOM_ID=$Room"
$keep += "PEER_URL=$peerUrl"
Set-Content -Path $envPath -Value $keep -Encoding ASCII
Ok "ROOM_ID=$Room, peer $peerUrl"
Say "control PIN and API key untouched"

# ---------------------------------------------------------------- 5. tunnel config
Head "5. Pointing the tunnel at $hostName"
@"
tunnel: $tunnelId
credentials-file: $CfDir\$tunnelId.json
ingress:
  - hostname: $hostName
    service: http://localhost:3000
  - service: http_status:404
"@ | Set-Content "$CfDir\config.yml" -Encoding ASCII
Ok "config.yml written"

$svcKey = "HKLM:\SYSTEM\CurrentControlSet\Services\Cloudflared"
if (-not (Test-Path $svcKey)) {
  Say "installing the tunnel service"
  $ErrorActionPreference = "Continue"
  & "$CfDir\cloudflared.exe" service install *> "$CfDir\service-install.log"
  $ErrorActionPreference = "Stop"
}
if (Test-Path $svcKey) {
  Set-ItemProperty -Path $svcKey -Name ImagePath -Value "$CfDir\cloudflared.exe --config=$CfDir\config.yml tunnel run"
  Stop-Process -Name cloudflared -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 3
  Set-Service cloudflared -StartupType Automatic
  Start-Service cloudflared -ErrorAction SilentlyContinue
  Ok "tunnel service set to run automatically"
} else {
  Bad "the tunnel service did not install - see $CfDir\service-install.log"
  Bad "the stand will still work on the screen; only the phone control page will not."
}

# ---------------------------------------------------------------- 6. start at logon
Head "6. Starting at logon"
$action  = New-ScheduledTaskAction -Execute "powershell.exe" `
             -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$startPs1`""
$trigger = New-ScheduledTaskTrigger -AtLogOn
$set     = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
             -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName "MeetThePatient" -Action $action -Trigger $trigger `
  -Settings $set -RunLevel Highest -Force | Out-Null
Ok "MeetThePatient task registered"

# ---------------------------------------------------------------- 7. autologin
# A spare was installed without this, so it would stop at a login screen inside a wall.
Head "7. Autologin"
$lg = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon"
if ((Get-ItemProperty -Path $lg -Name AutoAdminLogon -ErrorAction SilentlyContinue).AutoAdminLogon -eq "1") {
  Ok "already on for $((Get-ItemProperty $lg).DefaultUserName)"
} else {
  Warn "Without this the machine boots to a login screen inside the wall."
  Warn "Windows stores it in the registry obfuscated, not encrypted."
  $sec = Read-Host "   Password for $env:USERNAME (blank to skip)" -AsSecureString
  $pw  = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
           [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
  if ($pw) {
    Set-ItemProperty -Path $lg -Name AutoAdminLogon    -Value "1"              -Type String
    Set-ItemProperty -Path $lg -Name DefaultUserName   -Value $env:USERNAME    -Type String
    Set-ItemProperty -Path $lg -Name DefaultPassword   -Value $pw              -Type String
    Set-ItemProperty -Path $lg -Name DefaultDomainName -Value $env:COMPUTERNAME -Type String
    Ok "autologin set for $env:USERNAME"
  } else {
    Warn "SKIPPED - someone will have to log this machine in by hand after every boot."
  }
}

# ---------------------------------------------------------------- 8. done
Head "Ready"
Say "Room $Room    $hostName"
Say "Backup       $Backup"
Write-Host ""
Warn "Rotate the screen to portrait if it is not already:"
Warn "Settings > System > Display > Display orientation > Portrait."
Write-Host ""
Write-Host "   After the reboot, check three things:" -ForegroundColor White
Write-Host "     1. the patient is on the screen" -ForegroundColor White
Write-Host "     2. https://$hostName/control/ opens on your phone and the PIN works" -ForegroundColor White
Write-Host "     3. the other room still answers on its own address" -ForegroundColor White
Write-Host ""
$r = Read-Host "   Reboot now? (Y/n)"
if ($r -notmatch "^[Nn]") { Restart-Computer -Force }
