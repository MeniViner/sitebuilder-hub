[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Resolve-BundlePath {
  param([Parameter(Mandatory = $true)][string]$RelativePath)
  return [System.IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $PSScriptRoot) $RelativePath))
}

try {
  $node = Resolve-BundlePath 'runtime\node-win-x64\node.exe'
  $verifier = Resolve-BundlePath 'validator\verify-bundle.cjs'
  $root = Split-Path -Parent $PSScriptRoot
  if (-not (Test-Path -LiteralPath $node -PathType Leaf)) { throw 'Bundled node.exe is missing.' }
  if (-not (Test-Path -LiteralPath $verifier -PathType Leaf)) { throw 'Bundle verifier is missing.' }
  & $node $verifier verify --root $root
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) { exit $exitCode }
  Write-Host 'Bundle verification passed.'
  exit 0
} catch {
  [Console]::Error.WriteLine('Bundle verification failed.')
  exit 1
}
