# Sitebuilder HUB Backups Recovery Redesign Report

Date: 2026-07-07
Scope: desktop UI/UX implementation for `/#/backups`, including all inner tabs and scroll-to-bottom visual QA.

## Summary

The Backups page was redesigned into a compact Recovery workspace:

- One persistent site/workspace header with source, connector, inventory, last backup, and restore status.
- Hebrew tab labels with stable `data-recovery-tab` targets.
- A consistent command table in every tab showing action, effect, execution path, risk, state, and run control.
- Internal scroll regions for tab content so long sections no longer push the full page down.
- Long paths and raw evidence are truncated in-place and moved to the details drawer when needed.
- Restore still uses the protected typed confirmation flow and the same queue/review APIs.

## Visual QA

Baseline screenshots:

- `tmp/backups-design-qa/before/01-overview-00-y0.png`
- `tmp/backups-design-qa/before/04-schedule-00-y0.png`
- `tmp/backups-design-qa/before/06-history-00-y0.png`

After screenshots:

- `tmp/backups-design-qa/after/01-overview-00-y0.png`
- `tmp/backups-design-qa/after/01-overview-inner00-y339.png`
- `tmp/backups-design-qa/after/03-inventory-inner00-y184.png`
- `tmp/backups-design-qa/after/04-schedule-inner00-y445.png`
- `tmp/backups-design-qa/after/05-restore-00-y0.png`
- `tmp/backups-design-qa/after/06-history-inner00-y333.png`

After QA metrics at 1440x1000 desktop:

| Tab | Page scroll height | Horizontal overflow | Internal scroll checked |
| --- | ---: | --- | --- |
| Overview | 1000 | no | yes, top/bottom |
| Run Backup | 1000 | no | yes, top/bottom |
| Inventory | 1000 | no | yes, top/bottom |
| Schedule | 1000 | no | yes, top/bottom |
| Restore | 1000 | no | yes, top/bottom |
| History / Evidence | 1000 | no | yes, top/bottom |

No runtime exceptions were recorded by the CDP capture script.

## Verification

- `npm --prefix client run build`
- `npm test -- tests/hubStaticUiConfig.test.ts`
- `npm test -- tests/backupRestoreApproval.test.ts tests/browserBackupEvidence.test.ts tests/browserRequiredBackupQueue.test.ts`

## Files

- `client/src/pages/BackupsPage.tsx`
- `client/src/styles/index.css`
- `tests/hubStaticUiConfig.test.ts`
- `tmp/backups-design-qa/capture-backups-tabs.mjs`
