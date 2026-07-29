# SiteBuilder HUB `/builder-api` PILOT_ONLY Gateway

This package patches only the compiled HUB backend. It does not contain or replace the HUB frontend, Builder frontend, `.env`, API keys, Mongo data, TXT data, cookies, or personal data.

## Frozen scope and identity

- Public HUB: `https://sitebuilderhub.idf`
- Existing IIS site: `siteBuilderHub`
- Hosting: IIS/iisnode, Node.js `v18.12.1`
- Internal Builder Data API: `http://127.0.0.1:3001`
- Public pilot prefix: `/builder-api`
- Immutable Builder `siteId`: `alphateam-mongo-pilot`
- Display name: `Alpha Team Mongo Pilot`
- Operational environment classification: `test`
- Allowed browser origin: `https://portal.army.idf`

The current Builder registry contract has no persisted `environment` field. The helper therefore displays and enforces `environment: test` as operator metadata while sending only supported registry fields. It never writes a HUB record to emulate that field.

## Route contract

- `GET /builder-api/healthz` returns only `{"ok":true,"mode":"pilot"}` on a healthy upstream and includes `X-SiteBuilder-Gateway-Mode: pilot`.
- Browser proxy routes are limited to `/builder-api/api/sites/alphateam-mongo-pilot/...`.
- Allowed methods are `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, and `OPTIONS`.
- `/builder-api/api/sites` is never proxied for either list or create.
- `alphateam`, every other site ID, arbitrary upstream paths, traversal forms, alternate hosts, and site-substitution query parameters are rejected.
- Browser site routes require exact `Origin: https://portal.army.idf`; health permits a missing Origin for server-local diagnostics.
- The real API key is injected only by HUB. Browser `X-API-Key`, `Authorization`, `Cookie`, identity, forwarding, host, and hop-by-hop headers are not forwarded.

## 1. Verify the ZIP before extraction

Copy the ZIP and its adjacent `.sha256` file to the server. In an elevated Windows PowerShell 5.1 session:

```powershell
$zip = 'C:\ApprovedTransfer\sitebuilder-hub-builder-api-pilot-gateway.zip'
$expected = ((Get-Content -LiteralPath "$zip.sha256" -Raw).Trim() -split '\s+')[0].ToLowerInvariant()
$actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $zip).Hash.ToLowerInvariant()
if ($actual -ne $expected) { throw "Gateway ZIP SHA-256 mismatch. Expected $expected, got $actual." }
```

Extract into a new empty staging directory, then verify the internal manifest:

```powershell
$stage = 'C:\ApprovedTransfer\sitebuilder-hub-builder-api-pilot-gateway'
Expand-Archive -LiteralPath $zip -DestinationPath $stage
Push-Location $stage
Get-Content .\SHA256SUMS.txt | ForEach-Object {
  if ($_ -notmatch '^([0-9a-f]{64})  (.+)$') { throw "Invalid SHA256SUMS row: $_" }
  $expectedFileHash = $Matches[1]
  $relativeFile = $Matches[2].Replace('/', '\')
  $actualFileHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $relativeFile).Hash.ToLowerInvariant()
  if ($actualFileHash -ne $expectedFileHash) { throw "Internal checksum mismatch: $relativeFile" }
}
Pop-Location
```

## 2. Resolve and confirm the actual deployed `dist` path

Do not guess or type a replacement path. The `siteBuilderHub` IIS site is authoritative:

```powershell
Import-Module WebAdministration
$hubSite = Get-Website -Name 'siteBuilderHub'
if (-not $hubSite) { throw 'IIS site siteBuilderHub was not found.' }
$hubDist = [System.IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables([string]$hubSite.PhysicalPath))
$hubPool = [string]$hubSite.ApplicationPool
"HUB dist path: $hubDist"
"HUB app pool:  $hubPool"
if (-not (Test-Path -LiteralPath (Join-Path $hubDist 'index.js') -PathType Leaf)) {
  throw "The IIS physical path is not the compiled HUB dist root: $hubDist"
}
if (-not (Test-Path -LiteralPath (Join-Path $hubDist 'app.js') -PathType Leaf)) {
  throw "Compiled app.js is missing from the confirmed HUB dist root: $hubDist"
}
```

The printed `$hubDist` is the exact current deployment directory for every later command. The patch layout mirrors that compiled `dist` root.

Resolve the `.env` exactly as the compiled server does when IIS uses the `dist` root as its working directory: `dist\.env` first, then its parent.

```powershell
$envCandidates = @(
  (Join-Path $hubDist '.env'),
  (Join-Path (Split-Path -Parent $hubDist) '.env')
)
$hubEnv = $envCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if (-not $hubEnv) { throw 'Existing HUB .env was not found beside dist or in its parent.' }
"HUB env path:  $hubEnv"
```

## 3. Back up before copying

```powershell
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupRoot = Join-Path (Split-Path -Parent $hubDist) "siteBuilderHub-gateway-backup-$stamp"
New-Item -ItemType Directory -Path $backupRoot -ErrorAction Stop | Out-Null
Copy-Item -LiteralPath $hubDist -Destination (Join-Path $backupRoot 'dist') -Recurse -Force
Copy-Item -LiteralPath $hubEnv -Destination (Join-Path $backupRoot 'hub.env.backup') -Force
"Backup root: $backupRoot"
```

Record `$hubDist`, `$hubPool`, `$hubEnv`, and `$backupRoot` in the change ticket.

## 4. Stop only HUB and copy the compiled backend patch

```powershell
Stop-WebAppPool -Name $hubPool
Stop-Website -Name 'siteBuilderHub'
$patchDist = Join-Path $stage 'backend-patch\dist'
Copy-Item -Path (Join-Path $patchDist '*') -Destination $hubDist -Recurse -Force
```

Do not stop or change Builder Data API, MongoDB, another IIS site, or an existing TXT site.

## 5. Add configuration with the Gateway disabled

Open the confirmed `$hubEnv`, remove any duplicate pilot-Gateway keys, and append the values from `ENV-PILOT-GATEWAY.example`. Keep:

```env
SITE_BUILDER_PILOT_GATEWAY_ENABLED=false
```

Set or preserve `SITE_BUILDER_BACKEND_API_KEY` only in the server `.env`. Do not paste its value into a ticket, terminal command, helper argument, frontend file, or log.

Start only HUB:

```powershell
Start-WebAppPool -Name $hubPool
Start-Website -Name 'siteBuilderHub'
```

Verify existing HUB behavior before enabling the pilot:

```powershell
(Invoke-WebRequest -UseBasicParsing 'https://sitebuilderhub.idf/api/health/live').StatusCode
(Invoke-WebRequest -UseBasicParsing 'https://sitebuilderhub.idf/').StatusCode
```

Both must return `200`. Confirm that the existing product-simplification frontend still loads unchanged. A request to `/builder-api/healthz` must not return the pilot health envelope while disabled.

## 6. Enable only the pilot Gateway

Change one line in `$hubEnv`:

```env
SITE_BUILDER_PILOT_GATEWAY_ENABLED=true
```

Recycle only HUB:

```powershell
Restart-WebAppPool -Name $hubPool
```

Verify the safe health envelope:

```powershell
$health = Invoke-RestMethod -Method Get -Uri 'https://sitebuilderhub.idf/builder-api/healthz'
if ($health.ok -ne $true -or $health.mode -ne 'pilot') { throw 'Pilot Gateway health failed.' }
```

Verify CORS without exposing a secret:

```powershell
$cors = Invoke-WebRequest -UseBasicParsing -Method Options `
  -Uri 'https://sitebuilderhub.idf/builder-api/api/sites/alphateam-mongo-pilot/legacy-object' `
  -Headers @{
    Origin = 'https://portal.army.idf'
    'Access-Control-Request-Method' = 'PUT'
    'Access-Control-Request-Headers' = 'content-type, if-match, x-request-id'
  }
if ($cors.StatusCode -ne 204) { throw 'Pilot Gateway CORS preflight failed.' }
if ($cors.Headers['Access-Control-Allow-Origin'] -ne 'https://portal.army.idf') { throw 'Unexpected CORS origin.' }
```

## 7. Create and seed the pilot locally on the server

The helper calls `http://127.0.0.1:3001` directly. It never calls the public Gateway. Supply the already deployed Builder Data API `.env` path, or set a process-scoped `ADMIN_API_KEY`/`SITE_BUILDER_BACKEND_API_KEY`.

Read-only dry run:

```powershell
node .\tools\pilot-bootstrap.cjs create --dry-run --env-file 'C:\EXACT\BUILDER-DATA-API\app\.env'
```

Creation:

```powershell
.\tools\CREATE-ALPHATEAM-MONGO-PILOT.cmd 'C:\EXACT\BUILDER-DATA-API\app\.env'
```

The tool displays:

```text
siteId: alphateam-mongo-pilot
displayName: Alpha Team Mongo Pilot
environment: test
```

It writes only after exact confirmation:

```text
CREATE_ALPHA_MONGO_PILOT
```

It creates the supported Builder registry record, lets Builder generate `safeCollectionName`, seeds all nine legacy-compatible objects, and verifies every read. If the registry already exists, it performs no writes and reports whether separate verification is required. It never accesses `alphateam`.

Final local verification:

```powershell
.\tools\VERIFY-ALPHATEAM-MONGO-PILOT.cmd 'C:\EXACT\BUILDER-DATA-API\app\.env'
```

## 8. Final frontend configuration (document only)

Build the separate SharePoint pilot frontend later using `FRONTEND-ALPHATEAM-MONGO-PILOT.env.example`. It intentionally contains no API key or other secret-bearing Vite variable.

## Rollback

1. Set `SITE_BUILDER_PILOT_GATEWAY_ENABLED=false` in the confirmed `$hubEnv`.
2. Run `Restart-WebAppPool -Name $hubPool`.
3. Verify `/api/health/live` and the existing HUB frontend.
4. If the backend patch itself must be removed, stop only `siteBuilderHub`/`$hubPool`, copy the backed-up `dist` contents from `$backupRoot\dist` back to `$hubDist`, restore `$backupRoot\hub.env.backup` to `$hubEnv`, then start only HUB.
5. Do not touch Builder Data API, MongoDB, `sitebuilder_site_data`, existing HUB Mongo records, SharePoint data, or any TXT site during Gateway rollback.

Disabling the Gateway is the normal rollback. Restoring backend files is only necessary if HUB fails independently after disablement.
