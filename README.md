# Site Builder Hub

Central management Hub for multiple existing Site Builder sites. This project is the Hub only; regular Site Builder apps are external managed targets.

## Local Quick Start

```bash
cd /Users/meni/dev/sitebuilder-hub
npm run install:all
cp .env.example .env
docker compose up -d mongo
npm run seed
npm run dev
```

Open:

- Frontend: http://localhost:5177
- Backend health: http://localhost:4100/api/health

## Local Development Auth

Local development runs without a login screen by default:

```bash
AUTH_ENABLED=false
```

The backend assigns a local admin identity automatically so protected API routes still work.
The UI shows this clearly as local development mode. When the built Hub is hosted inside SharePoint, the browser calls `/_api/web/currentuser` and forwards that SharePoint identity to the API, so the owner no longer sees `Local Developer`.

To test personal-number auth locally, set:

```bash
AUTH_ENABLED=true
HUB_OWNER_PERSONAL_NUMBER=s0000001
```

Then use `s0000001` on the login screen, or replace it in `.env` with your own owner personal number.

## SharePoint Hosting

The client uses hash routes and relative assets for SharePoint folder hosting:

- `index.html#/releases`
- `index.html#/sites`
- `index.html#/sites/:id`
- `index.html#/diagnostics`

Set the API CORS origins without code changes:

```bash
CLIENT_ORIGIN=https://portal.army.idf
CLIENT_ORIGINS=https://portal.army.idf,http://localhost:5177,http://127.0.0.1:5177
```

Use `בעיות וחיבורים` in the sidebar to inspect app mode, frontend origin, API base URL, current user detection, SharePoint current user, read test, digest/contextinfo, write verification, env flags, exact failing URL/status, and resolved SharePoint paths.

## Hebrew Help Layer

The Hub includes a Hebrew explanation layer for operators:

- Inline help icons appear next to key page titles, panels, KPI cards, statuses, table columns, and important form labels.
- The sidebar includes `מרכז הסברים` at `#/help`, with explanations for sites, releases/deploys, SharePoint connections, admins, backups, Jobs, health checks, audit, common problems, and glossary terms.
- Help icons are enabled by default. To hide inline icons while keeping the help center route available, set:

```bash
VITE_HUB_HELP_ICONS_ENABLED=false
```

Use `VITE_HUB_HELP_ICONS_ENABLED=true` or omit the variable to keep the default help icons.

## Commands

```bash
npm run install:all
docker compose up -d mongo
npm run seed
npm run dev:server
npm run dev:client
npm test
npm run build
```

If Mongo is missing, start it with:

```bash
docker compose up -d mongo
```

If dependencies are missing, run:

```bash
npm run install:all
```

## Deploy MVP

Deploy is a real first-class Hub capability. The UI now supports both bulk deploy and single-site deploy.

The Deploy screen lives under `גרסאות ופריסות` and supports:

- Select or create one release.
- Require a real `artifactRef` pointing to a local `dist` folder or `sharepoint-deploy-manifest.json`.
- Validate the artifact before deploy.
- Select one managed site, or use Deploy Center for all active sites, selected sites, or one environment.
- Generate a dry-run deploy plan.
- Show target site, environment, current known version, release version, artifact path, files to upload, SharePoint target `dist`, write capability, backup requirement, and deploy mode.
- Run deploy only when release, artifact, site, plan, and SharePoint write requirements are satisfied.
- Record job logs, upload read-back evidence, post-deploy health evidence, timestamps, and deployment result.

Deploy modes:

- `Owner-direct deploy`: default MVP path. No pending approval jobs. Backup is a warning unless explicitly configured as required. Artifact validation, SharePoint digest, upload, read-back verification, post-deploy health, audit, logs, and evidence still run.
- `Production-safe deploy`: advanced future/team mode. Enable only when you intentionally want approval/backup gates.

Required SharePoint write env for a real deploy:

```bash
SHAREPOINT_WRITE_ENABLED=true
SHAREPOINT_AUTH_COOKIE=...
# or
SHAREPOINT_BEARER_TOKEN=...
```

`SHAREPOINT_ALLOW_UNAUTHENTICATED_WRITE=true` is not proof that SharePoint writes work. It only allows the backend to attempt a write path. Real write readiness requires a successful SharePoint `/_api/contextinfo` digest check, visible in `בעיות וחיבורים`.

Optional deploy policy env:

```bash
HUB_LOCAL_DEV_DEPLOY_REQUIRES_BACKUP=false
HUB_OWNER_DIRECT_MODE=true
HUB_ADVANCED_APPROVALS_ENABLED=false
HUB_PRODUCTION_DEPLOY_REQUIRES_BACKUP=false
HUB_PRODUCTION_DEPLOY_REQUIRES_APPROVAL=false

# Dangerous explicit bypasses. Use only when you accept the risk.
HUB_DANGEROUS_ALLOW_DEPLOY_WITHOUT_BACKUP=false
HUB_DANGEROUS_ALLOW_ROLLBACK_WITHOUT_BACKUP=false
HUB_DANGEROUS_ALLOW_RESTORE_WITHOUT_BACKUP=false

# Nuclear switch: bypass every Hub validation gate below.
# Real SharePoint/browser requests can still fail; this does not fake writes.
HUB_DANGEROUS_BYPASS_ALL_VALIDATION_GATES=false

# Focused dangerous validation bypasses.
HUB_DANGEROUS_BYPASS_APPROVAL_GATES=false
HUB_DANGEROUS_BYPASS_SHAREPOINT_WRITE_GATES=false
HUB_DANGEROUS_BYPASS_RELEASE_ARTIFACT_VALIDATION=false
HUB_DANGEROUS_BYPASS_DEPLOY_PLAN_BLOCKERS=false
HUB_DANGEROUS_BYPASS_RESTORE_EVIDENCE_GATES=false
HUB_DANGEROUS_BYPASS_BROWSER_EVIDENCE_GATES=false
HUB_DANGEROUS_BYPASS_ADMIN_REPAIR_GATES=false
```

When SharePoint write is not configured, the UI and API report:

```text
Deploy cannot run because SharePoint write is not configured.
```

When the release artifact is missing, they report:

```text
Deploy cannot run because the release artifact is missing.
```

## Builder Integration Contract

Existing sites do not need to expose this yet. Future Builder sites should expose authenticated read endpoints:

- `/health`
- `/version`
- `/site-info`
- `/users/admins`
- `/backups`
- `/jobs`
- `/logs`
- `/update-status`
- `/capabilities`

Until that contract exists, the Hub falls back to SharePoint read-only checks and labels values as Hub metadata, cached, unknown, or not configured.
