# Sitebuilder HUB Mongo Storage Awareness Implementation Report

## Executive Summary

This phase makes the HUB storage-backend-aware. Managed sites can now be modeled, validated, displayed, diagnosed, and health-checked as `txt`, `mongo`, or `unknown`.

The implementation does not create a full Mongo-backed Site Builder site yet. It lays the foundation required for that work by separating SharePoint hosting health from live data backend health, adding runtime config validation, adding a Builder/Mongo backend connector, and removing the dangerous assumption that `siteCode` uniquely identifies a managed installation.

Critical readiness behavior changed for Mongo sites: a Mongo-backed site is not treated as ready just because a HUB registry row exists. Readiness requires SharePoint hosting evidence, a valid runtime config, reachable Builder backend API, Mongo site registry, safe collection resolution, and required seed docs/scopes.

## Model Fields Added

The managed site model now supports storage-aware identity and backend state.

General identity:

- `builderSiteId`
- `storageBackend`: `txt | mongo | unknown`
- `lifecycleStatus`
- `creationMode`
- `provisioningStatus`
- `authoritativeAdminSource`

SharePoint hosting:

- `runtimeConfigPath`
- `runtimeConfigUrl`
- `lastSharePointHostingVerificationAt`
- `sharePointPathEvidence`
- resolved runtime config path/url in `resolvedPaths`

Runtime config:

- `runtimeConfigStatus.path`
- `runtimeConfigStatus.url`
- `runtimeConfigStatus.readStatus`
- `runtimeConfigStatus.storageBackend`
- `runtimeConfigStatus.backendApiUrl`
- `runtimeConfigStatus.backendApiUrlHost`
- `runtimeConfigStatus.builderSiteId`
- `runtimeConfigStatus.apiKeyStatus`
- `runtimeConfigStatus.belongsToSite`
- `runtimeConfigStatus.warnings`
- `runtimeConfigStatus.evidence`

Mongo/data backend:

- `backendApiUrl`
- `builderApiKeyRef`
- `mongoEnvironment`
- `mongoDatabase`
- `mongoSiteId`
- `safeCollectionName`
- `dataBackendStatus`
- `mongoBackendStatus.backendReachable`
- `mongoBackendStatus.registryStatus`
- `mongoBackendStatus.collectionStatus`
- `mongoBackendStatus.seedStatus`
- `mongoBackendStatus.adminsStatus`
- `mongoBackendStatus.backupsStatus`
- `mongoBackendStatus.revisionsAuditStatus`
- `mongoBackendStatus.expectedScopes`
- `mongoBackendStatus.missingScopes`
- `mongoBackendStatus.missingDocs`
- `mongoBackendStatus.evidence`

Health flags added:

- `runtimeConfigExists`
- `runtimeConfigValid`
- `dataBackendReachable`
- `mongoRegistryOk`
- `mongoCollectionOk`
- `mongoSeedOk`
- `mongoBackupsOk`
- `mongoRevisionsAuditOk`

## API And Schema Changes

The site create/update validation accepts the new storage-aware fields and rejects unsupported `storageBackend` values. Raw Builder API keys are not accepted as a managed site field; the model uses `builderApiKeyRef` so secrets can stay in environment/config storage.

New site routes:

- `POST /api/sites/:id/runtime-config/validate`
- `POST /api/sites/:id/health-check/mongo-backend`

Operations/settings metadata now advertises:

- supported storage modes
- TXT source/admin/backup behavior
- Mongo backend connector mode
- allowed Builder backend API URLs
- default credential reference
- `rawApiKeysExposed: false`

## Identity And Duplicate SiteCode Fix

The HUB identity key now includes physical/runtime identity, not only `siteCode`.

The identity key includes:

- SharePoint site URL
- final dist root
- runtime config path
- siteDB root
- siteUsersDb root
- storage backend
- Builder runtime site id
- Mongo site id
- safe collection name

This allows multiple managed entries with the same `siteCode` when they represent different SharePoint paths, runtime config paths, storage backends, or Mongo identities.

Nested SharePoint site paths are preserved when resolving paths, so paths such as `/Sites/main-site/subsite` are not collapsed into the first segment.

## Runtime Config Validation

Runtime config validation reads the exact configured runtime config path for the managed site. The resolver supports the current default name:

- `sitebuilder-runtime-config.json`

It also keeps the alternate known filename in the validation logic:

- `runtime-config.json`

For Mongo-backed sites the validator checks:

- `storageBackend === "mongo"`
- `backendApiUrl` exists
- `siteId` exists
- API key or credential reference is configured
- runtime config `siteId` belongs to the selected managed site
- runtime config path matches the managed site's exact configured physical path

The validator returns redacted status only:

- backend host/origin
- site id
- api key configured/missing/invalid status
- mismatch warnings
- no raw API key

Persisted health flags:

- runtime config exists
- runtime config valid

## Mongo Backend Connector Checks

The new Builder/Mongo backend connector uses the Site Builder backend API. It does not call Mongo directly.

It checks:

- configured backend API URL
- backend URL allowlist
- credential reference resolution
- `/api/healthz`, `/healthz`, or `/api/health`
- `/api/sites`
- `/api/sites/:siteId`
- safe collection name from site registry
- required legacy-compatible seed docs through `/api/sites/:siteId/legacy/batch-read`
- backup capability through `/api/sites/:siteId/backups`

If a backend API allowlist is configured, a site outside the allowlist is not called.

The connector persists:

- backend reachable
- registry status
- collection status
- seed status
- admins status
- backup status
- revisions/audit status
- missing scopes/docs
- health evidence

Revisions/audit API discovery remains marked `unsupported` because the connector does not yet have a confirmed route for that capability.

## Required Seed Data Validated

The Mongo health check validates boot-critical legacy-compatible documents/scopes:

- `bihs_master_config_v1.txt` as config/master
- `users_data.txt` as admins/list
- `events_data.txt` as events/list
- `nav_data.txt` as navigation/list
- `site_content_data.txt` as content/site
- `theme_data.txt` as design/theme
- `widgets_data.txt` as widgets/config
- `external_links_data.txt` as externalLinks/list
- `gantt_data.txt` as gantt/settings

If any required doc is missing, the site is not considered ready.

## Health Behavior

TXT sites keep the existing SharePoint/TXT critical health checks:

- siteDB
- siteUsersDb
- dist
- index
- required TXT files

Mongo sites use different critical checks:

- siteDB hosting path
- dist
- index
- runtime config exists
- runtime config valid
- data backend reachable
- Mongo registry ok
- safe collection ok
- seed docs ok

Missing TXT files are not fatal for Mongo-backed sites unless a future configuration explicitly marks them as required fallback/compatibility artifacts.

## Page-By-Page Storage-Aware Updates

Dashboard:

- Shows TXT, Mongo, and Unknown counts.
- Shows Mongo data-ok and Mongo seed-warning counts.
- Does not rely on TXT status as the only health signal.

Sites list:

- Shows storage backend badge.
- Shows runtime config status.
- Shows data backend status.
- Shows Mongo seed status for Mongo sites.

Site details:

- Shows runtime config path and URL.
- Adds runtime config validation action.
- Adds Mongo backend health action for Mongo sites.
- Displays runtime config status, backend host, site id, API key status, warnings.
- Displays Mongo registry, collection, seed, backup, missing docs, and safe collection name.

Health:

- Adds runtime config action.
- Adds Mongo health action.
- Shows storage backend per row.
- Shows TXT checks for TXT sites and seed checks for Mongo sites.

Diagnostics:

- Adds runtime config diagnostics.
- Adds Builder/Mongo backend connector diagnostics.
- Shows backend host only, not raw secrets.
- Shows API key configured yes/no.
- Shows missing seed docs/scopes and warnings.

Admins:

- Mongo sites now label Mongo/Builder backend as the app-admin source of truth.
- SharePoint Site Collection and Owners Group are presented as hosting access, not app-admin authority.
- TXT repair is blocked for Mongo-backed sites.

Backups:

- TXT sites keep SharePoint/browser file backup behavior.
- Mongo sites show Builder backend backup capability.
- Mongo sites do not run TXT-copy backup as the primary backup.
- Full Mongo backup execution is intentionally not implemented yet.

Releases / Deploy:

- Deploy still targets SharePoint frontend/dist hosting.
- Mongo deploy plans skip runtime config files so a frontend release does not accidentally overwrite `sitebuilder-runtime-config.json` or `runtime-config.json`.
- Mongo deploy readiness requires runtime config and Mongo backend checks.

Jobs / Audit / Settings:

- Job connector modes now include `mongo-backend`, `server-local`, `backend-service-auth-required`, and `manual`.
- Audit actions were added for runtime config validation and Mongo backend health.
- Settings exposes storage backend rules, allowed backend URLs, and credential-reference behavior.

## False Positive Fixes

Guards/tests now cover:

- Duplicate `siteCode` allowed when physical/runtime identity differs.
- Identity includes runtime config path and Mongo identity.
- Registry-only Mongo sites are not promoted to ready without runtime/Mongo verification.
- Missing seed docs block Mongo readiness.
- Missing TXT files are fatal for TXT sites.
- Missing TXT files are not fatal for Mongo sites.
- Runtime config with wrong site id is a mismatch.
- Runtime config validation redacts raw API keys.
- Builder backend health does not call a backend without a configured credential reference.
- Builder backend health does not call a backend outside the configured allowlist.
- Mongo deploy plans preserve runtime config instead of overwriting it accidentally.

## Tests Added Or Updated

Coverage added/updated for:

- storage backend schema/model validation
- model indexes for storage/runtime/Mongo fields
- duplicate `siteCode` physical/runtime identity
- nested SharePoint path preservation
- runtime config validation and redaction
- Mongo backend health
- missing seed docs blocking readiness
- TXT vs Mongo health derivation
- storage-aware Dashboard/Sites/Health/Diagnostics/Admins/Backups/Settings UI strings
- Mongo backup planning behavior
- Mongo admin source labeling
- deploy readiness/runtime config preservation

Final test result:

- `npm test`: 43 test files passed, 182 tests passed.

Final build result:

- `npm run build`: server TypeScript build passed, client TypeScript/Vite build passed.
- Vite still reports the existing large chunk warning for the client bundle.

## Remaining Blockers Before Full Create-New-Mongo-Site

The following are intentionally not complete in this phase:

- Full "Create new Mongo-backed Site Builder site" execution flow.
- Mongo site registry creation.
- Mongo safe collection creation.
- Mongo seed document write/init.
- Initial Mongo admins write/init through Builder backend.
- Full Mongo backup execution.
- Confirmed revisions/audit API route integration.
- Production credential-reference storage beyond environment variable references.
- End-to-end Browser SharePoint plus Builder backend provisioning wizard.
- Migration/export workflow from SharePoint TXT to Mongo inside the HUB.

The HUB is now ready for the next implementation phase: building a planned, verified create-new-Mongo-site flow on top of the storage-aware model, runtime config validator, and Builder/Mongo health connector.
