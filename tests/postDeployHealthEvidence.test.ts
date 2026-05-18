import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  Site: {
    findById: vi.fn()
  },
  Release: {
    findById: vi.fn()
  },
  SiteVersionDeployment: {
    findById: vi.fn()
  },
  getRequestDigest: vi.fn(),
  getSharePointOperationCapabilities: vi.fn(),
  listSharePointFiles: vi.fn(),
  listSharePointFolders: vi.fn(),
  readSharePointFileEvidence: vi.fn(),
  uploadSharePointFile: vi.fn(),
  getFinalAppUrlHealthEvidence: vi.fn(),
  runReadOnlySharePointHealthCheck: vi.fn(),
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
vi.mock("../server/src/services/sharepointOperationClient", () => ({
  getRequestDigest: mocks.getRequestDigest,
  getSharePointOperationCapabilities: mocks.getSharePointOperationCapabilities,
  listSharePointFiles: mocks.listSharePointFiles,
  listSharePointFolders: mocks.listSharePointFolders,
  readSharePointFileEvidence: mocks.readSharePointFileEvidence,
  uploadSharePointFile: mocks.uploadSharePointFile
}));
vi.mock("../server/src/services/sharepointHealth.service", () => ({
  getFinalAppUrlHealthEvidence: mocks.getFinalAppUrlHealthEvidence,
  runReadOnlySharePointHealthCheck: mocks.runReadOnlySharePointHealthCheck
}));
vi.mock("../server/src/utils/logger", () => ({ logger: mocks.logger }));

const idOf = (value: string) => ({ toString: () => value });

const makeSite = (overrides: Record<string, unknown> = {}) => ({
  _id: idOf("site-1"),
  siteCode: "alpha",
  currentVersion: "1.2.3",
  version: "1.2.3",
  sharePointHost: "portal.army.idf",
  sharePointSiteUrl: "https://portal.army.idf/sites/alpha",
  sharePointStatus: { deployStatus: "idle" },
  save: vi.fn().mockResolvedValue(undefined),
  ...overrides
});

const makeRelease = (artifactRef: string) => ({
  _id: idOf("release-1"),
  version: "1.2.4",
  artifactRef,
  set: vi.fn(),
  save: vi.fn().mockResolvedValue(undefined)
});

const makeDeployment = () => ({
  _id: idOf("deployment-1"),
  status: "queued",
  logLines: [] as Array<Record<string, unknown>>,
  save: vi.fn().mockResolvedValue(undefined),
  verification: undefined as unknown
});

const finalAppUrl = "https://portal.army.idf/sites/alpha/siteDB/dist/index.html";

const makePostHealth = (indexOk: boolean) => ({
  checkedAt: "2026-05-14T10:00:00.000Z",
  siteId: "site-1",
  siteCode: "alpha",
  derivedHealthStatus: indexOk ? "healthy" : "degraded",
  health: {
    distExists: true,
    indexExists: indexOk,
    assetsExists: true
  },
  resolvedPaths: {
    finalDistRoot: "/sites/alpha/siteDB/dist",
    finalAppUrl
  },
  capabilities: {
    writeAvailable: true,
    digest: { canRequest: true }
  },
  evidence: [
    {
      key: "distExists",
      label: "Final dist folder",
      url: "https://portal.army.idf/sites/alpha/_api/web/GetFolderByServerRelativeUrl('/sites/alpha/siteDB/dist')",
      ok: true,
      status: 200
    },
    {
      key: "indexExists",
      label: "Final index.html",
      url: finalAppUrl,
      ok: indexOk,
      status: indexOk ? 200 : 404,
      statusText: indexOk ? "OK" : "Not Found"
    }
  ]
});

let artifactRoot = "";

const writeArtifact = async () => {
  artifactRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sitebuilder-post-health-"));
  await fs.writeFile(path.join(artifactRoot, "index.html"), "<html><script src=\"app.js\"></script></html>");
  await fs.writeFile(path.join(artifactRoot, "app.js"), "console.log('ok');");
  await fs.writeFile(path.join(artifactRoot, "sharepoint-deploy-manifest.json"), JSON.stringify(["index.html", "app.js"]));
  return artifactRoot;
};

beforeEach(() => {
  artifactRoot = "";
  mocks.Site.findById.mockReset();
  mocks.Release.findById.mockReset();
  mocks.SiteVersionDeployment.findById.mockReset();
  mocks.getRequestDigest.mockReset();
  mocks.getSharePointOperationCapabilities.mockReset();
  mocks.listSharePointFiles.mockReset();
  mocks.listSharePointFolders.mockReset();
  mocks.readSharePointFileEvidence.mockReset();
  mocks.uploadSharePointFile.mockReset();
  mocks.getFinalAppUrlHealthEvidence.mockReset();
  mocks.runReadOnlySharePointHealthCheck.mockReset();
  mocks.logger.isPayloadLoggingEnabled.mockReturnValue(false);

  mocks.getSharePointOperationCapabilities.mockReturnValue({
    writeAvailable: true,
    digest: { canRequest: true }
  });
  mocks.listSharePointFiles.mockResolvedValue({
    exists: true,
    files: []
  });
  mocks.listSharePointFolders.mockResolvedValue({
    exists: true,
    folders: []
  });
  mocks.getRequestDigest.mockResolvedValue("digest-1");
  mocks.uploadSharePointFile.mockResolvedValue(undefined);
  mocks.getFinalAppUrlHealthEvidence.mockImplementation((health) => {
    const evidence = health.evidence.find((item: { key: string }) => item.key === "indexExists");
    return evidence ? { ...evidence, checkedAt: health.checkedAt } : undefined;
  });
  mocks.readSharePointFileEvidence.mockImplementation(async (_paths, targetPath, expected) => ({
    status: "verified",
    checkedAt: "2026-05-14T10:00:00.000Z",
    sizeBytes: expected.sizeBytes,
    sha256: expected.sha256,
    sizeMatches: true,
    sha256Matches: true,
    httpStatus: 200,
    targetPath
  }));
});

afterEach(async () => {
  if (artifactRoot) {
    await fs.rm(artifactRoot, { recursive: true, force: true });
  }
});

describe("post-deploy SharePoint health evidence", () => {
  it("runs read-only health after file verification and persists final app URL/index evidence", async () => {
    const release = makeRelease(await writeArtifact());
    const site = makeSite();
    const deployment = makeDeployment();
    const postHealth = makePostHealth(true);

    mocks.Site.findById.mockResolvedValue(site);
    mocks.Release.findById.mockResolvedValue(release);
    mocks.SiteVersionDeployment.findById.mockResolvedValue(deployment);
    mocks.runReadOnlySharePointHealthCheck.mockResolvedValue(postHealth);

    const { executeSharePointDeploy } = await import("../server/src/services/deployArtifact.service");
    const result = await executeSharePointDeploy({
      siteId: "site-1",
      releaseId: "release-1",
      deploymentId: "deployment-1"
    });

    expect(result.deployment).toBe(deployment);
    expect(mocks.readSharePointFileEvidence).toHaveBeenCalledTimes(2);
    expect(mocks.runReadOnlySharePointHealthCheck).toHaveBeenCalledWith("site-1");
    expect(mocks.runReadOnlySharePointHealthCheck.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.readSharePointFileEvidence.mock.invocationCallOrder[1]
    );
    expect(deployment.status).toBe("succeeded");
    expect(deployment.verification).toMatchObject({
      status: "verified",
      filesCount: 2,
      verifiedFilesCount: 2,
      finalAppUrlVerification: {
        key: "indexExists",
        label: "Final index.html",
        url: finalAppUrl,
        ok: true,
        status: 200
      },
      postHealth: {
        checkedAt: "2026-05-14T10:00:00.000Z",
        derivedHealthStatus: "healthy",
        health: {
          indexExists: true
        },
        evidence: expect.arrayContaining([
          expect.objectContaining({
            key: "indexExists",
            url: finalAppUrl,
            ok: true
          })
        ])
      }
    });
  });

  it("fails deployment when final app URL/index post-health evidence is not ok", async () => {
    const release = makeRelease(await writeArtifact());
    const site = makeSite();
    const deployment = makeDeployment();
    const postHealth = makePostHealth(false);

    mocks.Site.findById.mockResolvedValue(site);
    mocks.Release.findById.mockResolvedValue(release);
    mocks.SiteVersionDeployment.findById.mockResolvedValue(deployment);
    mocks.runReadOnlySharePointHealthCheck.mockResolvedValue(postHealth);

    const { executeSharePointDeploy } = await import("../server/src/services/deployArtifact.service");

    await expect(
      executeSharePointDeploy({
        siteId: "site-1",
        releaseId: "release-1",
        deploymentId: "deployment-1"
      })
    ).rejects.toThrow("deploy-final-app-url-verification-failed");

    expect(mocks.readSharePointFileEvidence).toHaveBeenCalledTimes(2);
    expect(mocks.runReadOnlySharePointHealthCheck).toHaveBeenCalledWith("site-1");
    expect(deployment.status).toBe("failed");
    expect(deployment.error).toBe(`deploy-final-app-url-verification-failed:${finalAppUrl}`);
    expect(deployment.verification).toMatchObject({
      status: "failed",
      filesCount: 2,
      verifiedFilesCount: 2,
      finalAppUrlVerification: {
        key: "indexExists",
        url: finalAppUrl,
        ok: false,
        status: 404
      },
      postHealth: {
        derivedHealthStatus: "degraded",
        health: {
          indexExists: false
        }
      }
    });
  });
});
