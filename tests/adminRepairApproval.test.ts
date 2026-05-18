import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  Site: {
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn()
  },
  SiteAdminSnapshot: {
    create: vi.fn(),
    findOne: vi.fn()
  },
  Job: {
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
  runReadOnlySharePointHealthCheck: vi.fn(),
  readLiveAdminSources: vi.fn(),
  executePermissionsSetup: vi.fn(),
  assertSharePointWriteAvailable: vi.fn(),
  getRequestDigest: vi.fn(),
  ensureSharePointUser: vi.fn(),
  setSharePointSiteCollectionAdmin: vi.fn(),
  getAssociatedOwnerGroupId: vi.fn(),
  addSharePointUserToGroup: vi.fn(),
  removeSharePointUserFromGroup: vi.fn(),
  writeSharePointTextFile: vi.fn(),
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
vi.mock("../server/src/models/SiteAdminSnapshot", () => ({ SiteAdminSnapshot: mocks.SiteAdminSnapshot }));
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
vi.mock("../server/src/services/sharepointHealth.service", () => ({
  runReadOnlySharePointHealthCheck: mocks.runReadOnlySharePointHealthCheck
}));
vi.mock("../server/src/services/liveAdminSources.service", () => ({
  readLiveAdminSources: mocks.readLiveAdminSources
}));
vi.mock("../server/src/services/permissionsSetup.service", () => ({
  executePermissionsSetup: mocks.executePermissionsSetup
}));
vi.mock("../server/src/services/sharepointOperationClient", () => ({
  assertSharePointWriteAvailable: mocks.assertSharePointWriteAvailable,
  getRequestDigest: mocks.getRequestDigest,
  ensureSharePointUser: mocks.ensureSharePointUser,
  setSharePointSiteCollectionAdmin: mocks.setSharePointSiteCollectionAdmin,
  getAssociatedOwnerGroupId: mocks.getAssociatedOwnerGroupId,
  addSharePointUserToGroup: mocks.addSharePointUserToGroup,
  removeSharePointUserFromGroup: mocks.removeSharePointUserFromGroup,
  writeSharePointTextFile: mocks.writeSharePointTextFile
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

const ownersGroupOnlyAdmin = {
  displayName: "Dana Owner",
  personalNumber: "s3333333",
  email: "dana@example.test",
  loginName: "i:0#.f|membership|dana@example.test"
};

const mergedTxtAdmins = [txtAdmin, siteCollectionOnlyAdmin, ownersGroupOnlyAdmin];

const makeSite = (overrides: Record<string, unknown> = {}) => ({
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
  ...overrides
});

const makeLiveAdminRead = (overrides: Record<string, unknown> = {}) => ({
  siteId: "site-1",
  siteCode: "alpha",
  capturedAt: "2026-05-14T08:00:00.000Z",
  txtAdmins: [txtAdmin],
  siteCollectionAdmins: [txtAdmin, siteCollectionOnlyAdmin],
  ownersGroupAdmins: [txtAdmin, ownersGroupOnlyAdmin],
  adminDifferences: {
    missingInTxt: ["login:i:0#.f|membership|bob@example.test", "login:i:0#.f|membership|dana@example.test"],
    missingInSiteCollection: ["login:i:0#.f|membership|dana@example.test"],
    missingInOwnersGroup: ["login:i:0#.f|membership|bob@example.test"]
  },
  adminsCount: 3,
  sourceStatus: [
    { source: "txt", ok: true, count: 1 },
    { source: "siteCollection", ok: true, count: 2 },
    { source: "ownersGroup", ok: true, count: 2 }
  ],
  ...overrides
});

const rowsFromUsersText = (text: string) => {
  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? parsed : parsed.users;
};

beforeEach(() => {
  mocks.Site.findById.mockReset();
  mocks.Site.findByIdAndUpdate.mockReset();
  mocks.SiteAdminSnapshot.create.mockReset();
  mocks.SiteAdminSnapshot.findOne.mockReset();
  mocks.Job.findById.mockReset();
  mocks.Job.findByIdAndUpdate.mockReset();
  mocks.Release.findById.mockReset();
  mocks.SiteVersionDeployment.findById.mockReset();
  mocks.SiteVersionDeployment.findByIdAndUpdate.mockReset();
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
  mocks.runReadOnlySharePointHealthCheck.mockReset();
  mocks.readLiveAdminSources.mockReset();
  mocks.executePermissionsSetup.mockReset();
  mocks.assertSharePointWriteAvailable.mockReset();
  mocks.getRequestDigest.mockReset();
  mocks.ensureSharePointUser.mockReset();
  mocks.setSharePointSiteCollectionAdmin.mockReset();
  mocks.getAssociatedOwnerGroupId.mockReset();
  mocks.addSharePointUserToGroup.mockReset();
  mocks.removeSharePointUserFromGroup.mockReset();
  mocks.writeSharePointTextFile.mockReset();
  mocks.writeSystemAuditLog.mockReset();
  mocks.logger.isPayloadLoggingEnabled.mockReturnValue(false);
});

describe("admin TXT repair approval gating", () => {
  it("plans TXT-only admin repair from live source differences without SharePoint writes", async () => {
    const site = makeSite();
    mocks.Site.findById.mockResolvedValue(site);
    mocks.readLiveAdminSources.mockResolvedValue(makeLiveAdminRead());

    const adminsService = await import("../server/src/services/admins.service");
    const buildAdminTxtRepairPlan = (adminsService as any).buildAdminTxtRepairPlan;
    expect(buildAdminTxtRepairPlan).toBeTypeOf("function");

    const plan = await buildAdminTxtRepairPlan("site-1", { capturedBy: "operator" });

    expect(mocks.readLiveAdminSources).toHaveBeenCalledWith("site-1", {
      persist: false,
      capturedBy: "operator"
    });
    expect(mocks.writeSharePointTextFile).not.toHaveBeenCalled();
    expect(plan).toMatchObject({
      operation: "admin-txt-repair",
      siteId: "site-1",
      siteCode: "alpha",
      targetPath: usersTxtTargetPath,
      missingInTxt: [
        "login:i:0#.f|membership|bob@example.test",
        "login:i:0#.f|membership|dana@example.test"
      ],
      sourceCounts: {
        txt: 1,
        siteCollection: 2,
        ownersGroup: 2
      }
    });
    expect(plan.mergedTxtAdmins).toEqual(expect.arrayContaining(mergedTxtAdmins));
    expect(plan.summary).toMatchObject({
      readyForRepair: true,
      missingInTxtCount: 2,
      targetPath: usersTxtTargetPath
    });
  });

  it("queues TXT repair jobs with approval metadata and a stable repair snapshot", async () => {
    const job = {
      _id: idOf("job-repair-1"),
      status: "awaiting-approval"
    };

    const site = makeSite();
    mocks.Site.findById.mockResolvedValue(site);
    mocks.readLiveAdminSources.mockResolvedValue(makeLiveAdminRead());
    mocks.createJob.mockResolvedValue(job);

    const adminsService = await import("../server/src/services/admins.service");
    const enqueueAdminTxtRepair = (adminsService as any).enqueueAdminTxtRepair;
    expect(enqueueAdminTxtRepair).toBeTypeOf("function");

    const result = await enqueueAdminTxtRepair({
      siteId: "site-1",
      createdBy: "operator",
      reason: "Repair missing admins in users_data.txt"
    });

    expect(mocks.createJob).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "repair",
        siteId: "site-1",
        createdBy: "operator",
        requiresApproval: true,
        payload: expect.objectContaining({
          repairType: "admin-txt",
          targetPath: usersTxtTargetPath,
          missingInTxt: [
            "login:i:0#.f|membership|bob@example.test",
            "login:i:0#.f|membership|dana@example.test"
          ],
          mergedTxtAdmins
        })
      })
    );

    const jobInput = mocks.createJob.mock.calls[0][0];
    expect(jobInput.approvalSummary).toMatchObject({
      title: "Repair Alpha Site admin TXT source",
      operation: "admin-txt-repair",
      siteId: "site-1",
      siteCode: "alpha",
      targetPath: usersTxtTargetPath,
      missingInTxtCount: 2,
      requestedBy: "operator",
      reason: "Repair missing admins in users_data.txt"
    });
    expect(jobInput.approvalSnapshot).toMatchObject({
      operation: "admin-txt-repair",
      site: {
        id: "site-1",
        siteCode: "alpha",
        displayName: "Alpha Site",
        sharePointSiteUrl: "https://portal.army.idf/sites/alpha"
      },
      targetPath: usersTxtTargetPath,
      missingInTxt: [
        "login:i:0#.f|membership|bob@example.test",
        "login:i:0#.f|membership|dana@example.test"
      ],
      mergedTxtAdmins,
      liveRead: expect.objectContaining({
        capturedAt: "2026-05-14T08:00:00.000Z",
        adminsCount: 3,
        sourceStatus: expect.arrayContaining([
          { source: "txt", ok: true, count: 1 },
          { source: "siteCollection", ok: true, count: 2 },
          { source: "ownersGroup", ok: true, count: 2 }
        ])
      }),
      requestedBy: "operator",
      reason: "Repair missing admins in users_data.txt"
    });
    expect(jobInput.approvalSnapshot.writeOperations).toContain(
      "Overwrite users_data.txt with the merged TXT, Site Collection admin, and Owners Group admin list"
    );

    expect(result).toMatchObject({
      job,
      requiresApproval: true,
      approvalStatus: "pending",
      plan: expect.objectContaining({
        targetPath: usersTxtTargetPath,
        missingInTxt: [
          "login:i:0#.f|membership|bob@example.test",
          "login:i:0#.f|membership|dana@example.test"
        ]
      })
    });
  });

  it("executes approved repair jobs by writing merged users_data.txt and recording refreshed live evidence", async () => {
    const originalJob = {
      _id: idOf("rerun-request-1"),
      type: "repair",
      status: "failed",
      requiresApproval: false,
      createdBy: "operator",
      siteId: idOf("site-1")
    };
    const repairJob = {
      _id: idOf("job-repair-1"),
      type: "repair",
      status: "queued",
      requiresApproval: true,
      approvedAt: new Date("2026-05-14T08:05:00.000Z"),
      approvedBy: "approver",
      createdBy: "operator",
      siteId: idOf("site-1"),
      payload: {
        repairType: "admin-txt",
        targetPath: usersTxtTargetPath,
        missingInTxt: [
          "login:i:0#.f|membership|bob@example.test",
          "login:i:0#.f|membership|dana@example.test"
        ],
        mergedTxtAdmins
      }
    };
    const finalJob = { ...repairJob, status: "succeeded" };
    const refreshedRead = makeLiveAdminRead({
      capturedAt: "2026-05-14T08:06:00.000Z",
      txtAdmins: mergedTxtAdmins,
      adminDifferences: {
        missingInTxt: [],
        missingInSiteCollection: ["login:i:0#.f|membership|dana@example.test"],
        missingInOwnersGroup: ["login:i:0#.f|membership|bob@example.test"]
      },
      sourceStatus: [
        { source: "txt", ok: true, count: 3 },
        { source: "siteCollection", ok: true, count: 2 },
        { source: "ownersGroup", ok: true, count: 2 }
      ]
    });

    mocks.Job.findById.mockResolvedValueOnce(originalJob).mockResolvedValueOnce(finalJob);
    mocks.Job.findByIdAndUpdate.mockResolvedValue({ ...originalJob, status: "queued" });
    mocks.claimNextJob.mockResolvedValue(repairJob);
    mocks.setJobStatus.mockImplementation(async (_jobId, status) => ({ ...repairJob, status }));
    mocks.setJobSucceeded.mockResolvedValue(finalJob);
    mocks.Site.findById.mockResolvedValue(makeSite());
    mocks.writeSharePointTextFile.mockResolvedValue(undefined);
    mocks.readLiveAdminSources.mockResolvedValue(refreshedRead);
    mocks.writeSystemAuditLog.mockResolvedValue({ _id: idOf("audit-1") });

    const { runJobNow } = await import("../server/src/services/jobs.worker");
    const result = await runJobNow("rerun-request-1");

    expect(result).toBe(finalJob);
    expect(mocks.assertSharePointWriteAvailable).toHaveBeenCalledTimes(1);
    expect(mocks.writeSharePointTextFile).toHaveBeenCalledWith(
      expect.objectContaining({
        siteCode: "alpha",
        txtFiles: expect.objectContaining({ users: usersTxtTargetPath })
      }),
      usersTxtTargetPath,
      expect.any(String)
    );

    const usersText = mocks.writeSharePointTextFile.mock.calls[0][2];
    expect(rowsFromUsersText(usersText)).toEqual(expect.arrayContaining(mergedTxtAdmins));
    expect(mocks.readLiveAdminSources).toHaveBeenCalledWith("site-1", {
      persist: true,
      jobId: "job-repair-1",
      capturedBy: "operator"
    });
    expect(mocks.writeSharePointTextFile.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.readLiveAdminSources.mock.invocationCallOrder[0]
    );
    expect(mocks.setJobTargetPaths).toHaveBeenCalledWith(
      "job-repair-1",
      [usersTxtTargetPath],
      "Recorded admin TXT repair target path"
    );
    expect(mocks.setJobEvidence).toHaveBeenCalledWith(
      "job-repair-1",
      expect.objectContaining({
        write: expect.objectContaining({
          targetPath: usersTxtTargetPath,
          repairedMissingInTxtCount: 2
        }),
        liveRead: expect.objectContaining({
          capturedAt: "2026-05-14T08:06:00.000Z",
          sourceStatus: refreshedRead.sourceStatus
        })
      }),
      "Admin TXT repair evidence recorded"
    );
    expect(mocks.setJobResult).toHaveBeenCalledWith(
      "job-repair-1",
      expect.objectContaining({
        siteId: "site-1",
        siteCode: "alpha",
        targetPath: usersTxtTargetPath,
        repairedMissingInTxtCount: 2,
        adminsCount: 3,
        adminDifferences: expect.objectContaining({
          missingInTxt: []
        }),
        sourceCounts: {
          txt: 3,
          siteCollection: 2,
          ownersGroup: 2
        }
      }),
      "Admin TXT repair result recorded"
    );
    expect(mocks.setJobProgress).toHaveBeenCalledWith(
      "job-repair-1",
      90,
      "Repaired users_data.txt and refreshed live admin evidence"
    );
    expect(mocks.setJobSucceeded).toHaveBeenCalledWith("job-repair-1");
  });
});

describe("admin sync read-only and live SharePoint admin writes", () => {
  it("queues read-only admin sync without mutating Site status and runs the job without snapshot persistence", async () => {
    const readOnlyJob = {
      _id: idOf("job-admin-readonly-1"),
      type: "admin-sync",
      status: "failed",
      requiresApproval: false,
      createdBy: "operator",
      siteId: idOf("site-1"),
      payload: { mode: "read-only" }
    };
    const finalJob = { ...readOnlyJob, status: "succeeded" };

    mocks.Site.findById.mockResolvedValue(makeSite());
    mocks.createJob.mockResolvedValue(readOnlyJob);

    const adminsService = await import("../server/src/services/admins.service");
    const enqueueAdminSync = (adminsService as any).enqueueAdminSync;
    await enqueueAdminSync({
      siteId: "site-1",
      createdBy: "operator",
      mode: "read-only"
    });

    expect(mocks.Site.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(mocks.createJob).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "admin-sync",
        siteId: "site-1",
        payload: { mode: "read-only" }
      })
    );

    mocks.Job.findById.mockResolvedValueOnce(readOnlyJob).mockResolvedValueOnce(finalJob);
    mocks.Job.findByIdAndUpdate.mockResolvedValue({ ...readOnlyJob, status: "queued" });
    mocks.claimNextJob.mockResolvedValue(readOnlyJob);
    mocks.setJobStatus.mockImplementation(async (_jobId, status) => ({ ...readOnlyJob, status }));
    mocks.setJobSucceeded.mockResolvedValue(finalJob);
    mocks.readLiveAdminSources.mockResolvedValue(makeLiveAdminRead());
    mocks.writeSystemAuditLog.mockResolvedValue({ _id: idOf("audit-readonly-1") });

    const { runJobNow } = await import("../server/src/services/jobs.worker");
    await expect(runJobNow("job-admin-readonly-1")).resolves.toBe(finalJob);

    expect(mocks.readLiveAdminSources).toHaveBeenCalledWith("site-1", {
      persist: false,
      jobId: "job-admin-readonly-1",
      capturedBy: "operator"
    });
    expect(mocks.setJobResult).toHaveBeenCalledWith(
      "job-admin-readonly-1",
      expect.objectContaining({
        mode: "read-only",
        readOnly: true,
        persistedSnapshot: false,
        adminsCount: 3
      }),
      "Admin sync result recorded"
    );
    expect(mocks.Site.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it("queues sync admin sync by marking the Site status as running", async () => {
    const job = {
      _id: idOf("job-admin-sync-1"),
      type: "admin-sync",
      status: "queued"
    };

    const site = makeSite();
    mocks.Site.findById.mockResolvedValue(site);
    mocks.createJob.mockResolvedValue(job);

    const adminsService = await import("../server/src/services/admins.service");
    const enqueueAdminSync = (adminsService as any).enqueueAdminSync;
    await enqueueAdminSync({
      siteId: "site-1",
      createdBy: "operator",
      mode: "sync"
    });

    expect(mocks.Site.findByIdAndUpdate).toHaveBeenCalledWith(site._id, { adminSyncStatus: "running" });
  });

  it("runs health-check jobs through the worker and stores read-only evidence", async () => {
    const healthJob = {
      _id: idOf("job-health-1"),
      type: "health-check",
      status: "failed",
      requiresApproval: false,
      createdBy: "scheduler",
      siteId: idOf("site-1"),
      payload: { scheduled: true }
    };
    const finalJob = { ...healthJob, status: "succeeded" };
    const healthResult = {
      checkedAt: "2026-05-14T09:00:00.000Z",
      siteId: "site-1",
      siteCode: "alpha",
      derivedHealthStatus: "healthy",
      health: {
        siteDbExists: true,
        usersDbExists: true,
        distExists: true,
        indexExists: true
      },
      evidence: [
        { key: "siteDbExists", label: "siteDB", url: "https://portal/sites/alpha/siteDB", ok: true },
        { key: "indexExists", label: "index", url: "https://portal/sites/alpha/dist/index.html", ok: true }
      ]
    };

    mocks.Job.findById.mockResolvedValueOnce(healthJob).mockResolvedValueOnce(finalJob);
    mocks.Job.findByIdAndUpdate.mockResolvedValue({ ...healthJob, status: "queued" });
    mocks.claimNextJob.mockResolvedValue(healthJob);
    mocks.setJobStatus.mockImplementation(async (_jobId, status) => ({ ...healthJob, status }));
    mocks.setJobSucceeded.mockResolvedValue(finalJob);
    mocks.runReadOnlySharePointHealthCheck.mockResolvedValue(healthResult);
    mocks.writeSystemAuditLog.mockResolvedValue({ _id: idOf("audit-health-1") });

    const { runJobNow } = await import("../server/src/services/jobs.worker");
    await expect(runJobNow("job-health-1")).resolves.toBe(finalJob);

    expect(mocks.runReadOnlySharePointHealthCheck).toHaveBeenCalledWith("site-1");
    expect(mocks.setJobTargetPaths).toHaveBeenCalledWith(
      "job-health-1",
      ["https://portal/sites/alpha/siteDB", "https://portal/sites/alpha/dist/index.html"],
      "Recorded 2 health-check probe URLs"
    );
    expect(mocks.setJobEvidence).toHaveBeenCalledWith(
      "job-health-1",
      healthResult.evidence,
      "Health-check evidence recorded"
    );
    expect(mocks.setJobResult).toHaveBeenCalledWith(
      "job-health-1",
      expect.objectContaining({
        siteId: "site-1",
        siteCode: "alpha",
        derivedHealthStatus: "healthy",
        evidenceCount: 2,
        failedCount: 0,
        scheduled: true
      }),
      "Health-check result recorded"
    );
  });

  it("blocks approval-gated backup execution when approval metadata is missing", async () => {
    const originalJob = {
      _id: idOf("rerun-backup-unapproved-1"),
      type: "backup",
      status: "failed",
      requiresApproval: false,
      createdBy: "operator",
      siteId: idOf("site-1"),
      payload: {}
    };
    const backupJob = {
      _id: idOf("job-backup-unapproved-1"),
      type: "backup",
      status: "failed",
      requiresApproval: true,
      createdBy: "operator",
      siteId: idOf("site-1"),
      payload: {}
    };
    const failedJob = { ...backupJob, status: "failed", errorMessage: "backup-job-requires-approval" };

    mocks.Job.findById.mockResolvedValueOnce(originalJob).mockResolvedValueOnce(failedJob);
    mocks.Job.findByIdAndUpdate.mockResolvedValue({ ...originalJob, status: "queued" });
    mocks.claimNextJob.mockResolvedValue(backupJob);
    mocks.setJobStatus.mockImplementation(async (_jobId, status) => ({ ...backupJob, status }));
    mocks.setJobFailed.mockResolvedValue(failedJob);
    mocks.writeSystemAuditLog.mockResolvedValue({ _id: idOf("audit-backup-block-1") });

    const { runJobNow } = await import("../server/src/services/jobs.worker");
    await expect(runJobNow("rerun-backup-unapproved-1")).resolves.toBe(failedJob);

    expect(mocks.executeSharePointBackup).not.toHaveBeenCalled();
    expect(mocks.assertSharePointWriteAvailable).not.toHaveBeenCalled();
    expect(mocks.setJobFailed).toHaveBeenCalledWith("job-backup-unapproved-1", "backup-job-requires-approval");
  });

  it("adds Site Collection admins through SharePoint and verifies the refreshed snapshot", async () => {
    const ensuredUser = {
      id: 42,
      displayName: siteCollectionOnlyAdmin.displayName,
      personalNumber: siteCollectionOnlyAdmin.personalNumber,
      email: siteCollectionOnlyAdmin.email,
      loginName: siteCollectionOnlyAdmin.loginName,
      raw: {}
    };

    mocks.Site.findById.mockResolvedValue(makeSite());
    mocks.getRequestDigest.mockResolvedValue("digest-value");
    mocks.ensureSharePointUser.mockResolvedValue(ensuredUser);
    mocks.setSharePointSiteCollectionAdmin.mockResolvedValue(undefined);
    mocks.readLiveAdminSources.mockResolvedValue(makeLiveAdminRead());

    const adminsService = await import("../server/src/services/admins.service");
    const addSiteAdmin = (adminsService as any).addSiteAdmin;
    await addSiteAdmin({
      siteId: "site-1",
      admin: { ...siteCollectionOnlyAdmin, source: "siteCollection" }
    });

    expect(mocks.assertSharePointWriteAvailable).toHaveBeenCalledTimes(1);
    expect(mocks.ensureSharePointUser).toHaveBeenCalledWith(
      expect.objectContaining({ siteCode: "alpha" }),
      siteCollectionOnlyAdmin.loginName,
      "digest-value"
    );
    expect(mocks.setSharePointSiteCollectionAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ siteCode: "alpha" }),
      ensuredUser,
      true,
      "digest-value"
    );
    expect(mocks.readLiveAdminSources).toHaveBeenCalledWith("site-1", {
      persist: true,
      capturedBy: "system"
    });
  });

  it("removes Owners Group admins through SharePoint and verifies absence after refresh", async () => {
    mocks.Site.findById.mockResolvedValue(makeSite({
      ownersGroupAdmins: [ownersGroupOnlyAdmin]
    }));
    mocks.getRequestDigest.mockResolvedValue("digest-value");
    mocks.getAssociatedOwnerGroupId.mockResolvedValue({ id: 7, title: "Alpha Owners", raw: {} });
    mocks.removeSharePointUserFromGroup.mockResolvedValue(undefined);
    mocks.readLiveAdminSources.mockResolvedValue(makeLiveAdminRead({
      ownersGroupAdmins: [],
      adminsCount: 2,
      sourceStatus: [
        { source: "txt", ok: true, count: 1 },
        { source: "siteCollection", ok: true, count: 2 },
        { source: "ownersGroup", ok: true, count: 0 }
      ]
    }));

    const adminsService = await import("../server/src/services/admins.service");
    const removeSiteAdmin = (adminsService as any).removeSiteAdmin;
    await removeSiteAdmin({
      siteId: "site-1",
      adminId: ownersGroupOnlyAdmin.personalNumber,
      source: "ownersGroup"
    });

    expect(mocks.assertSharePointWriteAvailable).toHaveBeenCalledTimes(1);
    expect(mocks.getAssociatedOwnerGroupId).toHaveBeenCalledWith(expect.objectContaining({ siteCode: "alpha" }));
    expect(mocks.removeSharePointUserFromGroup).toHaveBeenCalledWith(
      expect.objectContaining({ siteCode: "alpha" }),
      7,
      ownersGroupOnlyAdmin.loginName,
      "digest-value"
    );
    expect(mocks.readLiveAdminSources).toHaveBeenCalledWith("site-1", {
      persist: true,
      capturedBy: "system"
    });
  });
});
