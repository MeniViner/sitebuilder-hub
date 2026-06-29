# Sitebuilder HUB Create New Mongo Site Implementation Report

## Executive Summary

The HUB now has a planned and verified `Create New Mongo-backed Site Builder Site` flow.

This implementation creates a real plan before execution, creates the HUB draft/planned record, calls the regular Site Builder Builder/Mongo backend API for Mongo registry and seed operations, uploads runtime config through the browser SharePoint connector when possible, records browser evidence, and verifies readiness gates before a site can become ready.

It does not silently create production SharePoint data or bypass SharePoint auth. If SharePoint site collection or document libraries are missing and cannot be created through the browser/user session, the plan marks that as `backend-service-auth-required` or manual. Initial frontend deploy is now orchestrated by the Create flow using compatible Release artifacts and the existing browser deploy implementation; the create flow still does not fake a deployed `index.html`.

## Wizard Flow

The Add Site modal now clearly separates:

- `הוסף אתר קיים`
- `צור אתר חדש`

For `צור אתר חדש`, the wizard supports:

- `אתר TXT legacy`
- `אתר Mongo חדש`

The Mongo path includes:

- display name
- `siteCode`
- Builder `siteId`
- environment
- `storageBackend = mongo`
- owner/admin personal numbers
- exact SharePoint URL/path fields
- runtime config path
- Builder backend URL
- credential reference
- Mongo environment/db metadata
- optional `safeCollectionName`

The plan step has a real server-backed `צור תוכנית Mongo` action. Plan generation does not execute anything.

## Planning Flow

New API:

- `POST /api/sites/mongo-create/plan`
- `GET /api/sites/:id/mongo-create/plan`

The plan includes:

- HUB registry record step
- Builder backend Mongo registry step
- safe collection verification step
- required seed docs/scopes
- runtime config generation/upload step
- Browser SharePoint digest/folder/runtime config steps
- SharePoint library creation as blocked/manual/service-auth when needed
- optional initial Browser Deploy step
- execution class for each step
- blockers and warnings

Execution classes used:

- `server-local`
- `browser-sharepoint`
- `mongo-backend`
- `backend-service-auth-required`
- `manual`

Duplicate handling remains physical/runtime-identity based. Duplicate `siteCode` is allowed when paths/backend identity differ; duplicate physical/runtime identity is detected and blocked/warned in the plan.

## Execution Flow

New API:

- `POST /api/sites/:id/mongo-create/execute`

Execution does not create approval jobs in owner mode. It runs direct, controlled Mongo backend steps:

- marks the site as provisioning
- calls Builder backend `POST /api/sites`
- verifies or receives `safeCollectionName`
- reads existing legacy-compatible docs
- writes only missing seed docs with `expectedVersion: 0`
- checks backup API capability
- runs Mongo backend health
- leaves the site as `partially-created` unless full verification later passes

The flow does not mark the site `ready` after registry-only creation.

## Builder Backend API Calls Used

The HUB uses the regular Site Builder backend API, not direct Mongo writes:

- `POST /api/sites`
- `GET /api/sites/:siteId`
- `POST /api/sites/:siteId/legacy/batch-read`
- `POST /api/sites/:siteId/legacy/batch-write`
- `GET /api/sites/:siteId/backups`
- health routes already supported by the previous phase

The backend API URL must pass the HUB allowlist. The credential is resolved from `builderApiKeyRef` or the configured default reference. Raw keys are not logged or displayed.

## Runtime Config

New API:

- `GET /api/sites/:id/mongo-create/runtime-config-content`
- `POST /api/sites/:id/mongo-create/browser-evidence`

Runtime config supports:

- `sitebuilder-runtime-config.json`
- `runtime-config.json`

Generated content contains:

- `storageBackend: "mongo"`
- `backendApiUrl`
- `siteId`
- runtime `apiKey`
- generated metadata

The plan and UI show redacted status only. The browser upload path fetches runtime config content for upload and does not render the raw API key in the UI.

Browser SharePoint setup:

- requests digest per target site
- ensures final dist folder hierarchy
- ensures siteAssets folder hierarchy
- uploads runtime config
- reads it back
- records evidence to the HUB

## Seed Docs

Seed docs are derived from the regular Site Builder legacy-compatible mapping and the HUB’s existing Site Builder provisioning defaults.

Required docs:

- `bihs_master_config_v1.txt`
- `users_data.txt`
- `events_data.txt`
- `nav_data.txt`
- `site_content_data.txt`
- `theme_data.txt`
- `widgets_data.txt`
- `external_links_data.txt`
- `gantt_data.txt`

Admins/users are seeded from the owner and initial admins supplied in the wizard.

Each seed doc records source/default metadata in the plan. Missing docs are written through the Builder backend API and verified through the Mongo health check.

## SharePoint Hosting

Implemented:

- exact physical runtime config path is planned and stored
- nested SharePoint paths are preserved
- browser digest is used
- browser document library creation/verification is attempted for `siteDB` and `siteUsersDb`
- browser folder hierarchy setup is attempted for `siteAssets`, `images`, `dist`, and `dist/assets`
- runtime config upload/readback is implemented
- browser evidence is persisted

Partial by design:

- SharePoint site collection creation is not done through the Mongo create flow
- if the browser session cannot create document libraries, the plan keeps that as manual/service-auth-required rather than falling back to backend digest

## Initial Deploy

Initial deploy is not automatically executed by the Mongo create flow.

Initial deploy is blocked until Create New Site has created or verified `siteDB`, `siteUsersDb`, `siteAssets`, `dist`, and runtime config:

- deploy still uploads frontend/dist to SharePoint
- deploy already preserves runtime config for Mongo sites
- site stays `partially-created` if deploy is skipped and no existing `index.html` is verified

## Readiness Rules

A Mongo-backed site can become ready only if all required gates pass:

- SharePoint hosting/dist/index evidence
- runtime config exists and is valid
- Builder backend reachable
- Mongo registry exists
- `safeCollectionName` resolves
- required seed docs exist
- admins/users exist
- backup capability is available
- deploy is completed or existing dist/index is verified

Browser-verified runtime config evidence is preserved during final verification so a backend SharePoint 401 does not overwrite valid browser evidence.

## UI Copy

The wizard now surfaces the required plain Hebrew states:

- `האתר נרשם ב־HUB, אבל עדיין לא נוצרה לו תשתית Mongo מלאה.`
- `Mongo registry נוצר`
- `safeCollectionName אומת`
- `קבצי seed חסרים`
- `runtime config תקין`
- `האתר עדיין לא מוכן לשימוש`
- `האתר מוכן`

## Tests Added

Added/updated tests for:

- Mongo create wizard UI exists
- create Mongo API methods/routes exist
- plan includes SharePoint hosting, runtime config, Mongo registry, safe collection, seed docs, and verification steps
- exact nested SharePoint paths are preserved
- duplicate physical/runtime identity is detected
- duplicate `siteCode` support remains identity-based
- Mongo registry creation uses Builder backend API
- safe collection is captured/verified
- required seed docs are written/verified
- missing readiness gates keep the site partially-created
- plan redacts raw API keys
- owner mode creates no approval job in this flow
- existing TXT/browser tests still pass

## Build And Test Results

- `npm test`: 44 test files passed, 186 tests passed.
- `npm run build`: server TypeScript build passed, client TypeScript/Vite build passed.
- Vite still reports the existing large chunk warning.

## Safe Dev/Test Site Creation

No safe dev/test Mongo-backed site was created in this environment.

Reason: the task requested implementation and verification, not creation of live SharePoint/Mongo data. The implemented flow is ready to create a safe dev/test Mongo-backed site when these are configured:

- Builder backend URL is in `SITE_BUILDER_BACKEND_API_URLS`
- credential reference resolves to a valid Builder backend API key
- target SharePoint site/library path is available to the browser session
- runtime config browser upload is allowed by SharePoint
- a frontend release deploy is available or existing `index.html` is verified

## Remaining Blockers

Remaining gaps before a true one-click ready site:

- Browser-side SharePoint document library creation is not implemented.
- SharePoint site collection creation remains backend-service-auth/manual.
- Initial frontend deploy is not run inside the create wizard.
- Full Mongo backup creation execution is still not implemented; backup capability is verified.
- Revisions/audit backend route discovery remains unsupported unless the Builder backend exposes a confirmed API.
