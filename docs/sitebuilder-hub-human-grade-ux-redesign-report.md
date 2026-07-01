# SiteBuilder HUB Human-Grade UX Redesign Report

## Audit Summary

SiteBuilder HUB has the right operational capabilities, but the interface often exposes them as a technical console. The main usability problem is not missing functionality; it is that safe next steps, risk, and source-of-truth boundaries compete with raw evidence, backend names, badges, tables, and many equal-weight buttons.

The redesign goal is to keep every capability intact while reframing the product as a calm admin command center. Every page should first explain its purpose, current state, recommended action, and blockers. Technical evidence should remain available, but under Advanced details or drawers.

## What Feels Confusing Today

- Critical pages mix human tasks with implementation labels such as Mongo, TXT, digest, evidence, artifact, backend SharePoint, Browser SharePoint, and REST without first explaining what the user can safely do.
- Many sections use the same visual weight for primary actions, secondary actions, diagnostics, refresh buttons, and dangerous actions.
- Pages often start with KPI grids or controls before stating the current operational conclusion.
- Some flows show raw IDs, paths, hashes, HTTP status, payloads, and evidence tables too early.
- “Browser SharePoint” and “backend SharePoint” are both visible, but the user has to infer which one is live, read-only, write-enabled, or blocked.
- Empty states explain that nothing exists, but not always whether that is good, neutral, or blocked.
- Hebrew labels are partially natural, but some English operational terms are still standing alone or used as primary labels.

## Most Overloaded Pages

- **Releases / Deployments:** Important guided flow exists, but release registry, deploy planning, rollback, artifact validation, and execution evidence are still dense.
- **Backups / Recovery:** Backup, inventory, schedule, restore readiness, restore evidence, and browser/backend boundaries sit too close together.
- **Admins / Governance:** Rich source matrix and live-read behavior exist, but users need a simpler “who has access, where from, what is drift, what is safe to fix” summary.
- **Create / Add Site:** Functional fields are thorough, but need stronger step framing, metadata-only wording, safer final review, and clearer Basic vs Advanced grouping.
- **Site Details:** It behaves like a workspace, but the top needs a stronger operational summary and the tabs should feel more goal-based.
- **Jobs / Health / Diagnostics / Audit:** These pages still read as operational logs unless the human diagnosis and next action are promoted.

## Components Creating Visual Noise

- Badge-heavy rows and cards where every status looks equally important.
- KPI cards used for secondary implementation details instead of only page-level state.
- Tables with raw paths, hashes, HTTP labels, and error strings visible by default.
- Help icons next to many small labels, adding density in places that should be scannable.
- Nested panels and soft panels that make pages feel stacked rather than guided.

## Unsafe Or Unclear Flows

- Deploy and rollback need an always-visible guided checklist: release readiness, target scope, dry-run, blockers, confirmation, post-run evidence.
- Restore is correctly protected, but its blocked state should be stated plainly before evidence tables.
- Admin add/remove needs a clear before/after and source-of-truth explanation before protected confirmation.
- Backup retry/run-all should explain scope, connector, reversibility, and blocked conditions.
- Job retry/rerun should explain impact by job type before exposing payload.

## Hebrew And Copy Issues

- Replace standalone English labels where possible: “Deploy” -> “פריסה”, “Restore” -> “שחזור”, “Inventory” -> “מלאי גיבויים”, “History” -> “היסטוריה”.
- Use first-use clarification for unavoidable technical terms, for example “פריסה דרך הדפדפן (Browser SharePoint)”.
- Prefer direct Hebrew instructions: “מה אפשר לעשות עכשיו”, “למה זה חסום”, “מה לא ישתנה”.
- Avoid scary but vague text. Use consequence-based copy.

## Full Redesign Vs Polish

- **Full redesign needed:** Releases, Backups, Admins, Jobs, Diagnostics, Create/Add Site modal.
- **Strong structural polish:** Dashboard, Sites registry, Site Details, Health, Audit, Monitoring, Settings, Help.
- **Shared component polish:** AppShell, PageHeader, Panel, KpiCard, EmptyState, DataTable, DetailsDrawer, ProtectedActionDialog, status tokens, global CSS.

## Implementation Plan

1. Add shared UX components for page briefs, guided steps, recommendation cards, mode/source boundaries, advanced evidence, and action grouping.
2. Calm the global visual system: less card nesting, better hierarchy, clearer buttons, stronger text wrapping, tabular numbers, safer mobile rows, and explicit advanced surfaces.
3. Add a top “human summary” to every major page: purpose, current state, attention needed, safe next action, blockers.
4. Reframe critical flows as guided operations: deployment, rollback, restore, create site, permission changes, backup, job retry/rerun.
5. Push raw evidence and implementation details lower on the page or into Advanced sections/drawers.
6. Improve Hebrew labels and source terminology across navigation, tabs, section titles, empty states, and action copy.
7. Verify with tests/build and a visual human review on desktop, mobile, and dark mode.

## Acceptance Checklist

- [ ] Main screen explains health, risk, blockers, and safe next action within five seconds.
- [ ] Every major route states what it is for and what needs attention.
- [ ] Every dangerous action has scope, consequence, blocker, reversibility, and confirmation.
- [ ] Browser SharePoint, backend SharePoint, Mongo backend, metadata-only, read-only, and write-enabled are visibly distinct.
- [ ] Raw JSON, hashes, paths, HTTP details, and payloads are not the first thing a non-technical user sees.
- [ ] Add existing site and create site explain metadata-only vs live provisioning.
- [ ] Deploy defaults to a safe deployable release and warns for downgrade/rollback.
- [ ] Restore is plainly blocked unless all safety gates are met.
- [ ] Admin drift never looks like fake zero when a source read failed.
- [ ] Empty states say whether empty is good, neutral, or blocked.
- [ ] Hebrew reads naturally in labels, section titles, helper text, and button text.
- [ ] Mobile layout remains understandable without dense tables.
- [ ] Dark mode remains calm and legible.
- [ ] Existing routes, API calls, safety gates, browser connector behavior, and HashRouter compatibility remain intact.
