import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  Site: {
    findById: vi.fn()
  },
  SiteAdminSnapshot: {
    create: vi.fn()
  },
  createJob: vi.fn(),
  setJobEvidence: vi.fn(),
  setJobFailed: vi.fn(),
  setJobResult: vi.fn(),
  setJobStatus: vi.fn(),
  setJobTargetPaths: vi.fn(),
  setJobSucceeded: vi.fn(),
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
vi.mock("../server/src/services/jobs.service", () => ({
  createJob: mocks.createJob,
  setJobEvidence: mocks.setJobEvidence,
  setJobFailed: mocks.setJobFailed,
  setJobResult: mocks.setJobResult,
  setJobStatus: mocks.setJobStatus,
  setJobTargetPaths: mocks.setJobTargetPaths,
  setJobSucceeded: mocks.setJobSucceeded
}));
vi.mock("../server/src/utils/logger", () => ({ logger: mocks.logger }));

const idOf = (value: string) => ({ toString: () => value });

const usersTxtTargetPath = "/sites/alpha/siteDB/siteAssets/users_data.txt";

const txtAdmin = {
  displayName: "Alice Admin",
  personalNumber: "s1111111",
  email: "alice@example.test",
  loginName: "i:0#.f|membership|alice@example.test"
};

const siteCollectionOnlyAdmin = {
  displayName: "Bob Site Collection",
  personalNumber: "s2222222",
  email: "bob@example.test",
  loginName: "i:0#.f|membership|bob@example.test"
};

const makeSite = () => ({
  _id: idOf("site-1"),
  siteCode: "alpha",
  displayName: "Alpha",
  storageBackend: "txt",
  sharePointHost: "portal.army.idf",
  sharePointSiteUrl: "https://portal.army.idf/sites/alpha",
  siteDbLibrary: "siteDB",
  usersDbLibrary: "siteUsersDb",
  txtAdmins: [txtAdmin],
  siteCollectionAdmins: [txtAdmin, siteCollectionOnlyAdmin],
  ownersGroupAdmins: [],
  adminSourceStatus: [],
  save: vi.fn()
});

beforeEach(() => {
  vi.resetModules();
  Object.values(mocks).forEach((group) => {
    if (vi.isMockFunction(group)) {
      group.mockReset();
      return;
    }
    Object.values(group as Record<string, unknown>).forEach((value) => {
      if (vi.isMockFunction(value)) value.mockReset();
    });
  });
  mocks.Site.findById.mockResolvedValue(makeSite());
  mocks.createJob.mockImplementation(async (input) => ({
    _id: idOf("job-1"),
    ...input,
    status: "browser-required",
    requiresApproval: false
  }));
  mocks.SiteAdminSnapshot.create.mockImplementation(async (input) => ({
    _id: idOf("snapshot-1"),
    ...input
  }));
});

describe("admin TXT repair browser flow", () => {
  it("builds a TXT repair plan from stored browser evidence and metadata", async () => {
    const { buildAdminTxtRepairPlan } = await import("../server/src/services/admins.service");

    const plan = await buildAdminTxtRepairPlan("site-1", { capturedBy: "operator" });

    expect(plan).toMatchObject({
      operation: "admin-txt-repair",
      siteId: "site-1",
      targetPath: usersTxtTargetPath,
      missingInTxt: expect.arrayContaining(["login:i:0#.f|membership|bob@example.test"]),
      summary: expect.objectContaining({
        readyForRepair: true,
        missingInTxtCount: 1
      })
    });
  });

  it("queues TXT repair as browser-required without SharePoint server writes", async () => {
    const { enqueueAdminTxtRepair } = await import("../server/src/services/admins.service");

    const result = await enqueueAdminTxtRepair({
      siteId: "site-1",
      createdBy: "operator",
      reason: "Repair missing admins"
    });

    expect(result).toMatchObject({
      approvalStatus: "browser-required",
      plan: expect.objectContaining({ targetPath: usersTxtTargetPath })
    });
    expect(mocks.createJob).toHaveBeenCalledWith(expect.objectContaining({
      type: "repair",
      executionMode: "browser-required",
      connectorMode: "browser-sharepoint",
      operationPolicy: "admin-txt-repair",
      payload: expect.objectContaining({
        browserOperationPlan: expect.objectContaining({ operation: "admin-txt-repair" })
      })
    }));
  });

  it("records browser TXT repair evidence, updates the site snapshot, and completes the job", async () => {
    const site = makeSite();
    mocks.Site.findById.mockResolvedValue(site);
    const { recordBrowserAdminTxtRepairEvidence } = await import("../server/src/services/admins.service");

    const result = await recordBrowserAdminTxtRepairEvidence({
      siteId: "site-1",
      actor: "operator",
      input: {
        connectorMode: "browser-sharepoint",
        jobId: "64f000000000000000000001",
        targetSiteUrl: "https://portal.army.idf/sites/alpha",
        targetPath: usersTxtTargetPath,
        mergedTxtAdmins: [txtAdmin, siteCollectionOnlyAdmin],
        repairEvidence: {
          relativePath: "users_data.txt",
          sourcePath: `browser-admin-txt-repair:${usersTxtTargetPath}`,
          targetPath: usersTxtTargetPath,
          status: "verified",
          checkedAt: "2026-06-30T10:00:00.000Z",
          expectedSizeBytes: 100,
          actualSizeBytes: 100,
          expectedSha256: "abc",
          actualSha256: "abc",
          sizeMatches: true,
          sha256Matches: true
        },
        finalStatus: "success"
      }
    });

    expect(site.txtAdmins).toHaveLength(2);
    expect(site.save).toHaveBeenCalled();
    expect(mocks.SiteAdminSnapshot.create).toHaveBeenCalledWith(expect.objectContaining({
      connectorMode: "browser-sharepoint",
      targetSiteUrl: "https://portal.army.idf/sites/alpha",
      txtAdmins: expect.arrayContaining([expect.objectContaining({ personalNumber: "s2222222" })])
    }));
    expect(mocks.setJobSucceeded).toHaveBeenCalledWith("64f000000000000000000001", "Browser admin TXT repair completed and verified");
    expect(result.summary).toMatchObject({ status: "succeeded", snapshotId: "snapshot-1" });
  });

  it("does not allow direct SharePoint membership writes from the server", async () => {
    const { addSiteAdmin, removeSiteAdmin } = await import("../server/src/services/admins.service");

    await expect(addSiteAdmin({
      siteId: "site-1",
      admin: { ...siteCollectionOnlyAdmin, source: "siteCollection" }
    })).rejects.toThrow("browser-sharepoint-required");

    await expect(removeSiteAdmin({
      siteId: "site-1",
      adminId: "s2222222",
      source: "ownersGroup"
    })).rejects.toThrow("browser-sharepoint-required");
  });
});
