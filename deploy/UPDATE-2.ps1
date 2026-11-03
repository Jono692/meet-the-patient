<#
  Meet the Patient - update 2: the prompt, the hard delete and the hold screen.
  Run this on each show PC. One pass, nothing room-specific.

    over the tunnel        powershell -ExecutionPolicy Bypass -File UPDATE-2.ps1
    from the T7, offline   powershell -ExecutionPolicy Bypass -File UPDATE-2.ps1 -FromFolder "D:\MTP-SHOW-KIT\5 Update 2 - prompt, hard delete, hold screen"

  What it changes and why:

    personas.json + providers\prompt.js   THE PROMPT. Both, not just personas.json.
        The prompt.js on this PC is older than the Mac's and is missing two whole
        blocks: WHAT YOU WERE TOLD ABOUT YOUR EYES (the patient's own history and
        test results) and WHAT MATTERS MOST TO YOU (their priorities and the forced
        choice). With the old prompt.js the patients cannot tell a surgeon their
        scans and have no priorities to be listened to - which is the activation.
        personas.json also carries 3 Nov's tightening: the AI question, no ratings
        or scores, a friend's lens described but never how it went, medication.

    providers\tavus.js + server.js        HARD DELETE AFTER EVERY CONSULT.
        Each consult is now ended AND hard deleted from Tavus the moment it
        finishes, and the outcome is written to events.jsonl as session-deleted or
        session-not-deleted. Nothing a surgeon says stays on Tavus's servers.

    public\app.js + public\idle\hold.mp4  THE HOLD SCREEN.
        The approved between-consults loop. app.js looks for ONE clip at
        /idle/hold.mp4 instead of the three per-patient ones, so both files go or
        neither. Static files: the app does not need them, the kiosk browser does,
        and it only picks them up on a REBOOT. The script says so again at the end.

    public\control\index.html + alcon.png  THE PHONE PAGE AND THE LOGO.
        Already on both show PCs from UPDATE.ps1 on 3 Nov, so on those two this is a
        no-op that rewrites the same bytes. They are in here for the SPARE: a PC built
        from the USB stick has neither, and UPDATE.ps1 can no longer bring it current
        because its server.js fingerprint is now the old one. This script is the only
        one to run.

    tools\                                THREE CHECKS, for this PC.
        tavus-sync.js         push the prompt to Tavus and read it back
        tavus-delete-check.js prove a consult really is deleted, on this machine
        tavus-purge.js        list anything left on the account; --delete clears it

  Safe by design, same as UPDATE.ps1:
    * Node is located and proven to run BEFORE anything is stopped or changed
    * every file is downloaded and SHA-256 checked before anything is touched
    * one bad hash and nothing is changed at all
    * the originals are copied to deploy\backup-<timestamp>\ first
    * the app is restarted only between consults, never during one
    * only the app is restarted - the tunnel and the kiosk browser are left alone

  3 Nov: UPDATE.ps1 v1 stopped the app and then could not start it again, because
  it called a bare "node". Node is NOT on PATH on these PCs. Never stop something
  until you have proved you can start it. Hence step 1.
#>

# -FromFolder runs the whole thing from a folder instead of the tunnel, for Auckland with
# no internet: point it at "5 Update 2 ..." on the Samsung T7. Every other step, the hash
# checks included, is identical - only where the files come from changes.
param([string]$FromFolder)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$App    = "C:\meet-the-patient"
$Base   = "https://demo.meetthepatient.com.au/update"
$Api    = "http://localhost:3000"
$Stamp  = Get-Date -Format "yyyyMMdd-HHmmss"
$Backup = Join-Path $App "deploy\backup-$Stamp"
$Tmp    = Join-Path $env:TEMP "mtp-update2-$Stamp"
$Bust   = "$Stamp-$(Get-Random)"

$Files = @(
  @{ Name = "personas.json";   Url = "personas.json";          Dest = "personas.json";                Sha = "63A1DB04BF502A46D0A899D20C0D02CD2D5B9CE537DCBB80CDDF105A752BBCFA" },
  @{ Name = "prompt.js";       Url = "prompt.js";              Dest = "providers\prompt.js";          Sha = "7AE305BF479B7960E606DA6BAAB2A52171DE322B67B55E80CB2D6393CCBD8DE7" },
  @{ Name = "tavus provider";  Url = "tavus-provider.js";      Dest = "providers\tavus.js";           Sha = "744F40CFA0ADDA599DFCC719C5E3E5DF55556B9CBB6AF9AD4C466B366A84B651" },
  @{ Name = "server.js";       Url = "server.js";              Dest = "server.js";                    Sha = "6AAD4243CE078D8166C4FD7EF69ACDECAC9C3E35EF7F33A26C375B61C139208C" },
  @{ Name = "stand page";      Url = "app.js";                 Dest = "public\app.js";                Sha = "F2C256A2724651770BA48E386A62379AC6BAE743CB87717A43283548CF319D7C" },
  @{ Name = "hold screen";     Url = "hold.mp4";               Dest = "public\idle\hold.mp4";         Sha = "1876E7594FD4A1374D286DFDF933D81C5912572160E2D97F90BA56DF439D4DBA" },
  @{ Name = "control page";    Url = "control-index.txt";      Dest = "public\control\index.html";    Sha = "ED81B677C77CBEE6A314D3171887BFA345023239735DFC818743FE69EEA8B514" },
  @{ Name = "Alcon logo";      Url = "alcon.png";              Dest = "public\control\alcon.png";     Sha = "ABA33D8E0900F0DC75D739FD3B205373413986F856D36AEF03897BEED93225D4" },
  @{ Name = "tavus-sync";      Url = "tavus-sync.js";          Dest = "tools\tavus-sync.js";          Sha = "59DF611E9E93660C21980B4787098AC9FB33D7D5CB933A89466CA3D638E718DC" },
  @{ Name = "delete-check";    Url = "tavus-delete-check.js";  Dest = "tools\tavus-delete-check.js";  Sha = "267FBA073066773A040278AF119BC51843FF3EF7B7BAC27E1BF59152D132D352" },
  @{ Name = "tavus-purge";     Url = "tavus-purge.js";         Dest = "tools\tavus-purge.js";         Sha = "D4C320D75243E82BBFA58516967DFD42A7CA4646ED5AC1DC198690EFFF071A2B" }
)

function Say  ($m) { Write-Host ("   " + $m) }
function Head ($m) { Write-Host ""; Write-Host $m -ForegroundColor Cyan }
function Good ($m) { Write-Host $m -ForegroundColor Green }
function Bad  ($m) { Write-Host $m -ForegroundColor Red }

Head "Meet the Patient - update 2: prompt, hard delete, hold screen"
if (-not (Test-Path $App)) { throw "No app folder at $App - is this the right PC?" }

# ---------------------------------------------------------------- 1. find Node, and prove it
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
# Accept */* is deliberate. Cloudflare injects its Web Analytics beacon into anything it
# serves as HTML to a browser-looking request, which is what stopped UPDATE.ps1 on ALCON 1.
# None of these nine are HTML, and all nine were checked through the tunnel both ways on
# the Mac before this script was written - but the header costs nothing and removes the
# whole class of problem.
if ($FromFolder) {
  if (-not (Test-Path $FromFolder)) { throw "No such folder: $FromFolder - nothing has been changed." }
  Head "2. Copying from the folder and checking ($($Files.Count) files, 16 MB of it is the hold screen)"
  Say "from $FromFolder"
} else {
  Head "2. Downloading and checking ($($Files.Count) files, 16 MB of it is the hold screen)"
}
foreach ($f in $Files) {
  $local = Join-Path $Tmp $f.Url
  if ($FromFolder) {
    $from = Join-Path $FromFolder $f.Url
    if (-not (Test-Path $from)) { throw "$($f.Url) is not in $FromFolder - nothing has been changed." }
    Copy-Item $from $local -Force
  } else {
    # ?v=$Bust is not decoration. Cloudflare caches what this folder serves for four hours,
    # 404s included: a file published a minute ago can still answer with the error page from
    # before it existed, 155 bytes of HTML that is not a .png. Measured on the Mac on 3 Nov.
    # A query string nobody has used before forces a MISS and we get the real file.
    Invoke-WebRequest "$Base/$($f.Url)?v=$Bust" -OutFile $local -UseBasicParsing -TimeoutSec 300 -Headers @{ Accept = "*/*" }
  }
  $got = (Get-FileHash $local -Algorithm SHA256).Hash
  if ($got -ine $f.Sha) {
    Bad "   $($f.Name): SHA-256 MISMATCH"
    Bad "   expected $($f.Sha)"
    Bad "   got      $got"
    throw "That file does not match its fingerprint. Nothing on this PC has been changed."
  }
  Say ("{0,-15} ok   {1,10:N0} bytes" -f $f.Name, (Get-Item $local).Length)
  $f.Local = $local
}
Good "   all $($Files.Count) verified"

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
# Flattened into one folder, so prompt.js and tavus.js keep their own names and
# nothing collides with a file of the same leaf name from another folder.
Head "4. Backing up what is there now"
New-Item -ItemType Directory -Path $Backup -Force | Out-Null
foreach ($f in $Files) {
  $cur  = Join-Path $App $f.Dest
  $leaf = ($f.Dest -replace '\\', '_')
  if (Test-Path $cur) { Copy-Item $cur (Join-Path $Backup $leaf) -Force; Say "$($f.Dest) saved" }
  else                { Say "$($f.Dest) not present yet - new file" }
}
Say "backup folder: $Backup"

# ---------------------------------------------------------------- 5. install
Head "5. Installing"
foreach ($f in $Files) {
  $cur = Join-Path $App $f.Dest
  New-Item -ItemType Directory -Path (Split-Path $cur -Parent) -Force | Out-Null
  Copy-Item $f.Local $cur -Force
  Say "$($f.Name) -> $($f.Dest)"
}

# ---------------------------------------------------------------- 6. restart the app only
# Stop by the process that actually holds port 3000, never by name: cloudflared and the
# kiosk browser must survive, and a stray "stop every node" would take out anything else.
# The restart is what picks up the new prompt: server.js reads personas.json once at boot.
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

# ---------------------------------------------------------------- 7. prove the app is back
Head "7. Checking the app"
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

# ---------------------------------------------------------------- 8. prove the prompt
# Pushes the new prompt to Tavus, reads back what Tavus stored and compares. This also
# warms the PAL cache, so the first surgeon of the day is not waiting while a PAL is built.
# From here on a failure is a FAILED CHECK, not a failed update: the files are in and the
# app is running either way, so nothing is thrown.
Head "8. Checking the prompt reached Tavus"
# $ErrorActionPreference is Stop for the whole script, and a node tool writing a word to
# stderr is enough to throw under it. A check is not worth throwing over once the files
# are in, so both checks run with their own error handling and report instead.
$syncOk = $false
try {
  Push-Location $App
  # Windows PowerShell 5.1 turns a native command's stderr into error records, and under
  # Stop one word on stderr would throw. Continue, locally, for the length of the check.
  $ErrorActionPreference = "Continue"
  & $node "tools\tavus-sync.js" "--push" 2>&1 | Write-Host
  $syncOk = ($LASTEXITCODE -eq 0)
} catch {
  Bad "   The prompt check could not run: $($_.Exception.Message)"
} finally { Pop-Location; $ErrorActionPreference = "Stop" }
if ($syncOk) { Good "   all three patients match personas.json" }
else {
  Bad "   The prompt check did not pass - read the three lines above."
  Bad "   The update IS installed. Do not run this script again; sort the prompt out first."
}

# ---------------------------------------------------------------- 9. prove the hard delete
# Opens a throwaway conversation, ends it through the server's own endSession, then asks
# Tavus for it again. HTTP 400 Invalid conversation_id is the pass.
Head "9. Checking a consult really is deleted"
$delOk = $false
try {
  Push-Location $App
  $ErrorActionPreference = "Continue"
  & $node "tools\tavus-delete-check.js" 2>&1 | Write-Host
  $delOk = ($LASTEXITCODE -eq 0)
} catch {
  Bad "   The delete check could not run: $($_.Exception.Message)"
} finally { Pop-Location; $ErrorActionPreference = "Stop" }
if ($delOk) { Good "   a consult is ended and hard deleted on this PC" }
else {
  Bad "   The delete check did not pass - read the lines above."
  Bad "   Consults may be staying on Tavus. Tell Jono before doors."
}

# ---------------------------------------------------------------- done
Write-Host ""
if ($syncOk -and $delOk) { Good "Update 2 installed and both checks passed." }
else { Bad "Update 2 installed, but a check failed. Read back up the screen." }
Say "Backup kept at $Backup"
Write-Host ""
Write-Host "ONE THING LEFT: REBOOT THIS PC." -ForegroundColor Yellow
Write-Host "   The kiosk browser is still showing the old stand page from memory, so the new"
Write-Host "   hold screen will not appear until it reloads, and F5 is swallowed by the app."
Write-Host "   Start > Power > Restart. Then watch for the new loop between consults."
