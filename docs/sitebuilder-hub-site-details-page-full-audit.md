# Site Details Page Full Audit

Audit date: 2026-07-06  
Repository: `sitebuilder-hub`  
Scope: audit only. No implementation, refactor, rename, source modification, or PR work was performed.  
Primary page audited: `client/src/pages/SiteDetailsPage.tsx`

## 1. Executive Summary

### Verdict

The Site Details page is functional but not trustworthy enough for an operator-facing control center. It exposes real SharePoint, Mongo, backup, migration, provision, permission, and deployment operations, but the interface presents many of them as similarly weighted buttons with mixed Hebrew/English/system copy. The page reads like a stitched-together engineering console rather than a clear "what is this site's state and what should I safely do next?" workspace.

The largest problem is not visual polish. The largest problem is that the page does not consistently distinguish:

- Hub metadata actions
- Browser SharePoint read-only checks
- Browser SharePoint live writes
- Mongo/Builder backend checks
- TXT-source operations
- Mongo-source operations
- Unknown-storage safety states

That means the page can encourage the wrong mental model. A Mongo site still sees TXT paths, browser backup language, and provision/bootstrap actions that currently seed TXT files. An unknown-storage site sees high-risk TXT repair and TXT-to-Mongo migration affordances before the source of truth has been identified.

### Why the page feels patched, technical, and untrustworthy

The page has too many primary controls, too many mixed abstractions, and too little source-of-truth hierarchy. It asks operators to understand implementation terms such as `Provision`, `Bootstrap`, `Evidence`, `Runtime config`, `Mongo / Builder backend`, `Seed`, `Registry`, `HashRouter`, `Browser SharePoint`, `Backup ID`, `Jobs`, `Audit`, and `SHA`. Those terms are sometimes valid in advanced diagnostics, but they should not dominate the main workflow.

The current layout also puts unrelated or differently risky operations side by side. On the Overview tab, a metadata plan button, a browser live SharePoint write button, a permissions-changing button, and a combined bootstrap write button appear in one compact card. In practice, those actions have very different blast radii.

Storage awareness exists in parts of the codebase, but the Site Details page applies it unevenly. The Backups page and Admins page have better source-authority patterns than Site Details. Site Details should borrow those models.

### Top 10 problems

1. **P0: Unknown-storage sites are treated as actionable.** Unknown sites can see TXT-to-Mongo migration and TXT repair actions. Unknown should force detection/confirmation before any live write or migration path.
2. **P0: Mongo sites are exposed to TXT-oriented provisioning concepts.** Provision/bootstrap plans and browser execution currently include default TXT seed-file creation. For Mongo, that should not be a primary action and must not create ambiguity about source of truth.
3. **P0: Mongo backup execution is misleading.** The Site Details Backups tab says browser SharePoint backup is the run path, but server backup execution for Mongo is intentionally not implemented and browser TXT backup does not back up Mongo live data.
4. **P0: The Bootstrap card conflates plan-only, live write, and permission-changing actions.** Operators cannot tell which buttons only inspect and which mutate SharePoint.
5. **P0: The server bootstrap plan implies site-collection creation, but browser bootstrap execution does not create the site collection.** The plan/execution story must be corrected before presenting bootstrap as a reliable one-click action.
6. **P1: Storage-specific source authority is unclear.** TXT files are displayed as central paths even for Mongo sites, and Mongo runtime/backend checks are not framed as the source of truth.
7. **P1: Admins tab mixes app-admin authority and SharePoint hosting-access authority.** This is especially risky for Mongo, where SharePoint Owners/Site Collection Admins are not proof of application admin rights.
8. **P1: Primary UI contains raw implementation language and English.** This creates a technical, patched feeling and increases operator hesitation.
9. **P1: Evidence/logs/JSON are too prominent.** Evidence is useful, but it should live in advanced drawers unless it is directly explaining a failed user-visible action.
10. **P2: The tab structure is implementation-shaped, not operator-goal-shaped.** `paths`, `jobs`, `audit`, and `notes` are useful, but the main IA should organize around readiness, deployment, backup/recovery, access, and activity.

## 2. Current Page Map

### Main route

- Route: `/sites/:id`
- Page component: `client/src/pages/SiteDetailsPage.tsx`
- Route registration: `client/src/App.tsx`

### Primary frontend files and components

| Area | File/component | Role |
|---|---|---|
| Page shell | `client/src/pages/SiteDetailsPage.tsx` | Main Site Details UI, tabs, actions, drawers, API orchestration |
| API client | `client/src/api/sitesApi.ts` | Site, health, backup, admin, provision, permissions, bootstrap, runtime config, deploy API calls |
| Types | `client/src/types/site.ts` | Site metadata, storage backend, runtime status, Mongo status, recovery state, operations |
| Browser SharePoint connector | `client/src/utils/sharepointBrowserConnector.ts` | Browser fetches to SharePoint with `credentials: "include"`, digest handling, folder/library/file helpers |
| Browser backup runner | `client/src/utils/sharepointBrowserOperationRunner.ts` | TXT-file backup plan/execution through browser SharePoint |
| Browser site operations | `client/src/utils/sharepointBrowserSiteOperations.ts` | Provision, permissions, bootstrap, admin TXT repair, TXT-to-Mongo snapshot, runtime config upload |
| Admin live read hook | `client/src/hooks/useBrowserAdminsLiveRead.ts` | Browser-read admin evidence from TXT, Site Collection Admins, Owners Group |
| Safe read hook | `client/src/hooks/useAutoSafeRead.ts` | Auto-running read-only checks on selected tabs |
| Operational status hook | `client/src/hooks/useOperationalStatus.ts` | Page-level operation capability/status polling |
| Page cards | `client/src/components/OperationalSummary.tsx`, `GuidedFlow`, `ModeBoundary`, `AdvancedDetails` | Shared operational framing components |
| Drawers | `client/src/components/DetailsDrawer.tsx` | Evidence/details side panels |
| Tables/cards | `DataTable`, `KpiCard`, `LinkRow`, `SectionCard`, `MetadataOnlyBadge`, `HealthChecklist`, `AdminSourceSummaryCards` | Reusable display components |

### Backend files used by Site Details actions

| Area | File | Role |
|---|---|---|
| Site routes | `server/src/routes/sites.routes.ts` | Route definitions and role gates |
| Site controller | `server/src/controllers/sites.controller.ts` | Queues jobs, records browser evidence, validates runtime config, runs Mongo checks/migration |
| Operations routes | `server/src/routes/operations.routes.ts` | Operation capability/status/summary endpoints |
| Operations controller | `server/src/controllers/operations.controller.ts` | Operation summary plumbing |
| Provisioning service | `server/src/services/siteProvisioning.service.ts` | Server-side provision/bootstrap plan generation; execution is browser-required |
| SharePoint policy | `server/src/services/sharepointOperationPolicy.service.ts` | Operation capability policy by operation type |
| SharePoint health | `server/src/services/sharepointHealth.service.ts` | Browser-required health plan and browser evidence persistence |
| Backup plan | `server/src/services/backupPlan.service.ts` | Storage-aware backup plan generation |
| Backup execution | `server/src/services/backups.service.ts` | Backup job behavior; Mongo execution currently blocked |
| Builder Mongo health | `server/src/services/builderMongoHealth.service.ts` | Mongo backend health/readiness checks |

### Tabs currently rendered

The tab list in `SiteDetailsPage.tsx` is:

| Key | Current label | Main purpose |
|---|---|---|
| `overview` | `סקירה` | Top summary, ownership, recommended actions, operations/bootstrap, quick evidence |
| `paths` | `נתיבי SharePoint` | SharePoint URLs, TXT paths, runtime config paths |
| `health` | `תקינות` | Manual health, Browser SharePoint health, runtime config read, Mongo backend health |
| `versions` | `גרסאות` | Release/deployment history and entry to browser deploy flow |
| `backups` | `גיבויים` | Backup plan and browser backup execution |
| `admins` | `מנהלים` | Browser admin reads, admin TXT repair, admin sources |
| `jobs` | `פעולות` | Jobs table, logs, evidence/result drawers |
| `audit` | `יומן` | Audit events, result/request IDs |
| `notes` | `הערות` | Site notes and last error |

### Page-load API calls

On load or refresh, the page fetches:

| API | Purpose | Notes |
|---|---|---|
| `GET /api/sites/:id` | Main site metadata | Source for identity, storage backend, paths, health, release/backups/admin summaries |
| `GET /api/operations/sites/:id/summary` | Operation capabilities and recommended actions | Drives operational summary and "recommended actions" |
| `GET /api/sites/:id/admins` | Admin source summary | Later enhanced by browser live read |
| `GET /api/audit` | Audit events | Filtered client-side by `entityId === site._id` |

### Main action APIs and browser calls

| UI/action | Frontend behavior | Server/API behavior | Connector behavior |
|---|---|---|---|
| Refresh data | Reloads page data | `GET /api/sites/:id` and related reads | No SharePoint write |
| Open SharePoint | Opens site URL | None | Browser navigation only |
| Archive site | `sitesApi.archive(id)` | Hub metadata update | No SharePoint write |
| Save manual health | `updateManualHealth` | `POST /api/sites/:id/health-check/manual` | Hub metadata only |
| Browser health read | `runBrowserSharePointHealthCheck` then evidence post | `POST /api/sites/:id/health-check/browser-sharepoint` | Browser SharePoint read |
| Runtime config read | `readBrowserRuntimeConfig` then evidence post | `POST /api/sites/:id/runtime-config/browser-evidence` | Browser SharePoint read |
| Mongo backend health | `runMongoBackendHealth` | `POST /api/sites/:id/health-check/mongo-backend` | Builder backend HTTP checks from server |
| Build provision plan | `siteProvisionPlan` | `GET /api/sites/:id/provision/plan` | Plan only |
| Queue/run provision | queue job, browser run, record evidence | `POST /provision`, `POST /provision/browser-evidence` | Browser SharePoint live write |
| Build permissions plan | `permissionsSetupPlan` | `GET /api/sites/:id/permissions/plan` | Plan only |
| Queue/run permissions | queue job, browser run, record evidence | `POST /permissions/setup`, `POST /permissions/browser-evidence` | Browser SharePoint permission write |
| Build bootstrap plan | `siteBootstrapPlan` | `GET /api/sites/:id/bootstrap/plan` | Plan only |
| Queue/run bootstrap | queue job, browser provision+permissions, record evidence | `POST /bootstrap`, `POST /bootstrap/browser-evidence` | Browser SharePoint live write |
| Build backup plan | storage-aware helper | Mongo uses server plan; TXT uses browser plan | Plan only or browser read/digest |
| Run backup | `runSiteBackup`, then browser backup runner | Mongo server path throws not implemented | Browser SharePoint TXT backup for TXT |
| Admin live read | `useBrowserAdminsLiveRead` | evidence persistence | Browser SharePoint reads from TXT/admin endpoints/groups |
| Admin TXT repair | queue/execute browser repair | records evidence | Browser SharePoint live TXT write |
| TXT-to-Mongo migration | browser reads TXT, server imports, browser writes runtime config, deploys release | migration/import and evidence endpoints | Browser SharePoint read/write plus Builder Mongo writes |

## 3. Screenshot / Runtime Observations

### Screenshot evidence available from prompt

The prompt-provided screenshot was treated as evidence for page composition and visible terminology. It shows the Site Details Overview area with the `Operations / Bootstrap` card, visible operation buttons, mixed Hebrew/English labels, and implementation-facing badges such as Browser SharePoint. The screenshot supports the finding that the page feels like an internal technical console rather than an operator-safe site workspace.

I did not receive a local image file path for that screenshot inside the repository, so I could not crop, annotate, or re-render it as an asset in this report.

### Local runtime checks attempted

Local services were already running:

| Service | Observation |
|---|---|
| Frontend | Vite was already responding on `localhost:5177` |
| API | `http://localhost:4100/api/health` returned OK with Mongo connected |
| Local data | `GET /api/sites` returned 4 sites, all with `storageBackend: "unknown"` in the local dataset |
| Operations summary | Correct endpoint is `GET /api/operations/sites/:id/summary`; `GET /api/operations/summary` is invalid |

### Browser screenshot capture

Screenshot capture was attempted through the available in-app browser and Chrome-control paths. Both browser backends were unavailable in this session:

| Tool path | Result |
|---|---|
| In-app Browser | Unavailable: `Browser is not available: iab` |
| Chrome extension control | Unavailable: `Browser is not available: extension` |

Because the browser-control backends were unavailable, I did not capture screenshots of every tab. I also did not switch to an unrequested Playwright fallback, because the browser skill guidance requires user approval before moving to Playwright after Browser/Chrome fail.

### What was verified vs not verified

| Item | Status |
|---|---|
| API health and local API availability | Verified |
| Local sites dataset | Verified; all local sites were `unknown` storage |
| Exact Mongo/TXT runtime rendering | Not verified in browser; audited by code inspection |
| Screenshot capture of each tab | Not verified due unavailable browser backends |
| Connector behavior in source code | Verified by code inspection |
| Server route/controller/service behavior | Verified by code inspection |
| Live SharePoint operations | Not executed; audit-only scope |

## 4. Storage Backend Compatibility Matrix

Legend:

- Valid: appropriate as-is or mostly appropriate.
- Conditional: valid only with clearer copy, gating, or confirmation.
- Invalid: should not be shown or should be blocked for this backend in the current implementation.
- Advanced only: useful diagnostic detail, not primary operator workflow.

| Action/surface | Mongo site | TXT site | Unknown site | Required change |
|---|---|---|---|---|
| Open final site URL | Valid | Valid | Valid | Keep primary/simple |
| Edit Hub metadata | Valid | Valid | Valid | Clearly label as Hub metadata only |
| Archive site | Conditional | Conditional | Conditional | Explain it archives Hub listing; it does not delete SharePoint/Mongo data |
| Browser SharePoint health read | Conditional | Valid | Conditional | For Mongo, frame as hosting check, not data-source check. For unknown, use to help identify state |
| Runtime config read | Valid | Conditional | Conditional | For Mongo, central readiness check. For TXT, show as hosting/runtime compatibility check. For unknown, diagnostic only |
| Mongo backend health | Valid | Advanced only | Conditional | Show primary only for Mongo. For TXT, allow advanced informational check only. For unknown, use after detection hints |
| Manual health save | Conditional | Conditional | Conditional | Keep, but separate from automated evidence so manual does not look authoritative |
| TXT-to-Mongo migration | Invalid unless explicitly starting from confirmed TXT | Valid but high-risk | Invalid | Hide unless `storageBackend === "txt"` and add confirmation, preview, rollback/readiness gates |
| Build bootstrap plan | Advanced only after storage-aware plan rewrite | Conditional | Invalid | Current plan includes TXT-oriented provisioning; unknown must detect first |
| Build provision plan | Advanced only after storage-aware plan rewrite | Conditional | Invalid | Current plan includes TXT seeds; not safe as Mongo primary |
| Build permissions plan | Conditional | Conditional | Invalid | Valid as SharePoint access operation, but permission-changing risk must be clear |
| Run provision | Invalid as current implementation | Conditional | Invalid | Current browser implementation creates TXT seed files for all sites. Must be storage-aware |
| Run permissions | Conditional | Conditional | Invalid | Require confirmation and plain Hebrew blast-radius copy |
| Run bootstrap | Invalid as current implementation | Conditional | Invalid | Current execution is provision+permissions and not site collection creation |
| Paths tab TXT file paths | Advanced only | Valid | Conditional | For Mongo, move TXT paths to "legacy/compatibility" area |
| Versions deploy | Valid if artifact compatibility passes | Valid if artifact compatibility passes | Conditional | Add backend compatibility summary before deploy |
| Backup plan | Valid as Builder/Mongo capability plan | Valid as Browser SharePoint TXT plan | Conditional | Current helper partly does this; UI copy must match |
| Run browser backup | Invalid for Mongo live data | Valid | Invalid | Hide/disable for Mongo and unknown; use Builder backup capability for Mongo |
| Admin live read | Conditional | Valid | Conditional | For Mongo, frame SharePoint admins as hosting access, not app-admin authority |
| Admin TXT repair | Invalid | Conditional | Invalid | Disable for Mongo and unknown; add preview/confirmation for TXT |
| Jobs tab | Valid | Valid | Valid | Rename and translate as activity/history |
| Audit tab | Valid | Valid | Valid | Translate labels and move raw result IDs to advanced |
| Notes tab | Valid | Valid | Valid | Keep, but consider merging into settings/overview |

### Bottom line by backend

#### Mongo

Mongo sites need a page organized around:

- Final app URL
- SharePoint hosting health
- Runtime config validity
- Builder/Mongo backend health
- Release artifact compatibility
- Builder/Mongo backup capability
- SharePoint access/admin diagnostics as hosting signals

Mongo sites should not see TXT backup, TXT repair, TXT seed provisioning, or TXT-to-Mongo migration as normal actions.

#### TXT

TXT sites need a page organized around:

- Final app URL
- SharePoint hosting health
- TXT source file availability
- Browser SharePoint backup and restore readiness
- Admin TXT state
- Optional migration to Mongo as a high-risk advanced path

TXT actions may use browser SharePoint writes, but they need clearer blast-radius labels and confirmation.

#### Unknown

Unknown sites need a detection-first mode:

- Show metadata and links.
- Run read-only Browser SharePoint and runtime checks.
- Optionally run Mongo backend health as informational.
- Do not show migration, provision, permissions, backup execution, or repair as primary actions.
- Primary CTA should be `זהה מקור נתונים` / "Identify data source".

## 5. Connector / Operation Policy Matrix

| Operation | Current UI trigger | Current connector/path | Correct operator framing | Current risk | Required change |
|---|---|---|---|---|---|
| Open site | Actions drawer / header link | Browser navigation | Open the public app | Low | Keep |
| Refresh Hub data | Actions drawer | Hub API reads | Refresh Sitebuilder HUB metadata | Low | Keep |
| Archive site | Actions drawer | Hub metadata write | Archive in HUB only | Medium | Clarify no SharePoint/Mongo deletion |
| Manual health save | Health tab | Hub metadata write | Manual note/status | Medium | Visually separate from automated checks |
| Browser health check | Overview/Health auto read and button | Browser SharePoint read | Check SharePoint hosting/files | Low | Storage-specific copy: hosting vs TXT data |
| Runtime config read | Overview/Health auto read and button | Browser SharePoint read | Check app loading config | Low | For Mongo, show as critical; for TXT, secondary |
| Mongo backend health | Health tab button | Server to Builder backend | Check Mongo data backend | Medium | Primary for Mongo only |
| Backup plan | Backups tab | Server plan for Mongo, browser plan for TXT | Show what backup would cover | Low | Copy must state Mongo vs TXT behavior |
| Run backup | Backups tab | Browser TXT backup runner after server queue | Back up TXT SharePoint data | High | Hide for Mongo/unknown |
| Deploy | Versions tab / release flow | Browser SharePoint write | Publish selected release to SharePoint hosting | High | Add artifact/backend compatibility status |
| Provision plan | Overview operation card | Server plan only | Preview hosting setup | Medium | Storage-aware plan labels |
| Run provision | Overview operation card | Browser SharePoint live write | Create/verify SharePoint libraries/folders/files | High | Disable for Mongo until it stops creating TXT seeds |
| Permissions plan | Overview operation card | Server plan only | Preview SharePoint permission changes | Medium | Use permission-specific warning |
| Run permissions | Overview operation card | Browser SharePoint permission write | Change SharePoint users library permissions | High | Require confirmation and show exact target |
| Bootstrap plan | Overview operation card | Server plan only | Preview combined setup | Medium | Fix mismatch with execution semantics |
| Run bootstrap | Overview operation card | Browser provision+permissions | Run hosting setup and permissions | High | Remove as primary; split into explicit actions |
| Admin live read | Admins tab auto/button | Browser SharePoint reads | Read hosting/admin sources | Medium | Explain source authority by backend |
| Admin TXT repair | Admins tab button | Browser SharePoint TXT write | Repair TXT admin data | High | TXT-only, preview, confirmation |
| TXT-to-Mongo migration | Overview card | Browser TXT read + server Mongo import + browser runtime config upload/deploy | Migrate confirmed TXT site to Mongo | Very high | TXT-only wizard with backup and rollback gates |
| Operation evidence | Drawers/tables | Hub evidence records | Technical proof for support | Low | Keep advanced |
| SharePoint site membership operation | Policy exists | Marked not ready/legacy backend disabled | Not available | Medium | Do not expose until implemented |

## 6. Tab-by-Tab Audit

### 6.1 Overview Tab

#### Current state

The Overview tab includes:

- `OperationalSummary`
- `GuidedFlow`
- `ModeBoundary`
- tab row
- KPI grid
- Mongo migration card for non-Mongo sites
- Ownership/operation summary card
- `Operations / Bootstrap` card
- recommended actions
- quick technical sections and evidence links

#### UX/product problems

- There is no single clear page thesis. The operator sees summary, guided flow, migration, operations, bootstrap, actions, and evidence all competing for attention.
- The primary next action changes by technical implementation instead of operator goal.
- The visible English/system labels make the page feel unfinished: `Operations / Bootstrap`, `Provision`, `Bootstrap`, `Browser SharePoint`, `Target URL`, `Evidence`, `Runtime config`, `Mongo / Builder backend`.
- The recommended actions are raw policy-ish strings, not human decisions.
- Operators cannot easily distinguish plan-only controls from live write controls.

#### Functional/storage problems

- The TXT-to-Mongo migration card appears for every non-Mongo site, including `unknown`. That is unsafe.
- The Operations/Bootstrap card appears without enough storage gating.
- The provision/bootstrap browser implementation creates default TXT seed files for all sites. That is not appropriate as a Mongo primary operation.
- The bootstrap plan/execution semantics do not match. The plan implies broader site creation; browser execution performs provision+permissions only.

#### Mongo/TXT problems

- Mongo: Overview should prioritize runtime config, Builder backend, release compatibility, and Mongo backup capability. It should not foreground TXT migration/provision concepts.
- TXT: Overview may show browser SharePoint operations, but migration to Mongo must be framed as advanced and high-risk.
- Unknown: Overview should be detection-first and should not offer high-risk mutation paths.

#### Redesign recommendation

Replace the current Overview with:

1. Site identity and final URL.
2. Storage backend/source-of-truth badge with confidence.
3. Readiness strip: hosting, runtime config, data backend, backup/recovery, admin/access.
4. One primary next action.
5. Secondary actions menu grouped by risk.
6. Recent activity and last problem.

#### Copy recommendation

- Replace `Operations / Bootstrap` with `מרכז פעולות לאתר`.
- Replace `Browser SharePoint` with `ירוץ דרך הדפדפן המחובר ל־SharePoint`.
- Replace raw recommended actions with sentences such as `צריך לזהות את מקור הנתונים לפני פעולות כתיבה`.

#### Priority

- P0: Hide migration/provision/bootstrap write actions for unknown.
- P0: Stop showing current provision/bootstrap write path as Mongo-safe.
- P1: Rewrite primary copy and move evidence to advanced.
- P2: Improve visual hierarchy and button grouping.

### 6.2 Paths Tab

#### Current state

The Paths tab shows SharePoint paths, HashRouter/index.html framing, TXT file paths, runtime config paths, and related metadata.

#### UX/product problems

- It is named `נתיבי SharePoint`, but it mixes hosting paths, app runtime files, TXT data paths, and technical router details.
- `HashRouter תחת index.html` is an implementation detail that belongs in advanced diagnostics.
- All paths look equally important.

#### Functional/storage problems

- `pathRows` always includes TXT files such as master config, users data, and widgets data.
- For Mongo sites, those TXT files are not the live data source and should not be represented as first-class source paths.

#### Mongo/TXT problems

- Mongo: should show SharePoint hosting paths and runtime config first; TXT paths only in `Legacy/TXT compatibility`.
- TXT: TXT source files are central and should be grouped by content type.
- Unknown: paths should support detection and label confidence.

#### Redesign recommendation

Rename the tab to `אירוח ונתיבים`. Split into:

- `כתובות שימושיות`: final app URL, SharePoint site URL, document libraries.
- `קבצי טעינת אפליקציה`: `index.html`, assets, runtime config.
- `מקור נתונים`: Mongo backend or TXT files depending on backend.
- `נתיבים טכניים`: HashRouter, raw paths, advanced IDs.

#### Priority

- P1: Storage-aware path grouping.
- P1: Move HashRouter/raw internals to advanced.
- P2: Add copy-to-clipboard and concise Hebrew labels.

### 6.3 Health Tab

#### Current state

The Health tab includes current health checklist, manual health save, Browser SharePoint read-only check, runtime config check, Mongo backend check, and evidence panels.

#### UX/product problems

- Manual health, browser evidence, runtime config, and Mongo backend checks are visually close but have very different authority.
- The word "health" is not decomposed into hosting health, runtime config health, data backend health, and backup/recovery health.

#### Functional/storage problems

- Mongo backend button is disabled unless Mongo, which is good.
- Runtime config and browser health auto-run for any site, which is acceptable as safe reads, but the result labels need storage-specific interpretation.
- Browser SharePoint health checks include TXT file evidence even when TXT is not authoritative for Mongo.

#### Mongo/TXT problems

- Mongo: missing a clear "Mongo readiness" hierarchy: runtime config points to Builder backend, Builder backend responds, site registered, legacy docs present, backup endpoint capability.
- TXT: Browser SharePoint health should emphasize TXT file availability and permissions.
- Unknown: Health tab should help determine storage backend before presenting remediation.

#### Redesign recommendation

Rename to `תקינות וחיבורים`. Use four cards:

- `אירוח SharePoint`
- `הגדרות טעינה`
- `מקור הנתונים`
- `גיבוי ושחזור`

Each card should say: status, last checked, connector used, and next safe action.

#### Priority

- P1: Separate health authority by source.
- P1: Storage-aware result copy.
- P2: Keep raw evidence in drawer.

### 6.4 Versions Tab

#### Current state

The Versions tab lists deployment/version history and offers a button to go to the Releases page with `targetSiteId`.

#### UX/product problems

- The deploy button uses browser terminology rather than operator outcome.
- The tab does not clearly answer "what is live now?", "what can I deploy?", "is it compatible with this site's backend?", and "how do I roll back?"

#### Functional/storage problems

- Browser SharePoint deploy is valid for SharePoint-hosted sites.
- The key missing piece is prominent artifact/backend compatibility before deployment.

#### Mongo/TXT problems

- Mongo: release must include/expect runtime config and Mongo backend compatibility.
- TXT: release must remain compatible with TXT file data mode.
- Unknown: deploy should be blocked or warning-heavy until backend is identified.

#### Redesign recommendation

Rename to `פריסה וגרסאות`. Show:

- Current live release
- Candidate release compatibility
- Last deploy evidence
- Rollback availability
- Link to detailed release flow

#### Priority

- P1: Add storage compatibility summary.
- P1: Translate technical labels.
- P2: Improve empty states and version comparison.

### 6.5 Backups Tab

#### Current state

The Backups tab says backup runs through the browser-connected SharePoint path, with server storing plan/evidence only. It can build a backup plan and run a browser backup.

#### UX/product problems

- The subtitle is wrong for Mongo and makes the page untrustworthy.
- Backup and restore readiness are not clearly separated.
- Operators need to know what data is protected, not which implementation ran.

#### Functional/storage problems

- `buildBackupPlanForCurrentSite` is partly storage-aware:
  - Mongo uses server backup plan.
  - TXT uses browser SharePoint plan.
- `runBrowserBackup` is not properly storage-aware:
  - For Mongo, server backup execution throws `mongo-backup-execution-not-implemented`.
  - Browser TXT backup would not back up Mongo live data.

#### Mongo/TXT problems

- Mongo: show Builder/Mongo backup capability, status, and current limitation. Do not offer browser TXT backup as the main action.
- TXT: browser SharePoint backup is valid if source files are available and digest/write permissions exist.
- Unknown: do not run backup until source of truth is known.

#### Redesign recommendation

Rename to `גיבויים ושחזור`. Show:

- `מה מגובה`: Mongo database vs TXT files.
- `איך מגובה`: Builder backend vs browser SharePoint.
- `מוכנות שחזור`: available, blocked, not implemented.
- `פעולה בטוחה הבאה`: create plan, run TXT backup, check Mongo backup capability, or identify backend.

#### Priority

- P0: Hide/disable browser backup execution for Mongo and unknown.
- P0: Replace Mongo backup copy with truthful limitation.
- P1: Add restore readiness and last successful backup clarity.

### 6.6 Admins Tab

#### Current state

The Admins tab reads admin sources through the browser: TXT admin data, Site Collection Admins, and Owners Group. It can refresh admins, repair TXT admins, and open the admin screen.

#### UX/product problems

- The tab implies all admin sources have the same authority.
- The copy does not clearly distinguish application admins from SharePoint hosting admins.
- `תקן TXT בדפדפן` is too technical and too action-light for a live write.

#### Functional/storage problems

- Admin live read auto-runs for all sites. This is acceptable as a safe read if copy is clear.
- TXT repair is disabled for Mongo, which is good.
- TXT repair is enabled for unknown, which is unsafe.

#### Mongo/TXT problems

- Mongo: application admin truth should come from Mongo/Builder backend. SharePoint Owners/Site Collection Admins are hosting access signals only.
- TXT: TXT admins can be authoritative app-admin source.
- Unknown: show sources but do not repair until source is identified.

#### Redesign recommendation

Borrow the source-authority model already present in the broader Admins page:

- `מנהלי אפליקציה`
- `גישה לאירוח SharePoint`
- `מקורות TXT`
- `פערים לטיפול`

#### Priority

- P0: Disable TXT repair for unknown.
- P1: Explain source authority by backend.
- P1: Put repair behind preview and confirmation.

### 6.7 Jobs Tab

#### Current state

The Jobs tab displays job history, status, logs, evidence, and result drawers.

#### UX/product problems

- `Jobs של האתר` and raw `logs/evidence/result` language are too technical.
- Operators need "what ran, did it work, what changed, what should I do now?"

#### Functional/storage problems

- The data is useful and should remain.
- The evidence drawer is appropriate as advanced support detail.

#### Mongo/TXT problems

- The job list should label connector and data backend per job so a Mongo operator can tell whether a job touched SharePoint hosting, Mongo backend, or Hub metadata.

#### Redesign recommendation

Rename to `פעילות והרצות`. Table columns should be:

- Action
- Status
- Connector
- What changed
- Started/ended
- Started by
- Details

#### Priority

- P1: Translate and humanize.
- P1: Add connector/source labels.
- P2: Keep raw logs in drawer only.

### 6.8 Audit Tab

#### Current state

The Audit tab displays audit events, raw result strings, request IDs, and technical details.

#### UX/product problems

- It reads like a backend audit table, not an operator activity log.
- Request IDs and raw results are useful for support but should not be primary.

#### Functional/storage problems

- Audit data is valid.
- The client filters by `entityId`, which is acceptable if the API returns enough events.

#### Mongo/TXT problems

- Audit events should label operation class: metadata, Browser SharePoint, Builder Mongo, migration, permission change.

#### Redesign recommendation

Merge Jobs and Audit into one `פעילות ויומן` area with two views:

- `פעולות`
- `יומן אבטחה ותמיכה`

#### Priority

- P1: Human-readable action names.
- P2: Keep request IDs in advanced drawer.

### 6.9 Notes Tab

#### Current state

The Notes tab displays notes and last error.

#### UX/product problems

- A full tab for notes may be too much unless notes become an operational handoff area.
- Last error should appear in Overview when actionable.

#### Functional/storage problems

- No major correctness issue found.

#### Mongo/TXT problems

- Notes should be clearly Hub metadata and not confused with site data.

#### Redesign recommendation

Move notes into:

- Overview: last error / operator note snippet.
- Settings/Advanced: full notes.

#### Priority

- P2: Reposition and clarify as Hub metadata.

## 7. Operations / Bootstrap Deep Audit

This section is intentionally the most detailed because the current `Operations / Bootstrap` area is the highest-risk part of the page.

### Current card-level problem

The card combines three different kinds of actions:

- Plan-only server reads
- Browser SharePoint live writes
- Browser SharePoint permission changes

It also uses terms that are familiar to engineers but not to operators. The operator sees `Provision`, `Permissions`, and `Bootstrap`, but cannot tell exactly what will be created, changed, or only previewed.

### Operation-by-operation audit

| UI button/control | What it does now | What it touches | Connector | Storage compatibility | Risk | Required UX/copy |
|---|---|---|---|---|---|---|
| `בנה תוכנית` | Calls `sitesApi.siteBootstrapPlan(site._id)` | Server creates a bootstrap plan from metadata, provision plan, and permissions plan | Hub API only; no live SharePoint write | TXT: conditional. Mongo: advanced only after plan is storage-aware. Unknown: invalid | Medium because plan implies future writes | Rename to `הכן תוכנית הקמה`. Helper: `מציג מה יבוצע לפני כתיבה. לא מריץ פעולה.` |
| `תכנן Provision` | Calls `sitesApi.siteProvisionPlan(site._id)` | Plan includes libraries/folders and default TXT files | Hub API only; no live SharePoint write | TXT: conditional. Mongo: invalid as currently described if it includes TXT seeds. Unknown: invalid | Medium | Rename to `תכנן תשתית אירוח`. Explicitly say whether TXT files will be created |
| `תכנן הרשאות` | Calls `sitesApi.permissionsSetupPlan(site._id)` | Plan for `siteUsersDb` permissions | Hub API only; no live SharePoint write | TXT/Mongo: conditional. Unknown: invalid | Medium | Rename to `תכנן שינוי הרשאות`. Show exact target and group |
| `הרץ Provision` | Queues job, runs `runBrowserSharePointProvisionOperation`, records evidence | Creates/ensures SharePoint libraries/folders and writes default TXT seed files if missing | Browser SharePoint write using digest | TXT: conditional. Mongo: invalid as current primary action. Unknown: invalid | High | Rename to `צור/אמת תשתית SharePoint`. Disable for Mongo until it stops seeding TXT. Disable for unknown |
| `הרץ הרשאות` | Queues job, runs `runBrowserSharePointPermissionsOperation`, records evidence | Breaks/sets inheritance on users library root, grants Contribute to members group, writes marker | Browser SharePoint permission write using digest | TXT/Mongo: conditional. Unknown: invalid | High | Rename to `הגדר הרשאות ספריית משתמשים`. Require confirmation showing group and folder |
| `הרץ Bootstrap` | Queues job, runs `runBrowserSharePointBootstrapOperation`, which calls provision then permissions | Same as provision plus permissions | Browser SharePoint write using digest | TXT: conditional. Mongo: invalid as current primary action. Unknown: invalid | Very high | Remove as primary. Replace with explicit staged setup checklist |
| `Browser SharePoint` badge | Labels connector | No action | Browser connector concept | Applies to browser actions only | Low but confusing | Replace with full Hebrew explanation per action: `ירוץ דרך הדפדפן שלך ב־SharePoint` |
| Plan step list | Shows first steps/blockers | Generated by server services | Plan-only | Currently storage-mixed | Medium | Translate step names; group by `אירוח`, `נתוני TXT`, `הרשאות`, `בדיקות` |

### Exact backend/frontend behavior that must be reflected in UI

#### Provision plan and run

Current plan/run intent:

- Ensure SharePoint document libraries such as `siteDB`, `siteUsersDb`, `siteAssets`.
- Ensure folders such as images, final dist, assets, backup folders.
- Ensure default TXT files such as master config, users, events, navigation, content, theme, widgets, external links, and gantt data.

Current issue:

- This is valid for a TXT-backed site.
- It is not valid as a normal Mongo-backed site operation because it can create TXT files that look like source data.

Required behavior:

- TXT: allow with preview and backup warning.
- Mongo: show only hosting folder/library checks. Do not seed TXT data unless explicitly running a legacy compatibility repair.
- Unknown: block and ask to identify backend.

#### Permissions plan and run

Current run intent:

- Uses the browser SharePoint session and request digest.
- Changes permissions on the users library/root.
- Grants Contribute to the associated members group.
- Writes a permissions marker.

Current issue:

- Permission changes are high-risk and should not sit beside harmless plan buttons without friction.

Required behavior:

- Always show exact target URL/library and group before execution.
- Require explicit confirmation.
- Label as permission-changing write.
- Keep evidence afterward.

#### Bootstrap plan and run

Current plan intent:

- The server plan reads like a full bootstrap workflow, including site creation/provision/permissions.

Current browser execution:

- Browser bootstrap runs provision and permissions.
- It does not create the SharePoint site collection.

Current issue:

- The button name promises more than the browser implementation actually does.

Required behavior:

- Rename or split.
- If site collection creation is not implemented in browser, do not imply it is.
- Present as a staged checklist:
  1. Site exists
  2. Hosting libraries/folders exist
  3. Runtime config exists
  4. Permissions are set
  5. App loads

### Proposed replacement for Operations / Bootstrap

Replace the card with `מרכז פעולות לאתר` and three groups:

| Group | Purpose | Actions |
|---|---|---|
| `בדיקות בטוחות` | Read-only or plan-only | Identify backend, check hosting, check runtime config, build plan |
| `תחזוקת אירוח` | Browser SharePoint writes | Create/verify folders, deploy release, upload runtime config |
| `פעולות רגישות` | Permission/migration/repair actions | Change permissions, repair TXT admins, migrate TXT to Mongo |

Every action row should include:

- What will change
- Connector
- Storage backend applicability
- Last run status
- Required permission/session
- Confirmation for writes

## 8. Hebrew Copy Replacement Dictionary

| Current copy/term | Recommended Hebrew | Notes |
|---|---|---|
| Operations / Bootstrap | מרכז פעולות לאתר | Use as broad action center |
| Provision | הקמת תשתית אירוח | If specifically SharePoint libraries/folders |
| Bootstrap | הקמה ראשונית מלאה | Only if truly full bootstrap; otherwise avoid |
| Browser SharePoint | הרצה דרך הדפדפן המחובר ל־SharePoint | Use in helper text, not as unexplained badge |
| Connector | אופן הרצה | Operator-facing |
| Evidence | ראיות אימות | Keep mostly in advanced drawer |
| Advanced JSON | נתונים טכניים | Hide in drawer |
| Runtime config | קובץ הגדרות טעינה | Explain it lets the app know where to load data |
| Mongo / Builder backend | מקור הנתונים Mongo דרך שרת Builder | Clarifies authority |
| Health check | בדיקת תקינות | Split by hosting/runtime/data |
| Jobs | פעולות והרצות | Better than raw English |
| Audit | יומן פעולות | Or `יומן אבטחה ותמיכה` for support view |
| Backup ID | מזהה גיבוי | Advanced/details |
| Target URL | כתובת יעד | |
| Final app URL | כתובת האתר הפעיל | |
| SharePoint site URL | אתר SharePoint מארח | |
| Source paths | נתיבי מקור | |
| Verification evidence | ראיות אימות | |
| Logs | לוגים טכניים | Advanced |
| Seed | נתוני בסיס | Avoid unless advanced |
| Registry | רישום אתר | |
| Collection | אוסף נתונים | |
| Safe collection | אוסף נתונים בטוח | |
| SHA | מזהה גרסה טכני | Advanced |
| HTTP | מצב תקשורת | Advanced unless debugging |
| HashRouter | ניתוב פנימי של האפליקציה | Advanced |
| Metadata | מידע ניהולי ב־Hub | Important distinction |
| Read-only | בדיקה ללא שינוי | |
| Dry run | תוכנית לפני הרצה | |
| Write operation | פעולה שמשנה נתונים | |
| Permission write | שינוי הרשאות | Must be explicit |
| TXT repair | תיקון נתוני מנהלים בקבצי TXT | TXT-only |
| TXT to Mongo migration | העברת אתר TXT ל־Mongo | High-risk wizard |
| Browser deploy | פריסה דרך הדפדפן ל־SharePoint | |

## 9. Proposed New Site Details IA

The current IA is implementation-shaped. The new IA should be operator-goal-shaped.

### Recommended tabs

| New tab | Replaces/includes | Operator question answered |
|---|---|---|
| `סקירה` | Current overview, notes snippet, last error | Is this site healthy and what should I do next? |
| `פריסה וגרסאות` | Current versions, deploy entry, rollback summary | What is live and can I publish/rollback safely? |
| `גיבויים ושחזור` | Current backups | Is the site's data protected and restorable? |
| `גישה ומנהלים` | Current admins | Who can manage the app and hosting? |
| `תקינות וחיבורים` | Current health | Which dependency is healthy/unhealthy? |
| `אירוח ונתיבים` | Current paths | Where is the app hosted and what files/configs matter? |
| `פעילות ויומן` | Current jobs + audit | What ran, what changed, and what failed? |
| `הגדרות מתקדמות` | Notes, raw evidence, JSON, technical IDs | Support/debug details |

### Why this IA is better

- It aligns with operator goals instead of implementation modules.
- It reduces tab count from nine to eight while merging overlapping activity/history surfaces.
- It creates a natural place for raw evidence without polluting the main flow.
- It allows storage-specific page modes without duplicating everything.

## 10. Proposed Above-the-Fold Layout

The first viewport should answer five questions:

1. What site am I looking at?
2. What is the source of truth for data?
3. Is the app currently usable?
4. What is the most important risk?
5. What is the next safe action?

### Proposed structure

| Area | Content |
|---|---|
| Header | Site name, final app URL, SharePoint host, environment/status badge |
| Source-of-truth badge | `Mongo`, `TXT`, or `לא זוהה`; include confidence and last verified time |
| Readiness strip | Hosting, runtime config, data backend, backups, access |
| Primary CTA | One context-aware safe action |
| Secondary actions | Menu grouped by read-only, write, advanced |
| Recent problem | Last error or blocker in plain Hebrew |

### Primary CTA rules

| Backend/state | Primary CTA |
|---|---|
| Mongo and all checks green | `פתח אתר פעיל` |
| Mongo runtime missing | `בדוק קובץ הגדרות טעינה` |
| Mongo backend failing | `בדוק מקור נתונים Mongo` |
| Mongo backup unknown | `בדוק יכולת גיבוי Mongo` |
| TXT and no recent backup | `צור גיבוי TXT` |
| TXT health unknown | `הרץ בדיקת תקינות SharePoint` |
| Unknown backend | `זהה מקור נתונים` |
| Deployment outdated but healthy | `פתח פריסה וגרסאות` |

## 11. Scroll and Section UX

### Current issues

- Overview contains too many stacked cards and high-friction technical details.
- The operator loses the site identity while scrolling.
- Important action context is separated from action buttons.
- Evidence and result drawers are useful, but entry points are too frequent.

### Recommended behavior

- Use a sticky compact site header after scroll with site name, backend, status, and primary CTA.
- Keep tabs sticky below the header.
- Put destructive or live-write actions in a right-side action panel or grouped action menu, not sprinkled through content cards.
- Use expandable advanced sections for raw paths, IDs, JSON, logs, and request IDs.
- Keep section cards shallow. Avoid cards inside cards.
- Use consistent status chips:
  - `תקין`
  - `דורש בדיקה`
  - `חסום`
  - `לא רלוונטי לאתר Mongo`
  - `לא רלוונטי לאתר TXT`
  - `לא זוהה`

## 12. Risk and Safety Model

Every action on the page should have a visible risk class. This matters more than the tab it appears in.

| Risk class | Definition | Examples | UX rule |
|---|---|---|---|
| Informational | Reads local metadata or opens a link | Open site, view paths, view jobs | No confirmation |
| Safe read | Reads SharePoint/Builder without writes | Browser health, runtime config read, Mongo health | Show connector and last checked |
| Metadata-only write | Changes HUB records only | Manual health, archive, notes, evidence save | Say `משנה מידע ב־Hub בלבד` |
| Plan-only | Builds a plan for a possible write | provision plan, permissions plan, backup plan | Say `לא מריץ פעולה` |
| Live hosting write | Writes SharePoint files/folders | deploy, TXT backup, runtime config upload, provision | Confirmation with target and connector |
| Data-source write | Changes app data | TXT repair, Mongo migration import | Strong confirmation and backup requirement |
| Permission write | Changes access control | permissions setup | Strong confirmation with exact group/library |
| Recovery/destructive | Restore, rollback, migration with replacement | restore, rollback, migration cutover | Wizard only; no inline button |
| Not implemented | Capability is known but unavailable | Mongo backup execution, SharePoint membership operation | Show blocked state; do not show run button |

### Safety rules

- Unknown backend blocks all live writes except explicitly safe detection reads.
- Mongo blocks TXT repair, TXT backup execution, and TXT seed provisioning in primary UI.
- TXT allows browser TXT backup/repair, but only with preview and confirmation.
- Permission-changing actions always require confirmation.
- Evidence/logs never substitute for human-readable outcome text.

## 13. Recommended Implementation Plan

### Phase 0: Stop unsafe affordances

- Hide TXT-to-Mongo migration unless `storageBackend === "txt"`.
- Hide/disable TXT repair unless `storageBackend === "txt"`.
- Hide/disable browser TXT backup run unless `storageBackend === "txt"`.
- Hide/disable provision/bootstrap live writes for `unknown`.
- For Mongo, block current provision/bootstrap execution until TXT seed creation is removed or isolated as legacy compatibility.

### Phase 1: Storage-aware action model

- Add a single storage-action matrix used by Site Details, Backups, Admins, and Health.
- Each action should declare:
  - backend applicability
  - connector
  - risk class
  - whether it reads or writes
  - required confirmation
  - disabled reason
- Use that model to render buttons, helper copy, and disabled states.

### Phase 2: Rewrite IA and copy

- Replace implementation-shaped tabs with operator-goal tabs.
- Replace English/system labels using the dictionary above.
- Move raw evidence/JSON/request IDs to advanced drawers.
- Add source-of-truth badge and readiness strip above the fold.

### Phase 3: Fix Operations / Bootstrap semantics

- Split bootstrap into explicit staged actions.
- Make provision plan/execution storage-aware.
- Remove TXT seed creation from Mongo hosting setup.
- Correct plan copy so it does not claim site collection creation unless that is actually implemented.
- Add confirmation for permission-changing actions.

### Phase 4: Backup/recovery truthfulness

- Align Site Details Backups with the more storage-aware Backups page.
- Mongo: show backup capability and current execution limitation.
- TXT: allow browser TXT backup with preview.
- Unknown: detection first.
- Add restore readiness as a first-class status.

### Phase 5: Verification and regression coverage

- Add tests for backend-specific action visibility.
- Add UI fixtures for Mongo/TXT/Unknown sites.
- Add copy tests or snapshots for primary labels.
- Add connector-policy tests for every operation.
- Add manual smoke checklist for browser SharePoint actions.

## 14. Acceptance Criteria

### Storage safety

- Unknown-storage sites show no live write, migration, repair, permission, or backup execution button as a primary action.
- Mongo sites do not show TXT backup execution as a primary action.
- Mongo sites do not show TXT repair.
- Mongo sites do not run provision/bootstrap code that creates TXT seed files unless the user explicitly enters a legacy compatibility flow.
- TXT-to-Mongo migration appears only for confirmed TXT sites and requires backup/readiness confirmation.

### Connector clarity

- Every action button shows or reveals:
  - connector
  - read/write class
  - target system
  - whether it changes data
- Browser SharePoint actions say they run through the user's logged-in browser session.
- Hub metadata actions say they affect HUB only.
- Mongo backend actions say they check or write through Builder backend.

### Copy and IA

- Primary UI contains no unexplained English/system terms such as `Provision`, `Bootstrap`, `Evidence`, `Jobs`, `Runtime config`, `Target URL`, or `Backup ID`.
- Raw JSON, request IDs, SHA, logs, and detailed evidence are available only in advanced/details views.
- Above the fold clearly shows source of truth, readiness, and one next safe action.
- Tabs are organized by operator goal.

### Backup/recovery

- Mongo backup area does not claim browser SharePoint backup protects Mongo data.
- TXT backup area clearly lists TXT files covered.
- Restore readiness is visible and truthful.
- Not-implemented capabilities are shown as blocked, not runnable.

### Operations/bootstrap

- Plan buttons are visually and textually distinct from run buttons.
- Permission-changing actions require confirmation.
- Bootstrap wording matches actual implementation.
- Plan steps are translated and grouped by operator meaning.

## 15. Verification Plan

### Automated tests

| Test area | Cases |
|---|---|
| Action visibility | Mongo/TXT/Unknown fixtures for migration, TXT repair, backup run, provision, permissions, bootstrap |
| Action metadata | Each action has connector, risk class, read/write flag, disabled reason |
| Backup behavior | Mongo plan shows Builder/Mongo capability; TXT plan shows browser TXT files; unknown blocks execution |
| Admin behavior | Mongo labels SharePoint admins as hosting access; TXT labels TXT admins as app source; unknown blocks repair |
| Health behavior | Mongo prioritizes runtime config and Builder backend; TXT prioritizes TXT source files; unknown detection copy |
| Copy snapshots | Primary UI has Hebrew operator labels and no unexplained system terms |
| Bootstrap/provision | Mongo path does not create TXT seed files in normal hosting setup |

### Manual runtime verification

Run the app with three fixtures:

1. Confirmed Mongo site
2. Confirmed TXT site
3. Unknown-storage site

For each fixture, capture:

- Overview
- Deployment/versions
- Backups/recovery
- Admin/access
- Health/connections
- Hosting/paths
- Activity/log
- Advanced/settings

Verify:

- Above-the-fold status is correct.
- Only safe actions are visible.
- Disabled actions explain why.
- Live-write actions show connector and confirmation.
- Evidence exists after action but does not dominate primary UI.

### Connector smoke tests

| Connector | Smoke test |
|---|---|
| Browser SharePoint read | Health/runtime config read uses browser session and no write |
| Browser SharePoint write | TXT backup/provision/deploy requests digest for target site and records evidence |
| Builder Mongo backend | Health checks `/api/healthz`, site registry, legacy docs, backup capability |
| Hub metadata | Manual health/archive/notes update only HUB records |

### Regression checks

- No Mongo primary flow depends on TXT files as source of truth.
- No TXT primary flow requires Mongo backend.
- Unknown does not allow migration/write/repair before detection.
- Plan and execution descriptions match actual code paths.
- Browser failure states are understandable and do not imply server SharePoint support exists.

## Final Audit Position

The Site Details page should become the trusted operating room for one site. Right now it is closer to a dense engineering dashboard with some useful safety work already present but not consistently applied.

The fastest path to trust is:

1. Block unsafe actions for `unknown`.
2. Stop presenting TXT operations as normal for Mongo.
3. Make every action declare connector, risk, target, and storage applicability.
4. Rewrite the first viewport around source of truth and next safe action.
5. Move evidence and raw implementation detail into advanced drawers.

Once those changes are made, the existing connector and evidence infrastructure can become a strength instead of visual noise.
