# SiteBuilder Hub Product Constitution

Status: binding product authority for the product-simplification workstream  
Date: 2026-07-15  
Baseline: `5685903b64ccf709fb872522e4e71683b6af9eb7`

## Product definition

SiteBuilder Hub is a simple internal console for finding, managing, updating, protecting, and recovering Site Builder installations.

It is not a generic enterprise control plane, approval platform, BI suite, developer console presented as a product, replacement for every Builder administration capability, or a product that requires operators to understand its internal architecture.

## Primary jobs

The normal product serves only three jobs:

1. Find a site and understand quickly whether it needs attention.
2. Create, update, or manage a site and its access.
3. Back up, restore, or recover from an operational problem.

Normal-mode content that does not directly support one of these jobs belongs in contextual help, Advanced, Diagnostics, an explicitly enabled Lab, or internal implementation.

## Visible roles

The product presents only:

- Admin — can view and perform operations allowed by the internal authorization policy.
- Viewer — can view but cannot execute mutations.

Internal identities, scopes, approval fields and compatibility roles remain richer. The presentation layer must not collapse authorization to an unsafe boolean or rewrite backend authorization contracts.

## Safety policy

The normal product does not expose approval queues, approve/reject controls, self-approval language, approval TTLs or “awaiting approval” as a normal status.

Safety remains automatic and internal:

- permission and capability preflight;
- a genuine backup requirement when a recoverable backup can be proven;
- impact summary and typed confirmation;
- read-back verification and post-operation health;
- audit and evidence persistence;
- retry, rollback or recovery only where the system can prove them safe.

Approval schema fields, approval history, persisted job states and evidence remain intact in this phase.

## Scheduling policy

Scheduling is absent from normal mode until a proven unattended runner exists. Browser-required operations are manual and interactive. Scheduler persistence, history and workers remain intact but hidden.

## Primary navigation

Normal navigation contains exactly:

1. Dashboard
2. Sites
3. Operations
4. Settings

Releases, Backups, Admins, Jobs, Monitoring, Audit, Health, Diagnostics, Help, Analytics and all dashboard experiments are not primary destinations. Useful capabilities are composed into the four areas or remain available through contextual Advanced links and deliberate UI modes.

## Site workspace

A site has exactly five visible areas:

1. Overview
2. Access
3. Structure
4. Backups
5. Activity

Legacy tab parameters map into these areas. Technical paths, raw evidence and connector internals are Advanced-only.

## Human status vocabulary

Operations expose:

- Ready
- In progress
- Succeeded
- Failed

Persistent site condition exposes:

- Ready
- Needs attention
- Unavailable

Internal planning, preflight, browser-required, verifying, retrying, blocked, partial and recovery states remain unchanged and map centrally to the human vocabulary. Raw internal enum names do not appear in normal mode.

## UI modes

- Normal — four primary areas, human outcomes and minimal evidence.
- Help — definitions and guidance, explicitly requested.
- Diagnostics — technical support surfaces, explicitly enabled.
- Labs — experiments and QA, explicitly enabled and lazy-loaded.

Missing configuration resolves to Normal. Help icons and Labs are off by default. Diagnostics, Help and Labs never enter normal navigation.

## Content contract

Always visible:

- current state;
- essential value;
- primary action;
- active blocker;
- one short recovery instruction.

Contextual:

- information necessary for the current decision;
- dangerous-operation impact;
- why an action is blocked.

Help-only:

- concepts, definitions, educational guidance and guided explanations.

Diagnostics-only:

- URLs, paths, connector modes, request metadata, raw evidence, runtime configuration, HTTP details, JSON, hashes and internal identifiers.

Long architecture explanations and manuals remain documentation-only.

## Typography and accessibility

The interface is Hebrew-first and RTL-first. It uses a local Hebrew-capable font, semantic type tokens, AA contrast targets, visible focus and approximately 44px hit areas. URLs, IDs, versions, paths, email and numbers use bidi isolation where needed. All overlays use dialog semantics, a labelled title, focus trap, Escape, focus return and a mobile-safe layout.

## Mongo-consolidation boundaries

The simple user-facing Site concept does not merge internal identities.

The implementation preserves separate concepts and contracts for:

- HUB managed-site identity;
- Builder logical `builderSiteId`;
- Builder registry record;
- physical `safeCollectionName`;
- SharePoint hosting target;
- runtime configuration;
- data-plane capability and migration state.

Navigation uses the HUB managed-site identifier. Identity is never inferred from `siteCode`, display name or SharePoint URL. The following fields are never removed, renamed, silently defaulted or repurposed:

`builderSiteId`, `mongoSiteId`, `safeCollectionName`, `siteIdentityKey`, `storageBackend`, `backendApiUrl`, `builderApiKeyRef`, `runtimeConfigPath`, `runtimeConfigUrl`, `runtimeConfigStatus`, `mongoBackendStatus`, resolved SharePoint paths, lifecycle/provisioning state, connector modes, internal operation states, evidence and audit references.

HUB `/api/sites` and Builder `/api/sites` remain separate. This work does not implement `/api/site-data/v1`. Normal pages call frontend domain actions instead of depending on connector or endpoint implementation.

The target architecture remains one HUB-owned MongoDB deployment with:

- `sitebuilder_hub` control-plane database using Mongoose;
- `sitebuilder_site_data` data-plane database using the native MongoDB driver;
- separate `sites` collections in the two databases;
- no schema merge and no general dual-write strategy.

## Non-goals

This work does not perform:

- Mongo migration or consolidation;
- database or collection rename;
- schema merge or data cutover;
- production-auth rewrite;
- Builder repository rewrite;
- `/api/site-data/v1` implementation;
- backend cleanup unrelated to visible simplification;
- production access, deploy, push, PR, merge or deployment.

## Governance

Every normal route, component and piece of copy must trace to a primary job. Every advanced or experimental route must declare its mode, visibility, role presentation, compatibility and lazy boundary in the centralized route manifest. New states must map through the centralized status layer rather than adding user-facing enums.
