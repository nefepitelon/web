$ErrorActionPreference = 'Stop'

$workspacePath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$packagerPath = [System.IO.Path]::GetFullPath((Join-Path $workspacePath 'scripts\package-grid-ops-engine.mjs'))
$workspacePrefix = $workspacePath.TrimEnd('\') + '\'

if (-not $packagerPath.StartsWith($workspacePrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Packaging script escaped the workspace: $packagerPath"
}
if (-not (Test-Path -LiteralPath $packagerPath -PathType Leaf)) {
  throw "Grid engine packager is missing: $packagerPath"
}

& node $packagerPath
if ($LASTEXITCODE -ne 0) {
  throw "Grid engine packaging failed with exit code $LASTEXITCODE."
}
