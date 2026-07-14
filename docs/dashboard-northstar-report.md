# Dashboard North Star Report

## Why the previous candidate failed visually

The v2 Production Candidate was still an iteration of the existing Hub language. It kept the admin-console rhythm: shell framing, status-strip gravity, bordered card grids, KPI tiles, and dense operational panels. It improved usefulness, but it did not create a new visual direction.

The North Star page is a visual reset, not another polish pass.

## Chosen visual direction

- Dark-first cinematic command center.
- Full-bleed standalone route outside `AppShell`.
- Frosted-glass surfaces over aurora/radial background fields.
- One large operations-pulse centerpiece instead of a card grid.
- Asymmetric bento layout with metrics, command queue, operations map, and one visual snapshot field.
- Strong typography scale and fewer labels.
- Accent palette mixes mint, cyan, coral, and amber so the page does not become a one-note blue/purple dashboard.

## Inspiration patterns borrowed

Sources reviewed:

- `https://dribbble.com/search/dashboard`
- `https://muz.li/blog/best-dashboard-design-examples-inspirations-for-2026/`

Borrowed patterns:

- Immersive first-screen hero.
- Dark glass UI and cinematic depth.
- Asymmetric bento composition.
- Large visual centerpiece.
- Compact high-signal metrics.
- Soft gradient background fields.
- Calm large typography.
- Designed snapshot data objects instead of fake trend charts.

## Files changed

- `client/src/App.tsx`
- `client/src/pages/DashboardNorthStarPage.tsx`
- `client/src/styles/index.css`
- `docs/dashboard-northstar-inspiration-audit.md`
- `docs/dashboard-northstar-report.md`

## Route added

- `#/dashboard-northstar`
- Local URL: `http://localhost:5178/#/dashboard-northstar`

This route renders outside the normal app shell after authentication. It still uses the operational data provider, but it does not render `TopBar`, `SystemStatusBar`, `Sidebar`, or the right rail.

## Deliberately not reused

- `AppShell` visual frame for this route.
- Existing `TopBar`, `Sidebar`, `SystemStatusBar`.
- `PageHeader`, `SectionCard`, `KpiCard`, `DataTable`.
- Dashboard Lab concept cards or dashboard-lab visual components.
- Existing bordered-card KPI grid rhythm.
- Watchlist, recent activity feed, module directory, raw diagnostics, raw JSON, and long evidence lists.

## Data sources used

The page reuses the existing Dashboard Lab data layer:

- `useDashboardLabData`
- sites and site stats
- jobs
- version status
- operation capabilities
- operational status
- derived risk queue
- domain readiness
- health distribution
- backup freshness
- release adoption

## Data honesty notes

- No fake historical trends were added.
- No uptime lines, AI predictions, or generated timelines were added.
- The operations pulse is built from current health distribution and current health score.
- Release adoption and backup freshness are snapshot visuals only.
- Priority queue items come from real derived risk items and are capped at four.

## Responsive notes

- Desktop target is a polished 1440x900 artboard with a strong first fold.
- Tablet collapses the hero and side modules into a single artboard flow.
- Mobile keeps the hero, operations pulse, top actions, metrics, and command queue usable without horizontal overflow.
- Mixed Hebrew/English labels are constrained with wrapping/truncation rules inside the scoped North Star classes.

## Dark / light mode notes

- The art direction is intentionally dark-first.
- It does not rely on the existing theme variables for its primary visual language.
- Existing app light/dark mode remains untouched for normal Hub routes.

## Verification

- `npm test`: passed.
  - 59 test files passed.
  - 251 tests passed.
- `npm run build`: passed.
  - Existing Vite warnings remain for `hub-config.js` script bundling and large chunk size.
- Route smoke:
  - `curl -I http://localhost:5178/#/dashboard-northstar`: `200 OK`
  - `curl -I http://localhost:5178/#/dashboard-lab`: `200 OK`
  - `curl -I http://localhost:5178/#/`: `200 OK`

## Remaining limitations

- Manual screenshot QA is still pending.
- The smoke check confirmed route entry, not visual rendering quality.
- The dev server start reported API port `4100` already in use, likely because another backend was already running. The Vite client still served on `5178`.
- No browser screenshot was captured in this run.

## Next step

Open `http://localhost:5178/#/dashboard-northstar` and perform manual screenshot review at desktop 1440x900 and mobile width. Check that it is visually detached from the current Site Builder Hub shell before any promotion discussion.
