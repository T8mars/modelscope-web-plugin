@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title qwen-web launcher

set "APP_URL=http://127.0.0.1:5000/"
set "HEALTH_URL=http://127.0.0.1:5000/health"
set "RUNTIME_URL=http://127.0.0.1:5000/api/runtime_settings"

echo.
echo === qwen-web launcher ===
echo.

where python >nul 2>nul
if errorlevel 1 (
    echo Python was not found. Install Python 3 and add it to PATH.
    pause
    exit /b 1
)

if not exist "web_app.py" (
    echo web_app.py was not found. Run this launcher from the qwen-web project root.
    pause
    exit /b 1
)

if not defined MODELSCOPE_API_KEY (
    if defined MODELSCOPE_SDK_TOKEN (
        set "MODELSCOPE_API_KEY=%MODELSCOPE_SDK_TOKEN%"
    ) else (
        set /p MODELSCOPE_API_KEY=Input ModelScope API Token then press Enter:
    )
)

if not defined MODELSCOPE_API_KEY (
    echo MODELSCOPE_API_KEY is empty. The generation service cannot start.
    pause
    exit /b 1
)

echo Checking local service...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $h = Invoke-WebRequest -UseBasicParsing -Uri '%HEALTH_URL%' -TimeoutSec 2; if ($h.StatusCode -ge 200 -and $h.StatusCode -lt 500) { try { $r = Invoke-WebRequest -UseBasicParsing -Uri '%RUNTIME_URL%' -TimeoutSec 2; if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { exit 0 } } catch { exit 2 }; exit 2 } } catch { exit 1 }; exit 1"
if not errorlevel 1 (
    echo Service is already running. Opening Web UI...
    start "" "%APP_URL%"
    echo.
    echo Press any key to close launcher window. The existing service will keep running.
    pause >nul
    exit /b 0
)
if errorlevel 2 (
    echo Service is already running but looks outdated.
    echo Stop the old server process or close its console, then run this launcher again.
    echo.
    echo Press any key to close launcher window.
    pause >nul
    exit /b 1
)

echo Installing/checking dependencies...
python -m pip install -r requirements.txt
if errorlevel 1 (
    echo Dependency installation failed. Check Python, pip, and network access.
    pause
    exit /b 1
)

echo.
echo Starting Flask backend...
echo Console stays open. Closing this window stops the service.
echo The Web UI will open automatically when ready: %APP_URL%
echo.

start "" powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command "$deadline = (Get-Date).AddSeconds(60); do { try { $h = Invoke-WebRequest -UseBasicParsing -Uri '%HEALTH_URL%' -TimeoutSec 2; $r = Invoke-WebRequest -UseBasicParsing -Uri '%RUNTIME_URL%' -TimeoutSec 2; if ($h.StatusCode -ge 200 -and $h.StatusCode -lt 500 -and $r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { Start-Process '%APP_URL%'; exit 0 } } catch { Start-Sleep -Seconds 1 } } while ((Get-Date) -lt $deadline); exit 1"

python web_app.py
set "APP_EXIT=%ERRORLEVEL%"

echo.
echo Flask backend stopped with exit code %APP_EXIT%.
echo Press any key to close launcher window.
pause >nul
exit /b %APP_EXIT%
