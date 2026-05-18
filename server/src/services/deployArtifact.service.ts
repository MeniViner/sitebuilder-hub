import crypto from "crypto";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { HydratedDocument } from "mongoose";
import { Release, ReleaseDocument } from "../models/Release";
import { Site } from "../models/Site";
import { SiteVersionDeployment } from "../models/SiteVersionDeployment";
import { resolveSiteBuilderPaths, SiteBuilderResolvedPaths } from "../utils/sitebuilderPaths";
import { logger } from "../utils/logger";
import {
  getRequestDigest,
  getSharePointOperationCapabilities,
  listSharePointFiles,
  listSharePointFolders,
  readSharePointFileEvidence,
  uploadSharePointFile
} from "./sharepointOperationClient";
import {
  FinalAppUrlHealthEvidence,
  getFinalAppUrlHealthEvidence,
  runReadOnlySharePointHealthCheck,
  SharePointReadOnlyHealthResult
} from "./sharepointHealth.service";

type DeployPlanFile = {
  relativePath: string;
  sourcePath: string;
  targetPath: string;
  sizeBytes: number;
  sha256: string;
};

export type TargetDistInventoryFile = {
  relativePath: string;
  targetPath: string;
  serverRelativeUrl: string;
  reason?: "absent-from-release-artifact";
  defaultAction?: "keep";
  sizeBytes?: number;
  etag?: string;
  lastModified?: string;
};

export type TargetDistInventory = {
  checkedAt: string;
  root: string;
  distRoot: string;
  mode: "read-only";
  readOnly: true;
  readOk: boolean;
  filesCount: number;
  staleFilesCount: number;
  staleFiles: TargetDistInventoryFile[];
  filesSample: TargetDistInventoryFile[];
  failedFolders: Array<{ path: string; error?: string; status?: number; statusText?: string; authBlocked?: boolean }>;
  summary: {
    filesCount: number;
    staleFilesCount: number;
    deleteEnabled: false;
    defaultAction: "keep";
  };
  staleFilePolicy: {
    defaultAction: "keep";
    deleteEnabled: false;
    mode: "read-only";
    summary: string;
  };
  notes: string[];
};

type ArtifactInventoryFile = Omit<DeployPlanFile, "targetPath">;

type ResolvedArtifactFiles = {
  artifactRoot: string;
  hasManifest: boolean;
  manifestPath: string;
  files: string[];
};

type ReleaseArtifactValidationSnapshot = {
  artifactRef: string;
  artifactRoot: string;
  filesCount: number;
  totalSizeBytes: number;
  hasIndexHtml: boolean;
  hasManifest: boolean;
  manifestSha256: string;
  inventorySha256: string;
  readyForDeploy: boolean;
  validatedAt: Date;
  validationError: string;
};

type ReleaseArtifactValidationResult = {
  generatedAt: string;
  releaseId: string;
  releaseVersion: string;
  artifactRef: string;
  artifactRoot: string;
  files: ArtifactInventoryFile[];
  missingFiles: string[];
  blockers: string[];
  summary: {
    filesCount: number;
    totalSizeBytes: number;
    hasIndexHtml: boolean;
    hasManifest: boolean;
    manifestSha256: string;
    inventorySha256: string;
    readyForDeploy: boolean;
  };
  snapshot: ReleaseArtifactValidationSnapshot;
  notes: string[];
};

type ReleaseHydratedDocument = HydratedDocument<ReleaseDocument>;

type DeployVerificationEvidence = {
  relativePath: string;
  sourcePath: string;
  targetPath: string;
  status: "verified" | "failed";
  checkedAt: Date;
  expectedSizeBytes: number;
  actualSizeBytes: number;
  expectedSha256: string;
  actualSha256: string;
  sizeMatches: boolean;
  sha256Matches: boolean;
  httpStatus?: number;
  httpStatusText?: string;
  contentType?: string;
  etag?: string;
  lastModified?: string;
  error?: string;
};

type DeployPostHealthSummary = {
  checkedAt: string;
  derivedHealthStatus: string;
  evidenceCount: number;
  failedCount: number;
  authBlockedCount: number;
  health: SharePointReadOnlyHealthResult["health"];
  evidence: Array<FinalAppUrlHealthEvidence | (SharePointReadOnlyHealthResult["evidence"][number] & { checkedAt: string })>;
};

export type SiteDeployPlan = {
  generatedAt: string;
  releaseId: string;
  releaseVersion: string;
  artifactRef: string;
  artifactRoot: string;
  siteId: string;
  siteCode: string;
  resolvedPaths: SiteBuilderResolvedPaths;
  files: DeployPlanFile[];
  summary: {
    filesCount: number;
    totalSizeBytes: number;
    hasIndexHtml: boolean;
    hasManifest: boolean;
    readyForDeploy: boolean;
    readyForDeployExecution: boolean;
    targetInventoryReadOk?: boolean;
    staleTargetFilesCount?: number;
  };
  targetInventory?: TargetDistInventory;
  targetDistInventory?: TargetDistInventory;
  staleFilePolicy?: TargetDistInventory["staleFilePolicy"];
  capabilities: ReturnType<typeof getSharePointOperationCapabilities>;
  blockers: string[];
  notes: string[];
};

const MANIFEST_NAME = "sharepoint-deploy-manifest.json";
const SKIP_DIRS = new Set(["node_modules", ".git"]);

const normalizeRelative = (value: string) => value.replace(/\\/g, "/").split(path.sep).join("/").replace(/^\/+/, "").replace(/\/+/g, "/");

const relativeFromTargetPath = (root: string, targetPath: string) => {
  const normalizedRoot = root.replace(/\/+$/g, "");
  const normalizedTarget = targetPath.replace(/\\/g, "/");
  const relative = normalizedTarget.startsWith(`${normalizedRoot}/`)
    ? normalizedTarget.slice(normalizedRoot.length + 1)
    : normalizedTarget.split("/").filter(Boolean).pop() || normalizedTarget;
  return normalizeRelative(relative);
};

const MAX_TARGET_INVENTORY_FILES = 5000;
const TARGET_INVENTORY_SAMPLE_LIMIT = 50;
const STALE_FILES_SAMPLE_LIMIT = 100;

const isSafeRelativeFile = (value: string) => {
  if (!value || path.isAbsolute(value)) return false;
  const normalized = normalizeRelative(value);
  if (!normalized || normalized === "." || normalized.split("/").some((segment) => segment === ".." || segment === "")) return false;
  return true;
};

const resolveArtifactRef = async (artifactRef: string) => {
  const trimmed = artifactRef.trim();
  if (!trimmed) throw new Error("release-artifact-ref-missing");

  const candidates = path.isAbsolute(trimmed)
    ? [trimmed]
    : [
        path.resolve(process.cwd(), trimmed),
        path.resolve(process.cwd(), "..", trimmed),
        path.resolve(process.cwd(), "..", "..", trimmed)
      ];

  for (const candidate of candidates) {
    if (fsSync.existsSync(candidate)) return candidate;
  }

  throw new Error(`release-artifact-not-found:${artifactRef}`);
};

const walkFiles = async (root: string) => {
  const files: string[] = [];

  const walk = async (dir: string) => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name.toLowerCase())) continue;
        await walk(path.join(dir, entry.name));
        continue;
      }

      if (!entry.isFile()) continue;
      files.push(normalizeRelative(path.relative(root, path.join(dir, entry.name))));
    }
  };

  await walk(root);
  return files.sort();
};

const readManifest = async (manifestPath: string) => {
  const raw = await fs.readFile(manifestPath, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("deploy-manifest-must-be-array");
  const files = parsed.map((item) => normalizeRelative(String(item).trim())).filter(Boolean);
  const unsafeFiles = files.filter((item) => !isSafeRelativeFile(item));
  if (unsafeFiles.length > 0) throw new Error(`deploy-manifest-contains-unsafe-paths:${unsafeFiles.slice(0, 5).join(",")}`);
  return [...new Set(files)].sort();
};

const resolveArtifactFiles = async (artifactRef: string): Promise<ResolvedArtifactFiles> => {
  const resolved = await resolveArtifactRef(artifactRef);
  const stat = await fs.stat(resolved);

  if (stat.isFile()) {
    if (path.basename(resolved) !== MANIFEST_NAME) {
      throw new Error("release-artifact-file-must-be-manifest");
    }

    const artifactRoot = path.dirname(resolved);
    return {
      artifactRoot,
      hasManifest: true,
      manifestPath: resolved,
      files: await readManifest(resolved)
    };
  }

  if (!stat.isDirectory()) throw new Error("release-artifact-ref-unsupported");

  const manifestPath = path.join(resolved, MANIFEST_NAME);
  if (fsSync.existsSync(manifestPath)) {
    return {
      artifactRoot: resolved,
      hasManifest: true,
      manifestPath,
      files: await readManifest(manifestPath)
    };
  }

  return {
    artifactRoot: resolved,
    hasManifest: false,
    manifestPath: "",
    files: await walkFiles(resolved)
  };
};

const hashFile = async (sourcePath: string) => {
  const bytes = await fs.readFile(sourcePath);
  return {
    bytes,
    sizeBytes: bytes.byteLength,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex")
  };
};

async function readTargetDistInventory(
  resolvedPaths: SiteBuilderResolvedPaths,
  artifactFiles: DeployPlanFile[]
): Promise<TargetDistInventory> {
  const checkedAt = new Date().toISOString();
  const artifactRelativePaths = new Set(artifactFiles.map((file) => normalizeRelative(file.relativePath)));
  const files: TargetDistInventoryFile[] = [];
  const failedFolders: TargetDistInventory["failedFolders"] = [];
  const queue = [resolvedPaths.finalDistRoot];
  const visited = new Set<string>();

  logger.info("releases", "Reading target dist inventory before deploy", {
    siteCode: resolvedPaths.siteCode,
    distRoot: resolvedPaths.finalDistRoot,
    artifactFilesCount: artifactFiles.length
  });

  while (queue.length > 0 && files.length < MAX_TARGET_INVENTORY_FILES) {
    const folder = queue.shift()!;
    if (visited.has(folder)) continue;
    visited.add(folder);

    const [fileList, folderList] = await Promise.all([
      listSharePointFiles(resolvedPaths, folder),
      listSharePointFolders(resolvedPaths, folder)
    ]);

    if (!fileList.exists) {
      failedFolders.push({
        path: folder,
        error: fileList.error,
        status: fileList.status,
        statusText: fileList.statusText,
        authBlocked: fileList.authBlocked
      });
    } else {
      for (const file of fileList.files) {
        files.push({
          relativePath: relativeFromTargetPath(resolvedPaths.finalDistRoot, file.serverRelativeUrl),
          targetPath: file.serverRelativeUrl,
          serverRelativeUrl: file.serverRelativeUrl,
          sizeBytes: file.sizeBytes,
          etag: file.etag,
          lastModified: file.timeLastModified
        });
        if (files.length >= MAX_TARGET_INVENTORY_FILES) break;
      }
    }

    if (!folderList.exists) {
      failedFolders.push({
        path: folder,
        error: folderList.error,
        status: folderList.status,
        statusText: folderList.statusText,
        authBlocked: folderList.authBlocked
      });
    } else {
      for (const child of folderList.folders) {
        if (child.serverRelativeUrl && !visited.has(child.serverRelativeUrl)) {
          queue.push(child.serverRelativeUrl);
        }
      }
    }
  }

  const staleFiles = files
    .filter((file) => !artifactRelativePaths.has(file.relativePath))
    .map((file) => ({
      ...file,
      reason: "absent-from-release-artifact" as const,
      defaultAction: "keep" as const
    }))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  const readOk = failedFolders.length === 0;
  const notes = [
    readOk ? "" : "Target dist inventory was partially unavailable; stale file counts may be incomplete.",
    staleFiles.length
      ? "Stale target files are retained by default. This deploy does not mirror-delete files absent from the artifact."
      : "No stale target files were detected in the readable target dist inventory.",
    files.length >= MAX_TARGET_INVENTORY_FILES
      ? `Target dist inventory stopped at ${MAX_TARGET_INVENTORY_FILES} files.`
      : ""
  ].filter(Boolean);

  const inventory = {
    checkedAt,
    root: resolvedPaths.finalDistRoot,
    distRoot: resolvedPaths.finalDistRoot,
    mode: "read-only" as const,
    readOnly: true as const,
    readOk,
    filesCount: files.length,
    staleFilesCount: staleFiles.length,
    staleFiles: staleFiles.slice(0, STALE_FILES_SAMPLE_LIMIT),
    filesSample: files.slice(0, TARGET_INVENTORY_SAMPLE_LIMIT),
    failedFolders,
    summary: {
      filesCount: files.length,
      staleFilesCount: staleFiles.length,
      deleteEnabled: false as const,
      defaultAction: "keep" as const
    },
    staleFilePolicy: {
      defaultAction: "keep" as const,
      deleteEnabled: false as const,
      mode: "read-only" as const,
      summary: staleFiles.length
        ? `${staleFiles.length} stale target dist file${staleFiles.length === 1 ? "" : "s"} absent from the release artifact will be kept by default.`
        : "No stale target dist files were detected; cleanup is not scheduled."
    },
    notes
  };

  logger.info("releases", "Target dist inventory read completed", {
    siteCode: resolvedPaths.siteCode,
    distRoot: resolvedPaths.finalDistRoot,
    readOk,
    filesCount: inventory.filesCount,
    staleFilesCount: inventory.staleFilesCount,
    failedFoldersCount: failedFolders.length
  });

  return inventory;
}

const buildInventorySha256 = (files: ArtifactInventoryFile[]) =>
  crypto
    .createHash("sha256")
    .update(
      JSON.stringify(
        files.map((file) => ({
          relativePath: file.relativePath,
          sizeBytes: file.sizeBytes,
          sha256: file.sha256
        }))
      )
    )
    .digest("hex");

const errorMessageFor = (error: unknown) => (error instanceof Error ? error.message : String(error));

const validationFailureSnapshot = (
  artifactRef: string,
  validationError: string,
  artifactRoot = ""
): ReleaseArtifactValidationSnapshot => ({
  artifactRef,
  artifactRoot,
  filesCount: 0,
  totalSizeBytes: 0,
  hasIndexHtml: false,
  hasManifest: false,
  manifestSha256: "",
  inventorySha256: "",
  readyForDeploy: false,
  validatedAt: new Date(),
  validationError
});

const persistArtifactValidationSnapshot = async (
  release: ReleaseHydratedDocument,
  snapshot: ReleaseArtifactValidationSnapshot,
  source: string
) => {
  release.set("artifactValidation", snapshot);
  await release.save();
  logger.info("releases", "Release artifact validation snapshot persisted", {
    releaseId: release._id.toString(),
    version: release.version,
    source,
    artifactRef: snapshot.artifactRef,
    artifactRoot: snapshot.artifactRoot,
    filesCount: snapshot.filesCount,
    totalSizeBytes: snapshot.totalSizeBytes,
    hasIndexHtml: snapshot.hasIndexHtml,
    hasManifest: snapshot.hasManifest,
    manifestSha256: snapshot.manifestSha256 || undefined,
    inventorySha256: snapshot.inventorySha256 || undefined,
    readyForDeploy: snapshot.readyForDeploy,
    validationError: snapshot.validationError || undefined
  });
};

const buildReleaseArtifactValidation = async (
  release: ReleaseHydratedDocument,
  source: string
): Promise<ReleaseArtifactValidationResult> => {
  const artifactRef = String(release.artifactRef || "").trim();
  logger.info("releases", "Validating release artifact", {
    releaseId: release._id.toString(),
    version: release.version,
    source,
    artifactRef
  });

  const artifact = await resolveArtifactFiles(artifactRef);
  const files: ArtifactInventoryFile[] = [];
  const missingFiles: string[] = [];

  for (const relativePath of artifact.files) {
    if (!isSafeRelativeFile(relativePath)) {
      missingFiles.push(relativePath);
      continue;
    }

    const sourcePath = path.join(artifact.artifactRoot, relativePath);
    if (!fsSync.existsSync(sourcePath) || !fsSync.statSync(sourcePath).isFile()) {
      missingFiles.push(relativePath);
      continue;
    }

    const hashed = await hashFile(sourcePath);
    files.push({
      relativePath,
      sourcePath,
      sizeBytes: hashed.sizeBytes,
      sha256: hashed.sha256
    });
  }

  const hasIndexHtml = files.some((file) => file.relativePath === "index.html");
  const totalSizeBytes = files.reduce((sum, file) => sum + file.sizeBytes, 0);
  const manifestSha256 = artifact.manifestPath ? (await hashFile(artifact.manifestPath)).sha256 : "";
  const inventorySha256 = buildInventorySha256(files);
  const blockers = [
    files.length === 0 ? "deploy-artifact-has-no-files" : "",
    !hasIndexHtml ? "deploy-artifact-missing-index-html" : "",
    ...missingFiles.map((relativePath) => `deploy-artifact-missing-file:${relativePath}`)
  ].filter(Boolean);
  const readyForDeploy = blockers.length === 0;
  const validationError = readyForDeploy ? "" : blockers.join(";");
  const snapshot: ReleaseArtifactValidationSnapshot = {
    artifactRef,
    artifactRoot: artifact.artifactRoot,
    filesCount: files.length,
    totalSizeBytes,
    hasIndexHtml,
    hasManifest: artifact.hasManifest,
    manifestSha256,
    inventorySha256,
    readyForDeploy,
    validatedAt: new Date(),
    validationError
  };

  const result: ReleaseArtifactValidationResult = {
    generatedAt: snapshot.validatedAt.toISOString(),
    releaseId: release._id.toString(),
    releaseVersion: release.version,
    artifactRef,
    artifactRoot: artifact.artifactRoot,
    files,
    missingFiles,
    blockers,
    summary: {
      filesCount: files.length,
      totalSizeBytes,
      hasIndexHtml,
      hasManifest: artifact.hasManifest,
      manifestSha256,
      inventorySha256,
      readyForDeploy
    },
    snapshot,
    notes: [
      artifact.hasManifest ? "Artifact manifest found." : "No manifest found; file list generated from folder.",
      hasIndexHtml ? "index.html is present." : "index.html is missing and deploy should not run.",
      missingFiles.length > 0 ? `${missingFiles.length} manifest file(s) were missing from the artifact root.` : ""
    ].filter(Boolean)
  };

  logger[readyForDeploy ? "info" : "warn"]("releases", "Release artifact validation completed", {
    releaseId: release._id.toString(),
    version: release.version,
    source,
    artifactRoot: artifact.artifactRoot,
    filesCount: files.length,
    totalSizeBytes,
    hasIndexHtml,
    hasManifest: artifact.hasManifest,
    readyForDeploy,
    blockers
  });

  return result;
};

const validateAndPersistReleaseArtifact = async (release: ReleaseHydratedDocument, source: string) => {
  const artifactRef = String(release.artifactRef || "").trim();

  try {
    const validation = await buildReleaseArtifactValidation(release, source);
    await persistArtifactValidationSnapshot(release, validation.snapshot, source);
    return validation;
  } catch (error) {
    const validationError = errorMessageFor(error);
    const snapshot = validationFailureSnapshot(artifactRef, validationError);
    try {
      await persistArtifactValidationSnapshot(release, snapshot, source);
    } catch (persistError) {
      logger.error("releases", "Failed to persist release artifact validation failure snapshot", {
        releaseId: release._id.toString(),
        version: release.version,
        source,
        artifactRef,
        validationError,
        persistError
      });
    }

    logger.warn("releases", "Release artifact validation failed", {
      releaseId: release._id.toString(),
      version: release.version,
      source,
      artifactRef,
      validationError
    });
    throw error;
  }
};

const contentTypeFor = (relativePath: string) => {
  const ext = path.extname(relativePath).toLowerCase();
  if (ext === ".html") return "text/html;charset=utf-8";
  if (ext === ".js" || ext === ".mjs") return "text/javascript;charset=utf-8";
  if (ext === ".css") return "text/css;charset=utf-8";
  if (ext === ".json") return "application/json;charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  if (ext === ".ico") return "image/x-icon";
  if (ext === ".woff") return "font/woff";
  if (ext === ".woff2") return "font/woff2";
  return "application/octet-stream";
};

const deployEvidenceFromRead = (
  file: DeployPlanFile,
  evidence: Awaited<ReturnType<typeof readSharePointFileEvidence>>
): DeployVerificationEvidence => ({
  relativePath: file.relativePath,
  sourcePath: file.sourcePath,
  targetPath: file.targetPath,
  status: evidence.status,
  checkedAt: new Date(evidence.checkedAt),
  expectedSizeBytes: file.sizeBytes,
  actualSizeBytes: evidence.sizeBytes || 0,
  expectedSha256: file.sha256,
  actualSha256: evidence.sha256 || "",
  sizeMatches: Boolean(evidence.sizeMatches),
  sha256Matches: Boolean(evidence.sha256Matches),
  httpStatus: evidence.httpStatus,
  httpStatusText: evidence.httpStatusText,
  contentType: evidence.contentType,
  etag: evidence.etag,
  lastModified: evidence.lastModified,
  error: evidence.error
});

const failedDeployEvidence = (file: DeployPlanFile, error: unknown): DeployVerificationEvidence => ({
  relativePath: file.relativePath,
  sourcePath: file.sourcePath,
  targetPath: file.targetPath,
  status: "failed",
  checkedAt: new Date(),
  expectedSizeBytes: file.sizeBytes,
  actualSizeBytes: 0,
  expectedSha256: file.sha256,
  actualSha256: "",
  sizeMatches: false,
  sha256Matches: false,
  error: error instanceof Error ? error.message : String(error)
});

const buildDeployVerification = (
  evidence: DeployVerificationEvidence[],
  totalSizeBytes: number,
  status: "verified" | "failed",
  postDeployHealth?: {
    finalAppUrlVerification?: FinalAppUrlHealthEvidence;
    postHealth?: DeployPostHealthSummary;
  }
) => {
  const verifiedFilesCount = evidence.filter((item) => item.status === "verified").length;
  const failedFilesCount = evidence.length - verifiedFilesCount;

  return {
    status,
    checkedAt: new Date(),
    filesCount: evidence.length,
    verifiedFilesCount,
    failedFilesCount,
    totalSizeBytes,
    evidence,
    finalAppUrlVerification: postDeployHealth?.finalAppUrlVerification,
    postHealth: postDeployHealth?.postHealth
  };
};

const withHealthCheckedAt = (health: SharePointReadOnlyHealthResult) =>
  health.evidence.map((item) => ({ ...item, checkedAt: health.checkedAt }));

const buildPostDeployHealthSummary = (health: SharePointReadOnlyHealthResult): DeployPostHealthSummary => ({
  checkedAt: health.checkedAt,
  derivedHealthStatus: String(health.derivedHealthStatus),
  evidenceCount: health.evidence.length,
  failedCount: health.evidence.filter((item) => !item.ok).length,
  authBlockedCount: health.evidence.filter((item) => item.authBlocked).length,
  health: health.health,
  evidence: withHealthCheckedAt(health)
});

const resolveSiteAndRelease = async (siteId: string, releaseId: string) => {
  const [site, release] = await Promise.all([
    Site.findById(siteId),
    Release.findById(releaseId)
  ]);

  if (!site) throw new Error("site-not-found");
  if (!release) throw new Error("release-not-found");

  const resolvedPaths = resolveSiteBuilderPaths({
    siteCode: site.siteCode,
    sharePointHost: site.sharePointHost,
    sharePointSiteUrl: site.sharePointSiteUrl,
    siteDbLibrary: site.siteDbLibrary,
    usersDbLibrary: site.usersDbLibrary,
    bootstrapLibrary: site.bootstrapLibrary,
    bootstrapFolder: site.bootstrapFolder,
    widgetsDbTarget: site.widgetsDbTarget
  });

  return { site, release, resolvedPaths };
};

export async function buildSiteDeployPlan(siteId: string, releaseId: string): Promise<SiteDeployPlan> {
  const { site, release, resolvedPaths } = await resolveSiteAndRelease(siteId, releaseId);
  const artifactValidation = await validateAndPersistReleaseArtifact(release, "deploy-plan");
  const files: DeployPlanFile[] = artifactValidation.files.map((file) => ({
    ...file,
    targetPath: `${resolvedPaths.finalDistRoot}/${file.relativePath}`
  }));
  const targetInventory = await readTargetDistInventory(resolvedPaths, files);
  const capabilities = getSharePointOperationCapabilities();
  const readyForDeploy = artifactValidation.summary.readyForDeploy;
  const readyForDeployExecution = readyForDeploy && capabilities.writeAvailable && capabilities.digest.canRequest;
  const blockers = [
    ...artifactValidation.blockers,
    !capabilities.writeAvailable ? "sharepoint-write-not-configured" : "",
    !capabilities.digest.canRequest ? "sharepoint-request-digest-not-available" : ""
  ].filter(Boolean);

  return {
    generatedAt: new Date().toISOString(),
    releaseId: release._id.toString(),
    releaseVersion: release.version,
    artifactRef: artifactValidation.artifactRef,
    artifactRoot: artifactValidation.artifactRoot,
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    resolvedPaths,
    files,
    summary: {
      filesCount: files.length,
      totalSizeBytes: artifactValidation.summary.totalSizeBytes,
      hasIndexHtml: artifactValidation.summary.hasIndexHtml,
      hasManifest: artifactValidation.summary.hasManifest,
      readyForDeploy,
      readyForDeployExecution,
      targetInventoryReadOk: targetInventory.readOk,
      staleTargetFilesCount: targetInventory.staleFilesCount
    },
    targetInventory,
    targetDistInventory: targetInventory,
    staleFilePolicy: targetInventory.staleFilePolicy,
    capabilities,
    blockers,
    notes: [
      artifactValidation.summary.hasManifest ? "Deploy file list was loaded from sharepoint-deploy-manifest.json." : "No deploy manifest was found; file inventory was generated from the artifact folder.",
      "Deploy execution overwrites listed files in final dist but does not mirror-delete files that are absent from the artifact.",
      ...targetInventory.notes,
      "Deploy execution reads every uploaded file back from SharePoint and compares sha256/size before marking success.",
      "SharePoint writes require SHAREPOINT_WRITE_ENABLED plus auth material."
    ]
  };
}

export async function validateReleaseArtifact(releaseId: string) {
  const release = await Release.findById(releaseId);
  if (!release) throw new Error("release-not-found");

  const artifactValidation = await validateAndPersistReleaseArtifact(release, "manual-validation");

  return {
    generatedAt: artifactValidation.generatedAt,
    releaseId: artifactValidation.releaseId,
    releaseVersion: artifactValidation.releaseVersion,
    artifactRef: artifactValidation.artifactRef,
    artifactRoot: artifactValidation.artifactRoot,
    summary: artifactValidation.summary,
    artifactValidation: artifactValidation.snapshot,
    validationError: artifactValidation.snapshot.validationError,
    blockers: artifactValidation.blockers,
    missingFiles: artifactValidation.missingFiles,
    sampleFiles: artifactValidation.files.slice(0, 100),
    notes: artifactValidation.notes
  };
}

export async function assertReleaseArtifactReady(releaseId: string) {
  const release = await Release.findById(releaseId);
  if (!release) throw new Error("release-not-found");

  const artifactValidation = await validateAndPersistReleaseArtifact(release, "deploy-queue");
  if (!artifactValidation.summary.readyForDeploy) {
    logger.warn("releases", "Deploy queue rejected because release artifact is not ready", {
      releaseId: release._id.toString(),
      version: release.version,
      artifactRef: artifactValidation.artifactRef,
      artifactRoot: artifactValidation.artifactRoot,
      validationError: artifactValidation.snapshot.validationError,
      blockers: artifactValidation.blockers
    });
    throw new Error("deploy-plan-not-ready");
  }

  logger.info("releases", "Release artifact ready for deploy queue", {
    releaseId: release._id.toString(),
    version: release.version,
    filesCount: artifactValidation.summary.filesCount,
    totalSizeBytes: artifactValidation.summary.totalSizeBytes,
    hasManifest: artifactValidation.summary.hasManifest,
    manifestSha256: artifactValidation.summary.manifestSha256 || undefined,
    inventorySha256: artifactValidation.summary.inventorySha256 || undefined
  });
  return artifactValidation;
}

export async function executeSharePointDeploy(input: {
  siteId: string;
  releaseId: string;
  deploymentId: string;
}) {
  logger.info("releases", "Executing SharePoint deploy", {
    siteId: input.siteId,
    releaseId: input.releaseId,
    deploymentId: input.deploymentId
  });
  const { site, release, resolvedPaths } = await resolveSiteAndRelease(input.siteId, input.releaseId);
  const deployment = await SiteVersionDeployment.findById(input.deploymentId);
  if (!deployment) throw new Error("deployment-not-found");

  const verificationEvidence: DeployVerificationEvidence[] = [];
  let plan: SiteDeployPlan | null = null;
  let finalAppUrlVerification: FinalAppUrlHealthEvidence | undefined;
  let postHealth: DeployPostHealthSummary | undefined;

  try {
    plan = await buildSiteDeployPlan(input.siteId, input.releaseId);
    if (!plan.summary.readyForDeploy) throw new Error("deploy-plan-not-ready");

    deployment.status = "running";
    deployment.startedAt = new Date();
    deployment.logLines.push({ level: "info", message: `Deploying ${plan.summary.filesCount} files from ${plan.artifactRoot}`, at: new Date() } as any);
    await deployment.save();

    const digest = await getRequestDigest(resolvedPaths);

    for (const file of plan.files) {
      try {
        const bytes = await fs.readFile(file.sourcePath);
        await uploadSharePointFile(resolvedPaths, file.targetPath, bytes, contentTypeFor(file.relativePath), digest);
        const readBackEvidence = await readSharePointFileEvidence(resolvedPaths, file.targetPath, {
          sizeBytes: file.sizeBytes,
          sha256: file.sha256
        });
        const fileEvidence = deployEvidenceFromRead(file, readBackEvidence);
        verificationEvidence.push(fileEvidence);

        logger.info("releases", "Deploy file uploaded and verified", {
          deploymentId: deployment._id.toString(),
          relativePath: file.relativePath,
          targetPath: file.targetPath,
          status: fileEvidence.status,
          sizeMatches: fileEvidence.sizeMatches,
          sha256Matches: fileEvidence.sha256Matches
        });

        if (fileEvidence.status !== "verified") {
          throw new Error(`deploy-verification-failed:${file.relativePath}`);
        }
      } catch (error) {
        if (!verificationEvidence.some((item) => item.relativePath === file.relativePath)) {
          verificationEvidence.push(failedDeployEvidence(file, error));
        }
        throw error;
      }
    }

    const postDeployHealth = await runReadOnlySharePointHealthCheck(site._id.toString());
    finalAppUrlVerification = getFinalAppUrlHealthEvidence(postDeployHealth);
    postHealth = buildPostDeployHealthSummary(postDeployHealth);
    logger.info("releases", "Post-deploy SharePoint health evidence captured", {
      siteId: site._id.toString(),
      siteCode: site.siteCode,
      deploymentId: deployment._id.toString(),
      finalAppUrl: finalAppUrlVerification?.url || resolvedPaths.finalAppUrl,
      finalAppUrlOk: finalAppUrlVerification?.ok,
      finalAppUrlStatus: finalAppUrlVerification?.status,
      derivedHealthStatus: postHealth.derivedHealthStatus,
      evidenceCount: postHealth.evidenceCount,
      failedCount: postHealth.failedCount,
      authBlockedCount: postHealth.authBlockedCount
    });

    if (!finalAppUrlVerification?.ok) {
      logger.error("releases", "Deploy final app URL verification failed", {
        siteId: site._id.toString(),
        siteCode: site.siteCode,
        deploymentId: deployment._id.toString(),
        finalAppUrl: finalAppUrlVerification?.url || resolvedPaths.finalAppUrl,
        status: finalAppUrlVerification?.status,
        statusText: finalAppUrlVerification?.statusText,
        authBlocked: finalAppUrlVerification?.authBlocked,
        error: finalAppUrlVerification?.error
      });
      throw new Error(`deploy-final-app-url-verification-failed:${resolvedPaths.finalAppUrl}`);
    }

    site.currentVersion = release.version;
    site.version = release.version;
    site.latestKnownVersion = release.version;
    site.versionStatus = "up_to_date";
    site.lastUpgradeAt = new Date();
    site.lastDeployAt = new Date();
    site.lastVersionCheckAt = new Date();
    site.sharePointStatus.deployStatus = "succeeded" as any;
    site.filesCount = plan.summary.filesCount;
    site.lastError = "";
    await site.save();

    deployment.status = "succeeded";
    deployment.finishedAt = new Date();
    deployment.verification = buildDeployVerification(verificationEvidence, plan.summary.totalSizeBytes, "verified", {
      finalAppUrlVerification,
      postHealth
    }) as any;
    deployment.logLines.push({ level: "info", message: `Deploy succeeded (${plan.summary.filesCount} files)`, at: new Date() } as any);
    await deployment.save();

    logger.info("releases", "SharePoint deploy succeeded with read-back verification", {
      siteId: site._id.toString(),
      releaseId: release._id.toString(),
      deploymentId: deployment._id.toString(),
      verifiedFilesCount: verificationEvidence.length,
      totalSizeBytes: plan.summary.totalSizeBytes,
      finalAppUrl: finalAppUrlVerification?.url,
      finalAppUrlStatus: finalAppUrlVerification?.status
    });

    return { site, release, deployment, plan };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("errors", "SharePoint deploy failed", {
      siteId: site._id.toString(),
      releaseId: release._id.toString(),
      deploymentId: deployment._id.toString(),
      error: message
    });
    site.versionStatus = "failed";
    site.sharePointStatus.deployStatus = "failed" as any;
    site.lastError = message;
    await site.save();

    deployment.status = "failed";
    deployment.finishedAt = new Date();
    deployment.error = message;
    deployment.verification = buildDeployVerification(verificationEvidence, plan?.summary.totalSizeBytes || 0, "failed", {
      finalAppUrlVerification,
      postHealth
    }) as any;
    deployment.logLines.push({ level: "error", message, at: new Date() } as any);
    await deployment.save();

    throw error;
  }
}
