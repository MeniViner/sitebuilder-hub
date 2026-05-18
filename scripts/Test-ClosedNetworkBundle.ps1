[CmdletBinding()]
param(
    [string]$ProjectRoot,
    [string]$OutputDirectory,
    [switch]$CreateArchive,
    [ValidateSet("NoCompression", "Fastest", "Optimal")]
    [string]$ArchiveCompressionLevel = "NoCompression",
    [switch]$FailOnWarning,
    [version]$MinimumNodeVersion = "20.0.0",
    [version]$MinimumNpmVersion = "10.0.0",
    [version]$MinimumMongoVersion = "7.0.0"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-DefaultProjectRoot {
    $scriptDirectory = Split-Path -Parent $PSCommandPath
    $hubRoot = Split-Path -Parent $scriptDirectory
    $candidate = Split-Path -Parent $hubRoot

    if (Test-Path -LiteralPath (Join-Path $candidate "package.json")) {
        return (Resolve-Path -LiteralPath $candidate).Path
    }

    return (Resolve-Path -LiteralPath $hubRoot).Path
}

function New-Result {
    param(
        [ValidateSet("PASS", "WARN", "FAIL", "INFO")]
        [string]$Status,
        [string]$Check,
        [string]$Detail
    )

    [PSCustomObject]@{
        Status = $Status
        Check = $Check
        Detail = $Detail
    }
}

function ConvertTo-SemVer {
    param([string]$Text)

    if ($Text -match "(\d+)(?:\.(\d+))?(?:\.(\d+))?") {
        $major = [int]$Matches[1]
        $minor = if ($Matches[2]) { [int]$Matches[2] } else { 0 }
        $patch = if ($Matches[3]) { [int]$Matches[3] } else { 0 }
        return [version]"$major.$minor.$patch"
    }

    return $null
}

function Get-PackageJson {
    param([string]$PackageRoot)

    $packagePath = Join-Path $PackageRoot "package.json"
    if (-not (Test-Path -LiteralPath $packagePath)) {
        return $null
    }

    return Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
}

function Get-TopLevelJsonString {
    param(
        [string]$Path,
        [string]$PropertyName
    )

    $content = Get-Content -LiteralPath $Path -Raw
    $pattern = '(?m)^\s*"' + [regex]::Escape($PropertyName) + '"\s*:\s*"([^"]+)"'
    if ($content -match $pattern) {
        return $Matches[1]
    }

    return $null
}

function Get-DirectorySize {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        return 0
    }

    $size = (Get-ChildItem -LiteralPath $Path -Recurse -Force -File -ErrorAction SilentlyContinue |
        Measure-Object -Property Length -Sum).Sum

    if ($null -eq $size) {
        return 0
    }

    return [int64]$size
}

function Format-Bytes {
    param([int64]$Bytes)

    if ($Bytes -ge 1GB) {
        return "{0:N2} GB" -f ($Bytes / 1GB)
    }
    if ($Bytes -ge 1MB) {
        return "{0:N2} MB" -f ($Bytes / 1MB)
    }
    if ($Bytes -ge 1KB) {
        return "{0:N2} KB" -f ($Bytes / 1KB)
    }
    return "$Bytes B"
}

function Get-RelativeArchivePath {
    param(
        [string]$BasePath,
        [string]$TargetPath
    )

    $baseFullPath = [System.IO.Path]::GetFullPath($BasePath)
    if (-not $baseFullPath.EndsWith([System.IO.Path]::DirectorySeparatorChar)) {
        $baseFullPath = $baseFullPath + [System.IO.Path]::DirectorySeparatorChar
    }

    $targetFullPath = [System.IO.Path]::GetFullPath($TargetPath)
    $baseUri = [Uri]$baseFullPath
    $targetUri = [Uri]$targetFullPath
    return [Uri]::UnescapeDataString($baseUri.MakeRelativeUri($targetUri).ToString()).Replace("/", "\")
}

function Test-ArchiveExclusion {
    param(
        [string]$RelativePath,
        [string]$FileName
    )

    $parts = $RelativePath -split "[\\/]"
    if ($parts -contains ".git") {
        return $true
    }

    if ($parts.Length -ge 2 -and $parts[0] -eq "sitebuilder-hub" -and $parts[1] -eq "artifacts") {
        return $true
    }

    if ($FileName -match "^\.env($|\.(?!example$).+)") {
        return $true
    }

    if ($FileName -match "\.(7z|zip|tar|tgz|gz|rar)$") {
        return $true
    }

    if ($FileName -match "\.(log|tmp)$") {
        return $true
    }

    return $false
}

function New-ClosedNetworkArchive {
    param(
        [string]$RootPath,
        [string]$DestinationDirectory,
        [array]$Results,
        [string]$CompressionLevel
    )

    if (-not (Test-Path -LiteralPath $DestinationDirectory)) {
        New-Item -ItemType Directory -Path $DestinationDirectory | Out-Null
    }

    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $archivePath = Join-Path $DestinationDirectory "SiteBuilder-closed-network-$timestamp.zip"
    $manifestPath = Join-Path $DestinationDirectory "SiteBuilder-closed-network-$timestamp.manifest.txt"

    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::Open($archivePath, [System.IO.Compression.ZipArchiveMode]::Create)

    try {
        $files = Get-ChildItem -LiteralPath $RootPath -Recurse -Force -File | Where-Object {
            $relativePath = Get-RelativeArchivePath -BasePath $RootPath -TargetPath $_.FullName
            -not (Test-ArchiveExclusion -RelativePath $relativePath -FileName $_.Name)
        }

        foreach ($file in $files) {
            $entryName = (Get-RelativeArchivePath -BasePath $RootPath -TargetPath $file.FullName).Replace("\", "/")
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                $zip,
                $file.FullName,
                $entryName,
                [System.IO.Compression.CompressionLevel]::$CompressionLevel
            ) | Out-Null
        }
    }
    finally {
        $zip.Dispose()
    }

    $manifest = @()
    $manifest += "Site Builder closed-network bundle"
    $manifest += "Created: $(Get-Date -Format s)"
    $manifest += "Source: $RootPath"
    $manifest += "Archive: $archivePath"
    $manifest += "Compression: $CompressionLevel"
    $manifest += ""
    $manifest += "Included: source, lockfiles, dist outputs, node_modules, env examples, docs, scripts."
    $manifest += "Excluded: .git folders, .env secrets, existing archives, logs, temp files, and sitebuilder-hub/artifacts."
    $manifest += ""
    $manifest += "Readiness results:"
    foreach ($result in $Results) {
        $manifest += ("[{0}] {1} - {2}" -f $result.Status, $result.Check, $result.Detail)
    }

    Set-Content -LiteralPath $manifestPath -Value $manifest -Encoding UTF8

    return [PSCustomObject]@{
        ArchivePath = $archivePath
        ManifestPath = $manifestPath
        ArchiveSize = (Get-Item -LiteralPath $archivePath).Length
    }
}

$rootPath = if ($ProjectRoot) {
    (Resolve-Path -LiteralPath $ProjectRoot).Path
}
else {
    Resolve-DefaultProjectRoot
}

$defaultOutput = Join-Path $rootPath "sitebuilder-hub\artifacts\closed-network"
$outputPath = if ($OutputDirectory) {
    $OutputDirectory
}
else {
    $defaultOutput
}

$results = New-Object System.Collections.Generic.List[object]
$results.Add((New-Result -Status "INFO" -Check "Project root" -Detail $rootPath))

$knownPackageRoots = @(
    ".",
    "sitebuilder-hub",
    "sitebuilder-hub\client",
    "sitebuilder-hub\server",
    "newAlphaAIBackend\newAlphaAIBackend"
)

foreach ($relativeRoot in $knownPackageRoots) {
    $packageRoot = Join-Path $rootPath $relativeRoot
    if (-not (Test-Path -LiteralPath (Join-Path $packageRoot "package.json"))) {
        continue
    }

    $package = Get-PackageJson -PackageRoot $packageRoot
    $displayRoot = if ($relativeRoot -eq ".") { "." } else { $relativeRoot }
    $lockPath = Join-Path $packageRoot "package-lock.json"
    $modulesPath = Join-Path $packageRoot "node_modules"

    if (Test-Path -LiteralPath $lockPath) {
        $lockName = Get-TopLevelJsonString -Path $lockPath -PropertyName "name"
        if (-not $lockName) {
            $lockName = "(no lock name)"
        }
        $detail = "$displayRoot has package-lock.json"
        if ($package.name -and $lockName -and $lockName -ne "(no lock name)" -and $package.name -ne $lockName) {
            $results.Add((New-Result -Status "WARN" -Check "Lockfile: $displayRoot" -Detail "$detail, but package name '$($package.name)' differs from lock name '$lockName'."))
        }
        else {
            $results.Add((New-Result -Status "PASS" -Check "Lockfile: $displayRoot" -Detail $detail))
        }
    }
    else {
        $results.Add((New-Result -Status "FAIL" -Check "Lockfile: $displayRoot" -Detail "$displayRoot is missing package-lock.json. Run npm install/npm ci on the connected build machine before packaging."))
    }

    if (Test-Path -LiteralPath $modulesPath) {
        $moduleSize = Format-Bytes -Bytes (Get-DirectorySize -Path $modulesPath)
        $results.Add((New-Result -Status "PASS" -Check "Dependencies: $displayRoot" -Detail "$displayRoot has node_modules ($moduleSize)."))
    }
    else {
        $results.Add((New-Result -Status "FAIL" -Check "Dependencies: $displayRoot" -Detail "$displayRoot is missing node_modules. Closed networks need vendored dependencies or an internal npm mirror."))
    }
}

$distChecks = @(
    @{ Label = "main app"; Path = "dist" },
    @{ Label = "hub client"; Path = "sitebuilder-hub\client\dist" },
    @{ Label = "hub server"; Path = "sitebuilder-hub\server\dist" }
)

foreach ($distCheck in $distChecks) {
    $distPath = Join-Path $rootPath $distCheck.Path
    if (Test-Path -LiteralPath $distPath) {
        $distSize = Format-Bytes -Bytes (Get-DirectorySize -Path $distPath)
        $results.Add((New-Result -Status "PASS" -Check "Build output: $($distCheck.Label)" -Detail "$($distCheck.Path) exists ($distSize)."))
    }
    else {
        $results.Add((New-Result -Status "FAIL" -Check "Build output: $($distCheck.Label)" -Detail "$($distCheck.Path) is missing. Run the relevant npm build before packaging."))
    }
}

$envExamples = @(
    ".env.example",
    "sitebuilder-hub\.env.example",
    "sitebuilder-hub\client\.env.example",
    "sitebuilder-hub\server\.env.example",
    "newAlphaAIBackend\newAlphaAIBackend\.env.example"
)

foreach ($relativeEnv in $envExamples) {
    $envPath = Join-Path $rootPath $relativeEnv
    if (Test-Path -LiteralPath $envPath) {
        $results.Add((New-Result -Status "PASS" -Check "Env example" -Detail "$relativeEnv exists."))
    }
    else {
        $results.Add((New-Result -Status "WARN" -Check "Env example" -Detail "$relativeEnv is missing. Document or add a sanitized example before handoff if this component needs environment variables."))
    }
}

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCommand) {
    $nodeOutput = (& $nodeCommand.Source --version) 2>&1 | Out-String
    $nodeVersion = ConvertTo-SemVer -Text $nodeOutput
    if ($nodeVersion -and $nodeVersion -ge $MinimumNodeVersion) {
        $results.Add((New-Result -Status "PASS" -Check "Node.js version" -Detail "Node $nodeVersion found; minimum is $MinimumNodeVersion."))
    }
    else {
        $results.Add((New-Result -Status "FAIL" -Check "Node.js version" -Detail "Found '$($nodeOutput.Trim())'; minimum is $MinimumNodeVersion."))
    }
}
else {
    $results.Add((New-Result -Status "FAIL" -Check "Node.js version" -Detail "node is not on PATH. Include/install Node.js $MinimumNodeVersion or newer."))
}

$npmCommand = Get-Command npm -ErrorAction SilentlyContinue
if ($npmCommand) {
    $npmOutput = (& $npmCommand.Source --version) 2>&1 | Out-String
    $npmVersion = ConvertTo-SemVer -Text $npmOutput
    if ($npmVersion -and $npmVersion -ge $MinimumNpmVersion) {
        $results.Add((New-Result -Status "PASS" -Check "npm version" -Detail "npm $npmVersion found; minimum is $MinimumNpmVersion."))
    }
    else {
        $results.Add((New-Result -Status "FAIL" -Check "npm version" -Detail "Found '$($npmOutput.Trim())'; minimum is $MinimumNpmVersion."))
    }
}
else {
    $results.Add((New-Result -Status "FAIL" -Check "npm version" -Detail "npm is not on PATH. Include/install npm $MinimumNpmVersion or newer."))
}

$mongodCommand = Get-Command mongod -ErrorAction SilentlyContinue
$mongoshCommand = Get-Command mongosh -ErrorAction SilentlyContinue

if ($mongodCommand) {
    $mongoOutput = (& $mongodCommand.Source --version) 2>&1 | Out-String
    $mongoVersion = ConvertTo-SemVer -Text $mongoOutput
    if ($mongoVersion -and $mongoVersion -ge $MinimumMongoVersion) {
        $results.Add((New-Result -Status "PASS" -Check "MongoDB version" -Detail "mongod $mongoVersion found; minimum is $MinimumMongoVersion."))
    }
    else {
        $results.Add((New-Result -Status "WARN" -Check "MongoDB version" -Detail "mongod was found but version could not be verified as $MinimumMongoVersion or newer. Output: $($mongoOutput.Trim())"))
    }
}
elseif ($mongoshCommand) {
    $mongoshOutput = (& $mongoshCommand.Source --version) 2>&1 | Out-String
    $mongoshVersion = ConvertTo-SemVer -Text $mongoshOutput
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $serverOutput = (& $mongoshCommand.Source "mongodb://127.0.0.1:27017/admin?serverSelectionTimeoutMS=2000" --quiet --eval "db.version()") 2>&1 | Out-String
        $serverExitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    if ($serverExitCode -eq 0) {
        $mongoVersion = ConvertTo-SemVer -Text $serverOutput
        if ($mongoVersion -and $mongoVersion -ge $MinimumMongoVersion) {
            $results.Add((New-Result -Status "PASS" -Check "MongoDB version" -Detail "MongoDB server $mongoVersion verified through mongosh; minimum is $MinimumMongoVersion."))
        }
        else {
            $results.Add((New-Result -Status "WARN" -Check "MongoDB version" -Detail "mongosh $mongoshVersion found, but connected server version '$($serverOutput.Trim())' is below or not parseable as $MinimumMongoVersion+."))
        }
    }
    else {
        $results.Add((New-Result -Status "WARN" -Check "MongoDB version" -Detail "mongosh $mongoshVersion found, but no local MongoDB server version was verified on 127.0.0.1:27017. Include a MongoDB $MinimumMongoVersion+ installer, portable runtime, Docker image, or internal service details with the handoff."))
    }
}
else {
    $results.Add((New-Result -Status "WARN" -Check "MongoDB version" -Detail "No mongod or mongosh command found on PATH. Include a MongoDB $MinimumMongoVersion+ installer, portable runtime, Docker image, or internal service details with the handoff."))
}

$secretEnvFiles = @(Get-ChildItem -LiteralPath $rootPath -Recurse -Force -File -Filter ".env*" |
    Where-Object { $_.Name -ne ".env.example" })

if ($secretEnvFiles.Count -gt 0) {
    $relativeSecretList = $secretEnvFiles |
        ForEach-Object { Get-RelativeArchivePath -BasePath $rootPath -TargetPath $_.FullName } |
        Sort-Object
    $results.Add((New-Result -Status "INFO" -Check "Archive exclusions" -Detail "Secret env files will not be included by -CreateArchive: $($relativeSecretList -join ', ')"))
}

$results | Format-Table -AutoSize

$failCount = @($results | Where-Object { $_.Status -eq "FAIL" }).Count
$warningCount = @($results | Where-Object { $_.Status -eq "WARN" }).Count

if ($CreateArchive) {
    $archive = New-ClosedNetworkArchive -RootPath $rootPath -DestinationDirectory $outputPath -Results $results -CompressionLevel $ArchiveCompressionLevel
    Write-Host ""
    Write-Host "Created archive: $($archive.ArchivePath)"
    Write-Host "Archive size: $(Format-Bytes -Bytes $archive.ArchiveSize)"
    Write-Host "Manifest: $($archive.ManifestPath)"
}
else {
    Write-Host ""
    Write-Host "Safe check mode only. To create a fresh portable bundle, rerun with -CreateArchive."
    Write-Host "Default output directory: $outputPath"
}

Write-Host ""
Write-Host "Summary: $failCount failure(s), $warningCount warning(s)."

if ($failCount -gt 0 -or ($FailOnWarning -and $warningCount -gt 0)) {
    exit 1
}

exit 0
