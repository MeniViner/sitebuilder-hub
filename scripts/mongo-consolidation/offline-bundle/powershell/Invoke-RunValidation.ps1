[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$InputDirectory
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Resolve-BundlePath {
  param([Parameter(Mandatory = $true)][string]$RelativePath)
  return [System.IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $PSScriptRoot) $RelativePath))
}

try {
  $node = Resolve-BundlePath 'runtime\node-win-x64\node.exe'
  $validator = Resolve-BundlePath 'validator\validate-windows-evidence.cjs'
  $collector = Resolve-BundlePath 'collector\collect-windows-evidence.ps1'
  if (-not (Test-Path -LiteralPath $InputDirectory -PathType Container)) { throw 'Input directory does not exist.' }
  if (-not (Test-Path -LiteralPath $node -PathType Leaf)) { throw 'Bundled node.exe is missing.' }
  & $node $validator --input $InputDirectory --script $collector
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) { exit $exitCode }
  Write-Host 'Evidence validation passed.'
  exit 0
} catch {
  [Console]::Error.WriteLine('Evidence validation failed.')
  exit 30
}
