# Dashboard Production Candidate Report

Date: 2026-07-06

Scope: Dashboard Lab only. The production dashboard at `#/` was not replaced, promoted, or changed.

## What Was Added

Added a fifth Dashboard Lab concept:

- Label: `מועמד לדשבורד ראשי`
- Internal key: `production-candidate`
- Component: `client/src/components/dashboard-lab/DashboardConceptProductionCandidate.tsx`

The Dashboard Lab now opens on the production candidate tab by default, while the four original concepts remain available for comparison.

## Why Concept A Remained The Base

Concept A stayed the base because it best answers the homepage question: what needs attention now, and what should the operator do next?

The new candidate keeps Concept A's:

- decision-first operational posture
- top issue and next action
- concise priority queue
- direct links to deep pages
- summary-level treatment of risk

## What Was Borrowed From B / C / D

Concept B: Executive Overview

- Calmer hero rhythm.
- Cleaner spacing.
- More management-readable posture copy.
- Reduced visual alarm unless the data is truly critical.

Concept C: Operations Cockpit

- Deploy / Recovery / Access / Health domain model.
- Kept as a compact readiness row, not four large cockpit cards.
- Each domain has status, one signal, and a deep-page link.

Concept D: Visual Analytics

- Honest compact chart language.
- Health distribution.
- Release adoption.
- Backup freshness buckets.
- No fake trend lines or decorative random charts.

## What Was Intentionally Removed

The production candidate intentionally excludes:

- full watchlist panel
- full recent activity list
- module directory grid
- eight-panel analytics grid
- raw diagnostics
- raw JSON
- long explanations
- deep-page inventories
- duplicate KPI cards

## Files Changed

- `client/src/components/dashboard-lab/DashboardConceptProductionCandidate.tsx`
- `client/src/components/dashboard-lab/DashboardLabShell.tsx`
- `client/src/pages/DashboardLabPage.tsx`
- `client/src/styles/index.css`
- `docs/dashboard-production-candidate-report.md`

## Data Sources Used

The candidate uses the existing Dashboard Lab shared data layer:

- `sitesApi.list()` for site registry and site stats.
- `sitesApi.jobs()` for job queue and active/failed work.
- `sitesApi.versionStatus()` for latest version, adoption, and outdated site count.
- `sitesApi.operationCapabilities()` for SharePoint write/read capability.
- `OperationalStatusProvider` for Hub API, Hub Mongo, Browser SharePoint, Builder backend, identity, and generated-at status.

No new API calls were introduced.

## Visual / Data Honesty Notes

- Charts are snapshot/category visuals only.
- Health uses a segmented distribution.
- Release readiness uses a progress-style score derived from current version status.
- Backup freshness uses current backup evidence buckets.
- There are no fake historical line charts.
- There are no invented trend claims.
- Capability states are shortened but still honest: Live, Cached, Metadata, Blocked, Not checked, or Unavailable depending on the available state.
- The candidate links to existing deep pages for evidence, logs, inventories, and execution.

## Remaining Screenshot QA Limitations

The previous visual review could not capture screenshots because browser automation was unavailable:

- In-app Browser: `Browser is not available: iab`
- Chrome extension: `Browser is not available: extension`
- Browser backend discovery: `[]`

This candidate should not be promoted to `#/` until real screenshot/manual QA verifies:

- desktop light mode
- desktop dark mode
- mobile light mode
- mobile dark mode
- above-the-fold strength
- full-page scroll height
- Hebrew/English label wrapping
- chart readability in dark mode
- mobile action button layout

## Manual Screenshot Checklist

Save screenshots under:

`tmp/dashboard-lab-review/`

Required production-candidate screenshots:

| Screenshot | Purpose |
| --- | --- |
| `production-candidate-desktop-light-above-fold.png` | First-fold clarity in light mode |
| `production-candidate-desktop-light-full-page.png` | Scroll budget in light mode |
| `production-candidate-desktop-dark-above-fold.png` | First-fold clarity in dark mode |
| `production-candidate-desktop-dark-full-page.png` | Scroll budget and contrast in dark mode |
| `production-candidate-mobile-light-above-fold.png` | Mobile first-fold usability |
| `production-candidate-mobile-light-full-page.png` | Mobile scroll and wrapping |
| `production-candidate-mobile-dark-above-fold.png` | Mobile dark first-fold contrast |
| `production-candidate-mobile-dark-full-page.png` | Mobile dark full-page readability |

Recommended viewport sizes:

- Desktop: `1440x900`
- Mobile: `390x844`

Manual QA questions:

- Does the hero make the current posture obvious within five seconds?
- Is the top issue clear without feeling over-alarmed?
- Are the four primary metrics enough?
- Are capability states honest and short?
- Does the priority queue stay useful at four items?
- Does the domain row feel compact rather than card-heavy?
- Does the visual summary help, or should one chart be removed?
- Does the full page fit within roughly two desktop viewport heights?
- Does mobile avoid becoming an endless stack?

## Next Recommendation

Keep the candidate inside `#/dashboard-lab` until screenshot QA passes. After manual screenshots are reviewed, make one focused refinement pass before opening a separate task to replace the production dashboard.
