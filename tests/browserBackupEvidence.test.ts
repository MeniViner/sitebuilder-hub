import crypto from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  Site: {
    findById: vi.fn()
  },
  SiteBackup: {
    create: vi.fn(),
    findById: vi.fn(),
    findOne: vi.fn()
  },
  assertSharePointWriteAvailable: vi.fn(),
  readSharePointFileEvidence: vi.fn(),
  createJob: vi.fn(),
  setJobStatus: vi.fn(),
  setJobTargetPaths: vi.fn(),
  setJobEvidence: vi.fn(),
  setJobResult: vi.fn(),
  setJobSucceeded: vi.fn(),
  setJobFailed: vi.fn(),
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
vi.mock("../server/src/services/sharepointOperationClient", () => ({
  assertSharePointWriteAvailable: mocks.assertSharePointWriteAvailable,
  readSharePointFileEvidence: mocks.readSharePointFileEvidence,
  getSharePointOperationCapabilities: vi.fn(() => ({
    writeAvailable: false,
    digest: { canRequest: false, reason: "backend-401" },
    reason: "backend-401"
  })),
  getSharePointReadHeaders: vi.fn(() => ({})),
  listSharePointFiles: vi.fn(),
  listSharePointFolders: vi.fn()
}));
vi.mock("../server/src/services/jobs.service", () => ({
  createJob: mocks.createJob,
  setJobStatus: mocks.setJobStatus,
  setJobTargetPaths: mocks.setJobTargetPaths,
  setJobEvidence: mocks.setJobEvidence,
  setJobResult: mocks.setJobResult,
  setJobSucceeded: mocks.setJobSucceeded,
  setJobFailed: mocks.setJobFailed
}));
vi.mock("../server/src/services/writeSafety.service", () => ({
  assertRecentVerifiedBackupForDangerousWrite: vi.fn(),
  assertDistinctRecentVerifiedBackupForRestore: vi.fn()
}));
vi.mock("../server/src/utils/logger", () => ({ logger: mocks.logger }));

const idOf = (value: string) => ({ toString: () => value });

const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

const makeSite = () => ({
  _id: idOf("site-1"),
  siteCode: "schedule",
  displayName: "Schedule",
  sharePointHost: "portal.army.idf",
  sharePointSiteUrl: "https://portal.army.idf/sites/schedule",
  backupCount: 0,
  backupStorageMb: 0,
  save: vi.fn().mockResolvedValue(undefined)
});

const fileNameFromPath = (path: string) => path.split("/").filter(Boolean).pop() || "unknown.txt";

async function buildVerifiedEvidence() {
  const { resolveSiteBuilderPaths } = await import("../server/src/utils/sitebuilderPaths");
  const { getCanonicalBackupSourcePaths } = await import("../server/src/services/backupPlan.service");
  const paths = resolveSiteBuilderPaths({
    siteCode: "schedule",
    sharePointHost: "portal.army.idf",
    sharePointSiteUrl: "https://portal.army.idf/sites/schedule"
  });
  const backupId = "backup-2026-06-16T09-00-00-000Z";
  const backupFolder = `${paths.backupsRoot}/${backupId}`;
  const evidence = getCanonicalBackupSourcePaths(paths).map((sourcePath) => {
    const text = fileNameFromPath(sourcePath);
    return {
      sourcePath,
      targetPath: `${backupFolder}/${fileNameFromPath(sourcePath)}`,
      status: "verified" as const,
      checkedAt: "2026-06-16T09:01:00.000Z",
      sourceSizeBytes: text.length,
      sourceSha256: sha256(text),
      expectedBackupSizeBytes: text.length,
      expectedBackupSha256: sha256(text),
      backupSizeBytes: text.length,
      backupSha256: sha256(text),
      sizeMatches: true,
      sha256Matches: true,
      httpStatus: 200
    };
  });
  return { paths, backupId, backupFolder, evidence };
}

beforeEach(() => {
  vi.resetModules();
  mocks.Site.findById.mockReset();
  mocks.SiteBackup.create.mockReset();
  mocks.SiteBackup.findById.mockReset();
  mocks.SiteBackup.findOne.mockReset();
  mocks.assertSharePointWriteAvailable.mockReset();
  mocks.readSharePointFileEvidence.mockReset();
  mocks.createJob.mockReset();
  mocks.setJobStatus.mockReset();
  mocks.setJobTargetPaths.mockReset();
  mocks.setJobEvidence.mockReset();
  mocks.setJobResult.mockReset();
  mocks.setJobSucceeded.mockReset();
  mocks.setJobFailed.mockReset();
  mocks.SiteBackup.create.mockImplementation(async (payload) => ({ _id: idOf("backup-object-1"), ...payload }));
});

describe("browser SharePoint backup evidence", () => {
  it("stores successful browser backup evidence without using backend SharePoint auth", async () => {
    const site = makeSite();
    mocks.Site.findById.mockResolvedValue(site);
    const { backupId, backupFolder, evidence } = await buildVerifiedEvidence();

    const { recordBrowserSharePointBackupEvidence } = await import("../server/src/services/backups.service");
    const result = await recordBrowserSharePointBackupEvidence({
      siteId: "site-1",
      actor: "s8856096",
      input: {
        connectorMode: "browser-sharepoint",
        targetSiteUrl: "https://portal.army.idf/sites/schedule",
        backupId,
        target: {
          backupsRoot: "/sites/schedule/siteDB/siteAssets/Backups",
          backupFolder
        },
        verificationEvidence: evidence,
        finalStatus: "success",
        completedAt: "2026-06-16T09:01:00.000Z"
      }
    });

    expect(result.summary).toMatchObject({
      connectorMode: "browser-sharepoint",
      finalStatus: "success",
      verifiedFilesCount: 9,
      failedFilesCount: 0,
      siteBackupUpdated: true
    });
    expect(mocks.SiteBackup.create).toHaveBeenCalledWith(expect.objectContaining({
      backupId,
      status: "verified",
      storagePath: backupFolder,
      filesCount: 9,
      createdBy: "s8856096",
      verification: expect.objectContaining({ status: "verified" })
    }));
    expect(site.backupStatus).toBe("succeeded");
    expect(site.lastBackupId).toBe(backupId);
    expect(site.save).toHaveBeenCalled();
    expect(mocks.assertSharePointWriteAvailable).not.toHaveBeenCalled();
    expect(mocks.readSharePointFileEvidence).not.toHaveBeenCalled();
  });

  it("rejects claimed success when browser evidence is missing a canonical source file", async () => {
    mocks.Site.findById.mockResolvedValue(makeSite());
    const { backupId, backupFolder, evidence } = await buildVerifiedEvidence();

    const { recordBrowserSharePointBackupEvidence } = await import("../server/src/services/backups.service");
    await expect(recordBrowserSharePointBackupEvidence({
      siteId: "site-1",
      actor: "s8856096",
      input: {
        connectorMode: "browser-sharepoint",
        backupId,
        target: {
          backupsRoot: "/sites/schedule/siteDB/siteAssets/Backups",
          backupFolder
        },
        verificationEvidence: evidence.slice(0, -1),
        finalStatus: "success"
      }
    })).rejects.toThrow("browser-backup-success-evidence-invalid");

    expect(mocks.SiteBackup.create).not.toHaveBeenCalled();
    expect(mocks.assertSharePointWriteAvailable).not.toHaveBeenCalled();
  });
});
