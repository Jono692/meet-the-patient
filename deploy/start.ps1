<#
  Runs at logon. Order matters: wait for the network, then the server, then the
  tunnel, then Chrome. Hello Operator's known fault was software starting before the
  venue network was up, so this one refuses to go until it can see the internet.
#>

$ErrorActionPreference = "Continue"
$AppDir = Split-Path $PSScriptRoot -Parent
$Log    = Join-Path $AppDir "deploy\start.log"

function Say($m) {
  $line = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $m
  Add-Content -Path $Log -Value $line
  Write-Host $line
}

Say "--- start.ps1"

# 1. Wait for the internet, not merely for a link light. Up to five minutes, because
#    a venue switch can take a while to hand out an address at bump-in.
$online = $false
foreach ($i in 1..60) {
  if (Test-Connection -ComputerName "1.1.1.1" -Count 1 -Quiet -ErrorAction SilentlyContinue) {
    $online = $true; break
  }
  Start-Sleep -Seconds 5
}
Say $(if ($online) { "network up" } else { "NO NETWORK after five minutes - starting anyway" })

# 2. The app.
Push-Location $AppDir
Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory $AppDir `
  -WindowStyle Hidden -RedirectStandardOutput (Join-Path $AppDir "deploy\server.log") `
  -RedirectStandardError (Join-Path $AppDir "deploy\server.err.log")
Pop-Location

foreach ($i in 1..30) {
  Start-Sleep -Seconds 2
  try { Invoke-RestMethod "http://localhost:3000/api/config" -TimeoutSec 2 | Out-Null; break } catch {}
}
Say "server answering on 3000"

# 3. The tunnel, so the host's phone can reach this room from anywhere. It retries
#    on its own, so a late or flaky line recovers without anyone touching it.
if (Get-Command cloudflared -ErrorAction SilentlyContinue) {
  Start-Process -FilePath "cloudflared" `
    -ArgumentList "tunnel --no-autoupdate run --url http://localhost:3000 meet-the-patient" `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $AppDir "deploy\tunnel.log") `
    -RedirectStandardError  (Join-Path $AppDir "deploy\tunnel.err.log")
  Say "tunnel started"
} else {
  Say "cloudflared not found - the phone control page will not be reachable"
}

# 4. Chrome, kiosk, on the stand screen. --noerrdialogs and --disable-session-crashed-bubble
#    matter: a "Chrome didn't shut down correctly" bar across the top of a 55 inch
#    portrait screen is exactly the sort of thing that ruins it.
$chrome = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($chrome) {
  Start-Process -FilePath $chrome -ArgumentList @(
    "--kiosk", "http://localhost:3000",
    "--noerrdialogs",
    "--disable-session-crashed-bubble",
    "--disable-infobars",
    "--no-first-run",
    "--disable-features=TranslateUI",
    "--autoplay-policy=no-user-gesture-required",   # the idle loop must start by itself
    "--check-for-update-interval=31536000"
  )
  Say "chrome kiosk launched"
} else {
  Say "Chrome not found"
}

Say "--- ready"
