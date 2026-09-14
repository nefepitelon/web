@echo off
setlocal EnableExtensions
title WELINKBTC Quant Suite - Local Native Engines
echo [SETUP] Preparing the Quant Suite local launcher...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $quantLauncherRoot=Join-Path $env:LOCALAPPDATA 'welinkBTC\Quant-Suite'; New-Item -ItemType Directory -Path $quantLauncherRoot -Force | Out-Null; $quantLauncherPath=Join-Path $quantLauncherRoot 'launch.ps1'; Invoke-WebRequest -UseBasicParsing -Uri 'https://ai.welinkbtc.xyz/downloads/quant-suite-launch.ps1' -OutFile $quantLauncherPath; & $quantLauncherPath"
if errorlevel 1 (
  echo.
  echo [ERROR] Setup or startup failed. Review the message above and run this file again.
  pause
  exit /b 1
)
echo.
echo The local Quant Suite console has stopped.
pause
