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
import { getSharePointOperationCapabilities } from "./sharepointOperationClient";
import {
  FinalAppUrlHealthEvidence,
  getFinalAppUrlHealthEvidence,
  runReadOnlySharePointHealthCheck,
  SharePointReadOnlyHealthResult
} from "./sharepointHealth.service";
import { buildDeployPolicy, DeployMode, DeployPolicySnapshot } from "./deployPolicy.service";
import { getDangerousValidationBypassEnvVar, isDangerousValidationBypassEnabled } from "./dangerousBackupBypass.service";

type DeployConnectorMode = "browser-sharepoint";
export type ArtifactStorageCompatibility = "txt" | "mongo";
export type ReleaseArtifactKind = "site-builder-frontend" | "legacy-txt-frontend" | "mongo-frontend" | "unknown";

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
  manifestMetadata: Partial<ArtifactCompatibilityMetadata>;
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
  storageCompatibility: ArtifactStorageCompatibility[];
  artifactKind: ReleaseArtifactKind;
  requiresRuntimeConfig: boolean;
  preservesRuntimeConfig: boolean;
  requiredFolders: string[];
  runtimeConfigFiles: string[];
  compatibilitySource: "manifest" | "inferred" | "unknown";
  compatibilityWarnings: string[];
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
    storageCompatibility: ArtifactStorageCompatibility[];
    artifactKind: ReleaseArtifactKind;
    requiresRuntimeConfig: boolean;
    preservesRuntimeConfig: boolean;
    requiredFolders: string[];
    runtimeConfigFiles: string[];
    compatibilitySource: "manifest" | "inferred" | "unknown";
    readyForDeploy: boolean;
  };
  snapshot: ReleaseArtifactValidationSnapshot;
  notes: string[];
};

export type ReleaseArtifactManifestFile = {
  relativePath: string;
  targetRelativePath: string;
  sizeBytes: number;
  contentType: string;
  sha256: string;
  deployable: boolean;
};

export type ReleaseArtifactManifest = {
  generatedAt: string;
  releaseId: string;
  version: string;
  artifactRef: string;
  artifactRoot: string;
  compatibility: ArtifactCompatibilityMetadata;
  files: ReleaseArtifactManifestFile[];
  summary: {
    filesCount: number;
    deployableFilesCount: number;
    totalSizeBytes: number;
    hasIndexHtml: boolean;
    hasManifest: boolean;
    storageCompatibility: ArtifactStorageCompatibility[];
    artifactKind: ReleaseArtifactKind;
    requiresRuntimeConfig: boolean;
    preservesRuntimeConfig: boolean;
    requiredFolders: string[];
    runtimeConfigFiles: string[];
    compatibilitySource: "manifest" | "inferred" | "unknown";
    readyForDeploy: boolean;
  };
};

export type ReleaseArtifactFileHandle = {
  releaseId: string;
  version: string;
  artifactRoot: string;
  relativePath: string;
  absolutePath: string;
  sizeBytes: number;
  contentType: string;
  sha256: string;
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
  deployMode: DeployMode;
  connectorMode: DeployConnectorMode;
  deployPolicy: DeployPolicySnapshot;
  releaseId: string;
  releaseVersion: string;
  artifactRef: string;
  artifactRoot: string;
  artifactCompatibility: ArtifactCompatibilityMetadata;
  siteId: string;
  siteCode: string;
  target: {
    siteId: string;
    siteCode: string;
    siteDisplayName: string;
    environment: string;
    storageBackend: string;
    runtimeConfigPath: string;
    dataBackendStatus: string;
    sharePointSiteUrl: string;
    finalAppUrl: string;
    currentKnownVersion: string;
    currentVersionSource: "hub-metadata" | "unknown";
    releaseVersion: string;
    artifactPath: string;
    targetDistPath: string;
    sharePointWriteConfigured: boolean;
    backupRequired: boolean;
    mode: DeployMode;
    productionSafeMode: boolean;
    localDevOwnerMode: boolean;
  };
  resolvedPaths: SiteBuilderResolvedPaths;
  files: DeployPlanFile[];
  summary: {
    filesCount: number;
    totalSizeBytes: number;
    hasIndexHtml: boolean;
    hasManifest: boolean;
    storageCompatibility: ArtifactStorageCompatibility[];
    artifactKind: ReleaseArtifactKind;
    requiresRuntimeConfig: boolean;
    preservesRuntimeConfig: boolean;
    requiredFolders: string[];
    runtimeConfigFiles: string[];
    skippedRuntimeConfigFilesCount: number;
    readyForDeploy: boolean;
    readyForDeployExecution: boolean;
    targetInventoryReadOk?: boolean;
    staleTargetFilesCount?: number;
  };
  targetInventory?: TargetDistInventory;
  targetDistInventory?: TargetDistInventory;
  staleFilePolicy?: TargetDistInventory["staleFilePolicy"];
  capabilities: ReturnType<typeof getSharePointOperationCapabilities>;
  browserConnector?: {
    connectorMode: "browser-sharepoint";
    backendSharePointRequired: false;
    artifactManifestRequired: true;
    digestRequiredPerTargetSite: true;
    uploadImplementedInBrowser: true;
    readinessSource: "browser-digest-and-upload";
  };
  blockers: string[];
  missingRequirements: string[];
  notes: string[];
};

export type ArtifactCompatibilityMetadata = {
  storageCompatibility: ArtifactStorageCompatibility[];
  artifactKind: ReleaseArtifactKind;
  requiresRuntimeConfig: boolean;
  preservesRuntimeConfig: boolean;
  requiredFolders: string[];
  runtimeConfigFiles: string[];
  compatibilitySource: "manifest" | "inferred" | "unknown";
  compatibilityWarnings: string[];
};

const MANIFEST_NAME = "sharepoint-deploy-manifest.json";
const RUNTIME_CONFIG_FILENAMES = new Set(["sitebuilder-runtime-config.json", "runtime-config.json"]);
const SKIP_DIRS = new Set(["node_modules", ".git"]);
const TEXT_SIGNAL_EXTENSIONS = new Set([".html", ".js", ".mjs", ".cjs", ".css", ".json", ".txt"]);
const MAX_SIGNAL_SCAN_BYTES = 2 * 1024 * 1024;

const defaultArtifactCompatibility = (): ArtifactCompatibilityMetadata => ({
  storageCompatibility: [],
  artifactKind: "unknown",
  requiresRuntimeConfig: false,
  preservesRuntimeConfig: true,
  requiredFolders: [],
  runtimeConfigFiles: [],
  compatibilitySource: "unknown",
  compatibilityWarnings: []
});

const normalizeRelative = (value: string) => value.replace(/\\/g, "/").split(path.sep).join("/").replace(/^\/+/, "").replace(/\/+/g, "/");

const relativeFromTargetPath = (root: string, targetPath: string) => {
  const normalizedRoot = root.replace(/\/+$/g, "");
  const normalizedTarget = targetPath.replace(/\\/g, "/");
  const relative = normalizedTarget.startsWith(`${normalizedRoot}/`)
    ? normalizedTarget.slice(normalizedRoot.length + 1)
    : normalizedTarget.split("/").filter(Boolean).pop() || normalizedTarget;
  return normalizeRelative(relative);
};

const runtimeConfigRelativePath = (resolvedPaths: SiteBuilderResolvedPaths, site: any) => {
  const runtimeConfigPath = String(site.runtimeConfigPath || resolvedPaths.runtimeConfigPath || "").replace(/\\/g, "/");
  const root = resolvedPaths.finalDistRoot.replace(/\/+$/g, "");
  if (runtimeConfigPath.startsWith(`${root}/`)) return normalizeRelative(runtimeConfigPath.slice(root.length + 1));
  return "";
};

const isRuntimeConfigDeployFile = (relativePath: string, resolvedPaths: SiteBuilderResolvedPaths, site: any) => {
  const normalized = normalizeRelative(relativePath);
  const configuredRelative = runtimeConfigRelativePath(resolvedPaths, site);
  const filename = normalized.split("/").pop() || normalized;
  return Boolean((configuredRelative && normalized === configuredRelative) || RUNTIME_CONFIG_FILENAMES.has(filename));
};

const filterRuntimeConfigDeployFiles = <T extends { relativePath: string }>(
  files: T[],
  resolvedPaths: SiteBuilderResolvedPaths,
  site: any
) => {
  if (String(site.storageBackend || "unknown") !== "mongo") return { files, skippedRuntimeConfigFiles: [] as T[] };
  const skippedRuntimeConfigFiles = files.filter((file) => isRuntimeConfigDeployFile(file.relativePath, resolvedPaths, site));
  return {
    files: files.filter((file) => !isRuntimeConfigDeployFile(file.relativePath, resolvedPaths, site)),
    skippedRuntimeConfigFiles
  };
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

const isSafeRelativeFolder = (value: string) => {
  if (!value || path.isAbsolute(value)) return false;
  const normalized = normalizeRelative(value).replace(/\/+$/g, "");
  if (!normalized || normalized === "." || normalized.split("/").some((segment) => segment === ".." || segment === "")) return false;
  return true;
};

export const deriveRequiredFoldersFromArtifactPaths = (relativePaths: string[]) => {
  const folders = new Set<string>();
  for (const value of relativePaths) {
    const relativePath = normalizeRelative(String(value || "").trim());
    if (!isSafeRelativeFile(relativePath)) {
      throw new Error(`deploy-artifact-contains-unsafe-path:${relativePath || value}`);
    }
    const segments = relativePath.split("/").filter(Boolean);
    segments.pop();
    for (let index = 1; index <= segments.length; index += 1) {
      folders.add(segments.slice(0, index).join("/"));
    }
  }
  return Array.from(folders).sort((a, b) => a.localeCompare(b));
};

const runtimeConfigFilesFromPaths = (relativePaths: string[]) =>
  relativePaths.filter((relativePath) => RUNTIME_CONFIG_FILENAMES.has(normalizeRelative(relativePath).split("/").pop() || ""));

const normalizeStorageCompatibility = (value: unknown): ArtifactStorageCompatibility[] => {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,\s]+/) : [];
  return Array.from(
    new Set(
      raw
        .map((item) => String(item || "").trim().toLowerCase())
        .filter((item): item is ArtifactStorageCompatibility => item === "txt" || item === "mongo")
    )
  ).sort();
};

const normalizeArtifactKind = (value: unknown): ReleaseArtifactKind => {
  const normalized = String(value || "").trim();
  return ["site-builder-frontend", "legacy-txt-frontend", "mongo-frontend", "unknown"].includes(normalized)
    ? normalized as ReleaseArtifactKind
    : "unknown";
};

const booleanOrUndefined = (value: unknown) => typeof value === "boolean" ? value : undefined;

const normalizeRequiredFolders = (value: unknown) => {
  const raw = Array.isArray(value) ? value : [];
  return Array.from(
    new Set(
      raw
        .map((item) => normalizeRelative(String(item || "").trim()).replace(/\/+$/g, ""))
        .filter((item) => item && isSafeRelativeFolder(item))
    )
  ).sort((a, b) => a.localeCompare(b));
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

const readManifest = async (manifestPath: string): Promise<{ files: string[]; metadata: Partial<ArtifactCompatibilityMetadata> }> => {
  const raw = await fs.readFile(manifestPath, "utf8");
  const parsed = JSON.parse(raw);
  const manifestIsArray = Array.isArray(parsed);
  const rawFiles = manifestIsArray ? parsed : Array.isArray(parsed?.files) ? parsed.files : undefined;
  if (!Array.isArray(rawFiles)) throw new Error("deploy-manifest-must-include-files-array");
  const files = rawFiles.map((item) => normalizeRelative(String(item).trim())).filter(Boolean);
  const unsafeFiles = files.filter((item) => !isSafeRelativeFile(item));
  if (unsafeFiles.length > 0) throw new Error(`deploy-manifest-contains-unsafe-paths:${unsafeFiles.slice(0, 5).join(",")}`);
  const metadata: Partial<ArtifactCompatibilityMetadata> = manifestIsArray ? {} : {
    storageCompatibility: normalizeStorageCompatibility(parsed.storageCompatibility),
    artifactKind: normalizeArtifactKind(parsed.artifactKind),
    requiresRuntimeConfig: booleanOrUndefined(parsed.requiresRuntimeConfig),
    preservesRuntimeConfig: booleanOrUndefined(parsed.preservesRuntimeConfig),
    requiredFolders: normalizeRequiredFolders(parsed.requiredFolders),
    runtimeConfigFiles: Array.isArray(parsed.runtimeConfigFiles)
      ? runtimeConfigFilesFromPaths(parsed.runtimeConfigFiles.map((item: unknown) => String(item || "")))
      : undefined,
    compatibilityWarnings: Array.isArray(parsed.compatibilityWarnings)
      ? parsed.compatibilityWarnings.map((item: unknown) => String(item || "").trim()).filter(Boolean)
      : []
  };
  return { files: [...new Set(files)].sort(), metadata };
};

const resolveArtifactFiles = async (artifactRef: string): Promise<ResolvedArtifactFiles> => {
  const resolved = await resolveArtifactRef(artifactRef);
  const stat = await fs.stat(resolved);

  if (stat.isFile()) {
    if (path.basename(resolved) !== MANIFEST_NAME) {
      throw new Error("release-artifact-file-must-be-manifest");
    }

    const artifactRoot = path.dirname(resolved);
    const manifest = await readManifest(resolved);
    return {
      artifactRoot,
      hasManifest: true,
      manifestPath: resolved,
      files: manifest.files,
      manifestMetadata: manifest.metadata
    };
  }

  if (!stat.isDirectory()) throw new Error("release-artifact-ref-unsupported");

  const manifestPath = path.join(resolved, MANIFEST_NAME);
  if (fsSync.existsSync(manifestPath)) {
    const manifest = await readManifest(manifestPath);
    return {
      artifactRoot: resolved,
      hasManifest: true,
      manifestPath,
      files: manifest.files,
      manifestMetadata: manifest.metadata
    };
  }

  return {
    artifactRoot: resolved,
    hasManifest: false,
    manifestPath: "",
    files: await walkFiles(resolved),
    manifestMetadata: {}
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

const readArtifactSignals = async (artifactRoot: string, relativePaths: string[]) => {
  let mongoSignal = false;
  let txtSignal = false;
  const scannedFiles: string[] = [];

  for (const relativePath of relativePaths) {
    if (mongoSignal && txtSignal) break;
    const ext = path.extname(relativePath).toLowerCase();
    if (!TEXT_SIGNAL_EXTENSIONS.has(ext)) continue;
    const sourcePath = path.join(artifactRoot, relativePath);
    let stat;
    try {
      stat = await fs.stat(sourcePath);
    } catch {
      continue;
    }
    if (!stat.isFile() || stat.size > MAX_SIGNAL_SCAN_BYTES) continue;

    const lower = (await fs.readFile(sourcePath, "utf8")).toLowerCase();
    scannedFiles.push(relativePath);
    if (
      lower.includes("sitebuilder-runtime-config.json") ||
      lower.includes("runtime-config.json") ||
      lower.includes("storagebackend") ||
      lower.includes("backendapiurl") ||
      lower.includes("/api/sites/")
    ) {
      mongoSignal = true;
    }
    if (
      lower.includes("bihs_master_config_v1.txt") ||
      lower.includes("users_data.txt") ||
      lower.includes("events_data.txt") ||
      lower.includes("nav_data.txt") ||
      lower.includes("site_content_data.txt") ||
      lower.includes("widgets_data.txt")
    ) {
      txtSignal = true;
    }
  }

  return { mongoSignal, txtSignal, scannedFiles };
};

const buildArtifactCompatibilityMetadata = async (
  artifact: ResolvedArtifactFiles,
  existingRelativePaths: string[]
): Promise<ArtifactCompatibilityMetadata> => {
  const defaults = defaultArtifactCompatibility();
  const explicitStorageCompatibility = normalizeStorageCompatibility(artifact.manifestMetadata.storageCompatibility);
  const explicitKind = normalizeArtifactKind(artifact.manifestMetadata.artifactKind);
  const runtimeConfigFiles = Array.from(new Set([
    ...runtimeConfigFilesFromPaths(existingRelativePaths),
    ...(artifact.manifestMetadata.runtimeConfigFiles || [])
  ])).sort();
  const derivedRequiredFolders = deriveRequiredFoldersFromArtifactPaths(existingRelativePaths);
  const requiredFolders = artifact.manifestMetadata.requiredFolders?.length
    ? Array.from(new Set([...artifact.manifestMetadata.requiredFolders, ...derivedRequiredFolders])).sort((a, b) => a.localeCompare(b))
    : derivedRequiredFolders;
  const explicitRequiresRuntimeConfig = booleanOrUndefined(artifact.manifestMetadata.requiresRuntimeConfig);
  const explicitPreservesRuntimeConfig = booleanOrUndefined(artifact.manifestMetadata.preservesRuntimeConfig);

  if (explicitStorageCompatibility.length > 0 || explicitKind !== "unknown") {
    const storageCompatibility = explicitStorageCompatibility.length
      ? explicitStorageCompatibility
      : explicitKind === "mongo-frontend"
        ? ["mongo" as const]
        : explicitKind === "legacy-txt-frontend"
          ? ["txt" as const]
          : explicitKind === "site-builder-frontend"
            ? ["mongo" as const, "txt" as const]
            : [];
    const artifactKind = explicitKind !== "unknown"
      ? explicitKind
      : storageCompatibility.includes("mongo") && storageCompatibility.includes("txt")
        ? "site-builder-frontend"
        : storageCompatibility.includes("mongo")
          ? "mongo-frontend"
          : storageCompatibility.includes("txt")
            ? "legacy-txt-frontend"
            : "unknown";

    return {
      storageCompatibility,
      artifactKind,
      requiresRuntimeConfig: explicitRequiresRuntimeConfig ?? storageCompatibility.includes("mongo"),
      preservesRuntimeConfig: explicitPreservesRuntimeConfig ?? true,
      requiredFolders,
      runtimeConfigFiles,
      compatibilitySource: "manifest",
      compatibilityWarnings: artifact.manifestMetadata.compatibilityWarnings || []
    };
  }

  const signals = await readArtifactSignals(artifact.artifactRoot, existingRelativePaths);
  const storageCompatibility = [
    signals.txtSignal ? "txt" : "",
    (signals.mongoSignal || runtimeConfigFiles.length > 0) ? "mongo" : ""
  ].filter(Boolean).sort() as ArtifactStorageCompatibility[];
  const artifactKind: ReleaseArtifactKind = storageCompatibility.includes("mongo") && storageCompatibility.includes("txt")
    ? "site-builder-frontend"
    : storageCompatibility.includes("mongo")
      ? "mongo-frontend"
      : storageCompatibility.includes("txt")
        ? "legacy-txt-frontend"
        : "unknown";

  if (storageCompatibility.length === 0) {
    return {
      ...defaults,
      requiredFolders,
      runtimeConfigFiles,
      compatibilityWarnings: [
        "artifact-storage-compatibility-unknown",
        "Create New Site will not auto-select this release until compatibility is declared or inferable."
      ]
    };
  }

  return {
    storageCompatibility,
    artifactKind,
    requiresRuntimeConfig: explicitRequiresRuntimeConfig ?? storageCompatibility.includes("mongo"),
    preservesRuntimeConfig: explicitPreservesRuntimeConfig ?? true,
    requiredFolders,
    runtimeConfigFiles,
    compatibilitySource: "inferred",
    compatibilityWarnings: [
      signals.scannedFiles.length ? `compatibility-inferred-from:${signals.scannedFiles.slice(0, 5).join(",")}` : ""
    ].filter(Boolean)
  };
};

async function readTargetDistInventory(
  resolvedPaths: SiteBuilderResolvedPaths,
  artifactFiles: DeployPlanFile[]
): Promise<TargetDistInventory> {
  const checkedAt = new Date().toISOString();

  logger.info("releases", "Skipping server SharePoint target dist inventory before deploy", {
    siteCode: resolvedPaths.siteCode,
    distRoot: resolvedPaths.finalDistRoot,
    artifactFilesCount: artifactFiles.length,
    reason: "browser-sharepoint-inventory-required"
  });
  const files: TargetDistInventoryFile[] = [];
  const staleFiles: TargetDistInventoryFile[] = [];
  const failedFolders: TargetDistInventory["failedFolders"] = [{
    path: resolvedPaths.finalDistRoot,
    error: "browser-sharepoint-inventory-required"
  }];
  const readOk = false;
  const notes = [
    "Target dist inventory was not read from the server because server-side SharePoint REST is disabled.",
    "Browser deploy will upload and read back the files it writes, but stale target files are not enumerated by the server.",
    "Stale target files are retained by default. This deploy does not mirror-delete files absent from the artifact."
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
      summary: "Stale target dist inventory requires Browser SharePoint; cleanup is not scheduled."
    },
    notes
  };

  logger.info("releases", "Target dist inventory skipped", {
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
  ...defaultArtifactCompatibility(),
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
    storageCompatibility: snapshot.storageCompatibility,
    artifactKind: snapshot.artifactKind,
    requiresRuntimeConfig: snapshot.requiresRuntimeConfig,
    requiredFoldersCount: snapshot.requiredFolders.length,
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
  const compatibility = await buildArtifactCompatibilityMetadata(artifact, files.map((file) => file.relativePath));
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
    storageCompatibility: compatibility.storageCompatibility,
    artifactKind: compatibility.artifactKind,
    requiresRuntimeConfig: compatibility.requiresRuntimeConfig,
    preservesRuntimeConfig: compatibility.preservesRuntimeConfig,
    requiredFolders: compatibility.requiredFolders,
    runtimeConfigFiles: compatibility.runtimeConfigFiles,
    compatibilitySource: compatibility.compatibilitySource,
    compatibilityWarnings: compatibility.compatibilityWarnings,
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
      storageCompatibility: compatibility.storageCompatibility,
      artifactKind: compatibility.artifactKind,
      requiresRuntimeConfig: compatibility.requiresRuntimeConfig,
      preservesRuntimeConfig: compatibility.preservesRuntimeConfig,
      requiredFolders: compatibility.requiredFolders,
      runtimeConfigFiles: compatibility.runtimeConfigFiles,
      compatibilitySource: compatibility.compatibilitySource,
      readyForDeploy
    },
    snapshot,
    notes: [
      artifact.hasManifest ? "Artifact manifest found." : "No manifest found; file list generated from folder.",
      hasIndexHtml ? "index.html is present." : "index.html is missing and deploy should not run.",
      compatibility.storageCompatibility.length
        ? `Storage compatibility: ${compatibility.storageCompatibility.join(", ")} (${compatibility.compatibilitySource}).`
        : "Storage compatibility is unknown; Create New Site will not auto-select this release.",
      compatibility.runtimeConfigFiles.length
        ? `Artifact includes runtime config file(s): ${compatibility.runtimeConfigFiles.join(", ")}. Mongo deploy preserves existing runtime config by default.`
        : "",
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
    storageCompatibility: compatibility.storageCompatibility,
    artifactKind: compatibility.artifactKind,
    compatibilitySource: compatibility.compatibilitySource,
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
    const bypassEnvVar = getDangerousValidationBypassEnvVar("release-artifact-validation");
    if (bypassEnvVar) {
      logger.warn("releases", "Release artifact validation failure bypassed by dangerous env", {
        releaseId: release._id.toString(),
        version: release.version,
        source,
        artifactRef,
        validationError,
        envVar: bypassEnvVar
      });
      return {
        generatedAt: snapshot.validatedAt.toISOString(),
        releaseId: release._id.toString(),
        releaseVersion: release.version,
        artifactRef,
        artifactRoot: "",
        files: [],
        missingFiles: [],
        blockers: [validationError],
        summary: {
          filesCount: 0,
          totalSizeBytes: 0,
          hasIndexHtml: false,
          hasManifest: false,
          manifestSha256: "",
          inventorySha256: "",
          storageCompatibility: [],
          artifactKind: "unknown" as const,
          requiresRuntimeConfig: false,
          preservesRuntimeConfig: true,
          requiredFolders: [],
          runtimeConfigFiles: [],
          compatibilitySource: "unknown" as const,
          readyForDeploy: false
        },
        snapshot,
        notes: [`${bypassEnvVar}=true: artifact validation failure was not used as a queue/dry-run blocker.`]
      };
    }
    throw error;
  }
};

export const contentTypeFor = (relativePath: string) => {
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

export type BrowserSharePointDeploymentEvidenceInput = {
  releaseId: string;
  deployMode?: DeployMode | string;
  connectorMode: "browser-sharepoint";
  targetSite?: {
    siteId?: string;
    siteCode?: string;
    sharePointSiteUrl?: string;
  };
  targetPaths?: {
    targetDistPath?: string;
    finalAppUrl?: string;
  };
  uploadedFilesEvidence?: Array<Record<string, unknown>>;
  readBackEvidence?: Array<Record<string, unknown>>;
  finalAppUrlVerification?: Record<string, unknown>;
  errors?: Array<Record<string, unknown> | string>;
  startedAt?: string;
  completedAt?: string;
  finalStatus: "success" | "failed";
  versionBefore?: string;
  versionAfter?: string;
};

const stringValue = (value: unknown) => String(value || "").trim();
const numberValue = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const dateValue = (value: unknown, fallback = new Date()) => {
  const parsed = value ? new Date(String(value)) : fallback;
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
};

const evidenceErrorMessage = (errors?: BrowserSharePointDeploymentEvidenceInput["errors"]) =>
  (errors || [])
    .map((item) => typeof item === "string" ? item : stringValue(item?.error || item?.message || item?.relativePath))
    .filter(Boolean)
    .join("; ")
    .slice(0, 1000);

const browserEvidenceFromPayload = (
  manifestFile: ReleaseArtifactManifestFile,
  planFile: DeployPlanFile | undefined,
  payload: Record<string, unknown> | undefined
): DeployVerificationEvidence => ({
  relativePath: manifestFile.relativePath,
  sourcePath: stringValue(payload?.sourcePath) || `artifact:${manifestFile.relativePath}`,
  targetPath: stringValue(payload?.targetPath) || planFile?.targetPath || manifestFile.targetRelativePath,
  status: payload?.status === "verified" ? "verified" : "failed",
  checkedAt: dateValue(payload?.checkedAt),
  expectedSizeBytes: numberValue(payload?.expectedSizeBytes, manifestFile.sizeBytes),
  actualSizeBytes: numberValue(payload?.actualSizeBytes),
  expectedSha256: stringValue(payload?.expectedSha256) || manifestFile.sha256,
  actualSha256: stringValue(payload?.actualSha256),
  sizeMatches: Boolean(payload?.sizeMatches),
  sha256Matches: Boolean(payload?.sha256Matches),
  httpStatus: payload?.httpStatus === undefined ? undefined : numberValue(payload.httpStatus),
  httpStatusText: stringValue(payload?.httpStatusText),
  contentType: stringValue(payload?.contentType) || manifestFile.contentType,
  etag: stringValue(payload?.etag),
  lastModified: stringValue(payload?.lastModified),
  error: stringValue(payload?.error)
});

const finalAppUrlEvidenceFromPayload = (
  payload: BrowserSharePointDeploymentEvidenceInput["finalAppUrlVerification"] | undefined
): FinalAppUrlHealthEvidence | undefined => {
  if (!payload) return undefined;
  const url = stringValue(payload.url || payload.finalAppUrl);
  return {
    key: "indexExists",
    label: stringValue(payload.label) || "Final app URL",
    url,
    ok: payload.ok === true,
    status: payload.status === undefined ? numberValue(payload.httpStatus, 0) || undefined : numberValue(payload.status),
    statusText: stringValue(payload.statusText || payload.httpStatusText),
    checkedAt: stringValue(payload.checkedAt) || new Date().toISOString(),
    authBlocked: payload.authBlocked === true,
    error: stringValue(payload.error)
  };
};

export async function recordBrowserSharePointDeploymentEvidence(params: {
  siteId: string;
  input: BrowserSharePointDeploymentEvidenceInput;
  actor: string;
}) {
  if (params.input.connectorMode !== "browser-sharepoint") throw new Error("browser-deploy-connector-mode-required");
  if (!params.input.releaseId) throw new Error("releaseId-required");

  const { site, release, resolvedPaths } = await resolveSiteAndRelease(params.siteId, params.input.releaseId);
  const manifest = await getReleaseArtifactManifest(release._id.toString());
  if (!manifest.summary.readyForDeploy) throw new Error("release-artifact-not-ready");
  if (params.input.targetSite?.siteId && params.input.targetSite.siteId !== site._id.toString()) throw new Error("browser-deploy-site-mismatch");
  if (params.input.versionAfter && params.input.finalStatus === "success" && params.input.versionAfter !== release.version) {
    throw new Error("browser-deploy-version-after-mismatch");
  }

  const plannedManifestFiles = filterRuntimeConfigDeployFiles(manifest.files.filter((file) => file.deployable), resolvedPaths, site).files;
  const planFiles = plannedManifestFiles.map((file) => ({
    relativePath: file.relativePath,
    sourcePath: `artifact:${file.relativePath}`,
    targetPath: `${resolvedPaths.finalDistRoot}/${file.relativePath}`,
    sizeBytes: file.sizeBytes,
    sha256: file.sha256
  }));
  const planFilesByRelativePath = new Map(planFiles.map((file) => [file.relativePath, file]));
  const evidencePayloads = new Map(
    (params.input.readBackEvidence || params.input.uploadedFilesEvidence || [])
      .map((item) => [stringValue(item.relativePath), item] as const)
      .filter(([relativePath]) => Boolean(relativePath))
  );
  const verificationEvidence = plannedManifestFiles
    .map((file) => browserEvidenceFromPayload(file, planFilesByRelativePath.get(file.relativePath), evidencePayloads.get(file.relativePath)));
  const totalSizeBytes = plannedManifestFiles.reduce((sum, file) => sum + file.sizeBytes, 0);
  const allVerified =
    verificationEvidence.length === plannedManifestFiles.length &&
    verificationEvidence.length > 0 &&
    verificationEvidence.every((item) => item.status === "verified" && item.sizeMatches && item.sha256Matches);
  const successRequested = params.input.finalStatus === "success";
  const browserEvidenceBypassEnvVar = getDangerousValidationBypassEnvVar("browser-evidence-gates");
  const browserEvidenceBypassed = successRequested && !allVerified && isDangerousValidationBypassEnabled("browser-evidence-gates");
  if (successRequested && !allVerified && !browserEvidenceBypassed) throw new Error("browser-deploy-success-evidence-invalid");
  if (browserEvidenceBypassed) {
    logger.warn("releases", "Browser deploy evidence gate bypassed by dangerous env", {
      siteId: site._id.toString(),
      siteCode: site.siteCode,
      releaseId: release._id.toString(),
      envVar: browserEvidenceBypassEnvVar,
      evidenceCount: verificationEvidence.length,
      expectedDeployableFilesCount: plannedManifestFiles.length
    });
  }

  const startedAt = dateValue(params.input.startedAt);
  const finishedAt = dateValue(params.input.completedAt, new Date());
  const fromVersion = params.input.versionBefore || site.currentVersion || site.version || "";
  const errorMessage = successRequested ? "" : evidenceErrorMessage(params.input.errors) || "browser-deploy-failed";
  const deploymentStatus = successRequested ? "succeeded" : "failed";
  const verificationStatus = successRequested ? "verified" : "failed";
  const finalAppUrlVerification = finalAppUrlEvidenceFromPayload(params.input.finalAppUrlVerification);

  const deployment = await SiteVersionDeployment.create({
    siteId: site._id,
    releaseId: release._id,
    fromVersion,
    toVersion: release.version,
    deploymentKind: "deploy",
    status: deploymentStatus,
    startedAt,
    finishedAt,
    triggeredBy: params.actor || "browser-sharepoint",
    error: errorMessage,
    verification: {
      ...buildDeployVerification(verificationEvidence, totalSizeBytes, verificationStatus, { finalAppUrlVerification }),
      dangerousEvidenceBypass: browserEvidenceBypassed
        ? {
            envVar: browserEvidenceBypassEnvVar,
            reason: "Browser deploy success was accepted without complete read-back evidence."
          }
        : undefined
    },
    logLines: [
      {
        level: successRequested ? "info" : "error",
        message: successRequested
          ? `Browser SharePoint deploy succeeded (${verificationEvidence.length} files verified)`
          : `Browser SharePoint deploy failed: ${errorMessage}`,
        at: finishedAt
      }
    ]
  });

  const verifiedIndexHtml = verificationEvidence.some((item) => item.relativePath === "index.html" && item.status === "verified");
  const hasAssetFile = plannedManifestFiles.some((file) => file.relativePath.includes("/"));

  if (successRequested) {
    site.currentVersion = release.version;
    site.version = release.version;
    site.latestKnownVersion = release.version;
    site.versionStatus = "up_to_date";
    site.lastUpgradeAt = finishedAt;
    site.lastDeployAt = finishedAt;
    site.lastVersionCheckAt = finishedAt;
    site.sharePointStatus = {
      ...(site.sharePointStatus as any),
      deployStatus: "succeeded" as any
    };
    site.health = {
      ...((site.health as any) || {}),
      distExists: true,
      indexExists: verifiedIndexHtml || (site.health as any)?.indexExists === true,
      assetsExists: hasAssetFile || (site.health as any)?.assetsExists === true
    } as any;
    site.filesCount = plannedManifestFiles.length;
    site.lastError = "";

    const health = site.health as any;
    const storageBackend = String((site as any).storageBackend || "unknown");
    const createFlow = String((site as any).creationMode || "") === "create-new";
    const sharePointReady = health.siteDbExists === true && health.usersDbExists === true && health.distExists === true && health.indexExists === true;
    const txtReady = storageBackend === "txt" && sharePointReady && health.txtFilesExist === true;
    const mongoReady = storageBackend === "mongo" &&
      sharePointReady &&
      health.runtimeConfigExists === true &&
      health.runtimeConfigValid === true &&
      health.dataBackendReachable === true &&
      health.mongoRegistryOk === true &&
      health.mongoCollectionOk === true &&
      health.mongoSeedOk === true &&
      health.mongoBackupsOk === true;
    if (createFlow && (txtReady || mongoReady)) {
      (site as any).lifecycleStatus = "ready";
      (site as any).provisioningStatus = "succeeded";
      site.status = "active";
    } else if (createFlow) {
      (site as any).lifecycleStatus = "partially-created";
      (site as any).provisioningStatus = "partially-created";
      site.status = "draft";
    }
  } else {
    site.versionStatus = "failed";
    site.sharePointStatus = {
      ...(site.sharePointStatus as any),
      deployStatus: "failed" as any
    };
    site.lastError = errorMessage;
  }
  await site.save();

  logger[successRequested ? "info" : "warn"]("releases", "Browser SharePoint deployment evidence recorded", {
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    releaseId: release._id.toString(),
    releaseVersion: release.version,
    deploymentId: deployment._id.toString(),
    finalStatus: params.input.finalStatus,
    connectorMode: params.input.connectorMode,
    filesCount: verificationEvidence.length,
    verifiedFilesCount: verificationEvidence.filter((item) => item.status === "verified").length,
    failedFilesCount: verificationEvidence.filter((item) => item.status !== "verified").length
  });

  return {
    site,
    release,
    deployment,
    summary: {
      connectorMode: "browser-sharepoint" as const,
      finalStatus: params.input.finalStatus,
      filesCount: verificationEvidence.length,
      verifiedFilesCount: verificationEvidence.filter((item) => item.status === "verified").length,
      failedFilesCount: verificationEvidence.filter((item) => item.status !== "verified").length,
      siteVersionUpdated: successRequested
    }
  };
}

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

export async function buildSiteDeployPlan(
  siteId: string,
  releaseId: string,
  options: { deployMode?: DeployMode | string; connectorMode?: DeployConnectorMode | string } = {}
): Promise<SiteDeployPlan> {
  const { site, release, resolvedPaths } = await resolveSiteAndRelease(siteId, releaseId);
  const deployPolicy = buildDeployPolicy(options.deployMode);
  const connectorMode: DeployConnectorMode = "browser-sharepoint";
  const artifactValidationBypassEnvVar = getDangerousValidationBypassEnvVar("release-artifact-validation");
  const artifactValidationBypassed = Boolean(artifactValidationBypassEnvVar);
  const artifactValidation = await validateAndPersistReleaseArtifact(release, "deploy-plan");
  const mappedFiles: DeployPlanFile[] = artifactValidation.files.map((file) => ({
    ...file,
    targetPath: `${resolvedPaths.finalDistRoot}/${file.relativePath}`
  }));
  const { files, skippedRuntimeConfigFiles } = filterRuntimeConfigDeployFiles(mappedFiles, resolvedPaths, site);
  const targetInventory = await readTargetDistInventory(resolvedPaths, files);
  const staticCapabilities = getSharePointOperationCapabilities();
  const capabilities = {
    ...staticCapabilities,
    writeVerified: false,
    reason: staticCapabilities.reason
  };
  const readyForDeploy = artifactValidation.summary.readyForDeploy || artifactValidationBypassed;
  const mongoDeployBlockers = String((site as any).storageBackend || "unknown") === "mongo"
    ? [
        (site as any).health?.runtimeConfigExists !== true ? "mongo-runtime-config-missing" : "",
        (site as any).health?.runtimeConfigValid !== true ? "mongo-runtime-config-invalid-or-mismatch" : "",
        (site as any).health?.dataBackendReachable !== true ? "mongo-backend-not-verified" : "",
        (site as any).health?.mongoRegistryOk !== true ? "mongo-site-registry-not-verified" : "",
        (site as any).health?.mongoCollectionOk !== true ? "mongo-safe-collection-not-verified" : "",
        (site as any).health?.mongoSeedOk !== true ? "mongo-seed-docs-not-verified" : ""
      ].filter(Boolean)
    : [];
  const readyForDeployExecution =
    readyForDeploy && deployPolicy.blockers.length === 0 && mongoDeployBlockers.length === 0;
  const blockers = [
    ...deployPolicy.blockers,
    ...mongoDeployBlockers,
    ...(artifactValidationBypassed ? [] : artifactValidation.blockers)
  ].filter(Boolean);
  const currentKnownVersion = site.currentVersion || site.version || "";
  const targetDistPath = resolvedPaths.finalDistRoot;
  const missingRequirements = [
    !artifactValidationBypassed && !artifactValidation.artifactRef ? "Deploy cannot run because the release artifact is missing." : "",
    !artifactValidationBypassed && artifactValidation.artifactRef && !readyForDeploy
      ? `Deploy cannot run because the release artifact is invalid: ${artifactValidation.blockers.join(", ")}`
      : "",
    ...mongoDeployBlockers.map((blocker) => `Mongo deploy readiness blocker: ${blocker}`),
    ...deployPolicy.blockers
  ].filter(Boolean);

  return {
    generatedAt: new Date().toISOString(),
    deployMode: deployPolicy.mode,
    connectorMode,
    deployPolicy,
    releaseId: release._id.toString(),
    releaseVersion: release.version,
    artifactRef: artifactValidation.artifactRef,
    artifactRoot: artifactValidation.artifactRoot,
    artifactCompatibility: {
      storageCompatibility: artifactValidation.summary.storageCompatibility,
      artifactKind: artifactValidation.summary.artifactKind,
      requiresRuntimeConfig: artifactValidation.summary.requiresRuntimeConfig,
      preservesRuntimeConfig: artifactValidation.summary.preservesRuntimeConfig,
      requiredFolders: artifactValidation.summary.requiredFolders,
      runtimeConfigFiles: artifactValidation.summary.runtimeConfigFiles,
      compatibilitySource: artifactValidation.summary.compatibilitySource,
      compatibilityWarnings: artifactValidation.snapshot.compatibilityWarnings
    },
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    target: {
      siteId: site._id.toString(),
      siteCode: site.siteCode,
      siteDisplayName: site.displayName,
      environment: String((site as any).environment || "unknown"),
      storageBackend: String((site as any).storageBackend || "unknown"),
      runtimeConfigPath: String((site as any).runtimeConfigPath || resolvedPaths.runtimeConfigPath || ""),
      dataBackendStatus: String((site as any).dataBackendStatus || "unknown"),
      sharePointSiteUrl: site.sharePointSiteUrl,
      finalAppUrl: resolvedPaths.finalAppUrl,
      currentKnownVersion: currentKnownVersion || "Unknown",
      currentVersionSource: currentKnownVersion ? "hub-metadata" : "unknown",
      releaseVersion: release.version,
      artifactPath: artifactValidation.artifactRef,
      targetDistPath,
      sharePointWriteConfigured: staticCapabilities.writeEnabled,
      backupRequired: deployPolicy.requiresRecentVerifiedBackup,
      mode: deployPolicy.mode,
      productionSafeMode: deployPolicy.productionSafeMode,
      localDevOwnerMode: deployPolicy.localDevOwnerMode
    },
    resolvedPaths,
    files,
    summary: {
      filesCount: files.length,
      totalSizeBytes: files.reduce((sum, file) => sum + file.sizeBytes, 0),
      hasIndexHtml: artifactValidation.summary.hasIndexHtml,
      hasManifest: artifactValidation.summary.hasManifest,
      storageCompatibility: artifactValidation.summary.storageCompatibility,
      artifactKind: artifactValidation.summary.artifactKind,
      requiresRuntimeConfig: artifactValidation.summary.requiresRuntimeConfig,
      preservesRuntimeConfig: artifactValidation.summary.preservesRuntimeConfig,
      requiredFolders: artifactValidation.summary.requiredFolders,
      runtimeConfigFiles: artifactValidation.summary.runtimeConfigFiles,
      skippedRuntimeConfigFilesCount: skippedRuntimeConfigFiles.length,
      readyForDeploy,
      readyForDeployExecution,
      targetInventoryReadOk: targetInventory.readOk,
      staleTargetFilesCount: targetInventory.staleFilesCount
    },
    targetInventory,
    targetDistInventory: targetInventory,
    staleFilePolicy: targetInventory.staleFilePolicy,
    capabilities,
    browserConnector: connectorMode === "browser-sharepoint" ? {
      connectorMode: "browser-sharepoint",
      backendSharePointRequired: false,
      artifactManifestRequired: true,
      digestRequiredPerTargetSite: true,
      uploadImplementedInBrowser: true,
      readinessSource: "browser-digest-and-upload"
    } : undefined,
    blockers,
    missingRequirements,
    notes: [
      deployPolicy.warning,
      artifactValidationBypassed ? `${artifactValidationBypassEnvVar}=true: release artifact validation blockers are not blocking this dry-run/queue path.` : "",
      artifactValidation.summary.hasManifest ? "Deploy file list was loaded from sharepoint-deploy-manifest.json." : "No deploy manifest was found; file inventory was generated from the artifact folder.",
      skippedRuntimeConfigFiles.length
        ? `Mongo runtime config preservation: skipped ${skippedRuntimeConfigFiles.length} runtime config file(s) from deploy plan.`
        : "",
      artifactValidation.summary.storageCompatibility.length
        ? `Artifact compatibility: ${artifactValidation.summary.storageCompatibility.join(", ")} (${artifactValidation.summary.artifactKind}).`
        : "Artifact storage compatibility is unknown; Create New Site will not auto-select it.",
      "Deploy execution overwrites listed files in final dist but does not mirror-delete files that are absent from the artifact.",
      ...targetInventory.notes,
      "Deploy execution reads every uploaded file back from SharePoint and compares sha256/size before marking success.",
      "Browser deploy uses the user's SharePoint browser session, per-site contextinfo Digest, Files/add upload, and browser read-back evidence.",
      staticCapabilities.reason ? `Server SharePoint is disabled and not required for browser deploy: ${staticCapabilities.reason}` : ""
    ]
      .filter(Boolean)
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
    compatibility: {
      storageCompatibility: artifactValidation.summary.storageCompatibility,
      artifactKind: artifactValidation.summary.artifactKind,
      requiresRuntimeConfig: artifactValidation.summary.requiresRuntimeConfig,
      preservesRuntimeConfig: artifactValidation.summary.preservesRuntimeConfig,
      requiredFolders: artifactValidation.summary.requiredFolders,
      runtimeConfigFiles: artifactValidation.summary.runtimeConfigFiles,
      compatibilitySource: artifactValidation.summary.compatibilitySource,
      compatibilityWarnings: artifactValidation.snapshot.compatibilityWarnings
    },
    artifactValidation: artifactValidation.snapshot,
    validationError: artifactValidation.snapshot.validationError,
    blockers: artifactValidation.blockers,
    missingFiles: artifactValidation.missingFiles,
    sampleFiles: artifactValidation.files.slice(0, 100),
    notes: artifactValidation.notes
  };
}

const assertInsideRoot = async (root: string, candidate: string) => {
  const [rootRealPath, candidateRealPath] = await Promise.all([
    fs.realpath(root),
    fs.realpath(candidate)
  ]);
  const relative = path.relative(rootRealPath, candidateRealPath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("release-artifact-path-traversal-blocked");
  }
  return candidateRealPath;
};

export async function getReleaseArtifactManifest(releaseId: string): Promise<ReleaseArtifactManifest> {
  const release = await Release.findById(releaseId);
  if (!release) throw new Error("release-not-found");

  const artifactValidation = await validateAndPersistReleaseArtifact(release, "artifact-manifest");
  const files: ReleaseArtifactManifestFile[] = artifactValidation.files.map((file) => ({
    relativePath: file.relativePath,
    targetRelativePath: file.relativePath,
    sizeBytes: file.sizeBytes,
    contentType: contentTypeFor(file.relativePath),
    sha256: file.sha256,
    deployable: true
  }));

  return {
    generatedAt: new Date().toISOString(),
    releaseId: release._id.toString(),
    version: release.version,
    artifactRef: artifactValidation.artifactRef,
    artifactRoot: artifactValidation.artifactRoot,
    compatibility: {
      storageCompatibility: artifactValidation.summary.storageCompatibility,
      artifactKind: artifactValidation.summary.artifactKind,
      requiresRuntimeConfig: artifactValidation.summary.requiresRuntimeConfig,
      preservesRuntimeConfig: artifactValidation.summary.preservesRuntimeConfig,
      requiredFolders: artifactValidation.summary.requiredFolders,
      runtimeConfigFiles: artifactValidation.summary.runtimeConfigFiles,
      compatibilitySource: artifactValidation.summary.compatibilitySource,
      compatibilityWarnings: artifactValidation.snapshot.compatibilityWarnings
    },
    files,
    summary: {
      filesCount: files.length,
      deployableFilesCount: files.filter((file) => file.deployable).length,
      totalSizeBytes: artifactValidation.summary.totalSizeBytes,
      hasIndexHtml: artifactValidation.summary.hasIndexHtml,
      hasManifest: artifactValidation.summary.hasManifest,
      storageCompatibility: artifactValidation.summary.storageCompatibility,
      artifactKind: artifactValidation.summary.artifactKind,
      requiresRuntimeConfig: artifactValidation.summary.requiresRuntimeConfig,
      preservesRuntimeConfig: artifactValidation.summary.preservesRuntimeConfig,
      requiredFolders: artifactValidation.summary.requiredFolders,
      runtimeConfigFiles: artifactValidation.summary.runtimeConfigFiles,
      compatibilitySource: artifactValidation.summary.compatibilitySource,
      readyForDeploy: artifactValidation.summary.readyForDeploy
    }
  };
}

export async function getReleaseArtifactFile(releaseId: string, relativePathInput: string): Promise<ReleaseArtifactFileHandle> {
  const relativePath = normalizeRelative(String(relativePathInput || "").trim());
  if (!isSafeRelativeFile(relativePath)) throw new Error("release-artifact-file-path-invalid");

  const manifest = await getReleaseArtifactManifest(releaseId);
  const manifestFile = manifest.files.find((file) => file.deployable && file.relativePath === relativePath);
  if (!manifestFile) throw new Error("release-artifact-file-not-in-manifest");

  const absolutePath = path.resolve(manifest.artifactRoot, relativePath);
  const safeAbsolutePath = await assertInsideRoot(manifest.artifactRoot, absolutePath);
  const stat = await fs.stat(safeAbsolutePath);
  if (!stat.isFile()) throw new Error("release-artifact-file-not-found");

  const hashed = await hashFile(safeAbsolutePath);
  if (hashed.sha256 !== manifestFile.sha256 || hashed.sizeBytes !== manifestFile.sizeBytes) {
    throw new Error("release-artifact-file-hash-mismatch");
  }

  return {
    releaseId: manifest.releaseId,
    version: manifest.version,
    artifactRoot: manifest.artifactRoot,
    relativePath,
    absolutePath: safeAbsolutePath,
    sizeBytes: hashed.sizeBytes,
    contentType: manifestFile.contentType || contentTypeFor(relativePath),
    sha256: hashed.sha256
  };
}

export async function assertReleaseArtifactReady(releaseId: string) {
  const release = await Release.findById(releaseId);
  if (!release) throw new Error("release-not-found");

  const artifactValidation = await validateAndPersistReleaseArtifact(release, "deploy-queue");
  if (!artifactValidation.summary.readyForDeploy && !isDangerousValidationBypassEnabled("release-artifact-validation")) {
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
  if (!artifactValidation.summary.readyForDeploy) {
    logger.warn("releases", "Deploy queue artifact readiness gate bypassed by dangerous env", {
      releaseId: release._id.toString(),
      version: release.version,
      envVar: getDangerousValidationBypassEnvVar("release-artifact-validation"),
      blockers: artifactValidation.blockers
    });
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
}): Promise<never> {
  logger.info("releases", "Server SharePoint deploy execution blocked", {
    siteId: input.siteId,
    releaseId: input.releaseId,
    deploymentId: input.deploymentId
  });
  throw new Error("sharepoint-browser-execution-required");
}
