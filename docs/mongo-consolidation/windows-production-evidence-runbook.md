# Windows production evidence runbook

This package collects sanitized, read-only evidence for the Mongo consolidation decision. No production evidence was collected while implementing it.

```powershell
$env:MONGODB_URI = "<secret supplied by the classified environment>"
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\mongo-consolidation\collect-windows-evidence.ps1 -OutputDirectory .\mongo-consolidation-evidence -CollectorHostAlias "<approved-safe-alias>" -RuntimeSearchRoots @("D:\Sites") -BackupSearchRoots @("E:\Backups")
node .\scripts\mongo-consolidation\validate-windows-evidence.mjs --input .\mongo-consolidation-evidence
```

`-CollectorHostAlias` is mandatory; do not use a real sensitive hostname. The optional `-IncludeFullCollectionBsonScan` performs a potentially expensive read-only scan to calculate maximum BSON size and timestamp bounds for every collection. Use it only in an approved load window. Without it, `fullBsonScanPerformed` remains false and the missing size/timestamp evidence must be dispositioned before S2.

The collector reads Windows/CIM, services, processes, ports, scheduled tasks, Docker inspection, IIS configuration, Mongo metadata and file metadata. Mongo commands are limited to hello/build/FCV, database and collection metadata, counts, stats and index reads. Runtime payloads are reduced immediately to path, backend, technical site ID, safe origin and schema/API versions. Backup contents are never opened.

The validator must exit `0` before evidence is transferred. Exit `30` means missing/invalid input. Exit `40` means a command-policy or secret-safety failure; it reports only a key/file location, never the value. `summary.md` is generated only from validated JSON.

When direct Mongo access from the analysis machine is prohibited, transfer only the validator-approved directory through the approved classified channel, then run the same analyzer in snapshot mode:

```bash
npm run mongo:reconcile -- \
  --evidence-root /secure/path/validated-production-evidence \
  --output /secure/path/production-reconciliation \
  --format all
```

Snapshot mode reruns the evidence validator and writes the three `production-sitebuilder-mongo-reconciliation.*` outputs. It never opens a live Mongo connection and ignores ambient audit URI variables; do not combine it with `--site` or `--runtime-root`.

The collector records revision/audit aggregates without bodies. It deliberately marks the expensive revision-to-current-document cross-check incomplete; obtain that read-only check through an approved direct audit or a separately reviewed collector extension. Restore-test history, backup retention policy, reverse-proxy header spoofing protection, and security ownership also require operator attestations or product configuration evidence. Missing attestations remain blockers; they must not be inferred from backup files or IIS presence.

Never commit generated `mongo-consolidation-evidence/`. Allowed command families are `Get-*`, `docker ps`, `docker inspect`, and Mongo administrative/read queries. The validator rejects service/task/IIS mutation, Docker lifecycle commands, Mongo DML/index/rename calls, restore execution and deletion. The only writes are the requested evidence output files.
