import type { Release, ReleaseArtifactCompatibility, ReleaseArtifactManifestFile } from "../api/sitesApi";

export type InitialDeployStorage = "txt" | "mongo";

const RUNTIME_CONFIG_FILENAMES = new Set(["sitebuilder-runtime-config.json", "runtime-config.json"]);

const normalizeRelative = (value: string) =>
  value.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/").trim();

const isSafeRelativePath = (value: string) => {
  const normalized = normalizeRelative(value);
  return Boolean(
    normalized &&
    normalized !== "." &&
    !normalized.startsWith("/") &&
    !normalized.split("/").some((segment) => !segment || segment === "..")
  );
};

export function isRuntimeConfigArtifactPath(relativePath: string) {
  const fileName = normalizeRelative(relativePath).split("/").pop() || "";
  return RUNTIME_CONFIG_FILENAMES.has(fileName);
}

export function deriveRequiredFoldersFromArtifactFilePaths(relativePaths: string[]) {
  const folders = new Set<string>();
  for (const item of relativePaths) {
    const relativePath = normalizeRelative(item);
    if (!isSafeRelativePath(relativePath)) {
      throw new Error(`artifact-folder-path-invalid:${item}`);
    }
    const segments = relativePath.split("/");
    segments.pop();
    for (let index = 1; index <= segments.length; index += 1) {
      folders.add(segments.slice(0, index).join("/"));
    }
  }
  return Array.from(folders).sort((a, b) => a.localeCompare(b));
}

export function getReleaseArtifactCompatibility(release: Release): ReleaseArtifactCompatibility {
  const validation = release.artifactValidation;
  return {
    storageCompatibility: validation?.storageCompatibility || [],
    artifactKind: validation?.artifactKind || "unknown",
    requiresRuntimeConfig: Boolean(validation?.requiresRuntimeConfig),
    preservesRuntimeConfig: validation?.preservesRuntimeConfig !== false,
    requiredFolders: validation?.requiredFolders || [],
    runtimeConfigFiles: validation?.runtimeConfigFiles || [],
    compatibilitySource: validation?.compatibilitySource || "unknown",
    compatibilityWarnings: validation?.compatibilityWarnings || []
  };
}

export function isReleaseDeployable(release: Release) {
  return release.status !== "deprecated" && Boolean(release.artifactRef?.trim()) && release.artifactValidation?.readyForDeploy === true;
}

export function isReleaseCompatibleWithStorage(release: Release, storage: InitialDeployStorage) {
  return isReleaseDeployable(release) && getReleaseArtifactCompatibility(release).storageCompatibility.includes(storage);
}

export function isReleaseCompatibilityUnknown(release: Release) {
  return isReleaseDeployable(release) && getReleaseArtifactCompatibility(release).storageCompatibility.length === 0;
}

const semverParts = (version: string) =>
  String(version || "")
    .replace(/^v/i, "")
    .split(/[.-]/)
    .slice(0, 3)
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));

export function compareReleaseVersionsDesc(a: Release, b: Release) {
  const aParts = semverParts(a.version);
  const bParts = semverParts(b.version);
  for (let index = 0; index < Math.max(aParts.length, bParts.length); index += 1) {
    const diff = (bParts[index] || 0) - (aParts[index] || 0);
    if (diff !== 0) return diff;
  }
  return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
}

export function compatibleReleasesForStorage(releases: Release[], storage: InitialDeployStorage) {
  return releases
    .filter((release) => isReleaseCompatibleWithStorage(release, storage))
    .sort(compareReleaseVersionsDesc);
}

export function latestCompatibleRelease(releases: Release[], storage: InitialDeployStorage) {
  return compatibleReleasesForStorage(releases, storage)[0] || null;
}

export function deployableUnknownCompatibilityReleases(releases: Release[]) {
  return releases.filter(isReleaseCompatibilityUnknown).sort(compareReleaseVersionsDesc);
}

export function manifestFilesForPlan(
  planFiles: Array<{ relativePath: string; targetPath: string; sizeBytes: number; sha256: string }>,
  manifestFiles: ReleaseArtifactManifestFile[]
) {
  const manifestByPath = new Map(manifestFiles.map((file) => [file.relativePath, file]));
  return planFiles.map((file) => {
    const manifestFile = manifestByPath.get(file.relativePath);
    return {
      relativePath: file.relativePath,
      targetRelativePath: manifestFile?.targetRelativePath || file.relativePath,
      sizeBytes: manifestFile?.sizeBytes || file.sizeBytes,
      contentType: manifestFile?.contentType || "application/octet-stream",
      sha256: manifestFile?.sha256 || file.sha256,
      deployable: manifestFile?.deployable ?? true,
      targetPath: file.targetPath
    };
  });
}
