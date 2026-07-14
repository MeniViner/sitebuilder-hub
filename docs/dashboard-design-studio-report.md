# Dashboard Design Studio Report

Date: 2026-07-06

## What Was Built

Added a new detached, lab-only route:

`#/dashboard-design-studio`

The route renders outside AppShell and provides four switchable dashboard artboards:

- `morning-brief`: Human Executive Dashboard.
- `operations-board`: Action-first operator board.
- `fleet-map`: Site topology dashboard using real sites as nodes.
- `clean-bento`: Clean SaaS bento analytics dashboard.

The production dashboard at `#/` was not changed or promoted.

## Why North Star Was Rejected

North Star proved the route could be detached from AppShell, but it failed as a product direction:

- Too sci-fi and generated.
- Giant decorative pulse was not product-specific.
- Dark/glass treatment created drama without daily usefulness.
- Hebrew copy felt attached to a visual gimmick.
- It did not feel like a real dashboard a manager/operator would open in the morning.

The new studio intentionally does not continue that visual line.

## Research Summary

Research started from:

- <https://dribbble.com/search/dashboard>
- <https://dribbble.com/tags/modern-dashboard>
- <https://dribbble.com/tags/dashboard>
- <https://muz.li/blog/best-dashboard-design-examples-inspirations-for-2026/>

Additional product dashboard patterns were considered from SaaS operations, cloud dashboards, command centers, Linear/Vercel/Stripe/GitHub/Atlassian-style products, CRM, finance, and DevOps dashboards.

The core conclusion: Site Builder Hub should not look like a spaceship dashboard or generic Dribbble concept. It needs a calm, premium, operational product surface that answers the first decision quickly and links to real deep pages.

## Four Artboard Strategies

### 1. Morning Brief

- Mood: calm, human, executive.
- Visual metaphor: a morning operational memo.
- Layout: large editorial posture panel, one first action, four metrics, compact priority queue, domain strip, one visual summary.
- Fits because: it answers what matters today without making the system feel alarming.
- Avoids: sci-fi, decorative rings, long diagnostics, endless metrics.

### 2. Operations Board

- Mood: practical, serious, operator-focused.
- Visual metaphor: lanes and blockers.
- Layout: top work posture, four primary metrics, compact capabilities, action queue, Deploy / Recovery / Access / Health lanes.
- Fits because: it maps directly to the operator questions: what is blocked, what is safe, and where do I click?
- Avoids: old cards, module directory, huge charts.

### 3. Fleet Map

- Mood: product-specific and inspectable.
- Visual metaphor: current sites grouped by environment.
- Layout: real site nodes, environment clusters, top-risk selected site, health distribution, domain strip.
- Fits because: it finally makes the dashboard feel specific to managing many Site Builder sites.
- Avoids: fake network topology, fake map/geography, invented relationships.

### 4. Clean Bento Analytics

- Mood: polished, modern, quiet.
- Visual metaphor: restrained SaaS analytics bento.
- Layout: compact metric chips, one large chart area, risk category panel, short priority panel, domain panel.
- Fits because: it shows fleet composition and risk distribution with honest snapshot visuals.
- Avoids: fake trends, generic analytics filler, eight-panel grids.

## Data Sources Used

The studio uses the existing Dashboard Lab data layer:

- `sitesApi.list()`
- `sitesApi.jobs()`
- `sitesApi.versionStatus()`
- `sitesApi.operationCapabilities()`
- `useOperationalStatus()` via `useDashboardLabData()`

Derived data reused:

- risk queue
- active site counts
- release adoption
- backup reliability
- capability strip
- Deploy / Recovery / Access / Health domains
- health distribution
- backup freshness
- risk categories

## Mock Mode

No mock mode was added.

The default and only mode uses real current Hub data. This keeps the artboards honest and avoids mixing sample operational claims with live data.

## Screenshot URLs

Default studio:

- `http://localhost:5177/#/dashboard-design-studio`

Screenshot-friendly QA URLs:

- `http://localhost:5177/#/dashboard-design-studio?view=morning-brief&qa=1`
- `http://localhost:5177/#/dashboard-design-studio?view=operations-board&qa=1`
- `http://localhost:5177/#/dashboard-design-studio?view=fleet-map&qa=1`
- `http://localhost:5177/#/dashboard-design-studio?view=clean-bento&qa=1`

If the dev server runs on another Vite port, keep the same hash paths and replace only the origin.

## Files Changed

- `client/src/App.tsx`
- `client/src/pages/DashboardDesignStudioPage.tsx`
- `client/src/components/dashboard-design-studio/DashboardDesignStudioShell.tsx`
- `client/src/components/dashboard-design-studio/MorningBriefArtboard.tsx`
- `client/src/components/dashboard-design-studio/OperationsBoardArtboard.tsx`
- `client/src/components/dashboard-design-studio/FleetMapArtboard.tsx`
- `client/src/components/dashboard-design-studio/CleanBentoAnalyticsArtboard.tsx`
- `client/src/components/dashboard-design-studio/designStudioUtils.ts`
- `client/src/styles/index.css`
- `docs/dashboard-direction-reset-audit.md`
- `docs/dashboard-design-research-strategy.md`
- `docs/dashboard-design-studio-report.md`

## What Was Intentionally Not Reused

- Existing dashboard-lab visual components.
- North Star layout and giant pulse.
- AppShell, old top bar, and right rail.
- Old KPI card grid.
- Module directory grids.
- Raw diagnostics and raw JSON.
- Fake line charts or decorative trend charts.

## Mobile And RTL Notes

- The route is explicitly RTL.
- Artboards collapse to one-column layouts on small screens.
- Long labels use wrapping, truncation, and `overflow-wrap` where needed.
- Fleet nodes use both shape/letter and color so color is not the only status cue.
- Dark mode is covered through scoped `[data-theme="dark"]` rules and existing theme variables.
- QA mode hides comparison chrome and keeps a small fixed lab-only label.

## Visual And Data Honesty Notes

- Charts are snapshot visuals only.
- No fake historical trends were added.
- Fleet Map does not draw edges between sites.
- Capability states are compact and use existing live/cached/metadata/blocked/not checked semantics.
- Deep technical evidence remains in existing deep pages.

## Verification

`npm test`

- Passed: 60 test files, 256 tests.

`npm run build`

- Passed.
- Existing Vite warnings remain:
  - `hub-config.js` cannot be bundled without `type="module"`.
  - One client chunk is larger than 500 kB.

Route smoke via curl on temporary dev server at `http://localhost:5177`:

- `#/dashboard-design-studio`: 200
- `#/dashboard-design-studio?view=morning-brief&qa=1`: 200
- `#/dashboard-design-studio?view=operations-board&qa=1`: 200
- `#/dashboard-design-studio?view=fleet-map&qa=1`: 200
- `#/dashboard-design-studio?view=clean-bento&qa=1`: 200
- `#/dashboard-northstar`: 200
- `#/dashboard-lab`: 200
- `#/`: 200

## Manual Screenshot Checklist

Capture each QA URL at:

- Desktop: 1440 x 900.
- Narrow desktop/tablet: 1024 x 768.
- Mobile: 390 x 844.
- Light mode.
- Dark mode.

For each artboard check:

- First fold answers posture, top issue, and next action within five seconds.
- No old AppShell, old top bar, or right rail appears.
- No North Star pulse/ring appears.
- Hebrew copy feels natural and not gimmicky.
- Text does not overlap, clip, or overflow.
- Four-artboard switcher is hidden in `qa=1`.
- Lab-only QA notice remains visible but unobtrusive.
- Deep links are present and point to the relevant product pages.
- Charts remain readable in dark mode.
- Color is not the only status indicator.
- Mobile does not become an endless stack of repeated panels.

## Remaining Limitations

- No automated screenshot comparison was performed in this sprint.
- Curl route smoke confirms route availability, not visual correctness.
- The four artboards are discovery surfaces, not production candidates.
- Real product selection still requires manual screenshot review and design critique.

## Recommendation

Use Morning Brief as the most promising baseline because it best matches the requested human, calm, daily-use dashboard. Borrow Fleet Map’s product-specific site object and Operations Board’s domain lanes into later iterations if screenshot QA confirms they remain readable.

Do not promote anything until manual visual QA is complete.
