import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  Site: {
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn()
  },
  Release: {
    findById: vi.fn()
  },
  SiteVersionDeployment: {
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn()
  },
  Job: {
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn()
  },
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
  executeAdminTxtRepair: vi.fn(),
  assertSharePointWriteAvailable: vi.fn(),
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
vi.mock("../server/src/models/Job", () => ({ Job: mocks.Job }));
vi.mock("../server/src/models/Release", () => ({ Release: mocks.Release }));
vi.mock("../server/src/models/SiteVersionDeployment", () => ({
  SiteVersionDeployment: mocks.SiteVersionDeployment
}));
vi.mock("../server/src/services/jobs.service", () => ({
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
vi.mock("../server/src/services/admins.service", () => ({
  executeAdminTxtRepair: mocks.executeAdminTxtRepair
}));
vi.mock("../server/src/services/sharepointOperationClient", () => ({
  assertSharePointWriteAvailable: mocks.assertSharePointWriteAvailable
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
  },
  ownerDirectModeEnabled: () => false
}));

const idOf = (value: string) => ({ toString: () => value });

beforeEach(() => {
  for (const value of Object.values(mocks)) {
    if (typeof value === "function" && "mockReset" in value) value.mockReset();
    if (value && typeof value === "object") {
      for (const child of Object.values(value)) {
        if (typeof child === "function" && "mockReset" in child) child.mockReset();
      }
    }
  }
  mocks.logger.isPayloadLoggingEnabled.mockReturnValue(false);
});

describe("site-bootstrap worker execution", () => {
  it("executes approved site-bootstrap jobs and records site creation/provisioning evidence", async () => {
    const originalJob = {
      _id: idOf("rerun-request-1"),
      type: "site-bootstrap",
      status: "failed",
      requiresApproval: false,
      createdBy: "operator",
      siteId: idOf("site-1")
    };
    const bootstrapJob = {
      _id: idOf("job-bootstrap-1"),
      type: "site-bootstrap",
      status: "queued",
      requiresApproval: true,
      approvedAt: new Date("2026-05-14T10:00:00.000Z"),
      approvedBy: "approver",
      createdBy: "operator",
      siteId: idOf("site-1"),
      payload: {
        owner: "owner@example.test",
        runProvisioning: true,
        runPermissionsSetup: true,
        reason: "New Hub site"
      }
    };
    const finalJob = { ...bootstrapJob, status: "succeeded" };
    const result = {
      siteId: "site-1",
      siteCode: "alpha",
      resolvedPaths: {
        sharePointSiteUrl: "https://portal.army.idf/sites/alpha",
        finalAppUrl: "https://portal.army.idf/sites/alpha/siteDB/dist/index.html",
        bootstrapUrl: "https://portal.army.idf/sites/alpha/SiteAssets/sitebuilder-bootstrap/dist/index.html#/admin/sharepoint-setup"
      },
      siteCollection: {
        action: "created",
        targetUrl: "https://portal.army.idf/sites/alpha",
        statusBefore: { statusName: "not-found" },
        statusAfter: { statusName: "ready" },
        polls: [{ statusName: "ready" }]
      },
      provisioning: {
        completedSteps: [
          { key: "library-site-db", label: "Ensure siteDB Document Library", target: "siteDB" }
        ]
      },
      permissions: {
        completedSteps: [
          { key: "write-marker", label: "Write permissions marker", target: "/sites/alpha/siteUsersDb/.permissions-setup.json" }
        ]
      },
      completedSteps: [
        { key: "site-create", label: "Create SharePoint site collection if missing", target: "https://portal.army.idf/sites/alpha" },
        { key: "provision-library-site-db", label: "Ensure siteDB Document Library", target: "siteDB" },
        { key: "permissions-write-marker", label: "Write permissions marker", target: "/sites/alpha/siteUsersDb/.permissions-setup.json" }
      ]
    };

    mocks.Job.findById.mockResolvedValueOnce(originalJob).mockResolvedValueOnce(finalJob);
    mocks.Job.findByIdAndUpdate.mockResolvedValue({ ...originalJob, status: "queued" });
    mocks.claimNextJob.mockResolvedValue(bootstrapJob);
    mocks.setJobStatus.mockImplementation(async (_jobId, status) => ({ ...bootstrapJob, status }));
    mocks.setJobSucceeded.mockResolvedValue(finalJob);
    mocks.executeSiteBootstrap.mockResolvedValue(result);
    mocks.writeSystemAuditLog.mockResolvedValue({ _id: idOf("audit-1") });

    const { runJobNow } = await import("../server/src/services/jobs.worker");
    const output = await runJobNow("rerun-request-1");

    expect(output).toBe(finalJob);
    expect(mocks.assertSharePointWriteAvailable).toHaveBeenCalledTimes(1);
    expect(mocks.executeSiteBootstrap).toHaveBeenCalledWith("site-1", bootstrapJob.payload);
    expect(mocks.setJobTargetPaths).toHaveBeenCalledWith(
      "job-bootstrap-1",
      [
        "https://portal.army.idf/sites/alpha",
        "https://portal.army.idf/sites/alpha",
        "siteDB",
        "/sites/alpha/siteUsersDb/.permissions-setup.json"
      ],
      "Recorded 4 bootstrap targets"
    );
    expect(mocks.setJobEvidence).toHaveBeenCalledWith(
      "job-bootstrap-1",
      {
        siteCollection: result.siteCollection,
        provisioningSteps: result.provisioning.completedSteps,
        permissionsSteps: result.permissions.completedSteps
      },
      "Site bootstrap evidence recorded"
    );
    expect(mocks.setJobResult).toHaveBeenCalledWith(
      "job-bootstrap-1",
      expect.objectContaining({
        siteId: "site-1",
        siteCode: "alpha",
        sharePointSiteUrl: "https://portal.army.idf/sites/alpha",
        siteCollectionAction: "created",
        completedSteps: 3,
        provisioningSteps: 1,
        permissionsSteps: 1
      }),
      "Site bootstrap result recorded"
    );
  });

  it("executes owner-direct site-bootstrap jobs without approval fields", async () => {
    const originalJob = {
      _id: idOf("rerun-request-owner-1"),
      type: "site-bootstrap",
      status: "failed",
      requiresApproval: false,
      createdBy: "owner",
      siteId: idOf("site-1")
    };
    const bootstrapJob = {
      _id: idOf("job-bootstrap-owner-1"),
      type: "site-bootstrap",
      status: "queued",
      requiresApproval: false,
      createdBy: "owner",
      siteId: idOf("site-1"),
      payload: {
        owner: "owner@example.test",
        runProvisioning: true,
        runPermissionsSetup: true
      }
    };
    const finalJob = { ...bootstrapJob, status: "succeeded" };
    const result = {
      siteId: "site-1",
      siteCode: "alpha",
      resolvedPaths: {
        sharePointSiteUrl: "https://portal.army.idf/sites/alpha",
        finalAppUrl: "https://portal.army.idf/sites/alpha/siteDB/dist/index.html",
        bootstrapUrl: "https://portal.army.idf/sites/alpha/SiteAssets/sitebuilder-bootstrap/dist/index.html#/admin/sharepoint-setup"
      },
      siteCollection: {
        action: "created",
        targetUrl: "https://portal.army.idf/sites/alpha"
      },
      provisioning: { completedSteps: [] },
      permissions: { completedSteps: [] },
      completedSteps: [
        { key: "site-create", label: "Create SharePoint site collection if missing", target: "https://portal.army.idf/sites/alpha" }
      ]
    };

    mocks.Job.findById.mockResolvedValueOnce(originalJob).mockResolvedValueOnce(finalJob);
    mocks.Job.findByIdAndUpdate.mockResolvedValue({ ...originalJob, status: "queued" });
    mocks.claimNextJob.mockResolvedValue(bootstrapJob);
    mocks.setJobStatus.mockImplementation(async (_jobId, status) => ({ ...bootstrapJob, status }));
    mocks.setJobSucceeded.mockResolvedValue(finalJob);
    mocks.executeSiteBootstrap.mockResolvedValue(result);
    mocks.writeSystemAuditLog.mockResolvedValue({ _id: idOf("audit-owner-1") });

    const { runJobNow } = await import("../server/src/services/jobs.worker");
    const output = await runJobNow("rerun-request-owner-1");

    expect(output).toBe(finalJob);
    expect(mocks.executeSiteBootstrap).toHaveBeenCalledWith("site-1", bootstrapJob.payload);
  });
});
