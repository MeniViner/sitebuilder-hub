# Sitebuilder HUB Digest Connector Audit And Fix Report

Generated: 2026-06-16

## Proven Browser Evidence

Manual DevTools tests from the SharePoint-hosted HUB page proved browser-side SharePoint auth and Digest are working:

- HUB host site: `https://portal.army.idf/sites/alphateam/_api/contextinfo`
  - HTTP 200
  - `Content-Type: application/json;odata=verbose;charset=utf-8`
  - `FormDigestValue` exists
  - Digest found: yes
- Managed target site: `https://portal.army.idf/sites/schedule/_api/contextinfo`
  - HTTP 200
  - `Content-Type: application/json;odata=verbose;charset=utf-8`
  - `FormDigestValue` exists
  - `WebFullUrl` points to `https://portal.army.idf/sites/schedule`
  - Digest found: yes

Conclusion: the browser is authenticated to SharePoint and can request Digest per target site under the same origin. The Node backend is not authenticated to SharePoint and must not be the primary SharePoint connector in SharePoint-hosted mode.

## Regular Site Builder Audit

Source project: `/Users/meni/dev/site-builder`

1. How regular Site Builder gets Digest:
   - `/Users/meni/dev/site-builder/src/utils/sharepointUtils.js`
     - `getRequestDigest(scope = "")`
     - `resolveApiSiteRoot(value)`
     - `buildSiteApiUrl(siteRoot, apiPath)`
     - `requestDigestCache`
   - It posts to `buildSiteApiUrl(siteRoot, "/_api/contextinfo")`, parses `data.d.GetContextWebInformation.FormDigestValue`, and caches per resolved `siteRoot`.

2. Is Digest requested from the browser:
   - Yes. `getRequestDigest` uses browser `fetch`.
   - Supporting browser REST helpers also use browser fetch:
     - `browserSharePointUtils.js` equivalent pattern is in `sharepointUtils.js`.
     - `/Users/meni/dev/site-builder/src/services/sharePointPermissionsSetup.ts`
       - `spFetchWithLogs(endpoint, options)` always calls `fetch(endpoint, { credentials: "include", ... })`.
       - `requestDigest(siteRoot, logs)` posts to `/_api/contextinfo`.

3. Does it use `credentials: "include"`:
   - Yes.
   - `sharepointUtils.js`
     - `getRequestDigest`
     - `readSharePointTextFile`
     - `ensureSharePointFolder`
     - `putTextFile`
     - `uploadImage`
   - `sharePointPermissionsSetup.ts`
     - `spFetchWithLogs`

4. Does it use backend Node for SharePoint REST:
   - No for in-app SharePoint REST/Digest/write operations.
   - The Node scripts use WebDAV/local filesystem paths for deployment/bootstrap:
     - `/Users/meni/dev/site-builder/deploy.js`
       - `runRobocopy(command, label)`
     - `/Users/meni/dev/site-builder/scripts/init-sharepoint-site.js`
       - `checkLibrary`
       - `ensureDir`
       - `ensureTextFile`
     - `/Users/meni/dev/site-builder/scripts/postbuild.js`
       - `writeDeployManifest`
       - `runNodeCommand`

5. How it sends `X-RequestDigest`:
   - `/Users/meni/dev/site-builder/src/utils/sharepointUtils.js`
     - `ensureSharePointFolder(folderServerRelativeUrl, digest, siteRoot)`
     - `uploadImage(file, categoryFolder)`
   - `/Users/meni/dev/site-builder/src/services/sharePointSiteCollectionAdminsService.ts`
     - `tryEnsureUser`
     - `setSiteAdminFlag`
   - `/Users/meni/dev/site-builder/src/services/sharePointPermissionsSetup.ts`
     - `breakFolderPermissionInheritance`
     - `addContributeRoleAssignment`
   - `/Users/meni/dev/site-builder/src/services/sharePointDocumentLibrariesSetup.ts`
     - `ensureSingleLibrary`
     - `ensureDocumentLibraryBrowserView`

6. How it uploads/writes files:
   - Text/data files:
     - `sharepointUtils.js`
       - `upsertSharePointTextFile`
       - `ensureSharePointTextFileExists`
       - `putTextFile`
       - `ensureSharePointFolderHierarchy`
     - `SharePointBootstrapService.js`
       - `ensureSharePointBootstrapFiles`
       - `overwriteSharePointBootstrapFiles`
   - Binary/image upload:
     - `sharepointUtils.js`
       - `uploadImage`
       - uses `/_api/web/GetFolderByServerRelativeUrl(...)/Files/add(...)`
   - Built `dist` deploy:
     - `deploy.js`
       - WebDAV/robocopy copy into target folder.

7. How it builds target SharePoint URLs:
   - `/Users/meni/dev/site-builder/src/config/sharepointPaths.js`
     - builds `siteRoot`, `siteDbRoot`, `usersDbRoot`, `siteAssetsRoot`, `siteApiRoot`, file server-relative paths.
   - `/Users/meni/dev/site-builder/src/utils/resolveCurrentSharePointWebUrl.js`
     - `resolveCurrentSharePointWebUrl`
     - order: `_spPageContextInfo.webAbsoluteUrl`, env API root, `SHAREPOINT_PATHS`, pathname fallback.
   - `/Users/meni/dev/site-builder/src/utils/sharepointUtils.js`
     - `resolveApiSiteRoot`
     - `buildSiteApiUrl`
     - `toSharePointAbsoluteUrl`

8. Does it get Digest from the specific target site:
   - Yes for the current Site Builder site. The digest cache key is the resolved `siteRoot`.
   - Regular Site Builder manages one current site, not many targets. The HUB must generalize this by using each managed site's `sharePointSiteUrl`.

9. Exact code pattern copied into HUB:
   - Build a target-site URL first.
   - POST `targetSiteUrl + "/_api/contextinfo"`.
   - Use browser `fetch` with `credentials: "include"`.
   - Parse verbose JSON `d.GetContextWebInformation.FormDigestValue`.
   - Cache Digest by target site URL only.
   - Use `X-RequestDigest` only for writes against the same target site.

## HUB Broken Flow Audit

The old HUB path was:

`Frontend -> HUB API -> Node backend -> SharePoint`

This fails in the classified SharePoint-hosted environment because the Node backend does not inherit the browser SharePoint/SSO session.

Current backend-based SharePoint paths found:

- Diagnostics:
  - `server/src/controllers/diagnostics.controller.ts`
    - `sharePointCheck`
  - `server/src/services/diagnostics.service.ts`
    - `runSharePointDiagnostics`
    - `probe`
    - `siteApiUrl`
    - calls backend `/_api/web/currentuser`, read test, and `/_api/contextinfo`
- Health:
  - `server/src/controllers/sites.controller.ts`
    - `readOnlySharePointHealthCheck`
  - `server/src/services/sharepointHealth.service.ts`
    - `runReadOnlySharePointHealthCheck`
    - `fetchReadOnly`
- Admin live read:
  - `server/src/controllers/admins.controller.ts`
    - `readLiveAdminsEndpoint`
  - `server/src/services/liveAdminSources.service.ts`
    - `readLiveAdminSources`
    - uses `readSharePointTextFile` and `readSharePointJsonApi`
- Backup/restore:
  - `server/src/services/realBackup.service.ts`
    - `executeSharePointBackup`
    - `executeSharePointRestore`
  - `server/src/services/backups.service.ts`
    - `enqueueSiteBackup`
    - `enqueueBackupRestore`
    - `verifyBackup`
    - `createRestorePlan`
- Deploy:
  - `server/src/controllers/releases.controller.ts`
    - `planSiteDeployVersion`
    - `deploySiteVersion`
    - `planBatchDeploy`
    - `deployBatch`
  - `server/src/services/deployArtifact.service.ts`
    - `buildSiteDeployPlan`
    - `readTargetDistInventory`
    - `executeSharePointDeploy`
- Restore/write/admin repair:
  - `server/src/services/admins.service.ts`
    - `executeAdminTxtRepair`
    - `addSiteAdmin`
    - `removeSiteAdmin`
  - `server/src/services/adminRepair.service.ts`
    - `executeTxtAdminRepair`
- Permissions setup:
  - `server/src/controllers/sites.controller.ts`
    - `queuePermissionsSetup`
  - `server/src/services/permissionsSetup.service.ts`
    - `buildPermissionsSetupPlan`
    - `executePermissionsSetup`
- Site creation/provisioning:
  - `server/src/services/siteBootstrap.service.ts`
    - `buildSiteBootstrapPlan`
    - `executeSiteBootstrap`
  - `server/src/services/siteProvisioning.service.ts`
    - `buildSiteProvisionPlan`
    - `executeSiteProvisioning`
- Shared backend client:
  - `server/src/services/sharepointOperationClient.ts`
    - `getSharePointOperationCapabilities`
    - `getSharePointReadHeaders`
    - `readSharePointTextFile`
    - `readSharePointJsonApi`
    - `listSharePointFolders`
    - `listSharePointFiles`
    - `getRequestDigest`
    - `postSharePointJsonApi`
    - `writeSharePointTextFile`
    - `uploadSharePointFile`
    - `ensureSharePointFolderHierarchy`
    - `ensureDocumentLibrary`
    - `ensureSharePointSiteCollection`

Root cause: backend 401 is caused by missing backend SharePoint auth material/session. It is not proof that the browser/user/site/target URL is invalid.

## Implementation Details

Added first-class browser connector:

- `client/src/utils/sharepointBrowserConnector.ts`
  - `buildContextInfoUrl`
  - `buildSharePointApiUrl`
  - `extractFormDigestValue`
  - `requestBrowserDigest`
  - `getBrowserRequestDigest`
  - `runBrowserSharePointDiagnostics`
  - `runBrowserSharePointHealthCheck`
  - `combineSharePointConnectorDiagnostics`

Behavior:

- Connector mode: `browser-sharepoint`
- Browser calls SharePoint directly.
- All browser SharePoint calls use `credentials: "include"`.
- Digest URL is built from the managed target site URL:
  - `https://portal.army.idf/sites/alphateam/_api/contextinfo`
  - `https://portal.army.idf/sites/schedule/_api/contextinfo`
- Digest cache key is the normalized target site URL.
- Digest is never reused across target sites.
- Diagnostics do not log cookies, bearer tokens, or full Digest values.

Backend connector remains optional and separate:

- Connector mode: `backend-sharepoint`
- `server/src/services/diagnostics.service.ts`
  - reports cookie configured yes/no
  - reports cookie names only, no values
  - reports bearer configured yes/no
  - backend 401 is backend connector evidence only

## Diagnostics Separation

Updated:

- `client/src/pages/DiagnosticsPage.tsx`
  - runs browser diagnostics first
  - runs backend diagnostics separately
  - renders separate sections:
    - `Browser SharePoint Connector`
    - `Backend SharePoint Connector`
  - if browser Digest works and backend returns 401, shows:
    - `הדפדפן מחובר ל־SharePoint ומצליח לקבל Digest. השרת המקומי לא מחובר ל־SharePoint. במצב SharePoint-hosted המערכת תשתמש בחיבור דרך הדפדפן.`
  - button `בדוק SharePoint עכשיו` logs a safe grouped console block:
    - selected site id/code
    - target SharePoint URL
    - connector mode
    - browser currentuser URL/status
    - browser contextinfo URL/status
    - Digest found yes/no
    - Digest preview first 10 chars only
    - backend diagnostics status
    - API base URL
    - frontend origin
    - personal number exists yes/no
    - per-test result object

## Health Changes

Updated:

- `client/src/pages/HealthPage.tsx`
  - main read-only check now uses `runBrowserSharePointHealthCheck`
  - result is labeled `Browser SharePoint`
  - evidence uses browser `credentials: "include"`
  - backend route is not used as the main SharePoint health source in SharePoint-hosted mode
- `server/src/services/sharepointHealth.service.ts`
  - added `recordBrowserSharePointHealthCheck`
  - persists browser evidence without calling SharePoint from Node
- `server/src/controllers/sites.controller.ts`
  - added `browserSharePointHealthCheckEvidence`
- `server/src/routes/sites.routes.ts`
  - added `POST /api/sites/:id/health-check/browser-sharepoint`

## Deploy Implications

Browser read/Digest is implemented now.

Browser upload/deploy is not implemented yet. Deploy execution still uses the backend uploader:

- `server/src/services/deployArtifact.service.ts`
  - `executeSharePointDeploy`
  - `uploadSharePointFile`

Corrected readiness/copy:

- `client/src/utils/deployMvp.ts`
- `client/src/pages/ReleasesPage.tsx`
- `server/src/services/deployArtifact.service.ts`

The UI/report now states that browser Digest may be healthy, but browser upload is not implemented. Deploy is not faked as successful when backend SharePoint write is 401/unavailable.

## Manual Auth/Header Fixes Preserved

Preserved and covered:

- No `x-sharepoint-title` is sent.
- Hebrew SharePoint display title is not placed in raw HTTP headers.
- Personal number extraction:
  - `i:0#.w|army\s8856096` -> `s8856096`
  - `s8856096@army.idf.il` -> `s8856096`
- Extracted personal number is stored in localStorage.
- Extracted personal number is used as fallback for `x-personal-number`.
- Status bar may show personal number instead of Hebrew display name.
- Backend personal-number auth accepts bare digits and `s`-prefixed values.

Files:

- `client/src/api/sitesApi.ts`
- `client/src/utils/personalNumber.ts`
- `client/src/components/SystemStatusBar.tsx`
- `server/src/middlewares/auth.ts`
- `server/src/services/personal-auth.service.ts`
- `tests/sharepointFrontendAuthFixes.test.ts`

## Files Changed For This Fix

Primary connector/diagnostics/health/deploy files:

- `client/src/utils/sharepointBrowserConnector.ts`
- `client/src/utils/personalNumber.ts`
- `client/src/utils/sitebuilderPaths.ts`
- `client/src/api/sitesApi.ts`
- `client/src/App.tsx`
- `client/src/pages/DiagnosticsPage.tsx`
- `client/src/pages/HealthPage.tsx`
- `client/src/pages/ReleasesPage.tsx`
- `client/src/utils/deployMvp.ts`
- `server/src/services/diagnostics.service.ts`
- `server/src/services/sharepointHealth.service.ts`
- `server/src/controllers/sites.controller.ts`
- `server/src/routes/sites.routes.ts`
- `server/src/middlewares/auth.ts`
- `server/src/services/deployArtifact.service.ts`
- `tests/sharepointBrowserConnector.test.ts`
- `tests/sharepointFrontendAuthFixes.test.ts`
- `docs/sitebuilder-hub-digest-connector-audit-and-fix-report.md`

The worktree also contains many pre-existing unrelated local edits. They were not reverted.

## Tests Added

- `tests/sharepointBrowserConnector.test.ts`
  - browser connector builds `/_api/contextinfo` URL correctly
  - browser connector uses `credentials: "include"`
  - browser connector extracts `FormDigestValue` from SharePoint verbose JSON
  - browser connector supports multiple target sites
  - each target site gets its own Digest URL/cache key
  - backend 401 does not override browser connector success
  - health check uses browser connector results
  - deploy/write readiness remains blocked until real browser upload exists or backend write works
- `tests/sharepointFrontendAuthFixes.test.ts`
  - no raw Hebrew title header
  - no `x-sharepoint-title`
  - personal-number extraction and storage
  - `x-personal-number` fallback
  - backend personal-number normalization
  - safe diagnostics grouped logs

## Verification

- `npm test`
  - passed
  - 23 test files
  - 119 tests
- `npm run build`
  - passed
  - server TypeScript build passed
  - client TypeScript + Vite build passed
  - Vite warning remains: one JS chunk is larger than 500 kB

## Remaining Blockers

- Browser upload/deploy is not implemented yet.
- Backend deploy/backup/restore/permissions/site-bootstrap flows still use `backend-sharepoint`.
- A real dev-site deploy should wait until either:
  - browser upload is implemented and verified with `X-RequestDigest`, or
  - backend SharePoint auth material is configured and backend Digest succeeds.

## Readiness

- Ready for real SharePoint-hosted browser diagnostics on `alphateam`: yes.
- Ready for real SharePoint-hosted browser diagnostics on `schedule`: yes.
- Ready for browser read-only health checks: yes.
- Ready for one real deploy test through browser upload: no, upload path still not implemented.
