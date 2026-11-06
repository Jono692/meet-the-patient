@echo off
title Meet the Patient - Update 7
color 0B

rem Double-click launcher for UPDATE-7. Does exactly what the PowerShell one-liner
rem does: elevates, downloads the script, checks its SHA-256, and only then runs it.
rem If the fingerprint does not match it stops and changes nothing.

net session >nul 2>&1
if %errorlevel% NEQ 0 (
  echo Asking for administrator rights. Say yes to the prompt.
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

set "URL=https://demo.meetthepatient.com.au/update/UPDATE-7.ps1"
set "WANT=D7633BD55DA6B4C5F81C81874706C334F1D638AA2002BA2E0F3E9EF76364AF53"
set "DEST=%TEMP%\UPDATE-7.ps1"

echo.
echo  Meet the Patient - Update 7
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
echo  Then REBOOT this PC.
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
