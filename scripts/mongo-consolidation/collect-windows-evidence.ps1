[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$OutputDirectory,
  [Parameter(Mandatory = $true)][ValidatePattern("^[a-zA-Z0-9._-]+$")][string]$CollectorHostAlias,
  [string[]]$RuntimeSearchRoots = @(),
  [string[]]$BackupSearchRoots = @(),
  [string]$MongoUriEnvironmentVariable = "MONGODB_URI",
  [ValidatePattern("^[a-zA-Z0-9_-]+$")][string]$HubDatabaseName = "sitebuilder_hub",
  [ValidatePattern("^[a-zA-Z0-9_-]+$")][string]$BuilderDatabaseName = "sitebuilder_site_data",
  [switch]$IncludeFullCollectionBsonScan,
  [string]$PrecollectedMongoEvidencePath
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
  $safe = $safe -replace '(?i)(password|secret|token|api[-_]?key|authorization)=([^\s]+)', '$1=[redacted]'
  return $safe -replace '([a-zA-Z][a-zA-Z0-9+.-]*://[^\s?#]+)[?#][^\s]+', '$1'
}
function Get-FirstValue($Primary, $Secondary) {
  if ($null -ne $Primary -and -not [string]::IsNullOrWhiteSpace([string]$Primary)) { return $Primary }
  return $Secondary
}
function Get-CompatibilityRelativePath([string]$BasePath, [string]$TargetPath) {
  $baseUri = New-Object System.Uri(([IO.Path]::GetFullPath($BasePath).TrimEnd('\') + '\')
  $targetUri = New-Object System.Uri([IO.Path]::GetFullPath($TargetPath))
  return [Uri]::UnescapeDataString($baseUri.MakeRelativeUri($targetUri).ToString()).Replace('/', '\')
}
function New-CollectionState([string]$Status, [string]$Reason, [string]$Message, $Items = @()) {
  return @{ status=$Status; reason=$Reason; message=$Message; items=@($Items) }
}
function Get-OptionalFailureState([string]$Category, $ErrorRecord) {
  $exception = if ($ErrorRecord -and $ErrorRecord.Exception) { $ErrorRecord.Exception } else { $null }
  $text = if ($exception) { [string]$exception.Message } else { [string]$ErrorRecord }
  $accessDenied = $exception -is [System.UnauthorizedAccessException] -or $text -match '(?i)access is denied|access denied|unauthorized|permission denied'
  if ($accessDenied) { return (New-CollectionState 'access-denied' "$Category.access-denied" "Access to the $Category inventory was denied.") }
  return (New-CollectionState 'query-failed' "$Category.query-failed" "The $Category inventory query failed.")
}
function Get-RootInventory([string]$OriginalRoot, [string]$Kind) {
  $normalized = ''
  try { $normalized = [IO.Path]::GetFullPath($OriginalRoot) } catch {
    return @{ originalRoot=$OriginalRoot; normalizedRoot=''; status='query-failed'; reason="$Kind.invalid-root"; filesScanned=0; accessDeniedCount=0; files=@() }
  }
  if (-not (Test-Path -LiteralPath $normalized)) {
    return @{ originalRoot=$OriginalRoot; normalizedRoot=$normalized; status='missing'; reason="$Kind.root-missing"; filesScanned=0; accessDeniedCount=0; files=@() }
  }
  $errors = @()
  try {
    $files = @(Get-ChildItem -LiteralPath $normalized -Recurse -File -ErrorAction SilentlyContinue -ErrorVariable +errors)
    $accessDeniedCount = @($errors | Where-Object { $_.Exception -is [System.UnauthorizedAccessException] -or $_.Exception.Message -match '(?i)access is denied|access denied|unauthorized|permission denied' }).Count
    $otherErrors = @($errors | Where-Object { -not ($_.Exception -is [System.UnauthorizedAccessException] -or $_.Exception.Message -match '(?i)access is denied|access denied|unauthorized|permission denied') }).Count
    if ($accessDeniedCount -gt 0) { $status='access-denied'; $reason="$Kind.partial-access-denied" }
    elseif ($otherErrors -gt 0) { $status='query-failed'; $reason="$Kind.enumeration-failed" }
    else { $status='found'; $reason="$Kind.enumerated" }
    return @{ originalRoot=$OriginalRoot; normalizedRoot=$normalized; status=$status; reason=$reason; filesScanned=@($files).Count; accessDeniedCount=$accessDeniedCount; files=@($files) }
  } catch {
    $state = Get-OptionalFailureState "$Kind.root" $_
    return @{ originalRoot=$OriginalRoot; normalizedRoot=$normalized; status=$state.status; reason=$state.reason; filesScanned=0; accessDeniedCount=0; files=@() }
  }
}
$collectedAt = [DateTime]::UtcNow.ToString("o")
$capabilityStates = @{}
$system = $null
if (Get-Command Get-CimInstance -ErrorAction SilentlyContinue) {
  try {
    $system = Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber, OSArchitecture
    $capabilityStates.operatingSystem = New-CollectionState 'available' 'operating-system.cim' 'Operating system inventory was collected.' @($system)
  } catch { $capabilityStates.operatingSystem = Get-OptionalFailureState 'operating-system' $_ }
} else {
  $capabilityStates.operatingSystem = New-CollectionState 'unavailable' 'operating-system.cim-unavailable' 'The CIM command is unavailable on this host.'
}
Write-SafeJson "system.json" @{ schemaVersion=1; collectedAt=$collectedAt; collectorHostAlias=$CollectorHostAlias; system=@{
  operatingSystem=$system; localTime=[DateTimeOffset]::Now.ToString("o"); utcTime=$collectedAt; timeZoneId=[TimeZoneInfo]::Local.Id
} }
$servicePattern = "mongo|site.?builder|hub|iis|nginx|apache|proxy|backup"
$services = @(); $processes = @()
if (Get-Command Get-CimInstance -ErrorAction SilentlyContinue) {
  try {
    $services = @(Get-CimInstance Win32_Service | Where-Object { $_.Name -match $servicePattern -or $_.DisplayName -match $servicePattern } | Select-Object Name, DisplayName, State, StartMode, @{n="StartupPath";e={Get-SafeCommand $_.PathName}}, StartName)
    $capabilityStates.services = New-CollectionState 'available' 'services.cim' 'Service inventory was collected.' $services
  } catch { $capabilityStates.services = Get-OptionalFailureState 'services' $_ }
  try {
    $processes = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -match "node|mongo|w3wp|nginx|httpd" } | Select-Object Name, ProcessId, ExecutablePath)
    $capabilityStates.processes = New-CollectionState 'available' 'processes.cim' 'Process inventory was collected.' $processes
  } catch { $capabilityStates.processes = Get-OptionalFailureState 'processes' $_ }
} else {
  $capabilityStates.services = New-CollectionState 'unavailable' 'services.cim-unavailable' 'The CIM command is unavailable on this host.'
  $capabilityStates.processes = New-CollectionState 'unavailable' 'processes.cim-unavailable' 'The CIM command is unavailable on this host.'
}
$tasks = @()
if (Get-Command Get-ScheduledTask -ErrorAction SilentlyContinue) {
  try {
    $tasks = @(Get-ScheduledTask | Where-Object { $_.TaskName -match $servicePattern -or $_.TaskPath -match $servicePattern } | Select-Object TaskName, TaskPath, State, @{n="Actions";e={@($_.Actions | ForEach-Object { @{Execute=$_.Execute; Arguments=(Get-SafeCommand $_.Arguments); WorkingDirectory=$_.WorkingDirectory} })}})
    $capabilityStates.scheduledTasks = New-CollectionState 'available' 'scheduled-tasks.cmdlet' 'Scheduled-task inventory was collected.' $tasks
  } catch { $capabilityStates.scheduledTasks = Get-OptionalFailureState 'scheduled-tasks' $_ }
} else {
  $capabilityStates.scheduledTasks = New-CollectionState 'not-installed' 'scheduled-tasks.cmdlet-missing' 'The ScheduledTasks module is not installed on this host.'
}
Write-SafeJson "services.json" @{ services=@($services); processes=@($processes); scheduledTasks=@($tasks) }
$ports = @()
if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
  try {
    $ports = @(Get-NetTCPConnection -State Listen | ForEach-Object {
      $owner = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
      @{ localAddress=$_.LocalAddress; localPort=$_.LocalPort; owningProcess=$_.OwningProcess; processName=[string]$owner.ProcessName }
    })
    $capabilityStates.listeningPorts = New-CollectionState 'available' 'listening-ports.nettcpconnection' 'Listening-port inventory was collected.' $ports
  } catch { $capabilityStates.listeningPorts = Get-OptionalFailureState 'listening-ports' $_ }
}
if ((-not $capabilityStates.ContainsKey('listeningPorts') -or $capabilityStates.listeningPorts.status -ne 'available') -and (Get-Command netstat.exe -ErrorAction SilentlyContinue)) {
  try {
    $lines = @(& netstat.exe -ano -p tcp 2>$null)
    if ($LASTEXITCODE -ne 0) { throw 'netstat failed' }
    $ports = @($lines | ForEach-Object {
      if ($_ -match '^\s*TCP\s+(\S+):(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$') {
        $owner = Get-Process -Id ([int]$Matches[3]) -ErrorAction SilentlyContinue
        @{ localAddress=$Matches[1]; localPort=[int]$Matches[2]; owningProcess=[int]$Matches[3]; processName=[string]$owner.ProcessName }
      }
    } | Where-Object { $null -ne $_ })
    $capabilityStates.listeningPorts = New-CollectionState 'available' 'listening-ports.netstat-fallback' 'Listening-port inventory was collected with the netstat fallback.' $ports
  } catch { $capabilityStates.listeningPorts = Get-OptionalFailureState 'listening-ports' $_ }
}
if (-not $capabilityStates.ContainsKey('listeningPorts')) {
  $capabilityStates.listeningPorts = New-CollectionState 'unavailable' 'listening-ports.no-supported-command' 'No supported listening-port command is available on this host.'
}
Write-SafeJson "ports.json" @($ports)
$dockerRows = @()
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  $capabilityStates.docker = New-CollectionState 'not-installed' 'docker.command-missing' 'The Docker command is not installed on this host.'
} else {
  try {
    $daemonOutput = @(docker info --format "{{.ServerVersion}}" 2>&1)
    if ($LASTEXITCODE -ne 0) { throw ($daemonOutput -join ' ') }
    $ids = @(docker ps -a --format "{{.ID}}" 2>&1)
    if ($LASTEXITCODE -ne 0) { throw ($ids -join ' ') }
    foreach ($id in $ids) {
      if ([string]::IsNullOrWhiteSpace($id)) { continue }
      $inspectOutput = @(docker inspect $id 2>&1)
      if ($LASTEXITCODE -ne 0) { throw ($inspectOutput -join ' ') }
      $item = $inspectOutput | ConvertFrom-Json | Select-Object -First 1
      if ($null -eq $item) { throw 'docker inspect query failed' }
      $mongoCandidate = $item.Name -match "mongo" -or $item.Config.Image -match "mongo" -or @($item.Mounts | Where-Object { $_.Destination -match "(?i)/data/(db|configdb)" }).Count -gt 0
      if (-not $mongoCandidate) { continue }
      $dockerRows += @{ id=$item.Id.Substring(0,12); name=$item.Name.TrimStart("/"); image=$item.Config.Image; status=$item.State.Status; ports=$item.NetworkSettings.Ports;
        mounts=@($item.Mounts | Select-Object Name, Source, Destination, Type); restartPolicy=$item.HostConfig.RestartPolicy.Name;
        environmentNames=@($item.Config.Env | ForEach-Object { ($_ -split "=",2)[0] }) }
    }
    $capabilityStates.docker = New-CollectionState 'available' 'docker.daemon' 'Docker inventory was collected.' $dockerRows
  } catch {
    $capabilityStates.docker = Get-OptionalFailureState 'docker' $_
  }
}
Write-SafeJson "docker.json" @($dockerRows)
$iisRows = @()
if (-not (Get-Module -ListAvailable WebAdministration)) {
  $capabilityStates.iis = New-CollectionState 'not-installed' 'iis.webadministration-module-missing' 'The IIS WebAdministration module is not installed on this host.'
} else {
  try {
    Import-Module WebAdministration -ErrorAction Stop
    $arrEnabled = (Get-WebConfigurationProperty -PSPath "MACHINE/WEBROOT/APPHOST" -Filter "system.webServer/proxy" -Name "enabled" -ErrorAction Stop).Value
    foreach ($website in @(Get-Website -ErrorAction Stop)) {
      $iisRows += @{ name=$website.Name; state=$website.State; physicalPath=$website.PhysicalPath; applicationPool=$website.ApplicationPool;
        bindings=@(Get-WebBinding -Name $website.Name -ErrorAction Stop | Select-Object protocol,bindingInformation);
        rewriteRules=@(Get-WebConfiguration -PSPath "IIS:\Sites\$($website.Name)" -Filter "system.webServer/rewrite/rules/rule" -ErrorAction Stop | Select-Object name,enabled,stopProcessing,@{n="target";e={Get-SafeCommand ([string]$_.action.url)}}); proxyEnabled=[bool]$arrEnabled }
    }
    $capabilityStates.iis = New-CollectionState 'available' 'iis.webadministration' 'IIS inventory was collected.' $iisRows
  } catch {
    $capabilityStates.iis = Get-OptionalFailureState 'iis' $_
  }
}
Write-SafeJson "iis.json" @($iisRows)
$mongoEvidence = @{ available=$false; status='unavailable'; reason='mongo.precollected-evidence-required'; message='Mongo evidence was not supplied by the bundled read-only Node reader.'; topology=@{} }
$usePrecollectedMongoEvidence = -not [string]::IsNullOrWhiteSpace($PrecollectedMongoEvidencePath)
if ($usePrecollectedMongoEvidence) {
  try {
    $mongoEvidence = Get-Content -LiteralPath $PrecollectedMongoEvidencePath -Raw | ConvertFrom-Json
    $mongoEvidence | Add-Member -NotePropertyName status -NotePropertyValue 'available' -Force
    $mongoEvidence | Add-Member -NotePropertyName reason -NotePropertyValue 'mongo.precollected-evidence' -Force
    $mongoEvidence | Add-Member -NotePropertyName message -NotePropertyValue 'Mongo evidence was supplied by the bundled read-only Node reader.' -Force
  } catch {
    $mongoEvidence = @{ available=$false; status='query-failed'; reason='mongo.precollected-evidence-unreadable'; message='Precollected Mongo evidence could not be read safely.'; topology=@{} }
  }
}
if ($false) {
  $mongoScript = @'
const admin=db.getSiblingDB("admin"),hello=admin.runCommand({hello:1}),build=admin.runCommand({buildInfo:1}),parameters=admin.runCommand({getParameter:1,featureCompatibilityVersion:1}),cmd=admin.runCommand({getCmdLineOpts:1}),serverStatus=admin.runCommand({serverStatus:1}),rwConcern=admin.runCommand({getDefaultRWConcern:1}),rs=hello.setName?admin.runCommand({replSetGetStatus:1}):null,includeFullScan=__FULL_SCAN__;
const databases=admin.runCommand({listDatabases:1,nameOnly:false}).databases.map(d=>{const target=db.getSiblingDB(d.name);const collections=target.getCollectionInfos().map(c=>{const coll=target.getCollection(c.name),stats=target.runCommand({collStats:c.name,scale:1}),scan=includeFullScan?coll.aggregate([{$project:{bsonSize:{$bsonSize:"$$ROOT"},timestamp:{$ifNull:["$updatedAt",{$ifNull:["$createdAt","$timestamp"]}]}}},{$group:{_id:null,maxObservedBsonBytes:{$max:"$bsonSize"},earliestTimestamp:{$min:"$timestamp"},latestTimestamp:{$max:"$timestamp"}}}],{allowDiskUse:false}).toArray()[0]||{}:{};return {name:c.name,options:c.options,count:coll.countDocuments({}),logicalSizeBytes:stats.size||0,storageSizeBytes:stats.storageSize||0,indexes:coll.getIndexes(),maxObservedBsonBytes:scan.maxObservedBsonBytes??null,earliestTimestamp:scan.earliestTimestamp??null,latestTimestamp:scan.latestTimestamp??null,fullBsonScanPerformed:includeFullScan};});return {name:d.name,sizeOnDisk:d.sizeOnDisk,collections};});
const hubName="__HUB_DB__",builderName="__BUILDER_DB__",hub=db.getSiblingDB(hubName),builder=db.getSiblingDB(builderName);
const safeOrigin=value=>{if(!value)return "";try{const u=new URL(value);return `${u.protocol}//${u.host}`;}catch{return "[invalid-url]";}},safeUrl=value=>{if(!value)return "";try{const u=new URL(value);return `${u.protocol}//${u.host}${u.pathname.replace(/\/$/,"")}`;}catch{return "[invalid-url]";}};
const hubSites=hub.getCollectionInfos({name:"sites"}).length?hub.sites.find({},{_id:1,siteIdentityKey:1,siteCode:1,storageBackend:1,status:1,lifecycleStatus:1,provisioningStatus:1,builderSiteId:1,mongoSiteId:1,safeCollectionName:1,mongoDatabase:1,backendApiUrl:1,runtimeConfigPath:1,"runtimeConfigStatus.builderSiteId":1,"runtimeConfigStatus.storageBackend":1,"runtimeConfigStatus.path":1,"mongoBackendStatus.siteId":1,"mongoBackendStatus.safeCollectionName":1,"mongoBackendStatus.expectedScopes":1,sharePointSiteUrl:1,createdAt:1,updatedAt:1}).toArray().map(r=>({...r,_id:String(r._id),backendApiUrl:safeOrigin(r.backendApiUrl),sharePointSiteUrl:safeUrl(r.sharePointSiteUrl),runtimeConfigStatus:r.runtimeConfigStatus?{builderSiteId:r.runtimeConfigStatus.builderSiteId,storageBackend:r.runtimeConfigStatus.storageBackend,path:r.runtimeConfigStatus.path}:undefined,mongoBackendStatus:r.mongoBackendStatus?{siteId:r.mongoBackendStatus.siteId,safeCollectionName:r.mongoBackendStatus.safeCollectionName,expectedScopes:r.mongoBackendStatus.expectedScopes}:undefined})):[];
const allNames=builder.getCollectionInfos().map(c=>c.name),registry=allNames.includes("sites")?builder.sites.find({},{_id:0,siteId:1,siteSlug:1,safeCollectionName:1,status:1,schemaVersion:1,createdAt:1,updatedAt:1}).toArray().map(r=>({...r,physicalCollectionExists:allNames.includes(r.safeCollectionName)})):[],registryIds=registry.map(r=>r.siteId),globalCollections=new Set(["sites","site_data_revisions","site_data_audit_logs"]);
const physicalNames=[...new Set([...registry.map(r=>r.safeCollectionName).filter(Boolean),...allNames.filter(n=>/^(?:site|test_site)_/.test(n)&&!globalCollections.has(n))])];
const physical=physicalNames.map(name=>{const owner=registry.find(r=>r.safeCollectionName===name),exists=allNames.includes(name),empty={name,registrySiteId:owner?.siteId,exists:false,documentCount:0,wrongSiteDocuments:0,invalidVersions:0,invalidDeletedAt:0,malformedIds:0,oversizedBackups:0,criticalBackups:0,unknownScopes:[],scopes:{},duplicateLogicalDocuments:0,backupDocumentCount:0,maximumBackupBsonSize:0};if(!exists)return empty;const c=builder.getCollection(name),scopeRows=c.aggregate([{$group:{_id:"$scope",count:{$sum:1}}}]).toArray(),scopes=Object.fromEntries(scopeRows.map(x=>[String(x._id??"[missing]"),x.count])),version=c.aggregate([{$match:{version:{$type:"number"}}},{$group:{_id:null,min:{$min:"$version"},max:{$max:"$version"}}}]).toArray()[0]||{},backup=c.aggregate([{$match:{scope:"backups"}},{$project:{size:{$bsonSize:"$$ROOT"}}},{$group:{_id:null,count:{$sum:1},maximum:{$max:"$size"},warning:{$sum:{$cond:[{$gte:["$size",8388608]},1,0]}},critical:{$sum:{$cond:[{$gte:["$size",14680064]},1,0]}}}}]).toArray()[0]||{};return {name,registrySiteId:owner?.siteId,exists:true,documentCount:c.countDocuments({}),wrongSiteDocuments:owner?.siteId?c.countDocuments({siteId:{$ne:owner.siteId}}):0,invalidVersions:c.countDocuments({$or:[{version:{$exists:false}},{$expr:{$cond:[{$isNumber:"$version"},{$or:[{$lt:["$version",1]},{$ne:["$version",{$trunc:"$version"}]}]},true]}}]}),invalidDeletedAt:c.countDocuments({$expr:{$and:[{$ne:[{$type:"$deletedAt"},"missing"]},{$ne:["$deletedAt",null]},{$ne:[{$type:"$deletedAt"},"date"]}]}}),malformedIds:c.countDocuments({$expr:{$ne:[{$convert:{input:"$_id",to:"string",onError:"[invalid]",onNull:"[missing]"}},{$concat:[{$convert:{input:"$scope",to:"string",onError:"",onNull:""}},":",{$convert:{input:"$entityId",to:"string",onError:"",onNull:""}}]}]}}),oversizedBackups:backup.warning||0,criticalBackups:backup.critical||0,unknownScopes:Object.keys(scopes),scopes,duplicateLogicalDocuments:c.aggregate([{$group:{_id:{siteId:"$siteId",scope:"$scope",entityId:"$entityId"},count:{$sum:1}}},{$match:{count:{$gt:1}}},{$count:"count"}]).toArray()[0]?.count||0,minimumVersion:version.min??null,maximumVersion:version.max??null,backupDocumentCount:backup.count||0,maximumBackupBsonSize:backup.maximum||0};});
const aggregateLog=(name,isRevision)=>{if(!allNames.includes(name))return [];const c=builder.getCollection(name),siteRows=c.aggregate([{$group:{_id:"$siteId",count:{$sum:1},earliestTimestamp:{$min:{$ifNull:["$createdAt","$timestamp"]}},latestTimestamp:{$max:{$ifNull:["$updatedAt",{$ifNull:["$createdAt","$timestamp"]}]}}}}]).toArray();return siteRows.map(row=>{const filter={siteId:row._id},missing={...filter,$or:[{documentKey:{$exists:false}},{documentKey:null},{documentKey:""}]},malformed={...filter,documentKey:{$type:"string",$not:/^[^:]+:.+$/}},duplicates=c.aggregate([{$match:{...filter,$expr:{$ne:[{$ifNull:["$operationId",{$ifNull:["$requestId",""]}]},""]}}},{$group:{_id:{$ifNull:["$operationId","$requestId"]},count:{$sum:1}}},{$match:{count:{$gt:1}}},{$count:"count"}]).toArray()[0]?.count||0,base={siteId:row._id??"",count:row.count,orphanCount:registryIds.includes(row._id)?0:row.count,missingDocumentKeys:c.countDocuments(missing),malformedDocumentKeys:c.countDocuments(malformed),duplicateOperationIds:duplicates,earliestTimestamp:row.earliestTimestamp??null,latestTimestamp:row.latestTimestamp??null};if(!isRevision)return base;return {...base,invalidVersionTransitions:c.countDocuments({...filter,$expr:{$cond:[{$and:[{$isNumber:"$previousVersion"},{$isNumber:"$nextVersion"}]},{$or:[{$ne:["$previousVersion",{$trunc:"$previousVersion"}]},{$ne:["$nextVersion",{$trunc:"$nextVersion"}]},{$ne:["$nextVersion",{$add:["$previousVersion",1]}]}]},true]}}),physicalDocumentsMissing:0,physicalDocumentCheckComplete:false};});};
const revisionAggregates=aggregateLog("site_data_revisions",true),auditAggregates=aggregateLog("site_data_audit_logs",false);
const orphanPhysical=physical.filter(p=>!p.registrySiteId).map(p=>p.name),mappingInput={hubSites,registry,physical,orphanPhysical,revisionAggregates,auditAggregates};
const security=cmd.ok?cmd.parsed?.security||{}:{},net=cmd.ok?cmd.parsed?.net||{}:{};
print(JSON.stringify({available:true,version:build.version,fcv:parameters.featureCompatibilityVersion,authenticationEnabled:cmd.ok?(security.authorization==="enabled"):"unknown",tlsEnabled:cmd.ok?!!(net.tls?.mode&&net.tls.mode!=="disabled"||net.ssl?.mode&&net.ssl.mode!=="disabled"):"unknown",network:{bindIp:net.bindIp||net.bindIpAll||"",port:net.port||27017},storage:{engine:serverStatus.storageEngine?.name||"unknown",persistent:serverStatus.storageEngine?.persistent??"unknown",supportsCommittedReads:serverStatus.storageEngine?.supportsCommittedReads??"unknown"},defaultReadConcern:rwConcern.ok?rwConcern.defaultReadConcern||{}:"unknown",defaultWriteConcern:rwConcern.ok?rwConcern.defaultWriteConcern||{}:"unknown",topology:{kind:hello.msg==="isdbgrid"?"sharded":hello.setName?"replica-set":"standalone",setName:hello.setName||"",isWritablePrimary:!!hello.isWritablePrimary,replicationHealthy:rs?.ok?!(rs.members||[]).some(m=>m.health!==1):hello.setName?"unknown":"not-applicable",members:rs?.ok?(rs.members||[]).map((m,i)=>({alias:`member-${i+1}`,state:m.stateStr,health:m.health})):[]},databases,mappingInput,reconciliationSnapshot:{hubSites,builderSites:registry,physicalCollections:physical,revisions:[],audits:[],runtimeConfigs:[],revisionAggregates,auditAggregates}}));
'@
  $fullScan = if ($IncludeFullCollectionBsonScan) { "true" } else { "false" }
  $mongoScript = $mongoScript.Replace("__HUB_DB__", $HubDatabaseName).Replace("__BUILDER_DB__", $BuilderDatabaseName).Replace("__FULL_SCAN__", $fullScan)
  $mongoEvidence = & $unusedMongoShell $mongoUri --quiet --eval $mongoScript | ConvertFrom-Json
  $mongoEvidence | Add-Member -NotePropertyName connection -NotePropertyValue @{
    authenticationConfigured = [bool]($mongoUri -match '^mongodb(?:\+srv)?://[^/@]+@')
    tlsConfigured = [bool]($mongoUri -match '^mongodb\+srv://' -or $mongoUri -match '(?i)[?&](tls|ssl)=(true|1)')
  }
}
$capabilityStates.mongo = New-CollectionState $mongoEvidence.status $mongoEvidence.reason $mongoEvidence.message @()
$mappingInput = if ($mongoEvidence.mappingInput) { $mongoEvidence.mappingInput } else { @{ hubSites=@(); registry=@(); physical=@(); orphanPhysical=@(); revisionAggregates=@(); auditAggregates=@() } }
$mongoForOutput = $mongoEvidence | Select-Object * -ExcludeProperty mappingInput,reconciliationSnapshot
Write-SafeJson "mongo.json" $mongoForOutput
$runtimeRows = @(); $runtimeNames = @("sitebuilder-runtime-config.json","runtime-config.json"); $runtimeRootStates = @()
foreach ($root in $RuntimeSearchRoots) {
  $rootInventory = Get-RootInventory $root 'runtime-search'
  $runtimeRootStates += ($rootInventory | Select-Object originalRoot,normalizedRoot,status,reason,filesScanned,accessDeniedCount)
  foreach ($file in @($rootInventory.files | Where-Object { $runtimeNames -contains $_.Name -or $_.Name -match "deploy.*metadata|manifest" })) {
    $relativePath = Get-CompatibilityRelativePath $rootInventory.normalizedRoot $file.FullName
    $artifactType = if ($runtimeNames -contains $file.Name) { "runtime-config" } else { "deployment-metadata" }
    $row = @{ path=$file.FullName; deploymentRelativePath=$relativePath; artifactType=$artifactType; lastModifiedUtc=$file.LastWriteTimeUtc.ToString("o"); storageBackend=""; siteId=""; backendOrigin=""; apiVersion=""; schemaVersion=""; unsafeUrlComponents=$false; findingCodes=@() }
    try {
      $raw = Get-Content -LiteralPath $file.FullName -Raw
      if ($raw -match '(?i)"(?:password|passwd|secret|token|api[-_]?key|authorization|cookie|digest|private[-_]?key|mongo.*uri)"\s*:\s*"[^"\s]+"' -or $raw -match 'mongodb(?:\+srv)?://[^\s/@:]+:[^\s/@]+@') {
        $row.findingCodes=@("runtime.raw-secret-detected")
      } elseif ($artifactType -eq "runtime-config") {
        $value=$raw | ConvertFrom-Json; $backend=[string](Get-FirstValue $value.backendApiUrl $value.apiBaseUrl)
        $row.storageBackend=[string]$value.storageBackend; $row.siteId=[string](Get-FirstValue $value.siteId $value.builderSiteId); $row.backendOrigin=Get-SafeOrigin $backend; $row.unsafeUrlComponents=[bool]($backend -match '://[^/@\s]+@' -or $backend -match '[?#]'); $row.apiVersion=[string]$value.apiVersion; $row.schemaVersion=[string](Get-FirstValue $value.schemaVersion $value.runtimeConfigSchemaVersion)
      }
    } catch { $row.parseStatus="invalid" }
    $runtimeRows += $row
  }
}
Write-SafeJson "runtime-configs.json" @($runtimeRows)
if (@($RuntimeSearchRoots).Count -eq 0) {
  $capabilityStates.runtimeSearchRoots = New-CollectionState 'not-applicable' 'runtime-search.no-roots-supplied' 'No runtime search roots were supplied.'
} else {
  $capabilityStates.runtimeSearchRoots = @{ status='available'; reason='runtime-search.roots-processed'; message='Each supplied runtime search root has a structured inventory state.'; items=@($runtimeRootStates) }
}
$backupRootStates = @()
$backupRows = @()
foreach ($root in $BackupSearchRoots) {
  $rootInventory = Get-RootInventory $root 'backup-search'
  $backupRootStates += ($rootInventory | Select-Object originalRoot,normalizedRoot,status,reason,filesScanned,accessDeniedCount)
  $backupRows += @($rootInventory.files | Select-Object FullName,Name,Length,LastWriteTimeUtc)
}
Write-SafeJson "backups.json" @($backupRows)
if (@($BackupSearchRoots).Count -eq 0) {
  $capabilityStates.backupSearchRoots = New-CollectionState 'not-applicable' 'backup-search.no-roots-supplied' 'No backup search roots were supplied.'
} else {
  $capabilityStates.backupSearchRoots = @{ status='available'; reason='backup-search.roots-processed'; message='Each supplied backup search root has a structured inventory state.'; items=@($backupRootStates) }
}
Write-SafeJson "capability-states.json" @{ schemaVersion=1; collectedAt=$collectedAt; categories=$capabilityStates }
$mappingInput | Add-Member -NotePropertyName runtimeConfigs -NotePropertyValue @($runtimeRows) -Force
$mappingInput | Add-Member -NotePropertyName mongoDatabases -NotePropertyValue @($mongoEvidence.databases | ForEach-Object { $_.name }) -Force
Write-SafeJson "mapping-input.json" $mappingInput
$snapshot = if ($mongoEvidence.reconciliationSnapshot) { $mongoEvidence.reconciliationSnapshot } else { @{ hubSites=@(); builderSites=@(); physicalCollections=@(); revisions=@(); audits=@(); runtimeConfigs=@(); revisionAggregates=@(); auditAggregates=@() } }
$snapshot.runtimeConfigs = @($runtimeRows | Where-Object { $_.artifactType -eq "runtime-config" } | ForEach-Object {
  $parseError = if ($_.parseStatus -eq "invalid") { "invalid-json" } elseif ($_.findingCodes -contains "runtime.raw-secret-detected") { "raw-secret-detected" } else { "" }
  @{ path=$_.path; siteId=$_.siteId; storageBackend=$_.storageBackend; backendOrigin=$_.backendOrigin; apiVersion=$_.apiVersion; schemaVersion=$_.schemaVersion; parseError=$parseError }
})
Write-SafeJson "reconciliation-snapshot.json" $snapshot
Write-Output "Evidence JSON written to $output. Run validate-windows-evidence.mjs before transfer."
