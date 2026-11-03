@echo off
rem Press the spare into service as Room A. Power the failed PC off first.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0BECOME-ROOM.ps1" -Room A
pause
