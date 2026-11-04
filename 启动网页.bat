@echo off
cd /d "%~dp0"
echo.
echo   hezhen web - starting on port 5178
echo   (close the new window to stop)
echo.
start "hezhen-h5" cmd /c "node serve-h5.js 5178"
timeout /t 3 >nul
start "" http://localhost:5178
pause