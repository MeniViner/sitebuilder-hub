import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  Site: {
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn()
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
  getSharePointOperationPolicy: vi.fn(() => ({
    operation: "admin-sync",
    statusLabelHe: "מופעל דרך הדפדפן",
    blockerHe: "נדרש דפדפן"
  })),
  getBrowserRequiredJobMessage: vi.fn(() => "נדרש דפדפן")
}));
vi.mock("../server/src/utils/logger", () => ({ logger: mocks.logger }));

beforeEach(() => {
  vi.resetModules();
  mocks.Site.findById.mockReset();
  mocks.Site.findByIdAndUpdate.mockReset();
  mocks.createJob.mockReset();
  mocks.assertSharePointWriteAvailable.mockReset();
});

describe("admin-sync backend blocker", () => {
  it("creates a browser-required job instead of a backend SharePoint job", async () => {
    mocks.Site.findById.mockResolvedValue({
      _id: { toString: () => "site-1" },
      siteCode: "schedule",
      sharePointSiteUrl: "https://portal.army.idf/sites/schedule"
    });
    mocks.createJob.mockImplementation(async (input) => ({ _id: { toString: () => "job-1" }, ...input, status: "browser-required" }));

    const { enqueueAdminSync } = await import("../server/src/services/admins.service");

    const result = await enqueueAdminSync({
      siteId: "site-1",
      createdBy: "Owner",
      mode: "sync"
    });

    expect(result.job).toMatchObject({
      type: "admin-sync",
      executionMode: "browser-required",
      connectorMode: "browser-sharepoint"
    });
    expect(mocks.createJob).toHaveBeenCalledWith(expect.objectContaining({
      type: "admin-sync",
      executionMode: "browser-required",
      connectorMode: "browser-sharepoint",
      payload: expect.objectContaining({
        browserOperationPlan: expect.objectContaining({ operation: "admin-live-read" })
      })
    }));
    expect(mocks.assertSharePointWriteAvailable).not.toHaveBeenCalled();
  });
});
