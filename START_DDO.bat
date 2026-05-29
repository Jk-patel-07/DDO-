@echo off
setlocal

cd /d "%~dp0"

echo.
echo ==========================================
echo   Starting DDO on http://localhost:5173
echo ==========================================
echo.

for %%P in (5000 5173) do (
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$connections = Get-NetTCPConnection -LocalPort %%P -State Listen -ErrorAction SilentlyContinue; if ($connections) { $connections | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } }"
)

if not exist "node_modules" (
  echo Installing project packages...
  call npm install
  if errorlevel 1 goto :install_failed
) else (
  if not exist "node_modules\vite" (
    echo Repairing missing packages...
    call npm install
    if errorlevel 1 goto :install_failed
  )
)

start "DDO Backend" cmd /c "cd /d "%~dp0" && node server.mjs"
start "DDO Frontend" cmd /c "cd /d "%~dp0" && npm run dev"

echo Waiting for frontend server on http://localhost:5173 ...
for /l %%I in (1,1,60) do (
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "try { $response = Invoke-WebRequest -UseBasicParsing 'http://localhost:5173' -TimeoutSec 2; if ($response.StatusCode -ge 200) { exit 0 } else { exit 1 } } catch { exit 1 }"
  if not errorlevel 1 goto :open_browser
  timeout /t 1 /nobreak >nul
)

echo.
echo The app did not respond in time.
echo Please check the opened terminal windows for errors.
goto :end

:open_browser
echo Opening DDO in your browser...
start "" "http://localhost:5173"
goto :end

:install_failed
echo.
echo npm install failed. Please check your internet connection or Node.js setup.

:end
echo.
exit /b
