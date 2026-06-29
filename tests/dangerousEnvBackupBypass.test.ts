import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  SiteBackup: {
    findOne: vi.fn()
  },
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    isPayloadLoggingEnabled: vi.fn(() => false)
  }
}));

vi.mock("../server/src/models/SiteBackup", () => ({ SiteBackup: mocks.SiteBackup }));
vi.mock("../server/src/utils/logger", () => ({ logger: mocks.logger }));
vi.mock("../server/src/config/env", () => ({
  env: {
    NODE_ENV: "test",
    HUB_ADVANCED_APPROVALS_ENABLED: true,
    HUB_LOCAL_DEV_DEPLOY_REQUIRES_BACKUP: true,
    HUB_PRODUCTION_DEPLOY_REQUIRES_BACKUP: true,
    HUB_PRODUCTION_DEPLOY_REQUIRES_APPROVAL: true,
    HUB_DANGEROUS_ALLOW_DEPLOY_WITHOUT_BACKUP: true,
    HUB_DANGEROUS_ALLOW_ROLLBACK_WITHOUT_BACKUP: true,
    HUB_DANGEROUS_ALLOW_RESTORE_WITHOUT_BACKUP: true
  },
  ownerDirectModeEnabled: () => false
}));

const siteId = "665000000000000000000001";
const restoreBackupId = "665000000000000000000201";

beforeEach(() => {
  vi.resetModules();
  mocks.SiteBackup.findOne.mockReset();
  mocks.logger.warn.mockReset();
});

describe("dangerous env backup bypass", () => {
  it("marks deploy policy as not requiring a recent verified backup when the env bypass is active", async () => {
    const { buildDeployPolicy } = await import("../server/src/services/deployPolicy.service");

    const policy = buildDeployPolicy("production-safe", "deploy");

    expect(policy.requiresRecentVerifiedBackup).toBe(false);
    expect(policy.dangerousBackupBypass).toMatchObject({
      active: true,
      envVar: "HUB_DANGEROUS_ALLOW_DEPLOY_WITHOUT_BACKUP",
      operation: "deploy"
    });
    expect(policy.warning).toContain("HUB_DANGEROUS_ALLOW_DEPLOY_WITHOUT_BACKUP=true is active");
  });

  it("bypasses deploy backup lookup and returns explicit safety evidence", async () => {
    const { assertRecentVerifiedBackupForDangerousWrite } = await import("../server/src/services/writeSafety.service");

    const snapshot = await assertRecentVerifiedBackupForDangerousWrite({
      siteId,
      operation: "deploy",
      now: new Date("2026-06-16T08:00:00.000Z")
    });

    expect(mocks.SiteBackup.findOne).not.toHaveBeenCalled();
    expect(snapshot).toMatchObject({
      policy: "dangerous-env-backup-bypass",
      operation: "deploy",
      required: false,
      satisfied: true,
      checkedAt: "2026-06-16T08:00:00.000Z",
      bypassEnvVar: "HUB_DANGEROUS_ALLOW_DEPLOY_WITHOUT_BACKUP"
    });
  });

  it("bypasses the distinct pre-restore backup lookup when restore bypass env is active", async () => {
    const { assertDistinctRecentVerifiedBackupForRestore } = await import("../server/src/services/writeSafety.service");

    const snapshot = await assertDistinctRecentVerifiedBackupForRestore({
      siteId,
      restoreBackupObjectId: restoreBackupId,
      restoreBackupExternalId: "backup-being-restored",
      now: new Date("2026-06-16T08:00:00.000Z")
    });

    expect(mocks.SiteBackup.findOne).not.toHaveBeenCalled();
    expect(snapshot).toMatchObject({
      policy: "dangerous-env-backup-bypass",
      operation: "restore",
      required: false,
      satisfied: true,
      checkedAt: "2026-06-16T08:00:00.000Z",
      bypassEnvVar: "HUB_DANGEROUS_ALLOW_RESTORE_WITHOUT_BACKUP"
    });
  });
});
