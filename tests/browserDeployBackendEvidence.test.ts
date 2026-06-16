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
    create: vi.fn()
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

let artifactRoot = "";

const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

const writeArtifact = async (manifest: string[] = ["index.html", "assets/app.js"]) => {
  artifactRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sitebuilder-browser-deploy-"));
  await fs.mkdir(path.join(artifactRoot, "assets"), { recursive: true });
  await fs.writeFile(path.join(artifactRoot, "index.html"), "index");
  await fs.writeFile(path.join(artifactRoot, "assets", "app.js"), "app");
  await fs.writeFile(path.join(artifactRoot, "sharepoint-deploy-manifest.json"), JSON.stringify(manifest));
  return artifactRoot;
};

const makeRelease = (artifactRef: string) => ({
  _id: idOf("release-1"),
  version: "1.2.4",
  artifactRef,
  set: vi.fn(),
  save: vi.fn().mockResolvedValue(undefined)
});

const makeSite = () => ({
  _id: idOf("site-1"),
  siteCode: "schedule",
  displayName: "Schedule",
  currentVersion: "1.2.3",
  version: "1.2.3",
  sharePointHost: "portal.army.idf",
  sharePointSiteUrl: "https://portal.army.idf/sites/schedule",
  sharePointStatus: { deployStatus: "idle" },
  save: vi.fn().mockResolvedValue(undefined)
});

beforeEach(() => {
  vi.resetModules();
  artifactRoot = "";
  Object.values(mocks).forEach((mockGroup) => {
    Object.values(mockGroup as Record<string, unknown>).forEach((value) => {
      if (vi.isMockFunction(value)) value.mockReset();
    });
  });
  mocks.getSharePointOperationCapabilities.mockReturnValue({
    writeAvailable: false,
    digest: { canRequest: false, reason: "backend-401" },
    reason: "backend-401"
  });
  mocks.listSharePointFiles.mockResolvedValue({ exists: false, files: [], authBlocked: true, status: 401 });
  mocks.listSharePointFolders.mockResolvedValue({ exists: false, folders: [], authBlocked: true, status: 401 });
  mocks.SiteVersionDeployment.create.mockImplementation(async (payload) => ({ _id: idOf("deployment-1"), ...payload }));
});

afterEach(async () => {
  if (artifactRoot) {
    await fs.rm(artifactRoot, { recursive: true, force: true });
  }
});

describe("browser deploy artifact access and evidence storage", () => {
  it("blocks path traversal in artifact manifests", async () => {
    const release = makeRelease(await writeArtifact(["../secret.txt"]));
    mocks.Release.findById.mockResolvedValue(release);

    const { getReleaseArtifactManifest } = await import("../server/src/services/deployArtifact.service");

    await expect(getReleaseArtifactManifest("release-1")).rejects.toThrow("deploy-manifest-contains-unsafe-paths");
  });

  it("blocks path traversal in artifact file access", async () => {
    const release = makeRelease(await writeArtifact());
    mocks.Release.findById.mockResolvedValue(release);

    const { getReleaseArtifactFile } = await import("../server/src/services/deployArtifact.service");

    await expect(getReleaseArtifactFile("release-1", "../secret.txt")).rejects.toThrow("release-artifact-file-path-invalid");
  });

  it("stores successful browser deploy evidence and updates site version only after verified files", async () => {
    const release = makeRelease(await writeArtifact());
    const site = makeSite();
    mocks.Release.findById.mockResolvedValue(release);
    mocks.Site.findById.mockResolvedValue(site);

    const { recordBrowserSharePointDeploymentEvidence } = await import("../server/src/services/deployArtifact.service");
    const result = await recordBrowserSharePointDeploymentEvidence({
      siteId: "site-1",
      actor: "s8856096",
      input: {
        releaseId: "release-1",
        connectorMode: "browser-sharepoint",
        finalStatus: "success",
        versionBefore: "1.2.3",
        versionAfter: "1.2.4",
        targetSite: { siteId: "site-1", siteCode: "schedule", sharePointSiteUrl: "https://portal.army.idf/sites/schedule" },
        readBackEvidence: [
          {
            relativePath: "index.html",
            targetPath: "/sites/schedule/siteDB/dist/index.html",
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
            targetPath: "/sites/schedule/siteDB/dist/assets/app.js",
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
      siteVersionUpdated: true,
      verifiedFilesCount: 2,
      failedFilesCount: 0
    });
    expect(mocks.SiteVersionDeployment.create).toHaveBeenCalledWith(expect.objectContaining({
      status: "succeeded",
      triggeredBy: "s8856096"
    }));
    expect(site.currentVersion).toBe("1.2.4");
    expect(site.version).toBe("1.2.4");
    expect(site.save).toHaveBeenCalled();
  });

  it("records failed browser deploy evidence without updating the site version", async () => {
    const release = makeRelease(await writeArtifact());
    const site = makeSite();
    mocks.Release.findById.mockResolvedValue(release);
    mocks.Site.findById.mockResolvedValue(site);

    const { recordBrowserSharePointDeploymentEvidence } = await import("../server/src/services/deployArtifact.service");
    const result = await recordBrowserSharePointDeploymentEvidence({
      siteId: "site-1",
      actor: "s8856096",
      input: {
        releaseId: "release-1",
        connectorMode: "browser-sharepoint",
        finalStatus: "failed",
        versionBefore: "1.2.3",
        versionAfter: "1.2.3",
        errors: [{ relativePath: "assets/app.js", error: "upload failed", status: 500 }],
        readBackEvidence: [
          {
            relativePath: "assets/app.js",
            targetPath: "/sites/schedule/siteDB/dist/assets/app.js",
            status: "failed",
            expectedSizeBytes: 3,
            actualSizeBytes: 0,
            expectedSha256: sha256("app"),
            actualSha256: "",
            sizeMatches: false,
            sha256Matches: false,
            httpStatus: 500,
            error: "upload failed"
          }
        ]
      }
    });

    expect(result.summary).toMatchObject({
      finalStatus: "failed",
      siteVersionUpdated: false
    });
    expect(mocks.SiteVersionDeployment.create).toHaveBeenCalledWith(expect.objectContaining({
      status: "failed",
      error: "upload failed"
    }));
    expect(site.currentVersion).toBe("1.2.3");
    expect(site.version).toBe("1.2.3");
    expect(site.versionStatus).toBe("failed");
    expect(site.save).toHaveBeenCalled();
  });
});
