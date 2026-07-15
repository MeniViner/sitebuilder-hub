# SiteBuilder Hub product simplification — implementation report

Status: frontend simplification complete and verified

Report date: 2026-07-15 (Asia/Jerusalem)

Scope: product, UX, content, typography, design-system, workflow, and frontend architecture

Out of scope by instruction: Mongo migration, backend consolidation, production authentication rewrite, schema merge, cutover, push, pull request, merge, and deployment

## Executive verdict

SiteBuilder Hub now presents a calm internal operator console with exactly four primary areas: Dashboard, Sites, Operations, and Settings. Normal mode exposes only two product roles, Admin and Viewer. Creation and site work are contextual full-page flows. Raw jobs, approvals, scheduling, Labs, diagnostics, evidence matrices, and low-level infrastructure are absent from the normal experience.

The simplification does not erase the system's operational boundaries. Existing evidence, audit, provisioning, backup, identity, compatibility, SharePoint, Builder, and Mongo behavior remains behind a typed frontend domain facade or in lazy Advanced/Diagnostics routes. No server, database, schema, migration, endpoint, or deployment change was made.

The frontend is complete enough to be the implementation baseline for this phase. The remaining integration checks require a staging environment and real external systems; they are documented rather than represented as browser-verified facts.

## 1. Baseline branch and commit

- Canonical repository: `/Users/meni/dev/sitebuilder-hub`
- Baseline branch: `main`
- Baseline commit: `5685903b64ccf709fb872522e4e71683b6af9eb7`
- Baseline subject: `feat: add storage backend policy service and tests`
- Baseline repository was not modified by this work. Its pre-existing untracked documentation was left untouched.
- Baseline verification: 62 test files and 267 tests passed; the production build passed.

## 2. Implementation branch and worktree

- Worktree: `/Users/meni/dev/sitebuilder-hub-product-simplification`
- Branch: `codex/hub-product-simplification`
- Product-contract commit: `03f5d77` — `codex: define simplified product contracts`
- Frontend implementation commit: `9f33c14` — `codex: simplify normal operator experience`
- Frontend boundary audit commit: `6b8dc3c` — `codex: close normal page type boundary`
- This report is committed separately so its evidence can name the implementation commit without circularity.

## 3. Product decisions implemented

### Product constitution

The binding product contract is in `docs/sitebuilder-hub-product-constitution.md`. The implementation follows these decisions:

1. Normal mode is the default and safe fallback for missing or invalid configuration.
2. The sidebar has exactly four primary destinations: Dashboard, Sites, Operations, Settings.
3. The only visible product roles are Admin and Viewer. Unknown roles fail closed to Viewer.
4. Admin can perform product mutations. Viewer is read-only.
5. Advanced is contextual and Admin-only. It is not a fifth primary area.
6. Help and Diagnostics are explicit modes. Labs requires an explicit flag or Labs mode and an internal role.
7. Product status is expressed as four operation states and three site conditions, not backend state vocabulary.
8. Site creation has four stages: Details, Destination, Create, Complete.
9. A site workspace has five areas: Overview, Access, Structure, Backups, Activity.
10. Operations groups outcomes; it does not expose the raw job queue as the product model.
11. A partial creation is never presented as success.
12. A backup is called recoverable only when payload and verification evidence are complete.
13. The managed HUB Site `_id` remains the navigation identity; `siteCode` is never used as identity.

### Requirement-by-requirement proof

| Requirement | Implementation evidence | Verification evidence |
|---|---|---|
| Exactly four primary areas | `PRIMARY_ROUTES` is derived from four `visibility: "primary"` manifest entries; Sidebar renders that list | Static contract tests and desktop/mobile screenshots |
| Admin and Viewer only | `presentVisibleRole`; route roles; mutation guards | Unknown-role fallback and route-role tests |
| Hide approvals and scheduling | No normal route, nav item, dashboard card, workspace area, or Operations group exposes them | Source contract search and route walkthrough |
| Hide raw Jobs | `/jobs` is a hidden Diagnostics route; Operations maps jobs to human outcomes | Normal `/operations` walkthrough; direct `/jobs` gate check |
| Hide Labs | Labs routes are hidden, internal-only, lazy, and explicitly flagged | UI-mode and route-manifest tests |
| Hide evidence matrices and diagnostics | No normal-page component renders them; legacy routes are gated | Normal-route screenshot set and direct-route gate check |
| Hide technical infrastructure | The five-row infrastructure status block was replaced by one calm product status linking to Settings | Before/after Sidebar source and screenshots |
| Keep safety and audit internals | Existing APIs/pages remain; domain facade preserves evidence-aware fields and operations | No server change; lazy legacy route inventory |
| Four-step creation | `SiteSetupPage` stage model and guarded validation | Browser traversal through Details and Destination without submitting |
| Five-area workspace | `SiteWorkspacePage` area model plus legacy tab mapping | Browser traversal of all five areas and query deep links |
| Two-DB architecture | No server or database files changed; identity types preserve physical/logical boundaries | Git diff and architecture review |
| Future API readiness | Normal pages depend on `hubDomain`, not connector-specific imports | Import contract tests; no `/api/site-data/v1` implementation |
| RTL, mobile, dark/light | Scoped RTL product styles, explicit bidi isolation, responsive layout | 38 screenshots at three viewports in both themes |
| Accessibility | Dialog semantics, focus management, 44 px touch targets, reduced motion | Browser focus/Escape checks and UI tests |

### Contradictions resolved during the audit loop

- A release known to the HUB is no longer described as an available update without evidence.
- `lastBackupAt` alone no longer produces a “verified backup” label.
- `partial` and `partially-created` states no longer appear successful.
- `outdated`, `updating`, and failed version states now contribute to “needs attention.”
- Unknown or legacy role strings no longer gain Admin privileges.
- The Dashboard attention metric counts the complete result set even though the visible list is capped at five.
- The new setup flow keeps the legacy Advanced continuation query compatible with `?edit=`.
- Contextual normal pages are lazy and role-gated rather than merely hidden from navigation.

## 4. Mongo consolidation coordination

This work preserves the current target architecture: one HUB deployment with two distinct databases and two distinct responsibilities.

| Boundary | Preserved responsibility |
|---|---|
| `sitebuilder_hub` | Mongoose control-plane data, managed Site `_id`, lifecycle, provisioning, evidence, audit, and operational records |
| `sitebuilder_site_data` | Native-driver builder/data-plane collections and physical site content |

The two collections named `sites` are not treated as the same collection and were not merged. The frontend facade distinguishes:

- `managedSiteId`: HUB Site `_id`, used for routes and control-plane API calls.
- `builderSiteId` and `mongoSiteId`: logical Builder/data-plane identifiers.
- `safeCollectionName`: physical data-plane collection name.
- `siteIdentityKey`: compatibility identity where supplied by the backend.

No Mongo URI, connection, schema, model, migration, storage policy, backend route, seed, or data was changed. No Mongo consolidation was executed. The facade is intentionally compatible with a future HUB-owned `/api/site-data/v1` boundary, but that endpoint was not added or called.

## 5. Files changed

Relative to baseline `5685903`, the branch changes these files:

### Product contracts and documentation

- `.env.example`
- `README.md`
- `docs/sitebuilder-hub-product-constitution.md`
- `docs/sitebuilder-hub-product-simplification-plan.md`
- `docs/sitebuilder-hub-product-simplification-implementation-report.md`

### Configuration and domain boundary

- `client/src/config/routeManifest.ts` (new)
- `client/src/config/uiMode.ts` (new)
- `client/src/domain/hubDomain.ts` (new)
- `client/src/domain/presentation.ts` (new)
- `client/src/help/helpConfig.ts`

### Application shell and accessible primitives

- `client/src/App.tsx`
- `client/src/main.tsx`
- `client/src/components/AppShell.tsx`
- `client/src/components/Sidebar.tsx`
- `client/src/components/TopBar.tsx`
- `client/src/components/SystemStatusBar.tsx`
- `client/src/components/ThemeToggle.tsx`
- `client/src/components/ConfirmDialog.tsx`
- `client/src/components/ProtectedActionDialog.tsx`
- `client/src/components/product/ActivityRow.tsx` (new)
- `client/src/components/product/BidiValue.tsx` (new)
- `client/src/components/product/HumanStatus.tsx` (new)
- `client/src/components/product/ProductPage.tsx` (new)
- `client/src/hooks/useDialogFocus.ts` (new)

### Normal product pages

- `client/src/pages/SimpleDashboardPage.tsx` (new)
- `client/src/pages/SimpleSitesPage.tsx` (new)
- `client/src/pages/SiteSetupPage.tsx` (new)
- `client/src/pages/SiteWorkspacePage.tsx` (new)
- `client/src/pages/OperationsPage.tsx` (new)
- `client/src/pages/SimpleSettingsPage.tsx` (new)
- `client/src/styles/index.css`

### Dependencies and generated TypeScript state

- `client/package.json`
- `client/package-lock.json`
- `client/tsconfig.tsbuildinfo`

### Tests

- `tests/productSimplificationContracts.test.ts` (new)
- `tests/productSimplificationUi.test.ts` (new)
- `tests/coreUiFoundation.test.ts`
- `tests/hubStaticUiConfig.test.ts`
- `tests/ownerModeContract.test.ts`
- `tests/sharepointFrontendAuthFixes.test.ts`

No file under `server/` was changed.

## 6. Routes changed

The baseline exposed 14 sidebar destinations and routed 17 top-level pages. The new manifest is the single frontend authority for area, mode, visibility, role, and lazy-loading policy.

| Route | Area | Mode | Visibility | Roles | Loading |
|---|---|---|---|---|---|
| `/` | Dashboard | Normal | Primary | Admin, Viewer | Eager |
| `/sites` | Sites | Normal | Primary | Admin, Viewer | Eager |
| `/sites/new` | Sites | Normal | Contextual | Admin | Lazy |
| `/sites/:id` | Sites | Normal | Contextual | Admin, Viewer | Lazy |
| `/operations` | Operations | Normal | Primary | Admin, Viewer | Eager |
| `/settings` | Settings | Normal | Primary | Admin, Viewer | Eager |
| `/advanced/settings` | Settings | Advanced | Contextual | Admin | Lazy |
| `/advanced/sites` | Sites | Advanced | Contextual | Admin | Lazy |
| `/advanced/sites/:id` | Sites | Advanced | Contextual | Admin | Lazy |
| `/releases` | Operations | Advanced | Contextual | Admin | Lazy |
| `/backups` | Operations | Advanced | Contextual | Admin | Lazy |
| `/admins` | Sites | Advanced | Contextual | Admin | Lazy |
| `/monitoring` | Operations | Advanced | Contextual | Admin | Lazy |
| `/health` | Sites | Advanced | Contextual | Admin | Lazy |
| `/analytics` | Operations | Advanced | Hidden | Admin | Lazy |
| `/jobs` | Operations | Diagnostics | Hidden | Admin | Lazy |
| `/audit` | Operations | Diagnostics | Hidden | Admin | Lazy |
| `/diagnostics` | Settings | Diagnostics | Hidden | Admin | Lazy |
| `/help` | Settings | Help | Contextual | Admin, Viewer | Lazy |
| `/dashboard-lab` | Dashboard | Labs | Hidden | Internal | Lazy |
| `/dashboard-design-studio` | Dashboard | Labs | Hidden | Internal | Lazy |
| `/dashboard-northstar` | Dashboard | Labs | Hidden | Internal | Lazy |

Advanced routes remain deep-linkable for Admin users so necessary legacy operations are not destroyed. Diagnostics, Help, and Labs require their corresponding explicit modes or flags. A gated route returns the operator to an enabled product surface rather than leaking the page through direct navigation.

## 7. Features hidden from normal UX

- Approval queues and approval framing.
- Scheduling controls.
- Labs, design studio, and North Star experiments.
- Raw Jobs pages, job IDs, queue vocabulary, and state-machine details.
- Audit event matrices.
- Connector diagnostics and infrastructure evidence panels.
- The dedicated Analytics page.
- Detailed release, monitoring, health, backup, and admin consoles.
- SharePoint TXT orchestration and Mongo physical configuration controls.
- Backend topology, connector mode, raw identity mode, and storage-path detail.
- The previous multi-row sidebar system-health panel.

These items are hidden by manifest policy and by the composition of normal pages, not by CSS-only concealment.

## 8. Behavior preserved internally

- Site lifecycle and provisioning states.
- Derived health and version status.
- Deployment history and release operations.
- Backup evidence, source-path evidence, verification status, storage path, file counts, and restore operations.
- Access mutation planning and audit reasons.
- SharePoint browser connector behavior and legacy browser-operation runners.
- Builder backend paths and Mongo health behavior.
- Managed identity, Builder identity, Mongo identity, safe collection, storage backend, and compatibility keys.
- Audit and raw job APIs/pages.
- Existing Advanced site create/edit orchestration, including TXT and Mongo-specific steps.
- Existing settings, analytics, release, backup, admins, monitoring, health, diagnostics, help, and experimental pages as lazy chunks.

Preservation does not imply live execution in this verification run. No external write was submitted.

## 9. Domain/facade architecture introduced

`client/src/domain/hubDomain.ts` is the normal product UI's frontend boundary. Normal pages request product capabilities from this facade rather than importing connector-specific APIs. Its capabilities are:

- list and get sites;
- check a site through its configured backend;
- create a managed site and continue setup;
- load independently settled workspace slices;
- load independently settled Operations slices;
- deploy a known release;
- list/create/restore backups;
- read and update access.

The facade deliberately remains thin: it centralizes product semantics and identity types while delegating current transport behavior to the existing `sitesApi`. This makes a future transport replacement possible without coupling normal-page components to the planned `/api/site-data/v1` design.

Partial failure is represented per data slice. A failed access, backup, deployment, or activity request does not erase the successfully loaded site or other slices.

## 10. Human status mapping

### Operation states

| Product state | Examples of internal states | Product label |
|---|---|---|
| `ready` | unknown or unrecognized non-terminal state | Ready, with “not yet verified” reason when unknown |
| `in-progress` | queued, preflight, running, uploading, verifying, retrying, waiting-external, partial, browser-in-progress | In progress |
| `succeeded` | completed, complete, success, succeeded, verified, ready | Completed |
| `failed` | failed, error, rejected, cancelled, expired, recovery-required, blocked-service-auth-required | Failed |

### Site conditions

| Product condition | Rule summary |
|---|---|
| `ready` | Healthy, complete, available, and without version attention |
| `needs-attention` | Incomplete setup, unknown/non-healthy health, warning/failure, or outdated/updating/failed version |
| `unavailable` | Archived or terminal lifecycle failure combined with failed health/data backend |

The internal state remains available to the domain layer for diagnosis, but normal components render the product label plus a human reason.

### Backup recoverability

“Recoverable backup” requires all of the following: successful terminal state, verified verification status, a storage path, at least one file, and complete verified source evidence where source paths are recorded. Anything less is labeled evidence-only or unverified. The Sites list shows a last verified backup date only when all recorded files are verified and none failed.

## 11. Legacy compatibility

- Old workspace query values map into the five new areas:
  - `health`, `deployment`, `versions` → Overview
  - `admins` → Access
  - `hosting`, `advanced` → Structure
  - `recovery` → Backups
  - `jobs`, `audit` → Activity
- Old route pages remain available through Admin-only Advanced or Diagnostics routes.
- The Advanced site list and detail pages preserve existing API contracts and orchestration.
- Setup continuation generates `/sites/new?resume=<managed-id>` for the normal flow and `/advanced/sites?edit=<managed-id>` for the legacy flow.
- Existing API URLs and request payloads were not rewritten.
- Existing backend, schema, storage, evidence, and audit behavior was not deleted.

## 12. Accessibility work

- Hebrew `dir="rtl"` remains the document direction.
- URLs, IDs, versions, and dates use explicit `<bdi dir="ltr">` isolation to avoid RTL reordering.
- Dialogs use `role="dialog"`, `aria-modal`, labelled titles, optional descriptions, focus containment, Escape close, and focus return.
- Destructive confirmations initially focus the safe action.
- The mobile navigation is an accessible modal layer with the same focus and Escape behavior.
- Icon-only controls have accessible names and visible tooltips where appropriate.
- Keyboard focus styles use `:focus-visible`.
- Mobile targets are at least 44×44 px.
- Status is conveyed with icon/text, not color alone.
- Reduced-motion preferences disable nonessential transition and animation behavior.
- Disabled setup actions are visibly disabled and remain non-activatable until required fields are valid.

Browser checks confirmed that the mobile menu initially focuses Close, Escape closes it, and focus returns to the menu trigger. The same focus-return behavior was checked for action dialogs.

## 13. Responsive and visual QA

QA covered three exact content viewports in both light and dark themes:

| Viewport | Purpose | Coverage |
|---|---|---|
| 1440×900 | Wide desktop | Dashboard, Sites, Create, all five workspace areas, Operations, Settings, Advanced Settings |
| 1024×768 | Compact desktop/tablet | Same 11 views in dark theme |
| 390×844 | Mobile | Dashboard, Sites, Create, Overview, Backups, Operations, Settings, open mobile navigation in both themes |

For each capture, the browser reported the requested inner width/height, expected theme, expected active area, and zero horizontal overflow. The Site workspace mobile header was reworked after visual review so the title occupies the full row and actions stack below it.

Interactive browser checks covered:

- all four primary navigation links;
- Sites search reducing the visible result set from four to two;
- four setup stages and validation-gated Next buttons;
- a valid Details-to-Destination-to-Create review traversal without submission;
- all five site workspace areas and legacy direct-query mapping;
- normal Operations without Jobs or approval language;
- direct `/jobs` gating in Normal mode;
- theme switching through the UI;
- mobile navigation open, keyboard close, and focus return;
- 390 px horizontal-overflow check.

## 14. Typography and visual system

- Added local `@fontsource/assistant` weights 400, 500, 600, and 700.
- The local font removes dependency on an external font CDN and gives Hebrew UI consistent metrics.
- Typography is limited to a compact operator-console scale with restrained headings and readable metadata.
- Numbers and operational values use tabular-number treatment where alignment matters.
- Normal product styles are scoped to calm surfaces, quiet borders, restrained shadows, consistent radii, compact rows, and deliberate whitespace.
- Dark and light color tokens preserve hierarchy and contrast without introducing a second visual language.
- Hover, pressed, disabled, focus, and selected states are consistent across buttons, rows, tabs, sidebar links, and theme controls.

## 15. Before/after measurements

| Measure | Baseline | Simplified | Result |
|---|---:|---:|---|
| Primary sidebar destinations | 14 | 4 | 71% reduction |
| Sidebar status facts shown persistently | 5 detailed rows plus mode summary | 1 calm product status | Infrastructure moved out of normal attention |
| Normal visible roles | Multiple internal/legacy role labels | 2 | Admin and Viewer only |
| Site workspace conceptual sections | Fragmented technical tabs/routes | 5 | One stable site mental model |
| Site setup stages | Advanced orchestration exposed in main Sites workflow | 4 | Product-first guided setup |
| Baseline tests | 62 files / 267 tests | 64 files / 284 tests | 17 additional passing tests overall |
| Main JS bundle, Vite-reported | 1,048.71 kB / 276.90 kB gzip | 297.61 kB / 94.65 kB gzip | Large legacy/context pages moved to lazy chunks |
| Main CSS bundle, Vite-reported | 194.06 kB / 30.96 kB gzip | 224.23 kB / 35.52 kB gzip | +30.17 kB for local typography and complete product/responsive states |
| Screenshot evidence | Not part of baseline | 38 canonical captures | Three viewports, two themes, critical states |

The JS comparison is the main entry chunk, not the sum of every lazy chunk. Legacy capabilities still ship when requested; they no longer burden the initial normal product surface.

### Design-polish comparison

| Baseline symptom | Implemented correction | Recurrence guard |
|---|---|---|
| Feature inventory used as navigation | Four-area product information architecture | Manifest-derived Sidebar and exact-count test |
| Infrastructure status dominated every route | One calm system status with Settings path | Normal-shell composition test |
| Technical nouns acted as product state | Human status and reason mapping | Central presentation contract tests |
| Dense site detail mixed unrelated tasks | Five-area workspace with one context action | Workspace-area contract and legacy mapper |
| Mobile headers competed for one line | Stacked mobile page header/action layout | 390 px screenshots and overflow assertion |
| RTL strings could visually reorder | Explicit bidi value primitive | Component/source contract test |
| Dialog behavior varied | Shared focus-management hook | Dialog UI test and browser keyboard check |
| Heavy routes loaded up front | Manifest-authorized lazy route modules | Lazy property test and build chunk inventory |

## 16. Tests and build verification

Final automated result:

- Command: `MONGO_URI=mongodb://127.0.0.1:27017/sitebuilder_hub npm test`
- Result: 64 test files passed; 284 tests passed.
- Command: `MONGO_URI=mongodb://127.0.0.1:27017/sitebuilder_hub npm run build`
- Result: server TypeScript build and client Vite production build passed.
- Final client build time observed: 1.24 s.
- Main client chunk: 297.61 kB, 94.65 kB gzip as reported by Vite.
- CSS: 224.23 kB, 35.52 kB gzip as reported by Vite.

New and updated tests cover:

- route count, modes, visibility, roles, and lazy loading;
- safe mode and unknown-role defaults;
- identity boundary and managed-ID routing;
- status and backup evidence mapping;
- partial slice behavior;
- normal navigation and forbidden-feature absence;
- setup and workspace product structure;
- Viewer/Admin mutation policy;
- Help and Labs explicit enablement;
- accessible dialogs and mobile navigation contracts;
- typography, RTL, and responsive-state source contracts;
- legacy owner-mode and SharePoint frontend authority expectations after simplification.

The production build retains the pre-existing warning that `./hub-config.js` is a non-module script. It does not fail the build and was not introduced by this work.

The explicit local `MONGO_URI` is a test-environment requirement of the pre-existing storage policy suite. Running the complete suite without it fails during environment-module import before that suite registers its three tests; with the declared test URI, all 284 tests pass. The test run did not perform a migration or data mutation.

## 17. Screenshot index

Evidence directory:

`/Users/meni/.codex/visualizations/2026/07/14/019f618c-193c-7d21-88e3-79b9e9008d57/sitebuilder-hub-simplification`

Filename convention: `<view>-<theme>-<width>x<height>.png`.

### 1440×900, light

- `dashboard-light-1440x900.png`
- `sites-light-1440x900.png`
- `create-light-1440x900.png`
- `site-overview-light-1440x900.png`
- `site-access-light-1440x900.png`
- `site-structure-light-1440x900.png`
- `site-backups-light-1440x900.png`
- `site-activity-light-1440x900.png`
- `operations-light-1440x900.png`
- `settings-light-1440x900.png`
- `advanced-settings-light-1440x900.png`

### 1024×768, dark

- `dashboard-dark-1024x768.png`
- `sites-dark-1024x768.png`
- `create-dark-1024x768.png`
- `site-overview-dark-1024x768.png`
- `site-access-dark-1024x768.png`
- `site-structure-dark-1024x768.png`
- `site-backups-dark-1024x768.png`
- `site-activity-dark-1024x768.png`
- `operations-dark-1024x768.png`
- `settings-dark-1024x768.png`
- `advanced-settings-dark-1024x768.png`

### 390×844, light

- `dashboard-light-390x844.png`
- `sites-light-390x844.png`
- `create-light-390x844.png`
- `site-overview-light-390x844.png`
- `site-backups-light-390x844.png`
- `operations-light-390x844.png`
- `settings-light-390x844.png`
- `mobile-nav-light-390x844.png`

### 390×844, dark

- `dashboard-dark-390x844.png`
- `sites-dark-390x844.png`
- `create-dark-390x844.png`
- `site-overview-dark-390x844.png`
- `site-backups-dark-390x844.png`
- `operations-dark-390x844.png`
- `settings-dark-390x844.png`
- `mobile-nav-dark-390x844.png`

## 18. Blockers, limits, and adversarial re-check

### Remaining blockers

There is no known blocker to adopting this branch as the frontend simplification baseline. The following are integration checks requiring external state, not unresolved frontend design decisions:

- A real SharePoint/Builder write was intentionally not executed. Setup was traversed to review only; no creation, access mutation, deployment, backup, or restore was submitted.
- Live visual verification used the available Admin development identity. Viewer read-only policy was verified through route, rendering, and domain contract tests rather than a live Viewer browser session.
- Connector failure and partial-loading behavior was verified with settled-slice and presentation tests, not by intentionally disabling a live connector.
- The preserved Advanced TXT/Mongo orchestration was checked for reachability and compatibility but was not redesigned or fully exercised against external systems.

### Challenge questions

**What could still have been missed?**

External service behavior under production tenancy, authentication, throttling, large real datasets, and long-running mutations cannot be proven by a local non-mutating browser pass. These are staging acceptance scenarios, not reasons to expose infrastructure in normal UX.

**Which claims remain assumptions?**

That existing backend endpoints behave identically in the target environment; that production identities map to the same role strings; and that legacy Advanced writes remain supported by external SharePoint and Builder configurations. No claim of live external-write success is made.

**Which routes or states were not visually inspected?**

Every normal route and every workspace area was inspected. Advanced Settings was captured as representative proof of the Advanced boundary. Other preserved legacy Advanced, Diagnostics, Help, and Labs pages were not exhaustively re-screenshot because their product requirement is gating and preservation, covered by manifest/import tests and direct route checks.

**Which problems were symptoms rather than root causes?**

Navigation density, raw statuses, and crowded pages were symptoms. The root causes were feature-inventory information architecture, no single mode/role/route authority, direct normal-page coupling to transport vocabulary, and missing product-level status/evidence rules. The manifest, facade, presentation mapping, and constitution address those roots.

**What information would an implementation or release team still need?**

Staging URLs and identities for both Admin and Viewer; representative SharePoint and Mongo-backed sites; permission to execute a reversible create/access/backup/restore acceptance set; production CSP/font validation; and monitoring criteria for route-gate failures and API error rates.

**Could the same UX failures return after a visual redesign?**

Yes, if new features bypass the route manifest, normal pages import transport APIs directly, technical states are rendered without presentation mapping, or new mutation controls omit role policy. The constitution and automated contracts are therefore part of the implementation, not optional documentation.

### Staging acceptance checklist

1. Sign in once as Admin and once as Viewer; confirm four primary destinations and Viewer read-only behavior.
2. Exercise one SharePoint-backed and one Mongo-backed site through all five workspace areas.
3. Create a disposable site, including interrupted/continued setup, and verify partial state never appears complete.
4. Create and restore a disposable backup; verify “recoverable” appears only after full evidence.
5. Simulate one connector failure and confirm successful slices remain usable.
6. Confirm deep legacy URLs map or gate as documented.
7. Run keyboard-only and screen-reader smoke tests in Hebrew at desktop and mobile widths.
8. Record performance and API error telemetry before any rollout decision.

## 19. Deferred backend work

Explicitly deferred:

- Implementing the planned HUB `/api/site-data/v1` endpoint.
- Moving Builder data-plane ownership behind that endpoint.
- Mongo consolidation or connection-topology changes.
- Schema/model unification or collection renaming.
- Authentication/authorization service redesign.
- Server-side role normalization beyond current contracts.
- Data migration, reindexing, backfill, or seed changes.
- Backend scheduling, approval, job, audit, backup, restore, deployment, or connector rewrites.
- Removing legacy endpoints after future compatibility evidence exists.

The frontend facade and identity types create a replacement seam for that future work without pretending it already exists.

## 20. Migration and cutover declaration

No migration or cutover was performed. No Mongo data was read for mutation, copied, merged, renamed, reindexed, backfilled, or deleted. No production or staging environment was reconfigured. No authentication mode, API owner, DNS record, secret, runtime, or deployment target was changed.

## 21. Publication declaration

No push, pull request, merge, or deployment was performed. All work exists only in the local worktree and local branch named in section 2. Local commits were created because the requested workflow required incremental checkpoints and a final evidence report.

## Final handoff

The authoritative artifacts for the next stage are:

1. `docs/sitebuilder-hub-product-constitution.md` — stable product constraints.
2. `docs/sitebuilder-hub-product-simplification-plan.md` — implementation sequencing and architecture intent.
3. This report — exact implementation, evidence, limitations, and staging acceptance criteria.

Any future change that adds a fifth primary area, adds a third visible role, exposes raw operational machinery in Normal mode, weakens backup evidence, routes by `siteCode`, merges the two Mongo responsibilities, or bypasses the domain/presentation contracts should be treated as a product-architecture regression requiring explicit review.
