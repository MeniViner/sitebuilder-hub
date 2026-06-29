# Sitebuilder HUB Create Site Provisioning Correction Report

## Verdict

Create New Site is now treated as its own provisioning flow, not as a shortcut to release deploy.

The corrected sequence is:

1. Save a HUB draft/planned registry row.
2. Create or verify SharePoint hosting foundations: `siteDB`, `siteUsersDb`, `siteAssets`, `images`, `dist`, and `dist/assets`.
3. Seed the data source.
4. Upload and verify runtime config for Mongo-backed sites.
5. Allow initial deploy only after the hosting/runtime foundations exist.
6. Mark `ready` only after hosting, data, runtime config, deploy/index, admins, and backup gates pass.

## Regular Site Builder Re-Audit

Files inspected in `/Users/meni/dev/site-builder` only:

- `package.json`
- `scripts/sp-env.js`
- `scripts/init-sharepoint-site.js`
- `scripts/postbuild.js`
- `deploy.js`
- `src/pages/AdminSharePointSetupPage.jsx`
- `src/services/sharePointDocumentLibrariesSetup.ts`
- `scripts/sharepoint-closed-export/installRuntimeConfigCore.mjs`

Answers:

1. `siteDB` is created by browser SharePoint REST in `AdminSharePointSetupPage.jsx` (`ensureLibrary`) and the reusable browser service `sharePointDocumentLibrariesSetup.ts` (`ensureSingleLibrary` -> `createDocumentLibrary`). The Node init script only checks/finalizes an existing library.
2. `siteUsersDb` is created by the same browser REST flow, using the configured `VITE_SP_USERS_DB_FOLDER`.
3. `siteDB` and `siteUsersDb` can point to the same physical target. The regular flow resolves both from config and idempotently checks/creates by title/path.
4. Finalization creates `dist`, `siteAssets`, and `images` under `siteDB`; browser setup also copies bootstrap files into final `dist` and creates nested folders required by uploaded assets.
5. Initial TXT files are `bihs_master_config_v1.txt`, `users_data.txt`, `events_data.txt`, `nav_data.txt`, `site_content_data.txt`, `theme_data.txt`, `widgets_data.txt`, `external_links_data.txt`, and `gantt_data.txt`. Most live under `siteDB/siteAssets`; `widgets_data.txt` lives under `siteUsersDb` unless `widgetsDbTarget` is `site`.
6. Node scripts: `sp-env.js`, `init-sharepoint-site.js`, `postbuild.js`, `deploy.js`, and runtime config helper scripts.
7. Browser SharePoint/bootstrap: `AdminSharePointSetupPage.jsx` and `sharePointDocumentLibrariesSetup.ts`.
8. WebDAV/robocopy: `deploy.js` copies `dist` to bootstrap/final targets with `robocopy`; `init-sharepoint-site.js` uses WebDAV paths for folder/file finalization.
9. Browser REST: document libraries, folders, TXT file uploads, digest via `/_api/contextinfo`, and file copy via `Files/add`.
10. HUB must recreate the creation plan, browser library/folder provisioning, TXT seed behavior for TXT sites, Mongo seed/runtime behavior for Mongo sites, and readiness gates.
11. Mongo-backed sites skip TXT as source of truth. Mongo seed docs/scopes are source of truth; TXT files are only compatibility/fallback/export material.
12. Mongo-backed sites still require SharePoint hosting: `siteDB`, `siteUsersDb` when configured/needed, `siteAssets`, `dist`, `dist/assets`, and runtime config.

## HUB Implementation

Implemented in `sitebuilder HUB` only:

- Added Browser SharePoint document-library creation/verification helpers.
- Added Browser SharePoint TXT file create-if-missing helper.
- Changed TXT Create New Site to provision through Browser SharePoint instead of queuing backend SharePoint bootstrap by default.
- Changed Mongo Create New Site to create/verify SharePoint hosting before Mongo backend seed execution.
- Added exact `sharePointHosting` plan targets for Mongo creation, including same/separate `siteDB` and `siteUsersDb`.
- Blocked initial deploy in the creation plan until hosting/runtime foundations are verified.
- Added `siteUsersDb` to Mongo readiness gates and final verification.
- Updated wizard copy so it says:
  - `קודם יש ליצור את תשתית SharePoint של האתר.`
  - `לא ניתן לפרוס לפני שנוצרו siteDB / siteUsersDb / dist.`
  - `האתר נרשם ב־HUB, אבל עדיין לא מוכן לפריסה.`
  - `השלב הבא: יצירת ספריות ותיקיות SharePoint.`
  - `לאחר מכן ניתן להריץ פריסה ראשונית.`

## Connector Policy

- Browser executable: request digest, create/verify document libraries, create folders, write TXT files, upload runtime config, verify runtime config readback.
- Backend service auth/manual required: SharePoint site collection creation if the target SharePoint web itself does not exist or tenant policy blocks browser library creation.
- Backend SharePoint digest is not attempted by default for Create New Site.

## TXT vs Mongo

TXT-backed creation:

- SharePoint is both host and data source.
- Browser provisioning creates/verifies `siteDB`, `siteUsersDb`, `siteAssets`, `images`, `dist`, `dist/assets`.
- TXT files are written to exact resolved physical paths.
- Site remains not ready until deploy/index verification passes.

Mongo-backed creation:

- SharePoint hosts frontend/runtime config.
- Mongo is the live data source.
- Browser provisioning creates/verifies SharePoint hosting first.
- Builder backend creates registry, safe collection, seed docs, admins/users seed, and backup capability.
- Runtime config is uploaded after hosting and Mongo creation.
- TXT files are not treated as source of truth.

## Verification

Commands run:

- `npm test -- --run tests/mongoSiteCreation.test.ts tests/createMongoWizardFieldUx.test.ts`: passed, 14 tests.
- `npm test`: passed, 47 files / 210 tests.
- `npm run build`: passed.

Build note: Vite reports the existing large chunk warning for the main JS bundle; build still succeeded.
