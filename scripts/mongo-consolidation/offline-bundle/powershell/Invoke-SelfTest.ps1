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
  $selfTest = Resolve-BundlePath 'self-test\run-self-test.cjs'
  $root = Split-Path -Parent $PSScriptRoot
  if (-not (Test-Path -LiteralPath $node -PathType Leaf)) { throw 'Bundled node.exe is missing.' }
  if (-not (Test-Path -LiteralPath $selfTest -PathType Leaf)) { throw 'Self-test executable is missing.' }
  & $node $selfTest --bundle-root $root
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) { exit $exitCode }
  Write-Host 'Offline self-test passed.'
  exit 0
} catch {
  [Console]::Error.WriteLine('Offline self-test failed.')
  exit 1
}
