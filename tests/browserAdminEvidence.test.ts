import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  Site: {
    findById: vi.fn()
  },
  SiteAdminSnapshot: {
    create: vi.fn()
  },
  createJob: vi.fn(),
  sharePoint: {
    assertSharePointWriteAvailable: vi.fn(),
    getRequestDigest: vi.fn(),
    readSharePointJsonApi: vi.fn(),
    readSharePointTextFile: vi.fn(),
    writeSharePointTextFile: vi.fn(),
    ensureSharePointUser: vi.fn(),
    setSharePointSiteCollectionAdmin: vi.fn(),
    getAssociatedOwnerGroupId: vi.fn(),
    addSharePointUserToGroup: vi.fn(),
    removeSharePointUserFromGroup: vi.fn()
  },
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
vi.mock("../server/src/services/sharepointOperationClient", () => mocks.sharePoint);
vi.mock("../server/src/services/dangerousBackupBypass.service", () => ({
  getDangerousValidationBypassEnvVar: vi.fn(() => ""),
  isDangerousValidationBypassEnabled: vi.fn(() => false)
}));
vi.mock("../server/src/services/sharepointOperationPolicy.service", () => ({
  shouldBlockBackendSharePointByDefault: vi.fn(() => true)
}));
vi.mock("../server/src/utils/logger", () => ({ logger: mocks.logger }));

const idOf = (value: string) => ({ toString: () => value });

const makeSite = () => ({
  _id: idOf("site-1"),
  siteCode: "schedule",
  displayName: "Schedule",
  sharePointSiteUrl: "https://portal.army.idf/sites/schedule",
  txtAdmins: [{ displayName: "Old TXT", email: "old-txt@example.test" }],
  siteCollectionAdmins: [{ displayName: "Old SC", email: "old-sc@example.test" }],
  ownersGroupAdmins: [{ displayName: "Old Owner", email: "old-owner@example.test" }],
  save: vi.fn().mockResolvedValue(undefined)
});

beforeEach(() => {
  vi.resetModules();
  mocks.Site.findById.mockReset();
  mocks.SiteAdminSnapshot.create.mockReset();
  Object.values(mocks.sharePoint).forEach((mock) => mock.mockReset());
  mocks.SiteAdminSnapshot.create.mockImplementation(async (payload) => ({
    _id: idOf("snapshot-1"),
    ...payload
  }));
});

describe("browser admin live-read evidence persistence", () => {
  it("creates a SiteAdminSnapshot and updates site admin summary without backend SharePoint calls", async () => {
    const site = makeSite();
    mocks.Site.findById.mockResolvedValue(site);

    const { recordBrowserAdminLiveReadEvidence } = await import("../server/src/services/admins.service");
    const result = await recordBrowserAdminLiveReadEvidence({
      siteId: "site-1",
      actor: "Builder Owner",
      input: {
        connectorMode: "browser-sharepoint",
        targetSiteUrl: "https://portal.army.idf/sites/schedule",
        capturedAt: "2026-06-17T08:00:00.000Z",
        txtAdmins: [{ displayName: "Txt Admin", email: "txt@example.test" }],
        siteCollectionAdmins: [],
        ownersGroupAdmins: [{ displayName: "Owner Admin", email: "owner@example.test" }],
        sourceStatus: [
          { source: "txt", status: "success", ok: true, count: 1, httpStatus: 200, sourceUrl: "txt-url" },
          { source: "siteCollection", status: "failed", ok: false, httpStatus: 401, sourceUrl: "siteusers-url", errorMessage: "401" },
          { source: "ownersGroup", status: "success", ok: true, count: 1, httpStatus: 200, sourceUrl: "owners-url" }
        ],
        warnings: ["classified-smoke-not-run"],
        evidence: { safe: true }
      }
    });

    expect(mocks.SiteAdminSnapshot.create).toHaveBeenCalledWith(expect.objectContaining({
      connectorMode: "browser-sharepoint",
      targetSiteUrl: "https://portal.army.idf/sites/schedule",
      capturedBy: "Builder Owner",
      syncStatus: "failed",
      txtAdmins: [expect.objectContaining({ email: "txt@example.test" })],
      siteCollectionAdmins: [],
      ownersGroupAdmins: [expect.objectContaining({ email: "owner@example.test" })],
      sourceStatus: expect.arrayContaining([
        expect.objectContaining({ source: "siteCollection", status: "failed", ok: false, httpStatus: 401 })
      ])
    }));
    const snapshotPayload = mocks.SiteAdminSnapshot.create.mock.calls[0][0];
    const failedStatus = snapshotPayload.sourceStatus.find((source: any) => source.source === "siteCollection");
    expect(failedStatus.count).toBeUndefined();
    expect(site.siteCollectionAdmins).toEqual([{ displayName: "Old SC", email: "old-sc@example.test" }]);
    expect(site.adminSourceCounts.siteCollection).toBeNull();
    expect(site.lastAdminLiveReadSource).toBe("browser-sharepoint");
    expect(site.adminSyncStatus).toBe("failed");
    expect(site.save).toHaveBeenCalled();
    expect(result.summary.latestSnapshot._id.toString()).toBe("snapshot-1");
    expect(mocks.sharePoint.assertSharePointWriteAvailable).not.toHaveBeenCalled();
    expect(mocks.sharePoint.getRequestDigest).not.toHaveBeenCalled();
    expect(mocks.sharePoint.readSharePointJsonApi).not.toHaveBeenCalled();
    expect(mocks.sharePoint.readSharePointTextFile).not.toHaveBeenCalled();
  });
});
