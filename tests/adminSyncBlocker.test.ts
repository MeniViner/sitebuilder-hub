import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  Site: {
    findById: vi.fn()
  },
  SiteAdminSnapshot: {
    findOne: vi.fn()
  },
  createJob: vi.fn(),
  assertSharePointWriteAvailable: vi.fn(),
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    isPayloadLoggingEnabled: vi.fn(() => false)
  }
}));

vi.mock("../server/src/models/Site", () => ({ Site: mocks.Site }));
vi.mock("../server/src/models/SiteAdminSnapshot", () => ({ SiteAdminSnapshot: mocks.SiteAdminSnapshot }));
vi.mock("../server/src/services/jobs.service", () => ({ createJob: mocks.createJob }));
vi.mock("../server/src/services/sharepointOperationClient", () => ({
  assertSharePointWriteAvailable: mocks.assertSharePointWriteAvailable,
  getRequestDigest: vi.fn(),
  writeSharePointTextFile: vi.fn(),
  ensureSharePointUser: vi.fn(),
  setSharePointSiteCollectionAdmin: vi.fn(),
  getAssociatedOwnerGroupId: vi.fn(),
  addSharePointUserToGroup: vi.fn(),
  removeSharePointUserFromGroup: vi.fn()
}));
vi.mock("../server/src/services/dangerousBackupBypass.service", () => ({
  getDangerousValidationBypassEnvVar: vi.fn(() => ""),
  isDangerousValidationBypassEnabled: vi.fn(() => false)
}));
vi.mock("../server/src/services/sharepointOperationPolicy.service", () => ({
  shouldBlockBackendSharePointByDefault: vi.fn(() => true)
}));
vi.mock("../server/src/utils/logger", () => ({ logger: mocks.logger }));

beforeEach(() => {
  vi.resetModules();
  mocks.Site.findById.mockReset();
  mocks.createJob.mockReset();
  mocks.assertSharePointWriteAvailable.mockReset();
});

describe("admin-sync backend blocker", () => {
  it("blocks legacy admin-sync before creating a backend SharePoint job", async () => {
    mocks.Site.findById.mockResolvedValue({
      _id: { toString: () => "site-1" },
      siteCode: "schedule"
    });

    const { enqueueAdminSync } = await import("../server/src/services/admins.service");

    await expect(enqueueAdminSync({
      siteId: "site-1",
      createdBy: "Owner",
      mode: "sync"
    })).rejects.toThrow("admin-sync-backend-service-auth-or-browser-required");

    expect(mocks.createJob).not.toHaveBeenCalled();
    expect(mocks.assertSharePointWriteAvailable).not.toHaveBeenCalled();
  });
});
