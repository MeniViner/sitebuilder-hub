import type {
  BackupSourceEvidence,
  BackupVerificationEvidence,
  BrowserBackupOperationPlan,
  DeploymentVerificationEvidence
} from "../api/sitesApi";
import type { Site } from "../types/site";
import { resolveSiteBuilderPaths, type SiteBuilderResolvedPaths } from "./sitebuilderPaths";
import {
  ensureSharePointFolderHierarchyBrowser,
  getBrowserRequestDigest,
  normalizeSharePointSiteUrl,
  readBackSharePointFileBrowser,
  readSharePointFileBrowser,
  uploadFileToSharePointBrowser,
  type BrowserSharePointBackupProgressEvent,
  type BrowserSharePointFileReadResult,
  type BrowserSharePointUploadResult
} from "./sharepointBrowserConnector";

export type BrowserSharePointOperationStepEvidence = {
  step: string;
  status: "succeeded" | "failed";
  targetSiteUrl: string;
  path?: string;
  httpStatus?: number;
  error?: string;
  checkedAt: string;
};

export type BrowserSharePointBackupRunnerOptions = {
  plan?: BrowserBackupOperationPlan;
  onFileProgress?: (event: BrowserSharePointBackupProgressEvent) => void;
};

export type BrowserSharePointBackupRunnerResult = {
  siteId: string;
  siteCode: string;
  connectorMode: "browser-sharepoint";
  targetSiteUrl: string;
  backupId: string;
  target: {
    backupsRoot: string;
    backupFolder: string;
  };
  startedAt: string;
  completedAt: string;
  finalStatus: "success" | "failed";
  sourcePaths: BackupSourceEvidence[];
  verificationEvidence: BackupVerificationEvidence[];
  errors: Array<{ sourcePath?: string; targetPath?: string; error: string; status?: number }>;
  steps: BrowserSharePointOperationStepEvidence[];
};

const fileNameFromPath = (path: string) => path.split("/").filter(Boolean).pop() || "unknown.txt";

const contentTypeForSharePointPath = (serverRelativePath: string) => {
  const lower = serverRelativePath.toLowerCase();
  if (lower.endsWith(".html")) return "text/html;charset=utf-8";
  if (lower.endsWith(".css")) return "text/css;charset=utf-8";
  if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "text/javascript;charset=utf-8";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".json")) return "application/json;charset=utf-8";
  if (lower.endsWith(".txt")) return "text/plain;charset=utf-8";
  return "application/octet-stream";
};

const resolvePathsForSite = (site: Site): SiteBuilderResolvedPaths => {
  const generated = resolveSiteBuilderPaths({
    siteCode: site.siteCode,
    sharePointHost: site.sharePointHost,
    sharePointSiteUrl: site.sharePointSiteUrl,
    siteDbLibrary: site.siteDbLibrary,
    usersDbLibrary: site.usersDbLibrary,
    bootstrapLibrary: site.bootstrapLibrary,
    bootstrapFolder: site.bootstrapFolder,
    widgetsDbTarget: site.widgetsDbTarget
  });
  if (!generated) throw new Error("sharepoint-paths-missing");
  const stored = site.resolvedPaths || {};
  return {
    ...generated,
    ...stored,
    host: stored.host || generated.host,
    siteRoot: stored.siteRoot || generated.siteRoot,
    sharePointSiteUrl: stored.sharePointSiteUrl || site.sharePointSiteUrl || generated.sharePointSiteUrl,
    txtFiles: {
      ...generated.txtFiles,
      ...(stored.txtFiles || {})
    }
  };
};

const defaultBackupPlan = (site: Site, paths: SiteBuilderResolvedPaths): BrowserBackupOperationPlan => {
  const backupId = `backup-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  return {
    operation: "backup",
    connectorMode: "browser-sharepoint",
    executionMode: "browser-required",
    siteId: site._id,
    siteCode: site.siteCode,
    targetSiteUrl: normalizeSharePointSiteUrl(paths.sharePointSiteUrl || site.sharePointSiteUrl),
    backupId,
    target: {
      backupsRoot: paths.backupsRoot,
      backupFolder: `${paths.backupsRoot}/${backupId}`
    },
    sourcePaths: Object.values(paths.txtFiles)
  };
};

const pushStep = (
  steps: BrowserSharePointOperationStepEvidence[],
  input: Omit<BrowserSharePointOperationStepEvidence, "checkedAt">
) => {
  steps.push({ ...input, checkedAt: new Date().toISOString() });
};

export async function requestDigestForBrowserOperation(targetSiteUrl: string) {
  return getBrowserRequestDigest(targetSiteUrl);
}

export async function readFileForBrowserOperation(targetSiteUrl: string, serverRelativePath: string) {
  return readSharePointFileBrowser(targetSiteUrl, serverRelativePath);
}

export async function writeTextFileForBrowserOperation(params: {
  targetSiteUrl: string;
  targetPath: string;
  text: string;
  expectedSha256?: string;
}) {
  const bytes = new TextEncoder().encode(params.text);
  return uploadFileToSharePointBrowser({
    targetSiteUrl: params.targetSiteUrl,
    targetPath: params.targetPath,
    relativePath: fileNameFromPath(params.targetPath),
    body: bytes,
    contentType: "text/plain;charset=utf-8",
    expectedSizeBytes: bytes.byteLength,
    expectedSha256: params.expectedSha256
  });
}

export async function uploadBinaryFileForBrowserOperation(params: {
  targetSiteUrl: string;
  targetPath: string;
  relativePath?: string;
  body: Blob | ArrayBuffer | Uint8Array;
  contentType?: string;
  expectedSizeBytes?: number;
  expectedSha256?: string;
}) {
  return uploadFileToSharePointBrowser({
    targetSiteUrl: params.targetSiteUrl,
    targetPath: params.targetPath,
    relativePath: params.relativePath || fileNameFromPath(params.targetPath),
    body: params.body,
    contentType: params.contentType || contentTypeForSharePointPath(params.targetPath),
    expectedSizeBytes: params.expectedSizeBytes,
    expectedSha256: params.expectedSha256
  });
}

export async function readBackVerifyForBrowserOperation(params: {
  targetSiteUrl: string;
  targetPath: string;
  relativePath?: string;
  expectedSizeBytes?: number;
  expectedSha256?: string;
}) {
  return readBackSharePointFileBrowser({
    targetSiteUrl: params.targetSiteUrl,
    targetPath: params.targetPath,
    relativePath: params.relativePath || fileNameFromPath(params.targetPath),
    body: new ArrayBuffer(0),
    expectedSizeBytes: params.expectedSizeBytes,
    expectedSha256: params.expectedSha256
  });
}

const backupEvidenceFromReadBack = (
  sourcePath: string,
  targetPath: string,
  source: BrowserSharePointFileReadResult,
  readBack: DeploymentVerificationEvidence
): BackupVerificationEvidence => ({
  sourcePath,
  targetPath,
  status: readBack.status,
  checkedAt: readBack.checkedAt,
  sourceSizeBytes: source.sizeBytes || 0,
  sourceSha256: source.sha256 || "",
  expectedBackupSizeBytes: source.sizeBytes || 0,
  expectedBackupSha256: source.sha256 || "",
  backupSizeBytes: readBack.actualSizeBytes || 0,
  backupSha256: readBack.actualSha256 || "",
  sizeMatches: Boolean(readBack.sizeMatches),
  sha256Matches: Boolean(readBack.sha256Matches),
  httpStatus: readBack.httpStatus,
  httpStatusText: readBack.httpStatusText,
  contentType: readBack.contentType,
  etag: readBack.etag,
  lastModified: readBack.lastModified,
  error: readBack.error
});

const failedBackupEvidence = (
  sourcePath: string,
  targetPath: string,
  error: unknown,
  source?: BrowserSharePointFileReadResult
): BackupVerificationEvidence => ({
  sourcePath,
  targetPath,
  status: "failed",
  checkedAt: new Date().toISOString(),
  sourceSizeBytes: source?.sizeBytes || 0,
  sourceSha256: source?.sha256 || "",
  expectedBackupSizeBytes: source?.sizeBytes || 0,
  expectedBackupSha256: source?.sha256 || "",
  backupSizeBytes: 0,
  backupSha256: "",
  sizeMatches: false,
  sha256Matches: false,
  httpStatus: source?.status,
  httpStatusText: source?.statusText,
  error: error instanceof Error ? error.message : String(error)
});

export async function runBrowserSharePointBackupOperation(
  site: Site,
  options: BrowserSharePointBackupRunnerOptions = {}
): Promise<BrowserSharePointBackupRunnerResult> {
  const startedAt = new Date().toISOString();
  const paths = resolvePathsForSite(site);
  const plan = options.plan || defaultBackupPlan(site, paths);
  const targetSiteUrl = normalizeSharePointSiteUrl(plan.targetSiteUrl || paths.sharePointSiteUrl || site.sharePointSiteUrl);
  const sourcePaths = plan.sourcePaths?.length ? plan.sourcePaths : Object.values(paths.txtFiles);
  const steps: BrowserSharePointOperationStepEvidence[] = [];
  const sourcePathEvidence: BackupSourceEvidence[] = [];
  const verificationEvidence: BackupVerificationEvidence[] = [];
  const errors: BrowserSharePointBackupRunnerResult["errors"] = [];

  try {
    await requestDigestForBrowserOperation(targetSiteUrl);
    pushStep(steps, { step: "request-digest", status: "succeeded", targetSiteUrl });
    await ensureSharePointFolderHierarchyBrowser(paths, plan.target.backupFolder);
    pushStep(steps, { step: "ensure-folder-hierarchy", status: "succeeded", targetSiteUrl, path: plan.target.backupFolder });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    pushStep(steps, { step: "prepare-target", status: "failed", targetSiteUrl, path: plan.target.backupFolder, error: message });
    return {
      siteId: site._id,
      siteCode: site.siteCode,
      connectorMode: "browser-sharepoint",
      targetSiteUrl,
      backupId: plan.backupId,
      target: plan.target,
      startedAt,
      completedAt: new Date().toISOString(),
      finalStatus: "failed",
      sourcePaths: sourcePathEvidence,
      verificationEvidence,
      errors: [{ targetPath: plan.target.backupFolder, error: message }],
      steps
    };
  }

  for (const sourcePath of sourcePaths) {
    const targetPath = `${plan.target.backupFolder}/${fileNameFromPath(sourcePath)}`;
    let source: BrowserSharePointFileReadResult | undefined;
    try {
      options.onFileProgress?.({ siteId: site._id, siteCode: site.siteCode, sourcePath, targetPath, status: "reading" });
      source = await readFileForBrowserOperation(targetSiteUrl, sourcePath);
      if (!source.ok || !source.bytes) {
        throw new Error(source.error || `browser-sharepoint-source-read-failed:${source.status || "unknown"}`);
      }
      pushStep(steps, { step: "read-file", status: "succeeded", targetSiteUrl, path: sourcePath, httpStatus: source.status });

      options.onFileProgress?.({ siteId: site._id, siteCode: site.siteCode, sourcePath, targetPath, status: "uploading" });
      const upload: BrowserSharePointUploadResult = await uploadBinaryFileForBrowserOperation({
        targetSiteUrl,
        targetPath,
        relativePath: fileNameFromPath(sourcePath),
        body: source.bytes,
        contentType: source.contentType || contentTypeForSharePointPath(sourcePath),
        expectedSizeBytes: source.sizeBytes,
        expectedSha256: source.sha256
      });
      if (upload.status !== "uploaded") {
        throw new Error(upload.error || `browser-sharepoint-backup-upload-failed:${upload.httpStatus || "unknown"}`);
      }
      pushStep(steps, { step: "upload-file", status: "succeeded", targetSiteUrl, path: targetPath, httpStatus: upload.httpStatus });

      options.onFileProgress?.({ siteId: site._id, siteCode: site.siteCode, sourcePath, targetPath, status: "verifying" });
      const readBack = await readBackVerifyForBrowserOperation({
        targetSiteUrl,
        targetPath,
        relativePath: fileNameFromPath(sourcePath),
        expectedSizeBytes: source.sizeBytes,
        expectedSha256: source.sha256
      });
      const evidence = backupEvidenceFromReadBack(sourcePath, targetPath, source, readBack);
      verificationEvidence.push(evidence);
      sourcePathEvidence.push({
        path: sourcePath,
        exists: true,
        targetPath,
        status: evidence.status,
        sourceSizeBytes: source.sizeBytes || 0,
        sourceSha256: source.sha256 || "",
        backupSizeBytes: evidence.backupSizeBytes || 0,
        backupSha256: evidence.backupSha256 || "",
        error: evidence.error
      });

      if (evidence.status === "verified" && evidence.sizeMatches && evidence.sha256Matches) {
        pushStep(steps, { step: "read-back-verify", status: "succeeded", targetSiteUrl, path: targetPath, httpStatus: evidence.httpStatus });
        options.onFileProgress?.({ siteId: site._id, siteCode: site.siteCode, sourcePath, targetPath, status: "verified" });
      } else {
        const error = evidence.error || "browser-sharepoint-backup-readback-mismatch";
        errors.push({ sourcePath, targetPath, error, status: evidence.httpStatus });
        pushStep(steps, { step: "read-back-verify", status: "failed", targetSiteUrl, path: targetPath, httpStatus: evidence.httpStatus, error });
        options.onFileProgress?.({ siteId: site._id, siteCode: site.siteCode, sourcePath, targetPath, status: "failed", error });
      }
    } catch (error) {
      const failed = failedBackupEvidence(sourcePath, targetPath, error, source);
      verificationEvidence.push(failed);
      sourcePathEvidence.push({
        path: sourcePath,
        exists: Boolean(source?.ok),
        targetPath,
        status: "failed",
        sourceSizeBytes: source?.sizeBytes || 0,
        sourceSha256: source?.sha256 || "",
        backupSizeBytes: 0,
        backupSha256: "",
        error: failed.error
      });
      errors.push({ sourcePath, targetPath, error: failed.error || "browser-sharepoint-backup-file-failed", status: failed.httpStatus });
      pushStep(steps, { step: "file-backup", status: "failed", targetSiteUrl, path: sourcePath, httpStatus: failed.httpStatus, error: failed.error });
      options.onFileProgress?.({ siteId: site._id, siteCode: site.siteCode, sourcePath, targetPath, status: "failed", error: failed.error });
    }
  }

  const finalStatus =
    verificationEvidence.length === sourcePaths.length &&
    verificationEvidence.every((item) => item.status === "verified" && item.sizeMatches && item.sha256Matches)
      ? "success"
      : "failed";

  return {
    siteId: site._id,
    siteCode: site.siteCode,
    connectorMode: "browser-sharepoint",
    targetSiteUrl,
    backupId: plan.backupId,
    target: plan.target,
    startedAt,
    completedAt: new Date().toISOString(),
    finalStatus,
    sourcePaths: sourcePathEvidence,
    verificationEvidence,
    errors,
    steps
  };
}
