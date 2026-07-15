# SiteBuilder Hub Product Simplification Plan

Date: 2026-07-15  
Branch: `codex/hub-product-simplification`  
Worktree: `/Users/meni/dev/sitebuilder-hub-product-simplification`

## 1. Current baseline

- Commit and remote baseline: `5685903b64ccf709fb872522e4e71683b6af9eb7`.
- Canonical checkout remains on `main` and contains four pre-existing untracked audit/Mongo documents; this worktree was created to avoid modifying them.
- Node `v24.15.0`; npm `11.12.1`.
- Baseline tests: `MONGO_URI=mongodb://127.0.0.1:27017/sitebuilder_hub npm test -- --run` — 62 files, 267 tests passed.
- Baseline build: server/client passed.
- Baseline client bundle: JS 1,048.71 kB minified / 276.90 kB gzip; CSS 194.06 kB / 30.96 kB gzip.
- Known build notices: non-module `hub-config.js`; main chunk above 500 kB.
- First test attempt without an explicit `MONGO_URI` failed in environment validation; no product test failed.

## 2. Current route inventory

Current static imports expose `/`, `/sites`, `/sites/:id`, `/releases`, `/backups`, `/admins`, `/jobs`, `/monitoring`, `/audit`, `/health`, `/diagnostics`, `/help`, `/settings`, `/analytics`, `/dashboard-lab`, `/dashboard-design-studio` and `/dashboard-northstar`.

Normal navigation currently exposes fourteen items and mixes objects, outcomes, governance, support and Labs. Site Details exposes eight tabs. Dashboard, Health, Monitoring, Analytics and Diagnostics repeat overlapping status information.

## 3. Final route manifest

| Route | Label | Area | Mode | Normal visibility | Role presentation | Lazy boundary |
|---|---|---|---|---|---|---|
| `/` | Dashboard | Dashboard | Normal | primary | Admin/Viewer | eager |
| `/sites` | Sites | Sites | Normal | primary | Admin/Viewer | eager |
| `/sites/new` | Create site | Sites | Normal | contextual | Admin mutation; Viewer hidden/blocked | lazy |
| `/sites/:id` | Site workspace | Sites | Normal | contextual | Admin/Viewer | lazy |
| `/operations` | Operations | Operations | Normal | primary | Admin/Viewer | eager |
| `/settings` | Settings | Settings | Normal | primary | Admin/Viewer | eager |
| `/advanced/settings` | Technical settings | Settings | Advanced | advanced link | Admin | lazy |
| `/advanced/sites` | Technical site orchestration | Sites | Advanced | setup continuation only | Admin | lazy |
| `/advanced/sites/:id` | Technical site details | Sites | Advanced | contextual only | Admin | lazy |
| `/releases` | Detailed releases | Operations | Advanced | contextual only | Admin | lazy |
| `/backups` | Detailed recovery | Operations | Advanced | contextual only | Admin | lazy |
| `/admins` | Detailed access | Sites | Advanced | contextual only | Admin | lazy |
| `/jobs` | Raw jobs | Operations | Diagnostics | hidden | Admin | lazy |
| `/monitoring` | Monitoring details | Operations | Advanced | contextual only | Admin | lazy |
| `/audit` | Audit details | Operations | Diagnostics | hidden | Admin | lazy |
| `/health` | Health details | Sites | Advanced | contextual only | Admin | lazy |
| `/analytics` | Analytics | Operations | Advanced | hidden/contextual | Admin | lazy |
| `/diagnostics` | Diagnostics | Settings | Diagnostics | explicit mode only | Admin | lazy |
| `/help` | Help | Settings | Help | explicit/contextual only | Admin/Viewer | lazy |
| Dashboard experimental routes | Labs | none | Labs | explicit flag only | internal | lazy |

Disabled mode routes render a calm unavailable/not-found state and do not appear in navigation.

## 4. Legacy-route compatibility

- Keep valuable legacy route components intact and lazy-loaded.
- Remove them from normal navigation, not from source or persisted contracts.
- Preserve direct links from contextual Advanced surfaces.
- Keep HashRouter.
- Site tab mapping:
  - `overview`, `health` → Overview
  - `deployment`, `versions` → Overview with Update context
  - `access`, `admins` → Access
  - `hosting`, `advanced` → Structure; `advanced` opens details
  - `recovery`, `backups` → Backups
  - `activity`, `jobs`, `audit` → Activity

## 5. Screen composition map

### Dashboard

- up to three metrics;
- Needs attention, maximum five;
- Quick actions: create, open, update, backup;
- Operations in progress only when non-empty;
- Recent activity, maximum five.

### Sites

- search and one essential condition filter;
- compact site summaries: name, human condition, current version, last checked, last verified recoverable backup;
- one Open action and compact secondary menu;
- no normal storage/connector/path mapping.

### Create site

Four visible stages: Details, Destination, Create, Complete. Existing TXT/Mongo/Add Existing orchestration remains behind a frontend domain facade. Progression validates before advancing. Partial completion is never labelled success and offers Continue setup based on persisted lifecycle/provisioning evidence.

### Site workspace

Compact header plus Overview, Access, Structure, Backups, Activity. Each area begins with human state and action. Technical evidence is in an Advanced drawer/details block.

### Operations

Outcome-first groups: updates/deployments, backups/restores, running, failed and recent activity. Raw Jobs, approvals, schedules and evidence objects are not the organizing model. Detailed legacy workflows remain contextual.

### Settings

Theme, visible role/session and user-relevant configuration. Technical configuration moves to Advanced. Diagnostics are explicitly enabled support content.

## 6. Status mapping

Create one tested mapping module:

- ready/planned/pending/manual/browser-required/blocked → Ready when safe to begin, or Failed when the internal state represents a terminal blocker;
- queued/preflight/running/uploading/verifying/retrying/waiting-external/partial → In progress;
- completed/success/succeeded/verified → Succeeded;
- failed/error/rejected/cancelled/expired/recovery-required → Failed.

Site condition mapping combines lifecycle, provisioning, health and availability without changing persistence:

- Ready;
- Needs attention, including incomplete/unknown/stale;
- Unavailable, including archived or terminal failed/unreachable conditions.

The mapping retains reason and internal state for Advanced details.

## 7. Content-removal rules

- One PageHeader title, one short sentence and at most one primary action.
- No infrastructure cards, evidence matrices, internal connector names or raw enums in Normal.
- No paragraph survives in the first viewport unless it changes the next decision.
- Do not replace removed paragraphs with tooltips.
- Status, blocker and recovery copy use short Hebrew outcome language.
- Technical values use Advanced/Diagnostics and bidi isolation.

## 8. Typography plan

- Add local `@fontsource/assistant`, weights 400/500/600/700 only.
- Add semantic tokens for page title, section title, card title, body, label, metadata and technical value.
- Body approximately 16px; supporting text approximately 14px.
- Replace arbitrary weights and tiny metadata in touched normal surfaces.
- Apply font smoothing, balanced headings, pretty short copy and tabular numerals where values update.
- Raise subtle-token contrast in Light and Dark.

## 9. Design-system changes

- Centralize route policy, status presentation and visible role presentation.
- Add calm `HumanStatus`, `ActivityRow`, `SiteSummary`, `OperationSummary`, `FormStepper` and domain blocker primitives.
- Make `ConfirmDialog`, `ProtectedActionDialog` and create overlays follow `DetailsDrawer` focus behavior.
- Use approximately 44px hit areas and explicit transitions; no `transition: all`.
- Add product-simplification CSS in a scoped normal layer; leave historical/Lab CSS intact but out of the normal first render where practical.

## 10. Accessibility and responsive requirements

- Verify 1440×900, 1024×768 and 390×844 in Light and Dark.
- No page-level horizontal overflow or clipped controls.
- Mobile prioritizes the primary task rather than stacking every detail.
- All buttons/links are keyboard reachable with visible focus.
- Dialog title, semantics, focus trap, Escape and focus return are mandatory.
- Status includes text/icon, not color alone.
- URLs/IDs/versions/emails/paths use `dir=ltr` or `bdi` while retaining RTL sentence order.
- Viewer never sees enabled mutation controls.

## 11. Frontend domain/facade boundaries

Create a `hubDomain` facade used by all new normal pages:

- `listSites`, `getSite`, `checkSite`;
- `createSite`, `continueSiteSetup`;
- `listOperations`, `deployVersion`;
- `listBackups`, `createBackup`, `restoreBackup`;
- `getAccess`, `updateAccess`.

The facade adapts existing `sitesApi` and browser connectors without making pages depend on current Builder HTTP, Browser SharePoint, HUB control endpoints or future `/api/site-data/v1` paths. Control-plane/data-plane identities remain typed separately. This phase adds no future endpoint and performs no backend consolidation.

## 12. Test and screenshot plan

Add focused tests for:

- route manifest and mode defaults;
- Help/Labs disabled by default;
- exactly four navigation items;
- Admin/Viewer presentation and mutation visibility;
- status and site-condition mapping;
- legacy tab mapping;
- managed-site ID navigation;
- recoverable backup versus evidence-only presentation;
- partial data loading;
- dialog semantics/source-level focus behavior where static test infrastructure permits.

Run focused tests after each slice, then full `npm test -- --run`, server/client TypeScript builds and full build. Capture Dashboard, Sites, Create, five site areas, Operations, Settings, Advanced and mobile navigation in required viewports/themes.

## 13. Incremental implementation sequence

1. Foundation: route/mode/status/role/facade and tests.
2. Shell and canonical Dashboard.
3. Sites and four-stage Create.
4. Five-area Site workspace.
5. Operations and calm Settings/Advanced.
6. Overlay accessibility, typography, content and responsive refinements.
7. Runtime screenshot loop, measurements and fixes.
8. Final report and coherent local commits.

## 14. Rollback strategy

- Keep legacy components and API contracts intact.
- Each coherent slice is a local commit.
- Normal route components can be reverted independently to legacy routes.
- Route manifest/mode flags provide a contained rollback path for Labs/Diagnostics.
- No database or server migration is involved.
- Do not use destructive Git commands; revert coherent commits if rollback is required.

## 15. Mongo Consolidation Coordination

- Preserve both `sites` meanings and all mapping fields.
- Use managed HUB `_id` for normal navigation.
- Never infer Builder identity from `siteCode`.
- Keep Mongoose control-plane concepts separate from native-driver data-plane concepts in types/facades.
- Do not add or alias `/api/site-data/v1`.
- Treat HUB backup evidence as non-recoverable unless a payload/verification contract proves recoverability.
- Hide evidence without stopping collection or persistence.
- Keep current Builder HTTP connector behind the facade so the future compatibility gateway can replace it without page rewrites.

## 16. No-touch files

No structural modifications are planned for:

- `server/src/config/env.ts`
- `server/src/db/mongo.ts`
- `server/src/db/siteIndexes.ts`
- `server/src/index.ts`
- `server/src/app.ts`
- `server/src/models/Site.ts`
- `server/src/models/Job.ts`
- `server/src/services/builderMongoHealth.service.ts`
- `server/src/services/mongoSiteCreation.service.ts`
- `server/src/services/runtimeConfig.service.ts`
- `server/src/services/jobs.service.ts`
- `server/src/services/jobs.worker.ts`
- backup/restore services, auth middleware, validators and identity helpers.

## 17. Files with overlap risk

- `client/src/api/sitesApi.ts`
- runtime/storage/identity utilities;
- `client/src/App.tsx`;
- shared shell/status/dialog components;
- `client/src/styles/index.css`;
- large legacy pages that the new normal pages replace at routing level.

Mitigation: additive facade and new pages/components, minimal edits to medium-risk contracts, no broad formatting, small commits and tests.

## 18. Explicitly deferred work

- Mongo migration/consolidation, target topology and data copy;
- canonical `siteDataBinding` persistence;
- production auth/RBAC rewrite;
- trusted gateway and site-scoped token;
- `/api/site-data/v1`;
- transactional writes, job leases and worker retries;
- real unattended scheduling;
- database-level backup/PITR;
- evidence retention policy;
- Builder runtime artifact migration;
- production connector and restore drills.
