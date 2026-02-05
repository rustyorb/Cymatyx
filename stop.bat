@echo off
setlocal
if not exist "%~dp0.cymatyx.pid" (
  echo [cymatyx] No PID file found. Nothing to stop.
  exit /b 0
)
set /p PID=<"%~dp0.cymatyx.pid"

echo [cymatyx] Stopping PID %PID%
taskkill /PID %PID% /F >nul 2>&1
if %ERRORLEVEL% NEQ 0 echo [cymatyx] Process %PID% not running.
del "%~dp0.cymatyx.pid" >nul 2>&1
endlocal
