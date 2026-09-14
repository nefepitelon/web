param([string]$BaseUrl = 'https://ai.welinkbtc.xyz')
$ErrorActionPreference = 'Stop'
$quantRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$quantArchivePath = Join-Path $quantRoot 'artifacts\production-quant-runtime.zip'
$quantManifest = Invoke-RestMethod -Uri "$BaseUrl/downloads/welinkbtc-quant-runtime-manifest.json"
Invoke-WebRequest -Uri "$BaseUrl/downloads/welinkbtc-quant-runtime.zip" -OutFile $quantArchivePath
$quantZipHash = (Get-FileHash -LiteralPath $quantArchivePath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($quantZipHash -ne $quantManifest.sha256 -or (Get-Item -LiteralPath $quantArchivePath).Length -ne $quantManifest.bytes) { throw 'Published package does not match its manifest.' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$quantArchive = [IO.Compression.ZipFile]::OpenRead($quantArchivePath)
$quantVerified = 0
try {
  foreach ($quantEntry in $quantArchive.Entries) {
    if ($quantEntry.FullName.EndsWith('/')) { continue }
    if (-not $quantEntry.FullName.StartsWith('quant-runtime/') -or $quantEntry.FullName.Contains('..')) { throw 'Unexpected archive path.' }
    $quantStream = $quantEntry.Open()
    if ($quantEntry.FullName -eq 'quant-runtime/build.json') {
      $quantReader = [IO.StreamReader]::new($quantStream)
      try { $quantBuild = $quantReader.ReadToEnd() | ConvertFrom-Json } finally { $quantReader.Dispose() }
      if ($quantBuild.buildId -ne $quantManifest.buildId -or $quantBuild.version -ne $quantManifest.version) { throw 'Embedded build metadata mismatch.' }
      continue
    }
    $quantLocalPath = Join-Path $quantRoot $quantEntry.FullName
    if (-not (Test-Path -LiteralPath $quantLocalPath -PathType Leaf)) { $quantStream.Dispose(); throw "Missing local source: $($quantEntry.FullName)" }
    $quantHasher = [Security.Cryptography.SHA256]::Create()
    try { $quantRemoteHash = [BitConverter]::ToString($quantHasher.ComputeHash($quantStream)).Replace('-', '') }
    finally { $quantStream.Dispose(); $quantHasher.Dispose() }
    if ($quantRemoteHash -ne (Get-FileHash -LiteralPath $quantLocalPath -Algorithm SHA256).Hash) { throw "Source mismatch: $($quantEntry.FullName)" }
    $quantVerified++
  }
} finally { $quantArchive.Dispose() }
foreach ($quantName in @('quant-suite-launch.ps1', '启动量化交易集.bat')) {
  $quantDownloaded = Join-Path $quantRoot ('artifacts\production-' + $quantName)
  Invoke-WebRequest -Uri ($BaseUrl + '/downloads/' + [Uri]::EscapeDataString($quantName)) -OutFile $quantDownloaded
  $quantExpected = Join-Path $quantRoot ('public\downloads\' + $quantName)
  if ((Get-FileHash -LiteralPath $quantDownloaded -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $quantExpected -Algorithm SHA256).Hash) { throw "Launcher mismatch: $quantName" }
}
if ($quantVerified -lt 55) { throw 'Incomplete source archive.' }
@{ok=$true; buildId=$quantManifest.buildId; version=$quantManifest.version; sourceFilesVerified=$quantVerified; launcherFilesVerified=2; archiveBytes=$quantManifest.bytes} | ConvertTo-Json -Compress
