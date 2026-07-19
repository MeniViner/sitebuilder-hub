# SiteBuilder Hub final release-candidate report

## Executive verdict

> Local mainline release candidate, ready for reviewed staging acceptance.

This is not a production-readiness declaration. The local `main` was fast-forwarded from `5685903b64ccf709fb872522e4e71683b6af9eb7` to approved integration `0c7ed6a1d15864419f716ac56a547454baa93a63`. The pre-merge reference is preserved as `backup/main-before-hub-simplification-finalization-2026-07-19`.

## Product and architecture state

Normal product navigation is exactly Dashboard, Sites, Operations, and Settings. Visible roles are Admin and Viewer; unknown/malformed roles fail closed. A Site has exactly Overview, Access, Structure, Backups, and Activity. Setup has Details, Destination, Create, and Complete. Help and Labs are off by default, Diagnostics is gated, and legacy/advanced capabilities remain preserved outside Normal mode.

HUB remains the Mongoose-owned `sitebuilder_hub` control plane at `/api/sites`. Startup is `autoIndex:false`, `autoCreate:false`, and inspection-only. Index changes require the explicit `mongo:site-indexes` command; apply requires the exact confirmation. Reconciliation is read-only. `sitebuilder_site_data` remains a future data-plane name, not a cutover. `/api/site-data/v1`, Gateway work, runtime switching, production mapping, dual write, persistent/backfilled `siteDataBinding`, migration, and S2 are absent.

## Sources, changed files, and contracts

The approved sources are `codex/hub-product-simplification-stabilization` (`368e841`), S0/S1 (`00fb922`), and `codex/hub-simplification-hardening-integration` (`0c7ed6a`). Excluded S2/no-go work includes `39857a2` and `321d9f2`. The 92-path integration changes classify as product routing/UI and RTL/accessibility, deterministic scenarios and Playwright/Axe coverage, Mongo inspection/migration/reconciliation tooling, tests, documentation, and lockfile/script integration. A generated `client/tsconfig.tsbuildinfo` was removed from tracking and is ignored.

No tracked Playwright artifacts, reconciliation outputs, logs, local absolute paths, raw credentials, or raw Mongo URIs were accepted. The only pre-existing untracked files on canonical `main` are separately preserved, non-colliding documentation files; they were neither committed nor changed.

## Verification

The complete local acceptance passed before mainline movement and is repeated post-merge in the commands below. Automated results are 71 test files / 323 tests passed and 29 browser tests passed, including 3 Axe checks. Server and client TypeScript/Vite builds pass. Main emitted JavaScript is 299.52 kB (95.28 kB gzip); CSS is 219.96 kB (34.93 kB gzip). Assistant Hebrew font assets are emitted in 4.24–5.55 kB files. Major legacy pages remain lazy (for example, Sites 125.97 kB and Site Details 92.13 kB). Vite retains its known `hub-config.js` non-module warning.

The real local Mongo 7.0.35 acceptance confirms a single topology, sanitized successful startup, unchanged before/after metadata, dry-run status `already-current` with zero actions, and reconciliation result 5 rows / 9 warnings / 0 blockers / exit 10. Duplicate `siteCode` is informational rather than identity. The clean-room Mongo acceptance additionally proved empty isolated startup does not create schema/indexes, while dry-run reports its planned indexes without applying them; the disposable container and volume were removed afterward.

The real local browser smoke confirmed Dashboard, Sites, Site workspace, Operations, Settings, Advanced Settings, the four-item navigation, five workspace areas, gated Help/Labs/Diagnostics, no raw Mongo text in Normal workspace, and no console errors after local CORS configuration was aligned. Deterministic scenarios cover Viewer fail-closed behavior, partial failures, cached data, setup state, mobile navigation, modal focus trap, Escape/focus return, and Light/Dark responsive checks. Automated Axe coverage is not screen-reader certification; VoiceOver/NVDA remain staging accessibility work.

## Documentation, staging, and rollback

Existing product, integration, local-data, and Mongo S0/S1 documentation was retained as historical evidence. The RC adds the [staging acceptance runbook](sitebuilder-hub-final-staging-acceptance-runbook.md), [rollback and branch map](sitebuilder-hub-final-rollback-and-branch-map.md), and [machine-readable manifest](release-candidate/sitebuilder-hub-simplified-s0s1-rc1.json). The runbook separates read-only checks from approved reversible staging writes and explicitly lists production blockers.

To roll back locally, retain the safety branch and either restore the local branch pointer through a reviewed operation or create a history-preserving revert; do not reset/delete user-owned untracked files, existing local data volumes, source branches, or separate Mongo worktrees. Keep the safety branch, source branches, and RC tag until staging sign-off.

## Final self-challenge and declaration

This review did not inspect production, the classified Windows environment, external SharePoint, or Builder writes. It did not prove production identity mapping, TLS/auth, replica-set/PITR behavior, Gateway authorization, or a production restore drill. Those are explicit external gates, not inferred accomplishments. No production action, push, remote PR, remote merge, deployment, Mongo apply/migration/cutover, S2 work, or external write occurred.
