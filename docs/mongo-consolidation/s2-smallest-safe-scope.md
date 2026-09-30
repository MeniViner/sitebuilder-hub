# S2 smallest safe scope

Decision date: 2026-07-19

## Binding decision

**NO-GO — production evidence unavailable.** The only safe next scope is **Candidate 2: mapping manifest and evidence collection only**. It makes no schema, runtime, database, or application change.

## Approved next operational slice

1. An approved Windows operator obtains the continuation package at its reviewed commit and chooses the real runtime and backup search roots from the host itself.
2. The operator sets `MONGODB_URI` only in the classified session, runs `collect-windows-evidence.ps1` with a non-sensitive `CollectorHostAlias`, and validates the resulting directory. The bundle must exit `0`.
3. Transfer only the validator-approved directory through the approved classified channel to the secure evidence location. Do not transfer environment files, raw runtime artifacts, backup contents, URIs, or credentials.
4. Run snapshot reconciliation against that bundle and review every mapping row. An explicit compatible identity chain—not `siteCode`—is required before a row can be exact.
5. Obtain recorded evidence/attestations for restore success, retention/PITR, proxy identity-header stripping/injection, and the intentionally incomplete revision-to-current-document check.

## Not approved

No `siteDataBinding` schema or record update, mapping backfill, index apply, target provisioning for production use, Builder architecture change, Gateway, `/api/site-data/v1`, credential transition, dual write, migration, restore, deployment, runtime switch, or cutover is approved.

The validated sandbox proves target-infrastructure mechanics only. It cannot stand in for production topology, identity mapping, recovery evidence, or authorization evidence.
