@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 22+ is required.
  echo Install Node.js, then run this file again.
  pause
  exit /b 1
)

echo Checking port 4176...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":4176" ^| findstr "LISTENING"') do (
  echo Stopping old YYC server process %%P...
  taskkill /PID %%P /F >nul 2>&1
)

echo Starting Yuvakesari Youth Club...
start "YYC Server" cmd /k "cd /d ""%~dp0"" && node server.js"
timeout /t 2 /nobreak >nul
start "" "http://localhost:4176/"
endlocal
