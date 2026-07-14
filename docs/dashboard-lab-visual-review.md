# Dashboard Lab Visual Review

Date: 2026-07-06

Scope: `#/dashboard-lab` only. Production dashboard at `#/` was not changed or promoted.

## Evidence Status

Screenshot capture was attempted through the supported browser paths and is blocked in this session.

Exact technical blocker:

- In-app Browser target failed with: `Browser is not available: iab`.
- Chrome extension target failed with: `Browser is not available: extension`.
- Browser backend discovery returned an empty list: `[]`.

Because of that, this review is a code-level and layout-level product QA review. It does not claim completed visual QA from screenshots. Real rendering, exact scroll height, text overlap, clipped content, dark-mode contrast, mobile usability, and first-fold strength still require manual screenshots or a working browser capture surface.

Screenshot destination folder created:

- `tmp/dashboard-lab-review/`

## Screenshot Inventory

No screenshot files were created because both supported browser capture targets were unavailable.

Manual capture checklist:

| Screenshot | Status |
| --- | --- |
| `concept-a-command-center-desktop-light.png` | Manual capture required |
| `concept-a-command-center-desktop-dark.png` | Manual capture required |
| `concept-a-command-center-mobile-light.png` | Manual capture required |
| `concept-a-command-center-mobile-dark.png` | Manual capture required |
| `concept-b-executive-desktop-light.png` | Manual capture required |
| `concept-b-executive-desktop-dark.png` | Manual capture required |
| `concept-b-executive-mobile-light.png` | Manual capture required |
| `concept-b-executive-mobile-dark.png` | Manual capture required |
| `concept-c-operations-cockpit-desktop-light.png` | Manual capture required |
| `concept-c-operations-cockpit-desktop-dark.png` | Manual capture required |
| `concept-c-operations-cockpit-mobile-light.png` | Manual capture required |
| `concept-c-operations-cockpit-mobile-dark.png` | Manual capture required |
| `concept-d-visual-analytics-desktop-light.png` | Manual capture required |
| `concept-d-visual-analytics-desktop-dark.png` | Manual capture required |
| `concept-d-visual-analytics-mobile-light.png` | Manual capture required |
| `concept-d-visual-analytics-mobile-dark.png` | Manual capture required |

For each manual screenshot, capture both above-the-fold and full-page variants where possible. Suggested suffixes:

- `-above-fold.png`
- `-full-page.png`

## Audit / Plan Compliance Check

| Requirement | Code-level status | Notes |
| --- | --- | --- |
| Separate experimental route | Pass | `#/dashboard-lab` is added separately from `#/`. |
| Production dashboard unchanged | Pass | The lab is additive and not promoted to `#/`. |
| Four distinct concepts | Pass | Command Center, Executive, Operations Cockpit, Visual Analytics are separate components. |
| Tabs/concept switching | Pass | `DashboardLabPage` renders one active concept at a time. |
| Real Hub snapshot data | Pass | Shared data comes from sites, jobs, version status, capabilities, and operational status. |
| No fake historical trend lines | Pass | Charts are distributions, progress bars, freshness buckets, and timelines from timestamps. |
| No misleading chart types | Pass with visual caveat | Chart choices match snapshot data. Final judgment needs screenshots. |
| No new dependencies | Pass | No package dependency was added. |
| Homepage-level summaries only | Mostly pass | Concept D risks becoming an analytics page, but still uses summary-level data. |
| Deep details remain in deep pages | Pass | Details link to Sites, Releases, Backups, Admins, Jobs, Health, Diagnostics, Analytics. |
| Roughly two desktop screen-heights | Needs screenshot verification | Concept A and B likely closest; Concept C and D are at higher risk. |
| Hebrew RTL | Code-level pass | Global RTL remains; lab uses right-aligned layout and existing typography variables. |
| Dark mode support | Code-level pass | Styles use theme variables; actual contrast still needs screenshot verification. |
| Loading, empty, error states | Pass | `DashboardLabState` handles loading, error, empty, and retry. |

## Per-Concept Review

### Concept A: Command Center

Product clarity:

- Strongest answer to “what needs attention now?”
- Good priority structure: hero, top priority, four metrics, capability strip, priority queue.
- Uses direct links to deep pages instead of expanding evidence inline.

Visual quality:

- Code structure suggests a strong first screen and a serious operations feel.
- It still has several surfaces after the hero: metrics, capability strip, queue, summary, watchlist. The concept may need trimming before production.
- Likely feels meaningfully different from the current dashboard because it has a stronger decision-first hierarchy.

Data quality:

- Uses real risk queue and snapshot distributions.
- Does not invent trends.
- Capability labels are honest: live, cached, metadata, blocked.

Layout quality:

- Best likely fit for a two-screen homepage if the watchlist is optional or collapsed.
- Mobile should be usable because grids collapse, but manual screenshots must check whether the top priority and capability cards become too tall.

Keep:

- Hero status story.
- Top priority action.
- Priority queue.
- Capability strip, but probably reduce it to the most action-relevant statuses.

Remove or reduce:

- Watchlist as a full panel on the homepage.
- Repeated secondary action buttons if the top priority already points to the right page.

### Concept B: Executive Overview

Product clarity:

- Best management summary.
- Makes the dashboard calmer and less operationally noisy.
- It may under-serve an operator who wants immediate triage unless paired with a visible priority queue.

Visual quality:

- Likely the strongest visual direction: quieter hero, large fleet number, fewer competing modules.
- Good candidate for the final dashboard’s tone, spacing, and hierarchy.

Data quality:

- Uses health distribution, storage distribution, readiness scores, and real recent activity.
- Timeline is based on timestamps and does not pretend to be a historical trend.

Layout quality:

- Likely compact enough for the desktop scroll budget.
- Mobile should be cleaner than the other concepts because the structure is simpler.

Keep:

- Calm hero language.
- Executive metrics.
- Fleet story and readiness pairing.

Remove or reduce:

- Recent activity as a homepage default. It is valid data, but it can pull the page toward an audit feed.

### Concept C: Operations Cockpit

Product clarity:

- Best operator workspace.
- The Deploy / Recovery / Access / Health grouping is useful and maps well to actual Hub work.
- It is less suitable as a default homepage because it has many small decision surfaces.

Visual quality:

- More technical and dense by design.
- The four domain cards plus capability strip may feel like a cockpit, but also risks card clutter.

Data quality:

- Strong data honesty: domains are derived from actual risk categories, metrics, and capabilities.
- Live/cached/metadata states are explicit.

Layout quality:

- Highest risk for desktop scroll and mobile length.
- Four equal domain cards may reduce hierarchy because every domain appears equally important.

Keep:

- Domain model: Deploy, Recovery, Access, Health.
- Capability labels inside the relevant work area.

Remove or reduce:

- Domain cards as full homepage cards.
- Repeated mini metrics in each domain if a metric already appears in the top summary.

### Concept D: Visual Analytics Dashboard

Product clarity:

- Best chart exploration, but weakest production homepage candidate.
- It answers “what does the fleet look like?” more than “what needs attention now?”
- It overlaps with the existing Analytics page conceptually.

Visual quality:

- Likely the most premium graph-forward direction if screenshots confirm spacing and rhythm.
- It risks becoming an attractive analytics board rather than an operations homepage.

Data quality:

- Very good data honesty. It explicitly says snapshot categories only and avoids fake trends.
- Charts match available data: health, storage, environment, release adoption, backup freshness, risk categories, jobs.

Layout quality:

- Most likely to exceed the two-screen budget because it has eight panels.
- Mobile could become a long chart stack.

Keep:

- Donut/segmented chart language.
- Backup freshness buckets.
- Risk category bars.

Remove or reduce:

- Full eight-panel analytics grid from the homepage.
- Any chart that duplicates a deep analytics view without changing the next action.

## Scoring Table

Scores are from 1 to 5 and are based on code-level/layout-level review, not screenshot evidence.

| Concept | Product clarity | Visual quality | Operational usefulness | Executive clarity | Data honesty | Layout / scroll discipline | RTL / Hebrew quality | Dark mode quality | Mobile quality | Overall production readiness |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A: Command Center | 5 | 4 | 5 | 3 | 5 | 4 | 4 | 4 | 4 | 4 |
| B: Executive Overview | 4 | 5 | 3 | 5 | 5 | 4 | 4 | 4 | 4 | 4 |
| C: Operations Cockpit | 4 | 3 | 5 | 2 | 5 | 3 | 4 | 4 | 3 | 3 |
| D: Visual Analytics | 3 | 4 | 3 | 3 | 5 | 3 | 4 | 4 | 3 | 3 |

## Rankings

Best production dashboard candidate:

1. Concept A: Command Center
2. Concept B: Executive Overview
3. Concept C: Operations Cockpit
4. Concept D: Visual Analytics

Best visual direction:

1. Concept B: Executive Overview
2. Concept D: Visual Analytics
3. Concept A: Command Center
4. Concept C: Operations Cockpit

Best operational usefulness:

1. Concept C: Operations Cockpit
2. Concept A: Command Center
3. Concept D: Visual Analytics
4. Concept B: Executive Overview

Best executive clarity:

1. Concept B: Executive Overview
2. Concept A: Command Center
3. Concept D: Visual Analytics
4. Concept C: Operations Cockpit

Weakest concept:

- Concept D is the weakest production-homepage candidate because it can easily become an analytics page instead of a decision page. It is still valuable as a visual language source.

## Recommended Production Candidate

Use Concept A as the base.

Reason:

- It has the clearest homepage job: show the current operational posture, top priority, and next action.
- It preserves the audit/plan rule that deeper details belong in existing pages.
- It can absorb the best parts of the other concepts without losing purpose.

Concept B is not stronger as the base, but it should heavily influence the final visual tone. Concept C should influence the domain model. Concept D should influence compact chart styling.

## What To Keep From Each Concept

Concept A:

- Decision-first hero.
- Top priority module.
- Priority queue.
- 3-4 primary metrics.
- Direct action links.

Concept B:

- Calm executive language.
- Larger status story.
- Cleaner metric rhythm.
- Fleet/readiness pairing.

Concept C:

- Deploy / Recovery / Access / Health domain framing.
- Capability honesty inside action areas.
- Clear operational grouping for advanced users.

Concept D:

- Health donut/segmented language.
- Backup freshness bars.
- Risk category bars.
- Explicit “snapshot only” language.

## What To Remove From Each Concept

Concept A:

- Remove or collapse the watchlist from the first production version.
- Reduce capability strip from five or six items to the four most decision-relevant items.

Concept B:

- Remove recent activity from the homepage or limit it to a tiny “latest signal” row.
- Add a more visible urgent priority path.

Concept C:

- Do not ship four full domain cards on the homepage.
- Avoid repeated mini metrics and capability chips inside every domain.

Concept D:

- Do not ship the eight-panel analytics grid as the homepage.
- Move most chart exploration to `#/analytics`.

## Merge Plan For Final Production Candidate

Base:

- Concept A.

Merge in:

- Concept B hero restraint and calm wording.
- Concept B executive metrics for top-level readability.
- Concept C domain strip as a compact readiness row, not four full cards.
- Concept D health distribution and backup freshness chart, limited to one visual summary panel.

Final production homepage target:

- Header and primary action.
- One calm but decisive hero.
- Three or four primary metrics.
- Compact capability strip.
- Priority queue, max 4 items.
- One visual summary panel with health, release adoption, and backup freshness.
- Deep-page links only where they answer a next-action question.

## Exact Next Implementation Plan

1. Keep `#/dashboard-lab` as the experimentation route.
2. Pick Concept A as `final-candidate` inside the lab before touching `#/`.
3. Create a refined candidate component, for example `DashboardConceptProductionCandidate.tsx`.
4. Use Concept A data and queue logic unchanged.
5. Replace Concept A hero tone with the calmer Concept B hero structure.
6. Reduce top metrics to: active sites, attention items, release readiness, backup reliability.
7. Reduce capability strip to: Hub API, Hub Mongo, Browser SharePoint, SharePoint write.
8. Replace the full watchlist panel with a compact optional row or remove it.
9. Add one visual summary panel that combines:
   - health distribution
   - release adoption
   - backup freshness
10. Add screenshot QA after browser capture is working:
   - desktop light and dark
   - mobile light and dark
   - above-fold and full-page
11. Only after the refined candidate passes screenshot QA, consider a separate task to promote it to `#/`.

## What Cannot Be Verified Without Real Screenshots

- Whether each concept truly fits inside roughly two desktop viewport heights.
- Whether the first fold feels strong enough.
- Whether mixed Hebrew/English labels wrap cleanly in real fonts.
- Whether dark-mode contrast feels intentional.
- Whether mobile layouts have hidden overflow, awkward stacking, or clipped actions.
- Whether chart color balance is pleasant rather than merely functional.
- Whether the concepts feel sufficiently different from the current dashboard in actual rendering.

## Conclusion

The implementation follows the agreed direction at the code and architecture level. Concept A should stay the base for the production candidate. The final dashboard should combine Concept A’s triage clarity with Concept B’s calm visual rhythm, Concept C’s domain model, and Concept D’s honest compact chart language.
