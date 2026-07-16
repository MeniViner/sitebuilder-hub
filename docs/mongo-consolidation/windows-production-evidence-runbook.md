# Windows production evidence runbook

This package collects sanitized, read-only evidence for the Mongo consolidation decision. No production evidence was collected while implementing it.

```powershell
$env:MONGODB_URI = "<secret supplied by the classified environment>"
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\mongo-consolidation\collect-windows-evidence.ps1 -OutputDirectory .\mongo-consolidation-evidence -RuntimeSearchRoots @("D:\Sites") -BackupSearchRoots @("E:\Backups")
node .\scripts\mongo-consolidation\validate-windows-evidence.mjs --input .\mongo-consolidation-evidence
```

The collector reads Windows/CIM, services, processes, ports, scheduled tasks, Docker inspection, IIS configuration, Mongo metadata and file metadata. Mongo commands are limited to hello/build/FCV, database and collection metadata, counts, stats and index reads. Runtime payloads are reduced immediately to path, backend, technical site ID, safe origin and schema/API versions. Backup contents are never opened.

The validator must exit `0` before evidence is transferred. Exit `30` means missing/invalid input. Exit `40` means a command-policy or secret-safety failure; it reports only a key/file location, never the value. `summary.md` is generated only from validated JSON.

Never commit generated `mongo-consolidation-evidence/`. Allowed command families are `Get-*`, `docker ps`, `docker inspect`, and Mongo administrative/read queries. The validator rejects service/task/IIS mutation, Docker lifecycle commands, Mongo DML/index/rename calls, restore execution and deletion. The only writes are the requested evidence output files.
