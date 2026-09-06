@echo off
setlocal EnableExtensions
title AI Grid Trading Ops - Local Engine

set "DOWNLOAD_URL=https://www.welinkbtc-onchainmain.xyz/downloads/ai-grid-ops-engine.zip"
set "ENGINE_DIR="

if exist "%~dp0grid-ops\package.json" set "ENGINE_DIR=%~dp0grid-ops"
if defined ENGINE_DIR goto engine_ready

set "ENGINE_DIR=%LOCALAPPDATA%\welinkBTC\AI-Grid-Ops"
set "ENGINE_INSTALLED=0"
if exist "%LOCALAPPDATA%\welinkBTC\AI-Grid-Ops\package.json" set "ENGINE_INSTALLED=1"

echo [SETUP] Checking the latest local engine from welinkBTC...
if not exist "%LOCALAPPDATA%\welinkBTC\AI-Grid-Ops" mkdir "%LOCALAPPDATA%\welinkBTC\AI-Grid-Ops"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; $archive=Join-Path $env:TEMP 'welinkbtc-ai-grid-ops-engine.zip'; $stage=Join-Path $env:TEMP 'welinkbtc-ai-grid-ops-engine-stage'; $target=Join-Path $env:LOCALAPPDATA 'welinkBTC\AI-Grid-Ops'; try { if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }; Invoke-WebRequest -UseBasicParsing -Uri '%DOWNLOAD_URL%' -OutFile $archive; Expand-Archive -LiteralPath $archive -DestinationPath $stage -Force; $templateOk=(Test-Path -LiteralPath (Join-Path $stage '.env.example')) -or (Test-Path -LiteralPath (Join-Path $stage 'env.example')); if (-not (Test-Path -LiteralPath (Join-Path $stage 'package.json')) -or -not (Test-Path -LiteralPath (Join-Path $stage 'scripts\windows-launcher.ps1')) -or -not $templateOk) { throw 'Downloaded engine package is incomplete.' }; New-Item -ItemType Directory -Path $target -Force | Out-Null; Get-ChildItem -LiteralPath $stage -Force | Copy-Item -Destination $target -Recurse -Force } finally { Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue; Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue }"
if not errorlevel 1 goto engine_ready
if "%ENGINE_INSTALLED%"=="1" echo [WARN] Update check failed. Starting the installed local engine.
if "%ENGINE_INSTALLED%"=="1" goto engine_ready
goto download_failed

:engine_ready
if not exist "%ENGINE_DIR%\package.json" goto download_failed
if not exist "%ENGINE_DIR%\.env" if exist "%ENGINE_DIR%\.env.example" copy /Y "%ENGINE_DIR%\.env.example" "%ENGINE_DIR%\.env" >nul
if not exist "%ENGINE_DIR%\.env" if exist "%ENGINE_DIR%\env.example" copy /Y "%ENGINE_DIR%\env.example" "%ENGINE_DIR%\.env" >nul
if not exist "%ENGINE_DIR%\.env" goto install_failed

if exist "%ENGINE_DIR%\scripts\windows-launcher.ps1" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%ENGINE_DIR%\scripts\windows-launcher.ps1"
  if errorlevel 1 goto install_failed
  exit /b 0
)

echo [SETUP] Checking local engine components...
call npm install --prefix "%ENGINE_DIR%" --omit=dev --no-audit --no-fund
if errorlevel 1 goto install_failed

echo [SETUP] Preparing local network diagnostics...
call npm --prefix "%ENGINE_DIR%" run preflight

echo.
echo ====================================================
echo   Local control console is starting.
echo   Console: http://127.0.0.1:8080
echo   Keep this window open. Closing it stops the engine.
echo   Return to the AI Grid Trading Ops web page.
echo   Network warnings do not block IP configuration.
echo ====================================================
echo.

call npm --prefix "%ENGINE_DIR%" start

echo.
echo The local engine has stopped.
pause
exit /b 0

:download_failed
echo.
echo [ERROR] The local engine download failed.
echo Check your internet connection and run this file again.
pause
exit /b 1

:install_failed
echo.
echo [ERROR] Engine component installation failed.
echo Check your internet connection and Node.js version, then try again.
pause
exit /b 1

