@echo off
chcp 65001 >nul
title hezhen - start backend
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-backend.ps1"
echo.
pause
