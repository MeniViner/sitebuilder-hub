# Sitebuilder HUB Builder Backend Defaults and Add Site UX Report

## Builder Backend Meaning

`Builder backend URL` is the Site Builder API origin used by Mongo-backed sites to read and write runtime data. The generated runtime config points the Site Builder frontend at this backend with `storageBackend: "mongo"`, `backendApiUrl`, `siteId`, and an API-key value resolved server-side only when the current architecture requires it.

## Central Configuration

The HUB backend now exposes Builder backend runtime metadata through `GET /api/operations/capabilities`.

Supported env/config names:

- `SITE_BUILDER_BACKEND_API_URLS`
- `SITE_BUILDER_DEFAULT_BACKEND_API_URL`
- `SITE_BUILDER_DEFAULT_BACKEND_LABEL`
- `SITE_BUILDER_DEFAULT_API_KEY_REF`
- existing alias: `SITE_BUILDER_BACKEND_DEFAULT_API_KEY_REF`
- `SITE_BUILDER_DEFAULT_STORAGE_BACKEND`
- `HUB_ADVANCED_MANUAL_SITE_FIELDS_ENABLED`

The response returns safe metadata only:

- configured Builder backend options
- default Builder backend URL
- default credential reference
- credential configured yes/no
- backend allowlist status
- environment/local/prod classification
- production/classified default exists yes/no

Raw API keys are never returned.

## Create New Mongo Wizard

Basic mode no longer asks the owner to type a raw backend URL. It uses runtime capabilities from the HUB backend.

- one configured backend: auto-selected and shown read-only
- multiple configured backends: dropdown
- no configured backend: Hebrew setup blocker
- production/classified: prefers non-local production/default backend
- localhost in production: blocked by frontend validation and server-side planning
- manual backend URL override: available only in `הגדרות מתקדמות`

The plan preview shows backend label, backend host/origin, credential reference, credential configured/missing, allowlist status, and whether the backend will be written to runtime config.

## Runtime Config

Runtime config generation uses the selected/default backend from the Mongo creation plan.

The wizard shows only:

- `API key מוגדר`
- `חסרה הפניה להרשאת API`

It does not show raw key values.

## Existing Site Flow

`הוסף אתר קיים` keeps normal/basic mode focused on owner-facing fields:

- site name
- site code / SharePoint path
- environment
- estimated storage backend
- SharePoint URL
- final app URL if known
- owners/admins where relevant

Infrastructure values are suggested, detected, previewed, or placed under `הגדרות מתקדמות`.

## Auto Detection

The existing-site flow includes `זיהוי אוטומטי`.

It shows:

- `פרטים בסיסיים`
- `זיהוי אוטומטי`
- `נתיבים שזוהו`
- `נתונים חסרים`
- `הגדרות מתקדמות`

Detection/suggestion sources:

- SharePoint URL and site code for `siteDB`, `siteUsersDb`, `siteAssets`, `dist`, `index.html`, `runtime config`, bootstrap, and TXT legacy paths
- saved runtime config status, when available, for storage backend, backend host, siteId, and API-key status
- configured Builder backend options from HUB capabilities

Missing detection produces warnings and suggested next steps, not blank required technical fields.

## Basic vs Advanced

Basic mode avoids infrastructure internals. Advanced keeps manual flexibility for exceptional cases:

- final app URL
- Builder backend override
- Builder siteId
- `siteDB`
- `siteUsersDb`
- bootstrap library/folder
- runtime config path
- credential reference
- safe collection name
- Mongo environment/database
- `widgets_data.txt` location

Advanced fields include placeholders/help and reset/apply actions in the detection step.

## Settings and Diagnostics

Settings now includes:

- `Builder Backend`
- `ברירות מחדל ליצירת אתרים`

Diagnostics also shows safe Builder backend runtime metadata next to runtime config and Mongo backend checks.

Both surfaces show credential refs/status only, never secrets.

## Email Auto Completion

Army personal-number email completion is shared by owner email and initial-admin fields.

Rule:

- `s8856096` -> `s8856096@army.idf.il`
- `S8856096` -> `s8856096@army.idf.il`
- full emails remain unchanged
- invalid values remain unchanged

The UI shows a Hebrew hint and subtle completion feedback.

## Production and Local Behavior

Production/classified sites never default to localhost. Local/dev backends are allowed only when configured and are labeled as local/dev. Server-side planning blocks `localhost`/`127.0.0.1` for production sites even if a stale frontend payload sends it.

## Validation and Tests

Validation now covers:

- Mongo requires a configured Builder backend
- one backend auto-selects
- multiple backends use dropdown
- no backend blocks plan generation with Hebrew setup text
- no raw API key in backend URL or credential fields
- localhost blocked for production
- runtime config uses plan-selected backend
- Settings/Diagnostics expose safe metadata
- existing-site flow hides infrastructure fields in basic mode
- existing-site detection suggests/fills paths
- advanced overrides remain available
- army email completion

Commands requested:

- `npm test`
- `npm run build`

Results are recorded in the final Codex response for this change.
