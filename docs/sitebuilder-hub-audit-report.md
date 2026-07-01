# Sitebuilder HUB Audit Report

Audit date: 2026-06-10  
Workspace audited: `/Users/meni/dev/sitebuilder-hub`  
Scope: this report audits the HUB only. The regular Site Builder application is treated only as an external integration dependency.

## 1. Executive Summary

The current sitebuilder HUB is a substantial partial MVP, not an empty mock and not production-ready. It has a real React admin UI, an Express/Mongoose backend, Mongo-backed models for sites, releases, jobs, backups, deployments, admin snapshots, monitoring alerts, and audit logs, plus many SharePoint REST integration services. However, the real operational value is uneven:

- Site registry CRUD is real, but site discovery and live metadata sync are missing.
- Health checks are partly real SharePoint read-only probes, but they do not cover full Builder runtime health, DB health, job health, version health, or history.
- Version status is mostly Mongo/release-registry metadata, not live version detection from each Builder site.
- Deploy, rollback, backup, restore, provision, permissions, and admin repair have serious backend code paths, but they are gated by env flags, SharePoint auth material, approvals, and backup-safety rules, and I could not verify them end-to-end locally.
- The UI often presents advanced operations as if the HUB is an already-connected control plane, while the underlying data is cached, metadata-only, manually registered, or conditional on external SharePoint configuration.
- Auth/RBAC exists, but it is not a real HUB user model. Personal-number auth is hardcoded/bootstrap/site-admin based and grants `admin` broadly.
- Local verification is currently blocked in this checkout because dependencies are not installed: `npm test` cannot find `vitest`, and `npm run build` cannot find `tsc`.

Bluntly: the project is overbuilt around high-risk operations before the simplest reliable HUB loop exists: register a site, prove connectivity, pull canonical live site metadata, show current health/version/admin/backup state, and make the UI clearly distinguish live facts from Hub metadata.

## 2. What This Project Is Supposed To Be

The HUB should be the central management layer above multiple existing Site Builder installations. Its job is not to contain Builder features like annotations, widgets, Gantt, Library, TXT-to-Mongo migration, or regular Builder UI. Its job is to manage many Builder sites from one place:

- Discover or register Builder sites.
- Pull live metadata and operational state from each site.
- Compare versions and detect outdated installations.
- Manage users, owners, admins, and permissions across sites.
- Manage backups and restore plans.
- Run health checks and show broken/disconnected sites.
- Track jobs, logs, deployments, and update status.
- Coordinate safe software updates and rollbacks.
- Provide a clear admin dashboard that says what is live, cached, missing, blocked, or unsafe.

The current codebase partially implements the control plane, but it does not yet have a reliable per-site integration contract with the regular Builder sites.

## 3. Current Architecture

### Frontend

- Framework: React 18, Vite, TypeScript.
- Routing: `react-router-dom` in `client/src/App.tsx`.
- API client: `client/src/api/sitesApi.ts`.
- UI language/layout: mostly Hebrew RTL admin console.
- Local auth token: personal number stored in browser `localStorage` under `sitebuilderHubPersonalNumber` and sent as `x-personal-number`.

Main frontend routes in `client/src/App.tsx`:

- `/` -> `DashboardPage`
- `/sites` -> `SitesPage`
- `/sites/:id` -> `SiteDetailsPage`
- `/releases` -> `ReleasesPage`
- `/backups` -> `BackupsPage`
- `/admins` -> `AdminsPage`
- `/jobs` -> `JobsPage`
- `/monitoring` -> `MonitoringPage`
- `/audit` -> `AuditPage`
- `/health` -> `HealthPage`
- `/settings` -> `SettingsPage`

### Backend

- Framework: Express with TypeScript.
- Entry: `server/src/index.ts`.
- App setup/routes: `server/src/app.ts`.
- Validation: Zod validators in `server/src/validators`.
- Persistence: Mongoose models in `server/src/models`.
- Worker: Mongo-polling job worker in `server/src/services/jobs.worker.ts`.

Backend route mounts in `server/src/app.ts`:

- Public health routes: `/api/health/live`, `/api/health/ready`, `/api/health`
- Auth middleware after public health routes
- `/api/auth`
- `/api/sites`
- `/api/releases`
- `/api/backups`
- `/api/version`
- `/api/jobs`
- `/api/monitoring`
- `/api/audit`
- `/api/operations`

### Database/storage

- Database: MongoDB via Mongoose.
- DB connection: `server/src/db/mongo.ts`.
- Main models:
  - `Site`
  - `Release`
  - `Job`
  - `SiteBackup`
  - `SiteVersionDeployment`
  - `SiteAdminSnapshot`
  - `MonitoringAlert`
  - `AuditLog`
- Backup storage target: SharePoint folder paths derived from the site, not a separate object store.
- Release artifact storage: local filesystem path referenced by `Release.artifactRef`.

### Authentication and authorization

Implemented in:

- `server/src/middlewares/auth.ts`
- `server/src/services/personal-auth.service.ts`

Modes:

- `AUTH_ENABLED=false`: every protected request becomes `Local Developer` with `admin` role.
- `AUTH_ENABLED=true`:
  - `x-personal-number` is accepted if it matches hardcoded numbers, bootstrap env numbers, or owner/admin personal numbers stored on non-archived Site records.
  - `x-api-key` is accepted if it matches `API_KEY`; role is taken from headers and defaults to `operator`.
  - `requireRole("viewer" | "operator" | "admin")` guards endpoints.

Important limitation: there is no real HUB user table, no session model, no per-site scoped RBAC, and no auditably managed user lifecycle.

### Environment variables

Defined in `.env.example` and parsed in `server/src/config/env.ts`:

- Server/runtime: `SERVER_PORT`, `MONGO_URI`, `CLIENT_ORIGIN`
- Auth: `AUTH_ENABLED`, `API_KEY`, `BOOTSTRAP_ADMIN_PERSONAL_NUMBERS`
- Rate limiting: `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`
- Jobs: `JOB_WORKER_ENABLED`, `JOB_WORKER_POLL_MS`, `JOB_APPROVAL_TTL_HOURS`
- Scheduler: `MAINTENANCE_SCHEDULER_ENABLED`, `MAINTENANCE_SCHEDULER_POLL_MS`, `MAINTENANCE_SCHEDULER_MAX_SITES_PER_TICK`
- Monitoring: `MONITORING_STALE_BACKUP_HOURS`
- SharePoint write/auth: `SHAREPOINT_WRITE_ENABLED`, `SHAREPOINT_ALLOW_UNAUTHENTICATED_WRITE`, `SHAREPOINT_AUTH_COOKIE`, `SHAREPOINT_BEARER_TOKEN`, `SHAREPOINT_REQUEST_TIMEOUT_MS`, `SHAREPOINT_SITE_CREATE_POLL_ATTEMPTS`, `SHAREPOINT_SITE_CREATE_POLL_INTERVAL_MS`
- Version/logging: `APP_VERSION`, server `LOG_*`, client `VITE_LOG_*`
- Client API base: `VITE_API_BASE_URL` in `client/src/api/sitesApi.ts`

### Integrations

Real or partial:

- MongoDB: required for backend startup and all persistent state.
- SharePoint REST: real read/write service code exists in `server/src/services/sharepointOperationClient.ts`.
- SharePoint health probing: `server/src/services/sharepointHealth.service.ts`.
- SharePoint admin sources: `server/src/services/liveAdminSources.service.ts`.
- SharePoint backup/restore: `server/src/services/backupPlan.service.ts`, `server/src/services/realBackup.service.ts`.
- SharePoint deploy/provision/permissions/bootstrap: multiple services and job handlers.

Missing:

- Git/GitHub integration for versions/releases.
- CI/build pipeline integration.
- A per-Builder-site API contract.
- Central secret store/credential manager.
- External log aggregation.
- External backup storage.

### Background tasks

- Job worker starts in `server/src/index.ts` with `startJobsWorker()`.
- Maintenance scheduler starts in `server/src/index.ts` with `startMaintenanceScheduler()`.
- Job worker handles: `version-upgrade`, `version-rollback`, `deploy`, `backup`, `restore`, `site-bootstrap`, `site-provision`, `permissions-setup`, `admin-sync`, `repair`, `health-check`.
- Maintenance scheduler queues due backup and health-check jobs from each `Site.maintenanceSchedule`.

There is no dedicated queue system. Jobs are Mongo documents claimed by a polling worker.

## 4. Project Structure Map

Important folders:

| Path | Purpose | Notes |
| --- | --- | --- |
| `client/src` | React frontend | Pages, components, API client, logger. |
| `client/src/pages` | HUB screens | Dashboard, sites, details, releases, backups, admins, jobs, monitoring, audit, health, settings. |
| `client/src/api/sitesApi.ts` | Frontend API wrapper | Sends personal number header, contains many typed API calls. |
| `server/src` | Express backend | App, routes, controllers, services, models, validators. |
| `server/src/routes` | API route definitions | Main HUB route surface. |
| `server/src/controllers` | Request handlers | Converts HTTP to service calls and audit logs. |
| `server/src/services` | Core HUB logic | SharePoint, releases, backups, jobs, monitoring, admins, audit, operations. |
| `server/src/models` | Mongoose models | Main persistent HUB data model. |
| `server/src/config/env.ts` | Env parsing | Zod defaults and validation. |
| `server/src/scripts/seed.ts` | Seed script | Requires Mongo and dependencies. |
| `tests` | Vitest service tests | Mostly service-level tests with mocks. |
| `mds` | Existing notes/reports | Prior documentation, not production code. |
| `scripts` | Utility scripts | Includes PowerShell closed-network bundle checks. |

## 5. Feature Status Matrix

| Feature | Status | Real/Mock/UI-only | Evidence | Notes |
| --- | --- | --- | --- | --- |
| Dashboard | PARTIALLY WORKING | Real Hub API data, mostly cached/metadata | `client/src/pages/DashboardPage.tsx`, `sitesApi.list()`, `sitesApi.jobs()`, `sitesApi.versionStatus()`, `sitesApi.operationCapabilities()` | Does not pull live state from every Builder site. |
| Site registry CRUD | PARTIALLY WORKING | Real Mongo CRUD | `server/src/services/sites.service.ts`, `server/src/routes/sites.routes.ts` | Manual registry only; no discovery/import/live validation on create. |
| Site connection validation | PARTIALLY WORKING | Real SharePoint read-only health check, manual | `runReadOnlySharePointHealthCheck()` | Checks expected SharePoint paths, not full Builder runtime. |
| Health checks | PARTIALLY WORKING | Real SharePoint GET probes, cached in Mongo | `server/src/services/sharepointHealth.service.ts` | No historical health collection; read capability is optimistic. |
| Version status | PARTIALLY WORKING | Real release registry, metadata comparison | `buildVersionStatus()` | Does not ask sites what version they are actually running. |
| Release creation | PARTIALLY WORKING | Real Mongo record | `server/src/services/releases.service.ts`, `server/src/models/Release.ts` | Can create release with empty/missing artifact path, making deploy unusable. |
| Deploy/update | PARTIALLY WORKING / UNKNOWN externally | Real SharePoint upload code path, not locally verified | `executeSharePointDeploy()` | Requires local artifact, SharePoint write, digest, approval, and recent verified backup. |
| Rollback | PARTIALLY WORKING / UNKNOWN externally | Real job/plan code, not locally verified | `buildRollbackSitePlan()`, `enqueueRollbackSite()` | Rollback means deploying an older release artifact, not platform rollback. |
| Backups | PARTIALLY WORKING / UNKNOWN externally | Real SharePoint file-copy code, but limited | `buildReadOnlyBackupPlan()`, `executeSharePointBackup()` | Backup sources are canonical TXT files, not full site/app/permissions state. |
| Restore | PARTIALLY WORKING / UNKNOWN externally | Real SharePoint restore code path, heavily gated | `executeSharePointRestore()` | Dangerous and protected; requires distinct current-state backup. |
| Admin/user management | PARTIALLY WORKING | Mixed Mongo metadata and SharePoint reads/writes | `admins.service.ts`, `liveAdminSources.service.ts`, `AdminsPage.tsx` | No central user model; site admins become HUB admins. |
| Permissions setup | PARTIALLY WORKING / UNKNOWN externally | Real SharePoint REST writes | `permissionsSetup.service.ts`, job worker | Not verified against real SharePoint. |
| Site bootstrap/provision | PARTIALLY WORKING / UNKNOWN externally | Real SharePoint REST writes | `siteBootstrap.service.ts`, `siteProvisioning.service.ts` | Can create/ensure structure; does not deploy an app by itself. |
| Jobs | PARTIALLY WORKING | Real Mongo job lifecycle | `Job` model, `jobs.service.ts`, `jobs.worker.ts` | No true retry implementation despite retry states/fields. |
| Audit log | PARTIALLY WORKING | Real Mongo audit rows | `audit.service.ts`, controllers | Coverage exists for many actions; site details fetches global recent rows then client-filters. |
| Monitoring | PARTIALLY WORKING | Derived alerts from Hub DB | `monitoring.service.ts` | Not live monitoring; refresh is manual/API-driven, no external metrics. |
| Auth/RBAC | MOCKED/HARDCODED + PARTIALLY WORKING | Dev bypass, API key, hardcoded/bootstrap PNs | `auth.ts`, `personal-auth.service.ts` | Not a production identity model. |
| Settings/config UI | PARTIALLY WORKING | Real capability/env display | `SettingsPage.tsx`, `operations.service.ts` | Mostly status display; does not configure env or credentials. |
| Tests | BROKEN locally | Test files exist; cannot run in current checkout | `tests/*.test.ts`, `npm test` output | Missing installed dependencies. |
| Local dev | BROKEN in current checkout | Requires install and Mongo | `README.md`, command results | `vitest` and `tsc` unavailable; no `node_modules` found. |

## 6. Existing Features - Detailed Findings

### 6.1 Dashboard

Status: PARTIALLY WORKING.

Files:

- `client/src/pages/DashboardPage.tsx`
- `client/src/api/sitesApi.ts`
- `server/src/services/sites.service.ts`
- `server/src/services/releases.service.ts`
- `server/src/services/operations.service.ts`

What exists:

- KPI cards for site counts, outdated sites, health unknown, jobs, backup/SharePoint capabilities.
- Recent jobs and site list previews.
- Capability badges for Mongo registry, SharePoint read, and SharePoint write.

Data path:

- UI calls `sitesApi.list()`, `sitesApi.jobs()`, `sitesApi.versionStatus()`, and `sitesApi.operationCapabilities()`.
- Backend reads Hub Mongo data and computed capability flags.

Real vs fake:

- Not fake sample data.
- But the dashboard is mostly showing Hub registry/cache state, not live facts from every Builder site.
- `versionStatus` is derived from `Site.currentVersion || Site.version` and latest `Release`, not live site inspection.
- `operationCapabilities.sharePoint.readAvailable` is always `true` in code, so the SharePoint read badge does not prove real connectivity.

Risk:

- Users can read "healthy", "outdated", "connected", or "not checked" as operational truth when it is often cached Hub metadata.

### 6.2 Site registry / site management

Status: PARTIALLY WORKING.

Files:

- Frontend: `client/src/pages/SitesPage.tsx`, `client/src/pages/SiteDetailsPage.tsx`, `client/src/components/SiteFormModal.tsx`
- Backend: `server/src/routes/sites.routes.ts`, `server/src/controllers/sites.controller.ts`, `server/src/services/sites.service.ts`
- Model: `server/src/models/Site.ts`

Endpoints:

- `GET /api/sites`
- `GET /api/sites/:id`
- `POST /api/sites`
- `PATCH /api/sites/:id`
- `DELETE /api/sites/:id`

What works by code:

- Sites are stored in Mongo.
- CRUD is implemented with Mongoose.
- Soft archive exists via `archiveOrDeleteSite()`.
- Hard delete exists if `force=true` is used.
- Site model includes `siteCode`, display name, SharePoint URLs, libraries, owners, status, version fields, health fields, admin arrays, backup fields, and maintenance schedule.

What is missing:

- No auto-discovery of existing Builder sites.
- No import from SharePoint tenant/site collection inventory.
- No live Builder metadata pull during registration.
- No required connection test before saving.
- No clear `SiteEnvironment` model beyond a simple environment/status-style field.
- No canonical stable external site ID contract from Builder.

### 6.3 Health checks

Status: PARTIALLY WORKING.

Files:

- `server/src/services/sharepointHealth.service.ts`
- `server/src/utils/health.ts`
- `client/src/pages/HealthPage.tsx`
- `client/src/pages/SiteDetailsPage.tsx`

Endpoints:

- `POST /api/sites/:id/health-check/manual`
- `POST /api/sites/:id/health-check/sharepoint-readonly`
- Public backend liveness/readiness routes under `/api/health`

What exists:

- `runReadOnlySharePointHealthCheck()` resolves expected Site Builder SharePoint paths.
- It probes:
  - `siteDB` document library
  - `siteUsersDb` document library
  - final `dist` folder
  - final `index.html`
  - final `assets` folder
  - permissions marker file
  - canonical TXT files
- It saves current health fields and `lastHealthCheckAt` on the `Site`.

Limitations:

- It does not check a Builder backend API because no such contract exists.
- It does not check Builder Mongo state, app runtime errors, job health, authenticated user flows, version endpoint, or logs.
- No historical health model exists; only current health on `Site` plus jobs/audit evidence.
- SharePoint auth failures can leave values unknown rather than false, which is correct, but makes UI interpretation hard.

### 6.4 Version management

Status: PARTIALLY WORKING.

Files:

- `client/src/pages/ReleasesPage.tsx`
- `server/src/routes/version.routes.ts`
- `server/src/routes/releases.routes.ts`
- `server/src/services/releases.service.ts`
- `server/src/models/Release.ts`
- `server/src/models/SiteVersionDeployment.ts`

Endpoints:

- `GET /api/version/status`
- `POST /api/version/next`
- `GET /api/releases`
- `POST /api/releases`
- `GET /api/releases/:id/artifact/validate`

What exists:

- Release registry stored in Mongo.
- Semver comparison helpers.
- Latest release detection.
- Per-site outdated calculation.
- Artifact validation for local artifact references.

What is not real enough:

- The HUB does not query each Builder site for its live running version.
- No Git/GitHub, package version, build SHA, release tag, or CI artifact metadata integration.
- `buildVersionStatus()` reads all `Site` rows and compares stored fields; this can be stale or manually wrong.
- Release artifacts are local filesystem references from the server context, which is fragile for a real deployment system.

### 6.5 Software updates / deployment control

Status: PARTIALLY WORKING / UNKNOWN externally.

Files:

- `client/src/pages/ReleasesPage.tsx`
- `server/src/services/releases.service.ts`
- `server/src/services/deployArtifact.service.ts`
- `server/src/services/jobs.worker.ts`
- `server/src/services/writeSafety.service.ts`

Endpoints:

- `POST /api/releases/:id/deploy-all`
- `POST /api/sites/:id/deploy-version/plan`
- `POST /api/sites/:id/deploy-version`
- `POST /api/sites/:id/rollback-version/plan`
- `POST /api/sites/:id/rollback-version`
- `GET /api/sites/:id/deployments`

What exists:

- Dry-run style deploy plan.
- Local artifact validation.
- SharePoint upload of artifact files.
- Read-back verification by size/hash.
- Post-deploy health check.
- Job approval gates.
- Recent verified backup requirement before dangerous writes.
- Rollback by deploying an older release artifact.

What is missing or risky:

- No CI/CD pipeline integration.
- No GitHub releases/tags/artifacts.
- No live version detector after deploy except updating Hub Mongo fields.
- No canary/staged rollout model.
- No true environment promotion model.
- No artifact immutability guarantee beyond local files.
- No delete/mirror cleanup of stale deployed files; stale files are detected but kept.
- Approval and backup gates are good for production but make first-use/dev workflows very hard.

### 6.6 Users/admins/permissions

Status: PARTIALLY WORKING.

Files:

- `client/src/pages/AdminsPage.tsx`
- `server/src/services/admins.service.ts`
- `server/src/services/liveAdminSources.service.ts`
- `server/src/services/personal-auth.service.ts`
- `server/src/models/SiteAdminSnapshot.ts`
- `server/src/models/Site.ts`

Endpoints:

- `GET /api/sites/:id/admins`
- `POST /api/sites/:id/admins/live-read`
- `POST /api/sites/:id/admins/sync`
- `POST /api/sites/:id/admins/repair-txt/plan`
- `POST /api/sites/:id/admins/repair-txt`
- `POST /api/sites/:id/admins`
- `DELETE /api/sites/:id/admins/:adminId`
- `GET /api/sites/:id/admins/diff`

What exists:

- Reads admin data from:
  - `users_data.txt`
  - SharePoint site collection admins
  - SharePoint associated owners group
- Persists current arrays and snapshots.
- Builds diff between sources.
- Can add/remove SharePoint site collection admins or owners group members if write is enabled.
- Can plan and queue TXT admin repair.

What is missing:

- No central HUB `User` model.
- No central `PermissionAssignment` model.
- No clear owner/admin lifecycle across all sites.
- No per-site scoped RBAC.
- No distinction between "a site admin" and "a HUB super-admin"; personal-number auth grants `admin` for any matched site admin.
- Adding to TXT source updates Hub metadata arrays; it does not necessarily write back to `users_data.txt` except through the separate repair flow.

UI issue:

- `AdminsPage.tsx` does not load operation capabilities the way `DashboardPage`, `ReleasesPage`, `BackupsPage`, and `SiteDetailsPage` do. SharePoint add/remove actions can appear clickable and then fail server-side when write is unavailable.

### 6.7 Backups

Status: PARTIALLY WORKING / UNKNOWN externally.

Files:

- `client/src/pages/BackupsPage.tsx`
- `server/src/routes/backups.routes.ts`
- `server/src/services/backupPlan.service.ts`
- `server/src/services/backups.service.ts`
- `server/src/services/realBackup.service.ts`
- `server/src/models/SiteBackup.ts`

Endpoints:

- `GET /api/backups`
- `POST /api/backups/plan-all`
- `POST /api/backups/run-all`
- `GET /api/backups/:id`
- `POST /api/backups/:id/verify`
- `POST /api/backups/:id/restore-plan`
- `POST /api/backups/:id/restore`
- `GET /api/sites/:id/backups`
- `GET /api/sites/:id/backups/inventory`
- `POST /api/sites/:id/backups/plan`
- `POST /api/sites/:id/backups`

What exists:

- Read-only backup plan checks canonical TXT file paths.
- Backup execution reads SharePoint files and writes them to a SharePoint backup folder.
- Read-back verification stores size/hash evidence.
- Restore reads backup evidence and writes source files back.
- Restore requires a distinct current-state verified backup.

Limitations:

- Backup scope is narrow: canonical TXT files from `resolvedPaths.txtFiles`, not a full SharePoint site, permissions state, app `dist`, document libraries, or any regular Builder DB.
- Backup storage is SharePoint itself, not a separate durable backup system.
- Restore is dangerous and real if configured; UI uses a simple prompt confirmation, which is not enough UX for a dangerous operation.
- No retention policy, encryption model, offsite storage, backup immutability, or disaster recovery proof.

### 6.8 Logs and jobs

Status: PARTIALLY WORKING.

Files:

- `client/src/pages/JobsPage.tsx`
- `server/src/models/Job.ts`
- `server/src/services/jobs.service.ts`
- `server/src/services/jobs.worker.ts`
- `server/src/services/audit.service.ts`

Endpoints:

- `GET /api/jobs`
- `GET /api/jobs/:id`
- `POST /api/jobs/:id/approve`
- `POST /api/jobs/:id/reject`
- `POST /api/jobs/:id/rerun`

What exists:

- Mongo-backed job records.
- Status transitions.
- Progress percent.
- Job logs.
- Evidence/result fields.
- Approval/rejection/rerun flows.
- Worker handlers for real operation types.

What is missing:

- True retry scheduling is not implemented even though `retrying`, `attempt`, `maxAttempts`, and `nextRetryAt` concepts exist.
- No concurrent worker safety beyond simple claim logic and a single-process `isProcessing` flag.
- No external queue, dead-letter queue, or retry backoff.
- Logs are job-local and audit-local, not centralized operational logs from Builder sites.

### 6.9 Monitoring

Status: PARTIALLY WORKING.

Files:

- `client/src/pages/MonitoringPage.tsx`
- `server/src/services/monitoring.service.ts`
- `server/src/models/MonitoringAlert.ts`
- `server/src/routes/monitoring.routes.ts`

Endpoints:

- `GET /api/monitoring/alerts`
- `GET /api/monitoring/summary`
- `POST /api/monitoring/alerts/refresh`
- `POST /api/monitoring/alerts/:id/acknowledge`

What exists:

- Derived alerts for failed jobs, stale backups, and failed health checks.
- Alert persistence and acknowledgement.
- Summary counts.

Limitations:

- Alerts are derived from Hub DB state, not live external monitoring.
- Refresh is endpoint-driven; I did not find a monitoring scheduler started in `server/src/index.ts`.
- No uptime checks, log ingestion, metrics, traces, or notification channels.

### 6.10 Audit

Status: PARTIALLY WORKING.

Files:

- `client/src/pages/AuditPage.tsx`
- `server/src/services/audit.service.ts`
- `server/src/models/AuditLog.ts`
- Controllers call `writeAuditLog()` in multiple write flows.

Endpoints:

- `GET /api/audit`
- `GET /api/audit/report`
- `GET /api/audit/export`

What exists:

- Mongo audit model.
- Filtering and report/export support.
- Many controller actions write audit rows.
- Tests exist for audit reporting.

Risks:

- Coverage depends on every controller/service remembering to write audit logs.
- Site details loads global audit rows and filters client-side, which can miss older site-specific rows and requires admin-level access.

## 7. UI That Looks Built But Is Not Actually Functional

These are the main misleading UI areas:

1. Dashboard "SharePoint Read" status can look connected because backend capabilities always set `readAvailable: true`; it does not prove a successful read against any site.
2. Dashboard health and version cards are Hub metadata/cache calculations, not continuous live state from Builder sites.
3. "Outdated sites" is based on Mongo `Site.currentVersion || Site.version` compared with latest Mongo `Release`, not live deployed versions.
4. Release rows can exist without a valid artifact path, so the release UI can show deployable-looking entries that are not deployable.
5. Admins page exposes SharePoint admin add/remove controls without first loading and honoring operation capabilities; unavailable writes fail only after clicking.
6. Site details audit tab calls global audit list and client-filters the last returned rows; it can look like a per-site audit log while missing older records.
7. Job model/UI has retry-related states, but the worker catch path marks failures failed; there is no true retry loop.
8. Monitoring page looks like an operations console, but it only shows alerts derived from Hub DB after refresh; it is not live observability.
9. Backup UI suggests "backup management" broadly, but actual backup sources are canonical TXT files only.
10. Settings/capabilities UI reports environment-derived capabilities, not validated operational connectivity.
11. Site bootstrap/provision flows can create/ensure SharePoint structure but do not guarantee a working deployed Builder application.
12. The HUB overall looks like a full control plane, but there is no regular Builder site API contract to pull live `site-info`, `version`, `jobs`, `logs`, or `update-status`.

## 8. Broken or Risky Functionality

- Local test/build commands are broken in this checkout because dependencies are absent.
- Backend startup depends on MongoDB; there is no useful degraded local mode without Mongo.
- `getSharePointOperationCapabilities()` reports `readAvailable: true` without checking actual network/auth access.
- Personal-number auth has hardcoded always-allowed admin numbers in `personal-auth.service.ts`.
- Any matched site owner/admin personal number becomes a HUB `admin`; this is too broad for a central control plane.
- API key auth can accept role from request headers after key validation; usable for automation, but not a real user/role system.
- SharePoint write auth relies on env cookie or bearer token; there is no credential lifecycle, rotation, tenant/service-account model, or UI setup.
- `SHAREPOINT_ALLOW_UNAUTHENTICATED_WRITE=true` exists and would make write capability available without auth material; that is risky and should be tightly limited to known dev scenarios.
- Dangerous writes require a recent verified backup, but backup creation itself requires SharePoint write and approval; this creates a first-use loop for local/dev.
- Release deploy depends on server-local artifact paths; this is fragile and hard to reproduce in production.
- Backup/restore scope does not cover full site state.
- Jobs expose retry concepts but do not actually retry failed operations.
- Monitoring has no automatic continuously running refresh service.
- Rate limiting is in-memory and not suitable for multi-instance deployment.
- Archive/delete route supports hard delete via `force`; the UI appears to use archive, but the API can delete data if called directly.
- Version/status functions include all `Site.find({})` records in some places, including archived sites, which can pollute counts.
- CORS is fixed to `CLIENT_ORIGIN`, which is fine for simple local use but needs clearer docs for alternate dev URLs.

## 9. Overprotection / Developer Blockers

The security posture is well-intentioned, but it blocks basic understanding and first successful use.

### Blockers found

- SharePoint write requires:
  - `SHAREPOINT_WRITE_ENABLED=true`
  - auth cookie or bearer token, unless unauthenticated writes are explicitly allowed
  - request digest
  - role guard
  - approval job
  - often a recent verified backup
- Dangerous job self-approval separation is good for production, but confusing for a single owner/developer trying to bootstrap or test.
- Restore requires a distinct current-state verified backup, which is correct for production but hard to satisfy during early setup.
- Auth has multiple paths: dev bypass, personal-number login, hardcoded admins, bootstrap env admins, site-admin-derived admins, and API key auth. This is too much before there is a clear owner model.
- Errors like `SHAREPOINT_WRITE_NOT_CONFIGURED`, `recent-verified-backup-required`, or `job-self-approval-forbidden` are technically useful but not presented as a simple setup checklist.

### What should stay

- Read-only health/plan modes.
- Approval gates for deploy, restore, permissions, and production writes.
- Audit logs for operational actions.
- Backup-before-dangerous-write policy for production.
- Clear distinction between read-only and write operations.

### What should be simplified

- Define one local owner/admin mode for development.
- Add an explicit "read-only audit mode" where all sites can be registered, probed, and synced without write setup.
- Make SharePoint write setup a single visible checklist.
- Make dangerous write gates environment-aware:
  - Dev: allow explicit owner override with loud audit log.
  - Staging/prod: require backup and approval.
- Separate HUB users from Builder site admins.
- Replace hardcoded personal numbers with a documented bootstrap-owner setup.

## 10. Missing Functionality Required For The Real HUB Goal

Required but missing or incomplete:

- Site discovery/import from SharePoint tenant, registry file, or Builder endpoint.
- Per-site integration connector abstraction.
- A regular Builder site API contract.
- Live site metadata sync.
- Live version detector.
- Central users/admins/owners model.
- Per-site permission assignments.
- Site environment model.
- Sync run history.
- Historical health checks.
- Real monitoring scheduler.
- Builder logs ingestion.
- Update plan model.
- Rollout/canary/batch deployment model.
- Git/GitHub/CI/release artifact integration.
- External/offsite backup storage.
- Backup retention and restore drill evidence.
- Credential/secret management.
- Clear onboarding wizard.
- Production deployment docs.

## 11. Integration Contract Needed With Regular Site Builder Sites

I did not find an existing per-Builder-site API contract. Today the HUB mostly assumes SharePoint paths and files. To make the HUB real, each managed Builder site should expose a small authenticated read API, either directly or through a site-side manifest file generated at deploy time.

Proposed minimum contract:

- `GET /health`
  - app status, build status, DB/storage status, auth status, last error, uptime.
- `GET /version`
  - semver, build SHA, build time, artifact ID, deployment ID, environment.
- `GET /site-info`
  - site code, name, environment, SharePoint URL, owner, feature flags, data source locations.
- `GET /users/admins`
  - owners/admins/users summary with source and last sync time.
- `GET /backups`
  - latest backup status, last verified backup, restore readiness.
- `GET /jobs`
  - current/recent Builder-side jobs if the Builder has local jobs.
- `GET /logs`
  - recent operational events or a pointer to log storage.
- `GET /update-status`
  - current update state, pending migration, last deploy result.
- `GET /capabilities`
  - what this site supports: live health, backup, restore, admin sync, deploy, read-only only.

The HUB should treat SharePoint file-path checks as one connector, not the whole integration story.

## 12. Recommended Target Architecture

Simplest usable architecture:

1. HUB API and DB remain the central registry and audit source.
2. Each managed site has a `ManagedSite` record with environment, URLs, connector type, credentials reference, and status.
3. A read-only sync worker periodically pulls:
   - site info
   - health
   - version
   - admin/user summary
   - backup summary
   - update status
4. Sync results are stored as immutable `SyncRun` and historical `SiteHealthCheck` rows, with latest summary denormalized onto `ManagedSite`.
5. Write actions are explicit `OperationJob` records with plan -> approval -> execute -> verify -> audit.
6. Deploy/update uses release artifacts from a real artifact source, not arbitrary local paths.
7. Credentials are stored as references to a secret provider, not raw env strings for all sites.
8. UI defaults to read-only facts and makes write capability visibly optional.

Recommended core models:

- `ManagedSite`
- `SiteEnvironment`
- `IntegrationCredential`
- `SiteConnector`
- `SyncRun`
- `SiteHealthCheck`
- `SiteVersion`
- `SiteUser`
- `SiteAdminAssignment`
- `BackupRecord`
- `DeploymentJob`
- `UpdatePlan`
- `AuditLog`
- `OperationApproval`

## 13. Priority Roadmap

### Phase 0: Cleanup and understanding

Goal: make the current system understandable without changing behavior.

Tasks:

- Add clear labels in UI and docs for "Hub metadata", "cached", "live SharePoint read", and "write unavailable".
- Document every operation mode and gate.
- Remove or hide UI controls that cannot work without configured capabilities.
- Audit existing route/service names for duplicates and unclear labels.

Files likely affected:

- `README.md`
- `client/src/pages/*`
- `client/src/components/*`
- `server/src/services/operations.service.ts`

Risk level: low.

Acceptance criteria:

- A new developer can tell which buttons are read-only, metadata-only, or real writes.
- No screen implies live status unless the backend performed a live check.

### Phase 1: Make local dev usable

Goal: one-command local setup and predictable owner access.

Tasks:

- Provide `npm ci`/install docs and verify lockfiles.
- Add Docker Compose for Mongo.
- Add seed command that clearly fails with actionable errors.
- Add dev owner setup with no hardcoded personal numbers.
- Add a read-only demo mode that does not need SharePoint write credentials.

Files likely affected:

- `README.md`
- `.env.example`
- `server/src/config/env.ts`
- `server/src/middlewares/auth.ts`
- `server/src/scripts/seed.ts`

Risk level: low to medium.

Acceptance criteria:

- `npm test`, `npm run build`, and local dev server run on a clean checkout after documented setup.
- Owner can log in and register/probe a site in read-only mode.

### Phase 2: Real site registry

Goal: the registry represents real managed Builder sites, not just manually typed rows.

Tasks:

- Rename/refine `Site` into a clear `ManagedSite` concept or document the existing model as such.
- Add environment model: dev/staging/prod/custom.
- Add connection validation during registration.
- Add import/discovery path from a manifest, SharePoint inventory, or Builder endpoint.
- Store last sync status and connector status.

Files likely affected:

- `server/src/models/Site.ts`
- `server/src/services/sites.service.ts`
- `server/src/controllers/sites.controller.ts`
- `client/src/pages/SitesPage.tsx`
- `client/src/components/SiteFormModal.tsx`

Risk level: medium.

Acceptance criteria:

- A site cannot be marked connected unless a read-only connector check succeeded.
- The list clearly distinguishes registered, connected, disconnected, and never checked.

### Phase 3: Real health/version sync

Goal: the HUB knows current health and version from each site.

Tasks:

- Define and implement Builder-side integration contract or manifest.
- Add `SyncRun` and `SiteHealthCheck` history.
- Add version detector from `/version` or deployment manifest.
- Schedule read-only sync worker.
- Make dashboard use latest sync facts with timestamps.

Files likely affected:

- New connector services under `server/src/services`
- New models under `server/src/models`
- `server/src/services/sharepointHealth.service.ts`
- `server/src/services/releases.service.ts`
- `client/src/pages/DashboardPage.tsx`
- `client/src/pages/HealthPage.tsx`

Risk level: medium.

Acceptance criteria:

- Dashboard version/health cards show live-or-last-sync timestamps.
- Outdated sites are based on verified site-reported versions.

### Phase 4: Users/admins/backups

Goal: centralize operational data without confusing metadata edits with real site changes.

Tasks:

- Add central user/admin/owner model.
- Separate "read admins" from "change admins".
- Make TXT metadata edit and SharePoint write paths visually distinct.
- Expand backup model to include scope, storage provider, retention, and restore readiness.
- Decide whether backups are SharePoint-only or external/offsite.

Files likely affected:

- `server/src/services/admins.service.ts`
- `server/src/services/backups.service.ts`
- `server/src/models/Site.ts`
- `server/src/models/SiteBackup.ts`
- `client/src/pages/AdminsPage.tsx`
- `client/src/pages/BackupsPage.tsx`

Risk level: medium to high.

Acceptance criteria:

- A user can see exactly which admin source is authoritative.
- Backup records clearly say what was backed up and what was not.

### Phase 5: Update/deployment orchestration

Goal: deployments are traceable, reproducible, and connected to real artifacts.

Tasks:

- Replace server-local artifact paths with artifact registry/GitHub/CI output.
- Store build SHA, release tag, artifact checksum, and source repo.
- Add rollout plans and per-site execution batches.
- Keep approval and backup gates for production, but add explicit dev override.
- Add post-deploy verification from Builder `/health` and `/version`.

Files likely affected:

- `server/src/services/releases.service.ts`
- `server/src/services/deployArtifact.service.ts`
- `server/src/models/Release.ts`
- `server/src/models/SiteVersionDeployment.ts`
- `client/src/pages/ReleasesPage.tsx`

Risk level: high.

Acceptance criteria:

- A deploy can be reproduced from an immutable artifact ID.
- Post-deploy status is verified by the site itself.

### Phase 6: UI cleanup and production hardening

Goal: make the HUB small, clear, and safe.

Tasks:

- Reduce navigation to the minimum useful control panel.
- Merge overlapping pages where possible.
- Add capability-aware disabled states everywhere.
- Add clear empty/error/setup states.
- Add E2E tests for the main flows.
- Add production deployment and secret handling docs.

Files likely affected:

- `client/src/pages/*`
- `client/src/components/*`
- `server/src/services/operations.service.ts`
- `tests`

Risk level: medium.

Acceptance criteria:

- First screen answers: which sites exist, which are broken, which are outdated, what needs action.
- Dangerous actions are clear, rare, and auditable.

## 14. Quick Wins

- Install dependencies and verify `npm test` and `npm run build` on a clean checkout.
- Change SharePoint read capability display so it means "configured/probed" instead of always true.
- Add "last live check at" beside every health/version/dashboard value.
- Disable Admins page SharePoint write buttons unless operation capabilities say write is available.
- Hide deploy/restore/provision buttons behind an "enable write operations" setup panel.
- Add a visible "metadata only" label to version status and dashboard outdated counts.
- Reject or strongly warn on release creation with empty `artifactRef`.
- Add a per-site audit endpoint/query in `SiteDetailsPage` instead of global fetch plus client filter.
- Document the first successful read-only flow: create site -> run health check -> view evidence.
- Replace hardcoded personal numbers with documented bootstrap setup.

## 15. Questions / Unknowns

- Where should authoritative site discovery come from: SharePoint tenant inventory, a registry file, Builder APIs, or manual entry?
- Will every Builder site be able to expose an authenticated API, or must the HUB rely only on SharePoint files?
- What is the authoritative source for version: Builder endpoint, deployment manifest, package metadata, GitHub release, or SharePoint artifact?
- What is the required backup scope: TXT files only, all SharePoint files, permissions, Builder DB, or full site collection?
- Should backups remain in SharePoint or go to external/offsite storage?
- What production identity should the HUB use for SharePoint: service account, delegated user, certificate app auth, or existing cookie/session?
- Is dual approval required for production deploy/restore, or is single admin approval enough?
- Is this intended for one owner/operator or a team with RBAC?
- Should HUB admins be independent from Builder site admins?

## 16. Commands Run

Safe inspection commands run:

- `sed -n '1,260p' /Users/meni/.codex/attachments/d420ea13-66b3-4910-a0f3-7ce595182f76/pasted-text.txt`
  - Read the audit request and required report format.
- `sed -n '261,560p' /Users/meni/.codex/attachments/d420ea13-66b3-4910-a0f3-7ce595182f76/pasted-text.txt`
  - Confirmed sections 1-17 and final verdict format.
- `pwd`
  - Confirmed workspace: `/Users/meni/dev/sitebuilder-hub`.
- `git status --short`
  - Initially clean; clean before creating the report.
- `rg --files`
  - Mapped project files.
- `sed -n ... README.md package.json server/package.json client/package.json .env.example`
  - Reviewed setup, scripts, dependencies, and env.
- `rg -n "router\\.(get|post|patch|delete|put)" server/src/routes`
  - Mapped API endpoints.
- `rg -n "<Route|BrowserRouter" client/src/App.tsx`
  - Mapped frontend routes.
- `rg -n ... server/src/services client/src/pages client/src/api`
  - Traced feature paths across UI, API, routes, and services.
- `rg --files tests`
  - Found 16 test files:
    - `tests/sitebuilderPaths.test.ts`
    - `tests/siteBootstrapWorker.test.ts`
    - `tests/deployTargetDistInventory.test.ts`
    - `tests/versionRollbackApproval.test.ts`
    - `tests/backupRestoreApproval.test.ts`
    - `tests/siteBootstrap.test.ts`
    - `tests/maintenanceScheduler.test.ts`
    - `tests/sharepointOperationClient.test.ts`
    - `tests/monitoringAlerts.test.ts`
    - `tests/deployStaleApprovalSnapshot.test.ts`
    - `tests/writeSafety.test.ts`
    - `tests/adminRepairApproval.test.ts`
    - `tests/auditReporting.test.ts`
    - `tests/postDeployHealthEvidence.test.ts`
    - `tests/jobApprovalTtl.test.ts`
    - `tests/setup/env.ts`
- `npm test`
  - Failed before running tests:
  - `sh: vitest: command not found`
- `npm run build`
  - Failed before compiling:
  - server build called `tsc -p tsconfig.json`
  - `sh: tsc: command not found`
- `find . -maxdepth 3 -type d -name node_modules -print`
  - No `node_modules` directories printed; dependencies are not installed in this checkout.

No destructive commands were run. No production code was modified.

## 17. Evidence Appendix

### Frontend routes

File: `client/src/App.tsx`

- `/` -> `DashboardPage`
- `/sites` -> `SitesPage`
- `/sites/:id` -> `SiteDetailsPage`
- `/releases` -> `ReleasesPage`
- `/backups` -> `BackupsPage`
- `/admins` -> `AdminsPage`
- `/jobs` -> `JobsPage`
- `/monitoring` -> `MonitoringPage`
- `/audit` -> `AuditPage`
- `/health` -> `HealthPage`
- `/settings` -> `SettingsPage`

### Backend route mounts

File: `server/src/app.ts`

- `app.get("/api/health/live", ...)`
- `app.get("/api/health/ready", ...)`
- `app.get("/api/health", ...)`
- `app.use(authMiddleware)`
- `app.use("/api/auth", authRoutes)`
- `app.use("/api/sites", sitesRoutes)`
- `app.use("/api/releases", releasesRoutes)`
- `app.use("/api/backups", backupsRoutes)`
- `app.use("/api/version", versionRoutes)`
- `app.use("/api/jobs", jobsRoutes)`
- `app.use("/api/monitoring", monitoringRoutes)`
- `app.use("/api/audit", auditRoutes)`
- `app.use("/api/operations", operationsRoutes)`

### API endpoints

Files: `server/src/routes/*.ts`

- Auth:
  - `GET /api/auth/bootstrap-status`
  - `POST /api/auth/login-personal-number`
  - `GET /api/auth/me`
- Operations:
  - `GET /api/operations/capabilities`
  - `GET /api/operations/sites/:id/summary`
- Sites:
  - `GET /api/sites`
  - `GET /api/sites/:id`
  - `POST /api/sites`
  - `PATCH /api/sites/:id`
  - `DELETE /api/sites/:id`
  - `POST /api/sites/:id/health-check/manual`
  - `POST /api/sites/:id/health-check/sharepoint-readonly`
  - `GET /api/sites/:id/bootstrap/plan`
  - `POST /api/sites/:id/bootstrap`
  - `GET /api/sites/:id/provision/plan`
  - `POST /api/sites/:id/provision`
  - `GET /api/sites/:id/permissions/plan`
  - `POST /api/sites/:id/permissions/setup`
  - `POST /api/sites/:id/deploy-version/plan`
  - `POST /api/sites/:id/deploy-version`
  - `POST /api/sites/:id/rollback-version/plan`
  - `POST /api/sites/:id/rollback-version`
  - `GET /api/sites/:id/deployments`
  - `GET /api/sites/:id/backups`
  - `GET /api/sites/:id/backups/inventory`
  - `POST /api/sites/:id/backups/plan`
  - `POST /api/sites/:id/backups`
  - `GET /api/sites/:id/admins`
  - `POST /api/sites/:id/admins/live-read`
  - `POST /api/sites/:id/admins/sync`
  - `POST /api/sites/:id/admins/repair-txt/plan`
  - `POST /api/sites/:id/admins/repair-txt`
  - `POST /api/sites/:id/admins`
  - `DELETE /api/sites/:id/admins/:adminId`
  - `GET /api/sites/:id/admins/diff`
- Releases:
  - `GET /api/releases`
  - `POST /api/releases`
  - `GET /api/releases/:id/artifact/validate`
  - `POST /api/releases/:id/deploy-all`
- Backups:
  - `GET /api/backups`
  - `POST /api/backups/plan-all`
  - `POST /api/backups/run-all`
  - `GET /api/backups/:id`
  - `POST /api/backups/:id/verify`
  - `POST /api/backups/:id/restore-plan`
  - `POST /api/backups/:id/restore`
- Version:
  - `POST /api/version/next`
  - `GET /api/version/status`
- Jobs:
  - `GET /api/jobs`
  - `GET /api/jobs/:id`
  - `POST /api/jobs/:id/approve`
  - `POST /api/jobs/:id/reject`
  - `POST /api/jobs/:id/rerun`
- Monitoring:
  - `GET /api/monitoring/alerts`
  - `GET /api/monitoring/summary`
  - `POST /api/monitoring/alerts/refresh`
  - `POST /api/monitoring/alerts/:id/acknowledge`
- Audit:
  - `GET /api/audit`
  - `GET /api/audit/report`
  - `GET /api/audit/export`

### Data models

Files: `server/src/models`

- `Site.ts`: central managed site registry with SharePoint paths, owners/admins, version fields, health fields, backup fields, maintenance schedule, and status.
- `Release.ts`: release registry and artifact validation metadata.
- `SiteVersionDeployment.ts`: deployment run/evidence model.
- `SiteBackup.ts`: backup, verification, and restore evidence model.
- `Job.ts`: background job status/log/evidence/approval model.
- `SiteAdminSnapshot.ts`: admin source snapshot model.
- `MonitoringAlert.ts`: derived operational alert model.
- `AuditLog.ts`: audit log model.

### Auth evidence

Files:

- `server/src/middlewares/auth.ts`
- `server/src/services/personal-auth.service.ts`

Important behavior:

- `AUTH_ENABLED=false` sets every protected request as `Local Developer` with `admin`.
- Hardcoded always-allowed personal numbers exist in `HARDCODED_ALWAYS_ALLOWED_PERSONAL_NUMBERS`.
- Personal numbers from site owners/admin arrays are accepted and returned with role `admin`.
- `requireRole()` is route-level role priority checking only.

### SharePoint capability evidence

File: `server/src/services/sharepointOperationClient.ts`

Important behavior:

- `readAvailable: true` is returned unconditionally.
- `writeAvailable` requires `SHAREPOINT_WRITE_ENABLED` plus auth material or `SHAREPOINT_ALLOW_UNAUTHENTICATED_WRITE`.
- Write methods call `assertSharePointWriteAvailable()`.

### Health evidence

File: `server/src/services/sharepointHealth.service.ts`

Important function:

- `runReadOnlySharePointHealthCheck(siteId)`

Checks:

- document libraries
- final dist folder
- final `index.html`
- final assets folder
- permissions marker
- TXT files

Writes:

- current health fields on `Site`
- `lastHealthCheckAt`
- `resolvedPaths`
- parts of `sharePointStatus`

### Version evidence

File: `server/src/services/releases.service.ts`

Important function:

- `buildVersionStatus()`

Behavior:

- Loads latest release from Mongo.
- Loads sites from Mongo.
- Compares stored `site.currentVersion || site.version || "0.1.0"` against latest release.
- Does not query a live Builder site.

### Deploy evidence

File: `server/src/services/deployArtifact.service.ts`

Important function:

- `executeSharePointDeploy()`

Behavior:

- Builds deploy plan.
- Gets SharePoint request digest.
- Uploads each artifact file to SharePoint.
- Reads back each file for verification.
- Runs post-deploy read-only health.
- Updates `Site.currentVersion`, `Site.version`, `Site.latestKnownVersion`, and `SiteVersionDeployment`.

This is serious real operation code, but it was not verified against SharePoint during this audit.

### Backup evidence

Files:

- `server/src/services/backupPlan.service.ts`
- `server/src/services/realBackup.service.ts`

Important behavior:

- `buildReadOnlyBackupPlan()` builds sources from `resolvedPaths.txtFiles`.
- `executeSharePointBackup()` copies sources to SharePoint backup folder and verifies read-back.
- `executeSharePointRestore()` writes backup files back and verifies.

Important limitation:

- This backs up canonical TXT files, not the whole Builder installation.

### Job worker evidence

File: `server/src/services/jobs.worker.ts`

Supported job types:

- `version-upgrade`
- `version-rollback`
- `deploy`
- `backup`
- `restore`
- `site-bootstrap`
- `site-provision`
- `permissions-setup`
- `admin-sync`
- `repair`
- `health-check`

Failure path:

- Worker catches errors and calls `setJobFailed()`.
- I did not find a real retry scheduler path that requeues attempts automatically.

### Test evidence

Files: `tests/*.test.ts`

Coverage areas include:

- path resolution
- bootstrap/provision worker behavior
- deployment target inventory
- rollback approvals
- backup/restore approvals
- maintenance scheduler
- SharePoint operation client
- monitoring alerts
- write safety
- admin repair approval
- audit reporting
- post-deploy health evidence
- job approval TTL

Current local result:

- Tests did not run because `vitest` is unavailable.
- Build did not run because `tsc` is unavailable.

FINAL VERDICT:

- Current HUB maturity: Partial MVP
- Main blocker: no reliable live integration/sync contract with actual Builder sites, plus local/dev setup is blocked until dependencies and Mongo are set up.
- Biggest fake/UI-only area: dashboard/version/monitoring confidence; these screens look like live operational truth but mostly show Hub metadata, cached health, or derived DB state.
- Biggest technical risk: SharePoint write operations are complex, dangerous, and only conditionally wired; without end-to-end environment tests they can fail halfway through deploy/backup/restore/admin changes.
- First thing to fix: make a simple read-only path work end-to-end: install/run locally, register one site, validate connection, pull live health/version/admin summary, and show exact timestamps/evidence.
- Whether this should be repaired or partially rebuilt: repair the backend pieces that are real, but partially rebuild/simplify the product architecture and UI around a smaller read-only-first HUB core before expanding write orchestration.
# Legacy Historical Report

This audit contains findings from the older server-side SharePoint phase. The current source of truth is `docs/sharepoint-browser-only-status-report.md`: there is no SharePoint in the server.
