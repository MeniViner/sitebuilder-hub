import { env } from "../config/env";

export type DeployMode = "local-dev-owner" | "production-safe";

export type DeployPolicySnapshot = {
  mode: DeployMode;
  label: string;
  productionSafeMode: boolean;
  localDevOwnerMode: boolean;
  requiresApproval: boolean;
  requiresRecentVerifiedBackup: boolean;
  ownerOverrideAllowed: boolean;
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

export function buildDeployPolicy(mode?: string): DeployPolicySnapshot {
  const normalized = normalizeDeployMode(mode);
  const localDevOwnerMode = normalized === "local-dev-owner";
  const ownerOverrideAllowed = localDevOwnerMode;
  const blockers: string[] = [];

  return {
    mode: normalized,
    label: localDevOwnerMode ? "Owner-direct deploy" : "Production-safe deploy",
    productionSafeMode: !localDevOwnerMode,
    localDevOwnerMode,
    requiresApproval: localDevOwnerMode ? false : env.HUB_PRODUCTION_DEPLOY_REQUIRES_APPROVAL,
    requiresRecentVerifiedBackup: localDevOwnerMode
      ? env.HUB_LOCAL_DEV_DEPLOY_REQUIRES_BACKUP
      : env.HUB_PRODUCTION_DEPLOY_REQUIRES_BACKUP,
    ownerOverrideAllowed,
    checkedAt: new Date().toISOString(),
    warning: localDevOwnerMode
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
