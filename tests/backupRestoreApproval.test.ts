import { beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeError } from "../server/src/utils/errors";

const mocks = vi.hoisted(() => ({
  Site: {
    find: vi.fn(),
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn()
  },
  SiteBackup: {
    find: vi.fn(),
    findById: vi.fn()
  },
  Job: {
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findOneAndUpdate: vi.fn()
  },
  Release: {
    findById: vi.fn()
  },
  SiteVersionDeployment: {
    findByIdAndUpdate: vi.fn()
  },
  createJob: vi.fn(),
  claimNextJob: vi.fn(),
  setJobEvidence: vi.fn(),
  setJobFailed: vi.fn(),
  setJobProgress: vi.fn(),
  setJobResult: vi.fn(),
  setJobStatus: vi.fn(),
  setJobTargetPaths: vi.fn(),
  setJobSucceeded: vi.fn(),
  executeSharePointBackup: vi.fn(),
  executeSharePointRestore: vi.fn(),
  executeSiteBootstrap: vi.fn(),
  executeSiteProvisioning: vi.fn(),
  executeSharePointDeploy: vi.fn(),
  readLiveAdminSources: vi.fn(),
  executePermissionsSetup: vi.fn(),
  assertSharePointWriteAvailable: vi.fn(),
  readSharePointFileEvidence: vi.fn(),
  getCanonicalBackupSourcePaths: vi.fn(),
  assertRecentVerifiedBackupForDangerousWrite: vi.fn(),
  assertDistinctRecentVerifiedBackupForRestore: vi.fn(),
  writeSystemAuditLog: vi.fn(),
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
vi.mock("../server/src/models/Job", () => ({ Job: mocks.Job }));
vi.mock("../server/src/models/Release", () => ({ Release: mocks.Release }));
vi.mock("../server/src/models/SiteVersionDeployment", () => ({
  SiteVersionDeployment: mocks.SiteVersionDeployment
}));
vi.mock("../server/src/services/jobs.service", () => ({
  createJob: mocks.createJob,
  claimNextJob: mocks.claimNextJob,
  setJobEvidence: mocks.setJobEvidence,
  setJobFailed: mocks.setJobFailed,
  setJobProgress: mocks.setJobProgress,
  setJobResult: mocks.setJobResult,
  setJobStatus: mocks.setJobStatus,
  setJobTargetPaths: mocks.setJobTargetPaths,
  setJobSucceeded: mocks.setJobSucceeded
}));
vi.mock("../server/src/services/realBackup.service", () => ({
  executeSharePointBackup: mocks.executeSharePointBackup,
  executeSharePointRestore: mocks.executeSharePointRestore
}));
vi.mock("../server/src/services/siteBootstrap.service", () => ({
  executeSiteBootstrap: mocks.executeSiteBootstrap
}));
vi.mock("../server/src/services/siteProvisioning.service", () => ({
  executeSiteProvisioning: mocks.executeSiteProvisioning
}));
vi.mock("../server/src/services/deployArtifact.service", () => ({
  executeSharePointDeploy: mocks.executeSharePointDeploy
}));
vi.mock("../server/src/services/liveAdminSources.service", () => ({
  readLiveAdminSources: mocks.readLiveAdminSources
}));
vi.mock("../server/src/services/permissionsSetup.service", () => ({
  executePermissionsSetup: mocks.executePermissionsSetup
}));
vi.mock("../server/src/services/sharepointOperationClient", () => ({
  assertSharePointWriteAvailable: mocks.assertSharePointWriteAvailable,
  readSharePointFileEvidence: mocks.readSharePointFileEvidence
}));
vi.mock("../server/src/services/backupPlan.service", () => ({
  getCanonicalBackupSourcePaths: mocks.getCanonicalBackupSourcePaths
}));
vi.mock("../server/src/services/writeSafety.service", () => ({
  assertRecentVerifiedBackupForDangerousWrite: mocks.assertRecentVerifiedBackupForDangerousWrite,
  assertDistinctRecentVerifiedBackupForRestore: mocks.assertDistinctRecentVerifiedBackupForRestore
}));
vi.mock("../server/src/services/audit.service", () => ({
  writeSystemAuditLog: mocks.writeSystemAuditLog
}));
vi.mock("../server/src/utils/logger", () => ({ logger: mocks.logger }));
vi.mock("../server/src/config/env", () => ({
  env: {
    JOB_WORKER_ENABLED: false,
    JOB_WORKER_POLL_MS: 3000
  }
}));

const restoreMessage = "Restore job is awaiting approval before backup files overwrite live SharePoint files.";

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

const idOf = (value: string) => ({ toString: () => value });

const makeBackupSafetySnapshot = (
  operation: "deploy" | "rollback" | "restore",
  overrides: Record<string, unknown> = {}
) => {
  const backupOverrides = (overrides.backup || {}) as Record<string, unknown>;
  const { backup: _backup, ...snapshotOverrides } = overrides;
  return {
    policy: "recent-verified-backup",
    operation,
    required: true,
    satisfied: true,
    maxAgeHours: 24,
    checkedAt: "2026-05-14T00:00:00.000Z",
    backup: {
      id: "current-state-backup-object-2",
      backupId: "pre-restore-current-state-2026-05-14",
      status: "verified",
      verificationStatus: "verified",
      storagePath: "/sites/alpha/siteDB/siteAssets/Backups/pre-restore-current-state-2026-05-14",
      filesCount: 2,
      sizeBytes: 192,
      createdAt: "2026-05-14T00:00:00.000Z",
      verificationCheckedAt: "2026-05-14T00:00:00.000Z",
      ageHours: 1,
      ...backupOverrides
    },
    ...snapshotOverrides
  };
};

const makePreRestoreBackupSafetySnapshot = (overrides: Record<string, unknown> = {}) =>
  makeBackupSafetySnapshot("restore", {
    policy: "pre-restore-current-state-backup",
    restoreBackup: {
      id: "backup-object-1",
      backupId: "backup-2026-05-14"
    },
    ...overrides
  });

beforeEach(() => {
  mocks.Site.find.mockReset();
  mocks.Site.findById.mockReset();
  mocks.Site.findByIdAndUpdate.mockReset();
  mocks.SiteBackup.find.mockReset();
  mocks.SiteBackup.findById.mockReset();
  mocks.Job.findById.mockReset();
  mocks.Job.findByIdAndUpdate.mockReset();
  mocks.Job.findOneAndUpdate.mockReset();
  mocks.createJob.mockReset();
  mocks.claimNextJob.mockReset();
  mocks.setJobEvidence.mockReset();
  mocks.setJobFailed.mockReset();
  mocks.setJobProgress.mockReset();
  mocks.setJobResult.mockReset();
  mocks.setJobStatus.mockReset();
  mocks.setJobTargetPaths.mockReset();
  mocks.setJobSucceeded.mockReset();
  mocks.executeSharePointBackup.mockReset();
  mocks.executeSharePointRestore.mockReset();
  mocks.executeSiteBootstrap.mockReset();
  mocks.executeSiteProvisioning.mockReset();
  mocks.executeSharePointDeploy.mockReset();
  mocks.readLiveAdminSources.mockReset();
  mocks.executePermissionsSetup.mockReset();
  mocks.assertSharePointWriteAvailable.mockReset();
  mocks.readSharePointFileEvidence.mockReset();
  mocks.getCanonicalBackupSourcePaths.mockReset();
  mocks.assertRecentVerifiedBackupForDangerousWrite.mockReset();
  mocks.assertRecentVerifiedBackupForDangerousWrite.mockResolvedValue(makeBackupSafetySnapshot("restore"));
  mocks.assertDistinctRecentVerifiedBackupForRestore.mockReset();
  mocks.assertDistinctRecentVerifiedBackupForRestore.mockResolvedValue(makePreRestoreBackupSafetySnapshot());
  mocks.writeSystemAuditLog.mockReset();
  mocks.logger.isPayloadLoggingEnabled.mockReturnValue(false);
});

describe("backup restore approval gating", () => {
  it("queues restore jobs with approval metadata and restore file payload", async () => {
    const site = {
      _id: "site-1",
      siteCode: "alpha",
      displayName: "Alpha Site",
      sharePointSiteUrl: "https://portal.army.idf/sites/alpha"
    };
    const backup = {
      _id: "backup-object-1",
      siteId: site._id,
      backupId: "backup-2026-05-14",
      status: "verified",
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
      }
    };
    const job = {
      _id: { toString: () => "job-restore-1" },
      status: "awaiting-approval"
    };
    mocks.SiteBackup.findById.mockResolvedValue(backup);
    mocks.Site.findById.mockResolvedValue(site);
    mocks.createJob.mockResolvedValue(job);

    const { enqueueBackupRestore } = await import("../server/src/services/backups.service");
    const result = await enqueueBackupRestore({
      backupId: backup._id,
      createdBy: "operator",
      notes: "restore after deploy"
    });

    expect(mocks.assertSharePointWriteAvailable).toHaveBeenCalledTimes(1);
    expect(mocks.assertRecentVerifiedBackupForDangerousWrite).toHaveBeenCalledWith({
      siteId: site._id,
      operation: "restore"
    });
    expect(mocks.assertDistinctRecentVerifiedBackupForRestore).toHaveBeenCalledWith({
      siteId: site._id,
      restoreBackupObjectId: backup._id,
      restoreBackupExternalId: backup.backupId
    });
    expect(mocks.createJob).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "restore",
        siteId: site._id,
        createdBy: "operator",
        requiresApproval: true,
        payload: expect.objectContaining({
          backupId: backup._id,
          backupExternalId: backup.backupId,
          files: restoreFiles,
          notes: "restore after deploy",
          preRestoreBackupId: "current-state-backup-object-2",
          preRestoreBackupExternalId: "pre-restore-current-state-2026-05-14"
        })
      })
    );

    const jobInput = mocks.createJob.mock.calls[0][0];
    expect(jobInput.approvalSummary).toMatchObject({
      title: "Restore Alpha Site from backup-2026-05-14",
      message: restoreMessage,
      operation: "restore",
      backupId: backup._id,
      backupExternalId: backup.backupId,
      siteId: site._id,
      siteCode: site.siteCode,
      fileCount: restoreFiles.length,
      requestedBy: "operator",
      notes: "restore after deploy"
    });
    expect(jobInput.approvalSummary).toMatchObject({
      preRestoreBackupId: "current-state-backup-object-2",
      preRestoreBackupExternalId: "pre-restore-current-state-2026-05-14"
    });
    expect(jobInput.approvalSnapshot).toMatchObject({
      operation: "restore",
      backupId: backup._id,
      backupExternalId: backup.backupId,
      backupStatus: "verified",
      backupStoragePath: backup.storagePath,
      backupVerificationStatus: "verified",
      site: {
        id: site._id,
        siteCode: site.siteCode,
        displayName: site.displayName,
        sharePointSiteUrl: site.sharePointSiteUrl
      },
      files: restoreFiles,
      preRestoreBackupSafety: {
        policy: "pre-restore-current-state-backup",
        operation: "restore",
        required: true,
        satisfied: true,
        backup: expect.objectContaining({
          id: "current-state-backup-object-2",
          backupId: "pre-restore-current-state-2026-05-14",
          verificationStatus: "verified"
        })
      },
      requestedBy: "operator",
      notes: "restore after deploy"
    });
    expect(jobInput.approvalSnapshot.risks).toContain("Restore overwrites live SharePoint files at the target paths.");
    expect(jobInput.approvalSnapshot.preRestoreBackupSafety.backup.id).not.toBe(jobInput.approvalSnapshot.backupId);

    expect(result).toMatchObject({
      job,
      backupId: backup._id,
      backupExternalId: backup.backupId,
      siteId: site._id,
      siteCode: site.siteCode,
      files: restoreFiles,
      requiresApproval: true,
      approvalStatus: "pending",
      message: restoreMessage
    });
    expect(result.pathSummary).toEqual({
      fileCount: restoreFiles.length,
      backupSourcePaths: {
        count: restoreFiles.length,
        sample: restoreFiles.map((file) => file.sourcePath)
      },
      liveTargetPaths: {
        count: restoreFiles.length,
        sample: restoreFiles.map((file) => file.targetPath)
      }
    });
  });

  it("rejects restore queue before creating a job when no recent verified backup exists", async () => {
    const site = {
      _id: "site-1",
      siteCode: "alpha",
      displayName: "Alpha Site",
      sharePointSiteUrl: "https://portal.army.idf/sites/alpha"
    };
    const backup = {
      _id: "backup-object-1",
      siteId: site._id,
      backupId: "backup-2026-05-14",
      status: "verified",
      storagePath: "/sites/alpha/siteDB/siteAssets/Backups/backup-2026-05-14",
      verification: {
        status: "verified",
        evidence: [
          {
            sourcePath: restoreFiles[0].targetPath,
            targetPath: restoreFiles[0].sourcePath,
            expectedBackupSizeBytes: restoreFiles[0].expectedSizeBytes,
            expectedBackupSha256: restoreFiles[0].expectedSha256
          }
        ]
      }
    };
    mocks.SiteBackup.findById.mockResolvedValue(backup);
    mocks.Site.findById.mockResolvedValue(site);
    mocks.assertRecentVerifiedBackupForDangerousWrite.mockRejectedValue(
      new Error("dangerous-write-backup-required:restore")
    );

    const { enqueueBackupRestore } = await import("../server/src/services/backups.service");

    await expect(
      enqueueBackupRestore({
        backupId: backup._id,
        createdBy: "operator",
        notes: "restore after deploy"
      })
    ).rejects.toThrow("dangerous-write-backup-required:restore");

    expect(mocks.assertRecentVerifiedBackupForDangerousWrite).toHaveBeenCalledWith({
      siteId: site._id,
      operation: "restore"
    });
    expect(mocks.createJob).not.toHaveBeenCalled();
  });

  it("rejects restore queue when the only verified backup is the backup being restored", async () => {
    const site = {
      _id: "site-1",
      siteCode: "alpha",
      displayName: "Alpha Site",
      sharePointSiteUrl: "https://portal.army.idf/sites/alpha"
    };
    const backup = {
      _id: "backup-object-1",
      siteId: site._id,
      backupId: "backup-2026-05-14",
      status: "verified",
      storagePath: "/sites/alpha/siteDB/siteAssets/Backups/backup-2026-05-14",
      verification: {
        status: "verified",
        evidence: [
          {
            sourcePath: restoreFiles[0].targetPath,
            targetPath: restoreFiles[0].sourcePath,
            expectedBackupSizeBytes: restoreFiles[0].expectedSizeBytes,
            expectedBackupSha256: restoreFiles[0].expectedSha256
          }
        ]
      }
    };
    mocks.SiteBackup.findById.mockResolvedValue(backup);
    mocks.Site.findById.mockResolvedValue(site);
    mocks.assertDistinctRecentVerifiedBackupForRestore.mockRejectedValue(
      new Error("dangerous-write-backup-required:restore")
    );

    const { enqueueBackupRestore } = await import("../server/src/services/backups.service");

    await expect(
      enqueueBackupRestore({
        backupId: backup._id,
        createdBy: "operator",
        notes: "restore after deploy"
      })
    ).rejects.toThrow("dangerous-write-backup-required:restore");

    expect(mocks.assertDistinctRecentVerifiedBackupForRestore).toHaveBeenCalledWith({
      siteId: site._id,
      restoreBackupObjectId: backup._id,
      restoreBackupExternalId: backup.backupId
    });
    expect(mocks.createJob).not.toHaveBeenCalled();
  });

  it("keeps approval-gated restore reruns awaiting approval instead of executing restore", async () => {
    const job = {
      _id: { toString: () => "job-restore-1" },
      type: "restore",
      status: "failed",
      requiresApproval: true,
      createdBy: "operator",
      siteId: { toString: () => "site-1" }
    };
    const updatedJob = { ...job, status: "awaiting-approval" };
    mocks.Job.findById.mockResolvedValueOnce(job).mockResolvedValueOnce(updatedJob);
    mocks.Job.findByIdAndUpdate.mockResolvedValue(updatedJob);

    const { runJobNow } = await import("../server/src/services/jobs.worker");
    const result = await runJobNow("job-restore-1");

    expect(result).toBe(updatedJob);
    expect(mocks.Job.findByIdAndUpdate).toHaveBeenCalledWith(
      "job-restore-1",
      expect.objectContaining({
        $set: expect.objectContaining({
          status: "awaiting-approval",
          progressPercent: 0,
          approvalRequestedBy: "operator",
          approvedBy: "",
          rejectedBy: "",
          approvalDecisionReason: "",
          approvalResult: expect.objectContaining({
            decision: "rerun-requested",
            previousStatus: "failed"
          })
        }),
        $unset: expect.objectContaining({
          approvedAt: "",
          rejectedAt: ""
        }),
        $push: {
          logs: {
            level: "info",
            message: "Job rerun requested and is awaiting approval",
            at: expect.any(Date)
          }
        }
      })
    );
    expect(mocks.claimNextJob).not.toHaveBeenCalled();
    expect(mocks.executeSharePointRestore).not.toHaveBeenCalled();
  });

  it("blocks approved restore execution when the execution-time pre-restore backup check fails", async () => {
    const safetyError = "dangerous-write-backup-required:restore";
    const originalJob = {
      _id: idOf("rerun-request-1"),
      type: "restore",
      status: "failed",
      requiresApproval: false,
      createdBy: "operator",
      siteId: idOf("site-1")
    };
    const restoreJob = {
      _id: idOf("job-restore-1"),
      type: "restore",
      status: "queued",
      requiresApproval: true,
      approvedAt: new Date("2026-05-14T09:00:00.000Z"),
      approvedBy: "approver",
      createdBy: "operator",
      siteId: idOf("site-1"),
      payload: {
        backupId: "backup-object-1",
        backupExternalId: "backup-2026-05-14",
        files: restoreFiles
      }
    };
    const failedJob = { ...restoreJob, status: "failed", errorMessage: safetyError };

    mocks.Job.findById.mockResolvedValueOnce(originalJob).mockResolvedValueOnce(failedJob);
    mocks.Job.findByIdAndUpdate.mockResolvedValue({ ...originalJob, status: "queued" });
    mocks.claimNextJob.mockResolvedValue(restoreJob);
    mocks.setJobStatus.mockImplementation(async (_jobId, status) => ({ ...restoreJob, status }));
    mocks.setJobFailed.mockResolvedValue(failedJob);
    mocks.assertDistinctRecentVerifiedBackupForRestore.mockRejectedValueOnce(new Error(safetyError));
    mocks.writeSystemAuditLog.mockResolvedValue({ _id: idOf("audit-1") });

    const { runJobNow } = await import("../server/src/services/jobs.worker");
    const result = await runJobNow("rerun-request-1");

    expect(result).toBe(failedJob);
    expect(mocks.assertSharePointWriteAvailable).toHaveBeenCalledTimes(1);
    expect(mocks.assertDistinctRecentVerifiedBackupForRestore).toHaveBeenCalledWith({
      siteId: restoreJob.siteId,
      restoreBackupObjectId: "backup-object-1",
      restoreBackupExternalId: "backup-2026-05-14"
    });
    expect(mocks.executeSharePointRestore).not.toHaveBeenCalled();
    expect(mocks.setJobFailed).toHaveBeenCalledWith("job-restore-1", safetyError);
    expect(mocks.Site.findByIdAndUpdate).toHaveBeenCalledWith(restoreJob.siteId, { lastError: safetyError });
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
    ["restore-target-verification-failed:/live/users_data.txt", "RESTORE_TARGET_VERIFICATION_FAILED"]
  ])("maps %s to a 409 restore conflict", (message, code) => {
    expect(normalizeError(new Error(message))).toMatchObject({
      code,
      status: 409
    });
  });
});
