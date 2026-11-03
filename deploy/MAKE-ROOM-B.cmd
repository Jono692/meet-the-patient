@echo off
rem Press the spare into service as Room B. Power the failed PC off first.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0BECOME-ROOM.ps1" -Room B
pause
