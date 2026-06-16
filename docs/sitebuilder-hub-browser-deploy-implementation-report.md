# Sitebuilder HUB Browser Deploy Implementation Report

Date: 2026-06-16

## Summary

The HUB now has a browser-side SharePoint deploy path for SharePoint-hosted mode.

The backend no longer needs to authenticate to SharePoint for this path. The backend still owns release metadata, artifact file access, audit logs, and deployment records. The browser owns SharePoint REST upload and read-back verification using the user's active SharePoint session.

## What Existed Before

- Release artifact validation existed in `server/src/services/deployArtifact.service.ts`.
- Deploy plans were generated from the release artifact and per-site resolved SharePoint paths.
- Deployment execution still used backend SharePoint upload:
  - `executeSharePointDeploy`
  - `getRequestDigest`
  - `uploadSharePointFile`
  - `readSharePointFileEvidence`
- Batch deploy execution still queued backend jobs through `enqueueBatchDeploy`.
- Backend SharePoint 401 blocked deploy readiness because Node did not inherit the browser SharePoint/SSO session.

## Why Backend Deploy Was Blocked

The classified SharePoint tests proved browser-side calls can get current user and Digest from target sites, including:

- `https://portal.army.idf/sites/alphateam/_api/contextinfo`
- `https://portal.army.idf/sites/schedule/_api/contextinfo`

The backend cannot use the browser session cookies/SSO state. Therefore backend SharePoint REST gets 401 while browser SharePoint REST succeeds.

## Browser Upload Architecture

Implemented in `client/src/utils/sharepointBrowserConnector.ts`:

- `getBrowserRequestDigest(targetSiteUrl)`
- `uploadFileToSharePointBrowser(options)`
- `readBackSharePointFileBrowser(options)`
- `deployArtifactToSharePointBrowser(options)`
- `buildSharePointFilesAddUrl(targetSiteUrl, targetPath)`

Upload pattern:

- Browser `fetch`
- `credentials: "include"`
- Digest requested from the target managed site itself
- Upload to:
  - `/_api/web/GetFolderByServerRelativeUrl('<targetFolder>')/Files/add(url='<fileName>',overwrite=true)`
- Send:
  - `X-RequestDigest`
- Read back the uploaded file from SharePoint
- Compare size and SHA-256 before marking the file verified

Digest cache remains per normalized target site URL. A Digest from `alphateam` is not reused for `schedule`.

## Artifact Manifest And File Endpoints

Added backend endpoints:

- `GET /api/releases/:id/artifact/manifest`
- `GET /api/releases/:id/artifact/file?path=<relativePath>`

Implementation:

- `getReleaseArtifactManifest`
- `getReleaseArtifactFile`

Safety behavior:

- Manifest paths must be safe relative paths.
- File endpoint validates the requested file is in the deploy manifest/inventory.
- File endpoint blocks `../` traversal.
- File endpoint uses `realpath` containment checks to block symlink/root escapes.
- File endpoint streams only artifact bytes and returns safe headers:
  - `Content-Type`
  - `Content-Length`
  - `X-Artifact-Sha256`
  - `X-Artifact-Size`

## Deployment Evidence Storage

Added endpoint:

- `POST /api/sites/:id/deployments/browser-evidence`

Implementation:

- `recordBrowserSharePointDeploymentEvidence`

Backend validates:

- site exists
- release exists
- connector mode is `browser-sharepoint`
- release artifact is ready
- successful evidence includes all deployable files
- successful evidence has verified size and SHA-256 matches

Site version updates only when:

- final status is success
- every deployable file has verified read-back evidence

Failed browser deploy evidence is still stored, but the site version is not advanced.

No backend job is created for browser deploy evidence, so owner-direct mode does not create pending approval jobs for this path.

## UI Changes

Updated `/releases` deploy center:

- Dry-run requests `connectorMode: "browser-sharepoint"`.
- Backend SharePoint 401 no longer globally blocks browser deploy readiness.
- Execute runs browser deploy sequentially per ready/warning site.
- Each site gets its own Digest and upload run.
- Each site records separate deployment evidence.
- One failed site does not mark every selected site failed.
- Archived sites remain excluded by default in the target selector.

Updated `/sites/:id` versions tab:

- Adds a browser deploy action.
- Opens `/releases?targetSiteId=<siteId>`.
- `/releases` initializes Deploy Center in single-site mode for that site.
- The actual deploy implementation remains the same browser deploy path, avoiding two different upload implementations.

Hebrew UI copy now distinguishes:

- browser deploy path
- backend SharePoint not required in browser mode
- artifact missing/invalid
- failed Digest/upload
- successful upload and read-back verification

## Files Changed

- `client/src/api/sitesApi.ts`
- `client/src/pages/SiteDetailsPage.tsx`
- `client/src/pages/ReleasesPage.tsx`
- `client/src/utils/deployMvp.ts`
- `client/src/utils/sharepointBrowserConnector.ts`
- `server/src/controllers/releases.controller.ts`
- `server/src/routes/releases.routes.ts`
- `server/src/routes/sites.routes.ts`
- `server/src/services/deployArtifact.service.ts`
- `server/src/services/releases.service.ts`
- `server/src/utils/errors.ts`
- `server/src/validators/release.schema.ts`
- `tests/browserDeployBackendEvidence.test.ts`
- `tests/deployMvpUiGate.test.ts`
- `tests/releaseBatchDeploy.test.ts`
- `tests/sharepointBrowserConnector.test.ts`

## Tests Added Or Updated

Covered:

- artifact manifest traversal rejection
- artifact file traversal rejection
- browser upload `Files/add` URL
- browser upload uses `credentials: "include"`
- browser upload sends `X-RequestDigest`
- upload uses Digest from the same target site
- multi-file browser deploy
- read-back verification
- failed file upload marks that file/site failed
- successful browser deploy records evidence
- site version updates only after verified success
- backend SharePoint write failure does not block browser-mode readiness
- deploy UI gate allows browser connector without backend write
- archived sites remain excluded by target selection/planning behavior

## Build And Test Results

- Focused tests passed:
  - `npx vitest run tests/sharepointBrowserConnector.test.ts tests/browserDeployBackendEvidence.test.ts tests/releaseBatchDeploy.test.ts tests/deployMvpUiGate.test.ts`
  - 26 tests passed
- Full tests passed:
  - `npm test`
  - 24 test files passed
  - 129 tests passed
- Build passed:
  - `npm run build`
  - Vite still reports the existing large chunk warning.

## Remaining Blockers

- Real SharePoint smoke test was not run from this local environment.
- Folder creation before upload is not implemented in the browser deploy helper. The target `dist` and nested folders must already exist, or SharePoint `Files/add` will fail for files under missing folders.
- Production deploy should still be limited to a safe dev/test site until browser upload is verified in the classified SharePoint-hosted environment.

## Dev/Test Deploy Readiness

Ready for one real dev/test deploy smoke from SharePoint-hosted HUB, provided:

- target site is safe dev/test
- target `dist` folder and expected nested folders exist
- selected release artifact is valid
- browser Digest succeeds for that target site
- operator confirms the release is safe for the target

Do not deploy to production until this smoke is complete.
