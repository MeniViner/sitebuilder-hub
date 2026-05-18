import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const targetDistRoot = "/sites/alpha/siteDB/dist";

const targetDistInventory = {
  root: targetDistRoot,
  mode: "read-only",
  readOnly: true,
  files: [
    {
      relativePath: "index.html",
      serverRelativeUrl: `${targetDistRoot}/index.html`,
      sizeBytes: 101
    },
    {
      relativePath: "assets/app.js",
      serverRelativeUrl: `${targetDistRoot}/assets/app.js`,
      sizeBytes: 202
    },
    {
      relativePath: "assets/legacy.js",
      serverRelativeUrl: `${targetDistRoot}/assets/legacy.js`,
      sizeBytes: 303
    }
  ],
  staleFiles: [
    {
      relativePath: "assets/legacy.js",
      serverRelativeUrl: `${targetDistRoot}/assets/legacy.js`,
      reason: "absent-from-release-artifact",
      defaultAction: "keep"
    }
  ],
  summary: {
    filesCount: 3,
    staleFilesCount: 1,
    deleteEnabled: false,
    defaultAction: "keep"
  }
};

const mocks = vi.hoisted(() => ({
  Site: {
    findById: vi.fn()
  },
  Release: {
    findById: vi.fn()
  },
  getSharePointOperationCapabilities: vi.fn(),
  listSharePointFolders: vi.fn(),
  listSharePointFiles: vi.fn(),
  listSharePointFilesRecursive: vi.fn(),
  listSharePointFolderInventory: vi.fn(),
  listSharePointFolderInventoryRecursive: vi.fn(),
  listSharePointFolderRecursiveInventory: vi.fn(),
  listSharePointDistInventory: vi.fn(),
  deleteSharePointFile: vi.fn(),
  recycleSharePointFile: vi.fn(),
  uploadSharePointFile: vi.fn(),
  getRequestDigest: vi.fn(),
  readSharePointFileEvidence: vi.fn(),
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
vi.mock("../server/src/services/sharepointOperationClient", () => ({
  getSharePointOperationCapabilities: mocks.getSharePointOperationCapabilities,
  listSharePointFolders: mocks.listSharePointFolders,
  listSharePointFiles: mocks.listSharePointFiles,
  listSharePointFilesRecursive: mocks.listSharePointFilesRecursive,
  listSharePointFolderInventory: mocks.listSharePointFolderInventory,
  listSharePointFolderInventoryRecursive: mocks.listSharePointFolderInventoryRecursive,
  listSharePointFolderRecursiveInventory: mocks.listSharePointFolderRecursiveInventory,
  listSharePointDistInventory: mocks.listSharePointDistInventory,
  deleteSharePointFile: mocks.deleteSharePointFile,
  recycleSharePointFile: mocks.recycleSharePointFile,
  uploadSharePointFile: mocks.uploadSharePointFile,
  getRequestDigest: mocks.getRequestDigest,
  readSharePointFileEvidence: mocks.readSharePointFileEvidence
}));
vi.mock("../server/src/utils/logger", () => ({ logger: mocks.logger }));

const idOf = (value: string) => ({ toString: () => value });

const makeSite = () => ({
  _id: idOf("site-1"),
  siteCode: "alpha",
  displayName: "Alpha Site",
  currentVersion: "1.2.3",
  version: "1.2.3",
  sharePointHost: "portal.army.idf",
  sharePointSiteUrl: "https://portal.army.idf/sites/alpha",
  sharePointStatus: { deployStatus: "idle" }
});

const makeRelease = (artifactRef: string) => ({
  _id: idOf("release-1"),
  version: "1.2.4",
  releaseType: "patch",
  artifactRef,
  set: vi.fn(),
  save: vi.fn().mockResolvedValue(undefined)
});

let artifactRoot = "";

const writeArtifact = async () => {
  artifactRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sitebuilder-target-dist-inventory-"));
  await fs.mkdir(path.join(artifactRoot, "assets"), { recursive: true });
  await fs.writeFile(path.join(artifactRoot, "index.html"), "<html><script src=\"assets/app.js\"></script></html>");
  await fs.writeFile(path.join(artifactRoot, "assets", "app.js"), "console.log('current');");
  await fs.writeFile(path.join(artifactRoot, "sharepoint-deploy-manifest.json"), JSON.stringify(["index.html", "assets/app.js"]));
  return artifactRoot;
};

beforeEach(() => {
  vi.resetModules();
  artifactRoot = "";
  mocks.Site.findById.mockReset();
  mocks.Release.findById.mockReset();
  mocks.getSharePointOperationCapabilities.mockReset();
  mocks.listSharePointFolders.mockReset();
  mocks.listSharePointFiles.mockReset();
  mocks.listSharePointFilesRecursive.mockReset();
  mocks.listSharePointFolderInventory.mockReset();
  mocks.listSharePointFolderInventoryRecursive.mockReset();
  mocks.listSharePointFolderRecursiveInventory.mockReset();
  mocks.listSharePointDistInventory.mockReset();
  mocks.deleteSharePointFile.mockReset();
  mocks.recycleSharePointFile.mockReset();
  mocks.uploadSharePointFile.mockReset();
  mocks.getRequestDigest.mockReset();
  mocks.readSharePointFileEvidence.mockReset();
  mocks.logger.isPayloadLoggingEnabled.mockReturnValue(false);

  mocks.getSharePointOperationCapabilities.mockReturnValue({
    readAvailable: true,
    readUsesAuthMaterial: true,
    writeEnabled: false,
    hasAuthMaterial: true,
    unauthenticatedWriteAllowed: false,
    writeAvailable: false,
    authMode: "bearer",
    authModes: ["bearer"],
    requestTimeoutMs: 15000,
    digest: {
      requiredForWrites: true,
      endpointSuffix: "/_api/contextinfo",
      canRequest: false,
      reason: "SharePoint write is disabled."
    },
    reason: "SharePoint write is disabled."
  });

  const inventoryResult = {
    serverRelativePath: targetDistRoot,
    url: "https://portal.army.idf/sites/alpha/siteDB/dist",
    checkedAt: "2026-05-14T10:00:00.000Z",
    exists: true,
    inventory: targetDistInventory,
    ...targetDistInventory
  };
  mocks.listSharePointFilesRecursive.mockResolvedValue(inventoryResult);
  mocks.listSharePointFolderInventory.mockResolvedValue(inventoryResult);
  mocks.listSharePointFolderInventoryRecursive.mockResolvedValue(inventoryResult);
  mocks.listSharePointFolderRecursiveInventory.mockResolvedValue(inventoryResult);
  mocks.listSharePointDistInventory.mockResolvedValue(inventoryResult);
  mocks.listSharePointFolders.mockImplementation(async (_paths, serverRelativeFolder: string) => ({
    serverRelativePath: serverRelativeFolder,
    url: `https://portal.army.idf${serverRelativeFolder}`,
    checkedAt: "2026-05-14T10:00:00.000Z",
    exists: true,
    folders: serverRelativeFolder === targetDistRoot
      ? [
          {
            name: "assets",
            serverRelativeUrl: `${targetDistRoot}/assets`,
            url: "https://portal.army.idf/sites/alpha/siteDB/dist/assets"
          }
        ]
      : []
  }));
  mocks.listSharePointFiles.mockImplementation(async (_paths, serverRelativeFolder: string) => ({
    serverRelativePath: serverRelativeFolder,
    url: `https://portal.army.idf${serverRelativeFolder}`,
    checkedAt: "2026-05-14T10:00:00.000Z",
    exists: true,
    files: serverRelativeFolder === `${targetDistRoot}/assets`
      ? targetDistInventory.files.filter((file) => file.relativePath.startsWith("assets/"))
      : targetDistInventory.files.filter((file) => !file.relativePath.includes("/"))
  }));
});

afterEach(async () => {
  if (artifactRoot) {
    await fs.rm(artifactRoot, { recursive: true, force: true });
  }
});

describe("deploy target dist inventory stale-file policy", () => {
  it("includes read-only final dist inventory and summarizes stale files without delete actions in deploy planning", async () => {
    const release = makeRelease(await writeArtifact());
    mocks.Site.findById.mockResolvedValue(makeSite());
    mocks.Release.findById.mockResolvedValue(release);

    const { buildSiteDeployPlan } = await import("../server/src/services/deployArtifact.service");
    const plan = await buildSiteDeployPlan("site-1", "release-1");
    const planJson = JSON.stringify(plan);

    expect(plan.resolvedPaths.finalDistRoot).toBe(targetDistRoot);
    expect(plan.files.map((file) => file.relativePath).sort()).toEqual(["assets/app.js", "index.html"]);
    expect(planJson).toContain("read-only");
    expect(planJson).toContain("assets/legacy.js");
    expect(planJson).toContain("absent-from-release-artifact");
    expect(planJson).toContain("keep");
    expect(planJson).not.toContain("\"delete\"");
    expect(mocks.uploadSharePointFile).not.toHaveBeenCalled();
    expect(mocks.deleteSharePointFile).not.toHaveBeenCalled();
    expect(mocks.recycleSharePointFile).not.toHaveBeenCalled();
    expect(mocks.getRequestDigest).not.toHaveBeenCalled();
  });
});
