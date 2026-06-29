import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEnv = vi.hoisted(() => ({
  NODE_ENV: "test",
  HUB_OWNER_DIRECT_MODE: false,
  HUB_ADVANCED_APPROVALS_ENABLED: true,
  HUB_LOCAL_DEV_DEPLOY_REQUIRES_BACKUP: true,
  HUB_PRODUCTION_DEPLOY_REQUIRES_BACKUP: true,
  HUB_PRODUCTION_DEPLOY_REQUIRES_APPROVAL: true,
  HUB_DANGEROUS_ALLOW_DEPLOY_WITHOUT_BACKUP: false,
  HUB_DANGEROUS_ALLOW_ROLLBACK_WITHOUT_BACKUP: false,
  HUB_DANGEROUS_ALLOW_RESTORE_WITHOUT_BACKUP: false,
  HUB_DANGEROUS_BYPASS_ALL_VALIDATION_GATES: false,
  HUB_DANGEROUS_BYPASS_APPROVAL_GATES: false,
  HUB_DANGEROUS_BYPASS_SHAREPOINT_WRITE_GATES: false,
  HUB_DANGEROUS_BYPASS_RELEASE_ARTIFACT_VALIDATION: false,
  HUB_DANGEROUS_BYPASS_DEPLOY_PLAN_BLOCKERS: false,
  HUB_DANGEROUS_BYPASS_RESTORE_EVIDENCE_GATES: false,
  HUB_DANGEROUS_BYPASS_BROWSER_EVIDENCE_GATES: false,
  HUB_DANGEROUS_BYPASS_ADMIN_REPAIR_GATES: false,
  SHAREPOINT_WRITE_ENABLED: false,
  SHAREPOINT_ALLOW_UNAUTHENTICATED_WRITE: false,
  SHAREPOINT_AUTH_COOKIE: "",
  SHAREPOINT_BEARER_TOKEN: "",
  SHAREPOINT_REQUEST_TIMEOUT_MS: 15000,
  SHAREPOINT_SITE_CREATE_POLL_ATTEMPTS: 2,
  SHAREPOINT_SITE_CREATE_POLL_INTERVAL_MS: 1
}));

vi.mock("../server/src/config/env", () => ({
  env: mockEnv,
  ownerDirectModeEnabled: () => mockEnv.HUB_OWNER_DIRECT_MODE && !mockEnv.HUB_ADVANCED_APPROVALS_ENABLED
}));

vi.mock("../server/src/utils/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    isPayloadLoggingEnabled: vi.fn(() => false)
  }
}));

beforeEach(() => {
  vi.resetModules();
  mockEnv.HUB_DANGEROUS_BYPASS_ALL_VALIDATION_GATES = false;
  mockEnv.HUB_DANGEROUS_BYPASS_APPROVAL_GATES = false;
  mockEnv.HUB_DANGEROUS_BYPASS_SHAREPOINT_WRITE_GATES = false;
  mockEnv.HUB_DANGEROUS_ALLOW_DEPLOY_WITHOUT_BACKUP = false;
  mockEnv.SHAREPOINT_WRITE_ENABLED = false;
  mockEnv.SHAREPOINT_AUTH_COOKIE = "";
  mockEnv.SHAREPOINT_BEARER_TOKEN = "";
});

describe("dangerous validation bypass env", () => {
  it("uses the all-validation switch as the env source for every dangerous gate", async () => {
    mockEnv.HUB_DANGEROUS_BYPASS_ALL_VALIDATION_GATES = true;

    const {
      getDangerousBackupBypassEnvVar,
      getDangerousValidationBypassEnvVar,
      getActiveDangerousValidationBypasses
    } = await import("../server/src/services/dangerousBackupBypass.service");

    expect(getDangerousBackupBypassEnvVar("deploy")).toBe("HUB_DANGEROUS_BYPASS_ALL_VALIDATION_GATES");
    expect(getDangerousValidationBypassEnvVar("approval-gates")).toBe("HUB_DANGEROUS_BYPASS_ALL_VALIDATION_GATES");
    expect(getDangerousValidationBypassEnvVar("sharepoint-write-gates")).toBe("HUB_DANGEROUS_BYPASS_ALL_VALIDATION_GATES");
    expect(getActiveDangerousValidationBypasses().map((item) => item.gate)).toEqual(expect.arrayContaining([
      "approval-gates",
      "sharepoint-write-gates",
      "release-artifact-validation",
      "deploy-plan-blockers",
      "restore-evidence-gates",
      "browser-evidence-gates",
      "admin-repair-gates"
    ]));
  });

  it("turns SharePoint backend write preflight into a dangerous warning instead of a blocker", async () => {
    mockEnv.HUB_DANGEROUS_BYPASS_SHAREPOINT_WRITE_GATES = true;

    const { getSharePointOperationCapabilities } = await import("../server/src/services/sharepointOperationClient");
    const capabilities = getSharePointOperationCapabilities();

    expect(capabilities.hasAuthMaterial).toBe(false);
    expect(capabilities.writeAvailable).toBe(true);
    expect(capabilities.digest.canRequest).toBe(true);
    expect(capabilities.configured.dangerousWriteGateBypassEnvVar).toBe("HUB_DANGEROUS_BYPASS_SHAREPOINT_WRITE_GATES");
    expect(capabilities.reason).toContain("bypasses Hub SharePoint write/digest preflight gates");
  });

  it("skips approval and backup policy gates when explicit dangerous env flags are active", async () => {
    mockEnv.HUB_DANGEROUS_BYPASS_APPROVAL_GATES = true;
    mockEnv.HUB_DANGEROUS_ALLOW_DEPLOY_WITHOUT_BACKUP = true;

    const { approvalsEnabled } = await import("../server/src/services/jobs.service");
    const { buildDeployPolicy } = await import("../server/src/services/deployPolicy.service");
    const policy = buildDeployPolicy("production-safe", "deploy");

    expect(approvalsEnabled()).toBe(false);
    expect(policy.requiresApproval).toBe(false);
    expect(policy.requiresRecentVerifiedBackup).toBe(false);
    expect(policy.dangerousBackupBypass?.envVar).toBe("HUB_DANGEROUS_ALLOW_DEPLOY_WITHOUT_BACKUP");
  });
});
