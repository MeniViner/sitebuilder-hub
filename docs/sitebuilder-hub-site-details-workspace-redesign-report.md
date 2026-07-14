# Site Details Workspace Redesign Report

Date: 2026-07-06

## Summary

Implemented the Site Details page redesign as a storage-aware operator workspace. The page now starts with a clear site identity header, source-of-truth banner, readiness strip, one recommended next action, and a secondary action menu. The old mixed overview/actions model was replaced with focused workspace tabs:

- סקירה
- פריסה וגרסאות
- גיבויים ושחזור
- גישה ומנהלים
- תקינות וחיבורים
- אירוח ונתיבים
- פעילות ויומן
- הגדרות מתקדמות

Legacy query tabs are still mapped to the new IA so old links do not break.

## Main Implementation

- Added a reusable Site Details action policy layer in `client/src/utils/siteDetailsActionPolicy.ts`.
- Expanded storage-aware action keys for safe reads, deployment navigation, backups, restore review, and rollback navigation.
- Added connector/risk labels so action rows show what runs where and what risk class applies.
- Redesigned `client/src/pages/SiteDetailsPage.tsx` around workspace primitives:
  - `SiteWorkspaceHeader`
  - `SourceOfTruthBanner`
  - `SiteReadinessStrip`
  - `SiteNextActionPanel`
  - `SiteActionCenter`
  - `SiteDependencyCard`
  - `PathGroup`
- Split the page into task-based panels instead of raw technical clusters.
- Kept technical JSON and detailed evidence available under advanced/details drawers.
- Updated visible drawer/table copy away from mixed English labels where it affected operator-facing summaries.

## Storage Safety

- `unknown` storage blocks write-risk actions until the source is identified.
- `mongo` storage blocks TXT backup, TXT admin repair, TXT-to-Mongo migration, and current TXT-seeding provision/bootstrap flows.
- Mongo backup execution is visible as unavailable and explicitly states that full Mongo backup is not yet implemented in the Hub.
- `txt` storage keeps TXT backup/repair/migration paths available with risk labels.
- No backend capability code was removed.
- No SharePoint write operations were run.

## Verification

- Added `tests/siteDetailsWorkspaceRedesign.test.ts` for the new workspace IA, header/readiness/action-center primitives, operator sections, and storage-state action policy.
- Updated `tests/siteDetailsActionPolicy.test.ts` for new policy coverage and workspace wiring.
- Ran focused tests:
  - `npm test -- tests/siteDetailsActionPolicy.test.ts tests/siteDetailsWorkspaceRedesign.test.ts`
  - Result: 2 files passed, 11 tests passed.
- Ran full test suite:
  - `npm test`
  - Result: 59 files passed, 251 tests passed.
- Ran full build:
  - `npm run build`
  - Result: server TypeScript build and client TypeScript/Vite build passed.
  - Existing Vite warnings remained: non-module `hub-config.js` bundling notice and chunk-size warning.

## Local App / Browser Check

- Local client was reachable at `http://localhost:5173`.
- Local API was reachable at `http://localhost:4100/api/sites`.
- API storage sample contained 4 sites, all with `storageBackend: "unknown"`.
- Browser verification was attempted through the Codex in-app browser tooling, but the browser target was unavailable:
  - `agent.browsers.get("iab")` returned `Browser is not available: iab`.
  - `agent.browsers.list()` returned an empty list.
- Because no browser target was available, screenshots and real visual inspection of the three storage states could not be completed in this thread.
- No local/dev fixture writes were created because the screenshot/visual inspection tooling was unavailable.

## Files Changed

- `client/src/pages/SiteDetailsPage.tsx`
- `client/src/utils/siteDetailsActionPolicy.ts`
- `tests/siteDetailsActionPolicy.test.ts`
- `tests/siteDetailsWorkspaceRedesign.test.ts`
- `docs/sitebuilder-hub-site-details-workspace-redesign-report.md`
