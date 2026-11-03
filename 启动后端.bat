@echo off
chcp 65001 >nul
title ¾Ê - /¨ï
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-backend.ps1" 
echo.
pause
