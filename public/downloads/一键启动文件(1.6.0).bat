@echo off
setlocal EnableExtensions
set "HEDGE_REQUESTED_RELEASE=1.6.0"
title WeLinkBTC Hedge Ops 1.6.0 - Local Engine
set "HEDGE_DOWNLOAD_BASE=https://www.welinkbtc-onchainmain.xyz/downloads"
set "HEDGE_INSTALL_DIR=%LOCALAPPDATA%\welinkBTC\Hedge-Ops"
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $h=Invoke-RestMethod -Uri 'http://127.0.0.1:8011/health' -TimeoutSec 3; if($h.ok -eq $true -and $h.service -eq 'welinkbtc-hedge-local'){Write-Host '[INFO] Local console already running. Reusing http://127.0.0.1:8011/'; Start-Process 'http://127.0.0.1:8011/'; exit 0} } catch {}; exit 1"
if not errorlevel 1 exit /b 0
echo [SETUP] Downloading the latest integrated Hedge Ops engine...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $stage=Join-Path $env:TEMP ('welink-hedge-'+[guid]::NewGuid().ToString('N')); New-Item -ItemType Directory -Path $stage | Out-Null; $archive=Join-Path $stage 'engine.zip'; $manifest=Invoke-RestMethod -Uri ($env:HEDGE_DOWNLOAD_BASE+'/hedge-ops-manifest.json'); Invoke-WebRequest -UseBasicParsing -Uri ($env:HEDGE_DOWNLOAD_BASE+'/hedge-ops-engine.zip') -OutFile $archive; if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLower() -ne $manifest.sha256) { throw 'Package verification failed.' }; $unpack=Join-Path $stage 'engine'; Expand-Archive -LiteralPath $archive -DestinationPath $unpack; foreach($name in @('local.py','local.html','bootstrap.ps1','local-requirements.txt','engines')) { if (-not (Test-Path -LiteralPath (Join-Path $unpack $name))) { throw 'Incomplete engine package.' } }; New-Item -ItemType Directory -Path $env:HEDGE_INSTALL_DIR -Force | Out-Null; Get-ChildItem -LiteralPath $unpack -Force | Copy-Item -Destination $env:HEDGE_INSTALL_DIR -Recurse -Force"
if not errorlevel 1 goto start_engine
if exist "%HEDGE_INSTALL_DIR%\local.py" echo [WARN] Download failed. Starting the installed version.
if exist "%HEDGE_INSTALL_DIR%\local.py" goto start_engine
echo [ERROR] Download failed. Check your Internet connection and retry.
pause
exit /b 1
:start_engine
powershell -NoProfile -ExecutionPolicy Bypass -File "%HEDGE_INSTALL_DIR%\bootstrap.ps1"
if not errorlevel 1 exit /b 0
echo [ERROR] Startup failed. Review the message above, then retry.
pause
exit /b 1
