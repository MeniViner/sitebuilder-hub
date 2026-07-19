# SiteBuilder Hub — local-data acceptance and merge readiness

Date: 2026-07-19
Worktree: `/Users/meni/dev/sitebuilder-hub-simplification-hardening-integration`
Branch: `codex/hub-simplification-hardening-integration`

## 1. Starting branch and commit

Acceptance began clean at `6968c10247afdcf2923908771f7d5defb9e415d4` (`6968c10`, `document safe integration baseline`). It contains merge commit `d679f57` and approved S0/S1 hardening commit `00fb922`; `git merge-base --is-ancestor 39857a2 HEAD` was false, so the later S2/no-go branch head is excluded.

One genuine integration defect was found and fixed: fixed scenario timestamps became stale on 2026-07-19, making the browser completion-path test fail. `client/src/dev/productScenarios.ts` now derives both fresh and stale scenario times from a single run-time timestamp. This preserves the fixture's intended states without advancing hard-coded dates and does not add a capability.

## 2. Mongo local environment

The approved Compose configuration is `docker-compose.yml`. The running local service is `sitebuilder-hub-mongo`, image `mongo:7`, actual MongoDB `7.0.35`, exposed on loopback `127.0.0.1:27017`. It reports a standalone `Single` topology (`isWritablePrimary: true`).

The service reused the existing named volume `sitebuilder-hub_sitebuilder_hub_mongo` from the repository's original local Compose project (`/Users/meni/dev/sitebuilder-hub`); it was not deleted or recreated. Databases observed with a read-only `listDatabases`: `admin`, `config`, `local`, `sitebuilder_hub`, and `site_builder_dev`. No remote target, production credential, or classified environment was used.

## 3. Sanitized startup evidence and before/after comparison

The integrated server was started with a loopback-only `MONGO_URI` on local port 4101. The local test run disabled job workers and maintenance scheduling to isolate normal connection/startup behavior from unrelated background work; no write endpoint was invoked. Sanitized logs showed:

```text
MongoDB connect requested: protocol mongodb, alias mongo-host-1, port 27017,
database sitebuilder_hub, tlsConfigured false, authenticationConfigured false
MongoDB connected and inspected: connectionStatus connected, topology Single,
indexValidation status healthy, missingRequired [], missingRecommended [], blockers []
```

The only observed startup database operations were `sites.indexes`, duplicate-detection aggregates, and `countDocuments` inspection. Connection options are `autoIndex:false` and `autoCreate:false`. No `createIndex`, `dropIndex`, update, insert, delete, backfill, or migration apply operation appeared.

Read-only before, after-startup, and after-acceptance snapshots matched exactly. HUB collections/counts were: `auditlogs` 57, `jobs` 0, `monitoringalerts` 0, `releases` 7, `siteadminsnapshots` 8, `sitebackups` 0, `sites` 4, and `siteversiondeployments` 1. Builder collections/counts were: `site_data_audit_logs` 16, `site_data_revisions` 15, `site_local_dev_site_6737a6f8b4` 5, and `sites` 1. Collection names and complete index-name sets also matched across snapshots.

`GET /api/health/ready` returned `ok`, `mongo: connected`. Startup and CLI output contained only sanitized Mongo target metadata; no raw URI or credential was emitted.

## 4. Explicit index command — dry run only

Both required loopback commands reached Mongo successfully:

```bash
MONGO_URI=mongodb://127.0.0.1:27017/sitebuilder_hub npm run mongo:site-indexes -- --dry-run
MONGO_URI=mongodb://127.0.0.1:27017/sitebuilder_hub npm run mongo:site-indexes -- --dry-run --json
```

Text result: `status: already-current`, zero planned actions, candidate backfills, duplicate candidate groups, blockers, and warnings. The JSON result was valid and secret-safe, with `mode: dry-run`, `status: already-current`, empty `plannedActions`, empty `candidateBackfills`, and no blockers. Exit code was `0`. No `--apply` command was run, and the metadata snapshots confirm no index or document mutation.

## 5. Read-only reconciliation

The following local-only invocation completed:

```bash
HUB_AUDIT_MONGO_URI=mongodb://127.0.0.1:27017/sitebuilder_hub \
BUILDER_AUDIT_MONGO_URI=mongodb://127.0.0.1:27017/site_builder_dev \
npm run mongo:reconcile -- --hub-db sitebuilder_hub --builder-db site_builder_dev --format all
```

It generated JSON, CSV, and Markdown under `server/mongo-consolidation-reconciliation/`, which is ignored by Git. Outputs contained sanitized target aliases only; a raw-secret scan found no URI, password, token, secret, or API-key value. The read-only report had 5 rows, 9 warnings, 0 blockers, and stable exit code `10` (warnings). It reported four HUB-only orphan candidates and one Builder-only orphan candidate. Duplicate `siteCode` was explicitly informational and was not used for mapping. No repair, backfill, rename, index creation, deletion, or migration was run.

## 6. Runtime smoke

The real local frontend and backend were started on `127.0.0.1:5177` and `127.0.0.1:4101` with matching local CORS origin. The initial `localhost`/`127.0.0.1` CORS mismatch was corrected by local runtime configuration only; no code change was needed.

Live backend smoke confirmed Dashboard, Sites, a Site workspace, Operations, Settings, and Advanced Settings render successfully. The normal navigation has exactly four items. The Site workspace exposes exactly five areas: Overview, Access, Structure, Backups, Activity. Live Admin presentation was available through local owner-mode authentication. Help, Labs, and Diagnostics were unavailable by default. Normal workspace text exposed no raw Mongo terms. A clean browser tab recorded no console errors after the corrected configuration.

Viewer fail-closed behavior and partial-backend-failure preservation remain covered through deterministic browser scenarios, as no live Viewer identity was available. No Create Site, Deploy, access mutation, Backup, Restore, approval, or schedule action was submitted.

## 7. Tests, browser checks, and builds

| Check | Result |
| --- | --- |
| `MONGO_URI=mongodb://127.0.0.1:27017/sitebuilder_hub npm test` | 71 files, 323 tests passed |
| Server TypeScript (`npm run build`) | passed |
| Client TypeScript/Vite production build (`npm run build`) | passed |
| `npm run test:browser` | 29 passed: 26 product flows and 3 Axe accessibility checks |

Vite emitted its pre-existing `hub-config.js` non-module warning but completed successfully. Main bundle measurements: JavaScript `299.52 kB` (`95.28 kB` gzip) and CSS `219.96 kB` (`34.93 kB` gzip).

## 8. Final branch review

No S2/no-go code, `/api/site-data/v1`, Gateway implementation, data migration, or backfill entered the branch. The optional `siteDataBinding` validator introduced by S0/S1 only reads a legacy/non-authoritative field for reconciliation; no Site-model persistence, migration, or backfill path was added. Dependency changes remain within the reviewed integration. Generated local evidence is ignored and uncommitted.

## 9. Remaining external-only checks

The remaining checks are intentionally outside this local acceptance: a separately reviewed production-like environment verification, live identity/Viewer behavior, and any later reviewed merge workflow. They must not use this local evidence as authorization to migrate data or deploy.

## 10. Merge-readiness verdict

**Ready as a candidate for a later reviewed merge to `main`.** The live local Mongo success path, startup no-change comparison, explicit index dry run, read-only reconciliation, real local runtime smoke, full unit suite, browser/Axe suite, and builds all passed. Reconciliation warnings are documented local data findings, not blockers; no automatic repair was performed.

No apply, migration, S2 work, production access, push, PR, merge to `main`, or deployment occurred in this phase.
