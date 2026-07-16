export const RECONCILIATION_EXIT_CODES = Object.freeze({ clean: 0, warnings: 10, blockers: 20, sourceFailure: 30, secretFailure: 40 });
export const reconciliationFindingExitCode = (warnings: number, blockers: number) =>
  blockers > 0 ? RECONCILIATION_EXIT_CODES.blockers : warnings > 0 ? RECONCILIATION_EXIT_CODES.warnings : RECONCILIATION_EXIT_CODES.clean;
export const reconciliationFailureExitCode = (secretSafetyFailure: boolean) =>
  secretSafetyFailure ? RECONCILIATION_EXIT_CODES.secretFailure : RECONCILIATION_EXIT_CODES.sourceFailure;
