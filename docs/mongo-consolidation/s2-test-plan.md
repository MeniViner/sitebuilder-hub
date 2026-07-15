# S2 Mongo consolidation test and validation plan

## Evidence and snapshot tooling

- valid multi-file Windows bundle passes schema/policy/secret validation;
- missing snapshot/array or placeholder host alias exits 30;
- credential URI, bearer/cookie/digest/API-key/private-key material exits 40 without printing the value;
- PowerShell singleton arrays normalize safely;
- global `sites`, `site_data_revisions`, and `site_data_audit_logs` never become physical orphans;
- stopped/nonstandard Mongo container candidates are retained without environment values;
- omitted full BSON scan and incomplete revision physical check are explicit, never clean defaults;
- snapshot mode reruns validation, rejects mixed live inputs, uses the same analyzer, emits production-prefixed JSON/CSV/Markdown and preserves exit codes;
- fixture outputs are visibly marked fixture and never described as production.

## Contract tests

- accept valid `siteDataBinding` and trim allowed identifiers;
- reject wrong database, API version, migration state, empty/overlong builder ID, unsafe collection name, missing fields and unknown fields;
- preserve safe originals when normalization could conceal mismatch;
- allow absence of the optional binding on existing Site records.

## Mapping tests

- exact one-to-one and runtime-confirmed mappings;
- duplicate `siteCode` is warning-only and never used for identity;
- duplicate explicit builder ID or collection is blocked;
- runtime mismatch, registry mismatch and missing physical collection are blocked;
- HUB-only, Builder-only, runtime-only and TXT-not-applicable classifications;
- archived/superseded candidates require disposition;
- stale evidence rejected; reviewed manifest accepted only when hashes match;
- ambiguous candidates cannot be excluded automatically.

## Migration-plan tests

- command defaults to plan and performs zero writes/index operations;
- only exact planned fields appear;
- HUB before-hash, Builder fingerprint or runtime fingerprint drift blocks;
- duplicate/database/conflict/unresolved blocker stops plan eligibility;
- rerun against identical state is idempotent/no-op;
- future apply without confirmation fails before connection/write;
- no unique index is created during binding backfill.

## Disposable apply/rollback tests required before approval

- successful exact apply and post-apply verification;
- successful rollback to before image;
- concurrent modification conflict refuses apply and rollback;
- partial failure records exact completed/pending documents and reruns safely;
- repeated apply and rollback are idempotent;
- unrelated fields and legacy mapping fields remain unchanged;
- index catalog is unchanged.

## Regression and architecture tests

- existing HUB create/update and duplicate-siteCode behavior remains unchanged;
- runtime health/status fields remain readable;
- existing Site Builder functions/data remain unchanged;
- product-simplification frontend compiles with no touched frontend files;
- route inventory proves no `/api/site-data/v1` or Gateway route;
- dependency/repository scan proves no Builder repository import;
- startup inspection and both index commands remain read-only in dry-run;
- no raw URI logging and no startup DDL/DML.

## Required pre-merge commands

Run the evidence validator and policy scanner, targeted snapshot/reconciliation tests, full relevant HUB tests, HUB server TypeScript build, JSON/schema validation, CSV header validation, repository secret scan and `git diff --check`. Run Builder tests only if a future shared contract/tool change touches Builder. Run the PowerShell collector and Pester/syntax checks on Windows before declaring the package operational there.
