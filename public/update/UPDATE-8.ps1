<#
  Meet the Patient - update 8: what the first show morning taught us.

  THIS REPLACES UPDATE-7. Idempotent over 7, 6, 5, 4. Three files differ from
  UPDATE-7: personas.json, server.js, tools\tavus-sync.js. app.js is UNCHANGED,
  so there is NO REBOOT at the end of this one - the app restarts itself.

    * personas.json: shared_rules no longer carries Peter's topography result as
      a worked example of how to describe your scans. Margaret and Rami were
      reciting it to surgeons. No clinical value has been added or changed; one
      sentence of instruction text was removed and one example line reworded.
      (Already patched live on Tavus on 7 Nov; this makes the file match so the
      next PAL build cannot bring it back.)

    * tools\tavus-sync.js: before pushing, builds every patient's prompt and
      refuses, exit code 3, if any other patient's clinical values appear in it.

    * server.js: logs each conversation id the moment it is created, and on
      boot ends and hard deletes any conversation that was opened but never
      deleted - the case where a PC is rebooted mid-consult.

    * .env, two lines only, everything else untouched and never printed:
        TAVUS_MAX_CALL_SECONDS=600      consults go from 7 minutes to 10
        TAVUS_INTERRUPTIBILITY=low      written if missing, set to low if not

    * hosts file: demo, room-a and room-b .meetthepatient.com.au pinned to
      Cloudflare. The venue intercepts DNS; without the two room pins the
      host page cannot show the other room.

    * hold.mp4 (16 MB) is no longer downloaded when the copy on this PC already
      matches its fingerprint. It is checked either way.

  Changing personas.json changes the PAL signature, so step 6 builds fresh PALs
  from .env - which this script has just set to low before step 6 runs.
#>

param([string]$FromFolder)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$App    = "C:\meet-the-patient"
$Base   = "https://demo.meetthepatient.com.au/update"
$Api    = "http://localhost:3000"
$Stamp  = Get-Date -Format "yyyyMMdd-HHmmss"
$Backup = Join-Path $App "deploy\backup-$Stamp"
$Tmp    = Join-Path $env:TEMP "mtp-update8-$Stamp"
$Bust   = "$Stamp-$(Get-Random)"

$Files = @(
  @{ Name = "personas.json";   Url = "personas.json";             Dest = "personas.json";                             Sha = "9782D033EAC119B356ABD2439CA33BC61A3601C3ABF3FDF3E4A1B20970BEE95C" },
  @{ Name = "prompt.js";       Url = "prompt.js";                 Dest = "providers\prompt.js";                       Sha = "7AE305BF479B7960E606DA6BAAB2A52171DE322B67B55E80CB2D6393CCBD8DE7" },
  @{ Name = "tavus provider";  Url = "tavus-provider.js";         Dest = "providers\tavus.js";                        Sha = "744F40CFA0ADDA599DFCC719C5E3E5DF55556B9CBB6AF9AD4C466B366A84B651" },
  @{ Name = "server.js";       Url = "server.js";                 Dest = "server.js";                                 Sha = "2CB2DDE0989B4CE1CB9C8E628248406D531118346EEB3062F6BB3D752D55BBC9" },
  @{ Name = "stand page";      Url = "app.js";                    Dest = "public\app.js";                             Sha = "8279EBDA45DFCA1E6009E008676876B56CDF2C20B67975053BF927D348199334" },
  @{ Name = "hold screen";     Url = "hold.mp4";                  Dest = "public\idle\hold.mp4";                      Sha = "1876E7594FD4A1374D286DFDF933D81C5912572160E2D97F90BA56DF439D4DBA" },
  @{ Name = "control page";    Url = "control-index.txt";         Dest = "public\control\index.html";                 Sha = "763441B4D3155E39C314E6F590213CF795BC46ED68BE10110A80C072A33CDB75" },
  @{ Name = "Alcon logo";      Url = "alcon.png";                 Dest = "public\control\alcon.png";                  Sha = "ABA33D8E0900F0DC75D739FD3B205373413986F856D36AEF03897BEED93225D4" },
  @{ Name = "tavus-sync";      Url = "tavus-sync.js";             Dest = "tools\tavus-sync.js";                       Sha = "20BCAB31BE7D6EFE15EB4F0A44C325F33EB5759B9EF0477BA1C786DA58C27B23" },
  @{ Name = "delete-check";    Url = "tavus-delete-check.js";     Dest = "tools\tavus-delete-check.js";               Sha = "267FBA073066773A040278AF119BC51843FF3EF7B7BAC27E1BF59152D132D352" },
  @{ Name = "tavus-purge";     Url = "tavus-purge.js";            Dest = "tools\tavus-purge.js";                      Sha = "D4C320D75243E82BBFA58516967DFD42A7CA4646ED5AC1DC198690EFFF071A2B" },
  @{ Name = "CLAUDE.md";       Url = "CLAUDE-MD-SHOW-PC.md";      Dest = "CLAUDE.md";                                 Sha = "8E3B26E4AA68FD4F93667F5BEED055B8ABA287C0296D8DEF88312670D75153FA" },
  @{ Name = "Auckland brief";  Url = "CLAUDE-BRIEF-AUCKLAND.md";  Dest = "deploy\CLAUDE-BRIEF-AUCKLAND.md";           Sha = "2465B47604EFA78A8DD1A9F65C396817CA07013F3B3230989BF071283AFD0CA3" }
)

# The three hostnames this show depends on, all on the same Cloudflare zone and the same
# address. The venue intercepts port 53 and answers "no such domain" for them, measured on
# both PCs on 7 Nov. Pinning demo alone got the updates through; the two room pins are
# what let a room's host page reach the other room.
$HostsPin = "104.21.96.126"
$HostsNames = @("demo.meetthepatient.com.au", "room-a.meetthepatient.com.au", "room-b.meetthepatient.com.au")

function Say  ($m) { Write-Host ("   " + $m) }
function Head ($m) { Write-Host ""; Write-Host $m -ForegroundColor Cyan }
function Good ($m) { Write-Host $m -ForegroundColor Green }
function Bad  ($m) { Write-Host $m -ForegroundColor Red }

Head "Meet the Patient - update 8: prompt leak, 10-minute consults, orphan sweep, hosts pins"
if (-not (Test-Path $App)) { throw "No app folder at $App - is this the right PC?" }
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { throw "Not running as Administrator. The hosts file needs it. Nothing has been changed." }

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
# A file already on this PC whose SHA-256 matches its pin is taken from the PC instead of
# the tunnel. That is hold.mp4, 16 MB, which cost minutes on venue internet on 7 Nov for a
# file that was already there. It is still hashed; only the download is skipped.
# Accept */* is deliberate: Cloudflare injects its analytics beacon into anything it serves
# as HTML to a browser-looking request. None of these are HTML; the header costs nothing.
if ($FromFolder) {
  if (-not (Test-Path $FromFolder)) { throw "No such folder: $FromFolder - nothing has been changed." }
  Head "2. Copying from the folder and checking ($($Files.Count) files)"
  Say "from $FromFolder"
} else {
  Head "2. Downloading and checking ($($Files.Count) files)"
}
foreach ($f in $Files) {
  $local = Join-Path $Tmp $f.Url
  $cur   = Join-Path $App $f.Dest
  $have  = $null
  if (Test-Path $cur) { try { $have = (Get-FileHash $cur -Algorithm SHA256).Hash } catch {} }
  if ($have -and ($have -ieq $f.Sha)) {
    Copy-Item $cur $local -Force
    $how = "already on this PC"
  } elseif ($FromFolder) {
    $from = Join-Path $FromFolder $f.Url
    if (-not (Test-Path $from)) { throw "$($f.Url) is not in $FromFolder - nothing has been changed." }
    Copy-Item $from $local -Force
    $how = "copied"
  } else {
    # ?v=$Bust is not decoration. Cloudflare caches this folder for four hours, 404s
    # included. A query string nobody has used before forces a MISS and we get the file.
    Invoke-WebRequest "$Base/$($f.Url)?v=$Bust" -OutFile $local -UseBasicParsing -TimeoutSec 300 -Headers @{ Accept = "*/*" }
    $how = "downloaded"
  }
  $got = (Get-FileHash $local -Algorithm SHA256).Hash
  if ($got -ine $f.Sha) {
    Bad "   $($f.Name): SHA-256 MISMATCH"
    Bad "   expected $($f.Sha)"
    Bad "   got      $got"
    throw "That file does not match its fingerprint. Nothing on this PC has been changed."
  }
  Say ("{0,-15} ok   {1,10:N0} bytes   {2}" -f $f.Name, (Get-Item $local).Length, $how)
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
Head "4. Backing up what is there now"
New-Item -ItemType Directory -Path $Backup -Force | Out-Null
foreach ($f in $Files) {
  $cur  = Join-Path $App $f.Dest
  $leaf = ($f.Dest -replace '\\', '_')
  if (Test-Path $cur) { Copy-Item $cur (Join-Path $Backup $leaf) -Force; Say "$($f.Dest) saved" }
  else                { Say "$($f.Dest) not present yet - new file" }
}
$envPath = Join-Path $App ".env"
if (Test-Path $envPath) { Copy-Item $envPath (Join-Path $Backup "_env") -Force; Say ".env saved" }
Say "backup folder: $Backup"

# ---------------------------------------------------------------- 5. install
Head "5. Installing"
foreach ($f in $Files) {
  $cur = Join-Path $App $f.Dest
  New-Item -ItemType Directory -Path (Split-Path $cur -Parent) -Force | Out-Null
  Copy-Item $f.Local $cur -Force
  Say "$($f.Name) -> $($f.Dest)"
}

# ---------------------------------------------------------------- 5b. .env, two lines
# First update to touch .env. Two keys only, matched as whole lines; nothing else is read
# for a value, printed, or rewritten. Bytes are written back as UTF-8 without BOM with the
# file's own line endings, so the API key and PIN lines are copied through untouched.
Head "5b. .env: 10-minute consults, low interruptibility"
if (-not (Test-Path $envPath)) { throw ".env is missing at $envPath - the files are installed but the app cannot run without it." }
$envText = [IO.File]::ReadAllText($envPath)
$nl = if ($envText -match "`r`n") { "`r`n" } else { "`n" }
function Set-EnvLine ([string]$text, [string]$key, [string]$value) {
  $line = "$key=$value"
  if ($text -match "(?m)^$key=.*$") { return [regex]::Replace($text, "(?m)^$key=.*$", $line) }
  if ($text.Length -gt 0 -and -not $text.EndsWith("`n")) { $text += $nl }
  return $text + $line + $nl
}
foreach ($k in @("TAVUS_MAX_CALL_SECONDS", "TAVUS_INTERRUPTIBILITY")) {
  $m = [regex]::Match($envText, "(?m)^$k=.*$")
  Say ("{0,-24} before: {1}" -f $k, $(if ($m.Success) { $m.Value } else { "(no line)" }))
}
$envText = Set-EnvLine $envText "TAVUS_MAX_CALL_SECONDS" "600"
$envText = Set-EnvLine $envText "TAVUS_INTERRUPTIBILITY" "low"
[IO.File]::WriteAllText($envPath, $envText, (New-Object Text.UTF8Encoding $false))
$check = [IO.File]::ReadAllText($envPath)
foreach ($k in @("TAVUS_MAX_CALL_SECONDS", "TAVUS_INTERRUPTIBILITY")) {
  $m = [regex]::Match($check, "(?m)^$k=.*$")
  Say ("{0,-24} after:  {1}" -f $k, $m.Value)
}
if (-not ($check -match "(?m)^TAVUS_MAX_CALL_SECONDS=600$") -or -not ($check -match "(?m)^TAVUS_INTERRUPTIBILITY=low$")) {
  throw ".env did not read back as expected. The backup is at $Backup\_env."
}
Good "   .env set"

# ---------------------------------------------------------------- 5c. hosts pins
Head "5c. hosts: pinning the three meetthepatient hostnames"
$hostsPath = Join-Path $env:SystemRoot "System32\drivers\etc\hosts"
$hostsText = [IO.File]::ReadAllText($hostsPath)
$added = @()
foreach ($h in $HostsNames) {
  if ($hostsText -match "(?m)^\s*[0-9a-fA-F:.]+\s+$([regex]::Escape($h))(\s|$)") { Say "$h already pinned" }
  else { $added += "$HostsPin $h" }
}
if ($added.Count) {
  if (-not $hostsText.EndsWith("`n")) { $hostsText += "`r`n" }
  $hostsText += ($added -join "`r`n") + "`r`n"
  [IO.File]::WriteAllText($hostsPath, $hostsText, (New-Object Text.UTF8Encoding $false))
  foreach ($a in $added) { Say "added  $a" }
  ipconfig /flushdns | Out-Null
}
foreach ($h in $HostsNames) {
  try { $ip = (Resolve-DnsName $h -Type A -ErrorAction Stop | Select-Object -First 1).IPAddress; Say ("{0,-30} -> {1}" -f $h, $ip) }
  catch { Bad "   $h does not resolve even with the pin - tell Jono" }
}

# ---------------------------------------------------------------- 6. prove the prompt
# Pushes the new prompt to Tavus and reads back what Tavus stored. BEFORE the restart on
# purpose: the app reads .tavus-pals.json once at boot. tavus-sync now refuses with exit
# code 3 if any patient's prompt contains another patient's clinical values. A failure here
# is a FAILED CHECK, not a failed update: the files are in, and the restart still happens.
Head "6. Checking the prompt reached Tavus"
$syncOk = $false
try {
  Push-Location $App
  $ErrorActionPreference = "Continue"
  & $node "tools\tavus-sync.js" "--push" 2>&1 | Write-Host
  $syncOk = ($LASTEXITCODE -eq 0)
  if ($LASTEXITCODE -eq 3) { Bad "   REFUSED: a patient's prompt contains another patient's clinical values. Nothing was pushed." }
} catch {
  Bad "   The prompt check could not run: $($_.Exception.Message)"
} finally { Pop-Location; $ErrorActionPreference = "Stop" }
if ($syncOk) { Good "   leak check passed and all three patients match personas.json" }
else {
  Bad "   The prompt check did not pass - read the lines above."
  Bad "   The files ARE installed and the restart below still happens. Do not run this"
  Bad "   script again; tell Jono."
}

# ---------------------------------------------------------------- 7. restart the app only
# Stop by the process that holds port 3000, never by name: cloudflared and the kiosk
# browser must survive. The restart picks up server.js, personas.json, .env and the PAL
# cache that step 6 has just written. On boot the new server.js also sweeps any
# conversation that was opened and never deleted.
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
$peerOk = $false
try { $peer = Invoke-RestMethod "$Api/api/peer/room" -TimeoutSec 8; if ($peer.id) { $peerOk = $true; Say ("other room reachable: room {0} is {1}" -f $peer.id, $peer.state) } } catch {}
if (-not $peerOk) { Bad "   The other room did not answer through the relay. Its own control page still works; tell Jono." }

# ---------------------------------------------------------------- 9. prove the hard delete
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
  Bad "   Consults may be staying on Tavus. Tell Jono."
}

# ---------------------------------------------------------------- done
Write-Host ""
if ($syncOk -and $delOk) { Good "Update 8 installed and both checks passed." }
else { Bad "Update 8 installed, but a check failed. Read back up the screen." }
Say "Backup kept at $Backup"
Write-Host ""
Write-Host "NO REBOOT NEEDED. app.js did not change, and the app has restarted itself." -ForegroundColor Yellow
Write-Host "   Consults are now 10 minutes. The hold screen should still be playing."
