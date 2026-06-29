import { env } from "../config/env";
import {
  DangerousWriteOperation,
  getDangerousBackupBypassEnvVar,
  getDangerousValidationBypassEnvVar,
  isDangerousValidationBypassEnabled
} from "./dangerousBackupBypass.service";

export type DeployMode = "local-dev-owner" | "production-safe";

export type DeployPolicySnapshot = {
  mode: DeployMode;
  label: string;
  productionSafeMode: boolean;
  localDevOwnerMode: boolean;
  requiresApproval: boolean;
  requiresRecentVerifiedBackup: boolean;
  ownerOverrideAllowed: boolean;
  dangerousBackupBypass?: {
    active: boolean;
    envVar: string;
    operation: DangerousWriteOperation;
    reason: string;
  };
  checkedAt: string;
  warning: string;
  blockers: string[];
};

export type DeploySafetySnapshot = {
  policy: "local-dev-owner-override";
  operation: "deploy" | "rollback";
  required: false;
  satisfied: true;
  checkedAt: string;
  reason: string;
};

export const normalizeDeployMode = (mode?: string): DeployMode =>
  mode === "production-safe"
    ? "production-safe"
    : mode === "local-dev-owner"
      ? "local-dev-owner"
      : env.HUB_ADVANCED_APPROVALS_ENABLED
        ? "production-safe"
        : "local-dev-owner";

export function buildDeployPolicy(mode?: string, operation: Extract<DangerousWriteOperation, "deploy" | "rollback"> = "deploy"): DeployPolicySnapshot {
  const normalized = normalizeDeployMode(mode);
  const localDevOwnerMode = normalized === "local-dev-owner";
  const ownerOverrideAllowed = localDevOwnerMode;
  const dangerousBackupBypassEnvVar = getDangerousBackupBypassEnvVar(operation);
  const dangerousApprovalBypassEnvVar = getDangerousValidationBypassEnvVar("approval-gates");
  const requiresRecentVerifiedBackup = dangerousBackupBypassEnvVar
    ? false
    : localDevOwnerMode
      ? env.HUB_LOCAL_DEV_DEPLOY_REQUIRES_BACKUP
      : env.HUB_PRODUCTION_DEPLOY_REQUIRES_BACKUP;
  const requiresApproval = isDangerousValidationBypassEnabled("approval-gates")
    ? false
    : localDevOwnerMode
      ? false
      : env.HUB_PRODUCTION_DEPLOY_REQUIRES_APPROVAL;
  const blockers: string[] = [];

  return {
    mode: normalized,
    label: localDevOwnerMode ? "Owner-direct deploy" : "Production-safe deploy",
    productionSafeMode: !localDevOwnerMode,
    localDevOwnerMode,
    requiresApproval,
    requiresRecentVerifiedBackup,
    ownerOverrideAllowed,
    dangerousBackupBypass: dangerousBackupBypassEnvVar
      ? {
          active: true,
          envVar: dangerousBackupBypassEnvVar,
          operation,
          reason: `${dangerousBackupBypassEnvVar}=true disables the recent verified backup gate for ${operation}.`
        }
      : undefined,
    checkedAt: new Date().toISOString(),
    warning: dangerousBackupBypassEnvVar
      ? `${dangerousBackupBypassEnvVar}=true is active. ${operation} may run without a recent verified backup. Artifact validation, SharePoint digest, upload read-back, post-operation health, audit, logs, and evidence still run.`
      : dangerousApprovalBypassEnvVar
        ? `${dangerousApprovalBypassEnvVar}=true is active. Approval gates are skipped; SharePoint writes and real verification can still fail.`
      : localDevOwnerMode
        ? "Owner-direct deploy skips approval and treats backup as a warning unless HUB_LOCAL_DEV_DEPLOY_REQUIRES_BACKUP=true. Artifact validation, SharePoint digest, upload read-back, post-deploy health, audit, logs, and evidence still run."
        : "Production-safe deploy keeps configured approval and recent verified backup protections before SharePoint writes.",
    blockers
  };
}

export function buildLocalDevDeploySafetySnapshot(operation: "deploy" | "rollback" = "deploy"): DeploySafetySnapshot {
  return {
    policy: "local-dev-owner-override",
    operation,
    required: false,
    satisfied: true,
    checkedAt: new Date().toISOString(),
    reason: "Local/dev owner deploy mode does not require a recent verified backup unless HUB_LOCAL_DEV_DEPLOY_REQUIRES_BACKUP=true."
  };
}
