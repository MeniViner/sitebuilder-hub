# Site Details Workspace Visual QA Report

Date: 2026-07-06

Scope: visual QA and targeted polish for the Site Details workspace redesign only.

## Capture Method

- Browser: Google Chrome via remote debugging protocol.
- App URL: `http://localhost:5178/`.
- Mock API URL: `http://localhost:4199/api`.
- Capture harness: `tmp/site-details-workspace-qa/capture-site-details-qa.mjs`.
- Capture notes: `tmp/site-details-workspace-qa/capture-notes.json`.
- Codex in-app browser was unavailable in this session, and the Playwright package was not installed, so Chrome remote debugging was used as the local browser fallback.
- Fixture mode was mock API server only. The harness did not write Mongo fixtures, SharePoint files, production data, or secrets.

## Screenshots Captured

| State | Viewport | Screenshot |
| --- | --- | --- |
| Unknown source, overview | 1440 x 1100 | `tmp/site-details-workspace-qa/unknown-overview.png` |
| Unknown source, action center | 1440 x 1100 | `tmp/site-details-workspace-qa/unknown-actions.png` |
| Mongo source, overview | 1440 x 1100 | `tmp/site-details-workspace-qa/mongo-overview.png` |
| Mongo source, recovery tab | 1280 x 1000 | `tmp/site-details-workspace-qa/mongo-backups.png` |
| Mongo source, access tab | 1280 x 1000 | `tmp/site-details-workspace-qa/mongo-admins.png` |
| Mongo source, hosting tab | 1280 x 1000 | `tmp/site-details-workspace-qa/mongo-paths.png` |
| TXT source, overview | 1440 x 1100 | `tmp/site-details-workspace-qa/txt-overview.png` |
| TXT source, recovery tab | 1280 x 1000 | `tmp/site-details-workspace-qa/txt-backups.png` |
| TXT source, access tab | 1280 x 1000 | `tmp/site-details-workspace-qa/txt-admins.png` |
| Mongo source, mobile overview | 390 x 1000 | `tmp/site-details-workspace-qa/mobile-overview.png` |
| Mongo source, dark overview | 1440 x 1100 | `tmp/site-details-workspace-qa/dark-mongo-overview.png` |

## States Verified

- Unknown source presents a single safe next action: `זהה מקור נתונים`.
- Mongo source presents Mongo as the data source and describes SharePoint as hosting/config only.
- TXT source presents TXT files in SharePoint as the active data source.
- Recovery content distinguishes Mongo backup limitations from TXT backup readiness.
- Access content distinguishes app admins from SharePoint hosting access.
- Hosting content keeps Mongo TXT paths framed as compatibility/legacy paths.
- Mobile overview has no horizontal overflow at 390px.
- Dark mode overview remains legible and aligned.

All captured states reported `overflowX: false` in the capture notes. Captured primary button text is limited to the expected next action in each state: `זהה מקור נתונים` for unknown, `פתח אתר פעיל` for Mongo/TXT.

## Visual Issues Found And Fixed

| Area | Issue | Fix |
| --- | --- | --- |
| CTA hierarchy | The header `פתח אתר פעיל` action competed visually with the next safe action. | Changed the header action to secondary styling so the next-action panel owns the primary emphasis. |
| Tab navigation | Active tabs used `btn-primary`, creating another primary-looking control in the workspace chrome. | Added `site-details-tab-active` styling for active tabs without CTA weight. |
| Recovery status | Mongo/TXT backup capability surfaced raw English statuses such as `blocked` and `ready`. | Added Hebrew backup capability labels and used them in readiness and recovery KPIs. |
| KPI typography | Hebrew status words in KPI values inherited numeric monospace styling and looked oddly spaced. | Added text-value detection in `KpiCard` and a `kpi-value-text` class. |
| Admin source cards | Admin source labels mixed English and Hebrew, and skipped Mongo TXT source looked like an error. | Localized labels and treated skipped sources as `לא רלוונטי` with a stable explanatory message. |
| Admin source table | Skipped source rows displayed raw technical error text. | Replaced skipped-row error text with a user-facing not-relevant explanation. |

## Files Changed

- `client/src/pages/SiteDetailsPage.tsx`
- `client/src/components/AdminSourceSummaryCards.tsx`
- `client/src/components/KpiCard.tsx`
- `client/src/styles/index.css`
- `tests/siteDetailsWorkspaceRedesign.test.ts`
- `tests/browserAdminUi.test.ts`
- `tmp/site-details-workspace-qa/capture-site-details-qa.mjs`
- `tmp/site-details-workspace-qa/capture-notes.json`
- screenshot PNGs under `tmp/site-details-workspace-qa/`

## Verification

- `npm test -- tests/siteDetailsActionPolicy.test.ts tests/siteDetailsWorkspaceRedesign.test.ts`
  - 2 files passed, 11 tests passed.
- `npm test -- tests/browserAdminUi.test.ts`
  - 1 file passed, 3 tests passed.
- `npm test`
  - 59 files passed, 251 tests passed.
- `npm run build`
  - Passed server and client builds.
  - Existing build notices remain: Vite reports that `./hub-config.js` in `index.html` cannot be bundled without `type="module"`, and the main client chunk is larger than 500 kB after minification.

## Remaining Concerns

- The mobile first fold is usable and has no horizontal overflow, but it is still dense because the global status bar, workspace header, metadata rows, next action, readiness strip, and tabs all appear before the overview content.
- The visual QA used a local mock API server. It validates UI behavior and state presentation, not live SharePoint or production data.
- The deployment tab still contains a primary action inside its own panel, which is appropriate for that focused workflow. The captured overview/recovery/access/hosting states no longer show competing primary controls.

## Safety Confirmations

- No production deploy was run.
- No SharePoint writes were performed.
- No Mongo fixture writes were performed.
- No secrets were read or committed.
- All QA fixture data was served from the local mock API process.
