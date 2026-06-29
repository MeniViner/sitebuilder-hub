import { describe, expect, it } from "vitest";
import {
  compatibleReleasesForStorage,
  deriveRequiredFoldersFromArtifactFilePaths,
  isRuntimeConfigArtifactPath,
  latestCompatibleRelease,
  manifestFilesForPlan
} from "../client/src/utils/artifactCompatibility";
import type { Release } from "../client/src/api/sitesApi";

const release = (overrides: Partial<Release>): Release => ({
  _id: overrides._id || "release",
  version: overrides.version || "1.0.0",
  releaseType: "patch",
  artifactRef: "/tmp/dist",
  artifactValidation: {
    readyForDeploy: true,
    storageCompatibility: ["txt"],
    artifactKind: "legacy-txt-frontend",
    preservesRuntimeConfig: true,
    requiredFolders: [],
    runtimeConfigFiles: [],
    compatibilitySource: "manifest",
    ...(overrides.artifactValidation || {})
  },
  status: "active",
  createdAt: overrides.createdAt || "2026-06-18T10:00:00.000Z",
  ...overrides
});

describe("Create New Site initial deploy artifact selection", () => {
  it("auto-selects the latest compatible Mongo release and excludes TXT-only releases", () => {
    const releases = [
      release({ _id: "txt", version: "3.0.0", artifactValidation: { storageCompatibility: ["txt"], artifactKind: "legacy-txt-frontend", readyForDeploy: true } }),
      release({ _id: "mongo-old", version: "1.0.0", artifactValidation: { storageCompatibility: ["mongo"], artifactKind: "mongo-frontend", readyForDeploy: true } }),
      release({ _id: "mongo-new", version: "2.1.0", artifactValidation: { storageCompatibility: ["mongo"], artifactKind: "mongo-frontend", readyForDeploy: true } }),
      release({ _id: "unknown", version: "9.0.0", artifactValidation: { storageCompatibility: [], artifactKind: "unknown", readyForDeploy: true } })
    ];

    expect(latestCompatibleRelease(releases, "mongo")?._id).toBe("mongo-new");
    expect(compatibleReleasesForStorage(releases, "mongo").map((item) => item._id)).toEqual(["mongo-new", "mongo-old"]);
  });

  it("auto-selects TXT-compatible releases and excludes Mongo-only releases", () => {
    const releases = [
      release({ _id: "mongo", version: "4.0.0", artifactValidation: { storageCompatibility: ["mongo"], artifactKind: "mongo-frontend", readyForDeploy: true } }),
      release({ _id: "txt", version: "2.0.0", artifactValidation: { storageCompatibility: ["txt"], artifactKind: "legacy-txt-frontend", readyForDeploy: true } })
    ];

    expect(latestCompatibleRelease(releases, "txt")?._id).toBe("txt");
    expect(compatibleReleasesForStorage(releases, "txt").map((item) => item._id)).toEqual(["txt"]);
  });

  it("does not auto-select unknown compatibility", () => {
    const releases = [
      release({ _id: "unknown", version: "9.0.0", artifactValidation: { storageCompatibility: [], artifactKind: "unknown", readyForDeploy: true } })
    ];

    expect(latestCompatibleRelease(releases, "mongo")).toBeNull();
    expect(latestCompatibleRelease(releases, "txt")).toBeNull();
  });

  it("derives nested folders from artifact file paths and blocks traversal", () => {
    expect(deriveRequiredFoldersFromArtifactFilePaths([
      "index.html",
      "assets/index-abc.js",
      "assets/chunks/app.js",
      "images/logo.png",
      "fonts/font.woff2"
    ])).toEqual(["assets", "assets/chunks", "fonts", "images"]);

    expect(() => deriveRequiredFoldersFromArtifactFilePaths(["../secret.txt"])).toThrow("artifact-folder-path-invalid");
  });

  it("identifies runtime config files and maps plan files to manifest files", () => {
    expect(isRuntimeConfigArtifactPath("sitebuilder-runtime-config.json")).toBe(true);
    expect(isRuntimeConfigArtifactPath("config/runtime-config.json")).toBe(true);
    expect(isRuntimeConfigArtifactPath("assets/app.js")).toBe(false);

    expect(manifestFilesForPlan(
      [{ relativePath: "assets/app.js", targetPath: "/sites/a/siteDB/dist/assets/app.js", sizeBytes: 3, sha256: "sha" }],
      [{ relativePath: "assets/app.js", targetRelativePath: "assets/app.js", sizeBytes: 3, contentType: "text/javascript", sha256: "sha", deployable: true }]
    )).toEqual([
      {
        relativePath: "assets/app.js",
        targetRelativePath: "assets/app.js",
        sizeBytes: 3,
        contentType: "text/javascript",
        sha256: "sha",
        deployable: true,
        targetPath: "/sites/a/siteDB/dist/assets/app.js"
      }
    ]);
  });
});
