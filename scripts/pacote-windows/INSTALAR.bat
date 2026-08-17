@echo off
rem Instalacao do ComerciON num computador Windows, sem Docker.
rem Toda a logica esta no PowerShell ao lado: .bat nao tem como tratar erro
rem nem ler senha sem eco de um jeito que de para confiar.
title ComerciON - Instalacao
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sistema\scripts\instalar.ps1"
echo.
pause
