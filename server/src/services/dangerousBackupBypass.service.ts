import { env } from "../config/env";

export type DangerousWriteOperation = "deploy" | "rollback" | "restore";
export type DangerousValidationGate =
  | "approval-gates"
  | "sharepoint-write-gates"
  | "release-artifact-validation"
  | "deploy-plan-blockers"
  | "restore-evidence-gates"
  | "browser-evidence-gates"
  | "admin-repair-gates";
export type DangerousValidationBypassSnapshot = {
  gate: DangerousValidationGate;
  envVar: string;
  active: true;
  description: string;
};

const dangerousGateEnvVars: Record<DangerousValidationGate, keyof typeof env> = {
  "approval-gates": "HUB_DANGEROUS_BYPASS_APPROVAL_GATES",
  "sharepoint-write-gates": "HUB_DANGEROUS_BYPASS_SHAREPOINT_WRITE_GATES",
  "release-artifact-validation": "HUB_DANGEROUS_BYPASS_RELEASE_ARTIFACT_VALIDATION",
  "deploy-plan-blockers": "HUB_DANGEROUS_BYPASS_DEPLOY_PLAN_BLOCKERS",
  "restore-evidence-gates": "HUB_DANGEROUS_BYPASS_RESTORE_EVIDENCE_GATES",
  "browser-evidence-gates": "HUB_DANGEROUS_BYPASS_BROWSER_EVIDENCE_GATES",
  "admin-repair-gates": "HUB_DANGEROUS_BYPASS_ADMIN_REPAIR_GATES"
};

const gateDescriptions: Record<DangerousValidationGate, string> = {
  "approval-gates": "Skip Hub approval gates and queue approval-protected jobs directly.",
  "sharepoint-write-gates": "Treat backend SharePoint write/digest capability preflight as open; real SharePoint requests can still fail.",
  "release-artifact-validation": "Do not block queue/dry-run on release artifact validation blockers.",
  "deploy-plan-blockers": "Allow deploy queueing even when dry-run rows contain Hub blockers.",
  "restore-evidence-gates": "Skip Hub restore evidence preflight gates; real restore file reads/writes can still fail.",
  "browser-evidence-gates": "Accept browser evidence flows without blocking on missing verification evidence.",
  "admin-repair-gates": "Allow admin TXT repair queue/execution even when the diff/preflight says no repair is needed."
};

export const getDangerousValidationBypassEnvVar = (gate: DangerousValidationGate): string => {
  if (env.HUB_DANGEROUS_BYPASS_ALL_VALIDATION_GATES) {
    return "HUB_DANGEROUS_BYPASS_ALL_VALIDATION_GATES";
  }

  const envVar = dangerousGateEnvVars[gate];
  return env[envVar] ? String(envVar) : "";
};

export const isDangerousValidationBypassEnabled = (gate: DangerousValidationGate) =>
  Boolean(getDangerousValidationBypassEnvVar(gate));

export const getActiveDangerousValidationBypasses = (): DangerousValidationBypassSnapshot[] =>
  (Object.keys(dangerousGateEnvVars) as DangerousValidationGate[]).flatMap((gate) => {
    const envVar = getDangerousValidationBypassEnvVar(gate);
    return envVar
      ? [{
          gate,
          envVar,
          active: true as const,
          description: gateDescriptions[gate]
        }]
      : [];
  });

export const getDangerousBackupBypassEnvVar = (operation: DangerousWriteOperation) => {
  if (env.HUB_DANGEROUS_BYPASS_ALL_VALIDATION_GATES) {
    return "HUB_DANGEROUS_BYPASS_ALL_VALIDATION_GATES";
  }
  if (operation === "deploy" && env.HUB_DANGEROUS_ALLOW_DEPLOY_WITHOUT_BACKUP) {
    return "HUB_DANGEROUS_ALLOW_DEPLOY_WITHOUT_BACKUP";
  }
  if (operation === "rollback" && env.HUB_DANGEROUS_ALLOW_ROLLBACK_WITHOUT_BACKUP) {
    return "HUB_DANGEROUS_ALLOW_ROLLBACK_WITHOUT_BACKUP";
  }
  if (operation === "restore" && env.HUB_DANGEROUS_ALLOW_RESTORE_WITHOUT_BACKUP) {
    return "HUB_DANGEROUS_ALLOW_RESTORE_WITHOUT_BACKUP";
  }
  return "";
};

export const isDangerousBackupBypassEnabled = (operation: DangerousWriteOperation) =>
  Boolean(getDangerousBackupBypassEnvVar(operation));
