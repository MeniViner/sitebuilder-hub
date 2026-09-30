# S2 identity-binding migration dry-run design

Status: design only; no apply implementation or production execution is approved.

## Proposed interface

```bash
npm run mongo:site-data-bindings -- --plan \
  --manifest /secure/reviewed-production-mapping.json \
  --evidence-root /secure/validated-production-evidence \
  --output /secure/binding-plan

# Future and separately approved only
npm run mongo:site-data-bindings -- --apply \
  --manifest /secure/reviewed-production-mapping.json \
  --confirm SITE_DATA_BINDING_MIGRATION
```

Plan is the default. Unknown flags, omission of `--plan`, or mixing plan/apply inputs must fail closed.

## Reviewed manifest

Each row contains the exact HUB ObjectId, original and canonical `builderSiteId`, database literal, original and canonical `safeCollectionName`, API version, migration state, source evidence package hash/timestamp, runtime artifact fingerprint when available, expected Builder registry fingerprint, HUB document-before canonical hash, reviewer/disposition metadata, and an optional reason for explicit exclusion. It contains no credentials, payload data or personal fields.

Canonicalization may trim IDs and normalize timestamp/URL/path comparison forms, but the safe original value remains alongside the canonical value. Database and collection case is never silently folded because it can change Mongo meaning.

## Plan algorithm

1. Validate evidence with the production evidence validator; require exit 0.
2. Validate the manifest strictly and verify its digest/reviewer metadata.
3. Reject stale evidence using the approved maximum age and re-check current `updatedAt`/document hash.
4. Load current HUB sites and Builder registry read-only; obtain runtime fingerprint where approved.
5. Require an exact HUB `_id`; never find a row by `siteCode`, name, owner, URL similarity or cardinality.
6. Verify explicit HUB identifiers, runtime site ID, registry site ID, collection name and physical existence are compatible.
7. Reject duplicate builder IDs, duplicate collection names, database mismatches, runtime/registry conflicts, missing physical collections and unresolved blocker-designated warnings.
8. Compute a canonical before hash from only the versioned fields relevant to the migration plus `_id` and `updatedAt`.
9. Emit exact `set`/`unset` intent, unchanged rows, exclusions and blockers. Emit no URI and perform zero writes.
10. Secret-scan outputs and return 0/10/20/30/40 under the reconciliation convention.

## Planned output

- manifest/evidence SHA-256 values;
- generated/expiry timestamps and source aliases;
- one exact row per HUB `_id` with before hash, proposed binding, reason and verification sources;
- duplicate/conflict summary;
- counts for change/no-op/excluded/blocked;
- explicit assertion `writesAttempted: 0`, `indexesAttempted: 0`.

## Future apply safety contract

Apply requires a fresh reviewed manifest and exact confirmation phrase. Every update filter includes `_id` plus the planned before hash/fingerprint. Only listed documents are touched; no inference or bulk “fill missing” query is allowed. The operation is idempotent, preserves legacy mapping fields, writes an audit-friendly migration result, and runs post-apply reads. A changed document causes a conflict, not overwrite. Unique indexes are a different approval and never share the binding apply.

Apply must remain disabled for real targets until disposable-database apply/rollback/concurrency/partial-failure tests pass and a full production backup plus restore proof exists.
