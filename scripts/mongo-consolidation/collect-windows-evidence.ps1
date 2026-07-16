[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$OutputDirectory,
  [string[]]$RuntimeSearchRoots = @(),
  [string[]]$BackupSearchRoots = @(),
  [string]$MongoUriEnvironmentVariable = "MONGODB_URI",
  [ValidatePattern("^[a-zA-Z0-9_-]+$")][string]$HubDatabaseName = "sitebuilder_hub",
  [ValidatePattern("^[a-zA-Z0-9_-]+$")][string]$BuilderDatabaseName = "sitebuilder_site_data"
)
$ErrorActionPreference = "Stop"
$output = [IO.Path]::GetFullPath($OutputDirectory)
[IO.Directory]::CreateDirectory($output) | Out-Null
function Write-SafeJson([string]$Name, $Value) {
  [IO.File]::WriteAllText((Join-Path $output $Name), ($Value | ConvertTo-Json -Depth 20), [Text.UTF8Encoding]::new($false))
}
function Get-SafeOrigin([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return "" }
  try { $uri = [Uri]$Value; $port = if ($uri.IsDefaultPort) { "" } else { ":$($uri.Port)" }; return "$($uri.Scheme)://$($uri.Host)$port" }
  catch { return "[invalid-url]" }
}
function Get-SafeCommand([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return "" }
  $safe = $Value -replace '(mongodb(?:\+srv)?://)[^\s/@:]+:[^\s/@]+@', '$1[redacted]@'
  return $safe -replace '(?i)(password|secret|token|api[-_]?key|authorization)=([^\s]+)', '$1=[redacted]'
}
function Get-FirstValue($Primary, $Secondary) {
  if ($null -ne $Primary -and -not [string]::IsNullOrWhiteSpace([string]$Primary)) { return $Primary }
  return $Secondary
}
$collectedAt = [DateTime]::UtcNow.ToString("o")
$system = Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber, OSArchitecture
Write-SafeJson "system.json" @{ schemaVersion=1; collectedAt=$collectedAt; collectorHostAlias="windows-host"; system=$system }
$servicePattern = "mongo|site.?builder|hub|iis|nginx|apache|proxy|backup"
$services = Get-CimInstance Win32_Service | Where-Object { $_.Name -match $servicePattern -or $_.DisplayName -match $servicePattern } | Select-Object Name, DisplayName, State, StartMode, @{n="StartupPath";e={Get-SafeCommand $_.PathName}}, StartName
$processes = Get-CimInstance Win32_Process | Where-Object { $_.Name -match "node|mongo|w3wp|nginx|httpd" } | Select-Object Name, ProcessId, ExecutablePath
$tasks = Get-ScheduledTask | Where-Object { $_.TaskName -match $servicePattern -or $_.TaskPath -match $servicePattern } | Select-Object TaskName, TaskPath, State, @{n="Actions";e={@($_.Actions | ForEach-Object { @{Execute=$_.Execute; Arguments=(Get-SafeCommand $_.Arguments); WorkingDirectory=$_.WorkingDirectory} })}}
Write-SafeJson "services.json" @{ services=@($services); processes=@($processes); scheduledTasks=@($tasks) }
Write-SafeJson "ports.json" @(Get-NetTCPConnection -State Listen | Select-Object LocalAddress, LocalPort, OwningProcess)
$dockerRows = @()
if (Get-Command docker -ErrorAction SilentlyContinue) {
  $ids = @(docker ps -a --filter "ancestor=mongo" --format "{{.ID}}")
  foreach ($id in $ids) {
    $item = docker inspect $id | ConvertFrom-Json | Select-Object -First 1
    $dockerRows += @{ id=$item.Id.Substring(0,12); name=$item.Name.TrimStart("/"); image=$item.Config.Image; status=$item.State.Status; ports=$item.NetworkSettings.Ports;
      mounts=@($item.Mounts | Select-Object Name, Source, Destination, Type); restartPolicy=$item.HostConfig.RestartPolicy.Name;
      environmentNames=@($item.Config.Env | ForEach-Object { ($_ -split "=",2)[0] }) }
  }
}
Write-SafeJson "docker.json" @($dockerRows)
$iisRows = @()
if (Get-Module -ListAvailable WebAdministration) {
  Import-Module WebAdministration
  $arrEnabled = (Get-WebConfigurationProperty -PSPath "MACHINE/WEBROOT/APPHOST" -Filter "system.webServer/proxy" -Name "enabled" -ErrorAction SilentlyContinue).Value
  foreach ($website in Get-Website) {
    $iisRows += @{ name=$website.Name; state=$website.State; physicalPath=$website.PhysicalPath; applicationPool=$website.ApplicationPool;
      bindings=@(Get-WebBinding -Name $website.Name | Select-Object protocol,bindingInformation);
      rewriteRules=@(Get-WebConfiguration -PSPath "IIS:\Sites\$($website.Name)" -Filter "system.webServer/rewrite/rules/rule" -ErrorAction SilentlyContinue | Select-Object name,enabled,stopProcessing,@{n="target";e={Get-SafeCommand ([string]$_.action.url)}}); proxyEnabled=[bool]$arrEnabled }
  }
}
Write-SafeJson "iis.json" @($iisRows)
$mongoEvidence = @{ available=$false; databases=@(); topology=@{} }
$mongoUri = [Environment]::GetEnvironmentVariable($MongoUriEnvironmentVariable)
if ((Get-Command mongosh -ErrorAction SilentlyContinue) -and -not [string]::IsNullOrWhiteSpace($mongoUri)) {
  $mongoScript = @'
const admin=db.getSiblingDB("admin"),hello=admin.runCommand({hello:1}),build=admin.runCommand({buildInfo:1}),parameters=admin.runCommand({getParameter:1,featureCompatibilityVersion:1}),cmd=admin.runCommand({getCmdLineOpts:1}),rs=hello.setName?admin.runCommand({replSetGetStatus:1}):null;
const databases=admin.runCommand({listDatabases:1,nameOnly:false}).databases.map(d=>{const target=db.getSiblingDB(d.name);const collections=target.getCollectionInfos().map(c=>({name:c.name,options:c.options,count:target.getCollection(c.name).countDocuments({}),storageSize:(target.getCollection(c.name).stats(1024*1024).storageSize||0),indexes:target.getCollection(c.name).getIndexes()}));return {name:d.name,sizeOnDisk:d.sizeOnDisk,collections};});
const hubName="__HUB_DB__",builderName="__BUILDER_DB__",hub=db.getSiblingDB(hubName),builder=db.getSiblingDB(builderName);
const registry=builder.sites.find({},{_id:0,siteId:1,safeCollectionName:1,status:1,schemaVersion:1}).toArray(),allNames=builder.getCollectionInfos().map(c=>c.name),registryIds=registry.map(r=>r.siteId);
const physical=registry.map(r=>{const exists=allNames.includes(r.safeCollectionName);if(!exists)return {siteId:r.siteId,name:r.safeCollectionName,exists:false};const c=builder.getCollection(r.safeCollectionName);return {siteId:r.siteId,name:r.safeCollectionName,exists:true,count:c.countDocuments({}),wrongSiteDocuments:c.countDocuments({siteId:{$ne:r.siteId}}),invalidVersions:c.countDocuments({$or:[{version:{$exists:false}},{version:{$lt:1}}]}),invalidDeletedAt:c.countDocuments({$expr:{$and:[{$ne:[{$type:"$deletedAt"},"missing"]},{$ne:["$deletedAt",null]},{$ne:[{$type:"$deletedAt"},"date"]}]}}),oversizedBackups:c.aggregate([{$match:{scope:"backups"}},{$project:{size:{$bsonSize:"$$ROOT"}}},{$match:{size:{$gte:8388608}}},{$count:"count"}]).toArray()[0]?.count||0};});
const orphanPhysical=allNames.filter(n=>/^(site|test_site)_/.test(n)&&!registry.some(r=>r.safeCollectionName===n));
const revisionOrphans=builder.site_data_revisions.countDocuments({siteId:{$nin:registryIds}}),auditOrphans=builder.site_data_audit_logs.countDocuments({siteId:{$nin:registryIds}});
const mappingInput={hubSites:hub.sites.find({},{_id:1,siteIdentityKey:1,siteCode:1,builderSiteId:1,mongoSiteId:1,safeCollectionName:1,storageBackend:1,"runtimeConfigStatus.builderSiteId":1,"mongoBackendStatus.siteId":1,"mongoBackendStatus.safeCollectionName":1}).toArray().map(r=>({...r,_id:String(r._id)})),registry,physical,orphanPhysical,revisionOrphans,auditOrphans};
const security=cmd.ok?cmd.parsed?.security||{}:{},net=cmd.ok?cmd.parsed?.net||{}:{};
print(JSON.stringify({available:true,version:build.version,fcv:parameters.featureCompatibilityVersion,authenticationEnabled:cmd.ok?(security.authorization==="enabled"):"unknown",tlsEnabled:cmd.ok?!!(net.tls?.mode&&net.tls.mode!=="disabled"||net.ssl?.mode&&net.ssl.mode!=="disabled"):"unknown",topology:{kind:hello.msg==="isdbgrid"?"sharded":hello.setName?"replica-set":"standalone",setName:hello.setName||"",isWritablePrimary:!!hello.isWritablePrimary,members:rs?.ok?(rs.members||[]).map((m,i)=>({alias:`member-${i+1}`,state:m.stateStr})):[]},databases,mappingInput}));
'@
  $mongoScript = $mongoScript.Replace("__HUB_DB__", $HubDatabaseName).Replace("__BUILDER_DB__", $BuilderDatabaseName)
  $mongoEvidence = mongosh $mongoUri --quiet --eval $mongoScript | ConvertFrom-Json
  $mongoEvidence | Add-Member -NotePropertyName connection -NotePropertyValue @{
    authenticationConfigured = [bool]($mongoUri -match '^mongodb(?:\+srv)?://[^/@]+@')
    tlsConfigured = [bool]($mongoUri -match '^mongodb\+srv://' -or $mongoUri -match '(?i)[?&](tls|ssl)=(true|1)')
  }
}
$mappingInput = if ($mongoEvidence.mappingInput) { $mongoEvidence.mappingInput } else { @{ hubSites=@(); registry=@(); physical=@(); orphanPhysical=@(); revisionOrphans=0; auditOrphans=0 } }
$mongoForOutput = $mongoEvidence | Select-Object * -ExcludeProperty mappingInput
Write-SafeJson "mongo.json" $mongoForOutput
$runtimeRows = @(); $runtimeNames = @("sitebuilder-runtime-config.json","runtime-config.json")
foreach ($root in $RuntimeSearchRoots) {
  if (-not (Test-Path -LiteralPath $root)) { continue }
  Get-ChildItem -LiteralPath $root -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $runtimeNames -contains $_.Name -or $_.Name -match "deploy.*metadata|manifest" } | ForEach-Object {
    $row = @{ path=$_.FullName; storageBackend=""; siteId=""; backendOrigin=""; apiVersion=""; schemaVersion="" }
    try { $value=Get-Content -LiteralPath $_.FullName -Raw | ConvertFrom-Json; $row.storageBackend=[string]$value.storageBackend; $row.siteId=[string](Get-FirstValue $value.siteId $value.builderSiteId); $row.backendOrigin=Get-SafeOrigin ([string](Get-FirstValue $value.backendApiUrl $value.apiBaseUrl)); $row.apiVersion=[string]$value.apiVersion; $row.schemaVersion=[string](Get-FirstValue $value.schemaVersion $value.runtimeConfigSchemaVersion) }
    catch { $row.parseStatus="invalid" }
    $runtimeRows += $row
  }
}
Write-SafeJson "runtime-configs.json" @($runtimeRows)
$backupRows = @()
foreach ($root in $BackupSearchRoots) { if (Test-Path -LiteralPath $root) { $backupRows += @(Get-ChildItem -LiteralPath $root -Recurse -File -ErrorAction SilentlyContinue | Select-Object FullName,Name,Length,LastWriteTimeUtc) } }
Write-SafeJson "backups.json" @($backupRows)
$mappingInput | Add-Member -NotePropertyName runtimeConfigs -NotePropertyValue @($runtimeRows) -Force
$mappingInput | Add-Member -NotePropertyName mongoDatabases -NotePropertyValue @($mongoEvidence.databases | ForEach-Object { $_.name }) -Force
Write-SafeJson "mapping-input.json" $mappingInput
Write-Output "Evidence JSON written to $output. Run validate-windows-evidence.mjs before transfer."
