# Dashboard Redesign Lab Audit

Date: 2026-07-06

Scope: current Site Builder Hub homepage / `DashboardPage` / Control Center experience only.

## Current Layout

The current dashboard is a long command-center page built from a header, a severity hero, a five-card KPI strip, a two-column primary grid, module preview cards, a recent activity section, and reliability-boundary notes. It already tries to answer the right operational questions, but the page still behaves like a dense index of many subpages rather than a focused homepage.

The structure is useful but too broad:

- Hero: global severity, system status, and primary actions.
- KPI strip: sites, attention items, outdated versions, backup risk, failed jobs.
- Decision queue: operational risk list.
- Fleet snapshot: storage, health, version adoption, watchlist.
- Module previews: releases, backups, admins, jobs, monitoring, audit, diagnostics, analytics.
- Recent activity and reliability boundaries.

This creates a dashboard that is informative but scroll-heavy. On desktop it exceeds the desired two-screen budget once the module grid and activity sections are included. On mobile it becomes a long stack of panels.

## Data Shown Today

The current dashboard uses real Hub data:

- Sites registry from `sitesApi.list()`.
- Site stats from `meta.stats`.
- Jobs from `sitesApi.jobs()`.
- Version status from `sitesApi.versionStatus()`.
- Operation capabilities from `sitesApi.operationCapabilities()`.
- Runtime operational status from `OperationalStatusProvider`.

It derives:

- active / failed / warning sites
- storage backend distribution
- Mongo seed risk
- backup failures and missing backup evidence
- admin source drift
- outdated sites and version adoption
- active and failed jobs
- recent activity from site timestamps and jobs
- write path readiness

## Useful Homepage Data

The homepage should keep only signals that change what an operator or manager does next:

- Global operational posture: clear / attention / blocked / critical.
- Top 3-5 current risks with direct actions.
- Fleet size and active site count.
- Health distribution.
- Release readiness or outdated count.
- Backup reliability and freshness risk.
- Admin/access drift count.
- Job queue status and failed jobs.
- Capability readiness: Hub API, Hub Mongo, Browser SharePoint, Builder backend, write path.

## Data To Remove From Homepage

These details should move to deep pages:

- Full module preview grid for every system area.
- Long recent activity lists.
- Evidence details, HTTP statuses, file paths, and raw connector internals.
- Full outdated-site lists beyond the first few priorities.
- Full admin-source explanations.
- Full backup inventory and verification evidence.
- Detailed diagnostics messages unless they are a blocker.
- Every storage/backend nuance for each individual site.

## Executive / Operational Summary To Keep

The dashboard should preserve:

- One dominant status story.
- A concise priority queue.
- A small capability strip.
- A few honest distributions: health, storage backend, jobs, backup freshness, environment.
- Clear action links into Sites, Releases, Backups, Admins, Jobs, Health, Diagnostics, Monitoring, Audit, Settings.

## Scroll Height Problem

The current page likely feels long because every section is granted nearly equal visual importance. The module previews alone add eight more destination cards after the dashboard has already presented hero, KPIs, triage, fleet, charts, and watchlist. On mobile, the two-column areas collapse into sequential sections and the page becomes a multi-screen task directory.

Target: each experimental concept should fit in roughly two desktop viewport heights at 1440x900. Deep inspection remains in the existing pages.

## Visual Hierarchy Problems

- Too many cards carry similar weight.
- The hero is strong, but the following surfaces compete with it.
- Module previews dilute attention after the priority queue.
- Badges and status tokens repeat concepts rather than clarifying one next action.
- Some sections read like explanations of the app instead of an operations dashboard.
- Important blockers and softer metadata summaries sit too close together visually.

## Graph / Visualization Gaps

The current dashboard has useful lightweight visualizations: segmented health bar and version adoption progress. The lab should add more visual rhythm without inventing data:

- Health distribution: donut or segmented bar.
- Storage backend distribution: compact bars.
- Sites by environment: compact bars.
- Jobs by status: distribution bars.
- Backup freshness: freshness bands.
- Open risk categories: horizontal bars.
- Release adoption: progress bar.
- Recent activity: timeline only from actual timestamps.

## Graphs To Avoid

Do not show:

- Historical trend lines from current snapshot data.
- Random sparkline movement without stored history.
- Pie charts for tiny or ambiguous categories.
- Any “uptime trend”, “deployment trend”, or “backup success trend” unless historical data exists.
- Predictive or AI-style claims not backed by the Hub.

## RTL / Hebrew Issues

The app is RTL globally, which is good. Risk areas:

- Mixed Hebrew/English labels can make dense cards visually uneven.
- Numeric columns need tabular numerals.
- Action buttons should keep icon alignment in RTL.
- Long site names and technical labels must truncate or wrap cleanly.
- Charts should read right-to-left where the surrounding copy does, but bar quantities can still grow by width because the value is not temporal direction.

## Desktop / Mobile Behavior

Desktop should use a clear hierarchy with limited rows:

- One top story.
- One priority/work area.
- One supporting visualization or summary area.

Mobile should collapse to:

- Top status.
- Primary action.
- Priority list.
- One compact summary group.

Concept switching should not stack four dashboards vertically because that would violate the scroll budget.

## Dark Mode Implications

Dark mode already uses CSS variables. The lab should:

- Use variables instead of hard-coded light surfaces.
- Avoid overly saturated warning/danger blocks.
- Prefer subtle shadow rings over heavy borders.
- Keep chart colors readable against dark surfaces.
- Avoid relying only on color; labels and counts must remain visible.

## Audit Conclusion

The current dashboard is operationally useful but tries to be summary, triage, module directory, activity log, and documentation boundary all at once. The lab should explore dashboards that choose one primary job per concept: urgent command, executive summary, operator cockpit, and graph-forward analytics. The strongest production candidate will likely combine Command Center priority with Executive Overview restraint.
