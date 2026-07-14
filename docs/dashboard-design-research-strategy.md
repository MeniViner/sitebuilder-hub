# Dashboard Design Research Strategy

Date: 2026-07-06

## Reference Sources

Starting references:

- <https://dribbble.com/search/dashboard>
- <https://dribbble.com/tags/modern-dashboard>
- <https://dribbble.com/tags/dashboard>
- <https://muz.li/blog/best-dashboard-design-examples-inspirations-for-2026/>

Additional product pattern references considered:

- Linear-style focus and low-noise task handling.
- Vercel-style deployment/dashboard posture.
- Stripe-style resource management and clear operational surfaces.
- GitHub-style repository/status scanning.
- Atlassian/Jira-style status dashboards for prioritization and issue visibility.
- Modern SaaS, DevOps, cloud operations, CRM, and finance dashboards.

This research was used for pattern extraction only. No specific visual design was copied.

## Research Summary

Modern dashboard references are strongest when they do three things well:

- They reduce the first decision to one readable surface.
- They use space and hierarchy to show importance, not just decoration.
- They keep visualizations tied to available data and a user question.

For Site Builder Hub, the best patterns are not generic “AI dashboards” or sci-fi operations rooms. The product needs a dashboard that feels like a calm operational brief for a real site fleet: what is healthy, what is blocked, what is ready to deploy/recover, and which site deserves attention first.

## Patterns Worth Borrowing

1. Editorial hero brief
   - User question: What is the situation today?
   - Data needed: overall severity, top risk, active sites, readiness metrics.
   - Fit: strong fit for managers opening the Hub in the morning.
   - Risk: can become too much like a landing page if actions are not visible.

2. One decisive next action
   - User question: Where should I click first?
   - Data needed: prioritized risk queue with direct deep links.
   - Fit: essential for Site Builder Hub.
   - Risk: bad if it hides secondary risks entirely.

3. Compact action queue
   - User question: What are the top 3-4 things to handle?
   - Data needed: risk queue with severity, reason, and action link.
   - Fit: strong fit.
   - Risk: becomes a log if raw evidence or long lists are included.

4. Domain lanes
   - User question: Which operational area is unhealthy?
   - Data needed: Deploy / Recovery / Access / Health readiness.
   - Fit: strong fit because the product already organizes operational concerns this way.
   - Risk: can become four giant cards unless kept lane-like and compact.

5. Capability chips
   - User question: Can the Hub actually read/write from the required systems?
   - Data needed: Hub API, Hub Mongo, Browser SharePoint, SharePoint write status.
   - Fit: strong fit when compact.
   - Risk: turns into diagnostics if technical detail is exposed.

6. Bento analytics
   - User question: What is the fleet composition and risk distribution?
   - Data needed: current distributions and readiness percentages.
   - Fit: good for scanability and visual polish.
   - Risk: can become a decorative grid if every cell is equally important.

7. Segmented snapshot bars
   - User question: How is the fleet distributed right now?
   - Data needed: category counts.
   - Fit: honest and compact.
   - Risk: color-only encoding; labels and counts must remain visible.

8. Horizontal risk bars
   - User question: Which categories or freshness buckets dominate?
   - Data needed: count per category/bucket.
   - Fit: strong fit for health, backup freshness, and risk categories.
   - Risk: fake precision if totals are ambiguous.

9. Site topology by real grouping
   - User question: Which sites exist and where are risky sites clustered?
   - Data needed: site list, environment, storage backend, health/risk status.
   - Fit: strong product-specific direction.
   - Risk: must not invent network edges or relationships.

10. Status shape + label encoding
    - User question: What does this colored mark mean?
    - Data needed: status and storage backend.
    - Fit: important for accessibility.
    - Risk: visual noise if every node has too much text.

11. Quiet premium surfaces
    - User question: Can I trust this as a real product screen?
    - Data needed: not data-specific.
    - Fit: helps break from old admin shell.
    - Risk: can drift into generic Dribbble polish without operational clarity.

12. Dense but readable operator lanes
    - User question: What is blocked and what is safe to run?
    - Data needed: domain risks, job counts, capabilities.
    - Fit: strong for operators.
    - Risk: too much density on mobile unless lanes collapse cleanly.

13. Human Hebrew hierarchy
    - User question: What does this mean in plain language?
    - Data needed: derived risk labels and readiness summaries.
    - Fit: mandatory for this product.
    - Risk: mixing too many English labels can make the screen feel pasted together.

14. Small production/lab notice
    - User question: Am I looking at the real dashboard?
    - Data needed: route/mode context.
    - Fit: important because this is lab-only.
    - Risk: too much lab chrome hurts screenshot review.

15. Distinct visual archetypes
    - User question: Which direction should we choose?
    - Data needed: same real data mapped differently.
    - Fit: essential for discovery.
    - Risk: superficial variation if layout structure remains the same.

## Patterns To Avoid

1. Decorative giant rings or pulses.
2. Fake line charts without time series data.
3. Dark neon sci-fi compositions.
4. Generic glassmorphism.
5. Eight-plus KPI card grids.
6. Module directory grids.
7. Raw diagnostics on the dashboard.
8. Activity feeds masquerading as priorities.
9. Fake topology edges.
10. Status-pill soup without hierarchy.

## Patterns That Fit Site Builder Hub

- Morning brief: fits because the Hub needs a daily opening summary.
- Domain lanes: fits because Deploy, Recovery, Access, and Health are real operating domains.
- Fleet map: fits because the product manages many Site Builder sites, not abstract metrics.
- Bento analytics: fits only when charts remain snapshot-based and sparse.
- Capability chips: fit as compact operational context, not as a diagnostics section.

## Patterns That Do Not Fit

- Sci-fi command center: too theatrical for a real internal operations tool.
- Marketing hero: the dashboard is a working surface, not a sales page.
- Social-media style analytics: the product does not have engagement or growth trend data.
- Finance-style time-series dashboards: the product currently lacks reliable historical trend series.
- Dense data warehouse grids: too slow for the first five seconds of use.

## Honest Visualizations For Current Data

These are allowed because current data supports them:

- Health distribution by status.
- Backup freshness buckets.
- Release adoption percentage and outdated count.
- Risk category bars.
- Domain readiness summary.
- Capability state chips: live, cached, metadata, blocked, not checked, unavailable where supported.
- Site nodes grouped by current environment.
- Storage backend shape/label: Mongo, TXT, unknown.
- Job status counts, if used sparingly.
- Active/archive site counts.

## Banned Visualizations For Current Data

These should not be used until the data exists:

- Uptime trends.
- Incident history line charts.
- Deployment velocity charts.
- Backup reliability over time.
- Predictive risk scores.
- Network edges between sites.
- Geographic maps.
- Forecasts.
- “AI confidence” meters.
- Activity timelines that imply complete historical coverage.

## Recommended Four Archetypes

1. Morning Brief / Human Executive Dashboard
   - Mood: calm, human, premium, editorial.
   - Visual metaphor: a morning operational memo.
   - Data story: posture, top issue, four metrics, compact action list, one summary.
   - Avoids: sci-fi, giant charts, raw diagnostics.

2. Operations Board / Action-First Operator Dashboard
   - Mood: practical, serious, focused.
   - Visual metaphor: operator lanes and blockers.
   - Data story: domains, blockers, readiness, capability state.
   - Avoids: old cards, decorative charts, module inventory.

3. Fleet Map / Site Topology Dashboard
   - Mood: product-specific, spatial, inspectable.
   - Visual metaphor: real sites grouped by environment.
   - Data story: site nodes, selected top-risk site, environment/storage/health cues.
   - Avoids: fake network topology and decorative maps.

4. Clean SaaS Bento Analytics
   - Mood: modern, quiet, polished.
   - Visual metaphor: a restrained bento analytics board.
   - Data story: fleet composition, health, release adoption, backup freshness, risk categories.
   - Avoids: fake trends and endless panels.

## Recommendation

Use the four artboards as discovery, not as candidates for promotion. The most promising direction should be selected only after real screenshots at desktop and mobile sizes show that the first fold is useful, readable, RTL-safe, and visually credible.
