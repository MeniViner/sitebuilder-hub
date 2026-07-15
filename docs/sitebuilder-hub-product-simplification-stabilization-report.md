# SiteBuilder Hub product simplification — stabilization report

Status: release-candidate frontend baseline; ready for later reviewed S0/S1 integration

Report date: 2026-07-15 (Asia/Jerusalem)

Scope: frontend stabilization, deterministic scenario coverage, accessibility, responsive QA, typography/CSS/bundle refinement, domain-boundary enforcement, and integration readiness

Out of scope by instruction: Mongo integration, Mongo S2, server changes, migrations, reconciliation execution, authentication changes, Gateway implementation, external writes, production access, push, pull request, merge, and deployment

## Executive verdict

The simplified frontend is stable across the required realistic roles, site states, operation states, backup evidence states, setup outcomes, partial failures, cached failures, and no-data states. The approved product model is unchanged: four primary areas, two visible roles, five Site workspace areas, and four setup stages.

The earlier implementation was visually complete but not yet a release-candidate baseline. Its main gaps were truth-state classification, refresh resilience, realistic browser coverage, automated accessibility evidence, source-boundary enforcement, and integration conflict planning. This phase closes those frontend gaps without changing a server file or integrating Mongo work.

The remaining checks require real external systems or classified staging evidence and are explicitly separated from locally proven claims. This report does not claim WCAG certification, real screen-reader verification, real SharePoint/Builder writes, or Mongo production readiness.

## 1. Starting branch and commit

- Worktree: `/Users/meni/dev/sitebuilder-hub-product-simplification`
- Starting branch: `codex/hub-product-simplification`
- Verified starting HEAD: `c3a23daf1a979263f39fcf974fcbeae2f04de4a4`
- Starting subject: `codex: document simplification evidence`
- Starting verification repeated before edits: 64 Vitest files / 284 tests; production build passed.
- Starting client output: main JS `297.61 kB / 94.65 kB gzip`; CSS `224.23 kB / 35.52 kB gzip`; 24 Assistant font assets.
- Canonical checkout `/Users/meni/dev/sitebuilder-hub` remained on `main` commit `5685903b64ccf709fb872522e4e71683b6af9eb7` and was not modified.

## 2. Follow-up branch and commits

- Follow-up branch: `codex/hub-product-simplification-stabilization`
- `40f7a97` — `codex: stabilize realistic frontend scenarios`
- `558a4c2` — `docs: record Mongo integration readiness`
- This report is committed as the final evidence milestone after the commits it describes.

No remote branch, PR, merge, or deployment was created.

## 3. Discrepancies found against the previous implementation report

The strict re-audit found the following differences between documented intent and actual behavior at `c3a23da`:

| Previous claim or implied guarantee | Actual gap | Stabilized result |
|---|---|---|
| Partial creation is never presented as success | The copy stayed cautious, but `SiteSetupPage` still moved to the visible Complete stage immediately after any persisted create response | Complete is entered only after lifecycle `ready`, provisioning `succeeded`, and product condition `ready`; partial creation stays at Create with a continuation action |
| Browser-required work maps to a simple active state | `browser-required` fell through to product `ready` | `browser-required` and `awaiting-approval` map to `in-progress`; partial-failed variants map to `failed` |
| Product `ready` means healthy and available | Missing/stale health evidence, missing Mongo identity, and a failed data backend could still appear ready | The centralized site-condition rule now checks freshness, storage identity, runtime/data status, lifecycle, provisioning, version, archive, and terminal failure |
| Internal operation state is hidden | Unknown job types could fall back to their raw internal type label | Unknown types use the safe product title `פעולה באתר`; raw type/state strings are browser-tested as absent |
| Normal Structure hides infrastructure | The area still exposed expandable technical details and raw environment text | Normal Structure now shows only product structure/readiness; technical detail remains an Admin contextual Advanced link; environment labels are humanized |
| Partial slices preserve usable data | Initial independent success was preserved, but a later refresh failure discarded the previously successful slice | The thin domain facade caches successful slices and returns them as explicitly stale after a refresh failure |
| Managed ID routing is contract-tested | The source check looked only for `sitesApi.` calls and did not prevent direct imports, Builder modules, hardcoded API paths, or new route templates | Dedicated source contracts prohibit those paths/imports and require normal Site links to use `siteWorkspaceRoute(managedSiteId, ...)` |
| Viewer behavior was verified | The earlier report explicitly said Viewer was not exercised in a live browser session | Viewer routes now run in Playwright in dark mode and have a dedicated 1440×900 visual capture; malformed roles also fail closed in browser tests |
| Connector failure behavior was verified | Only settled-slice unit behavior was checked | Browser scenarios now cover backups, access, activity, secondary timeout, cached refresh failure, and no-data recovery |
| Accessibility was browser-verified | Keyboard focus checks existed, but there was no automated contrast/semantic scan | Axe exposed real light/dark contrast defects and modal-background semantics; both were fixed and all automated scans now pass |
| Mobile navigation was safely hidden when closed | Hidden descendants could remain mounted/focusable; open background remained semantically active | Closed navigation is unmounted; open navigation makes the background inert and `aria-hidden`, traps focus, closes with Escape, and restores focus |
| Every route has a page heading | The unavailable-route state used a section heading without a route-level `h1` | Gated/unavailable routes now render through `ProductPage` with an `h1` |
| Local Assistant typography was efficient | Weight 500 was imported but unused; all language subsets and both formats produced 24 assets; several declarations used synthetic weight 650 | Only Hebrew 400/600/700 ship, producing six assets; all 650 declarations were normalized to 600 |
| Normal UI contrast was sufficient | Muted text on tinted surfaces and white text on the dark-theme bright accent failed automated contrast checks | Muted light text was strengthened and an explicit theme-aware `--on-accent` token now provides correct foreground contrast |

These were genuine implementation discrepancies; none required adding a product area, role, workflow, or backend concept.

## 4. Scenario fixtures added

`client/src/dev/productScenarios.ts` defines deterministic factories and 14 named scenarios at a fixed clock (`2026-07-15T10:00:00.000Z`). `client/src/dev/scenarioTransport.ts` provides an in-memory API-compatible transport.

| Dimension | Covered states |
|---|---|
| Roles | Admin; Viewer; malformed role that fails closed to Viewer |
| Site condition | Ready; needs attention; unavailable; partial setup; unknown storage identity; failed runtime/data backend; stale health; outdated version; update in progress; no backup |
| Operations | Empty; one/several active; succeeded; failed; retrying; browser-required; partial; partially failed; running restore; unknown internal type |
| Backups | None; HUB/source evidence only; payload present but unverified; fully verified recoverable payload; failed backup; restore running; restore failed/partial |
| Loading | All succeed; backups fail; access fails; activity fails; secondary timeout; cached success followed by failure; no core data |
| Setup | Empty/invalid fields; valid Details; invalid Destination; creation starts; partial completion; resume; failure; fully gated completion |

Safety properties:

- Scenario mode requires an explicit `?scenario=<id>` query.
- Installation is guarded by `import.meta.env.DEV` and loaded through a dynamic import.
- The production build emits no scenario chunk and contains no scenario transport in the normal entry.
- Mock mutations update only the in-memory scenario runtime. They do not issue external writes.
- Unknown scenario names do not install the transport.

Seven fixture contract tests verify the catalog, coverage, fail-closed role behavior, backup truth, setup outcomes, and unknown-name rejection.

## 5. Browser smoke coverage

A focused Playwright harness was added as development tooling only:

- `playwright.config.ts`
- `tests/browser/normal-product.spec.ts`
- `tests/browser/accessibility.spec.ts`
- root command `npm run test:browser`

Final result: **29/29 passed** in the last run.

The first 26 checks cover:

1. Dashboard load.
2. Exactly four working primary navigation links.
3. Sites search.
4. Admin mutation affordances.
5. Viewer read-only affordances.
6. Malformed-role fail-closed behavior.
7. Invalid setup blocking.
8. Valid non-writing setup traversal.
9. All five workspace areas.
10. Legacy tab-query mapping.
11. Human Operations states and no raw Jobs/types.
12. Help gated in Normal mode.
13. Labs gated in Normal mode.
14. Diagnostics gated.
15. Advanced Settings Admin-only.
16. Mobile navigation focus trap, Escape, and focus return.
17. Confirmation-dialog focus trap, Escape, and focus return.
18. Theme switching.
19. No horizontal overflow on normal routes at 390 px.
20. Partial API failure retains the core Site page.
21. Mock creation begins and remains visibly partial.
22. Partial setup resumes at Create.
23. Creation failure remains actionable.
24. Complete appears only after all known gates pass.
25. Cached backup data survives a refresh failure.
26. No-data state exposes recovery.

The final three checks run Axe WCAG A/AA rule tags across eight Admin routes in light mode, five Viewer routes in dark mode, and the open mobile navigation/confirmation-dialog states.

## 6. Role behavior

The product still exposes exactly two visible roles:

| Input role | Product role | Mutation behavior |
|---|---|---|
| `admin`, legacy `operator` | Admin | Product mutation affordances may appear |
| `viewer` | Viewer | Read-only |
| Missing, malformed, or any other string | Viewer | Fails closed; no mutation privilege |

Route policy and action policy both use centralized presentation functions. Browser evidence confirms Viewer cannot see Create Site or Site-check mutations, an unknown role cannot access site creation or Advanced Settings, and Admin retains the intended contextual actions.

## 7. Partial-failure and truth behavior

### Site loading

The Site control record is the core page boundary. Backups, access, deployments, and activity settle independently. One secondary failure shows a calm warning without erasing the Site, workspace navigation, or successful slices.

Successful secondary slices are cached inside the facade instance. A later refresh failure yields `status: "stale"` with the last successful data and an explicit warning. No cache is represented as live.

### Setup

Setup completion now requires all known frontend gates:

1. lifecycle is `ready`;
2. provisioning is `succeeded`;
3. centralized site condition is `ready`.

For a Mongo-backed site, the condition also requires known Builder/Mongo/physical collection identity, usable runtime/data status, and fresh health evidence. A partial record remains persisted and resumable without entering Complete.

### Health freshness decision

The frontend presentation threshold is explicitly **24 hours**. Missing or older health evidence produces “בדיקת התקינות אינה עדכנית.” This is a conservative product-presentation threshold—24 times the existing one-hour default health schedule—not a change to server health derivation or scheduling. A future backend freshness field may replace this constant through the domain facade; normal pages must not implement their own thresholds.

### Backups

Recoverable still requires successful terminal status, verified evidence, a storage path, a non-zero payload, and complete source evidence when source paths exist. Failed backups receive an explicit failure label. Evidence-only and unverified payloads never enable Restore.

## 8. Accessibility verification

### Statically verified

- RTL document direction and logical layout properties.
- Visible `:focus-visible` styling.
- Shared dialog labelling, descriptions, modal semantics, focus hook, Escape, and focus return.
- Icon-only controls have accessible names.
- Status uses icon plus text, not color alone.
- Form labels, helper/error associations, and invalid email/URL states.
- Disabled form progression differs from blocked/role-gated route messaging.
- Bidi isolation primitives cover versions, URLs, IDs, paths, emails, dates, and numbers where those values appear in Normal UI.
- Normal touch targets are approximately 44 px.
- Reduced-motion rules suppress nonessential transitions/animations.

### Browser verified

- Keyboard focus containment and return for mobile navigation and confirmation dialogs.
- Escape closes both overlays.
- The background becomes inert and hidden to assistive technology while mobile navigation is modal.
- The closed mobile navigation has no mounted focusable descendants.
- Light and dark automated contrast on touched Normal surfaces.
- Axe returned zero WCAG A/AA tagged violations for the tested route/modal matrix.
- Every normal route used in browser tests exposes a visible heading.

### Not verified

- No real screen reader (VoiceOver, NVDA, or JAWS) was run.
- No Hebrew speech-output or rotor/landmark usability study was run.
- Automated Axe results are not WCAG certification and do not cover every cognitive, copy, or assistive-technology behavior.

## 9. Responsive and screenshot QA

Evidence directory:

`/Users/meni/.codex/visualizations/2026/07/14/019f618c-193c-7d21-88e3-79b9e9008d57/sitebuilder-hub-stabilization`

Final evidence: **43 screenshots** captured through the in-app Browser against deterministic scenarios.

| Viewport/theme | Captures |
|---|---:|
| 1440×900 light | 11 canonical routes: Dashboard, Sites, Create, five workspace areas, Operations, Settings, Advanced Settings |
| 1024×768 dark | The same 11 routes |
| 390×844 light | Dashboard, Sites, Create, Site Overview, Site Backups, Operations, Settings, open mobile navigation |
| 390×844 dark | The same eight states |
| Additional state captures | Viewer Sites; partial backup failure; empty Sites; failed Operations; partial/resumed setup |

Every capture reported the requested inner dimensions, expected theme, visible route `h1`, and no page-level horizontal overflow. Browser console inspection found no application errors; only the existing React Router v7 future-flag warnings appeared.

Visual review found no remaining material clipping, overlap, RTL inversion, unreadable metadata, broken action hierarchy, or technical leakage in Normal routes. The responsive behavior is not merely a desktop stack: mobile headers/actions reflow, metrics become a two-plus-one grid, Site cards reorganize, workspace tabs become a deliberate horizontal strip, forms collapse to one column, and backup rows switch to vertical composition.

Representative filenames:

- `dashboard-light-1440x900.png`
- `sites-dark-1024x768.png`
- `site-backups-light-390x844.png`
- `mobile-nav-dark-390x844.png`
- `partial-failure-backups-light-1024x768.png`
- `partial-setup-dark-1024x768.png`
- `viewer-sites-dark-1440x900.png`
- `failed-operation-light-1440x900.png`

## 10. CSS, typography, motion, and bundle measurements

### Production output

| Measure | Starting `c3a23da` | Stabilized | Change |
|---|---:|---:|---:|
| Main JS | 297.61 kB / 94.65 kB gzip | 299.52 kB / 95.28 kB gzip | +1.91 kB / +0.63 kB gzip |
| CSS | 224.23 kB / 35.52 kB gzip | 219.96 kB / 34.93 kB gzip | −4.27 kB / −0.59 kB gzip |
| Assistant assets | 24 | 6 | −18 assets |
| Assistant weights | 400/500/600/700 | 400/600/700 | Removed unused 500 |
| Production modules transformed | 1,739 | 1,739 | No scenario/runtime expansion |

The small main-entry increase is the deliberate cost of centralized truth rules, cached-slice resilience, route helper use, modal background semantics, and accessible bidi/number primitives. The deterministic scenario transport is development-only and absent from production output.

### Relevant lazy chunks

| Chunk | Final raw/gzip |
|---|---:|
| Site Setup | 11.89 / 3.98 kB |
| Site Workspace | 13.28 / 4.73 kB |
| Dashboard North Star (Labs) | 11.28 / 3.52 kB |
| Dashboard Design Studio (Labs) | 25.57 / 7.50 kB |
| Dashboard Lab | 29.43 / 7.96 kB |
| Advanced Settings | 24.05 / 6.59 kB |
| Legacy Sites | 125.97 / 32.95 kB |

Heavy legacy, diagnostics, and Labs modules remain separate lazy chunks. No attempt was made to rewrite or delete the historical stylesheet.

### Design-polish before/after record

The `make-interfaces-feel-better` skill guided the scoped polish decisions below.

#### Typography and bidi

| Before | After |
|---|---|
| Four weights and all language subsets produced 24 files | Hebrew 400/600/700 only; six files |
| Unused weight 500 shipped | Weight 500 removed |
| Synthetic `font-weight: 650` declarations | Supported 600 weight throughout |
| Counts used generic bidi markup inconsistently | Explicit `NumberValue`/`BidiValue` primitives and tabular-number treatment |
| Raw environment identifiers could appear | Human environment labels |

#### Surfaces, semantics, and hierarchy

| Before | After |
|---|---|
| Technical Structure disclosure inside Normal mode | Product structure/readiness only; Advanced detail remains contextual and Admin-only |
| Dead `.normal-advanced-details` styles | Removed |
| Gated route lacked a route-level heading | `ProductPage` supplies `h1` |
| Muted light text and dark accent foreground had failing combinations | Stronger muted token plus theme-aware `--on-accent` |
| Modal backdrop left background content semantically active | Background is inert and `aria-hidden` during mobile modal state |

#### Motion and interaction

| Before | After |
|---|---|
| Normal quick actions used a barely perceptible 0.98 press state while other controls differed | Normal buttons, icon buttons, navigation, and quick actions use a consistent 0.96 pressed state |
| Closed mobile overlay remained represented by hidden DOM | Closed mobile navigation is unmounted |
| Helper/error relationships depended partly on visual proximity | Programmatic descriptions and invalid states were added to touched forms/dialogs |
| Broad animation risk was narrative-only | Source contract prevents `transition: all`/`will-change: all` in the Normal layer; reduced motion remains enforced |

#### Resilience and truth

| Before | After |
|---|---|
| Any created record could advance the stage indicator to Complete | Central completion gates control the visible stage |
| Refresh failure could replace useful successful slices | Cached slices remain visible and are explicitly marked stale |
| Unknown type/status could leak or look ready | Safe title mapper and four-state operation mapper |
| Health/storage/runtime gaps could still look ready | One centralized three-condition site rule |

## 11. Domain-boundary checks

`tests/productDomainBoundary.test.ts` adds eight source-contract checks. They enforce:

- normal business pages import the thin `hubDomain` and presentation seams;
- normal UI files do not import `sitesApi`, SharePoint/Builder connector implementations, or call `fetch`;
- no normal UI hardcodes current Builder paths or future `/api/site-data/v1`;
- normal Site navigation is built through `siteWorkspaceRoute` from the managed HUB ID;
- `siteCode` is not used in route expressions;
- managed, logical Builder/Mongo, physical collection, and compatibility identities remain distinct properties with branded types;
- job/backup states pass through centralized presentation rules;
- backup recoverability and last verified backup labels pass through centralized evidence rules;
- role mutation policy passes through the centralized fail-closed rule;
- deterministic fixtures remain DEV-gated and dynamically imported;
- required fonts and scoped CSS performance rules do not regress.

The facade remains thin. It delegates current transport behavior and does not speculate about the future Gateway implementation.

## 12. Integration-readiness conflicts

The detailed compatibility note is:

`docs/sitebuilder-hub-product-simplification-integration-readiness.md`

Read-only comparison used Mongo S0/S1 committed HEAD `00fb922` against common ancestor `5685903`. Exact shared changed files are `.gitignore` and root `package.json`; both require manual union. Package locks, `.env.example`, README, `tests/setup/env.ts`, tests, and documentation are logical review boundaries even where only one reviewed branch currently changes them.

Ownership rule:

- Mongo S0/S1 wins for reviewed `server/` startup/index/reconciliation changes and its server lockfile.
- Stabilization wins for Normal product client/domain/presentation/browser changes and client font locks.
- Root scripts, root dev dependencies, ignores, and test suites must be manually unioned.
- Neither branch may overwrite the other's architecture/runbook/product-contract documentation.

The Mongo worktree contained uncommitted changes after `00fb922`; those were not treated as an integration input. A later integration must freeze a clean reviewed Mongo commit and repeat the conflict audit.

## 13. Tests, builds, and dependency audit

Final commands and results:

| Command | Result |
|---|---|
| `MONGO_URI=mongodb://127.0.0.1:27017/sitebuilder_hub npm test` | 66 files passed; 300 tests passed |
| `MONGO_URI=mongodb://127.0.0.1:27017/sitebuilder_hub npm run build` | Server TypeScript and client TypeScript/Vite production build passed |
| `npm --prefix server run build` | Passed independently |
| `npm --prefix client run build` | Passed independently; 1,739 modules transformed |
| `npm run test:browser` | 29/29 passed |
| `npm audit` | 0 known vulnerabilities after a non-forced development-tooling update |
| `npm audit --omit=dev` | 0 production vulnerabilities |

The pre-existing Vite warning remains: `./hub-config.js` is loaded as a non-module script and cannot be bundled. It does not fail the build and was not introduced here.

## 14. Remaining staging-only checks

The following cannot be proven by deterministic local frontend fixtures:

1. Real Admin and Viewer identity mapping in the target tenant.
2. Real SharePoint-backed and Mongo-backed reads across all five workspace areas.
3. Reversible create/continue/access/backup/restore operations against disposable staging Sites.
4. Browser-required handoff behavior in the actual SharePoint browser context.
5. Network latency, throttling, expiry, concurrent updates, and large-dataset behavior.
6. VoiceOver/NVDA/JAWS Hebrew keyboard and speech smoke testing.
7. Production CSP and local Assistant font delivery/cache headers.
8. Real Mongo topology, authentication, TLS, backup, restore, mapping, and reconciliation evidence.
9. Future Gateway authorization, compatibility parity, token/credential ownership, and rollback.

These are release/integration acceptance gates, not unmade frontend design decisions.

## 15. Server no-change confirmation

`git diff c3a23daf1a979263f39fcf974fcbeae2f04de4a4 -- server` is empty.

No server source, server manifest, server lockfile, Mongo connection, schema/model, index, migration, reconciliation, job persistence, backup/restore service, authentication middleware, Gateway path, credential, database name, collection name, or physical naming rule was changed by this phase.

## 16. No-integration/no-publication declaration

This phase did not:

- start Mongo S2;
- run a migration, index apply, reconciliation, backfill, copy, cutover, or production query;
- implement or call `/api/site-data/v1`;
- change authentication or service credentials;
- access or mutate production/staging systems;
- push, open a PR, merge, or deploy.

All changes and commits remain local to `codex/hub-product-simplification-stabilization`.

## Adversarial re-check

### What did this audit almost miss?

The most subtle issue was not a broken screen; it was false completion and false readiness. Copy alone was cautious while the stepper and status rules still implied success. The second subtle issue was refresh regression: independent slice loading protected first load, but not a later failed refresh. Both required state-machine/domain inspection, not screenshot review.

### Which claims remain assumptions?

- The 24-hour health freshness threshold is a documented frontend policy based on the one-hour default schedule, not a backend-provided SLA.
- Existing APIs are assumed to preserve their current request/response contracts until integration; deterministic transport checks interface shape, not live service parity.
- Real tenant role strings are assumed to include the currently supported values; unknown values safely become Viewer.
- The future Gateway will preserve the documented identity/evidence boundaries; it does not yet exist.

### Which routes or states were not inspected?

Every Normal route, all five workspace areas, the unavailable route, Advanced Settings, Admin, Viewer, malformed role, light/dark, all required viewport classes, empty/failure/partial/cached/no-data states, and setup success/partial/failure were inspected through tests or captures.

Preserved legacy Advanced pages other than Advanced Settings, Help content, Diagnostics internals, and Lab artboards were not re-audited visually because this phase's requirement is their gating/lazy preservation rather than redesign. Their build chunks and route policy were verified.

### Which problems were symptoms rather than root causes?

| Symptom | Root cause | Recurrence control |
|---|---|---|
| Raw or optimistic statuses | No exhaustive product presentation rule | Central mappers plus scenario and source contracts |
| Partial page collapse | Data loading modeled as one success/failure | Independently settled, cached domain slices |
| Technical leakage | Normal pages could format transport fields directly | Domain/presentation imports enforced; connector imports prohibited |
| Role drift | UI could compare raw role strings ad hoc | One fail-closed role function and source guard |
| Inconsistent Site links | Route strings could be rebuilt in pages | One managed-ID route helper |
| Accessibility regressions | Keyboard checks without semantic/contrast automation | Shared focus hook, Axe smoke, modal inertness, contrast tokens |
| Font/CSS growth | Broad subset/weight imports and dead scoped rules | Exact font/source contracts and production measurement |

### What would an implementation team still need?

- This report, the product constitution, and the integration-readiness note as binding inputs.
- A frozen clean Mongo S0/S1 commit.
- Target environment URLs and safe Admin/Viewer identities.
- Disposable Site fixtures and authorization for a reversible staging write set.
- Product owner confirmation if the health freshness SLA should differ from the documented 24-hour frontend threshold.
- Security/operations approval for future Gateway trust, production Mongo evidence, backups, restore rehearsal, and rollback.

### Could the same UX failures return after another visual redesign?

Yes—if a redesign bypasses the route manifest, domain facade, presentation rules, managed-ID helper, evidence rule, role rule, scenario catalog, or accessibility smoke. Visual consistency alone cannot prevent false status, identity confusion, privilege drift, or failure-state collapse. Those contracts are therefore release gates, not optional implementation details.

## Final handoff

Authoritative inputs for the later rescue strategy and integration roadmap:

1. `docs/sitebuilder-hub-product-constitution.md`
2. `docs/sitebuilder-hub-product-simplification-plan.md`
3. `docs/sitebuilder-hub-product-simplification-implementation-report.md`
4. `docs/sitebuilder-hub-product-simplification-integration-readiness.md`
5. This stabilization report

Any future change that adds a fifth primary area, adds a third visible role, exposes raw operational state in Normal mode, treats partial setup as complete, weakens backup evidence, routes by `siteCode`, couples normal pages to Builder transport, merges HUB/Builder identities, or bypasses accessibility/browser regression checks should be treated as a product-architecture regression requiring explicit review.
