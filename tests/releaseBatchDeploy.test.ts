import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  Site: {
    find: vi.fn()
  },
  Release: {
    find: vi.fn(),
    findById: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn()
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
    error: vi.fn(),
    isPayloadLoggingEnabled: vi.fn(() => false)
  }
}));

vi.mock("../server/src/models/Site", () => ({ Site: mocks.Site }));
vi.mock("../server/src/models/Release", () => ({ Release: mocks.Release }));
vi.mock("../server/src/models/SiteVersionDeployment", () => ({ SiteVersionDeployment: mocks.SiteVersionDeployment }));
vi.mock("../server/src/services/jobs.service", () => ({ createJob: mocks.createJob }));
vi.mock("../server/src/services/sharepointOperationClient", () => ({
  assertSharePointWriteAvailable: mocks.assertSharePointWriteAvailable
}));
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
    HUB_LOCAL_DEV_DEPLOY_REQUIRES_BACKUP: false,
    HUB_PRODUCTION_DEPLOY_REQUIRES_BACKUP: true,
    HUB_PRODUCTION_DEPLOY_REQUIRES_APPROVAL: true,
    HUB_ADVANCED_APPROVALS_ENABLED: true
  },
  ownerDirectModeEnabled: () => false
}));

const idOf = (value: string) => ({ toString: () => value });

const makeRelease = (overrides: Record<string, unknown> = {}) => ({
  _id: idOf("release-1"),
  version: "1.2.4",
  releaseType: "patch",
  artifactRef: "/tmp/artifact",
  status: "active",
  ...overrides
});

const makeSite = (id: string, currentVersion: string, overrides: Record<string, unknown> = {}) => ({
  _id: idOf(id),
  siteCode: id,
  displayName: `${id} site`,
  environment: "production",
  status: "active",
  currentVersion,
  version: currentVersion,
  sharePointSiteUrl: `https://portal.army.idf/sites/${id}`,
  ...overrides
});

const makePlan = (siteId: string, overrides: Record<string, unknown> = {}) => ({
  generatedAt: "2026-06-15T10:00:00.000Z",
  deployMode: "local-dev-owner",
  deployPolicy: {
    mode: "local-dev-owner",
    label: "Owner-direct deploy",
    productionSafeMode: false,
    localDevOwnerMode: true,
    requiresApproval: false,
    requiresRecentVerifiedBackup: false,
    ownerOverrideAllowed: true,
    checkedAt: "2026-06-15T10:00:00.000Z",
    warning: "",
    blockers: []
  },
  releaseId: "release-1",
  releaseVersion: "1.2.4",
  artifactRef: "/tmp/artifact",
  artifactRoot: "/tmp/artifact",
  siteId,
  siteCode: siteId,
  files: [{ relativePath: "index.html", sourcePath: "/tmp/artifact/index.html", targetPath: `/sites/${siteId}/dist/index.html`, sizeBytes: 42, sha256: "sha" }],
  summary: {
    filesCount: 1,
    totalSizeBytes: 42,
    hasIndexHtml: true,
    hasManifest: true,
    readyForDeploy: true,
    readyForDeployExecution: true,
    staleTargetFilesCount: 0
  },
  capabilities: {
    readAvailable: true,
    writeEnabled: true,
    hasAuthMaterial: true,
    unauthenticatedWriteAllowed: false,
    writeAvailable: true,
    authMode: "bearer"
  },
  blockers: [],
  missingRequirements: [],
  notes: [],
  ...overrides
});

beforeEach(() => {
  vi.resetModules();
  Object.values(mocks).forEach((mockGroup) => {
    Object.values(mockGroup as Record<string, unknown>).forEach((value) => {
      if (vi.isMockFunction(value)) value.mockReset();
    });
  });
  mocks.logger.isPayloadLoggingEnabled.mockReturnValue(false);
  mocks.Release.findById.mockResolvedValue(makeRelease());
  mocks.Release.findOne.mockResolvedValue(null);
  mocks.Release.create.mockImplementation(async (payload) => ({ _id: idOf("release-created"), ...payload, toObject: () => payload }));
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
  mocks.buildSiteDeployPlan.mockImplementation(async (siteId: string) => makePlan(siteId));
});

describe("release creation", () => {
  it("creates an explicit release without deploying it", async () => {
    const { createRelease } = await import("../server/src/services/releases.service");

    const release = await createRelease({
      version: "2.0.0",
      releaseType: "major",
      notes: "Major release",
      artifactRef: "/tmp/artifact",
      createdBy: "operator"
    });

    expect(release.version).toBe("2.0.0");
    expect(mocks.Release.create).toHaveBeenCalledWith(expect.objectContaining({
      version: "2.0.0",
      releaseType: "major",
      artifactRef: "/tmp/artifact"
    }));
    expect(mocks.createJob).not.toHaveBeenCalled();
  });
});

describe("batch deploy planning", () => {
  it("supports all-sites plans and marks ready, up-to-date, and blocked target rows", async () => {
    mocks.Site.find.mockResolvedValue([
      makeSite("behind", "1.2.3"),
      makeSite("current", "1.2.4"),
      makeSite("ahead", "1.2.5")
    ]);
    const { buildBatchDeployPlan } = await import("../server/src/services/releases.service");

    const plan = await buildBatchDeployPlan({
      releaseId: "release-1",
      targetMode: "all",
      deployMode: "local-dev-owner"
    });

    expect(plan.summary).toMatchObject({
      totalSelectedSites: 3,
      readySites: 1,
      blockedSites: 1,
      alreadyUpToDateSites: 1,
      executionReady: false
    });
    expect(plan.results.map((row) => [row.siteCode, row.status])).toEqual([
      ["behind", "ready"],
      ["current", "up_to_date"],
      ["ahead", "blocked"]
    ]);
    expect(mocks.buildSiteDeployPlan).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["single" as const, ["site-1"]],
    ["selected" as const, ["site-1", "site-2"]]
  ])("supports %s target mode", async (targetMode, siteIds) => {
    mocks.Site.find.mockResolvedValue(siteIds.map((id) => makeSite(id, "1.2.3")));
    const { buildBatchDeployPlan } = await import("../server/src/services/releases.service");

    const plan = await buildBatchDeployPlan({
      releaseId: "release-1",
      targetMode,
      targetSiteIds: siteIds,
      deployMode: "local-dev-owner"
    });

    expect(plan.targetMode).toBe(targetMode);
    expect(plan.targetSiteIds).toEqual(siteIds);
    expect(plan.summary.readySites).toBe(siteIds.length);
  });

  it("blocks every behind target when the release artifact is missing", async () => {
    mocks.Release.findById.mockResolvedValue(makeRelease({ artifactRef: "" }));
    mocks.Site.find.mockResolvedValue([makeSite("site-1", "1.2.3")]);
    const { buildBatchDeployPlan } = await import("../server/src/services/releases.service");

    const plan = await buildBatchDeployPlan({
      releaseId: "release-1",
      targetMode: "selected",
      targetSiteIds: ["site-1"],
      deployMode: "local-dev-owner"
    });

    expect(plan.summary.executionReady).toBe(false);
    expect(plan.results[0].blockers).toContain("Deploy cannot run because the release artifact is missing.");
    expect(mocks.buildSiteDeployPlan).not.toHaveBeenCalled();
  });

  it("keeps execution disabled for SharePoint write and dry-run blockers", async () => {
    mocks.Site.find.mockResolvedValue([makeSite("site-1", "1.2.3")]);
    mocks.buildSiteDeployPlan.mockResolvedValue(makePlan("site-1", {
      summary: {
        filesCount: 1,
        totalSizeBytes: 42,
        hasIndexHtml: true,
        hasManifest: true,
        readyForDeploy: true,
        readyForDeployExecution: false
      },
      capabilities: {
        readAvailable: true,
        writeEnabled: false,
        hasAuthMaterial: false,
        unauthenticatedWriteAllowed: false,
        writeAvailable: false,
        authMode: "none"
      },
      blockers: ["sharepoint-write-not-configured"],
      missingRequirements: ["Deploy cannot run because SharePoint write is not configured."]
    }));
    const { buildBatchDeployPlan } = await import("../server/src/services/releases.service");

    const plan = await buildBatchDeployPlan({
      releaseId: "release-1",
      targetMode: "selected",
      targetSiteIds: ["site-1"],
      deployMode: "local-dev-owner"
    });

    expect(plan.summary.executionReady).toBe(false);
    expect(plan.results[0].status).toBe("blocked");
    expect(plan.results[0].blockers).toEqual(expect.arrayContaining([
      "sharepoint-write-not-configured",
      "Deploy cannot run because SharePoint write is not configured.",
      "Dry-run did not pass all execution gates."
    ]));
  });

  it("does not block browser-sharepoint plans just because backend SharePoint write is unavailable", async () => {
    mocks.Site.find.mockResolvedValue([makeSite("site-1", "1.2.3")]);
    mocks.buildSiteDeployPlan.mockResolvedValue(makePlan("site-1", {
      connectorMode: "browser-sharepoint",
      summary: {
        filesCount: 1,
        totalSizeBytes: 42,
        hasIndexHtml: true,
        hasManifest: true,
        readyForDeploy: true,
        readyForDeployExecution: true
      },
      capabilities: {
        readAvailable: true,
        writeEnabled: false,
        hasAuthMaterial: false,
        unauthenticatedWriteAllowed: false,
        writeAvailable: false,
        authMode: "none"
      },
      blockers: [],
      missingRequirements: ["Browser deploy requires browser Digest and per-file upload verification at execution time."],
      browserConnector: {
        connectorMode: "browser-sharepoint",
        backendSharePointRequired: false,
        artifactManifestRequired: true,
        digestRequiredPerTargetSite: true,
        uploadImplementedInBrowser: true,
        readinessSource: "browser-digest-and-upload"
      }
    }));
    const { buildBatchDeployPlan } = await import("../server/src/services/releases.service");

    const plan = await buildBatchDeployPlan({
      releaseId: "release-1",
      targetMode: "selected",
      targetSiteIds: ["site-1"],
      deployMode: "local-dev-owner",
      connectorMode: "browser-sharepoint"
    });

    expect(plan.connectorMode).toBe("browser-sharepoint");
    expect(plan.summary.readySites).toBe(1);
    expect(plan.summary.executionReady).toBe(true);
    expect(plan.results[0].status).toBe("ready");
    expect(plan.results[0].blockers).not.toContain("Browser deploy requires browser Digest and per-file upload verification at execution time.");
    expect(mocks.buildSiteDeployPlan).toHaveBeenCalledWith("site-1", "release-1", expect.objectContaining({
      connectorMode: "browser-sharepoint"
    }));
  });
});

describe("batch deploy execution", () => {
  it("does not queue partial deploys when any target is blocked", async () => {
    mocks.Site.find.mockResolvedValue([
      makeSite("site-1", "1.2.3"),
      makeSite("site-2", "1.2.3")
    ]);
    mocks.buildSiteDeployPlan.mockImplementation(async (siteId: string) => {
      if (siteId === "site-2") {
        return makePlan(siteId, {
          summary: {
            filesCount: 1,
            totalSizeBytes: 42,
            hasIndexHtml: true,
            hasManifest: true,
            readyForDeploy: true,
            readyForDeployExecution: false
          },
          blockers: ["site-specific-blocker"],
          missingRequirements: ["Dry-run blocker"]
        });
      }
      return makePlan(siteId);
    });
    const { enqueueBatchDeploy } = await import("../server/src/services/releases.service");

    await expect(enqueueBatchDeploy({
      releaseId: "release-1",
      targetMode: "selected",
      targetSiteIds: ["site-1", "site-2"],
      deployMode: "local-dev-owner",
      createdBy: "operator",
      confirmNoPartial: true
    })).rejects.toThrow("batch-deploy-plan-has-blockers");

    expect(mocks.assertSharePointWriteAvailable).not.toHaveBeenCalled();
    expect(mocks.SiteVersionDeployment.create).not.toHaveBeenCalled();
    expect(mocks.createJob).not.toHaveBeenCalled();
  });

  it("queues only ready rows and skips already-up-to-date sites after a clean batch plan", async () => {
    mocks.Site.find.mockResolvedValue([
      makeSite("site-1", "1.2.3"),
      makeSite("current", "1.2.4")
    ]);
    const { enqueueBatchDeploy } = await import("../server/src/services/releases.service");

    const result = await enqueueBatchDeploy({
      releaseId: "release-1",
      targetMode: "all",
      deployMode: "local-dev-owner",
      createdBy: "operator",
      confirmNoPartial: true
    });

    expect(result.queued).toBe(1);
    expect(result.skippedUpToDate).toBe(1);
    expect(mocks.SiteVersionDeployment.create).toHaveBeenCalledTimes(1);
    expect(mocks.createJob).toHaveBeenCalledTimes(1);
  });
});
