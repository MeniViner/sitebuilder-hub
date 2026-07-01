# Sitebuilder HUB SharePoint Operation Connector Audit

Updated: 2026-06-17

## Rule

In SharePoint-hosted browser-session mode, user-session SharePoint access belongs in the browser connector. Backend/job-worker SharePoint operations are allowed only when they are explicitly backend-service-auth operations and backend service auth is configured.

The implementation now has a central policy in `server/src/services/sharepointOperationPolicy.service.ts`.

## Inventory

| Operation | UI Entry Point | Backend Route | Controller | Service | Job Type | Reads SP | Writes SP | Digest | Before | After | Browser | Backend Only | Failure Before Fix | Tests |
|---|---|---|---|---|---|---:|---:|---:|---|---|---:|---:|---|---|
| Browser health check | Health / Site details | `POST /api/sites/:id/health-check/browser-sharepoint` | `browserSharePointHealthCheckEvidence` | `recordBrowserSharePointHealthCheck` | `health-check` | yes | no | no | browser evidence | browser-supported | yes | no | none | existing browser health tests |
| Backend health check | Health schedule / legacy endpoint | `POST /api/sites/:id/health-check/sharepoint-readonly` | `readOnlySharePointHealthCheck` | `runReadOnlySharePointHealthCheck` | `health-check` | yes | no | no | backend read | backend-service-auth-required | no | yes | backend 401/403 possible | worker/scheduler tests |
| User backup | Backups / Site details | `POST /api/sites/:id/backups`, `POST /api/sites/:id/backups/browser-evidence` | `runSiteBackup`, `recordBrowserBackupEvidence` | `enqueueSiteBackup`, `recordBrowserSharePointBackupEvidence` | `backup` | yes | yes | yes | backend worker digest possible | browser-supported, browser-required job | yes | no | `sharepoint-digest-failed:401` | `browserRequiredBackupQueue`, `browserBackupEvidence` |
| Scheduled backup | Backups schedule | maintenance scheduler | `queueScheduledBackup` | `enqueueSiteBackup`, `executeSharePointBackup` | `backup` | yes | yes | yes | backend worker digest | backend-service-auth-required or blocked | no | yes | backend digest 401 | `browserRequiredBackupQueue`, `maintenanceScheduler` |
| Restore | Backups restore | `POST /api/backups/:id/restore` | `postRestoreBackup` | `enqueueBackupRestore`, `executeSharePointRestore` | `restore` | yes | yes | yes | backend worker digest | safely blocked by default; explicit backend only | partial | explicit only | backend digest 401 | `browserRequiredBackupQueue`, updated restore tests |
| Admin live read | Admins page | browser utility, legacy API blocked | `readLiveAdminsEndpoint` blocked | `readSharePointAdminsFromBrowser` client utility | `admin-sync` | yes | no | no | backend read | browser-supported in UI | yes | no | backend read 401/403 | Admins UI wiring/build |
| Admin sync persist | Admins page Sync | `POST /api/sites/:id/admins/sync` | `syncAdmins` | `enqueueAdminSync` | `admin-sync` | yes | no | no | backend read job | not-implemented; blocked by default | partial | no | backend read 401/403 | `adminRepairApproval` |
| Admin TXT repair | Admins TXT repair | `POST /api/sites/:id/admins/repair-txt` | `queueTxtAdminRepair` | `enqueueAdminTxtRepair`, `executeAdminTxtRepair` | `repair` | yes | yes | yes | backend digest write | not-implemented; blocked by default | partial | no | backend digest 401 | `adminRepairApproval` |
| Admin membership writes | Admins add/remove SC/Owners | `POST/DELETE /api/sites/:id/admins` | `addAdmin`, `deleteAdmin` | `addSiteAdmin`, `removeSiteAdmin` | none | yes | yes | yes | backend digest write | backend-service-auth-required blocker by default | partial | yes | backend digest 401 | `adminRepairApproval` |
| Permissions setup | Site details / create site | `POST /api/sites/:id/permissions/setup` | `queuePermissionsSetup` | `executePermissionsSetup` | `permissions-setup` | yes | yes | yes | backend worker digest | not-implemented; blocked by default | partial | explicit only | backend digest 401 | build coverage |
| Site bootstrap | Site details / create site | `POST /api/sites/:id/bootstrap` | `queueSiteBootstrap` | `executeSiteBootstrap` | `site-bootstrap` | yes | yes | yes | backend worker digest/site creation | backend-service-auth-required unless explicitly confirmed | no | yes | backend digest 401 | build coverage |
| Site provision | Site details / create site | `POST /api/sites/:id/provision` | `queueSiteProvision` | `executeSiteProvisioning` | `site-provision` | yes | yes | yes | backend worker digest | not-implemented; blocked by default | partial | explicit only | backend digest 401 | build coverage |
| Deploy/upload | Releases | browser evidence endpoint | `recordBrowserDeploymentEvidence` | `recordBrowserSharePointDeploymentEvidence` | `deploy` | yes | yes | yes | browser deploy already implemented | browser-supported | yes | no | backend deploy still service-auth only | existing browser deploy tests |

## Policy And Job Architecture

Added job statuses:

- `browser-required` -> `ממתין להרצה דרך הדפדפן`
- `browser-in-progress` -> `רץ דרך הדפדפן`
- `blocked-service-auth-required` -> `דורש הרשאת שרת`

Added job fields:

- `executionMode`
- `connectorMode`
- `operationPolicy`
- `connectorStatusLabel`
- `connectorBlocker`

The worker claim query now skips:

- `executionMode` in `browser-required`, `browser-in-progress`, `blocked-service-auth-required`
- `payload.connectorMode=browser-sharepoint`
- `payload.executionMode=browser-required`

## Backup Fix

User-triggered backups now:

1. Create a backend job/operation plan with `connectorMode=browser-sharepoint`.
2. Store the job as `browser-required`, not `queued`.
3. Execute SharePoint digest/read/upload/read-back in the browser through `client/src/utils/sharepointBrowserOperationRunner.ts`.
4. Post browser evidence with `jobId`.
5. Finalize the job as succeeded/failed based on evidence.
6. Store `SiteBackup` and site backup metadata without backend SharePoint digest.

Scheduled backups now require backend service auth. If backend service auth is not ready, they create a `blocked-service-auth-required` job and do not attempt digest.

## Restore/Admin/Permissions/Provision Status

Restore is blocked by default with:

`שחזור דורש הרשאת שרת ל־SharePoint או מימוש שחזור דרך הדפדפן.`

Admin sync persist, TXT repair, permissions setup, and site provision are blocked by default with:

`הפעולה הזאת עדיין לא הוסבה לחיבור דרך הדפדפן.`

Site bootstrap and SharePoint admin membership writes are marked backend-service-auth-required with:

`הפעולה הזאת עדיין רצה דרך השרת ולכן דורשת הרשאת שרת ל־SharePoint.`

## UI Language

Jobs now show browser-required jobs as:

`ממתין להרצה דרך הדפדפן`

Backups UI says backend SharePoint 401 does not block browser backup. Restore UI says restore is not converted and is blocked by default. Scheduled backups are labeled as requiring server SharePoint auth.

## Browser Operation Runner

Added `client/src/utils/sharepointBrowserOperationRunner.ts`.

It supports:

- digest per target site
- read file
- write text file
- upload binary file
- ensure folder hierarchy
- read-back verify
- per-step evidence
- browser-backed backup execution from a backend operation plan

## Test And Build Results

`npm test`: passed, 34 files / 158 tests.

`npm run build`: passed for server and client.

Classified SharePoint smoke was not run in this workspace.

## Remaining Blockers

- Browser restore execution is not implemented yet.
- Browser admin TXT repair writeback is not implemented yet.
- Browser permissions setup/provisioning are not implemented yet.
- Scheduled unattended SharePoint operations need real backend service auth.
- Site collection creation/bootstrap remains backend-service-auth-only.
# Legacy Historical Report

This document captures an older connector audit from before the browser-only migration was completed. The current source of truth is `docs/sharepoint-browser-only-status-report.md`: SharePoint is not executed from the server.
