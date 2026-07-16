# SiteBuilder Hub simplification + Mongo S0/S1 integration report

## Baseline identity

| Item | Verified value |
|---|---|
| Product source branch | `codex/hub-product-simplification-stabilization` |
| Product source HEAD | `368e841bc5162f1da20c2afeaa0f9530e0394389` |
| Mongo source branch | `codex/hub-mongo-consolidation-hardening` |
| Mongo S0/S1 source HEAD used | `00fb922` |
| Mongo branch HEAD intentionally excluded | `39857a26f7339385816b434b2d5045b8b75f9b91` (contains S2/no-go artifacts) |
| Common ancestor | `5685903b64ccf709fb872522e4e71683b6af9eb7` |
| Integration branch | `codex/hub-simplification-hardening-integration` |
| Integration worktree | `/Users/meni/dev/sitebuilder-hub-simplification-hardening-integration` |
| Integration commit | `d679f57` |

The canonical `main` checkout and both source worktrees were left untouched. The Mongo source worktree was clean before merge. No production target, migration apply, push, PR, merge to main or deployment was performed.

## Merge and ownership

The integration started from the product stabilization HEAD and used a reviewed `merge --no-commit --no-ff` of the S0/S1 commit. The only merge conflict was `.gitignore`; it was manually resolved to retain Playwright artifacts and both Mongo evidence/reconciliation output directories. Root `package.json` was manually reviewed and retains the frontend test/build scripts plus `mongo:site-indexes` and `mongo:reconcile`. `npm install`, `npm --prefix server install`, and `npm --prefix client install` regenerated lock metadata without hand-editing integrity values.

Mongo ownership is limited to startup hardening, sanitized Mongo target/error output, explicit index migration planning/apply commands, read-only evidence/reconciliation, related tests and test environment initialization. Product ownership remains with the stabilization branch for shell, four-area navigation, routes, modes, `hubDomain`, presentation contracts, client dependencies and browser/Axe tests. The only frontend edit in integration was advancing deterministic scenario timestamps by one day so the completion scenario remains fresh on the current date; no product decision or surface was changed.

## Contracts preserved

- Normal mode exposes exactly Dashboard, Sites, Operations and Settings.
- Admin and Viewer remain the only visible roles; malformed roles fail closed.
- Site workspace remains Overview, Access, Structure, Backups and Activity, with four setup stages.
- Help/Labs remain disabled by default and Diagnostics/Advanced remain gated.
- HUB `/api/sites` remains the control-plane boundary; no `/api/site-data/v1` implementation or call was added.
- HUB and Builder identities, duplicate `siteCode` semantics, separate `sites` collections and explicit identity fields remain distinct.
- Startup uses `autoIndex:false`/`autoCreate:false` and inspection only; no startup DDL, DML, backfill or index repair is imported.
- Index changes require explicit dry-run/apply commands and exact confirmation; reconciliation is read-only with JSON/CSV/Markdown output and stable exit codes.
- Mongo URI values are sanitized in target/error output and startup logs.
- No S2 implementation, Gateway work, persistent binding migration, data migration or Builder repository change was included.

## Verification evidence

| Gate | Result |
|---|---|
| Unit/integration | `MONGO_URI=mongodb://127.0.0.1:27017/sitebuilder_hub npm test`: 71 files, 323 tests passed |
| Server/client build | `npm run build`: TypeScript server and Vite client passed; main JS 299.52 kB, CSS 219.96 kB, lazy chunks emitted; existing `hub-config.js` module warning only |
| Browser/Axe | `npm run test:browser`: 29/29 passed (26 product scenarios + 3 accessibility checks) |
| Dependency install | Root/server/client installs completed; no install-time failure |
| Migration dry-run | Command executed against local loopback URI with 1s selection timeout; failed safely with sanitized `Target Mongo connection failed for database sitebuilder_hub` and no URI leakage. `--apply` was never run. |
| Reconciliation | Command executed against approved local loopback URIs with `sitebuilder_hub` and `site_builder_dev`; source was unavailable and command returned stable source-failure exit `30` without creating repair actions. Reconciliation unit tests pass and prove read-only JSON/CSV/Markdown behavior. |
| Startup logging | Local startup against a credential-bearing loopback URI emitted only sanitized host alias/database/authentication metadata; raw URI and password scan returned `no`. |
| Secret scan | No real credentials or raw Mongo URI appeared in generated build/log output. The only URI-like value is a synthetic secret-safety test fixture. |

## Visual QA

The stabilization screenshot set was reused because the integration changed no visual product surface. Coverage includes Dashboard light, Site workspace dark, Operations light, Settings/Advanced, Viewer, partial-failure, mobile navigation dark, mobile Site Overview and mobile Create. The 29 browser checks additionally verified four-item navigation, status vocabulary, gated routes, dialog focus, light/dark switching and 390px overflow behavior. Representative evidence is under `/Users/meni/.codex/visualizations/2026/07/14/019f618c-193c-7d21-88e3-79b9e9008d57/sitebuilder-hub-stabilization/`.

## Known environmental limitation

No local Mongo daemon was running in this worktree, so CLI dry-run/reconciliation could not produce a data-backed report. The commands were still exercised against loopback-only targets with bounded selection timeouts, and failure output was verified to be sanitized. A future local verification may repeat those read-only commands against an approved local Mongo instance; it must not use `--apply`.
