# Dashboard Production Candidate v2 Report

## What changed from v1 to v2

- Refined the existing lab-only `production-candidate` concept into a denser, calmer v2 inside `#/dashboard-lab`.
- Added hash-query concept selection and a screenshot-friendly QA mode.
- Strengthened the first fold with a calmer hero, explicit operational posture, clearer top issue, and one primary action.
- Kept exactly four primary metrics: active sites, attention items, release readiness, and backup reliability.
- Converted the capability area into a compact four-item strip: Hub API, Hub Mongo, Browser SharePoint, and SharePoint write.
- Moved Deploy, Recovery, Access, and Health into a compact readiness row instead of large operational cards.
- Kept one visual summary section only, combining health distribution, release adoption, and backup freshness.

## Exact files changed

- `client/src/pages/DashboardLabPage.tsx`
- `client/src/components/dashboard-lab/DashboardLabShell.tsx`
- `client/src/components/dashboard-lab/DashboardConceptProductionCandidate.tsx`
- `client/src/styles/index.css`
- `docs/dashboard-production-candidate-v2-report.md`

## UX decisions

- Concept A remains the base because the candidate still leads with posture, top issue, and next action.
- Concept B was borrowed for calmer spacing, fewer competing buttons, softer hero emphasis, and more executive-readable copy.
- Concept C was borrowed only as a compact Deploy / Recovery / Access / Health readiness row.
- Concept D was borrowed only for honest compact chart language: segmented health distribution, release adoption score, and backup freshness bars.
- The QA mode hides non-essential lab comparison chrome while preserving a small lab-only notice.
- The normal lab still keeps all five tabs, including the four original concepts.

## Removed or kept compact

- Removed from the candidate experience: watchlist panel, recent activity feed, module directory, raw diagnostics, raw JSON, long explanations, and deep inventories.
- Kept compact: four primary metrics, four capability statuses, four readiness domains, max four priority items, and one visual summary area.
- The hero uses one primary action; the production dashboard link remains in lab shell chrome outside QA mode.

## Data honesty notes

- The candidate uses the shared Dashboard Lab data and mapping utilities from `useDashboardLabData`.
- Capability statuses are limited to honest states: `live`, `cached`, `metadata`, `blocked`, `not checked`, and `unavailable`.
- Charts are categorical snapshots only. No fake historical trends, fake line charts, or decorative analytics were added.
- The visual summary uses existing chart primitives and existing counts/distributions: health distribution, release adoption, and backup freshness.

## Screenshot / QA mode URL

Preferred QA URL:

`http://localhost:5178/#/dashboard-lab?concept=production-candidate&qa=1`

Behavior:

- Opens directly on the production candidate.
- Hides the Dashboard Lab header and concept tabs.
- Keeps a small lab-only notice.
- Does not change `#/` or promote the candidate to production.

## Manual screenshot checklist

1. Open `http://localhost:5178/#/dashboard-lab?concept=production-candidate&qa=1` at 1440x900 in light mode.
2. Confirm the QA strip is visible and says this is lab-only.
3. Confirm the lab comparison header and concept tabs are hidden in QA mode.
4. Confirm the first fold shows a calm hero, clear operational posture, top issue, next action, four metrics, compact capability strip, and compact readiness row.
5. Confirm there are exactly four primary metrics.
6. Confirm capability statuses are honest and limited to the allowed status vocabulary.
7. Confirm the priority queue has no more than four items and each item has title, reason, severity, and a direct link.
8. Confirm there is only one visual summary section and it contains health distribution, release adoption, and backup freshness only.
9. Confirm there is no watchlist, recent activity feed, module directory, raw diagnostics, raw JSON, long explanation, or fake trend chart.
10. Toggle dark mode and confirm contrast, chart labels, status text, and action chips remain readable.
11. Test mobile around 390x844 and confirm no horizontal scroll, Hebrew/English labels wrap cleanly, and metrics/capabilities do not become an endless one-card stack.
12. Open `http://localhost:5178/#/` and confirm the production dashboard is unchanged.

## Verification

- `npm test`: failed. Vitest reported two failures in existing Site Details assertions outside the Dashboard Lab files changed for this sprint:
  - `tests/browserAdminUi.test.ts` expects `activeTab === "admins"` in `client/src/pages/SiteDetailsPage.tsx`.
  - `tests/siteDetailsActionPolicy.test.ts` expects Mongo copy containing `SharePoint משמש לאירוח קבצי האתר בלבד`, while the current copy includes hosting and config-file wording.
- `npm run build`: passed.
  - Existing Vite warnings remain: `hub-config.js` script is not bundled without `type="module"`, and the main chunk is larger than 500 kB.

## Remaining limitations

- Real screenshot/manual visual QA is still pending.
- The candidate remains lab-only and must not be promoted until the checklist above passes with real screenshots.
- Full `npm test` is not green because of the two Site Details assertions listed above.

## Next recommended step

Run the manual screenshot checklist at `http://localhost:5178/#/dashboard-lab?concept=production-candidate&qa=1`, capture desktop light, desktop dark, and mobile screenshots, then fix any visual QA findings before considering promotion.
