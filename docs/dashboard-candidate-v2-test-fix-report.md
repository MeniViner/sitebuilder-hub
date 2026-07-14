# Dashboard Candidate v2 Test Fix Report

## Root causes

- `tests/browserAdminUi.test.ts`: the Site Details admins surface moved from the old `admins` tab key into the broader `access` tab. Product behavior is intentional: `legacyTabMap` still maps `tab=admins` to `access`, and the browser admin live-read hook runs when `activeTab === "access"`.
- `tests/siteDetailsActionPolicy.test.ts`: Mongo/SharePoint source copy is intentionally more precise now. SharePoint hosts app files and the runtime config file; live site data remains in Mongo.
- `tests/siteDetailsActionPolicy.test.ts` and `tests/hubStaticUiConfig.test.ts`: some static assertions still expected literal Hebrew copy inside `SiteDetailsPage.tsx`, while current Site Details copy/action labels are centralized in `siteDetailsActionPolicy.ts` and then rendered through policy-driven action groups.

## Files changed

- `tests/browserAdminUi.test.ts`
- `tests/siteDetailsActionPolicy.test.ts`
- `tests/hubStaticUiConfig.test.ts`
- `docs/dashboard-candidate-v2-test-fix-report.md`

## Behavior vs test expectation

- Corrected test expectations only.
- No Site Details behavior code was changed.
- No Dashboard Lab code was changed.
- No production dashboard code was changed.

## Dashboard Lab / production status

- The Dashboard Lab candidate was not promoted.
- The production dashboard at `#/` stayed unchanged.
- The candidate remains lab-only at `#/dashboard-lab?concept=production-candidate&qa=1`.

## Verification

- `npm test`: passed.
  - 58 test files passed.
  - 246 tests passed.
- `npm run build`: passed.
  - Existing Vite warnings remain for `hub-config.js` script bundling and large chunk size.

## Remaining limitations

- Manual screenshot QA for the v2 candidate is still pending.
- No promotion discussion should happen until screenshot QA is complete.
