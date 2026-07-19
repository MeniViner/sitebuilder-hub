# SiteBuilder Hub staging acceptance runbook

Use this runbook only after the local RC is reviewed and a change window is approved. It defines staging acceptance; it does not authorize production access, migration, cutover, or external writes outside the listed disposable tests.

## Required environment

Obtain and record approved placeholders before starting: `<STAGING_HUB_URL>`, `<STAGING_SHAREPOINT_TEST_SITE>`, `<DISPOSABLE_TXT_SITE>`, `<DISPOSABLE_BUILDER_MONGO_SITE>`, `<STAGING_ADMIN_IDENTITY>`, `<STAGING_VIEWER_IDENTITY>`, `<STAGING_BUILDER_BACKEND>`, `<APPROVED_TEST_ARTIFACT>`, `<APPROVED_BACKUP_LOCATION>`, and `<MONITORING_AND_LOG_ACCESS>`. Use separate Admin and Viewer identities. Do not place credentials, URLs, personal data, or artifacts in this document.

## Read-only acceptance

1. Sign in as Admin, then Viewer. Confirm the visible role, four normal navigation areas (Dashboard, Sites, Operations, Settings), and that malformed/unknown role presentation fails closed.
2. Open a Site and confirm exactly five workspace areas: Overview, Access, Structure, Backups, Activity. Validate one legacy deep link resolves into the corresponding area.
3. Check HUB health/readiness, data freshness, and the browser console/network. Record only sanitized errors and correlation IDs.
4. In Normal mode, confirm Help, Labs, Diagnostics, Jobs, approvals, schedules, raw Jobs, connector details, and Mongo internals are not exposed. Confirm Advanced routes are gated.
5. At desktop and mobile widths, smoke keyboard navigation, visible focus, dialogs, Escape/focus return, RTL/Bidi fields, Light/Dark mode, and no horizontal overflow. This is not screen-reader certification; document VoiceOver/NVDA as a separate accessibility activity.

## Reversible write acceptance (approved staging only; do not execute during local RC)

| Operation | Prerequisite and expected result | Evidence and failure behavior | Rollback / cleanup / pass criteria |
| --- | --- | --- | --- |
| Create disposable Site | Approved disposable TXT site; setup reaches Complete only after all gates pass. | Audit entry and site state; a failed/partial creation remains actionable, never Complete. | Archive/delete only per approved staging procedure; pass when no production resource is touched. |
| Interrupt and continue setup | Disposable site creation is paused after a safe stage. | Resume position and persisted state are visible. | Cancel/cleanup the disposable record; pass when the state is not falsely complete. |
| Change disposable access | Admin plus dedicated Viewer identity. | Read-back shows the requested change and audit evidence. | Restore the original disposable access list; pass when Viewer mutation remains blocked. |
| Deploy reversible test version | Approved test artifact and rollback version. | Deployment plan, health, and audit evidence are readable. | Roll back to the approved prior test version; pass only on verified read-back. |
| Create and verify backup | Approved backup location. | Verification evidence includes payload checks; metadata alone is insufficient. | Retain only as long as the drill requires; pass when recoverability is verified. |
| Restore to disposable target | Verified backup and approved disposable target/state. | Restore result, audit, and health evidence are captured. | Restore/clean the target to its agreed baseline; pass when source production data is never involved. |
| Simulate one connector failure | Safe staging failure injection approved by the owner. | One clear user blocker, audit evidence, and recovery guidance. | Remove injection and prove recovery; pass when no hidden success is claimed. |

## Stop conditions and production blockers

Stop and escalate on unexpected writes, secret exposure, a failed backup/restore proof, role bypass, identity ambiguity, or unapproved external target. Production remains blocked on Windows evidence, production identity mapping, S2 authorization, secured replica set, auth/TLS, backup/PITR and restore drill, Gateway authorization, runtime compatibility, and production change approval.
