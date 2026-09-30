# Production evidence analysis — unavailable

Decision date: 2026-07-15
Evidence status: **unavailable / not collected**
Production evidence validation outcome: **exit 30 (missing source)**

## Evidence boundary

No actual Windows host, Site Builder/HUB production Mongo connection, or approved exported evidence bundle was available to this session. One configured SSH production alias was reachable, but its sanitized service inventory proved it was an unrelated Linux application stack with no Site Builder, HUB, or Mongo listener. Collection stopped there; its metadata is not treated as Site Builder production evidence and is not included in the mapping.

Local Mac Mongo state, prior documentation, and sanitized fixtures were used only to test the tools. None is represented as production state. No Windows collector execution is claimed.

## Production facts that remain unknown

| Category | Required evidence | Current state |
| --- | --- | --- |
| Windows | approved alias, OS/build, clock/timezone, services, processes, ports, tasks | unavailable |
| Mongo ownership | native service/container/remote service, data paths/volumes, stopped legacy instances | unavailable |
| Mongo topology | kind, version, FCV, members/health, auth, TLS, storage/journal, concerns, network exposure | unavailable |
| Databases | every relevant/current/copied database, collections, counts, sizes, options, indexes, timestamp bounds | unavailable |
| HUB | sanitized `sites` technical projection and exact count | unavailable |
| Builder | registry projection, exact count, physical existence | unavailable |
| Site data | per-collection integrity and size aggregates | unavailable |
| Revisions/audit | per-site aggregate integrity and timestamp evidence | unavailable |
| Runtime | deployed artifacts, safe origins, IDs, timestamps, raw-secret findings | unavailable |
| Proxy | IIS/rewrite/ARR routes, header injection/forwarding and spoofing protection | unavailable |
| Recovery | backup type, latest success, retention, PITR and successful restore proof | unavailable |

Consequently the actual topology, database names, site counts, runtime count, mapping distribution, integrity condition, security condition and backup condition cannot be stated.

## Tool defects corrected for the next collection

The original S0/S1 collector could classify the global `site_data_revisions` and `site_data_audit_logs` collections as physical-site orphans, used a hard-coded host alias, searched Docker by image ancestry only, and did not produce a snapshot accepted by the reconciliation analyzer. The read-only corrective package now:

- requires an explicit safe collector alias and records UTC/local time and timezone;
- associates listening ports with process names;
- inspects all Docker containers before retaining Mongo candidates;
- excludes global Builder collections from physical-orphan candidates;
- records expanded topology/database/HUB/registry/site-data aggregate metadata;
- marks expensive evidence that was not collected instead of treating it as clean;
- reduces runtime artifacts to technical fields and finding codes;
- writes `reconciliation-snapshot.json`;
- validates that snapshot and feeds it into the existing reconciliation analyzer through `--evidence-root`.

These corrections were tested on sanitized fixtures only. PowerShell was not available on this Mac and the collector has not been executed on Windows; Windows execution remains a required gate.

## Validation and normalization protocol

1. Run the collector from the pinned HUB commit in the approved Windows environment; write outside Git.
2. Run `validate-windows-evidence.mjs`. Stop on 30. Quarantine and stop on 40. Do not manually bypass either result.
3. Preserve the collector JSON as the safe-original layer. Do not edit it in place.
4. Normalize only in derived analysis: trim technical IDs; serialize ObjectIds as 24-character strings; preserve Mongo database/collection case because it may be semantically significant; canonicalize timestamps to UTC ISO-8601; canonicalize Windows paths for comparison while retaining the original path; canonicalize URL scheme/host casing and trailing slash while retaining the safe original URL/path.
5. Run `mongo:reconcile -- --evidence-root ...`. Exit 0/10/20/30/40 retains its documented meaning.
6. Store real evidence and real reconciliation outputs in the approved secure evidence directory. Commit only separately reviewed redacted summaries.

## Exact next operational action

The Windows/production owner must provide either (a) approved direct read-only access to the actual Site Builder/HUB host and Mongo deployment, or (b) a validator-exit-0 evidence directory collected on that host with the pinned package. They must also provide explicit attestations/evidence for restore testing, retention/PITR, proxy identity-header protection and revision-to-current-document reconciliation. Analysis can resume only after the bundle passes schema, policy and secret validation.
