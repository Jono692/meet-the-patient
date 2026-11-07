@echo off
title Meet the Patient - Update 8
color 0B

rem Double-click launcher for UPDATE-8. Does exactly what the PowerShell one-liner
rem does: elevates, downloads the script, checks its SHA-256, and only then runs it.
rem If the fingerprint does not match it stops and changes nothing.

net session >nul 2>&1
if %errorlevel% NEQ 0 (
  echo Asking for administrator rights. Say yes to the prompt.
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

set "URL=https://demo.meetthepatient.com.au/update/UPDATE-8.ps1"
set "WANT=257C5E7731D718D40CD5F774959A61225386DA67FFA2620CB9D2486B65A5CFB3"
set "DEST=%TEMP%\UPDATE-8.ps1"

echo.
echo  Meet the Patient - Update 8
echo  ---------------------------
echo.
echo  Downloading...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; try { [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri ('%URL%' + '?v=' + (Get-Random)) -OutFile '%DEST%' -UseBasicParsing -Headers @{Accept='*/*'}; exit 0 } catch { Write-Host $_.Exception.Message; exit 1 }"
if errorlevel 1 goto nonet

echo  Checking fingerprint...
powershell -NoProfile -Command "if ((Get-FileHash '%DEST%' -Algorithm SHA256).Hash -ne '%WANT%') { exit 1 } else { exit 0 }"
if errorlevel 1 goto badhash

echo  Fingerprint matches. Running the update.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%DEST%"
echo.
echo  ---------------------------
echo  Finished. READ THE LINES ABOVE before closing.
echo  No reboot needed this time. The app has restarted itself.
goto done

:nonet
echo.
echo  STOP. Could not download it.
echo  The PC is not reaching demo.meetthepatient.com.au. Nothing has been changed.
goto done

:badhash
echo.
echo  STOP. The downloaded file does not match its fingerprint.
echo  Nothing has been run and nothing has been changed. Tell Jono.
goto done

:done
echo.
pause
