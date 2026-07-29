# HUB Builder API pilot Gateway

## Status

Backend-only `PILOT_ONLY` implementation for the isolated `alphateam-mongo-pilot` Builder data site. The Gateway is disabled by default and does not become active when the existing Builder backend connector is configured.

## Baseline and deployment boundary

The implementation branch starts from frozen local HUB release candidate `sitebuilder-hub-simplified-s0s1-rc1` at `53488763b0a460613a639f5b0d7b2301a821ccd1`. That baseline contains approved product-simplification and hardening integration commits. Mongo S2/no-go work is not included.

Deployment changes only compiled backend files in the IIS/iisnode `dist` root. It does not include the HUB client build, change navigation or Site Details, persist a HUB `siteDataBinding`, migrate Mongo, alter TXT sites, or absorb the Builder repository.

## Public contract

```text
https://sitebuilderhub.idf/builder-api/healthz
https://sitebuilderhub.idf/builder-api/api/sites/alphateam-mongo-pilot/...
```

Browser site routes require exact origin `https://portal.army.idf`. The only allowed site ID is `alphateam-mongo-pilot`; `alphateam`, root registry routes, global/admin routes, and arbitrary upstream paths are rejected. The server injects the Builder API key after removing browser credentials and spoofable headers.

The fixed upstream is a validated loopback origin, normally `http://127.0.0.1:3001`. Requests preserve safe conditional headers, bodies up to the Builder backend’s 10 MB limit, query strings, statuses, response bodies, and safe response headers. Timeout and unavailable-upstream errors are minimal and secret-free.

## Pilot bootstrap

The Windows helper uses the internal Builder API directly and reuses the exact nine legacy seed shapes already implemented by `mongoSiteCreation.service.ts`. It runs a read-only preflight, requires `CREATE_ALPHA_MONGO_PILOT`, creates only the supported Builder registry record, lets Builder generate `safeCollectionName`, writes only missing seed objects for a newly created registry, and verifies all reads. An existing registry causes a no-write safe stop/verification result.

Pilot identity:

```text
siteId: alphateam-mongo-pilot
displayName: Alpha Team Mongo Pilot
environment: test
```

The Builder registry’s supported create schema does not persist an `environment` property. The helper treats `test` as immutable operator metadata and does not modify HUB Mongo to emulate it.

## Frontend values

```env
VITE_SP_HOST=portal.army.idf
VITE_SP_SITE_CODE=alphateam

VITE_SP_SITE_DB_FOLDER=siteMongoDB
VITE_SP_USERS_DB_FOLDER=/sites/alphateam/siteMongoUsersDB

VITE_STORAGE_BACKEND=mongo
VITE_SITE_ID=alphateam-mongo-pilot
VITE_BACKEND_API_URL=https://sitebuilderhub.idf/builder-api
```

No browser API key or secret-bearing Vite variable is permitted.

The closed-Windows package contains the complete checksum, backup, copy, enablement, bootstrap, verification, and rollback procedure.
