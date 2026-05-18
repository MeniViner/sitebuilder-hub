import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  Site: {
    findById: vi.fn()
  },
  Release: {
    findById: vi.fn()
  },
  SiteVersionDeployment: {
    create: vi.fn(),
    findByIdAndUpdate: vi.fn()
  },
  createJob: vi.fn(),
  assertReleaseArtifactReady: vi.fn(),
  buildSiteDeployPlan: vi.fn(),
  assertRecentVerifiedBackupForDangerousWrite: vi.fn(),
  assertSharePointWriteAvailable: vi.fn(),
  deleteSharePointFile: vi.fn(),
  recycleSharePointFile: vi.fn(),
  uploadSharePointFile: vi.fn(),
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
vi.mock("../server/src/services/jobs.service", () => ({ createJob: mocks.createJob }));
vi.mock("../server/src/services/deployArtifact.service", () => ({
  assertReleaseArtifactReady: mocks.assertReleaseArtifactReady,
  buildSiteDeployPlan: mocks.buildSiteDeployPlan
}));
vi.mock("../server/src/services/writeSafety.service", () => ({
  assertRecentVerifiedBackupForDangerousWrite: mocks.assertRecentVerifiedBackupForDangerousWrite
}));
vi.mock("../server/src/services/sharepointOperationClient", () => ({
  assertSharePointWriteAvailable: mocks.assertSharePointWriteAvailable,
  deleteSharePointFile: mocks.deleteSharePointFile,
  recycleSharePointFile: mocks.recycleSharePointFile,
  uploadSharePointFile: mocks.uploadSharePointFile
}));
vi.mock("../server/src/utils/logger", () => ({ logger: mocks.logger }));

const idOf = (value: string) => ({ toString: () => value });

const makeSite = () => ({
  _id: idOf("site-1"),
  siteCode: "alpha",
  displayName: "Alpha Site",
  currentVersion: "1.2.3",
  version: "1.2.3",
  sharePointSiteUrl: "https://portal.army.idf/sites/alpha",
  sharePointStatus: { deployStatus: "idle" }
});

const makeRelease = () => ({
  _id: idOf("release-1"),
  version: "1.2.4",
  releaseType: "patch",
  artifactRef: "/artifacts/1.2.4"
});

const makeDeployment = () => ({
  _id: idOf("deployment-1"),
  status: "queued",
  fromVersion: "1.2.3",
  toVersion: "1.2.4",
  deploymentKind: "deploy"
});

const makeBackupSafety = () => ({
  policy: "recent-verified-backup",
  operation: "deploy",
  required: true,
  satisfied: true,
  checkedAt: "2026-05-14T10:00:00.000Z",
  backup: {
    id: "backup-1",
    backupId: "backup-2026-05-14",
    status: "verified",
    verificationStatus: "verified",
    storagePath: "/sites/alpha/siteDB/siteAssets/Backups/backup-2026-05-14",
    ageHours: 1
  }
});

const makeDeployPlan = () => ({
  generatedAt: "2026-05-14T10:00:00.000Z",
  releaseId: "release-1",
  releaseVersion: "1.2.4",
  artifactRef: "/artifacts/1.2.4",
  artifactRoot: "/artifacts/1.2.4",
  siteId: "site-1",
  siteCode: "alpha",
  resolvedPaths: {
    finalDistRoot: "/sites/alpha/siteDB/dist",
    finalAppUrl: "https://portal.army.idf/sites/alpha/siteDB/dist/index.html"
  },
  files: [
    {
      relativePath: "index.html",
      targetPath: "/sites/alpha/siteDB/dist/index.html",
      sizeBytes: 101,
      sha256: "index-sha"
    },
    {
      relativePath: "assets/app.js",
      targetPath: "/sites/alpha/siteDB/dist/assets/app.js",
      sizeBytes: 202,
      sha256: "app-sha"
    }
  ],
  targetDistInventory: {
    root: "/sites/alpha/siteDB/dist",
    mode: "read-only",
    readOnly: true,
    filesCount: 3,
    staleFilesCount: 1,
    deleteEnabled: false,
    staleFiles: [
      {
        relativePath: "assets/legacy.js",
        serverRelativeUrl: "/sites/alpha/siteDB/dist/assets/legacy.js",
        reason: "absent-from-release-artifact",
        defaultAction: "keep"
      }
    ]
  },
  staleFilePolicy: {
    defaultAction: "keep",
    deleteEnabled: false,
    summary: "1 stale target dist file is absent from the release artifact and will be kept by default."
  },
  summary: {
    filesCount: 2,
    totalSizeBytes: 303,
    hasIndexHtml: true,
    hasManifest: true,
    readyForDeploy: true,
    readyForDeployExecution: false
  },
  capabilities: {
    readAvailable: true,
    writeAvailable: false,
    digest: {
      canRequest: false
    }
  },
  blockers: ["sharepoint-write-not-configured"],
  notes: [
    "Deploy execution overwrites listed files in final dist but does not mirror-delete files that are absent from the artifact.",
    "1 stale target dist file is absent from the release artifact and will be kept by default."
  ]
});

beforeEach(() => {
  vi.resetModules();
  mocks.Site.findById.mockReset();
  mocks.Release.findById.mockReset();
  mocks.SiteVersionDeployment.create.mockReset();
  mocks.SiteVersionDeployment.findByIdAndUpdate.mockReset();
  mocks.createJob.mockReset();
  mocks.assertReleaseArtifactReady.mockReset();
  mocks.buildSiteDeployPlan.mockReset();
  mocks.assertRecentVerifiedBackupForDangerousWrite.mockReset();
  mocks.assertSharePointWriteAvailable.mockReset();
  mocks.deleteSharePointFile.mockReset();
  mocks.recycleSharePointFile.mockReset();
  mocks.uploadSharePointFile.mockReset();
  mocks.logger.isPayloadLoggingEnabled.mockReturnValue(false);
});

describe("deploy stale file approval snapshot", () => {
  it("summarizes read-only stale target dist files in deploy approval without scheduling deletion by default", async () => {
    const site = makeSite();
    const release = makeRelease();
    const deployment = makeDeployment();
    const job = {
      _id: idOf("job-1"),
      status: "awaiting-approval"
    };

    mocks.Site.findById.mockResolvedValue(site);
    mocks.Release.findById.mockResolvedValue(release);
    mocks.SiteVersionDeployment.create.mockResolvedValue(deployment);
    mocks.createJob.mockResolvedValue(job);
    mocks.assertReleaseArtifactReady.mockResolvedValue({ summary: { readyForDeploy: true } });
    mocks.buildSiteDeployPlan.mockResolvedValue(makeDeployPlan());
    mocks.assertRecentVerifiedBackupForDangerousWrite.mockResolvedValue(makeBackupSafety());

    const { enqueueDeploySite } = await import("../server/src/services/releases.service");
    await enqueueDeploySite({
      siteId: "site-1",
      releaseId: "release-1",
      createdBy: "operator"
    });

    const jobInput = mocks.createJob.mock.calls[0][0];
    const approvalSnapshotJson = JSON.stringify(jobInput.approvalSnapshot);

    expect(mocks.buildSiteDeployPlan).toHaveBeenCalledWith("site-1", "release-1");
    expect(approvalSnapshotJson).toContain("assets/legacy.js");
    expect(approvalSnapshotJson).toContain("absent-from-release-artifact");
    expect(approvalSnapshotJson).toContain("read-only");
    expect(approvalSnapshotJson).toContain("keep");
    expect(approvalSnapshotJson).toContain("deleteEnabled");
    expect(approvalSnapshotJson).toContain("false");
    expect(approvalSnapshotJson).not.toContain("\"delete\"");
    expect(jobInput.approvalSnapshot.writeOperations).not.toContain(
      "Delete stale files from the SharePoint final dist folder"
    );
    expect(mocks.deleteSharePointFile).not.toHaveBeenCalled();
    expect(mocks.recycleSharePointFile).not.toHaveBeenCalled();
    expect(mocks.uploadSharePointFile).not.toHaveBeenCalled();
  });
});
