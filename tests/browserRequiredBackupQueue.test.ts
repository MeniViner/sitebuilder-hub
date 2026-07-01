import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  Site: {
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn()
  },
  SiteBackup: {
    create: vi.fn(),
    findById: vi.fn(),
    findOne: vi.fn()
  },
  createJob: vi.fn(),
  setJobStatus: vi.fn(),
  setJobTargetPaths: vi.fn(),
  setJobEvidence: vi.fn(),
  setJobResult: vi.fn(),
  setJobSucceeded: vi.fn(),
  setJobFailed: vi.fn(),
  assertSharePointWriteAvailable: vi.fn(),
  readSharePointFileEvidence: vi.fn(),
  getSharePointOperationCapabilities: vi.fn(),
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    isPayloadLoggingEnabled: vi.fn(() => false)
  }
}));

vi.mock("../server/src/models/Site", () => ({ Site: mocks.Site }));
vi.mock("../server/src/models/SiteBackup", () => ({ SiteBackup: mocks.SiteBackup }));
vi.mock("../server/src/services/jobs.service", () => ({
  createJob: mocks.createJob,
  setJobStatus: mocks.setJobStatus,
  setJobTargetPaths: mocks.setJobTargetPaths,
  setJobEvidence: mocks.setJobEvidence,
  setJobResult: mocks.setJobResult,
  setJobSucceeded: mocks.setJobSucceeded,
  setJobFailed: mocks.setJobFailed
}));
vi.mock("../server/src/services/sharepointOperationClient", () => ({
  assertSharePointWriteAvailable: mocks.assertSharePointWriteAvailable,
  readSharePointFileEvidence: mocks.readSharePointFileEvidence,
  getSharePointOperationCapabilities: mocks.getSharePointOperationCapabilities,
  getSharePointReadHeaders: vi.fn(() => ({})),
  listSharePointFiles: vi.fn(),
  listSharePointFolders: vi.fn()
}));
vi.mock("../server/src/services/writeSafety.service", () => ({
  assertRecentVerifiedBackupForDangerousWrite: vi.fn(),
  assertDistinctRecentVerifiedBackupForRestore: vi.fn()
}));
vi.mock("../server/src/utils/logger", () => ({ logger: mocks.logger }));

const idOf = (value: string) => ({ toString: () => value });

const makeSite = () => ({
  _id: idOf("site-1"),
  siteCode: "schedule",
  displayName: "Schedule",
  sharePointHost: "portal.army.idf",
  sharePointSiteUrl: "https://portal.army.idf/sites/schedule",
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
    status: input.executionMode === "browser-required" ? "browser-required" : "queued",
    requiresApproval: false
  }));
  mocks.getSharePointOperationCapabilities.mockReturnValue({
    writeAvailable: false,
    digest: { canRequest: false, reason: "backend-401" },
    reason: "backend-401"
  });
});

describe("browser-required backup queueing", () => {
  it("creates a browser-required backup job for user-triggered backup without backend write preflight", async () => {
    const { enqueueSiteBackup } = await import("../server/src/services/backups.service");

    const result = await enqueueSiteBackup({
      siteId: "site-1",
      createdBy: "owner"
    });

    expect(result).toMatchObject({
      connectorMode: "browser-sharepoint",
      executionMode: "browser-required",
      approvalStatus: "browser-required"
    });
    expect(result.browserOperationPlan).toMatchObject({
      operation: "backup",
      connectorMode: "browser-sharepoint",
      executionMode: "browser-required",
      siteId: "site-1",
      targetSiteUrl: "https://portal.army.idf/sites/schedule"
    });
    expect(mocks.createJob).toHaveBeenCalledWith(expect.objectContaining({
      type: "backup",
      executionMode: "browser-required",
      connectorMode: "browser-sharepoint",
      operationPolicy: "backup",
      payload: expect.objectContaining({
        connectorMode: "browser-sharepoint",
        executionMode: "browser-required",
        browserOperationPlan: expect.objectContaining({
          connectorMode: "browser-sharepoint"
        })
      })
    }));
    expect(mocks.assertSharePointWriteAvailable).not.toHaveBeenCalled();
  });

  it("marks scheduled backup as browser-required instead of trying backend SharePoint", async () => {
    const { enqueueSiteBackup } = await import("../server/src/services/backups.service");

    const result = await enqueueSiteBackup({
      siteId: "site-1",
      createdBy: "scheduler",
      executionContext: "scheduled"
    });

    expect(result).toMatchObject({
      connectorMode: "browser-sharepoint",
      executionMode: "browser-required",
      approvalStatus: "browser-required"
    });
    expect(mocks.createJob).toHaveBeenCalledWith(expect.objectContaining({
      type: "backup",
      executionMode: "browser-required",
      connectorMode: "browser-sharepoint",
      operationPolicy: "scheduled-backup",
      payload: expect.objectContaining({
        connectorMode: "browser-sharepoint",
        browserOperationPlan: expect.objectContaining({ operation: "backup" })
      })
    }));
    expect(mocks.assertSharePointWriteAvailable).not.toHaveBeenCalled();
  });

  it("queues restore as browser-required with restore file payload", async () => {
    const backup = {
      _id: idOf("backup-1"),
      siteId: idOf("site-1"),
      backupId: "backup-ext-1",
      status: "verified",
      filesCount: 1,
      verification: {
        status: "verified",
        evidence: [{
          sourcePath: "/sites/schedule/siteDB/siteAssets/users_data.txt",
          targetPath: "/sites/schedule/siteDB/siteAssets/Backups/backup-ext-1/users_data.txt",
          status: "verified",
          backupSizeBytes: 12,
          backupSha256: "abc"
        }]
      },
      save: vi.fn()
    };
    mocks.SiteBackup.findOne.mockResolvedValue(backup);
    const { enqueueBackupRestore } = await import("../server/src/services/backups.service");

    const result = await enqueueBackupRestore({
      backupId: "backup-1",
      createdBy: "owner"
    });

    expect(result).toMatchObject({
      connectorMode: "browser-sharepoint",
      executionMode: "browser-required",
      browserOperationPlan: expect.objectContaining({
        operation: "restore",
        files: [expect.objectContaining({
          sourcePath: "/sites/schedule/siteDB/siteAssets/Backups/backup-ext-1/users_data.txt",
          targetPath: "/sites/schedule/siteDB/siteAssets/users_data.txt"
        })]
      })
    });
    expect(mocks.createJob).toHaveBeenCalledWith(expect.objectContaining({
      type: "restore",
      executionMode: "browser-required",
      connectorMode: "browser-sharepoint"
    }));
    expect(mocks.assertSharePointWriteAvailable).not.toHaveBeenCalled();
  });
});
