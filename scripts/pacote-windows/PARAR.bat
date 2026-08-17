@echo off
title ComerciON - Desligar
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sistema\scripts\parar.ps1"
echo.
pause
