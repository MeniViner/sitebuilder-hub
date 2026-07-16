# Mongo consolidation S0/S1 hardening and migration runbook

This document is based on direct inspection of the two isolated repositories and the uncommitted audit artifacts in the original HUB working tree (`docs/sitebuilder-mongo-consolidation-audit.md`, inventory JSON and roadmap). Those audit files were read in place and were not copied or modified. No production Mongo evidence was available or collected in this phase.

## Verified current interaction

- HUB uses Mongoose and its configured `MONGO_URI` for the control-plane database. Its `Site` records contain explicit Builder/runtime metadata (`builderSiteId`, legacy `mongoSiteId`, `safeCollectionName`, storage status and backend URL metadata), but HUB does not open a second application-runtime connection to Builder's data database.
- Builder owns a native-driver `MongoClient`, chooses `MONGODB_DB_NAME`, keeps a registry `sites` collection plus `site_data_revisions`, `site_data_audit_logs` and one sanitized physical collection per site. Its documents retain logical `_id=scope:entityId`, optimistic `version`, hash and soft-delete semantics.
- HUB `/api/sites` is a control-plane API. Builder's `/api/sites/...` routes are the existing data-plane/compatibility API. They currently run as separate services; configured backend URL metadata is the boundary. No gateway route is mounted by this phase.
- HUB identity is the control record/ObjectId plus `siteIdentityKey`; Builder identity is exact `siteId` plus `safeCollectionName`. Existing duplicate `siteCode` values are valid. Runtime JSON chooses `txt` or `mongo` and, for Mongo, names an explicit Builder site/backend.
- HUB jobs/maintenance workers start only after Mongo validation. Builder request handlers use the native repository. Authentication and service credentials remain as currently configured; this phase changes no auth scheme or credential ownership.

### Refreshed local Mongo evidence (2026-07-15)

A direct read-only metadata/count refresh against `127.0.0.1:27017` confirmed MongoDB `7.0.35`, standalone topology, authentication disabled and TLS disabled. Docker publishes `sitebuilder-hub-mongo` on `0.0.0.0:27017`. This remains development evidence, not production readiness.

- `sitebuilder_hub` contains 4 `sites`, 57 control audit rows, 7 releases, 8 admin snapshots, 1 version deployment, and no current jobs/backups/monitoring alerts. HUB index dry-run found the non-unique `siteCode_1` and required unique partial `siteIdentityKey_1` healthy, with no duplicates, missing identity keys or planned actions.
- `site_builder_dev` contains one registry site (`local-dev-site`), its 5-document physical collection, 15 revisions and 16 data-audit rows. Builder index dry-run found all five global and three physical definitions present with no planned actions. Read-only checks found no wrong-site documents, invalid versions/deleted state, revision orphan or audit orphan.
- The implemented cross-database reconciliation returned exit `10`: 4 HUB-only records with missing explicit Builder mapping (and duplicate `siteCode` warnings), plus one Builder-only registry record. It found 0 blockers. No environment-specific report is committed.

The current Builder database is therefore `site_builder_dev`; `sitebuilder_site_data` is the target logical database name and must be created/populated only in a later approved migration phase.

## Firm target architecture

The target is one HUB-owned, authenticated, TLS-enabled Mongo replica-set deployment with tested backups and restores. It contains two logical databases with deliberately separate ownership:

- `sitebuilder_hub`: HUB control plane. Mongoose models, HUB site lifecycle/jobs/releases/operations and the HUB `sites` collection remain owned by HUB.
- `sitebuilder_site_data`: Builder data plane. The native Mongo driver, Builder registry `sites`, physical per-site collections, revisions and site-data audit remain owned by Site Builder.

The two `sites` collections are unrelated schemas. They must not be merged or renamed. HUB may later hold a non-authoritative `siteDataBinding`, but S0/S1 does not persist or backfill it. Exact mapping uses explicit `builderSiteId`/`mongoSiteId`/safe collection fields; duplicate `siteCode` is valid and is never used to select a record.

Normal HUB and Builder process startup is now read-only after connection. HUB uses `autoIndex:false` and `autoCreate:false`; both applications list/compare indexes and report healthy, warnings or blockers. In production, critical unique-index/integrity blockers stop startup. In development/test, inspection reports warnings/blockers but never silently repairs. Builder explicit `ensureSite` provisioning still creates the existing physical indexes; that request-time/create-site contract is intentionally unchanged and remains a later hardening decision.

## Commands and safety model

HUB inspection/planning is dry-run by default:

```bash
npm run mongo:site-indexes -- --dry-run
npm run mongo:site-indexes -- --dry-run --json
npm run mongo:site-indexes -- --apply --confirm SITE_INDEX_MIGRATION
```

Builder inspection/planning is also dry-run by default:

```bash
npm run mongo:indexes -- --dry-run
npm run mongo:indexes -- --dry-run --json
npm run mongo:indexes -- --apply --confirm BUILDER_INDEX_MIGRATION
```

`--apply` without the exact second confirmation fails. Apply is never imported by application startup. HUB apply can drop the legacy unique `siteCode_1`, backfill deterministic identity candidates and create the current required definitions; it refuses duplicate candidates. Builder apply creates only the exported existing global/known-physical definitions and never changes documents or naming. This implementation task did not execute apply mode.

## Read-only reconciliation

Supply URIs only through environment variables; values are never printed:

```bash
export HUB_AUDIT_MONGO_URI='<secret>'
export BUILDER_AUDIT_MONGO_URI='<secret>'
npm run mongo:reconcile -- \
  --hub-db sitebuilder_hub \
  --builder-db sitebuilder_site_data \
  --runtime-root /path/to/deployed/artifacts \
  --output mongo-consolidation-reconciliation \
  --format all
```

Optional `--site <technical-id>` limits HUB rows for development analysis. Formats are `all`, `json`, `csv`, or `markdown`. Files are `sitebuilder-mongo-reconciliation.{json,csv,md}`. The native clients set `retryWrites:false`; collectors expose no mutation methods and import no application startup, models, workers or schedulers.

Exit codes are stable: `0` clean/informational, `10` warnings, `20` blocking mapping/data-integrity findings, `30` invalid configuration or inaccessible source, `40` output secret-safety failure. A report is evidence, never an automatic repair instruction.

## Phased migration plan and validation gates

1. **S0 production discovery.** Run the Windows evidence collector in the classified environment, validate it locally there, peer-review command output and topology. Gate: schema/secret/policy validator passes; deployment owner confirms services, ports, IIS, backup jobs, Mongo topology/auth/TLS/FCV, databases, collections, indexes and runtime artifacts. Rollback: none—read-only collection only; discard the evidence directory if validation fails.
2. **S1 hardening deployment.** Deploy only startup/log hardening while keeping both existing Mongo targets. Gate: process startup performs zero DDL/DML, sanitized logs contain no URI/user/password/query secret, production critical-invariant policy is understood, existing API/repository tests pass. Rollback: redeploy the exact prior application binaries/config; no database rollback is required because startup made no writes.
3. **S1 explicit index repair, if approved separately.** Archive dry-run JSON, resolve every duplicate, back up, test restore, take a fresh index snapshot, then invoke confirmed apply during an approved window. Gate: plan is reviewed, target/database are correct, no blockers, backup/restore proof exists, post-apply inspection is healthy and Builder compatibility tests pass. Rollback: stop application rollout; restore the pre-change index definitions explicitly from the captured plan. If a HUB backfill was separately authorized and applied, restore affected documents from the pre-operation backup—never guess or delete identity values ad hoc.
4. **S1 reconciliation baseline.** Run read-only reconciliation against both real databases plus runtime roots. Gate: exit `0` or formally accepted warning-only `10`; every `20` blocker has an owner; counts/hashes and technical IDs are reviewed without payloads or personal lists. Rollback: none—delete generated reports according to evidence handling policy.
5. **S2 shadow design (future, not performed).** Only after S0/S1 gates, design dual-read/shadow validation and an immutable mapping manifest. Gate: exact explicit mapping, no duplicates/orphans/integrity blockers, capacity and backup evidence, gateway/auth design approved. Rollback must preserve the original Builder URI and data path.
6. **S3 cutover (future, not performed).** Freeze writes, final reconcile, copy with manifest/count/hash verification, shadow-read, then switch configuration in a reversible window. Gate: all prior gates plus rehearsed rollback, compatibility/API parity, monitoring and ownership sign-off. Rollback: switch runtime/config back to the original Builder deployment, unfreeze the original source, and quarantine—not merge—target writes created after the cutover boundary.

No later phase may reuse a stale report. Each gate requires a timestamped, target-sanitized plan and fresh read-only evidence.

## Remaining blockers before S2

- Real Windows services/IIS/Docker/Mongo topology/auth/TLS/backup evidence is still missing.
- Real HUB↔Builder mapping, duplicate/orphan and document-integrity results have not been collected.
- Backup restore has not been rehearsed for the target deployment.
- The future gateway identity, site authorization and credential transition require security approval.
- The non-authoritative binding is not persisted and must not become authoritative until a reviewed additive schema/migration exists.
