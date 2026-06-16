# Sitebuilder HUB Simplification Report

Date: 2026-06-11

This report documents the HUB-only simplification pass. The goal was to make the product a practical read-only-first MVP while keeping dangerous write operations present, explicit, and gated instead of pretending they are fully safe by default.

## Summary

The HUB now presents the core MVP as:

- Register and inspect Builder sites from the HUB registry.
- Show read-only health, version, release, backup, job, monitoring, audit, and settings state with clearer metadata/live-state boundaries.
- Keep advanced write paths in the backend, but expose them through deliberate flows with capability checks, missing requirements, plans, audit logs, and evidence.
- Preserve Deploy as a real first-class feature, focused on one site at a time for the MVP.

The regular Site Builder application remains outside this project. The HUB manages Builder sites; it does not absorb Builder features.

## Deploy MVP

### What deploy code already existed

Before this pass, the backend already had serious deploy machinery:

- release records with artifact references,
- deploy planning,
- SharePoint upload execution,
- digest/artifact validation,
- job creation and worker execution,
- backup and approval gates,
- post-deploy health checks,
- deployment history,
- audit logging,
- rollback-by-release paths.

The problem was not that Deploy was fake. The problem was that the UI could make it feel like a broad production control plane even when a local artifact, SharePoint write credentials, a valid target, approval state, or backup safety were missing.

### What was simplified

Deploy is now the "single-site Deploy MVP":

- A visible Deploy section remains on the releases page.
- The main UI deploys one selected release to one selected site.
- Batch deploy is no longer the primary visible workflow.
- The UI requires a dry-run plan before enabling execution.
- Missing requirements are shown as blockers instead of being discovered only after pressing deploy.
- Rollback remains available as an advanced operation.

### What now works

The HUB can now produce and display a dry-run deployment plan with:

- target site name, URL, environment, and current known version,
- selected source release and artifact path,
- artifact validation/readiness,
- target SharePoint distribution folder,
- whether SharePoint write is configured,
- whether backup is required,
- selected deploy mode,
- expected final app URL,
- files that would be uploaded,
- target inventory/read-back context where available.

When a deploy job is allowed to run, the backend records the mode, policy snapshot, logs, timestamps, upload evidence, read-back verification, post-deploy health result, and deployment history.

### What is still gated

Deploy stays blocked until the required evidence exists:

- a release is selected,
- a site is selected,
- a release artifact exists and can be validated,
- a fresh plan exists for the selected release/site/mode,
- the plan says execution is ready,
- SharePoint write is configured,
- production-safe policy requirements are satisfied when that mode is used.

Important user-facing blocker messages include:

- "Deploy cannot run because the release artifact is missing."
- "Deploy cannot run because SharePoint write is not configured."
- "Deploy uploaded files, but post-deploy verification failed."

### Local/dev owner deploy

`local-dev-owner` is the practical development mode. It is intended for the configured HUB owner while iterating locally or against non-production targets.

Behavior:

- skips multi-person approval by default,
- skips mandatory backup by default,
- records an explicit local/dev safety snapshot,
- emits a warning in deploy logs,
- remains blocked if the target site is marked as production.

Relevant env vars:

- `HUB_OWNER_PERSONAL_NUMBER`
- `HUB_LOCAL_DEV_DEPLOY_REQUIRES_BACKUP`

### Production-safe deploy

`production-safe` is the default safety model for real production operation.

Behavior:

- requires SharePoint write capability,
- requires artifact validation,
- requires a recent verified backup when configured,
- requires approval when configured,
- records the production policy snapshot in the job payload.

Relevant env vars:

- `SHAREPOINT_WRITE_ENABLED`
- `SHAREPOINT_AUTH_COOKIE` or `SHAREPOINT_BEARER_TOKEN`
- `HUB_PRODUCTION_DEPLOY_REQUIRES_BACKUP`
- `HUB_PRODUCTION_DEPLOY_REQUIRES_APPROVAL`

### End-to-end local run

From the repository root:

```bash
npm run install:all
cp .env.example .env
docker compose up -d mongo
npm run seed
npm run dev
```

Then open the frontend and sign in with the owner personal number from `.env`:

```text
http://localhost:5177
```

For a successful real deploy, also configure a real artifact path on the release and real SharePoint write credentials in `.env`.

## Authentication Cleanup

The previous hardcoded personal-number admin path was replaced with an explicit owner/bootstrap/site-admin model:

- `HUB_OWNER_PERSONAL_NUMBER` configures the local owner identity.
- `BOOTSTRAP_ADMIN_PERSONAL_NUMBERS` now defaults to empty.
- Auth responses and UI labels now call this source `owner`, not a hidden hardcoded bypass.

This is still not a complete enterprise identity model. It is a clearer MVP boundary.

## Site Environment

Sites now have an `environment` field:

- `unknown`
- `local`
- `dev`
- `test`
- `staging`
- `production`

Deploy policy uses this field to prevent local/dev owner deploy mode from being used against production sites.

## Builder Contract Boundary

This pass keeps the HUB focused on management-plane behavior. The future Builder-side contract should expose read-only facts that the HUB can consume consistently:

- live app version,
- build/release identifier,
- health status,
- artifact/runtime metadata,
- owner/admin metadata,
- backup/export status,
- deployment evidence.

Until that exists, several HUB screens still rely on Mongo metadata, SharePoint probes, or manually registered values.

## Tests Added Or Updated

Coverage now includes:

- UI deploy gating for missing release/site/artifact/plan/write requirements,
- deploy plan target summaries and missing SharePoint write detection,
- artifact missing/invalid path blockers before upload,
- production-safe backup and approval behavior,
- local/dev owner deploy behavior without approval and without mandatory backup,
- post-deploy health success updating site version,
- post-deploy health failure not updating site version.

Verified commands:

```bash
npm test
npm run build
```

Both commands completed successfully after installing dependencies.

## Remaining Honest Limits

The HUB is now easier to run locally and safer to reason about, but it is still an MVP:

- Real Deploy still requires a real artifact and real SharePoint write credentials.
- Health/version state is not yet a full live Builder API contract.
- Production identity/RBAC is still incomplete.
- Backup and restore remain advanced operational flows and need environment-specific validation before production use.
- Batch deploy exists in the backend but is intentionally not the main MVP UI path.
