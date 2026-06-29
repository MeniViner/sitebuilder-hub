import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  Site: {
    find: vi.fn()
  },
  Release: {
    findById: vi.fn()
  },
  SiteVersionDeployment: {
    create: vi.fn(),
    findByIdAndUpdate: vi.fn()
  },
  createJob: vi.fn(),
  assertSharePointWriteAvailable: vi.fn(),
  assertReleaseArtifactReady: vi.fn(),
  buildSiteDeployPlan: vi.fn(),
  assertRecentVerifiedBackupForDangerousWrite: vi.fn(),
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock("../server/src/models/Site", () => ({ Site: mocks.Site }));
vi.mock("../server/src/models/Release", () => ({ Release: mocks.Release }));
vi.mock("../server/src/models/SiteVersionDeployment", () => ({ SiteVersionDeployment: mocks.SiteVersionDeployment }));
vi.mock("../server/src/services/jobs.service", () => ({ createJob: mocks.createJob }));
vi.mock("../server/src/services/sharepointOperationClient", () => ({ assertSharePointWriteAvailable: mocks.assertSharePointWriteAvailable }));
vi.mock("../server/src/services/deployArtifact.service", () => ({
  assertReleaseArtifactReady: mocks.assertReleaseArtifactReady,
  buildSiteDeployPlan: mocks.buildSiteDeployPlan
}));
vi.mock("../server/src/services/writeSafety.service", () => ({
  assertRecentVerifiedBackupForDangerousWrite: mocks.assertRecentVerifiedBackupForDangerousWrite
}));
vi.mock("../server/src/utils/logger", () => ({ logger: mocks.logger }));
vi.mock("../server/src/config/env", () => ({
  env: {
    NODE_ENV: "test",
    HUB_LOCAL_DEV_DEPLOY_REQUIRES_BACKUP: true,
    HUB_PRODUCTION_DEPLOY_REQUIRES_BACKUP: true,
    HUB_PRODUCTION_DEPLOY_REQUIRES_APPROVAL: true,
    HUB_ADVANCED_APPROVALS_ENABLED: true
  },
  ownerDirectModeEnabled: () => false
}));

const idOf = (value: string) => ({ toString: () => value });

const site = {
  _id: idOf("site-1"),
  siteCode: "alpha",
  displayName: "Alpha",
  environment: "dev",
  status: "active",
  currentVersion: "1.2.3",
  version: "1.2.3",
  sharePointSiteUrl: "https://portal.army.idf/sites/alpha"
};

const release = {
  _id: idOf("release-1"),
  version: "1.2.4",
  artifactRef: "/tmp/artifact"
};

const deployPlan = {
  summary: {
    filesCount: 1,
    totalSizeBytes: 10,
    hasIndexHtml: true,
    hasManifest: true,
    readyForDeploy: true,
    readyForDeployExecution: true,
    staleTargetFilesCount: 0
  },
  blockers: [],
  missingRequirements: [],
  warnings: [],
  notes: [],
  deployPolicy: { warning: "" },
  targetInventory: { readOk: true },
  files: [{ relativePath: "index.html", targetPath: "/sites/alpha/siteDB/dist/index.html", sizeBytes: 10, sha256: "sha" }]
};

beforeEach(() => {
  vi.resetModules();
  Object.values(mocks).forEach((mockGroup) => {
    Object.values(mockGroup as Record<string, unknown>).forEach((value) => {
      if (vi.isMockFunction(value)) value.mockReset();
    });
  });
  mocks.Site.find.mockResolvedValue([site]);
  mocks.Release.findById.mockResolvedValue(release);
  mocks.SiteVersionDeployment.create.mockResolvedValue({
    _id: idOf("deployment-1"),
    status: "queued",
    fromVersion: "1.2.3",
    toVersion: "1.2.4",
    logLines: []
  });
  mocks.SiteVersionDeployment.findByIdAndUpdate.mockResolvedValue(undefined);
  mocks.createJob.mockResolvedValue({ _id: idOf("job-1"), requiresApproval: false, status: "queued" });
  mocks.assertSharePointWriteAvailable.mockResolvedValue(undefined);
  mocks.assertReleaseArtifactReady.mockResolvedValue(undefined);
  mocks.buildSiteDeployPlan.mockResolvedValue(deployPlan);
  mocks.assertRecentVerifiedBackupForDangerousWrite.mockRejectedValue(new Error("dangerous-write-backup-required:deploy"));
});

describe("browser deploy backup override", () => {
  it("blocks local-dev browser deploy without a verified backup when override is not selected", async () => {
    const { buildBatchDeployPlan } = await import("../server/src/services/releases.service");

    const plan = await buildBatchDeployPlan({
      releaseId: "release-1",
      targetMode: "selected",
      targetSiteIds: ["site-1"],
      deployMode: "local-dev-owner",
      connectorMode: "browser-sharepoint",
      allowDeployWithoutBackup: false
    });

    expect(plan.results[0]).toMatchObject({
      status: "blocked",
      blockers: expect.arrayContaining(["dangerous-write-backup-required:deploy"])
    });
  });

  it("allows local-dev browser deploy as warning when the dangerous no-backup override is selected", async () => {
    const { buildBatchDeployPlan } = await import("../server/src/services/releases.service");

    const plan = await buildBatchDeployPlan({
      releaseId: "release-1",
      targetMode: "selected",
      targetSiteIds: ["site-1"],
      deployMode: "local-dev-owner",
      connectorMode: "browser-sharepoint",
      allowDeployWithoutBackup: true
    });

    expect(plan).toMatchObject({
      connectorMode: "browser-sharepoint",
      allowDeployWithoutBackup: true,
      summary: {
        readySites: 1,
        blockedSites: 0,
        warningSites: 1,
        executionReady: true
      }
    });
    expect(plan.results[0]).toMatchObject({
      status: "warning",
      blockers: [],
      warnings: expect.arrayContaining(["backup-override-accepted:deploy"])
    });
  });

  it("keeps the dangerous no-backup override when queueing browser batch execution", async () => {
    const { enqueueBatchDeploy } = await import("../server/src/services/releases.service");

    const result = await enqueueBatchDeploy({
      releaseId: "release-1",
      targetMode: "selected",
      targetSiteIds: ["site-1"],
      deployMode: "local-dev-owner",
      connectorMode: "browser-sharepoint",
      allowDeployWithoutBackup: true,
      confirmNoPartial: true,
      createdBy: "operator"
    });

    expect(result.queued).toBe(1);
    expect(mocks.assertRecentVerifiedBackupForDangerousWrite).toHaveBeenCalledTimes(1);
    expect(mocks.createJob).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({
        backupSafety: expect.objectContaining({
          policy: "local-dev-owner-override",
          required: false,
          satisfied: true,
          reason: "Dangerous no-backup deploy override accepted from browser-sharepoint dry-run."
        })
      })
    }));
  });
});
