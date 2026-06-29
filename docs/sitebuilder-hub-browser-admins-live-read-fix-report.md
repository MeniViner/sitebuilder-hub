# sitebuilder HUB - Browser Admins Live Read Completion

## What Was Incomplete

Admins browser live-read could read SharePoint from the browser, but it stopped at local UI state:

- `AdminsPage` called `readSharePointAdminsFromBrowser` and only stored the result in React state.
- No backend evidence endpoint existed.
- No `SiteAdminSnapshot` was created from browser evidence.
- Site admin summary fields were not updated.
- Failed sources looked like `count: 0` instead of failed/unknown.
- Site Details Admins tab still used the stored backend snapshot only.
- The legacy `admin-sync` job path could still call the backend SharePoint reader.

## Implemented

### Endpoint Added

`POST /api/sites/:id/admins/browser-live-read-evidence`

The browser performs all SharePoint reads with `credentials: "include"`. The backend receives the resulting evidence and persists it. The endpoint validates:

- `connectorMode: "browser-sharepoint"`
- target site URL and timestamps
- TXT admins result
- Site Collection admins result
- Owners Group result
- per-source status: `success`, `failed`, `skipped`
- HTTP status, source URL, error code/message, counts, warnings, and evidence

The endpoint does not call SharePoint.

### Backend Persistence

`recordBrowserAdminLiveReadEvidence` now:

- validates the site exists
- normalizes and deduplicates admins consistently
- creates `SiteAdminSnapshot`
- stores connector mode, target URL, source status, raw/normalized counts, unique admins, warnings, and evidence
- updates site admin summary fields
- updates `lastAdminLiveReadAt` and `lastAdminLiveReadSource`
- writes audit log action `admins.browser-live-read-evidence`

Failed sources are stored as failed/unknown. They are not persisted as a real zero count. Existing site summary rows for a failed source are not overwritten by an empty read.

### AdminsPage

`AdminsPage` now uses `useBrowserAdminsLiveRead`:

- runs `readSharePointAdminsFromBrowser`
- posts evidence to the new backend endpoint
- applies returned Mongo summary
- auto-runs on first open when missing/stale with a session guard
- button text is `רענן מנהלים עכשיו`
- source UI uses:
  - `הקריאה נכשלה`
  - `נמשך מ־SharePoint דרך הדפדפן`
  - `נשמר ב־Mongo`
  - `Snapshot`
  - `לא נקרא עדיין`

### Site Details Admins Tab

The Site Details Admins tab now uses the same hook and shared components:

- auto-runs browser live-read when the Admins tab opens and data is missing/stale
- provides `רענן מנהלים עכשיו`
- persists evidence to Mongo
- shows the same source cards/status table/source lists as AdminsPage
- does not show failed sources as fake zero

### Browser Admin Reader

`client/src/utils/sharepointBrowserAdmins.ts` now exports tested URL builders and returns richer evidence:

- TXT admins URL
- Site Collection admins URL
- associated Owners Group URL
- Owners Group users URL
- HTTP status/status text
- source URL
- read timestamp
- raw/normalized counts
- warnings
- per-source failure status

All browser SharePoint fetches use `credentials: "include"`.

### Worker And Legacy Admin Sync

Legacy backend admin sync is blocked by default with:

`סנכרון מנהלים דרך השרת עדיין דורש הרשאת שרת ל־SharePoint או הסבה לחיבור דרך הדפדפן.`

This applies before queueing new `admin-sync` jobs and defensively inside the worker before the legacy backend reader can run.

The old `POST /api/sites/:id/admins/live-read` endpoint remains blocked and is not used by UI.

## Tests Added/Updated

Added coverage for:

- browser TXT admins URL
- browser Site Collection admins URL
- browser Owners Group URLs
- browser reads using `credentials: "include"`
- successful browser admin parsing
- failed source represented as failed, not fake zero
- evidence endpoint persistence service creates `SiteAdminSnapshot`
- site admin summary update
- evidence persistence does not call SharePoint
- evidence controller writes audit log
- AdminsPage uses the browser live-read hook
- AdminsPage posts through `recordBrowserAdminLiveReadEvidence`
- AdminsPage auto-read guard exists
- Site Details Admins tab uses the same browser connector flow
- button text `רענן מנהלים עכשיו`
- legacy `admin-sync` blocked before backend SharePoint job creation

## Verification

- `npm test`: passed, 39 files / 167 tests
- `npm run build`: passed

Vite still reports the existing large chunk warning after client build; it is not a build failure.

## Browser Smoke Checklist

Not run from this environment.

In classified SharePoint-hosted mode:

- open `index.html#/admins`
- select a site
- confirm auto live-read runs once
- confirm TXT admins source reads through browser
- confirm Site Collection source reads through browser
- confirm Owners Group source reads through browser
- confirm evidence persists to Mongo
- confirm source counts update
- confirm failed source says `הקריאה נכשלה`, not `0`
- confirm button says `רענן מנהלים עכשיו`
- open `index.html#/sites/:id?tab=admins`
- confirm the same browser connector flow runs there
- confirm no backend `sharepoint-digest-failed:401` admin-read path is used

## Remaining Admin Write Blockers

- Admin TXT repair write remains blocked until browser write flow is implemented.
- Add/remove SharePoint Site Collection admin remains backend-service-auth required or needs browser conversion.
- Add/remove Owners Group admin remains backend-service-auth required or needs browser conversion.
- Legacy unattended/background admin sync requires real backend service auth or a browser-executed replacement.
