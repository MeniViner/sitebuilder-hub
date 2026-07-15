# SiteBuilder Hub product-simplification integration readiness

Status: ready for a later reviewed integration; no merge performed

Review date: 2026-07-15 (Asia/Jerusalem)

## Reviewed inputs

- Frontend baseline: `codex/hub-product-simplification-stabilization`, starting from `c3a23daf1a979263f39fcf974fcbeae2f04de4a4`.
- Mongo S0/S1 hardening: committed `codex/hub-mongo-consolidation-hardening` HEAD `00fb922` (`feat: harden Mongo consolidation validation`).
- Common ancestor: `5685903b64ccf709fb872522e4e71683b6af9eb7`.
- The comparison was read-only. No commit was cherry-picked or merged.

The Mongo hardening worktree currently contains additional uncommitted changes beyond `00fb922`, including evidence/reconciliation code, fixtures, tests, and runbook edits. Those changes were not treated as an integration target. Freeze and review a committed Mongo target, then repeat the name-status and conflict comparison before integration.

## Exact and logical overlap

At the reviewed commits, both branches change exactly two paths relative to the common ancestor:

| Path | Frontend intent | Mongo intent | Resolution |
|---|---|---|---|
| `.gitignore` | Ignore `.playwright-artifacts/` | Ignore Mongo evidence/reconciliation output | Manually keep all three new ignore entries. Neither side wins alone. |
| `package.json` | Add `test:browser`, Playwright, and Axe dev dependencies | Add `mongo:site-indexes` and `mongo:reconcile` scripts | Manually union scripts and dev dependencies. Do not accept either file wholesale. |

The following files do not currently have textual overlap, but they are integration-sensitive and must be reviewed together:

| Path/group | Required result |
|---|---|
| `package-lock.json` | Start from the frontend lockfile, union the root manifest, then run `npm install` once and review the lock diff. Preserve Playwright/Axe; Mongo adds scripts only at root. |
| `server/package.json`, `server/package-lock.json` | Take the Mongo S0/S1 versions. The frontend branch intentionally does not touch server files. |
| `client/package.json`, `client/package-lock.json` | Take the stabilization versions so the local Assistant font remains reproducible. |
| `tests/setup/env.ts` | Take the Mongo S0/S1 initialization change; the stabilization branch does not modify it. Then run the entire combined suite with explicit `MONGO_URI`. |
| `tests/` | Keep both additive suites: product scenarios/domain/browser tests and Mongo startup/reconciliation/index/evidence tests. Do not resolve the directory by choosing one side. |
| `docs/` | Keep both documentation families. The product report governs frontend semantics; `docs/mongo-consolidation/` governs S0/S1 safety and future gateway constraints. |
| `.env.example` | Preserve the frontend safe defaults `VITE_HUB_UI_MODE=normal`, `VITE_HUB_HELP_ICONS_ENABLED=false`, and `VITE_HUB_LABS_ENABLED=false`. Do not add secrets, production targets, database renames, or implicit migration flags. |
| `README.md` | Preserve the Normal-mode/Help guidance from the frontend branch. Add only reviewed links to the Mongo runbooks and explicit dry-run commands; do not replace the product-mode guidance. |

## Recommended integration order

1. Require a clean, reviewed Mongo S0/S1 commit; never integrate its current dirty worktree implicitly.
2. Create a temporary integration branch from the finalized stabilization HEAD.
3. Merge the frozen Mongo S0/S1 commit without auto-committing.
4. Resolve `.gitignore` and `package.json` by manual union as described above.
5. Accept Mongo ownership for every `server/` change and stabilization ownership for the normal-product `client/` changes. Any unexpected cross-boundary edit is a stop-and-review condition.
6. Regenerate only the affected lockfile from the unioned manifest; do not hand-edit integrity entries.
7. Confirm that the frontend still contains no implementation or call to `/api/site-data/v1`. The Mongo gateway document is a future contract, not an active endpoint.
8. Run the combined verification matrix and inspect the final diff before creating an integration commit.

## Environment and architecture invariants

The integration must preserve all of the following:

- `MONGO_URI` remains the HUB control-plane connection; it must not be repointed silently.
- `sitebuilder_hub` and the Builder data database remain separate logical databases with unrelated `sites` collections.
- `sitebuilder_site_data` is a target name in the Mongo runbook, not authorization to create, copy, rename, backfill, or cut over data.
- `siteCode` remains non-unique and cannot select a HUB or Builder record.
- HUB managed `_id`, `builderSiteId`, `mongoSiteId`, `safeCollectionName`, and `siteIdentityKey` remain distinct.
- Normal startup remains read-only after connection; index and reconciliation mutations remain explicit commands with their existing confirmation gates.
- Mongo URIs and credentials remain environment-only and secret-safe.
- The default frontend remains Normal mode with four primary areas, two visible roles, five Site workspace areas, and four setup stages.

## Scripts that must survive

Root scripts after the manual union must include:

- `test`, `test:browser`, and `build`;
- `mongo:site-indexes` and `mongo:reconcile`;
- the existing `migrate:sharepoint-browser-only`, closed-network, seed, and development scripts.

Server scripts must retain `mongo:site-indexes` and `mongo:reconcile`. No command may be renamed to imply that dry-run or explicit confirmation is optional.

## Combined verification commands

Run from the integration worktree:

```bash
npm install
npm --prefix server install
npm --prefix client install
MONGO_URI=mongodb://127.0.0.1:27017/sitebuilder_hub npm test
MONGO_URI=mongodb://127.0.0.1:27017/sitebuilder_hub npm run build
npm run test:browser
npm run mongo:site-indexes -- --dry-run --json
```

Run reconciliation only with approved read-only audit targets and secret environment variables. Do not substitute local fixture success for production evidence.

## Files not to auto-resolve

Do not auto-resolve or choose a side wholesale for:

- `.gitignore`;
- `package.json` or any package lockfile;
- `.env.example`;
- `README.md`;
- `tests/setup/env.ts`;
- Mongo runbooks, evidence schemas, reconciliation code, or server database startup/index files;
- the product constitution, stabilization report, domain facade, presentation rules, route manifest, or browser tests.

If a later Mongo commit touches normal-product pages or a later frontend commit touches `server/`, stop and re-audit the ownership boundary before continuing.

## Deferred staging proof

Integration readiness does not prove production topology, authentication, TLS, backups, restore rehearsal, real HUB-to-Builder mappings, gateway authorization, or external write compatibility. Those remain staging/production-evidence gates in the Mongo S0/S1 runbook and the frontend stabilization report.
