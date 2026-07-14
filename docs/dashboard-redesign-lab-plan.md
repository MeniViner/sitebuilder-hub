# Dashboard Redesign Lab Plan

Date: 2026-07-06

## Target Information Architecture

The experimental dashboard lab will live at `#/dashboard-lab` and will not replace the existing `#/` dashboard.

The lab page will use tabs to compare four concepts without stacking them into one oversized page:

- Concept A: Command Center
- Concept B: Executive Overview
- Concept C: Operations Cockpit
- Concept D: Visual Analytics Dashboard

Each concept uses the same shared Hub snapshot and presents a different hierarchy.

## Homepage Content Limit

Each concept is limited to roughly:

- one hero / status story
- 3-4 primary metrics
- one priority or summary area
- one supporting chart/visual area
- direct links to deep pages

Long logs, evidence, raw payloads, detailed inventories, and complete operational workspaces stay in the existing pages.

## Data Sources

Shared API calls:

- `sitesApi.list()` for site registry and stats.
- `sitesApi.jobs()` for job queue status, active work, failures, and recent activity.
- `sitesApi.versionStatus()` for release adoption and outdated sites.
- `sitesApi.operationCapabilities()` for SharePoint write/read capability and storage backend policy.
- `OperationalStatusProvider` for Hub API, Hub Mongo, Browser SharePoint, Builder backend, identity, and operation mode.

Optional / not required for the first lab route:

- `sitesApi.monitoringSummary()` can be added later if the Monitoring page needs to feed dashboard alerts directly.

## Dashboard vs Deep Pages

Dashboard:

- Global posture.
- Top risks.
- Summary counts and distributions.
- Readiness for deploy, recovery, access, health.
- Links to next actions.

Deep pages:

- Sites: full registry, per-site metadata, filters.
- Releases: artifact details, deployment plans, batch execution.
- Backups: inventory, verification, restore review.
- Admins: user/source matrix and access changes.
- Jobs: logs, approvals, reruns.
- Monitoring: full alert workflow.
- Audit: full event history.
- Health: evidence and checks.
- Diagnostics: connector details.
- Settings: runtime configuration.

## Chart Types

Use CSS-based charts; no new dependency is needed.

- Health distribution: donut or segmented bar because it is categorical snapshot data.
- Storage backend distribution: horizontal bars because it compares categories.
- Environment distribution: horizontal bars because it compares fleet composition.
- Release adoption: progress bar because it is completion against total eligible sites.
- Job status distribution: compact bars because it summarizes current queue state.
- Backup freshness: banded cards/bars because freshness is bucketed current evidence.
- Risk categories: horizontal bars because it ranks current open risk types.
- Recent activity: timeline from actual timestamps only.

Avoid historical trend lines unless the backend later exposes historical series.

## Dependencies

Existing client dependencies:

- React
- React Router
- Tailwind
- lucide-react

No chart package is required for this lab because the needed visuals are simple, honest snapshot charts. Adding Recharts would be reasonable later if the Hub gains historical time-series data or needs richer tooltips/axes, but it is unnecessary for the current acceptance criteria.

## Files To Create

- `client/src/pages/DashboardLabPage.tsx`
- `client/src/components/dashboard-lab/DashboardLabShell.tsx`
- `client/src/components/dashboard-lab/DashboardConceptCommandCenter.tsx`
- `client/src/components/dashboard-lab/DashboardConceptExecutive.tsx`
- `client/src/components/dashboard-lab/DashboardConceptOperationsCockpit.tsx`
- `client/src/components/dashboard-lab/DashboardConceptVisualAnalytics.tsx`
- `client/src/components/dashboard-lab/dashboardLabData.ts`
- `client/src/components/dashboard-lab/dashboardLabTypes.ts`
- `client/src/components/dashboard-lab/dashboardLabUtils.ts`

## Files To Change

- `client/src/App.tsx` to add the route.
- `client/src/components/Sidebar.tsx` to add an experimental navigation entry.
- `client/src/styles/index.css` to add Dashboard Lab styles.

## Route

`#/dashboard-lab`

Navigation label: `מעבדת דשבורד`

## Testing / Build / Smoke Checklist

- `npm run build`
- `npm test`
- Run the client locally with Vite.
- Open `#/dashboard-lab`.
- Smoke desktop viewport.
- Smoke mobile viewport.
- Smoke light and dark mode.
- Confirm existing dashboard at `#/` still renders.
- Confirm empty, loading, and error components exist in each concept path.

## Risks

- Existing uncommitted changes may already affect build/test outcomes.
- Some runtime APIs may be unavailable in local smoke if the server is not running or auth blocks access.
- Current snapshot data does not support historical trend lines, so visual analytics must stay categorical.
- Four concepts in one route can become too heavy if all are rendered at once; use tabs and render one concept at a time.
- Mixed Hebrew and English operational terms need careful wrapping and truncation.
- CSS-only charts must remain accessible through visible labels and counts, not color alone.
