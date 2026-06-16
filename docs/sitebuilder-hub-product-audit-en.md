# SiteBuilderHub Product Audit Report

Date: 2026-06-16  
Scope: Full UI/UX and functionality audit  
Language: English  
Status: Audit only - no implementation changes

---

## 1. Executive Summary

SiteBuilderHub has the foundation of a serious operations platform. The product already contains many of the concepts expected in an enterprise admin system: managed site registry, release tracking, deployment planning, dry-runs, blockers, backups, restore, rollback, health checks, monitoring, jobs, audit logs, diagnostics, and metadata-only safety boundaries.

However, the current experience does not yet feel like a mature enterprise SaaS product. It feels closer to a powerful internal operations console that has accumulated many capabilities before its product language, visual hierarchy, and critical workflows were fully designed.

The core issue is not that the product lacks features. The core issue is that the product does not consistently guide the operator through safe decisions.

Users are frequently shown technical state, raw evidence, badges, implementation terms, and many possible actions, but they are not always given a clear answer to the questions that matter most:

- What needs my attention right now?
- What is safe to do?
- What exactly will change if I click this?
- Which sites/users/files are affected?
- Is this metadata-only or live SharePoint write?
- Is this reversible?
- What blocks the action?
- How do I fix the blocker?
- What should I do next?

This gap is most critical in release/deploy flows, admin permission changes, site creation, restore, rollback, and job approvals.

The product can become enterprise-grade, but it needs a focused redesign around trust, consequence clarity, guided workflows, and a more disciplined design system.

---

## 2. Audit Methodology

This audit was performed through:

- Running and inspecting the local application.
- Reviewing visible routes and runtime DOM structure.
- Inspecting API responses for sites, releases, jobs, and health.
- Reviewing frontend components, page implementations, and flow logic.
- Reviewing build output for client and server.
- Testing key runtime flows such as release selection, deploy planning, target selection, dry-run, and blocked execution.
- Reviewing responsive behavior through a mobile viewport.

### 2.1 Inspection Notes

Observed local application state included:

- Two managed sites.
- Three releases: `0.1.18`, `0.1.19`, `0.1.20`.
- Latest known version: `0.1.20`.
- At least one outdated site.
- Release artifacts not ready or missing artifact references.
- Empty jobs list.
- SharePoint write capability effectively unavailable in the inspected local environment.

### 2.2 Limitation

Full browser screenshot capture failed due to browser tool timeout. The audit is therefore based on live runtime inspection, DOM snapshots, API responses, and code review rather than a complete screenshot set.

---

## 3. Severity Definitions

| Severity | Meaning |
|---|---|
| Critical | Can cause data loss, permission mistakes, accidental broad impact, failed production operations, or major trust breakdown. |
| High | Blocks core workflows, creates serious confusion, or makes users afraid to act. |
| Medium | Reduces usability, polish, speed, consistency, or operator confidence. |
| Low | Cosmetic polish, secondary productivity improvement, or non-blocking refinement. |

---

## 4. Overall Maturity Assessment

| Area | Current Maturity | Enterprise Expectation | Gap |
|---|---:|---|---|
| Functional coverage | Medium-high | Broad operational coverage | Features exist but are not fully productized. |
| Release/deploy safety | Medium | Strong readiness gates and protected execution | Existing pieces need stronger UX gating. |
| Permission governance | Low-medium | Explicit preview, approval, and audit reason | Current admin changes need stronger protection. |
| Visual hierarchy | Medium-low | Calm, structured, low-noise hierarchy | Too many badges, panels, and competing details. |
| Navigation architecture | Medium-low | Task-based navigation | Current navigation is module-based. |
| Accessibility | Low-medium | Accessible dialogs, drawers, tables, charts | Foundational modal/drawer improvements needed. |
| Operator guidance | Medium-low | Recommended next actions and remediation | Current UI often explains state but not action. |
| Enterprise polish | Medium-low | Predictable, serious, consistent experience | Product still feels internally focused. |

---

## 5. Product-Level Findings

### 5.1 Biggest Product-Level UX Problems

| Problem | Why It Matters | Example | Severity |
|---|---|---|---:|
| The product shows system state but does not always guide decisions. | Enterprise operators need to know what to do next. | Dashboard lists sites needing attention but does not prioritize action paths. | High |
| Critical actions are not consistently protected. | Deployment, permission, restore, and provisioning actions can have broad consequences. | Restore and rollback use stronger confirmation than some admin actions. | Critical |
| Release/deploy is too easy to enter from a blocked or incomplete release. | Users may think a release can be deployed when it is missing artifact readiness. | Releases without artifact references still expose deploy planning. | High |
| The difference between deploy and rollback is not strict enough. | Selecting an older release can imply rollback-like behavior. | Older release selection can appear as a normal deploy choice. | Critical |
| Too much technical language is exposed as primary UI. | Operators should not need to interpret implementation details. | Raw payloads, endpoint names, metadata flags, and JSON appear prominently. | Medium |
| The UI overuses badges and cards. | Scan quality suffers and the product feels less mature. | Dashboard, release, jobs, health, and details pages all use dense badge-heavy layouts. | Medium |
| Empty/error states do not always tell the user what to do. | Empty states are opportunities for guidance. | Empty jobs state does not clearly say whether the worker is healthy or no operations are pending. | Medium |

### 5.2 Biggest Design-System Problems

| Design-System Gap | Current Effect | Better Enterprise Pattern |
|---|---|---|
| Too many status presentations | Status meaning feels fragmented. | One semantic status system: healthy, warning, blocked, pending, failed, unknown, read-only, write-enabled. |
| Cards inside panels inside sections | Pages feel visually busy. | Fewer containers with stronger spacing and hierarchy. |
| Help icons everywhere | UI feels unsure of itself. | Use inline explanations in critical flows and documentation links in secondary areas. |
| Inconsistent destructive action treatment | Risk level is not always visually obvious. | Standard destructive pattern with separated placement, red tone, typed confirmation when needed. |
| Implementation terms in UI | Product feels internal. | Operator language first, technical details under Advanced. |
| Small text density | Important details can feel buried. | Use larger summary text for decision points and compact text only for secondary data. |

### 5.3 Information Architecture Problems

The current navigation is broad and flat:

- Dashboard
- Analytics
- Sites
- Releases
- Backups
- Admins
- Jobs
- Monitoring
- Audit
- Health
- Diagnostics
- Help
- Settings

This reflects internal modules rather than operator goals. A high-end SaaS admin product would group these around tasks and responsibility areas.

Recommended navigation model:

| Proposed Section | Routes / Content |
|---|---|
| Command Center | Dashboard, alerts, recommended actions, system readiness |
| Sites | Site registry, site details, provisioning |
| Deployments | Releases, deployment console, rollout history, rollback |
| Recovery | Backups, restore, recovery validation |
| Operations | Jobs, monitoring, health checks |
| Governance | Admins, audit log, permission history |
| System | Settings, diagnostics, help |

This would reduce cognitive load and make the product feel more intentional.

### 5.4 Where the Product Feels Childish or Unfinished

The product does not feel childish because of bright colors. The palette is mostly restrained. The immature feeling comes from:

- Too many badges competing for attention.
- Too many small cards and panels.
- Too many help icons in headers, labels, and tables.
- Mixed Hebrew/English terminology in the interface.
- Raw implementation data appearing too close to the main experience.
- Important flows living inside oversized modals.
- Disabled actions with insufficient remediation.
- Action buttons that do not always communicate consequence.
- Dense tables where the main decision is not visually separated from supporting metadata.

The product needs fewer visual objects per screen, clearer decision hierarchy, and more confidence in the copy.

### 5.5 Where Users May Lose Trust

Users may lose trust in these moments:

- A release has missing artifact readiness but the UI still offers deploy planning.
- An older release is selected as a deploy candidate, making a rollback-like operation look normal.
- Admin add/remove actions appear too direct for permission-changing behavior.
- A create-site flow can feel like a casual form instead of infrastructure provisioning.
- A dry-run returns blockers but does not clearly tell the user the best next action.
- Diagnostics expose technical internals without a plain-English diagnosis.
- The product shows many statuses but does not clearly rank severity.
- Users see "metadata", "write blocked", "owner mode", "dry-run", and "job" without a consistent mental model.

### 5.6 Places Where Users May Be Afraid to Click

| Area | Why Users May Hesitate | Required Improvement |
|---|---|---|
| Deploy execution | Scope and consequence need stronger confirmation. | Show affected sites, release version, write mode, rollback path, and require typed confirmation. |
| Create new site | Provisioning impact is large. | Full-page wizard with final plan review and protected confirmation. |
| Add/remove admin | Permission impact can be severe. | Before/after permission preview and reason requirement. |
| Restore | Restore can overwrite state. | Keep typed confirmation and add clearer affected paths. |
| Rollback | Version downgrade can affect many sites. | Dedicated rollback flow with selected target version and validation. |
| Bootstrap | Can initialize or modify site structure. | Preview steps and require confirmation. |
| Retry/rerun job | Could repeat a destructive operation. | Job-type-based protected retry confirmation. |

---

## 6. Global Component and Pattern Audit

### 6.1 App Shell, Sidebar, and Top Bar

| Category | Finding |
|---|---|
| Current purpose | Provide global navigation, theme control, system status, and route frame. |
| What works well | The shell is structurally stable. Sidebar grouping exists. System status is visible. |
| Functional issues | Top bar does not provide enough user/account context or role clarity. |
| UX issues | Navigation is too broad and module-oriented. |
| UI/design issues | Sidebar has many items, mixed language, and similar visual weight across routes. |
| Missing states | No strong current role/capability summary in the shell. |
| Confusing decisions | Users may not know whether to start in Sites, Releases, Jobs, Monitoring, or Health. |
| Risk level | Medium |
| Recommended direction | Use task-based navigation and make capability/read-only/write state part of the global context. |

Specific suggested changes:

- Rename navigation items into a consistent product vocabulary.
- Group routes into Command Center, Sites, Deployments, Recovery, Operations, Governance, System.
- Add account/role/capability status to the top bar.
- Keep system status compact but make write/read-only state unmistakable.
- Add a global "Create / Plan / Run" action only after action safety patterns are standardized.

### 6.2 Tables

| Category | Finding |
|---|---|
| Current purpose | Present site, job, audit, release, backup, and health data. |
| What works well | Tables support desktop views and mobile card variants. |
| Functional issues | Some tables rely on icon-only actions. |
| UX issues | Important actions can be buried among secondary metadata. |
| UI/design issues | Status chips make rows visually busy. |
| Missing states | Mobile/desktop duplicate rendering may need accessibility handling. |
| Confusing decisions | Users may not know which action is primary. |
| Risk level | Medium |
| Recommended direction | Use enterprise data-table patterns with clear primary action, row menu, bulk actions, and column priorities. |

Specific suggested changes:

- Move low-frequency actions into a row action menu.
- Keep only one visible primary action per row.
- Separate destructive actions from navigation actions.
- Add column-level sorting/filtering only where it supports real workflows.
- Add screen-reader-safe responsive table/card switching.

### 6.3 Drawers

| Category | Finding |
|---|---|
| Current purpose | Show details, evidence, payload, audit context, and secondary information. |
| What works well | Drawers prevent full page navigation and expose rich evidence. |
| Functional issues | Drawer accessibility behavior is incomplete. |
| UX issues | Raw evidence appears before human summary in some contexts. |
| UI/design issues | Dense technical content can feel heavy. |
| Missing states | Focus trap, escape close, focus return, aria role. |
| Confusing decisions | Users may not know whether drawer content is diagnostic or actionable. |
| Risk level | High |
| Recommended direction | Drawers should start with human summary and place raw evidence under Advanced. |

Specific suggested changes:

- Implement an accessible shared drawer primitive.
- Add "Summary", "Impact", "Evidence", "Advanced" sections.
- Link drawers to relevant actions when possible.
- Avoid opening raw JSON as the first or only detail.

### 6.4 Modals and Confirmation Dialogs

| Category | Finding |
|---|---|
| Current purpose | Collect form input, confirm actions, and run protected flows. |
| What works well | ProtectedActionDialog is a strong pattern for restore/rollback. |
| Functional issues | Not all critical actions use protected confirmation. |
| UX issues | Large workflows are placed inside modals. |
| UI/design issues | Modal surfaces can feel cramped and heavy. |
| Missing states | Consistent role=dialog, aria-modal, focus trap, escape close, busy states. |
| Confusing decisions | Users may not understand consequences before confirming. |
| Risk level | Critical for critical actions; High globally. |
| Recommended direction | Use three confirmation tiers: simple, protected, destructive with scope. |

Specific suggested changes:

- Simple confirmation: archive metadata, non-destructive actions.
- Protected confirmation: deploy, restore, rollback, permission changes, bootstrap, destructive retries.
- Destructive with scope: broad deploy, broad admin sync, bulk archive/delete, restore over existing content.
- Full-page wizard instead of modal for provisioning and broad rollout.

### 6.5 Status Language

| Current Issue | Impact |
|---|---|
| "metadata", "blocked", "warning", "dry-run", "write locked", "owner direct", and "health" appear in multiple visual forms. | Users need to learn multiple meanings instead of one system. |
| Status tokens are useful but overused. | Visual noise reduces trust. |
| Some states are technical rather than operator-friendly. | Users may misunderstand capability vs business status. |

Recommended taxonomy:

| Status | Meaning |
|---|---|
| Healthy | No action required. |
| Attention needed | Something requires review soon. |
| Blocked | Action cannot proceed until a specific issue is fixed. |
| Failed | A previous operation failed. |
| Pending approval | Action is planned but requires human approval. |
| Running | Operation is currently executing. |
| Read-only | The system can inspect but not write. |
| Write enabled | The system can perform live writes. |
| Unknown | Not checked or insufficient evidence. |

---

## 7. Route-by-Route Audit

### 7.1 Dashboard - `/`

| Item | Audit |
|---|---|
| Current purpose | Provide a top-level operational snapshot of sites, versions, and system reliability. |
| What works well | Shows health, outdated sites, managed site count, and reliability boundaries. |
| Functional issues | Does not strongly convert findings into a prioritized action queue. |
| UX issues | Users see many facts but not enough guidance on what to do first. |
| UI/design issues | KPI cards, panels, and badges create visual density. |
| Missing states | Needs clear severity ordering and "no urgent action" state. |
| Confusing user decisions | User may not know whether to go to Releases, Sites, Backups, or Health first. |
| Risk level | High |
| Recommended redesign direction | Convert Dashboard into a Command Center focused on decisions and next actions. |

Specific suggested changes:

- Add a "Top actions required" section at the top.
- Rank issues by severity and business impact.
- Add action CTAs such as "Review deploy readiness", "Fix backup failure", "Open site health".
- Add a system capability summary: read-only, write blocked, write enabled.
- Reduce explanatory cards on the first screen.
- Push educational content into Help or secondary panels.
- Show "Latest release readiness" and "sites behind latest" as deploy-oriented tasks.

Better version:

- First row: "2 sites need attention", "1 release blocked", "1 site outdated", "Write mode: read-only".
- Second row: prioritized action list.
- Third row: operational health details.

### 7.2 Analytics - `/analytics`

| Item | Audit |
|---|---|
| Current purpose | Provide analytics, charts, filters, and operational insights. |
| What works well | Rich chart builder, quick views, filters, and multiple chart types. |
| Functional issues | The page may be overbuilt relative to the maturity of core operational flows. |
| UX issues | Too many analytics options increase cognitive load. |
| UI/design issues | Mixed English/Hebrew labels; custom charts may not be accessible enough. |
| Missing states | Needs curated insights and saved executive views. |
| Confusing user decisions | Users may not know which chart matters operationally. |
| Risk level | Low to Medium |
| Recommended redesign direction | Simplify into curated operational insights before exposing custom chart building. |

Specific suggested changes:

- Lead with saved views: "Sites at risk", "Deploy readiness", "Backup reliability", "Admin drift".
- Move custom chart builder into Advanced.
- Add text summaries for every chart.
- Add accessible data tables behind charts.
- Use consistent product vocabulary.
- Avoid making analytics look more advanced than the underlying operational workflows.

### 7.3 Sites - `/sites`

| Item | Audit |
|---|---|
| Current purpose | Registry of managed sites. |
| What works well | Search, filtering, active/archive tabs, status badges, responsive mobile cards. |
| Functional issues | Bulk operations and lifecycle clarity are limited. |
| UX issues | Row actions are icon-heavy and can be ambiguous. |
| UI/design issues | Dense status chips make scanning difficult. |
| Missing states | Empty states should explain next steps more clearly. |
| Confusing user decisions | Users may not know whether to inspect details, validate, edit, archive, or open SharePoint. |
| Risk level | Medium |
| Recommended redesign direction | Make Sites a professional enterprise registry with lifecycle, owner, health, version, backup, and next-action columns. |

Specific suggested changes:

- Replace most row icons with an action menu.
- Keep "Open details" as the clear primary action.
- Separate external links from destructive actions.
- Add columns: owner, environment, last deploy, last backup, last health check, next recommended action.
- Add filter presets such as "Outdated", "Backup failed", "Health warning", "Archived".
- Make archive/delete actions visibly lower frequency and separated.
- Add bulk actions only after stronger confirmation patterns exist.

### 7.4 Add Existing Site Flow

| Item | Audit |
|---|---|
| Current purpose | Register an existing SharePoint site into SiteBuilderHub. |
| What works well | Multi-step validation concept exists. |
| Functional issues | Validation and save steps need stronger clarity about what is live vs metadata. |
| UX issues | The flow lives inside a large modal, which can feel constrained. |
| UI/design issues | Step navigation and form density are heavy. |
| Missing states | Needs clearer validation result, duplicate detection, and final summary. |
| Confusing user decisions | User may not understand whether the site is being modified or only registered. |
| Risk level | Medium |
| Recommended redesign direction | Keep as a moderate wizard, but clarify metadata-only registration versus live verification. |

Specific suggested changes:

- Start with a simple explanation: "This registers an existing site. It does not modify SharePoint unless validation/write actions are explicitly run."
- Add duplicate detection.
- Add final summary: site name, URL, code, owner, initial status, source of truth.
- Show validation evidence in human language first.
- Provide "Save as draft" if required fields are incomplete.

### 7.5 Create New Site Flow

| Item | Audit |
|---|---|
| Current purpose | Create or queue creation of a new managed SharePoint site. |
| What works well | The product recognizes this as a multi-step process and includes planning/provision/deploy/verification stages. |
| Functional issues | This is a high-impact operation but is presented inside a modal. |
| UX issues | Users may not fully understand libraries, paths, admins, provisioning effects, and deployment dependency. |
| UI/design issues | A very large modal with many steps feels less serious than the operation deserves. |
| Missing states | Needs impact summary, permission preview, approval state, and post-create tracking. |
| Confusing user decisions | "Owner direct" and disabled initial deploy language may feel unclear or unfinished. |
| Risk level | High |
| Recommended redesign direction | Convert create-new site into a full-page provisioning workflow. |

Specific suggested changes:

- Full-page wizard instead of modal.
- Step 1: identity and purpose.
- Step 2: SharePoint location and path validation.
- Step 3: owners/admins using structured people picker or identity chips.
- Step 4: provisioning plan with libraries, folders, metadata, permissions.
- Step 5: deployment readiness.
- Step 6: final review with typed confirmation.
- Step 7: job tracking and verification.
- Replace free-form admin text with structured fields.
- Replace "owner direct" with a clear capability explanation.
- Add "what will be created" and "what will not be touched".

### 7.6 Site Details - `/sites/:id`

| Item | Audit |
|---|---|
| Current purpose | Detailed workspace for a single managed site. |
| What works well | Rich tabs for overview, paths, health, versions, backups, admins, jobs, audit, and notes. |
| Functional issues | Important actions are spread across tabs without a single recommended next action. |
| UX issues | The page is information-rich but not decision-led. |
| UI/design issues | Tab density and evidence details create cognitive load. |
| Missing states | Needs "site is healthy", "site blocked", "site needs deploy", and "site needs recovery" states. |
| Confusing user decisions | Users may not know whether to fix health, deploy, back up, sync admins, or inspect audit. |
| Risk level | Medium |
| Recommended redesign direction | Turn site details into an actionable site workspace. |

Specific suggested changes:

- Top summary should show:
  - Site status.
  - Version status.
  - Backup status.
  - Admin sync status.
  - Last successful operation.
  - Recommended next action.
- Create tabs around operator goals:
  - Overview.
  - Deployments.
  - Recovery.
  - Access.
  - Health.
  - Activity.
  - Settings.
- Keep raw evidence in drawers under Advanced.
- Add copyable paths with clear labels.
- Convert bootstrap into a planned operation with review and confirmation.

### 7.7 Releases - `/releases`

| Item | Audit |
|---|---|
| Current purpose | Manage release registry and deployment planning. |
| What works well | Shows releases, latest version, artifact validation, deployment tabs, KPIs. |
| Functional issues | Incomplete releases still expose deploy planning. |
| UX issues | Release readiness is present but not enforced strongly enough as a decision gate. |
| UI/design issues | Many badges and actions compete for attention. |
| Missing states | Needs release manifest, artifact content, approval state, and deployability score. |
| Confusing user decisions | User may not know whether to validate, create artifact, create deploy plan, or edit metadata. |
| Risk level | High |
| Recommended redesign direction | Split release registry from deployment console and introduce readiness gates. |

Specific suggested changes:

- Release registry should answer:
  - What is this release?
  - What artifact does it contain?
  - Is it validated?
  - Who created/approved it?
  - Which sites can receive it?
  - What blocks it?
- Hide or disable deploy actions until release reaches deployable readiness.
- For blocked releases, primary CTA should be "Fix artifact readiness" or "Run validation".
- Add release detail page or drawer with manifest and validation evidence.
- Replace disabled placeholder actions with real available actions or remove them.

### 7.8 Create Release Modal

| Item | Audit |
|---|---|
| Current purpose | Create a new release metadata entry. |
| What works well | Supports base version, release type, computed next version, explicit version, artifact ref, notes. |
| Functional issues | Allows incomplete release creation in a way that can look normal. |
| UX issues | Does not clearly explain what a release contains or what makes it deployable. |
| UI/design issues | Modal form is acceptable but not enough for artifact-driven release creation. |
| Missing states | Needs artifact picker, manifest preview, validation preview, duplicate version protection. |
| Confusing user decisions | User may not know whether artifact reference is optional, required, or can be added later. |
| Risk level | High |
| Recommended redesign direction | Convert release creation into a short readiness wizard. |

Specific suggested changes:

- Step 1: release metadata.
- Step 2: artifact selection.
- Step 3: validation.
- Step 4: publish release.
- Allow draft releases, but label them clearly as non-deployable.
- Show "This release cannot be deployed until artifact validation passes."
- Add version uniqueness and semantic version validation feedback inline.

---

## 8. Deep Audit: Release and Deploy Logic

Release/deploy is the most important product area. It is also where the gap between the current product and an enterprise deployment platform is most visible.

### 8.1 What a Release Should Mean

In a high-end enterprise admin platform, a release is not just a version row. A release should be a complete, inspectable unit of change.

Expected release information:

| Release Attribute | Why It Matters |
|---|---|
| Version | Operator must know what is being deployed. |
| Artifact reference | Identifies the actual deployable package. |
| Artifact manifest | Explains what the release contains. |
| Validation status | Confirms the artifact can be used. |
| Changed files/components | Helps user understand scope. |
| Compatibility rules | Explains which sites can receive it. |
| Created by / approved by | Governance and accountability. |
| Release notes | Human explanation of change. |
| Known risks | Enterprise readiness. |
| Rollback target | Recovery confidence. |

Current issue:

The product tracks release state, but the user does not yet get a strong "release package" mental model. A release can look like a row in a registry rather than a controlled deployment artifact.

### 8.2 Creating a Release

Current flow:

- User opens Create Release.
- Selects base version and release type.
- Can provide version and artifact reference.
- Can add notes.
- Release can exist even when artifact is missing.

What works:

- Versioning concept exists.
- Computed next version helps.
- Notes exist.
- Artifact reference exists as a concept.

Issues:

- Missing artifact is treated too casually.
- No artifact browser or picker.
- No manifest preview.
- No immediate validation result.
- No clear release states such as Draft, Validating, Validated, Blocked, Approved, Deployable.
- No clear path from "created release" to "ready for deploy".

Risk level: High.

Recommended redesign:

Release creation should produce one of two clearly labeled outcomes:

1. Draft release - metadata exists, not deployable.
2. Deployable release candidate - artifact attached and validation passed.

The UI should never let a user confuse these two.

### 8.3 Understanding What a Release Contains

Current issue:

The release detail experience does not sufficiently explain the contents of a release. Operators need to know the business and technical impact of a release before deployment.

Recommended content model:

| Section | Content |
|---|---|
| Summary | Version, state, created date, author, approval state. |
| Artifact | Reference, checksum, size, source, validation result. |
| Manifest | Files/components included, changed paths, expected site changes. |
| Compatibility | Which site versions can upgrade, which are blocked, downgrade rules. |
| Rollout readiness | Number of sites ready, already current, blocked, unknown. |
| Risk notes | Known risks and rollback guidance. |
| Audit | Creation, validation, approval, deploy history. |

### 8.4 Selecting a Release for Deploy

Current issue:

In the inspected environment, the selected release defaulted to `0.1.19` even though the latest known version was `0.1.20`. That is dangerous because selecting an older release can create rollback-like behavior while the user believes they are performing a standard deploy.

Risk level: Critical.

Required behavior:

- Default to latest deployable release.
- If no deployable release exists, default to no selection and show "No deployable release is ready".
- If user selects an older release, show a strong warning:
  - "This release is older than the latest known version."
  - "Deploying it may downgrade selected sites."
  - "Use Rollback if this is intentional."
- If the selected operation is a downgrade, force the rollback flow.

### 8.5 Deploying to One Site

Expected enterprise flow:

1. Select release.
2. Select one site.
3. Show current site version, target version, health, backup freshness, admin sync, and write capability.
4. Run dry-run.
5. Show exact result:
   - Will deploy.
   - Already current.
   - Blocked.
   - Would downgrade.
   - Missing artifact.
   - Write unavailable.
6. Require protected confirmation if execution writes to SharePoint.
7. Create job and show progress.
8. Show post-deploy validation.

Current gap:

The building blocks exist, but the flow does not feel like a complete single-site deployment path. It is presented inside a broader release tab structure rather than as a clear task.

Recommended changes:

- Add "Deploy to one site" as a specific scope mode.
- Show one-site impact summary.
- Add "Run preflight" as the primary action.
- After execution, route to job progress and post-deploy health.

### 8.6 Deploying to Multiple Selected Sites

Expected enterprise flow:

- Select release.
- Select sites using filters and explicit checkboxes.
- Show included/excluded count.
- Show grouped readiness:
  - Ready.
  - Already current.
  - Blocked.
  - Needs review.
- Run dry-run.
- Require confirmation with exact count.
- Execute as batch jobs.
- Track per-site result.

Current gap:

The UI supports selected sites, but it does not yet provide enough batch management clarity. Multi-site deploy needs stronger grouping and execution tracking.

Recommended changes:

- Add a site selection summary panel.
- Provide "select all ready", "exclude blocked", and "review blocked" actions.
- Add per-site reason labels.
- Show estimated number of jobs before execution.
- Support staged rollout or waves for broad deploys.

### 8.7 Deploying One Release Broadly Across All Existing Sites

This is a high-risk enterprise operation.

Current issue:

The UI supports an "all" target mode, but broad deployment needs more than a selected mode. It needs a formal rollout experience.

Risk level: High to Critical depending on write capability.

Expected enterprise design:

| Stage | Requirements |
|---|---|
| Scope | "All active sites" with included/excluded count. |
| Readiness | Sites grouped by ready, blocked, already current, incompatible. |
| Blast radius | Show environments, owners, impacted users/sites. |
| Safety | Backup freshness, health status, rollback target. |
| Approval | Typed confirmation and reason. |
| Execution | Batch jobs, progress, pause/resume. |
| Monitoring | Post-deploy health and failures. |

Specific suggested changes:

- Rename "all" to "All active sites" or "All eligible sites".
- Never silently include archived, blocked, or incompatible sites.
- Show "0 sites will change" if true.
- Allow exclusions with required reason.
- Add "rollout waves" for safer enterprise deployment.
- Require typed confirmation with release version and affected site count.

### 8.8 Dry-Run, Blockers, Readiness, and Validation

What works:

- Dry-run exists.
- Blockers exist.
- The system correctly identified a downgrade-style blocker in inspection.
- Execution is disabled when no sites are ready.

Problems:

- Dry-run output needs stronger information architecture.
- Blockers need remediation CTAs.
- "Ready" should not only mean technically ready; it should include artifact, site health, backup freshness, version compatibility, and write capability.

Recommended dry-run output:

| Group | Description | Example Action |
|---|---|---|
| Will deploy | Sites that will be changed. | Continue to review. |
| Already current | Sites already on target version. | Exclude from execution. |
| Blocked | Sites that cannot be deployed. | Fix blocker or exclude. |
| Would downgrade | Sites newer than target release. | Use rollback flow. |
| Unknown | Missing evidence. | Run health/validation. |

### 8.9 Final Execution

Current issue:

Execution is disabled in blocked states, which is good. But when execution becomes available, the UI needs to be much more explicit and protected.

Required confirmation:

- Release version.
- Number of sites affected.
- Site list summary.
- Write capability state.
- Backup freshness.
- Rollback target.
- Reason.
- Typed confirmation.

Suggested confirmation text:

> You are about to deploy release 0.1.20 to 8 sites. This will write to SharePoint. 2 sites are excluded and 1 site is blocked. Type DEPLOY 0.1.20 to continue.

---

## 9. Backups and Restore Audit - `/backups`

### 9.1 Current Purpose

Backups page covers planning, scheduling, inventory, restore, and history.

### 9.2 What Works Well

- The product clearly recognizes backup/restore as a critical operational area.
- Restore uses a stronger protected confirmation pattern.
- Backup inventory and history concepts exist.
- Planning and scheduling are present.

### 9.3 Functional Issues

- Backup policy health is not summarized strongly enough.
- Scheduling lacks clear next-run and timezone explanation.
- Restore readiness needs stronger explanation.
- "Owner direct" and write capability language needs clearer user-facing framing.

### 9.4 UX Issues

- The page contains many operational concepts at once.
- Users may not understand the difference between backup plan, backup job, inventory, restore plan, and restore execution.
- Restore should show exactly what will be overwritten and what will not be touched.

### 9.5 UI/Design Issues

- Multiple panels make the page feel dense.
- Overview and plan content can overlap conceptually.
- Restore history and evidence can feel technical.

### 9.6 Missing States and Explanations

- "No recent backup" state.
- "Backup stale" warning.
- "Restore unavailable because no backup exists."
- "Write unavailable, restore cannot execute."
- "Schedule paused."
- "Next run at X timezone."
- "Last successful backup was X days ago."

### 9.7 Confusing Decisions

- Should the user run a backup now or schedule one?
- Is this a dry-run or a real write?
- Which backup should be restored?
- What content will be replaced?
- Is restore reversible?

### 9.8 Risk Level

High.

### 9.9 Recommended Redesign Direction

Create a Recovery Center:

- Policy.
- Inventory.
- Restore readiness.
- Restore execution.
- Recovery history.

### 9.10 Specific Suggested Changes

- Add a backup policy summary at the top.
- Add freshness indicators.
- Add restore impact preview.
- Add "test restore" or "restore dry-run" if technically possible.
- Keep typed confirmation for restore.
- Require restore reason.
- Link restore jobs to Jobs and Audit.
- Show post-restore validation.

---

## 10. Admins Audit - `/admins`

### 10.1 Current Purpose

The Admins page manages and compares admin permissions across sources such as metadata, TXT/admin source, SharePoint owners, and repair plans.

### 10.2 What Works Well

- The product recognizes admin drift as a real issue.
- Source comparison is valuable.
- Sync and repair concepts are strong.
- The page has the right strategic importance for governance.

### 10.3 Functional Issues

Admin add/remove operations are high-risk and need stronger protection. Permission changes can affect access control and should not feel like ordinary table actions.

### 10.4 UX Issues

Users may not understand:

- Which source is being changed.
- Whether SharePoint is being written to.
- Whether metadata is being updated.
- Whether effective permissions change immediately.
- Whether approval is required.
- Whether the action is reversible.

### 10.5 UI/Design Issues

- The page is dense.
- Source panels compete visually.
- Action buttons can feel too direct.
- Technical source names need clearer labels.

### 10.6 Missing States and Explanations

- Permission change preview.
- Before/after effective access.
- Required reason.
- Approval required state.
- Write unavailable state.
- Identity validation.
- Duplicate admin warning.
- Invalid user warning.
- "This user is already admin through another source."

### 10.7 Confusing Decisions

- Should the user sync, repair, add, or remove?
- Which source is authoritative?
- What happens if TXT and SharePoint disagree?
- Does removing someone from one source remove actual access?

### 10.8 Risk Level

Critical.

### 10.9 Recommended Redesign Direction

Turn Admins into an Access Governance workflow, not a simple edit page.

### 10.10 Specific Suggested Changes

- Every admin add/remove should open a protected confirmation.
- Require reason for all permission-changing actions.
- Show before/after permissions.
- Show exact target: metadata, TXT source, SharePoint owners group, or site collection admin.
- Add approval requirement for production or broad changes.
- Use structured identity inputs:
  - Name.
  - Email.
  - Personal number.
  - Role/source.
- Add effective access summary.
- Add drift resolution flow:
  - Detect drift.
  - Choose source of truth.
  - Preview repair.
  - Queue repair.
  - Approve.
  - Verify.

---

## 11. Jobs Audit - `/jobs`

### 11.1 Current Purpose

Jobs page displays queued, running, completed, failed, and approval-pending operational jobs.

### 11.2 What Works Well

- Job queue concept exists.
- Approval dialog includes approve/reject and reason.
- Auto-refresh exists.
- Raw payload can help developers and support.

### 11.3 Functional Issues

- Retry/rerun safety depends on job type and should be more explicit.
- Empty state does not communicate worker health.
- Approval impact preview should be stronger.

### 11.4 UX Issues

"Jobs" is a technical word. Operators may understand "Operations Queue" better. The page needs to answer:

- What is waiting for me?
- What failed?
- What is running now?
- What needs approval?
- What is safe to retry?

### 11.5 UI/Design Issues

- Technical payloads are too prominent.
- Status badges can crowd the table.
- Approval dialog content can feel implementation-heavy.

### 11.6 Missing States and Explanations

- Queue empty but worker healthy.
- Queue empty because worker disabled.
- Job failed with retry available.
- Job failed with manual intervention required.
- Approval expired.
- Job blocked by write capability.
- Job blocked by missing artifact.

### 11.7 Confusing Decisions

- Should user approve, reject, retry, inspect, or wait?
- What happens after approval?
- Is retry idempotent?
- Does reject cancel everything?

### 11.8 Risk Level

High.

### 11.9 Recommended Redesign Direction

Rename and redesign as an Operations Queue.

### 11.10 Specific Suggested Changes

- Group by:
  - Needs approval.
  - Running.
  - Failed.
  - Scheduled.
  - Completed.
- Show impact summary for each job.
- Add job owner/requester.
- Add target sites/entities.
- Require protected retry for destructive or write jobs.
- Add "worker status" at the top.
- Move raw payload to Advanced.

---

## 12. Monitoring Audit - `/monitoring`

### 12.1 Current Purpose

Monitoring page shows alerts and system events that need attention.

### 12.2 What Works Well

- Alert severity and category exist.
- Suggested action is a good concept.
- Acknowledge flow exists.

### 12.3 Functional Issues

- Acknowledge does not appear to require a note.
- Resolve flow is not prominent enough.
- Entity references need stronger linking.

### 12.4 UX Issues

Alerts should feel like incident management, not just a list.

Users need:

- Who owns this?
- What is impacted?
- How long has it been active?
- What is the next action?
- Is this getting worse?
- Has anyone acknowledged it?

### 12.5 UI/Design Issues

- Current alert cards/table are useful but not incident-grade.
- Severity could be more visually structured.

### 12.6 Missing States and Explanations

- Acknowledged by whom.
- Acknowledged note.
- Resolved by whom.
- Resolution summary.
- Escalation.
- Snoozed state.
- Duplicate alert grouping.

### 12.7 Risk Level

Medium.

### 12.8 Recommended Redesign Direction

Turn Monitoring into an incident inbox.

### 12.9 Specific Suggested Changes

- Add alert owner.
- Add acknowledge with note.
- Add resolve with resolution summary.
- Link directly to site/job/release/backup.
- Add filters for active, acknowledged, resolved.
- Add severity definitions.
- Add "created", "last seen", and "occurrence count".

---

## 13. Audit Log Audit - `/audit`

### 13.1 Current Purpose

Audit page provides governance history, filters, reports, CSV export, and event details.

### 13.2 What Works Well

- Audit log exists.
- Filters exist.
- CSV export exists.
- Summary/report concept exists.
- Detail drawer exposes event payload.

### 13.3 Functional Issues

- Events need more human-readable formatting.
- Raw JSON alone is not enough for compliance review.
- Export scope and truncation should be clearer.

### 13.4 UX Issues

The page is useful for developers and auditors, but it needs better event interpretation for operators.

### 13.5 UI/Design Issues

- Dense table is acceptable but could be more scannable.
- Event detail should start with summary, not raw payload.

### 13.6 Missing States and Explanations

- No events found because of filters.
- Export includes X records.
- Results limited to X records.
- Before/after diff unavailable.
- Event payload redacted.

### 13.7 Confusing Decisions

- Is CSV export all data or filtered data?
- Is the report complete or limited?
- What actually changed in this event?

### 13.8 Risk Level

Medium.

### 13.9 Recommended Redesign Direction

Make Audit a compliance-grade activity log.

### 13.10 Specific Suggested Changes

- Add event templates:
  - Release created.
  - Release validated.
  - Deploy dry-run created.
  - Deploy executed.
  - Admin added.
  - Backup restored.
- Add before/after diff for important events.
- Add actor, role, source, target, and reason as first-class columns.
- Add export confirmation with record count.
- Add saved filters.
- Collapse raw payload under Advanced.

---

## 14. Health Audit - `/health`

### 14.1 Current Purpose

Health page runs and reviews system and SharePoint health checks.

### 14.2 What Works Well

- Read-only orientation is strong.
- Health checks are useful.
- Evidence access exists.
- Scheduling concept exists.

### 14.3 Functional Issues

- Health states are too ambiguous.
- "Unknown", "not checked", "failed", and "blocked by auth" need different presentation.
- Browser-based SharePoint checks need clearer expected limitations.

### 14.4 UX Issues

Users need recommended fixes, not only health results.

### 14.5 UI/Design Issues

- Repetitive health rows and badges can be hard to scan.
- The page should prioritize failing checks and stale evidence.

### 14.6 Missing States and Explanations

- Never checked.
- Stale result.
- Auth blocked.
- Network blocked.
- CORS/localhost limitation.
- Write unavailable.
- Check skipped.
- Check scheduled.

### 14.7 Confusing Decisions

- Should user rerun check, open diagnostics, authenticate, or ignore?
- Is a failed browser check a product problem, browser problem, auth problem, or SharePoint problem?

### 14.8 Risk Level

Medium.

### 14.9 Recommended Redesign Direction

Build a health matrix with remediation.

### 14.10 Specific Suggested Changes

- Use clear states:
  - Healthy.
  - Warning.
  - Failed.
  - Not checked.
  - Auth blocked.
  - Stale.
  - Skipped.
- Add "recommended fix" per failed check.
- Add last checked age.
- Add direct links to Diagnostics or Settings.
- Explain browser-based limitations before running browser checks.

---

## 15. Diagnostics Audit - `/diagnostics`

### 15.1 Current Purpose

Diagnostics helps debug authentication, origin, SharePoint connectivity, 401/403 issues, and environment capability.

### 15.2 What Works Well

- Very useful for developers/support.
- Captures multiple diagnostic dimensions.
- Helps distinguish browser and backend capability.

### 15.3 Functional Issues

- It is too technical for ordinary operators.
- Sensitive or internal configuration details need role-based consideration.

### 15.4 UX Issues

The page should lead with a plain-English diagnosis.

Current feel:

- "Here are many diagnostic facts."

Better feel:

- "The likely cause is X. Fix it by doing Y. Advanced details are below."

### 15.5 UI/Design Issues

- Endpoint names, cookie details, origin details, and flags can feel unpolished.
- Raw diagnostic information should be collapsed by default.

### 15.6 Missing States and Explanations

- Likely cause.
- Confidence level.
- Recommended fix.
- Copy support bundle.
- Role-restricted advanced details.

### 15.7 Risk Level

Medium.

### 15.8 Recommended Redesign Direction

Split into:

- Operator diagnosis.
- Support details.
- Advanced raw data.

### 15.9 Specific Suggested Changes

- Top card: "Diagnosis summary".
- Add "Recommended action".
- Add "Copy diagnostic bundle".
- Hide raw headers/cookies/env under Advanced.
- Link related settings and auth actions.

---

## 16. Settings Audit - `/settings`

### 16.1 Current Purpose

Settings shows auth identity, server health, SharePoint capabilities, and operation map.

### 16.2 What Works Well

- Capability map is useful.
- Server health is visible.
- Read-only/write boundaries are surfaced.

### 16.3 Functional Issues

- Account identity and system settings are mixed.
- Personal number/auth behavior needs clearer framing.

### 16.4 UX Issues

Users may not know which settings are personal, environment-level, or system-level.

### 16.5 UI/Design Issues

- Technical capability content is useful but dense.

### 16.6 Missing States and Explanations

- Current role.
- Permission level.
- Who can change settings.
- What is read-only.
- What requires restart/config change.

### 16.7 Risk Level

Medium.

### 16.8 Recommended Redesign Direction

Split Settings into:

- Account.
- Environment.
- Capabilities.
- Security.
- Advanced diagnostics.

### 16.9 Specific Suggested Changes

- Add role and permission summary.
- Separate personal identity from server config.
- Use plain language for capabilities.
- Move debug-level configuration into Advanced.
- Add warnings before changing identity-related values.

---

## 17. Help Audit - `/help`

### 17.1 Current Purpose

Help provides explanations for concepts used across the product.

### 17.2 What Works Well

- Help content exists.
- Many concepts are documented.
- Inline help integration exists.

### 17.3 Functional Issues

- Help is glossary-oriented rather than task-oriented.

### 17.4 UX Issues

Users facing a deploy blocker or admin drift need a playbook, not only a definition.

### 17.5 UI/Design Issues

- Help page is acceptable, but the broader help system creates visual noise through too many inline icons.

### 17.6 Missing States and Explanations

Missing playbooks:

- How to deploy a release to one site.
- How to deploy a release to all eligible sites.
- How to understand a dry-run.
- How to fix a blocked release.
- How to restore from backup.
- How to resolve admin drift.
- What metadata-only mode means.
- What write capability means.

### 17.7 Risk Level

Low to Medium.

### 17.8 Recommended Redesign Direction

Create task-based help and reduce inline help icon density.

---

## 18. Error, Empty, Loading, and Disabled States

### 18.1 Empty States

Current issue:

Empty states exist, but they are often generic.

Better empty states should answer:

- Why is this empty?
- Is empty good or bad?
- What should I do next?
- Is the system working?

Examples:

| Page | Better Empty State |
---|---|
| Jobs | "No operations are queued. Worker is running. New deploys, backups, and admin repairs will appear here." |
| Audit | "No events match these filters. Clear filters or expand the date range." |
| Releases | "No deployable releases exist. Create a release and attach an artifact." |
| Monitoring | "No active alerts. Last check completed at X." |

### 18.2 Error States

Current issue:

Errors are surfaced, but not always with remediation.

Better pattern:

- What failed.
- Why it likely failed.
- What the user can do.
- Whether retry is safe.
- Link to diagnostics/support.

### 18.3 Disabled States

Current issue:

Some disabled actions explain why, which is good, but the remediation path is not always direct.

Better pattern:

Disabled action should include:

- Reason.
- Required condition.
- CTA to fix.

Example:

Instead of:

- "Deploy disabled."

Use:

- "Deploy disabled because this release has no validated artifact. Attach an artifact and run validation."

### 18.4 Loading States

Current issue:

Loading exists but should become more consistent.

Recommended:

- Skeleton for tables and cards.
- Spinner only for short, local actions.
- Long-running actions should become jobs with progress.
- Disable relevant controls while action is pending.

---

## 19. Responsiveness Audit

### 19.1 What Works

- Tables convert to mobile card layouts.
- Main pages generally avoid horizontal body overflow.
- Navigation has mobile behavior.

### 19.2 Issues

- Large modals and multi-step flows are not ideal on mobile.
- Dense cards and help icons take too much vertical space.
- Broad deployment and site creation are not mobile-friendly as modal flows.

### 19.3 Recommendations

- Use full-screen mobile flows for critical wizards.
- Reduce secondary badges on mobile.
- Prioritize one primary action per mobile card.
- Hide raw evidence by default on mobile.
- Make confirmation dialogs readable without scrolling through dense content.

---

## 20. Accessibility Audit

| Area | Issue | Severity | Recommendation |
|---|---|---:|---|
| Modals | Missing complete dialog semantics and focus management. | High | Shared accessible dialog component. |
| Drawers | Need aria semantics, focus trap, escape close, focus return. | High | Shared accessible drawer component. |
| Tables/cards | Desktop and mobile render variants may need screen-reader hiding. | Medium | Use aria-hidden for inactive layout. |
| Icon buttons | Too many icon-only controls. | Medium | Add visible labels or accessible action menus. |
| Charts | Custom chart visualizations may not be accessible. | Medium | Add text summaries and data tables. |
| Status color | Some meaning depends on visual status tokens. | Medium | Always include text labels. |

Accessibility is not polish. For an enterprise admin platform, it is part of trust and operational safety.

---

## 21. Enterprise SaaS Comparison

### 21.1 What High-End SaaS Admin Platforms Usually Do Better

| Enterprise Standard | Current Gap |
|---|---|
| Guided critical workflows | SiteBuilderHub has flows, but they are not guided enough. |
| Strong action consequence summaries | Some exist, but not consistently. |
| Role/capability clarity | Read/write status exists but is not always action-level. |
| Mature navigation architecture | Current navigation is module-based. |
| Consistent destructive action pattern | Restore/rollback are stronger than other risky actions. |
| Human-readable activity and audit | Raw payload is too prominent. |
| Incident and job management | Exists but needs owner/status/resolution models. |
| Visual calmness | Current UI is dense and badge-heavy. |
| Progressive disclosure | Too much technical detail appears too early. |

### 21.2 What SiteBuilderHub Already Does Well Compared to Early Products

- It recognizes dry-run as essential.
- It has blockers and readiness logic.
- It exposes metadata-only and write boundaries.
- It includes audit trails.
- It has backup and restore concepts.
- It includes job approvals.
- It has diagnostics.
- It separates many operational domains instead of hiding them.

The product is conceptually strong. It needs UX discipline.

---

## 22. Missing Components for a Professional System

| Missing Component | Why It Matters |
|---|---|
| Deployment Console | Central guided flow for release rollout. |
| Release Detail / Manifest View | Makes release contents understandable. |
| Scope Review Component | Required before any broad action. |
| Protected Action Framework | Consistent confirmation for risky operations. |
| Permission Change Preview | Required for admin governance. |
| Incident Inbox | Monitoring needs ownership and resolution. |
| Operations Queue | Jobs need clearer workflow framing. |
| Capability Banner | Read/write/metadata mode should be globally clear. |
| Human-readable Event Renderer | Audit and jobs should not rely on raw payloads. |
| Advanced Details Disclosure | Keeps technical data available but not dominant. |
| Guided Empty States | Turns empty screens into orientation. |
| Role/Permission Model UI | Operators need to know what they can do. |

---

## 23. Cross-Flow Safety Model

SiteBuilderHub should define one shared safety model across all critical flows.

### 23.1 Safety Levels

| Level | Example Actions | Confirmation Required |
|---|---|---|
| Informational | View site, view audit, view release | No confirmation |
| Metadata-only | Edit non-critical metadata, archive metadata | Simple confirmation if destructive |
| Planned write | Create deploy plan, backup plan, admin repair plan | Review summary |
| Live write | Deploy, restore, add admin, remove admin, bootstrap | Protected confirmation |
| Broad live write | Deploy to all sites, bulk admin repair, bulk restore | Protected confirmation plus approval |

### 23.2 Required Protected Confirmation Fields

For critical actions:

- Action name.
- Scope.
- Affected entities.
- What will change.
- What will not change.
- Preconditions.
- Blockers.
- Rollback/recovery path.
- Reason.
- Typed confirmation.

---

## 24. Prioritized Roadmap

### 24.1 Must Fix Immediately

| Priority | Item | Reason | Target Area |
|---:|---|---|---|
| 1 | Protect admin add/remove actions with typed confirmation and reason. | Permission changes are high-risk. | Admins |
| 2 | Default deploy release to latest deployable release only. | Prevent accidental rollback-like deployments. | Releases/Deploy |
| 3 | Block or strongly gate deploy planning for releases without artifact readiness. | Prevent false deploy confidence. | Releases |
| 4 | Add protected confirmation to deploy execution. | Live deployment requires consequence clarity. | Deploy |
| 5 | Fix modal/drawer accessibility. | Foundational usability and compliance issue. | Global |
| 6 | Improve dry-run summary with grouped results and remediation. | Dry-run should drive decisions. | Deploy |
| 7 | Clarify metadata-only vs live write at action level. | Users need to know whether a click writes to SharePoint. | Global |

### 24.2 Should Fix in the Next Redesign Pass

| Priority | Item | Reason | Target Area |
|---:|---|---|---|
| 1 | Build a dedicated Deployment Console. | Core business flow needs a first-class experience. | Releases/Deploy |
| 2 | Convert create-new site into a full-page provisioning wizard. | Site creation is too important for a large modal. | Sites |
| 3 | Reorganize navigation by user task. | Current IA is too module-driven. | Global |
| 4 | Define a strict status taxonomy. | Reduce badge noise and confusion. | Design system |
| 5 | Move raw JSON and technical payloads into Advanced sections. | Improve operator confidence. | Global |
| 6 | Redesign Admins as Access Governance. | Permissions need preview, approval, and audit reason. | Admins |
| 7 | Rename and redesign Jobs as Operations Queue. | Better mental model for operators. | Jobs |
| 8 | Turn Monitoring into an incident inbox. | Alerts need owner, status, and resolution. | Monitoring |

### 24.3 Nice-to-Have Polish

| Item | Reason |
|---|---|
| Reduce inline help icon density. | Improves visual maturity. |
| Add saved filters/views to Audit, Jobs, Analytics. | Supports repeated workflows. |
| Improve chart accessibility. | Makes analytics more enterprise-ready. |
| Add richer skeleton loading states. | Improves perceived quality. |
| Improve mobile wizard behavior. | Critical flows should be usable on smaller screens. |
| Address client bundle size warning. | Performance polish. |

### 24.4 Ideal Long-Term Redesign Direction

The ideal SiteBuilderHub experience should feel like an enterprise operations command center.

The first screen should answer:

- What is healthy?
- What is risky?
- What is blocked?
- What needs approval?
- What should I do next?

The deploy experience should become:

1. Select or validate release.
2. Understand release contents.
3. Select scope.
4. Run preflight/dry-run.
5. Review grouped results.
6. Resolve or exclude blockers.
7. Approve with protected confirmation.
8. Execute as tracked jobs.
9. Monitor post-deploy validation.
10. Roll back if needed.

The permission experience should become:

1. Detect current effective permissions.
2. Compare sources.
3. Preview change.
4. Require reason.
5. Approve or queue.
6. Apply.
7. Verify.
8. Audit.

The recovery experience should become:

1. Show backup policy health.
2. Show inventory.
3. Select restore point.
4. Preview impact.
5. Confirm with typed protection.
6. Execute as job.
7. Validate after restore.

The product already has many of these backend and frontend concepts. The next step is to reorganize them into calm, guided, trustworthy workflows.

---

## 25. Suggested Redesign Blueprint

### 25.1 New Top-Level Navigation

Recommended navigation:

1. Command Center
2. Sites
3. Deployments
4. Recovery
5. Operations
6. Governance
7. System

### 25.2 Command Center

Should include:

- Current capability mode.
- Top risks.
- Required approvals.
- Failed jobs.
- Sites needing attention.
- Release readiness.
- Backup freshness.
- Monitoring alerts.

### 25.3 Deployment Console

Should include:

- Release readiness.
- Artifact manifest.
- Target scope.
- Dry-run grouped results.
- Blocker remediation.
- Approval.
- Execution progress.
- Post-deploy health.

### 25.4 Site Workspace

Should include:

- Site summary.
- Recommended action.
- Deployments.
- Recovery.
- Access.
- Health.
- Activity.
- Settings.

### 25.5 Recovery Center

Should include:

- Backup policy overview.
- Backup freshness.
- Inventory.
- Restore flow.
- Recovery drills.
- Restore history.

### 25.6 Governance Center

Should include:

- Admin access.
- Permission drift.
- Audit log.
- Policy exceptions.
- Approval history.

---

## 26. Final Assessment

SiteBuilderHub is not a weak product. It is a product with strong operational ambition that has not yet been shaped into a mature enterprise experience.

The underlying feature map is impressive for this stage. The product already thinks about dry-runs, blockers, audit, metadata-only safety, write capability, backups, restore, rollback, jobs, health, and diagnostics. These are the right concepts.

The main problem is that the concepts are exposed too directly and too densely. The product needs to become more opinionated:

- Fewer equal choices.
- Clearer recommended actions.
- Stronger protection around risky operations.
- Better separation between operator language and developer evidence.
- More consistent status vocabulary.
- More serious full-page flows for deployment, provisioning, permission changes, and recovery.

If the next redesign focuses first on release/deploy, admin governance, and critical action safety, SiteBuilderHub can move from "powerful internal tool" to "credible enterprise admin platform".

