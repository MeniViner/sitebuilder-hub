import crypto from "crypto";
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
    findById: vi.fn(),
    create: vi.fn()
  },
  getRequestDigest: vi.fn(),
  getSharePointOperationCapabilities: vi.fn(),
  listSharePointFiles: vi.fn(),
  listSharePointFolders: vi.fn(),
  readSharePointFileEvidence: vi.fn(),
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
vi.mock("../server/src/services/sharepointOperationClient", () => ({
  getRequestDigest: mocks.getRequestDigest,
  getSharePointOperationCapabilities: mocks.getSharePointOperationCapabilities,
  listSharePointFiles: mocks.listSharePointFiles,
  listSharePointFolders: mocks.listSharePointFolders,
  readSharePointFileEvidence: mocks.readSharePointFileEvidence,
  uploadSharePointFile: mocks.uploadSharePointFile
}));
vi.mock("../server/src/utils/logger", () => ({ logger: mocks.logger }));

const idOf = (value: string) => ({ toString: () => value });
const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const finalAppUrl = "https://portal.army.idf/sites/alpha/siteDB/dist/index.html";

let artifactRoot = "";

const writeArtifact = async () => {
  artifactRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sitebuilder-post-health-"));
  await fs.mkdir(path.join(artifactRoot, "assets"), { recursive: true });
  await fs.writeFile(path.join(artifactRoot, "index.html"), "index");
  await fs.writeFile(path.join(artifactRoot, "assets", "app.js"), "app");
  await fs.writeFile(path.join(artifactRoot, "sharepoint-deploy-manifest.json"), JSON.stringify(["index.html", "assets/app.js"]));
  return artifactRoot;
};

const makeSite = () => ({
  _id: idOf("site-1"),
  siteCode: "alpha",
  currentVersion: "1.2.3",
  version: "1.2.3",
  sharePointHost: "portal.army.idf",
  sharePointSiteUrl: "https://portal.army.idf/sites/alpha",
  sharePointStatus: { deployStatus: "idle" },
  save: vi.fn().mockResolvedValue(undefined)
});

const makeRelease = (artifactRef: string) => ({
  _id: idOf("release-1"),
  version: "1.2.4",
  artifactRef,
  set: vi.fn(),
  save: vi.fn().mockResolvedValue(undefined)
});

beforeEach(() => {
  vi.resetModules();
  artifactRoot = "";
  Object.values(mocks).forEach((group) => {
    if (vi.isMockFunction(group)) {
      group.mockReset();
      return;
    }
    Object.values(group as Record<string, unknown>).forEach((value) => {
      if (vi.isMockFunction(value)) value.mockReset();
    });
  });
  mocks.getSharePointOperationCapabilities.mockReturnValue({
    writeAvailable: false,
    digest: { canRequest: false, reason: "server-sharepoint-disabled" },
    reason: "server-sharepoint-disabled"
  });
  mocks.listSharePointFiles.mockResolvedValue({ exists: false, files: [], authBlocked: true, status: 401 });
  mocks.listSharePointFolders.mockResolvedValue({ exists: false, folders: [], authBlocked: true, status: 401 });
  mocks.SiteVersionDeployment.create.mockImplementation(async (payload) => ({ _id: idOf("deployment-1"), ...payload }));
  mocks.logger.isPayloadLoggingEnabled.mockReturnValue(false);
});

afterEach(async () => {
  if (artifactRoot) {
    await fs.rm(artifactRoot, { recursive: true, force: true });
  }
});

describe("post-deploy browser evidence", () => {
  it("refuses server-side SharePoint deploy execution", async () => {
    const { executeSharePointDeploy } = await import("../server/src/services/deployArtifact.service");

    await expect(
      executeSharePointDeploy({
        siteId: "site-1",
        releaseId: "release-1",
        deploymentId: "deployment-1"
      })
    ).rejects.toThrow("sharepoint-browser-execution-required");

    expect(mocks.getRequestDigest).not.toHaveBeenCalled();
    expect(mocks.uploadSharePointFile).not.toHaveBeenCalled();
    expect(mocks.readSharePointFileEvidence).not.toHaveBeenCalled();
  });

  it("persists final app URL evidence supplied by the browser without server SharePoint reads", async () => {
    const release = makeRelease(await writeArtifact());
    const site = makeSite();
    mocks.Release.findById.mockResolvedValue(release);
    mocks.Site.findById.mockResolvedValue(site);

    const { recordBrowserSharePointDeploymentEvidence } = await import("../server/src/services/deployArtifact.service");
    const result = await recordBrowserSharePointDeploymentEvidence({
      siteId: "site-1",
      actor: "operator",
      input: {
        releaseId: "release-1",
        connectorMode: "browser-sharepoint",
        finalStatus: "success",
        versionBefore: "1.2.3",
        versionAfter: "1.2.4",
        finalAppUrlVerification: {
          key: "indexExists",
          label: "Final index.html",
          url: finalAppUrl,
          ok: true,
          status: 200,
          checkedAt: "2026-06-30T10:00:00.000Z"
        },
        readBackEvidence: [
          {
            relativePath: "index.html",
            targetPath: "/sites/alpha/siteDB/dist/index.html",
            status: "verified",
            expectedSizeBytes: 5,
            actualSizeBytes: 5,
            expectedSha256: sha256("index"),
            actualSha256: sha256("index"),
            sizeMatches: true,
            sha256Matches: true,
            httpStatus: 200
          },
          {
            relativePath: "assets/app.js",
            targetPath: "/sites/alpha/siteDB/dist/assets/app.js",
            status: "verified",
            expectedSizeBytes: 3,
            actualSizeBytes: 3,
            expectedSha256: sha256("app"),
            actualSha256: sha256("app"),
            sizeMatches: true,
            sha256Matches: true,
            httpStatus: 200
          }
        ]
      }
    });

    expect(result.summary).toMatchObject({
      connectorMode: "browser-sharepoint",
      finalStatus: "success",
      verifiedFilesCount: 2,
      failedFilesCount: 0,
      siteVersionUpdated: true
    });
    expect(mocks.SiteVersionDeployment.create).toHaveBeenCalledWith(expect.objectContaining({
      status: "succeeded",
      verification: expect.objectContaining({
        finalAppUrlVerification: expect.objectContaining({
          ok: true,
          status: 200,
          url: finalAppUrl
        })
      })
    }));
    expect(mocks.getRequestDigest).not.toHaveBeenCalled();
    expect(mocks.uploadSharePointFile).not.toHaveBeenCalled();
    expect(mocks.readSharePointFileEvidence).not.toHaveBeenCalled();
  });
});
