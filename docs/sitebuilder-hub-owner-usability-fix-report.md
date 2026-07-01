# Sitebuilder Hub Owner Usability Fix Report

## What Was Broken

- SharePoint-hosted usage could show `Local Developer` because `AUTH_ENABLED=false` always used the backend dev bypass.
- Browser SharePoint login and backend SharePoint auth were conflated, causing confusing 401 failures.
- Deploy, backup, restore, admin repair, provisioning, and permissions flows still described or created pending approval work.
- `/releases` was still mostly a single-site deploy path.
- SharePoint folder hosting needed hash routes and relative Vite assets.
- Archived sites were hard to access and the Hebrew archive copy was awkward.
- Job failure details led with raw JSON instead of a useful explanation.

## What Changed

- The frontend now uses `HashRouter`; SharePoint links work as `index.html#/releases`, `index.html#/sites`, and `index.html#/sites/:id`.
- Vite now builds with `base: "./"` so assets load from nested SharePoint folders.
- The browser calls `/_api/web/currentuser` outside localhost and forwards the SharePoint identity to the API.
- When auth is disabled, the backend prefers forwarded SharePoint identity and falls back to local dev only when no SharePoint user is present.
- Owner-direct mode is the default in `.env.example`; jobs requested with approval are queued directly unless advanced approvals are explicitly enabled.
- `/api/diagnostics` and `/api/diagnostics/sharepoint-check` were added.
- `בעיות וחיבורים` was added to the sidebar.
- Deploy Center now supports bulk dry-run and run for all active sites, selected sites, or one environment.
- Site details and Releases still support per-site deploy.
- Sites now have `אתרים פעילים` and `ארכיון` tabs; archive excludes sites from bulk deploy by default.
- Admins page auto-runs a live browser SharePoint read once per selected site and shows source/timestamp.
- Job details now show a readable failure panel before raw technical details.

## Identity

`Local Developer` appeared before because the backend dev bypass was unconditional when `AUTH_ENABLED=false`.

Now identity modes are explicit:

- SharePoint user: browser current-user succeeded and is forwarded to the API.
- Explicit owner: personal-number login when auth is enabled or SharePoint current user is unavailable.
- Local fallback: true localhost/dev fallback only, shown with a clear local development banner.

If SharePoint current-user fails in SharePoint hosting, the UI does not silently show `Local Developer`; diagnostics explains the failure.

## SharePoint 401

401 usually means SharePoint rejected the backend request. The browser may be logged into SharePoint, but the backend does not automatically inherit browser cookies unless configured.

Diagnostics shows:

- exact failing URL,
- exact HTTP status,
- backend error code,
- whether cookie/bearer token is configured,
- whether digest/contextinfo succeeds,
- human explanation and suggested fix.

For `sharepoint-digest-failed:401`, the UI says to check SharePoint auth cookie / bearer token / current-user mode / target site URL.

## Env Vars

Local dev only:

- `AUTH_ENABLED=false`
- `SHAREPOINT_WRITE_ENABLED=false`

SharePoint-hosted read-only:

- `CLIENT_ORIGIN=https://portal.army.idf`
- `CLIENT_ORIGINS=https://portal.army.idf,http://localhost:5177,http://127.0.0.1:5177`
- keep SharePoint write disabled.

SharePoint write/deploy:

- `SHAREPOINT_WRITE_ENABLED=true`
- `SHAREPOINT_AUTH_COOKIE=...` or `SHAREPOINT_BEARER_TOKEN=...`
- verify `/_api/contextinfo` in `בעיות וחיבורים`.

Owner direct mode:

- `HUB_OWNER_DIRECT_MODE=true`
- `HUB_ADVANCED_APPROVALS_ENABLED=false`

Important: `SHAREPOINT_ALLOW_UNAUTHENTICATED_WRITE=true` does not prove SharePoint will accept writes.

## Deploy Modes

- Bulk deploy: `/releases` Deploy Center plans all active sites, selected sites, or one environment; archived sites are excluded by default. Each site has its own blockers, warnings, readiness, and result.
- Per-site deploy: `/releases` single-site wizard and `/sites/:id` deployment panel remain available for a specific site.
- Canary/staged rollout was intentionally not added.

## Approvals

Owner mode no longer creates pending approval jobs by default. Approval metadata remains dormant for a future explicit advanced/team mode.

Backup is a warning in owner-direct mode unless explicitly configured as required.

## Hebrew/UI Cleanup

- `ארכב` was replaced with `ארכיון` / `העבר לארכיון`.
- Pending approval copy was removed from primary owner flows.
- Diagnostics and job failure copy now explains what failed, why it matters, and what to fix.
- Releases, Jobs, Admins, Health, Sites, and Site Details received focused layout/copy cleanup rather than a full redesign.

## Test Results

Passed locally on 2026-06-15:

- `npm test` - 20 test files passed, 93 tests passed.
- `npm run build` - server TypeScript build passed; client TypeScript and Vite production build passed.

## Browser Smoke Result

Passed locally with the in-app Browser against a fresh dev pair:

- API: `SERVER_PORT=4101`, workers disabled, Mongo connected.
- Client: `http://localhost:5178`, `VITE_API_BASE_URL=http://localhost:4101/api`.
- Hash routes verified: `#/diagnostics`, `#/releases`, `#/sites`, `#/admins`, `#/jobs`.
- Diagnostics panel rendered with exact SharePoint URLs and no 404.
- Releases rendered `Deploy Center` and the archive-excluded badge.
- Sites rendered `אתרים פעילים` and `ארכיון` tabs.
- Admins rendered `רענן מנהלים עכשיו`.
- Jobs rendered `אישור מתקדם` copy.
- Browser console errors: none in the fresh `4101/5178` smoke.

Note: an older API process was already listening on `4100`; it returned 404 for `/api/diagnostics`, so it should be restarted before testing this branch on the default port.

## Remaining Known Issues

- Real SharePoint write still requires valid backend auth material and a successful digest/contextinfo check.
- Browser current-user detection cannot be fully validated from localhost.
- Existing advanced approval code remains for future team mode but is no longer the owner-default path.
# Legacy Historical Report

This report documents an older usability fix from before the browser-only SharePoint architecture was finalized. The current source of truth is `docs/sharepoint-browser-only-status-report.md`.
