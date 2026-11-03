<#
  SUPERSEDED on 3 Nov by UPDATE-2.ps1. Run that instead, on any PC including a spare
  built from the USB stick: it carries everything this script did plus the prompt, the
  hard delete and the hold screen. This one now fails at its own server.js check,
  safely and without changing anything, because the published server.js has moved on.
  Kept for the record of what went to both PCs on the morning of 3 Nov.

  Meet the Patient - pull the current server.js and control page from the Mac.

  Safe by design:
    * Node is located and proven to run BEFORE anything is stopped or changed
    * every file is downloaded and SHA-256 checked before anything on this PC is touched
    * one bad hash and nothing is changed at all
    * the originals are copied to deploy\backup-<timestamp>\ first
    * the app is restarted only between consults, never during one
    * only the app is restarted - the Cloudflare tunnel and the kiosk browser are left alone

  The same script runs on both show PCs. Nothing in it is room-specific.

  3 Nov: v1 stopped the app and then could not start it again, because it called a bare
  "node". Node is NOT on PATH on the show PCs - the USB installer unzips it inside the app
  folder. ALCON 1 had to be rebooted. Hence step 1: find Node and run it before touching
  anything. Never stop something until you have proved you can start it.
#>

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$App    = "C:\meet-the-patient"
$Base   = "https://demo.meetthepatient.com.au/update"
$Api    = "http://localhost:3000"
$Stamp  = Get-Date -Format "yyyyMMdd-HHmmss"
$Backup = Join-Path $App "deploy\backup-$Stamp"
$Tmp    = Join-Path $env:TEMP "mtp-update-$Stamp"

$Files = @(
  @{ Name = "server.js";    Url = "server.js";          Dest = "server.js";                 Sha = "AA7E2FFB2B65782756EA1699BC8503A7EDDE757450FD2C341C45D974DE262751" },
  @{ Name = "control page"; Url = "control-index.txt";  Dest = "public\control\index.html"; Sha = "ED81B677C77CBEE6A314D3171887BFA345023239735DFC818743FE69EEA8B514" },
  @{ Name = "Alcon logo";   Url = "alcon.png";          Dest = "public\control\alcon.png";  Sha = "ABA33D8E0900F0DC75D739FD3B205373413986F856D36AEF03897BEED93225D4" }
)

function Say  ($m) { Write-Host ("   " + $m) }
function Head ($m) { Write-Host ""; Write-Host $m -ForegroundColor Cyan }
function Good ($m) { Write-Host $m -ForegroundColor Green }
function Bad  ($m) { Write-Host $m -ForegroundColor Red }

Head "Meet the Patient - update from the Mac"
if (-not (Test-Path $App)) { throw "No app folder at $App - is this the right PC?" }

# ---------------------------------------------------------------- 1. find Node, and prove it
# This happens first, before a single byte is downloaded or stopped. On these PCs Node was
# unzipped into the app folder by the USB installer and is deliberately not on PATH, so a
# bare "node" fails. The glob avoids pinning the version number.
Head "1. Finding Node"
$node = $null
$candidates = @()
$nodeDir = Join-Path $App "node"
if (Test-Path $nodeDir) {
  $candidates += Get-ChildItem -Path $nodeDir -Filter "node.exe" -Recurse -ErrorAction SilentlyContinue |
                 Select-Object -ExpandProperty FullName
}
$onPath = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if ($onPath) { $candidates += $onPath }

foreach ($c in $candidates) {
  try {
    $v = & $c -v 2>$null
    if ($LASTEXITCODE -eq 0 -and $v) { $node = $c; Say "$c  ($v)"; break }
  } catch {}
}
if (-not $node) {
  Bad "   Could not find a working node.exe under $nodeDir or on PATH."
  throw "Nothing has been changed and the app has not been touched."
}

New-Item -ItemType Directory -Path $Tmp -Force | Out-Null

# ---------------------------------------------------------------- 2. fetch and verify
# Everything is checked before anything is replaced. A half-applied update on show
# hardware is worse than no update.
Head "2. Downloading and checking"
foreach ($f in $Files) {
  $local = Join-Path $Tmp $f.Url
  # Accept */* and the .txt extension on the control page are both deliberate. Cloudflare
  # injects its Web Analytics beacon into anything it serves as HTML to a browser-looking
  # request, which changes the bytes and stopped this script on ALCON 1 on 3 Nov. Served as
  # text/plain and asked for as */*, what arrives is exactly what left the Mac.
  Invoke-WebRequest "$Base/$($f.Url)" -OutFile $local -UseBasicParsing -Headers @{ Accept = "*/*" }
  $got = (Get-FileHash $local -Algorithm SHA256).Hash
  if ($got -ine $f.Sha) {
    Bad "   $($f.Name): SHA-256 MISMATCH"
    Bad "   expected $($f.Sha)"
    Bad "   got      $got"
    throw "Download does not match. Nothing on this PC has been changed."
  }
  Say ("{0,-13} ok   {1,8:N0} bytes" -f $f.Name, (Get-Item $local).Length)
  $f.Local = $local
}
Good "   all three verified"

# ---------------------------------------------------------------- 3. wait for a gap
Head "3. Waiting for a gap between consults"
$state = "unknown"
foreach ($i in 1..120) {
  try { $state = (Invoke-RestMethod "$Api/api/room" -TimeoutSec 3).state } catch { $state = "not running" }
  if ($state -ne "live") { break }
  if ($i -eq 1) { Say "a consult is running - holding until it ends" }
  Start-Sleep -Seconds 5
}
if ($state -eq "live") { throw "Still mid-consult after 10 minutes. Nothing changed - run this again later." }
Say "room is '$state' - safe to proceed"

# ---------------------------------------------------------------- 4. back up
Head "4. Backing up what is there now"
New-Item -ItemType Directory -Path $Backup -Force | Out-Null
foreach ($f in $Files) {
  $cur  = Join-Path $App $f.Dest
  $leaf = Split-Path $f.Dest -Leaf
  if (Test-Path $cur) { Copy-Item $cur (Join-Path $Backup $leaf) -Force; Say "$leaf saved" }
  else                { Say "$leaf not present yet - new file" }
}
Say "backup folder: $Backup"

# ---------------------------------------------------------------- 5. install
Head "5. Installing"
foreach ($f in $Files) {
  $cur = Join-Path $App $f.Dest
  New-Item -ItemType Directory -Path (Split-Path $cur -Parent) -Force | Out-Null
  Copy-Item $f.Local $cur -Force
  Say "$($f.Name) installed"
}

# ---------------------------------------------------------------- 6. restart the app only
# Stop by the process that actually holds port 3000, never by name: cloudflared and the
# kiosk browser must survive, and a stray "stop every node" would take out anything else.
Head "6. Restarting the app"
$held = @()
try {
  $held = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue |
          Select-Object -ExpandProperty OwningProcess -Unique
} catch {}
if (-not $held -or $held.Count -eq 0) { Say "nothing was listening on 3000" }
foreach ($procId in $held) {
  $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
  if ($p) { Say "stopping $($p.ProcessName), pid $procId"; Stop-Process -Id $procId -Force }
}
Start-Sleep -Seconds 2

try {
  Start-Process -FilePath $node -ArgumentList "server.js" -WorkingDirectory $App -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $App "deploy\server.log") `
    -RedirectStandardError  (Join-Path $App "deploy\server.err.log")
  Say "started with $node"
} catch {
  Bad ""
  Bad "   The app could not be started: $($_.Exception.Message)"
  Bad "   The FILES ARE INSTALLED CORRECTLY - only the process is down."
  Bad "   Recover by restarting the PC: Start > Power > Restart."
  throw "App not started. Reboot to recover."
}

# ---------------------------------------------------------------- 7. prove it
Head "7. Checking"
$cfg = $null
foreach ($i in 1..30) {
  Start-Sleep -Seconds 2
  try { $cfg = Invoke-RestMethod "$Api/api/config" -TimeoutSec 3; break } catch {}
}
if (-not $cfg) {
  Bad "   The app did not answer on port 3000 within a minute."
  Bad "   The files are installed. Restart the PC to recover: Start > Power > Restart."
  throw "No answer on 3000."
}

Say ("room {0}" -f $cfg.roomId)
if ($cfg.displayMode -eq "live") { Say "display mode live" } else { Bad "   DISPLAY MODE IS '$($cfg.displayMode)' - must be live for the show" }
if ($cfg.keepTranscripts)        { Bad "   TRANSCRIPTS ARE ON - must be off for the show" } else { Say "transcripts off" }

# /api/events exists only in the new server.js. 401 means the route is there and wants
# the PIN, which is the proof we are after. 404 means the old file is still running.
$code = 0
try   { $code = (Invoke-WebRequest "$Api/api/events" -UseBasicParsing -TimeoutSec 3).StatusCode }
catch { $code = $_.Exception.Response.StatusCode.value__ }
if ($code -eq 404) { throw "/api/events still returns 404 - the new server.js is not the one running." }
Say "/api/events answers $code - new server.js is live"

Write-Host ""
Good "Done. Backup kept at $Backup"
Write-Host "Check the stand screen shows the patient, then reload the control page on your phone."
