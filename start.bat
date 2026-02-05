@echo off
setlocal enabledelayedexpansion
set ROOT=%~dp0
cd /d %ROOT%

if not exist node_modules (
  echo [cymatyx] Installing dependencies...
  npm install
)

if "%PORT%"=="" set PORT=4173
if "%HOST%"=="" set HOST=0.0.0.0
set LOGDIR=%ROOT%\..\..\logs
if not exist "%LOGDIR%" mkdir "%LOGDIR%"
set PIDFILE=%ROOT%\.cymatyx.pid

echo [cymatyx] Starting dev server on %HOST%:%PORT%
for /f "usebackq" %%p in (`powershell -NoProfile -Command "(Start-Process -FilePath npm -ArgumentList 'run dev -- --host %HOST% --port %PORT%' -PassThru -WindowStyle Hidden).Id"`) do set PID=%%p
echo %PID% > "%PIDFILE%"
echo [cymatyx] PID %PID% (log: %LOGDIR%\cymatyx-dev.log)
endlocal
