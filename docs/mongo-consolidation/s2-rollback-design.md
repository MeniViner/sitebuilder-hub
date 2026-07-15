# S2 document-level rollback design

Status: design only. Rollback is not yet proven safe and does not authorize apply.

## Before-image package

Before any future binding apply, create a secret-safe, access-controlled manifest with migration ID, operation timestamp, reviewed evidence/manifest hashes and, for each exact HUB `_id`:

- whether `siteDataBinding` existed;
- the complete prior binding value if present;
- canonical hash of the migration-relevant pre-image;
- expected post-apply binding and post-apply hash;
- unrelated-field fingerprint/`updatedAt` used for concurrency protection.

The package is signed/hashed, stored with the approved evidence outside Git and covered by retention policy. A full recoverable Mongo backup and successful restore evidence remain prerequisites; document rollback does not replace them.

## Future rollback interface

```bash
npm run mongo:site-data-bindings -- --rollback \
  --migration-id <approved-id> \
  --before-manifest /secure/<approved-id>-before.json \
  --confirm ROLLBACK_SITE_DATA_BINDING_MIGRATION
```

Plan-only rollback preview is the default. Execution requires the exact migration ID, matching before manifest and confirmation phrase.

## Safety behavior

1. Revalidate manifest integrity and migration audit record.
2. Read every listed document and require the expected post-apply hash.
3. If any migration-relevant or unrelated protected field changed, refuse that document and require human-reviewed conflict mode; never guess or overwrite.
4. Restore only the additive binding fields changed by this migration: remove the field if absent before, or restore its exact prior value.
5. Do not delete/alter legacy builder IDs, runtime health, status, timestamps owned by other workflows, indexes or Builder data.
6. Use exact `_id` and hash guards, record per-document results, verify post-rollback hashes and support safe rerun/no-op behavior.
7. Index rollback is separate. Data movement, database/collection rename and restore execution are not part of binding rollback.

## Failure handling

- Zero updates with a precondition failure is a safe refusal.
- Partial completion freezes further automatic action, records exact success/conflict/failure rows, and permits idempotent retry only after review.
- A concurrent edit never triggers force mode automatically.
- If application compatibility is impaired, roll back the application release separately; optional stored binding remains ignored by the prior release.

## Proof gate

Production rollback cannot be called reliable until a disposable database demonstrates successful apply/rollback, concurrent-change refusal, partial failure, interruption/retry and repeated-run behavior, with no unrelated field or index change.
