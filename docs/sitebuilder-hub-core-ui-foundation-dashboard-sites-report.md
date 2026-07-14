# Core UI Foundation, Dashboard, And Sites Report

Date: 2026-07-06

Scope: global shell/status language, Dashboard command center, and Sites registry only.

## Summary

Implemented a calmer top-level Hub experience without changing backend behavior or starting Deploy Center/Admins/Backups redesign work. The update reduces global badge noise, makes the Dashboard answer what needs attention first, and turns Sites into a more professional registry with clearer filters and calmer row actions.

## Files Changed

- `client/src/components/StatusToken.tsx`
- `client/src/components/SystemStatusBar.tsx`
- `client/src/components/Sidebar.tsx`
- `client/src/pages/DashboardPage.tsx`
- `client/src/pages/SitesPage.tsx`
- `client/src/components/SitesTable.tsx`
- `client/src/styles/index.css`
- `tests/coreUiFoundation.test.ts`
- `tmp/core-ui-redesign/capture-core-ui-qa.mjs`
- screenshots and `capture-notes.json` under `tmp/core-ui-redesign/`

## Shell, Topbar, And Sidebar

- Grouped sidebar navigation around the requested task language: `מרכז שליטה`, `אתרים`, `פריסות`, `שחזור וגיבויים`, `תפעול`, `ניהול והרשאות`, `מערכת`.
- Kept all existing routes available.
- Kept mobile navigation as a drawer/sheet; it does not render as a full sidebar block before page content.
- Reduced sidebar operation status from stacked status cards to a compact capability hint.
- Reduced global status clutter: the primary row now shows environment, API, Mongo, write/read mode, and auth/user mode.
- Moved Browser SharePoint and Builder backend details into a compact `פרטי מערכת` disclosure.

## Status Language

- Added a focused status taxonomy list in `StatusToken`: `תקין`, `דורש בדיקה`, `חסום`, `נכשל`, `לא נבדק`, `מידע ניהולי`, `בדיקה ללא שינוי`, `כתיבה זמינה`, `כתיבה חסומה`, `לא ידוע`.
- Shortened token defaults so chips carry concise state, while longer explanations remain in secondary copy/details.

## Dashboard

- Added a command-center summary strip: attention count, active sites, unknown/needs-check sites, and latest release readiness.
- Renamed and reframed the decision queue as `דורש טיפול עכשיו`.
- Capped the attention queue at 5 prioritized items.
- Reduced primary KPI cards to 4.
- Changed Dashboard header actions to secondary styling so the recommended next action remains the only primary CTA in captured states.
- Added explicit data-truth copy for Hub metadata, last checked evidence, Browser SharePoint reads, Mongo backend status, unknown/not checked state, and write capability.
- Kept recent activity as a compact timeline/list.

## Sites Registry

- Replaced the heavier KPI-style summary with a compact registry summary: active, archived, unknown storage, attention needed, and outdated/release risk.
- Made search the main toolbar control.
- Added visible storage, environment, and focus filters; kept lower-frequency status/health/version/sort filters in the existing advanced drawer.
- Added clearer empty/error states for no sites, no active sites, no archived sites, filter misses, and API load failure.
- Updated desktop table priority: site, source, environment, owner, readiness, version/deploy, backup, last checked, next action, actions.
- Kept one primary row action: `פרטים`.
- Moved external links, edit, archive, restore, and permanent delete into the row/card menu.
- Updated mobile cards to show name, backend, environment, status/attention, owner, one primary action, and a more-actions menu.

## Screenshots

- `tmp/core-ui-redesign/dashboard-desktop.png`
- `tmp/core-ui-redesign/dashboard-mobile.png`
- `tmp/core-ui-redesign/sites-desktop.png`
- `tmp/core-ui-redesign/sites-mobile.png`
- `tmp/core-ui-redesign/dashboard-dark.png`
- Metrics: `tmp/core-ui-redesign/capture-notes.json`

Capture method: Google Chrome remote debugging against local Vite and a local mock API server. The mock server served only fixture responses for auth, health, operational status, sites, jobs, releases, version status, and operation capabilities.

Visual QA metrics:

- Dashboard desktop: no horizontal overflow.
- Dashboard mobile at 390px: no horizontal overflow; mobile nav not in content flow.
- Sites desktop: no horizontal overflow.
- Sites mobile at 390px: no horizontal overflow; mobile nav not in content flow.
- Dashboard dark mode: no horizontal overflow and readable.

## Verification

- `npm test -- tests/coreUiFoundation.test.ts tests/siteDetailsActionPolicy.test.ts tests/siteDetailsWorkspaceRedesign.test.ts`
  - 3 files passed, 15 tests passed.
- `npm test -- tests/coreUiFoundation.test.ts tests/hubStaticUiConfig.test.ts tests/siteDetailsActionPolicy.test.ts tests/siteDetailsWorkspaceRedesign.test.ts`
  - 4 files passed, 31 tests passed.
- `npm test`
  - 60 files passed, 255 tests passed.
- `npm run build`
  - Passed server TypeScript build and client TypeScript/Vite build.
  - Existing Vite notices remain: `./hub-config.js` in `index.html` is not bundled without `type="module"`, and the client chunk remains over 500 kB.

## Known Remaining Issues

- Dashboard still links into Deploy/Releases, Jobs, Sites, and Diagnostics, but those deeper screens were intentionally not redesigned in this task.
- Sites still uses a dense desktop table for professional scanning. Mobile uses cards, but the first fold naturally prioritizes header, summary, and toolbar before cards.
- The screenshot harness validates UI state and layout with mock data; it does not validate live SharePoint or production data.

## Safety Confirmations

- No production environment was touched.
- No deploy was run.
- No real SharePoint writes were run.
- No real env files or secrets were read.
- No Mongo fixture writes were performed.
- Site Details storage safety was preserved: the Site Details action policy and workspace regression tests still pass.
