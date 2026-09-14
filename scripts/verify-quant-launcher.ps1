param([string]$PackageFile = (Join-Path $PSScriptRoot '..\public\downloads\welinkbtc-quant-runtime.zip'))
$ErrorActionPreference = 'Stop'
$quantWorkspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$quantArtifacts = Join-Path $quantWorkspace 'artifacts\quant-launcher-verification'
New-Item -ItemType Directory -Path $quantArtifacts -Force | Out-Null
$quantInstall = Join-Path $quantArtifacts 'installation'
$quantLauncher = Join-Path $quantWorkspace 'public\downloads\quant-suite-launch.ps1'
$quantSentinel = Join-Path $quantInstall 'state\preserved-fixture.txt'
New-Item -ItemType Directory -Path (Split-Path $quantSentinel) -Force | Out-Null
[IO.File]::WriteAllText($quantSentinel, 'local-data-must-survive-update')
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $quantLauncher -InstallOnly -NoBrowser -RootPath $quantInstall -PackageFile $PackageFile
if ($LASTEXITCODE -ne 0) { throw 'Windows PowerShell 5.1 installation failed.' }
if ([IO.File]::ReadAllText($quantSentinel) -ne 'local-data-must-survive-update') { throw 'Installation changed private state.' }

# An adversarial archive is local test data. It must be refused before extraction.
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$quantBadZip = Join-Path $quantArtifacts ('unsafe-' + [Guid]::NewGuid().ToString('N') + '.zip')
$quantZip = [IO.Compression.ZipFile]::Open($quantBadZip, [IO.Compression.ZipArchiveMode]::Create)
try {
  $quantEntry = $quantZip.CreateEntry('../escaped-fixture.txt')
  $quantWriter = [IO.StreamWriter]::new($quantEntry.Open())
  try { $quantWriter.Write('must-not-extract') } finally { $quantWriter.Dispose() }
} finally { $quantZip.Dispose() }
$quantPriorPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$quantBadResult = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $quantLauncher -InstallOnly -NoBrowser -RootPath $quantInstall -PackageFile $quantBadZip 2>&1
$quantBadExit = $LASTEXITCODE
$ErrorActionPreference = $quantPriorPreference
if ($quantBadExit -eq 0 -or ($quantBadResult -join '') -notmatch 'Unsafe archive entry rejected') { throw 'Unsafe archive was not rejected.' }
if ([IO.File]::ReadAllText($quantSentinel) -ne 'local-data-must-survive-update') { throw 'Rejected update changed private state.' }
$quantAcl = Get-Acl -LiteralPath (Join-Path $quantInstall 'state')
if (-not $quantAcl.AreAccessRulesProtected) { throw 'Private state ACL still inherits access.' }
@{ok=$true; windowsPowerShell='5.1'; installOnly=$true; statePreserved=$true; traversalRejected=$true; privateAcl=$true; nativeEnginesStarted=$false} | ConvertTo-Json -Compress
