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
    findByIdAndUpdate: vi.fn()
  },
  Job: {
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn()
  },
  createJob: vi.fn(),
  claimNextJob: vi.fn(),
  setJobFailed: vi.fn(),
  setJobStatus: vi.fn(),
  setJobSucceeded: vi.fn(),
  assertReleaseArtifactReady: vi.fn(),
  buildSiteDeployPlan: vi.fn(),
  assertRecentVerifiedBackupForDangerousWrite: vi.fn(),
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
  setJobFailed: mocks.setJobFailed,
  setJobStatus: mocks.setJobStatus,
  setJobSucceeded: mocks.setJobSucceeded
}));
vi.mock("../server/src/services/deployArtifact.service", () => ({
  assertReleaseArtifactReady: mocks.assertReleaseArtifactReady,
  buildSiteDeployPlan: mocks.buildSiteDeployPlan
}));
vi.mock("../server/src/services/sharepointOperationClient", () => ({
  assertSharePointWriteAvailable: mocks.assertSharePointWriteAvailable
}));
vi.mock("../server/src/services/writeSafety.service", () => ({
  assertRecentVerifiedBackupForDangerousWrite: mocks.assertRecentVerifiedBackupForDangerousWrite
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

const makeDeployPlan = () => ({
  deployMode: "local-dev-owner",
  connectorMode: "browser-sharepoint",
  summary: {
    readyForDeploy: true,
    readyForDeployExecution: true,
    filesCount: 2,
    totalSizeBytes: 2048
  },
  files: [
    { relativePath: "index.html", targetPath: "/sites/alpha/siteDB/dist/index.html" },
    { relativePath: "assets/app.js", targetPath: "/sites/alpha/siteDB/dist/assets/app.js" }
  ],
  targetInventory: {
    staleFilesCount: 0
  },
  missingRequirements: []
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
  mocks.assertReleaseArtifactReady.mockResolvedValue(undefined);
  mocks.buildSiteDeployPlan.mockResolvedValue(makeDeployPlan());
  mocks.SiteVersionDeployment.create.mockResolvedValue(makeDeployment());
  mocks.createJob.mockImplementation(async (input) => ({
    _id: idOf("job-rollback-1"),
    ...input,
    status: input.requiresApproval ? "awaiting-approval" : "browser-required"
  }));
});

describe("version rollback browser flow", () => {
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

  it("queues version-rollback jobs as browser-required without server SharePoint or backup preflight", async () => {
    const site = makeSite();
    const release = makeRelease("1.1.0");
    const deployment = makeDeployment({ rollbackReason: "bad deploy" });
    const job = {
      _id: idOf("job-rollback-1"),
      status: "awaiting-approval",
      requiresApproval: true
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

    expect(mocks.assertSharePointWriteAvailable).not.toHaveBeenCalled();
    expect(mocks.assertRecentVerifiedBackupForDangerousWrite).not.toHaveBeenCalled();
    expect(mocks.assertReleaseArtifactReady).toHaveBeenCalledWith("release-1");
    expect(mocks.buildSiteDeployPlan).toHaveBeenCalledWith("site-1", "release-1", {
      deployMode: "local-dev-owner",
      connectorMode: "browser-sharepoint"
    });
    expect(mocks.SiteVersionDeployment.create).toHaveBeenCalledWith(expect.objectContaining({
      siteId: site._id,
      releaseId: release._id,
      fromVersion: "1.2.3",
      toVersion: "1.1.0",
      deploymentKind: "rollback",
      rollbackReason: "bad deploy",
      status: "queued",
      triggeredBy: "operator"
    }));
    expect(mocks.createJob).toHaveBeenCalledWith(expect.objectContaining({
      type: "version-rollback",
      siteId: "site-1",
      createdBy: "operator",
      executionMode: "browser-required",
      connectorMode: "browser-sharepoint",
      operationPolicy: "rollback",
      payload: expect.objectContaining({
        releaseId: "release-1",
        deploymentId: "deployment-1",
        targetVersion: "1.1.0",
        rollbackReason: "bad deploy",
        connectorMode: "browser-sharepoint",
        executionMode: "browser-required"
      })
    }));

    const jobInput = mocks.createJob.mock.calls[0][0];
    expect(jobInput.approvalSnapshot).toMatchObject({
      operation: "version-rollback",
      backupSafety: expect.objectContaining({
        policy: "local-dev-owner-override",
        operation: "rollback",
        required: false,
        satisfied: true,
        reason: "Fast browser rollback flow selected; no server SharePoint restore path exists."
      })
    });
    expect(jobInput.approvalSnapshot.writeOperations).toContain(
      "Validate and deploy the rollback release artifact to the SharePoint final dist folder"
    );
    expect(mocks.SiteVersionDeployment.findByIdAndUpdate).toHaveBeenCalledWith(deployment._id, { jobId: job._id });
    expect(result).toMatchObject({
      job,
      deployment,
      requiresApproval: true,
      approvalStatus: "pending"
    });
  });

  it("keeps version-rollback reruns in browser-required state instead of executing the worker", async () => {
    const originalJob = {
      _id: idOf("rerun-request-1"),
      type: "version-rollback",
      status: "failed",
      requiresApproval: false,
      createdBy: "operator",
      siteId: idOf("site-1"),
      payload: {
        releaseId: "release-1",
        deploymentId: "deployment-1",
        connectorMode: "browser-sharepoint",
        executionMode: "browser-required"
      }
    };
    const updatedJob = {
      ...originalJob,
      status: "browser-required",
      executionMode: "browser-required",
      connectorMode: "browser-sharepoint"
    };

    mocks.Job.findById.mockResolvedValueOnce(originalJob).mockResolvedValueOnce(updatedJob);

    const { runJobNow } = await import("../server/src/services/jobs.worker");
    const result = await runJobNow("rerun-request-1");

    expect(result).toBe(updatedJob);
    expect(mocks.Job.findByIdAndUpdate).toHaveBeenCalledWith(
      "rerun-request-1",
      expect.objectContaining({
        $set: expect.objectContaining({
          status: "browser-required",
          executionMode: "browser-required",
          connectorMode: "browser-sharepoint"
        })
      })
    );
    expect(mocks.claimNextJob).not.toHaveBeenCalled();
    expect(mocks.setJobStatus).not.toHaveBeenCalled();
    expect(mocks.setJobSucceeded).not.toHaveBeenCalled();
    expect(mocks.setJobFailed).not.toHaveBeenCalled();
  });
});

describe("rollback-specific error normalization", () => {
  it.each([
    ["rollback-target-version-same-as-current", "ROLLBACK_TARGET_VERSION_SAME_AS_CURRENT"],
    ["rollback-target-version-not-older", "ROLLBACK_TARGET_VERSION_NOT_OLDER"],
    ["dangerous-write-backup-required:rollback", "DANGEROUS_WRITE_BACKUP_REQUIRED"],
    ["dangerous-write-backup-stale:deploy", "DANGEROUS_WRITE_BACKUP_STALE"],
    ["sharepoint-browser-execution-required", "SHAREPOINT_BROWSER_EXECUTION_REQUIRED"]
  ])("maps %s to a rollback conflict", (message, code) => {
    expect(normalizeError(new Error(message))).toMatchObject({
      code,
      status: 409
    });
  });
});
