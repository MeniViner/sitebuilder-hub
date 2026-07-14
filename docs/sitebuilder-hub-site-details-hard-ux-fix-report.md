# Site Details Hard UX Fix Report

Date: 2026-07-06

Scope: Site Details page only. The work repaired the Site Details workspace structure, copy-button policy, action command surfaces, access/admin source comparison, health ordering, recovery clarity, and hosting/path density.

## Summary

- Rebuilt the top Site Details workspace into a compact operator header with source-of-truth context, one next action panel, compact readiness strip, and normal tabs.
- Replaced scattered large action cards with a reusable command list/table that explains action, consequence, connector, risk, state, and disabled reason.
- Replaced admin source summary cards with a readable comparison table and details drawers for long URLs/errors.
- Removed large text copy buttons from primary Site Details UI. Copy remains icon-only in hosting/path and advanced technical rows.
- Reordered Health, Access, and Recovery so executable controls are above evidence and technical content.

## Screenshots Reviewed

Before screenshots:

- `tmp/site-details-hard-ux-fix/before-overview.png`
- `tmp/site-details-hard-ux-fix/before-actions.png`
- `tmp/site-details-hard-ux-fix/before-access.png`
- `tmp/site-details-hard-ux-fix/before-health.png`

After screenshots:

- `tmp/site-details-hard-ux-fix/after-overview.png`
- `tmp/site-details-hard-ux-fix/after-actions.png`
- `tmp/site-details-hard-ux-fix/after-access.png`
- `tmp/site-details-hard-ux-fix/after-health.png`
- `tmp/site-details-hard-ux-fix/after-recovery.png`
- `tmp/site-details-hard-ux-fix/after-hosting.png`
- `tmp/site-details-hard-ux-fix/after-mobile.png`
- `tmp/site-details-hard-ux-fix/after-dark.png`
- `tmp/site-details-hard-ux-fix/after-contact-sheet.png`

Full-scroll capture evidence:

- `tmp/site-details-hard-ux-fix/raw-after-desktop/capture-notes.json`
- `tmp/site-details-hard-ux-fix/raw-after-mobile/capture-notes.json`
- `tmp/site-details-hard-ux-fix/raw-after-dark/capture-notes.json`

## Visual QA Results

Desktop full-tab crawl, 1440 x 1000, light mode:

| Tab | Horizontal overflow | Scroll regions | Screenshots |
| --- | --- | ---: | ---: |
| overview | false | 0 | 4 |
| deployment | false | 1 | 3 |
| recovery | false | 1 | 4 |
| access | false | 0 | 3 |
| health | false | 1 | 4 |
| hosting | false | 0 | 3 |
| activity | false | 2 | 3 |
| advanced | false | 0 | 2 |

Responsive and theme checks:

| View | Horizontal overflow | Notes |
| --- | --- | --- |
| 390 x 1000 light overview | false | Page-level scroll, no horizontal spill. |
| 1440 x 1000 dark overview | false | Header, readiness strip, tabs, and command rows remain readable. |

The remaining scroll regions are evidence/history tables where bounded scroll is intentional. The repaired Site Details header, action center, access source comparison, health action panel, recovery action list, and hosting paths do not rely on broken inner card scroll.

## UX Issues Found

- The first fold had too many equal-weight rows and competing buttons.
- Large `העתק` buttons dominated rows where copying was not part of the user's task.
- Secondary actions behaved like an unbounded menu instead of a controlled operator surface.
- Action cards did not explain whether they read data, write files, modify permissions, or were blocked by storage backend.
- Access/admin sources were hard to compare in cards and let long technical details dominate.
- Health mixed executable checks with evidence and dependency detail.
- Recovery did not make the Mongo backup limitation prominent enough.
- Hosting/paths needed to be the clean home for copyable technical paths.

## Files Changed

- `client/src/pages/SiteDetailsPage.tsx`
- `client/src/components/AdminSourceSummaryCards.tsx`
- `client/src/components/CopyButton.tsx`
- `client/src/components/LinkRow.tsx`
- `client/src/styles/index.css`
- `tests/siteDetailsWorkspaceRedesign.test.ts`
- `tests/browserAdminUi.test.ts`
- `tests/hubStaticUiConfig.test.ts`
- `docs/sitebuilder-hub-site-details-hard-ux-fix-report.md`
- QA artifacts under `tmp/site-details-hard-ux-fix/` and the local capture harness under `tmp/site-details-design-qa/` (`tmp/` is ignored by git).

## Top/Header Changes

- Added a compact `site-details-header` layout with title, code, owner, status, health, source-of-truth banner, final URL, SharePoint URL, and one next-action panel.
- Reduced top chrome density by moving metadata into a compact strip and making final/open links secondary.
- Replaced CTA-looking tabs with `site-details-tabs` / `site-details-tab`, including horizontal overflow behavior for narrow widths.

## Copy Button Policy Changes

- Added `CopyButton iconOnly` mode and `LinkRow copyMode="icon"`.
- Removed copy controls from primary overview, health, recovery, and access information rows.
- Kept copy only in hosting/path and advanced technical rows as small icon-only controls with accessible labels.

## Secondary Actions Changes

- Replaced the giant dropdown/list with a controlled `secondary-actions-panel`.
- Grouped actions by operation meaning and risk: read-only checks, Hub management, SharePoint actions, Mongo actions, sensitive actions, and technical details.
- Each row now shows action, what it does, connector/execution mode, risk, current state, and disabled reason.

## Action Center Changes

- Replaced large unclear action cards with `ActionCommandList`.
- The command rows distinguish safe reads, plan-only actions, data-source writes, hosting writes, permission writes, destructive actions, and not-implemented actions.
- Unknown, Mongo, and TXT storage states continue to flow through `siteDetailsActionPolicy`.

## Access/Admin Source Table Changes

- Replaced four cramped source cards with a `DataTable`.
- Added source type, authority, read status, count, last updated, relevance, and details.
- Long URLs and CORS/errors are hidden in `admin-source-row-details` instead of occupying primary table cells.
- Skipped/not-relevant admin sources are rendered as `לא רלוונטי`, not failures.

## Health Tab Changes

- Added a top `פעולות בדיקה` command list before dependency and evidence content.
- Kept technical URLs, evidence, and raw details below the action controls.
- Removed large copy buttons from health cards.

## Recovery/Hosting Cleanup

- Recovery now separates what is backed up, restore readiness, available actions, and detailed history.
- Mongo recovery states explicitly show that full Mongo backup execution is not implemented in Hub.
- Hosting groups useful URLs, runtime config, TXT compatibility paths, and secondary technical paths.
- Hosting path rows truncate values and use small icon-only copy controls.

## Tests/Build Results

- `npm test -- tests/siteDetailsActionPolicy.test.ts tests/siteDetailsWorkspaceRedesign.test.ts`
  - Passed: 2 files, 13 tests.
- `npm test -- tests/browserAdminUi.test.ts`
  - Passed: 1 file, 3 tests.
- `npm test -- tests/coreUiFoundation.test.ts`
  - Passed: 1 file, 5 tests.
- `npm test`
  - Passed: 60 files, 258 tests.
- `npm run build`
  - Passed server and client builds.
  - Existing Vite notices remain: `./hub-config.js` in `index.html` is not bundled without `type="module"`, and the main client chunk is larger than 500 kB after minification.

## Remaining Concerns

- Overview is still long because the full action center contains many storage-aware operations. It now uses page-level scroll and readable command rows, but it could later gain filters if operators want a shorter first pass.
- Deployment, recovery, health, and activity still contain bounded history/evidence scroll regions. These are data-table/history cases rather than the broken primary UX sections addressed here.
- Visual QA used a local mock API with realistic long URLs, failed source reads, Mongo/TXT/unknown states, mobile width, and dark mode. It did not validate live SharePoint behavior.

## Safety Confirmations

- No production environment was touched.
- No deploy was run.
- No real SharePoint writes were run.
- No real env files or secrets were read.
- Site Details storage-aware action safety was preserved.
- Core Dashboard/Sites redesign was not changed by this task.
