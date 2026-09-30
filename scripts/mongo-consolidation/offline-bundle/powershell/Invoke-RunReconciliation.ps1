[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$InputDirectory,
  [Parameter(Mandatory = $true)][string]$OutputDirectory
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Resolve-BundlePath {
  param([Parameter(Mandatory = $true)][string]$RelativePath)
  return [System.IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $PSScriptRoot) $RelativePath))
}

try {
  $node = Resolve-BundlePath 'runtime\node-win-x64\node.exe'
  $reconciliation = Resolve-BundlePath 'reconciliation\reconcile-evidence-snapshot.cjs'
  if (-not (Test-Path -LiteralPath $InputDirectory -PathType Container)) { throw 'Input directory does not exist.' }
  if (-not (Test-Path -LiteralPath $node -PathType Leaf)) { throw 'Bundled node.exe is missing.' }
  & $node $reconciliation --input $InputDirectory --output $OutputDirectory --format all
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) { exit $exitCode }
  Write-Host 'Reconciliation completed with no findings.'
  exit 0
} catch {
  [Console]::Error.WriteLine('Reconciliation failed.')
  exit 30
}
