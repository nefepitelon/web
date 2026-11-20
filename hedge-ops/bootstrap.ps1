$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
function Open-ExistingConsole {
  try {
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8011/health' -TimeoutSec 3
    if ($health.ok -eq $true -and $health.service -eq 'welinkbtc-hedge-local') {
      Write-Host '[INFO] Local console is already running. Reusing http://127.0.0.1:8011/'
      if ($env:HEDGE_OPS_NO_BROWSER -ne '1') { Start-Process 'http://127.0.0.1:8011/' }
      return $true
    }
  } catch { }
  return $false
}
if (Open-ExistingConsole) { exit 0 }
$launchMutex = New-Object System.Threading.Mutex($false, 'Local\WeLinkBTC-Hedge-Ops-Startup')
if (-not $launchMutex.WaitOne(0)) {
  Write-Host '[INFO] Another launcher is preparing the local console. Please wait for it to finish.'
  $launchMutex.Dispose()
  exit 0
}
try {
if (Open-ExistingConsole) { exit 0 }
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$engineRoot = $PSScriptRoot
$venvPython = Join-Path $engineRoot '.venv\Scripts\python.exe'
$pythonCommand = $null
if (-not (Test-Path -LiteralPath $venvPython)) {
  foreach ($candidate in @('py', 'python')) {
    try {
      $executable = (Get-Command $candidate -ErrorAction Stop).Source
      $versionArgs = if ($candidate -eq 'py') { @('-3.12') } else { @() }
      & $executable @versionArgs -c 'import sys; sys.exit(0 if (3,11) <= sys.version_info[:2] <= (3,12) else 1)' 2>$null
      if ($LASTEXITCODE -eq 0) { $pythonCommand = $executable; break }
    } catch { }
  }
  if (-not $pythonCommand) {
    $pythonCommand = Join-Path $env:LOCALAPPDATA 'Programs\Python\Python311\python.exe'
    $versionArgs = @()
    if (-not (Test-Path -LiteralPath $pythonCommand)) {
      Write-Host '[SETUP] Downloading Python 3.11 for the current user...'
      $installer = Join-Path $env:TEMP ('welink-hedge-python-' + [guid]::NewGuid().ToString('N') + '.exe')
      Invoke-WebRequest -UseBasicParsing -Uri 'https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe' -OutFile $installer -TimeoutSec 300
      $signature = Get-AuthenticodeSignature -LiteralPath $installer
      if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Python Software Foundation') { throw 'Python installer signature check failed.' }
      $process = Start-Process -FilePath $installer -WindowStyle Hidden -Wait -PassThru -ArgumentList '/quiet InstallAllUsers=0 PrependPath=0 Include_launcher=0 Include_test=0 Shortcuts=0 AssociateFiles=0'
      if ($process.ExitCode -notin @(0, 3010) -or -not (Test-Path -LiteralPath $pythonCommand)) { throw 'Python installation failed.' }
    }
  }
  Write-Host '[SETUP] Creating a private Python environment...'
  & $pythonCommand @versionArgs -m venv (Join-Path $engineRoot '.venv')
  if ($LASTEXITCODE -ne 0) { throw 'Unable to create Python environment.' }
}
Write-Host '[SETUP] Checking trading engine dependencies...'
& $venvPython -m pip install --disable-pip-version-check -r (Join-Path $engineRoot 'local-requirements.txt') -c (Join-Path $engineRoot 'constraints.txt')
if ($LASTEXITCODE -ne 0) {
  Write-Host '[SETUP] Retrying dependency installation using the Tsinghua mirror...'
  & $venvPython -m pip install --disable-pip-version-check -r (Join-Path $engineRoot 'local-requirements.txt') -c (Join-Path $engineRoot 'constraints.txt') -i 'https://pypi.tuna.tsinghua.edu.cn/simple'
  if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Check the network and retry this launcher.' }
}
Write-Host '[START] Opening local console: http://127.0.0.1:8011/'
Write-Host '[INFO] Keep this window open. Environment and IP settings are saved in the data directory.'
$env:PYTHONUTF8 = '1'
& $venvPython (Join-Path $engineRoot 'local.py')
if ($LASTEXITCODE -ne 0) {
  # A maintenance update replaces only the UI manager, preserving all trading
  # children. Give its healthy replacement time to start before reporting a
  # failed launch. Never restart a trading engine here.
  Write-Host '[INFO] Checking whether the local manager was updated...'
  $recoveryDeadline = [DateTime]::UtcNow.AddSeconds(15)
  do {
    if (Open-ExistingConsole) { exit 0 }
    Start-Sleep -Milliseconds 500
  } while ([DateTime]::UtcNow -lt $recoveryDeadline)
  throw 'The local management service is unavailable. Retry this launcher; existing trading engines have not been stopped.'
}
} finally {
  $launchMutex.ReleaseMutex()
  $launchMutex.Dispose()
}
