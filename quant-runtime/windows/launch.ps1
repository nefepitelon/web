[CmdletBinding()]
param([switch]$InstallOnly, [switch]$NoBrowser, [string]$RootPath, [string]$PackageFile, [switch]$ForcePortableNode)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$quantSite = 'https://ai.welinkbtc.xyz'
$quantRoot = if ($RootPath) { [IO.Path]::GetFullPath($RootPath) } else { Join-Path $env:LOCALAPPDATA 'welinkBTC\Quant-Suite' }
$quantRoot = $quantRoot.TrimEnd('\')
function Assert-QuantChild([string]$Target) {
    $quantResolved = [IO.Path]::GetFullPath($Target)
    if (-not $quantResolved.StartsWith($quantRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw "Path outside installation root: $quantResolved" }
    return $quantResolved
}
function New-QuantDirectory([string]$Target) { $quantSafe = Assert-QuantChild $Target; New-Item -ItemType Directory -Path $quantSafe -Force | Out-Null; return $quantSafe }
function Get-QuantHash([string]$Target) { return (Get-FileHash -LiteralPath $Target -Algorithm SHA256).Hash.ToLowerInvariant() }
function Expand-QuantArchive([string]$Archive, [string]$Destination) {
    $quantSafe = Assert-QuantChild $Destination
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $quantZip = [IO.Compression.ZipFile]::OpenRead($Archive)
    try {
        foreach ($quantEntry in $quantZip.Entries) {
            if ([IO.Path]::IsPathRooted($quantEntry.FullName) -or $quantEntry.FullName -match '(^|[\\/])\.\.([\\/]|$)' -or $quantEntry.FullName.Contains(':')) { throw 'Unsafe archive entry rejected.' }
            $quantEntryTarget = [IO.Path]::GetFullPath((Join-Path $quantSafe $quantEntry.FullName))
            if (-not $quantEntryTarget.StartsWith($quantSafe.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Archive entry escapes the target directory.' }
        }
    } finally { $quantZip.Dispose() }
    Expand-Archive -LiteralPath $Archive -DestinationPath $quantSafe -Force
}
function Find-QuantNode {
    if (-not $ForcePortableNode) {
        $quantSystemNode = Get-Command node.exe -ErrorAction SilentlyContinue
        if ($quantSystemNode) {
            $quantVersion = & $quantSystemNode.Source --version
            if ($LASTEXITCODE -eq 0 -and $quantVersion -match '^v(\d+)\.' -and [int]$Matches[1] -ge 22) { return $quantSystemNode.Source }
        }
    }
    $quantArchitecture = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
    if ($quantArchitecture -notin @('AMD64', 'ARM64')) { throw 'A 64-bit Windows installation is required.' }
    $quantArch = if ($quantArchitecture -eq 'ARM64') { 'arm64' } else { 'x64' }
    $quantNodeVersion = 'v24.18.0'
    $quantNodeFile = "node-$quantNodeVersion-win-$quantArch.zip"
    $quantNodeRoot = Assert-QuantChild (Join-Path $quantRoot "tools\node-$quantNodeVersion-win-$quantArch")
    $quantExecutable = Join-Path $quantNodeRoot 'node.exe'
    if (Test-Path -LiteralPath $quantExecutable) { return $quantExecutable }
    Write-Host '[SETUP] Downloading the official portable Node.js runtime (no administrator required).'
    $quantDownload = New-QuantDirectory (Join-Path $quantRoot 'downloads')
    $quantNodeArchive = Join-Path $quantDownload $quantNodeFile
    $quantNodeBase = "https://nodejs.org/dist/$quantNodeVersion"
    $quantSums = (Invoke-WebRequest -UseBasicParsing -Uri "$quantNodeBase/SHASUMS256.txt" -TimeoutSec 60).Content
    $quantSumLine = ($quantSums -split "`n" | Where-Object { $_ -match "\s+$([regex]::Escape($quantNodeFile))\s*$" } | Select-Object -First 1)
    if (-not $quantSumLine) { throw 'Official Node.js checksum is missing.' }
    $quantExpectedHash = ($quantSumLine.Trim() -split '\s+')[0].ToLowerInvariant()
    Invoke-WebRequest -UseBasicParsing -Uri "$quantNodeBase/$quantNodeFile" -OutFile $quantNodeArchive -TimeoutSec 600
    if ((Get-QuantHash $quantNodeArchive) -ne $quantExpectedHash) { throw 'Node.js checksum mismatch. Installation refused.' }
    $quantTools = New-QuantDirectory (Join-Path $quantRoot 'tools')
    Expand-QuantArchive $quantNodeArchive $quantTools
    if (-not (Test-Path -LiteralPath $quantExecutable)) { throw 'The portable Node.js archive is incomplete.' }
    return $quantExecutable
}

New-Item -ItemType Directory -Path $quantRoot -Force | Out-Null
$quantState = New-QuantDirectory (Join-Path $quantRoot 'state')
# Pairing credentials and all trading profiles inherit a private Windows ACL.
if ($env:OS -eq 'Windows_NT') {
    $quantIdentity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    & icacls.exe $quantState '/inheritance:r' '/grant:r' "${quantIdentity}:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Unable to restrict access to the local credential directory.' }
}
$quantDownloads = New-QuantDirectory (Join-Path $quantRoot 'downloads')
Write-Host '[SETUP] Checking the current Quant Suite local engine package...'
if ($PackageFile) {
    $quantArchive = (Resolve-Path -LiteralPath $PackageFile).Path
    $quantBuild = (Get-QuantHash $quantArchive).Substring(0, 16)
} else {
    $quantManifest = Invoke-RestMethod -Uri "$quantSite/downloads/welinkbtc-quant-runtime-manifest.json" -TimeoutSec 60
    if ($quantManifest.schemaVersion -ne 1 -or $quantManifest.sha256 -notmatch '^[a-f0-9]{64}$' -or $quantManifest.buildId -notmatch '^[a-f0-9]{16}$') { throw 'Invalid package manifest.' }
    $quantArchive = Join-Path $quantDownloads "$($quantManifest.buildId).zip"
    Invoke-WebRequest -UseBasicParsing -Uri "$quantSite/downloads/welinkbtc-quant-runtime.zip" -OutFile $quantArchive -TimeoutSec 600
    if ((Get-QuantHash $quantArchive) -ne $quantManifest.sha256 -or (Get-Item -LiteralPath $quantArchive).Length -ne $quantManifest.bytes) { throw 'Engine package checksum mismatch. Please run again after the website finishes deploying.' }
    $quantBuild = $quantManifest.buildId
}
$quantVersionDirectory = New-QuantDirectory (Join-Path $quantRoot "versions\$quantBuild")
Expand-QuantArchive $quantArchive $quantVersionDirectory
$quantEngineDirectory = Assert-QuantChild (Join-Path $quantVersionDirectory 'quant-runtime')
foreach ($quantRequired in @('package.json', 'bin\local-console.mjs', 'bin\pull-worker.mjs', 'bin\install-engine.mjs', 'local-console\index.html')) {
    if (-not (Test-Path -LiteralPath (Join-Path $quantEngineDirectory $quantRequired))) { throw "Incomplete engine package: $quantRequired" }
}
$quantNode = Find-QuantNode
Write-Host "[READY] Engine build: $quantBuild"
Write-Host "[READY] Private data: $quantState"
Write-Host '[INFO] Docker Desktop with Linux containers is required for the six native engines.'
Write-Host '[INFO] The console checks Docker and installs only the engine you explicitly select.'
Write-Host '[INFO] No live strategy is started by this installer.'
if ($InstallOnly) { Write-Host '[PASS] Package installation and Node.js checks completed.'; exit 0 }
$env:QUANT_RUNTIME_ROOT = $quantState
$env:QUANT_APPLICATION_URL = $quantSite
$env:QUANT_OPEN_BROWSER = if ($NoBrowser) { 'false' } else { 'true' }
Write-Host ''
Write-Host 'Local console: http://127.0.0.1:8790'
Write-Host 'Keep this window open. Stopping the console disconnects cloud dispatch.'
Write-Host 'Use the engine stop controls to stop already-running native processes.'
Push-Location $quantEngineDirectory
try { & $quantNode 'bin/local-console.mjs'; $quantExit = $LASTEXITCODE } finally { Pop-Location }
if ($quantExit -ne 0) { throw "The local console stopped with exit code $quantExit." }
