[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$')][string]$CollectorHostAlias,
  [Parameter(Mandatory = $true)][string]$OutputDirectory,
  [string[]]$RuntimeRoots = @(),
  [string[]]$BackupRoots = @()
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Resolve-BundlePath {
  param([Parameter(Mandatory = $true)][string]$RelativePath)
  return [System.IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $PSScriptRoot) $RelativePath))
}
function Convert-SecureStringToPlainText {
  param([Parameter(Mandatory = $true)][System.Security.SecureString]$Value)
  $ptr = [IntPtr]::Zero
  try {
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  } finally {
    if ($ptr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
  }
}

$plainMongoUri = $null
$secureMongoUri = $null
$precollectedMongo = $null
try {
  $node = Resolve-BundlePath 'runtime\node-win-x64\node.exe'
  $reader = Resolve-BundlePath 'mongo-reader\collect-mongo-evidence.cjs'
  $collector = Resolve-BundlePath 'collector\collect-windows-evidence.ps1'
  if (-not (Test-Path -LiteralPath $node -PathType Leaf)) { throw 'Bundled node.exe is missing.' }
  if (-not (Test-Path -LiteralPath $reader -PathType Leaf)) { throw 'Mongo reader is missing.' }
  if (Test-Path -LiteralPath $OutputDirectory) { throw 'Output directory already exists; use a new run directory.' }
  New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
  $precollectedMongo = Join-Path $OutputDirectory 'mongo.json'
  if ([string]::IsNullOrEmpty($env:MONGODB_URI)) {
    $secureMongoUri = Read-Host -Prompt 'Mongo URI (input is hidden)' -AsSecureString
    $plainMongoUri = Convert-SecureStringToPlainText $secureMongoUri
    $env:MONGODB_URI = $plainMongoUri
  }
  & $node $reader --output $precollectedMongo
  $readerExitCode = $LASTEXITCODE
  if ($readerExitCode -ne 0) { exit $readerExitCode }
  $env:MONGODB_URI = $null
  $plainMongoUri = $null
  & $collector -OutputDirectory $OutputDirectory -CollectorHostAlias $CollectorHostAlias -RuntimeSearchRoots $RuntimeRoots -BackupSearchRoots $BackupRoots -PrecollectedMongoEvidencePath $precollectedMongo
  $collectorExitCode = $LASTEXITCODE
  if ($collectorExitCode -ne 0) { exit $collectorExitCode }
  Write-Host 'Read-only evidence collection completed.'
  exit 0
} catch {
  [Console]::Error.WriteLine('Read-only evidence collection failed.')
  exit 30
} finally {
  $env:MONGODB_URI = $null
  $plainMongoUri = $null
  $secureMongoUri = $null
  $precollectedMongo = $null
  Remove-Variable -Name plainMongoUri, secureMongoUri, precollectedMongo -ErrorAction SilentlyContinue
}
