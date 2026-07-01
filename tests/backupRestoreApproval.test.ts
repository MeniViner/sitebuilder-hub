import { beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeError } from "../server/src/utils/errors";

const mocks = vi.hoisted(() => ({
  Site: {
    findById: vi.fn()
  },
  SiteBackup: {
    findById: vi.fn(),
    findOne: vi.fn()
  },
  createJob: vi.fn(),
  setJobEvidence: vi.fn(),
  setJobFailed: vi.fn(),
  setJobResult: vi.fn(),
  setJobStatus: vi.fn(),
  setJobTargetPaths: vi.fn(),
  setJobSucceeded: vi.fn(),
  assertSharePointWriteAvailable: vi.fn(),
  assertRecentVerifiedBackupForDangerousWrite: vi.fn(),
  assertDistinctRecentVerifiedBackupForRestore: vi.fn(),
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
  setJobEvidence: mocks.setJobEvidence,
  setJobFailed: mocks.setJobFailed,
  setJobResult: mocks.setJobResult,
  setJobStatus: mocks.setJobStatus,
  setJobTargetPaths: mocks.setJobTargetPaths,
  setJobSucceeded: mocks.setJobSucceeded
}));
vi.mock("../server/src/services/sharepointOperationClient", () => ({
  assertSharePointWriteAvailable: mocks.assertSharePointWriteAvailable
}));
vi.mock("../server/src/services/writeSafety.service", () => ({
  assertRecentVerifiedBackupForDangerousWrite: mocks.assertRecentVerifiedBackupForDangerousWrite,
  assertDistinctRecentVerifiedBackupForRestore: mocks.assertDistinctRecentVerifiedBackupForRestore
}));
vi.mock("../server/src/utils/logger", () => ({ logger: mocks.logger }));

const idOf = (value: string) => ({ toString: () => value });

const backupObjectId = "64f000000000000000000010";
const jobObjectId = "64f000000000000000000011";

const restoreFiles = [
  {
    sourcePath: "/sites/alpha/siteDB/siteAssets/Backups/backup-2026-05-14/users_data.txt",
    targetPath: "/sites/alpha/siteDB/siteAssets/users_data.txt",
    expectedSizeBytes: 128,
    expectedSha256: "users-sha"
  },
  {
    sourcePath: "/sites/alpha/siteDB/siteAssets/Backups/backup-2026-05-14/theme_data.txt",
    targetPath: "/sites/alpha/siteDB/siteAssets/theme_data.txt",
    expectedSizeBytes: 64,
    expectedSha256: "theme-sha"
  }
];

const makeSite = () => ({
  _id: idOf("site-1"),
  siteCode: "alpha",
  displayName: "Alpha Site",
  sharePointHost: "portal.army.idf",
  sharePointSiteUrl: "https://portal.army.idf/sites/alpha",
  siteDbLibrary: "siteDB",
  usersDbLibrary: "siteUsersDb",
  bootstrapLibrary: "SiteAssets",
  bootstrapFolder: "sitebuilder-bootstrap",
  widgetsDbTarget: "users",
  lastError: "",
  save: vi.fn().mockResolvedValue(undefined)
});

const makeBackup = () => ({
  _id: idOf(backupObjectId),
  siteId: "site-1",
  backupId: "backup-2026-05-14",
  status: "verified",
  restoreStatus: "idle",
  storagePath: "/sites/alpha/siteDB/siteAssets/Backups/backup-2026-05-14",
  verification: {
    status: "verified",
    evidence: [
      {
        sourcePath: restoreFiles[0].targetPath,
        targetPath: restoreFiles[0].sourcePath,
        expectedBackupSizeBytes: restoreFiles[0].expectedSizeBytes,
        expectedBackupSha256: restoreFiles[0].expectedSha256
      },
      {
        sourcePath: restoreFiles[1].targetPath,
        targetPath: restoreFiles[1].sourcePath,
        backupSizeBytes: restoreFiles[1].expectedSizeBytes,
        backupSha256: restoreFiles[1].expectedSha256
      }
    ]
  },
  save: vi.fn().mockResolvedValue(undefined)
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
  mocks.logger.isPayloadLoggingEnabled.mockReturnValue(false);
  mocks.Site.findById.mockResolvedValue(makeSite());
  mocks.SiteBackup.findById.mockResolvedValue(makeBackup());
  mocks.SiteBackup.findOne.mockResolvedValue(makeBackup());
  mocks.createJob.mockImplementation(async (input) => ({
    _id: idOf(jobObjectId),
    ...input,
    status: "browser-required"
  }));
});

describe("backup restore browser flow", () => {
  it("queues restore jobs as browser-required with a browser restore plan", async () => {
    const { enqueueBackupRestore } = await import("../server/src/services/backups.service");
    const result = await enqueueBackupRestore({
      backupId: backupObjectId,
      createdBy: "operator",
      notes: "restore after deploy",
      connectorMode: "browser-sharepoint"
    });

    expect(mocks.assertSharePointWriteAvailable).not.toHaveBeenCalled();
    expect(mocks.assertRecentVerifiedBackupForDangerousWrite).not.toHaveBeenCalled();
    expect(mocks.assertDistinctRecentVerifiedBackupForRestore).not.toHaveBeenCalled();
    expect(mocks.createJob).toHaveBeenCalledWith(expect.objectContaining({
      type: "restore",
      siteId: "site-1",
      createdBy: "operator",
      executionMode: "browser-required",
      connectorMode: "browser-sharepoint",
      operationPolicy: "restore",
      payload: expect.objectContaining({
        connectorMode: "browser-sharepoint",
        executionMode: "browser-required",
        browserOperationPlan: expect.objectContaining({
          operation: "restore",
          connectorMode: "browser-sharepoint",
          executionMode: "browser-required",
          files: restoreFiles
        })
      })
    }));
    expect(result).toMatchObject({
      connectorMode: "browser-sharepoint",
      executionMode: "browser-required",
      browserOperationPlan: expect.objectContaining({
        operation: "restore",
        files: restoreFiles
      })
    });
    expect(result.backup.restoreStatus).toBe("running");
    expect(result.backup.save).toHaveBeenCalled();
  });

  it("records browser restore evidence and completes the restore job", async () => {
    const site = makeSite();
    const backup = makeBackup();
    mocks.Site.findById.mockResolvedValue(site);
    mocks.SiteBackup.findById.mockResolvedValue(backup);

    const { recordBrowserSharePointRestoreEvidence } = await import("../server/src/services/backups.service");
    const result = await recordBrowserSharePointRestoreEvidence({
      backupId: backupObjectId,
      actor: "operator",
      input: {
        connectorMode: "browser-sharepoint",
        jobId: jobObjectId,
        targetSiteUrl: "https://portal.army.idf/sites/alpha",
        finalStatus: "success",
        restoreEvidence: restoreFiles.map((file) => ({
          backupPath: file.sourcePath,
          sourcePath: file.sourcePath,
          targetPath: file.targetPath,
          status: "verified",
          expectedRestoreSizeBytes: file.expectedSizeBytes,
          restoredSizeBytes: file.expectedSizeBytes,
          expectedRestoreSha256: file.expectedSha256,
          restoredSha256: file.expectedSha256,
          sizeMatches: true,
          sha256Matches: true
        }))
      }
    });

    expect(result.summary).toMatchObject({
      connectorMode: "browser-sharepoint",
      finalStatus: "verified",
      filesCount: 2,
      verifiedFilesCount: 2,
      failedFilesCount: 0
    });
    expect(backup.restoreStatus).toBe("verified");
    expect(backup.save).toHaveBeenCalled();
    expect(site.lastError).toBe("");
    expect(site.save).toHaveBeenCalled();
    expect(mocks.setJobStatus).toHaveBeenCalledWith(jobObjectId, "browser-in-progress", expect.objectContaining({
      message: "Browser SharePoint restore evidence received"
    }));
    expect(mocks.setJobTargetPaths).toHaveBeenCalledWith(
      jobObjectId,
      restoreFiles.map((file) => file.targetPath),
      "Browser restore target paths recorded"
    );
    expect(mocks.setJobEvidence).toHaveBeenCalledWith(
      jobObjectId,
      expect.arrayContaining([
        expect.objectContaining({ backupPath: restoreFiles[0].sourcePath, sourcePath: restoreFiles[0].targetPath, targetPath: restoreFiles[0].targetPath, status: "verified" })
      ]),
      "Browser restore per-file evidence recorded"
    );
    expect(mocks.setJobSucceeded).toHaveBeenCalledWith(jobObjectId, "Browser SharePoint restore completed and verified");
  });
});

describe("restore-specific error normalization", () => {
  it.each([
    ["backup-restore-evidence-missing", "BACKUP_RESTORE_EVIDENCE_MISSING"],
    ["backup-restore-evidence-incomplete", "BACKUP_RESTORE_EVIDENCE_INCOMPLETE"],
    ["restore-backup-site-mismatch", "RESTORE_BACKUP_SITE_MISMATCH"],
    ["restore-job-requires-approval", "RESTORE_JOB_REQUIRES_APPROVAL"],
    ["restore-unsupported-storage-provider:local", "RESTORE_UNSUPPORTED_STORAGE_PROVIDER"],
    ["restore-backup-file-verification-failed:/backups/users_data.txt", "RESTORE_BACKUP_FILE_VERIFICATION_FAILED"],
    ["restore-target-verification-failed:/live/users_data.txt", "RESTORE_TARGET_VERIFICATION_FAILED"],
    ["browser-sharepoint-required", "BROWSER_SHAREPOINT_REQUIRED"]
  ])("maps %s to a restore conflict", (message, code) => {
    expect(normalizeError(new Error(message))).toMatchObject({
      code,
      status: 409
    });
  });
});
