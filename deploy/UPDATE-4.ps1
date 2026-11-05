<#
  Meet the Patient - update 4: the prompt, the hard delete, the hold screen and the
  portrait framing. Run this on each show PC. One pass, nothing room-specific.

  THIS REPLACES UPDATE-3. ONE file differs from UPDATE-3: public\app.js.

    * public\app.js now frames the patient for a PORTRAIT screen. The Tavus feed is
      1280x720 landscape and their API has no aspect setting, so object-fit:cover on a
      1080x1920 screen showed only 31.6% of the frame's width - a head edge to edge, and
      for Margaret, whose head centre sits at 61.4% across rather than the middle, the
      right of her face off the edge entirely. Head centres measured 5 Nov off the Tavus
      upload crops: Peter .542, Margaret .614, Rami .489. The page now draws the whole
      frame at 67.5% of the screen height, sat on the bottom edge, face centred, with the
      chroma key's own #003595 around it. Landscape screens are untouched.
      Fallbacks on the kiosk URL, no rebuild needed: ?framing=nudge, ?framing=off,
      ?fill=, ?ox=. See JOB 2 in deploy\CLAUDE-BRIEF-AUCKLAND.md.

  If UPDATE-3 has already been run on this PC, run this over the top of it. It is the
  same install and it is idempotent.

  Carried over from UPDATE-3, which replaced UPDATE-2. Two differences from UPDATE-2:
    * personas.json carries Caleb Bartolo's changes of 4 November - Margaret and Rami
      now name the cataract diagnosis when asked what has brought them in, Rami's file
      reads "no visual field loss" (Alcon's clinical call) and he says his glaucoma
      ophthalmologist does not do cataract surgery, which is why he was referred on.
    * the prompt push moved from after the restart to before it. The app reads the PAL
      cache once at boot, so pushing after a restart left the running app blind to the
      new entries: it built its own duplicate PAL on the first consult and overwrote
      them. Measured on the Mac on 4 Nov. The prompt was correct either way - it is the
      same personas.json - but the push was doing nothing.

  The T7's "5 Update 2" folder still holds the OLD personas.json, so -FromFolder against
  it will stop on that hash and change nothing. Refresh the folder from iCloud first, or
  use the tunnel.

    over the tunnel        powershell -ExecutionPolicy Bypass -File UPDATE-4.ps1
    from the T7, offline   powershell -ExecutionPolicy Bypass -File UPDATE-4.ps1 -FromFolder "D:\MTP-SHOW-KIT\5 Update 2 - prompt, hard delete, hold screen"

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

    CLAUDE.md + deploy\CLAUDE-BRIEF-AUCKLAND.md   THE BRIEF FOR CLAUDE CODE ON THIS PC.
        The CLAUDE.md on these machines came off the USB stick and is the Mac's: it says
        Claude Code is on the Mac mini and tells it to run "npm start", which here would
        start a second app fighting the running one for port 3000. Replaced with one
        written for a show PC - do not restart mid-consult, Node is not on PATH, Edge not
        Chrome, show-start.ps1 not deploy\start.ps1, and how to check the work. The
        Auckland brief goes in beside it.

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
$Tmp    = Join-Path $env:TEMP "mtp-update3-$Stamp"
$Bust   = "$Stamp-$(Get-Random)"

$Files = @(
  @{ Name = "personas.json";   Url = "personas.json";             Dest = "personas.json";                             Sha = "32A293FBE01215674B104E41B39DD6C6FCA2BAFC910BF9897578F8CD4C1E062E" },
  @{ Name = "prompt.js";       Url = "prompt.js";                 Dest = "providers\prompt.js";                       Sha = "7AE305BF479B7960E606DA6BAAB2A52171DE322B67B55E80CB2D6393CCBD8DE7" },
  @{ Name = "tavus provider";  Url = "tavus-provider.js";         Dest = "providers\tavus.js";                        Sha = "744F40CFA0ADDA599DFCC719C5E3E5DF55556B9CBB6AF9AD4C466B366A84B651" },
  @{ Name = "server.js";       Url = "server.js";                 Dest = "server.js";                                 Sha = "6AAD4243CE078D8166C4FD7EF69ACDECAC9C3E35EF7F33A26C375B61C139208C" },
  @{ Name = "stand page";      Url = "app.js";                    Dest = "public\app.js";                             Sha = "07F56BA37503F108AC61D57F0AE4389CBFB6580BFAD94195E57FDE1A3E7102EA" },
  @{ Name = "hold screen";     Url = "hold.mp4";                  Dest = "public\idle\hold.mp4";                      Sha = "1876E7594FD4A1374D286DFDF933D81C5912572160E2D97F90BA56DF439D4DBA" },
  @{ Name = "control page";    Url = "control-index.txt";         Dest = "public\control\index.html";                 Sha = "ED81B677C77CBEE6A314D3171887BFA345023239735DFC818743FE69EEA8B514" },
  @{ Name = "Alcon logo";      Url = "alcon.png";                 Dest = "public\control\alcon.png";                  Sha = "ABA33D8E0900F0DC75D739FD3B205373413986F856D36AEF03897BEED93225D4" },
  @{ Name = "tavus-sync";      Url = "tavus-sync.js";             Dest = "tools\tavus-sync.js";                       Sha = "59DF611E9E93660C21980B4787098AC9FB33D7D5CB933A89466CA3D638E718DC" },
  @{ Name = "delete-check";    Url = "tavus-delete-check.js";     Dest = "tools\tavus-delete-check.js";               Sha = "267FBA073066773A040278AF119BC51843FF3EF7B7BAC27E1BF59152D132D352" },
  @{ Name = "tavus-purge";     Url = "tavus-purge.js";            Dest = "tools\tavus-purge.js";                      Sha = "D4C320D75243E82BBFA58516967DFD42A7CA4646ED5AC1DC198690EFFF071A2B" },
  @{ Name = "CLAUDE.md";       Url = "CLAUDE-MD-SHOW-PC.md";      Dest = "CLAUDE.md";                                 Sha = "8E3B26E4AA68FD4F93667F5BEED055B8ABA287C0296D8DEF88312670D75153FA" },
  @{ Name = "Auckland brief";  Url = "CLAUDE-BRIEF-AUCKLAND.md";  Dest = "deploy\CLAUDE-BRIEF-AUCKLAND.md";           Sha = "2465B47604EFA78A8DD1A9F65C396817CA07013F3B3230989BF071283AFD0CA3" }
)

function Say  ($m) { Write-Host ("   " + $m) }
function Head ($m) { Write-Host ""; Write-Host $m -ForegroundColor Cyan }
function Good ($m) { Write-Host $m -ForegroundColor Green }
function Bad  ($m) { Write-Host $m -ForegroundColor Red }

Head "Meet the Patient - update 3: prompt, hard delete, hold screen"
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

# ---------------------------------------------------------------- 6. prove the prompt
# Pushes the new prompt to Tavus, reads back what Tavus stored and compares. This also
# warms the PAL cache, so the first surgeon of the day is not waiting while a PAL is built.
# BEFORE the restart on purpose, not after: the app reads .tavus-pals.json once at boot, so
# a push into a running app is written to a file nothing re-reads, and the first consult
# then builds a duplicate PAL and overwrites it. Push first, restart second, and the app
# comes up already holding the right ids. The old server is still running during the push
# and still has the old prompt in memory - that is what the restart on the next step is for.
# A failure here is a FAILED CHECK, not a failed update: the files are in either way, so
# nothing is thrown and the restart still happens.
Head "6. Checking the prompt reached Tavus"
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
  Bad "   The files ARE installed and the restart below still happens, so the app will come"
  Bad "   up on the new prompt regardless. Do not run this script again; tell Jono."
}

# ---------------------------------------------------------------- 7. restart the app only
# Stop by the process that actually holds port 3000, never by name: cloudflared and the
# kiosk browser must survive, and a stray "stop every node" would take out anything else.
# The restart is what picks up the new prompt: server.js reads personas.json once at boot,
# and the PAL cache the step before it has just written.
Head "7. Restarting the app"
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

# ---------------------------------------------------------------- 8. prove the app is back
Head "8. Checking the app"
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
if ($syncOk -and $delOk) { Good "Update 3 installed and both checks passed." }
else { Bad "Update 3 installed, but a check failed. Read back up the screen." }
Say "Backup kept at $Backup"
Write-Host ""
Write-Host "ONE THING LEFT: REBOOT THIS PC." -ForegroundColor Yellow
Write-Host "   The kiosk browser is still showing the old stand page from memory, so the new"
Write-Host "   hold screen will not appear until it reloads, and F5 is swallowed by the app."
Write-Host "   Start > Power > Restart. Then watch for the new loop between consults."
