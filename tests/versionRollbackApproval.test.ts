import { beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeError } from "../server/src/utils/errors";

const mocks = vi.hoisted(() => ({
  Site: {
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn()
  },
  Release: {
    findById: vi.fn()
  },
  SiteVersionDeployment: {
    create: vi.fn(),
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn()
  },
  Job: {
    findById: vi.fn(),
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
  assertReleaseArtifactReady: vi.fn(),
  buildSiteDeployPlan: vi.fn(),
  assertRecentVerifiedBackupForDangerousWrite: vi.fn(),
  readLiveAdminSources: vi.fn(),
  executePermissionsSetup: vi.fn(),
  assertSharePointWriteAvailable: vi.fn(),
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
vi.mock("../server/src/models/Release", () => ({ Release: mocks.Release }));
vi.mock("../server/src/models/SiteVersionDeployment", () => ({
  SiteVersionDeployment: mocks.SiteVersionDeployment
}));
vi.mock("../server/src/models/Job", () => ({ Job: mocks.Job }));
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
  executeSharePointDeploy: mocks.executeSharePointDeploy,
  assertReleaseArtifactReady: mocks.assertReleaseArtifactReady,
  buildSiteDeployPlan: mocks.buildSiteDeployPlan
}));
vi.mock("../server/src/services/writeSafety.service", () => ({
  assertRecentVerifiedBackupForDangerousWrite: mocks.assertRecentVerifiedBackupForDangerousWrite
}));
vi.mock("../server/src/services/liveAdminSources.service", () => ({
  readLiveAdminSources: mocks.readLiveAdminSources
}));
vi.mock("../server/src/services/permissionsSetup.service", () => ({
  executePermissionsSetup: mocks.executePermissionsSetup
}));
vi.mock("../server/src/services/sharepointOperationClient", () => ({
  assertSharePointWriteAvailable: mocks.assertSharePointWriteAvailable
}));
vi.mock("../server/src/services/audit.service", () => ({
  writeSystemAuditLog: mocks.writeSystemAuditLog
}));
vi.mock("../server/src/utils/logger", () => ({ logger: mocks.logger }));
vi.mock("../server/src/config/env", () => ({
  env: {
    NODE_ENV: "test",
    JOB_WORKER_ENABLED: false,
    JOB_WORKER_POLL_MS: 3000,
    HUB_LOCAL_DEV_DEPLOY_REQUIRES_BACKUP: false,
    HUB_PRODUCTION_DEPLOY_REQUIRES_BACKUP: true,
    HUB_PRODUCTION_DEPLOY_REQUIRES_APPROVAL: true,
    HUB_ADVANCED_APPROVALS_ENABLED: true
  },
  ownerDirectModeEnabled: () => false
}));

const rollbackMessage = "Rollback job requires approval because advanced approvals are enabled.";

const idOf = (value: string) => ({ toString: () => value });

const makeSite = (overrides: Record<string, unknown> = {}) => ({
  _id: idOf("site-1"),
  siteCode: "alpha",
  displayName: "Alpha Site",
  currentVersion: "1.2.3",
  version: "1.2.3",
  sharePointSiteUrl: "https://portal.army.idf/sites/alpha",
  sharePointStatus: { deployStatus: "idle" },
  save: vi.fn().mockResolvedValue(undefined),
  ...overrides
});

const makeRelease = (version: string, overrides: Record<string, unknown> = {}) => ({
  _id: idOf("release-1"),
  version,
  releaseType: "patch",
  artifactRef: `/artifacts/${version}`,
  ...overrides
});

const makeDeployment = (overrides: Record<string, unknown> = {}) => ({
  _id: idOf("deployment-1"),
  status: "queued",
  fromVersion: "1.2.3",
  toVersion: "1.1.0",
  deploymentKind: "rollback",
  rollbackReason: "bad deploy",
  ...overrides
});

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
      id: "backup-object-1",
      backupId: "backup-2026-05-14",
      status: "verified",
      verificationStatus: "verified",
      storagePath: "/sites/alpha/siteDB/siteAssets/Backups/backup-2026-05-14",
      filesCount: 2,
      sizeBytes: 2048,
      createdAt: "2026-05-14T00:00:00.000Z",
      verificationCheckedAt: "2026-05-14T00:00:00.000Z",
      ageHours: 1,
      ...backupOverrides
    },
    ...snapshotOverrides
  };
};

beforeEach(() => {
  mocks.Site.findById.mockReset();
  mocks.Site.findByIdAndUpdate.mockReset();
  mocks.Release.findById.mockReset();
  mocks.SiteVersionDeployment.create.mockReset();
  mocks.SiteVersionDeployment.findById.mockReset();
  mocks.SiteVersionDeployment.findByIdAndUpdate.mockReset();
  mocks.Job.findById.mockReset();
  mocks.Job.findByIdAndUpdate.mockReset();
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
  mocks.assertReleaseArtifactReady.mockReset();
  mocks.buildSiteDeployPlan.mockReset();
  mocks.assertRecentVerifiedBackupForDangerousWrite.mockReset();
  mocks.assertRecentVerifiedBackupForDangerousWrite.mockResolvedValue(makeBackupSafetySnapshot("rollback"));
  mocks.readLiveAdminSources.mockReset();
  mocks.executePermissionsSetup.mockReset();
  mocks.assertSharePointWriteAvailable.mockReset();
  mocks.writeSystemAuditLog.mockReset();
  mocks.logger.isPayloadLoggingEnabled.mockReturnValue(false);
});

describe("version rollback approval gating", () => {
  it.each([
    ["same/current", "1.2.3", "rollback-target-version-same-as-current"],
    ["newer", "1.2.4", "rollback-target-version-not-older"]
  ])("rejects %s target versions before queueing rollback work", async (_label, targetVersion, expectedMessage) => {
    mocks.Site.findById.mockResolvedValue(makeSite());
    mocks.Release.findById.mockResolvedValue(makeRelease(targetVersion));

    const { enqueueRollbackSite } = await import("../server/src/services/releases.service");

    await expect(
      enqueueRollbackSite({
        siteId: "site-1",
        releaseId: "release-1",
        reason: "operator requested rollback",
        createdBy: "operator"
      })
    ).rejects.toThrow(expectedMessage);

    expect(mocks.assertSharePointWriteAvailable).not.toHaveBeenCalled();
    expect(mocks.assertReleaseArtifactReady).not.toHaveBeenCalled();
    expect(mocks.SiteVersionDeployment.create).not.toHaveBeenCalled();
    expect(mocks.createJob).not.toHaveBeenCalled();
  });

  it("queues version-rollback jobs with approval metadata and rollback payload", async () => {
    const site = makeSite();
    const release = makeRelease("1.1.0");
    const deployment = makeDeployment({ rollbackReason: "bad deploy" });
    const job = {
      _id: idOf("job-rollback-1"),
      status: "awaiting-approval"
    };

    mocks.Site.findById.mockResolvedValue(site);
    mocks.Release.findById.mockResolvedValue(release);
    mocks.SiteVersionDeployment.create.mockResolvedValue(deployment);
    mocks.createJob.mockResolvedValue(job);

    const { enqueueRollbackSite } = await import("../server/src/services/releases.service");
    const result = await enqueueRollbackSite({
      siteId: "site-1",
      releaseId: "release-1",
      reason: "bad deploy",
      createdBy: "operator"
    });

    expect(mocks.assertSharePointWriteAvailable).toHaveBeenCalledTimes(1);
    expect(mocks.assertReleaseArtifactReady).toHaveBeenCalledWith("release-1");
    expect(mocks.assertRecentVerifiedBackupForDangerousWrite).toHaveBeenCalledWith({
      siteId: site._id,
      operation: "rollback"
    });
    expect(mocks.SiteVersionDeployment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        siteId: site._id,
        releaseId: release._id,
        fromVersion: "1.2.3",
        toVersion: "1.1.0",
        deploymentKind: "rollback",
        rollbackReason: "bad deploy",
        status: "queued",
        triggeredBy: "operator",
        logLines: [
          expect.objectContaining({
            level: "warn",
            message: "Rollback queued: bad deploy",
            at: expect.any(Date)
          })
        ]
      })
    );
    expect(mocks.createJob).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "version-rollback",
        siteId: "site-1",
        createdBy: "operator",
        requiresApproval: true,
        payload: expect.objectContaining({
          releaseId: "release-1",
          deploymentId: "deployment-1",
          targetVersion: "1.1.0",
          rollback: true,
          rollbackReason: "bad deploy"
        })
      })
    );

    const jobInput = mocks.createJob.mock.calls[0][0];
    expect(jobInput.approvalSummary).toMatchObject({
      title: "Rollback Alpha Site to 1.1.0",
      message: rollbackMessage,
      operation: "version-rollback",
      siteId: "site-1",
      siteCode: "alpha",
      releaseId: "release-1",
      releaseVersion: "1.1.0",
      fromVersion: "1.2.3",
      toVersion: "1.1.0",
      deploymentId: "deployment-1",
      rollbackReason: "bad deploy",
      requestedBy: "operator"
    });
    expect(jobInput.approvalSnapshot).toMatchObject({
      operation: "version-rollback",
      site: {
        id: "site-1",
        siteCode: "alpha",
        displayName: "Alpha Site",
        currentVersion: "1.2.3",
        targetVersion: "1.1.0",
        sharePointSiteUrl: "https://portal.army.idf/sites/alpha"
      },
      release: {
        id: "release-1",
        version: "1.1.0",
        releaseType: "patch",
        artifactRef: "/artifacts/1.1.0"
      },
      deployment: {
        id: "deployment-1",
        fromVersion: "1.2.3",
        toVersion: "1.1.0",
        status: "queued",
        deploymentKind: "rollback",
        rollbackReason: "bad deploy"
      },
      backupSafety: {
        policy: "recent-verified-backup",
        operation: "rollback",
        required: true,
        satisfied: true,
        backup: expect.objectContaining({
          id: "backup-object-1",
          backupId: "backup-2026-05-14",
          verificationStatus: "verified"
        })
      }
    });
    expect(jobInput.approvalSnapshot.writeOperations).toContain(
      "Validate and deploy the rollback release artifact to the SharePoint final dist folder"
    );
    expect(jobInput.approvalSnapshot.risks).toContain(
      "Rollback overwrites live SharePoint dist files with the selected older release artifact."
    );
    expect(mocks.SiteVersionDeployment.findByIdAndUpdate).toHaveBeenCalledWith(deployment._id, { jobId: job._id });
    expect(result).toMatchObject({
      job,
      deployment,
      requiresApproval: true,
      approvalStatus: "pending",
      message: rollbackMessage
    });
  });

  it("routes version-rollback worker jobs through deploy execution and records rollback evidence", async () => {
    const site = makeSite();
    const release = makeRelease("1.1.0");
    const deployment = makeDeployment();
    const originalJob = {
      _id: idOf("rerun-request-1"),
      type: "version-rollback",
      status: "failed",
      requiresApproval: false,
      createdBy: "operator",
      siteId: idOf("site-1")
    };
    const rollbackJob = {
      _id: idOf("job-rollback-1"),
      type: "version-rollback",
      status: "queued",
      requiresApproval: false,
      createdBy: "operator",
      siteId: idOf("site-1"),
      attempt: 2,
      payload: {
        releaseId: "release-1",
        deploymentId: "deployment-1",
        targetVersion: "1.1.0",
        rollback: true,
        rollbackReason: "bad deploy"
      }
    };
    const finalJob = { ...rollbackJob, status: "succeeded" };
    const evidence = [
      {
        relativePath: "index.html",
        targetPath: "/sites/alpha/siteAssets/finalDist/index.html",
        status: "verified"
      },
      {
        relativePath: "app.js",
        targetPath: "/sites/alpha/siteAssets/finalDist/app.js",
        status: "verified"
      }
    ];
    const finalAppUrlVerification = {
      key: "indexExists",
      label: "Final index.html",
      url: "https://portal.army.idf/sites/alpha/siteDB/dist/index.html",
      ok: true,
      status: 200
    };
    const postHealth = {
      checkedAt: "2026-05-14T10:00:00.000Z",
      derivedHealthStatus: "healthy",
      evidenceCount: 1,
      failedCount: 0,
      authBlockedCount: 0,
      health: {
        distExists: true,
        indexExists: true,
        assetsExists: true
      },
      evidence: [finalAppUrlVerification]
    };

    mocks.Job.findById.mockResolvedValueOnce(originalJob).mockResolvedValueOnce(finalJob);
    mocks.Job.findByIdAndUpdate.mockResolvedValue({ ...originalJob, status: "queued" });
    mocks.claimNextJob.mockResolvedValue(rollbackJob);
    mocks.setJobStatus.mockImplementation(async (_jobId, status) => ({ ...rollbackJob, status }));
    mocks.setJobSucceeded.mockResolvedValue(finalJob);
    mocks.Site.findById.mockResolvedValue(site);
    mocks.Release.findById.mockResolvedValue(release);
    mocks.SiteVersionDeployment.findById.mockResolvedValue(deployment);
    mocks.executeSharePointDeploy.mockResolvedValue({
      plan: {
        files: evidence.map((item) => ({ targetPath: item.targetPath })),
        summary: {
          filesCount: evidence.length,
          totalSizeBytes: 2048
        },
        resolvedPaths: {
          finalDistRoot: "/sites/alpha/siteAssets/finalDist"
        }
      },
      deployment: {
        verification: {
          evidence,
          finalAppUrlVerification,
          postHealth
        }
      }
    });
    mocks.writeSystemAuditLog.mockResolvedValue({ _id: idOf("audit-1") });

    const { runJobNow } = await import("../server/src/services/jobs.worker");
    const result = await runJobNow("rerun-request-1");

    expect(result).toBe(finalJob);
    expect(mocks.claimNextJob).toHaveBeenCalledTimes(1);
    expect(mocks.executeSharePointDeploy).toHaveBeenCalledWith({
      siteId: "site-1",
      releaseId: "release-1",
      deploymentId: "deployment-1"
    });
    expect(site.targetVersion).toBe("1.1.0");
    expect(site.versionStatus).toBe("updating");
    expect(site.sharePointStatus.deployStatus).toBe("running");
    expect(site.save).toHaveBeenCalledTimes(1);
    expect(mocks.setJobProgress).toHaveBeenCalledWith(
      "job-rollback-1",
      25,
      "Planning SharePoint rollback from release artifact"
    );
    expect(mocks.setJobTargetPaths).toHaveBeenCalledWith(
      "job-rollback-1",
      evidence.map((item) => item.targetPath),
      "Recorded 2 deploy target paths"
    );
    expect(mocks.setJobEvidence).toHaveBeenCalledWith(
      "job-rollback-1",
      evidence,
      "Rollback verification evidence recorded"
    );
    expect(mocks.setJobResult).toHaveBeenCalledWith(
      "job-rollback-1",
      expect.objectContaining({
        siteId: "site-1",
        siteCode: "alpha",
        releaseId: "release-1",
        releaseVersion: "1.1.0",
        deploymentId: "deployment-1",
        filesCount: 2,
        totalSizeBytes: 2048,
        finalDistRoot: "/sites/alpha/siteAssets/finalDist",
        targetVersion: "1.1.0",
        mode: "rollback",
        rollbackReason: "bad deploy",
        finalAppUrlVerification,
        postHealth: expect.objectContaining({
          checkedAt: "2026-05-14T10:00:00.000Z",
          derivedHealthStatus: "healthy",
          evidenceCount: 1,
          failedCount: 0,
          authBlockedCount: 0
        })
      }),
      "Rollback result recorded"
    );
    expect(mocks.setJobProgress).toHaveBeenCalledWith(
      "job-rollback-1",
      95,
      "Rolled back 2 files to /sites/alpha/siteAssets/finalDist"
    );
    expect(mocks.setJobSucceeded).toHaveBeenCalledWith("job-rollback-1");
  });

  it.each([
    ["version-upgrade", "deploy", false, "dangerous-write-backup-required:deploy"],
    ["version-rollback", "rollback", true, "dangerous-write-backup-stale:rollback"]
  ])(
    "blocks %s worker execution when the execution-time %s backup safety check fails",
    async (jobType, operation, rollback, safetyError) => {
      const site = makeSite();
      const release = makeRelease(rollback ? "1.1.0" : "1.2.4");
      const deployment = makeDeployment({
        deploymentKind: rollback ? "rollback" : "deploy",
        toVersion: release.version,
        rollbackReason: rollback ? "bad deploy" : undefined
      });
      const originalJob = {
        _id: idOf("rerun-request-1"),
        type: jobType,
        status: "failed",
        requiresApproval: false,
        createdBy: "operator",
        siteId: idOf("site-1")
      };
      const runningJob = {
        _id: idOf(`job-${operation}-1`),
        type: jobType,
        status: "queued",
        requiresApproval: false,
        createdBy: "operator",
        siteId: idOf("site-1"),
        attempt: 2,
        payload: {
          releaseId: "release-1",
          deploymentId: "deployment-1",
          targetVersion: release.version,
          rollback,
          rollbackReason: rollback ? "bad deploy" : undefined
        }
      };
      const failedJob = { ...runningJob, status: "failed", errorMessage: safetyError };

      mocks.Job.findById.mockResolvedValueOnce(originalJob).mockResolvedValueOnce(failedJob);
      mocks.Job.findByIdAndUpdate.mockResolvedValue({ ...originalJob, status: "queued" });
      mocks.claimNextJob.mockResolvedValue(runningJob);
      mocks.setJobStatus.mockImplementation(async (_jobId, status) => ({ ...runningJob, status }));
      mocks.setJobFailed.mockResolvedValue(failedJob);
      mocks.Site.findById.mockResolvedValue(site);
      mocks.Release.findById.mockResolvedValue(release);
      mocks.SiteVersionDeployment.findById.mockResolvedValue(deployment);
      mocks.assertRecentVerifiedBackupForDangerousWrite.mockRejectedValueOnce(new Error(safetyError));
      mocks.writeSystemAuditLog.mockResolvedValue({ _id: idOf("audit-1") });

      const { runJobNow } = await import("../server/src/services/jobs.worker");
      const result = await runJobNow("rerun-request-1");

      expect(result).toBe(failedJob);
      expect(mocks.assertRecentVerifiedBackupForDangerousWrite).toHaveBeenCalledWith({
        siteId: site._id,
        operation
      });
      expect(mocks.executeSharePointDeploy).not.toHaveBeenCalled();
      expect(site.save).not.toHaveBeenCalled();
      expect(mocks.setJobFailed).toHaveBeenCalledWith(`job-${operation}-1`, safetyError);
      expect(mocks.SiteVersionDeployment.findByIdAndUpdate).toHaveBeenCalledWith(
        "deployment-1",
        expect.objectContaining({
          status: "failed",
          error: safetyError
        })
      );
    }
  );
});

describe("dangerous-write backup safety preflight", () => {
  it("rejects deploy queue before creating deployment or job when no recent verified backup exists", async () => {
    const site = makeSite();
    mocks.Site.findById.mockResolvedValue(site);
    mocks.Release.findById.mockResolvedValue(makeRelease("1.2.4"));
    mocks.assertRecentVerifiedBackupForDangerousWrite.mockRejectedValue(
      new Error("dangerous-write-backup-required:deploy")
    );

    const { enqueueDeploySite } = await import("../server/src/services/releases.service");

    await expect(
      enqueueDeploySite({
        siteId: "site-1",
        releaseId: "release-1",
        createdBy: "operator"
      })
    ).rejects.toThrow("dangerous-write-backup-required:deploy");

    expect(mocks.assertRecentVerifiedBackupForDangerousWrite).toHaveBeenCalledWith({
      siteId: site._id,
      operation: "deploy"
    });
    expect(mocks.SiteVersionDeployment.create).not.toHaveBeenCalled();
    expect(mocks.createJob).not.toHaveBeenCalled();
  });

  it("rejects rollback queue before creating deployment or job when no recent verified backup exists", async () => {
    const site = makeSite();
    mocks.Site.findById.mockResolvedValue(site);
    mocks.Release.findById.mockResolvedValue(makeRelease("1.1.0"));
    mocks.assertRecentVerifiedBackupForDangerousWrite.mockRejectedValue(
      new Error("dangerous-write-backup-required:rollback")
    );

    const { enqueueRollbackSite } = await import("../server/src/services/releases.service");

    await expect(
      enqueueRollbackSite({
        siteId: "site-1",
        releaseId: "release-1",
        reason: "bad deploy",
        createdBy: "operator"
      })
    ).rejects.toThrow("dangerous-write-backup-required:rollback");

    expect(mocks.assertRecentVerifiedBackupForDangerousWrite).toHaveBeenCalledWith({
      siteId: site._id,
      operation: "rollback"
    });
    expect(mocks.SiteVersionDeployment.create).not.toHaveBeenCalled();
    expect(mocks.createJob).not.toHaveBeenCalled();
  });

  it("includes backup safety metadata in deploy approval snapshots", async () => {
    const backupSafety = makeBackupSafetySnapshot("deploy", {
      backup: {
        id: "backup-safe-deploy",
        backupId: "backup-safe-deploy-2026-05-14"
      }
    });
    const deployment = makeDeployment({ deploymentKind: "deploy", toVersion: "1.2.4", rollbackReason: undefined });
    const job = {
      _id: idOf("job-deploy-1"),
      status: "awaiting-approval"
    };

    mocks.Site.findById.mockResolvedValue(makeSite());
    mocks.Release.findById.mockResolvedValue(makeRelease("1.2.4"));
    mocks.SiteVersionDeployment.create.mockResolvedValue(deployment);
    mocks.createJob.mockResolvedValue(job);
    mocks.assertRecentVerifiedBackupForDangerousWrite.mockResolvedValue(backupSafety);

    const { enqueueDeploySite } = await import("../server/src/services/releases.service");
    await enqueueDeploySite({
      siteId: "site-1",
      releaseId: "release-1",
      createdBy: "operator"
    });

    const jobInput = mocks.createJob.mock.calls[0][0];
    expect(jobInput.approvalSnapshot).toMatchObject({
      operation: "version-upgrade",
      backupSafety: expect.objectContaining({
        policy: "recent-verified-backup",
        operation: "deploy",
        required: true,
        satisfied: true,
        backup: expect.objectContaining({
          id: "backup-safe-deploy",
          backupId: "backup-safe-deploy-2026-05-14",
          storagePath: "/sites/alpha/siteDB/siteAssets/Backups/backup-2026-05-14",
          verificationStatus: "verified"
        })
      })
    });
  });

  it("includes backup safety metadata in rollback approval snapshots", async () => {
    const backupSafety = makeBackupSafetySnapshot("rollback", {
      backup: {
        id: "backup-safe-rollback",
        backupId: "backup-safe-rollback-2026-05-14"
      }
    });
    const job = {
      _id: idOf("job-rollback-1"),
      status: "awaiting-approval"
    };

    mocks.Site.findById.mockResolvedValue(makeSite());
    mocks.Release.findById.mockResolvedValue(makeRelease("1.1.0"));
    mocks.SiteVersionDeployment.create.mockResolvedValue(makeDeployment());
    mocks.createJob.mockResolvedValue(job);
    mocks.assertRecentVerifiedBackupForDangerousWrite.mockResolvedValue(backupSafety);

    const { enqueueRollbackSite } = await import("../server/src/services/releases.service");
    await enqueueRollbackSite({
      siteId: "site-1",
      releaseId: "release-1",
      reason: "bad deploy",
      createdBy: "operator"
    });

    const jobInput = mocks.createJob.mock.calls[0][0];
    expect(jobInput.approvalSnapshot).toMatchObject({
      operation: "version-rollback",
      backupSafety: expect.objectContaining({
        policy: "recent-verified-backup",
        operation: "rollback",
        required: true,
        satisfied: true,
        backup: expect.objectContaining({
          id: "backup-safe-rollback",
          backupId: "backup-safe-rollback-2026-05-14",
          storagePath: "/sites/alpha/siteDB/siteAssets/Backups/backup-2026-05-14",
          verificationStatus: "verified"
        })
      })
    });
  });
});

describe("rollback-specific error normalization", () => {
  it.each([
    ["rollback-target-version-same-as-current", "ROLLBACK_TARGET_VERSION_SAME_AS_CURRENT"],
    ["rollback-target-version-not-older", "ROLLBACK_TARGET_VERSION_NOT_OLDER"],
    ["dangerous-write-backup-required:rollback", "DANGEROUS_WRITE_BACKUP_REQUIRED"],
    ["dangerous-write-backup-stale:deploy", "DANGEROUS_WRITE_BACKUP_STALE"]
  ])("maps %s to a 409 rollback conflict", (message, code) => {
    expect(normalizeError(new Error(message))).toMatchObject({
      code,
      status: 409
    });
  });
});
