import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  Release: {
    findById: vi.fn()
  },
  Site: {
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

vi.mock("../server/src/models/Release", () => ({ Release: mocks.Release }));
vi.mock("../server/src/models/Site", () => ({ Site: mocks.Site }));
vi.mock("../server/src/models/SiteVersionDeployment", () => ({ SiteVersionDeployment: mocks.SiteVersionDeployment }));
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

const makeRelease = (artifactRef: string) => ({
  _id: idOf("release-1"),
  version: "2.0.0",
  artifactRef,
  set: vi.fn(),
  save: vi.fn().mockResolvedValue(undefined)
});

const writeArtifact = async (manifest: unknown, files: Record<string, string>) => {
  artifactRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sitebuilder-artifact-compat-"));
  for (const [relativePath, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(artifactRoot, relativePath)), { recursive: true });
    await fs.writeFile(path.join(artifactRoot, relativePath), content);
  }
  await fs.writeFile(path.join(artifactRoot, "sharepoint-deploy-manifest.json"), JSON.stringify(manifest, null, 2));
  return artifactRoot;
};

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
  mocks.listSharePointFiles.mockResolvedValue({ exists: true, files: [] });
  mocks.listSharePointFolders.mockResolvedValue({ exists: true, folders: [] });
});

afterEach(async () => {
  if (artifactRoot) {
    await fs.rm(artifactRoot, { recursive: true, force: true });
  }
});

describe("release artifact compatibility metadata", () => {
  it("reads explicit compatibility metadata from object manifests", async () => {
    const root = await writeArtifact(
      {
        files: ["index.html", "assets/app.js", "sitebuilder-runtime-config.json"],
        storageCompatibility: ["mongo"],
        artifactKind: "mongo-frontend",
        requiresRuntimeConfig: true,
        preservesRuntimeConfig: true,
        requiredFolders: ["assets"]
      },
      {
        "index.html": "<script src=\"assets/app.js\"></script>",
        "assets/app.js": "fetch('sitebuilder-runtime-config.json')",
        "sitebuilder-runtime-config.json": "{}"
      }
    );
    const release = makeRelease(root);
    mocks.Release.findById.mockResolvedValue(release);

    const { getReleaseArtifactManifest } = await import("../server/src/services/deployArtifact.service");
    const manifest = await getReleaseArtifactManifest("release-1");

    expect(manifest.compatibility).toMatchObject({
      storageCompatibility: ["mongo"],
      artifactKind: "mongo-frontend",
      requiresRuntimeConfig: true,
      preservesRuntimeConfig: true,
      compatibilitySource: "manifest"
    });
    expect(manifest.summary.requiredFolders).toEqual(["assets"]);
    expect(manifest.summary.runtimeConfigFiles).toEqual(["sitebuilder-runtime-config.json"]);
    expect(release.set).toHaveBeenCalledWith("artifactValidation", expect.objectContaining({
      storageCompatibility: ["mongo"],
      artifactKind: "mongo-frontend"
    }));
  });

  it("infers TXT and Mongo compatibility only when recognizable signals exist", async () => {
    const root = await writeArtifact(
      ["index.html", "assets/app.js"],
      {
        "index.html": "<script src=\"assets/app.js\"></script>",
        "assets/app.js": "const legacy = 'users_data.txt'; fetch('runtime-config.json').then(r => r.json())"
      }
    );
    mocks.Release.findById.mockResolvedValue(makeRelease(root));

    const { getReleaseArtifactManifest } = await import("../server/src/services/deployArtifact.service");
    const manifest = await getReleaseArtifactManifest("release-1");

    expect(manifest.compatibility.storageCompatibility).toEqual(["mongo", "txt"]);
    expect(manifest.compatibility.artifactKind).toBe("site-builder-frontend");
    expect(manifest.compatibility.compatibilitySource).toBe("inferred");
  });

  it("keeps unknown compatibility unknown when no signals are present", async () => {
    const root = await writeArtifact(
      ["index.html", "assets/app.js"],
      {
        "index.html": "<script src=\"assets/app.js\"></script>",
        "assets/app.js": "console.log('hello')"
      }
    );
    mocks.Release.findById.mockResolvedValue(makeRelease(root));

    const { getReleaseArtifactManifest } = await import("../server/src/services/deployArtifact.service");
    const manifest = await getReleaseArtifactManifest("release-1");

    expect(manifest.compatibility.storageCompatibility).toEqual([]);
    expect(manifest.compatibility.artifactKind).toBe("unknown");
    expect(manifest.compatibility.compatibilityWarnings).toContain("artifact-storage-compatibility-unknown");
  });

  it("derives all nested folders from artifact files", async () => {
    const { deriveRequiredFoldersFromArtifactPaths } = await import("../server/src/services/deployArtifact.service");

    expect(deriveRequiredFoldersFromArtifactPaths([
      "index.html",
      "assets/app.js",
      "assets/chunks/app.js",
      "images/logo.png"
    ])).toEqual(["assets", "assets/chunks", "images"]);
    expect(() => deriveRequiredFoldersFromArtifactPaths(["../secret.txt"])).toThrow("deploy-artifact-contains-unsafe-path");
  });
});
