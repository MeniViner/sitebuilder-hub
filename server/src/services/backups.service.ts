import crypto from "crypto";
import { Types } from "mongoose";
import { Site } from "../models/Site";
import { SiteBackup } from "../models/SiteBackup";
import { getCanonicalBackupSourcePaths } from "./backupPlan.service";
import {
  createJob,
  setJobEvidence,
  setJobFailed,
  setJobResult,
  setJobStatus,
  setJobSucceeded,
  setJobTargetPaths
} from "./jobs.service";
import { resolveSiteBuilderPaths } from "../utils/sitebuilderPaths";
import {
  assertDistinctRecentVerifiedBackupForRestore,
  assertRecentVerifiedBackupForDangerousWrite,
  BackupSafetySnapshot
} from "./writeSafety.service";
import { logger } from "../utils/logger";
import { getDangerousValidationBypassEnvVar, isDangerousValidationBypassEnabled } from "./dangerousBackupBypass.service";
import {
  getBrowserRequiredJobMessage,
  getSharePointOperationPolicy
} from "./sharepointOperationPolicy.service";

type ApprovalGatedJobInput = Parameters<typeof createJob>[0] & {
  requiresApproval: boolean;
  approvalSummary: Record<string, unknown>;
  approvalSnapshot: Record<string, unknown>;
};

const BACKUP_OWNER_DIRECT_MESSAGE = "Backup job queued in owner-direct mode.";
const RESTORE_OWNER_DIRECT_MESSAGE = "Restore job queued in owner-direct mode.";
const BACKUP_ADVANCED_APPROVAL_MESSAGE = "Backup job requires approval because advanced approvals are enabled.";
const RESTORE_ADVANCED_APPROVAL_MESSAGE = "Restore job requires approval because advanced approvals are enabled.";

const buildBackupApproval = (params: {
  site: any;
  createdBy: string;
  sourcePaths: string[];
  backupTargetRoot: string;
}) => ({
  approvalSummary: {
    title: `Back up ${params.site.displayName || params.site.siteCode}`,
    message: BACKUP_ADVANCED_APPROVAL_MESSAGE,
    operation: "backup",
    siteId: params.site._id.toString(),
    siteCode: params.site.siteCode,
    sourcePathCount: params.sourcePaths.length,
    backupTargetRoot: params.backupTargetRoot,
    requestedBy: params.createdBy
  },
  approvalSnapshot: {
    capturedAt: new Date().toISOString(),
    operation: "backup",
    site: {
      id: params.site._id.toString(),
      siteCode: params.site.siteCode,
      displayName: params.site.displayName,
      sharePointSiteUrl: params.site.sharePointSiteUrl
    },
    backup: {
      sourcePaths: params.sourcePaths,
      sourcePathCount: params.sourcePaths.length,
      backupTargetRoot: params.backupTargetRoot
    },
    writeOperations: [
      "Create or ensure the SharePoint backup folder hierarchy",
      "Copy each selected source file into the backup folder",
      "Persist backup evidence and update the site backup status"
    ]
  }
});

type RestoreFilePlan = {
  sourcePath: string;
  targetPath: string;
  expectedSizeBytes: number;
  expectedSha256: string;
};

const RESTORE_RISKS = [
  "Restore overwrites live SharePoint files at the target paths.",
  "Restore does not delete live files that are absent from the backup.",
  "A failed or interrupted restore can leave the site partially restored.",
  "SharePoint writes require the existing configured write auth material and request digest."
];

const summarizeRestorePaths = (files: RestoreFilePlan[]) => ({
  fileCount: files.length,
  backupSourcePaths: {
    count: files.length,
    sample: files.slice(0, 10).map((file) => file.sourcePath)
  },
  liveTargetPaths: {
    count: files.length,
    sample: files.slice(0, 10).map((file) => file.targetPath)
  }
});

const buildRestoreApproval = (params: {
  backup: any;
  site: any;
  createdBy: string;
  files: RestoreFilePlan[];
  notes?: string;
  backupSafety: BackupSafetySnapshot;
  preRestoreBackupSafety: BackupSafetySnapshot;
}) => {
  const pathSummary = summarizeRestorePaths(params.files);
  const backupStatus = String(params.backup.status || "");
  const verificationStatus = String(params.backup.verification?.status || "unverified");
  const risks = [
    ...RESTORE_RISKS,
    verificationStatus !== "verified" ? `Backup verification status is ${verificationStatus}.` : "",
    !["verified", "succeeded"].includes(backupStatus) ? `Backup record status is ${backupStatus || "unknown"}.` : ""
  ].filter(Boolean);

  return {
    approvalSummary: {
      title: `Restore ${params.site.displayName || params.site.siteCode} from ${params.backup.backupId}`,
      message: RESTORE_ADVANCED_APPROVAL_MESSAGE,
      operation: "restore",
      backupId: params.backup._id.toString(),
      backupExternalId: params.backup.backupId,
      siteId: params.site._id.toString(),
      siteCode: params.site.siteCode,
      fileCount: params.files.length,
      pathSummary,
      risks,
      requestedBy: params.createdBy,
      notes: params.notes,
      preRestoreBackupId: params.preRestoreBackupSafety.backup?.id,
      preRestoreBackupExternalId: params.preRestoreBackupSafety.backup?.backupId
    },
    approvalSnapshot: {
      capturedAt: new Date().toISOString(),
      operation: "restore",
      backupId: params.backup._id.toString(),
      backupExternalId: params.backup.backupId,
      backupStatus,
      backupStoragePath: params.backup.storagePath,
      backupVerificationStatus: verificationStatus,
      site: {
        id: params.site._id.toString(),
        siteCode: params.site.siteCode,
        displayName: params.site.displayName,
        sharePointSiteUrl: params.site.sharePointSiteUrl
      },
      files: params.files,
      pathSummary,
      risks,
      backupSafety: params.backupSafety,
      preRestoreBackupSafety: params.preRestoreBackupSafety,
      requestedBy: params.createdBy,
      notes: params.notes || ""
    }
  };
};

export async function listBackups() {
  logger.debug("backups", "Listing backups");
  return SiteBackup.find({}).sort({ createdAt: -1 }).limit(500);
}

export async function getBackupById(id: string) {
  logger.debug("backups", "Loading backup by id", { id });
  return SiteBackup.findById(id);
}

export async function listSiteBackups(siteId: string) {
  logger.debug("backups", "Listing site backups", { siteId });
  if (!Types.ObjectId.isValid(siteId)) {
    logger.warn("backups", "Invalid site id for site backup list", { siteId });
    return [];
  }
  return SiteBackup.find({ siteId: new Types.ObjectId(siteId) }).sort({ createdAt: -1 });
}

export async function enqueueSiteBackup(params: {
  siteId: string;
  createdBy: string;
  sourcePaths?: string[];
  executionContext?: "browser-user" | "scheduled" | "backend-service";
}) {
  logger.info("backups", "Queueing site backup", {
    siteId: params.siteId,
    createdBy: params.createdBy,
    sourcePaths: params.sourcePaths
  });
  const site = await Site.findById(params.siteId);
  if (!site) throw new Error("site-not-found");
  if (site.storageBackend === "mongo") {
    const error = new Error("mongo-backup-execution-not-implemented") as Error & { details?: Record<string, unknown> };
    error.details = {
      storageBackend: "mongo",
      builderSiteId: site.mongoSiteId || site.builderSiteId || site.siteCode,
      backendApiUrlConfigured: Boolean(site.backendApiUrl || site.mongoBackendStatus?.backendApiUrl),
      backupsStatus: site.mongoBackendStatus?.backupsStatus || "unknown",
      messageHe: "אתר Mongo צריך גיבוי דרך Builder backend ולא העתקת קבצי TXT מ־SharePoint. בשלב זה ה־HUB יודע לאמת יכולת backup אבל עדיין לא מריץ יצירת backup Mongo מלאה."
    };
    throw error;
  }

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

  const sourcePaths = params.sourcePaths || getCanonicalBackupSourcePaths(resolvedPaths);
  const executionContext = params.executionContext || (params.createdBy === "scheduler" ? "scheduled" : "browser-user");
  const backupId = `backup-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const backupTargetRoot = resolvedPaths.backupsRoot;
  const backupFolder = `${backupTargetRoot}/${backupId}`;
  const approval = buildBackupApproval({
    site,
    createdBy: params.createdBy,
    sourcePaths,
    backupTargetRoot
  });

  const operation = executionContext === "scheduled" ? "scheduled-backup" : "backup";
  const browserOperationPlan = {
    operation: "backup" as const,
    policyOperation: operation,
    connectorMode: "browser-sharepoint" as const,
    executionMode: "browser-required" as const,
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    targetSiteUrl: resolvedPaths.sharePointSiteUrl,
    backupId,
    target: {
      backupsRoot: backupTargetRoot,
      backupFolder
    },
    sourcePaths,
    message: getBrowserRequiredJobMessage(operation)
  };
  const backupPolicy = getSharePointOperationPolicy(operation);
  const jobInput: ApprovalGatedJobInput = {
    type: "backup",
    siteId: site._id.toString(),
    createdBy: params.createdBy,
    requiresApproval: executionContext === "browser-user",
    executionMode: "browser-required",
    connectorMode: "browser-sharepoint",
    operationPolicy: backupPolicy.operation,
    connectorStatusLabel: backupPolicy.statusLabelHe,
    connectorBlocker: backupPolicy.blockerHe || "",
    approvalSummary: approval.approvalSummary,
    approvalSnapshot: approval.approvalSnapshot,
    payload: {
      sourcePaths,
      backupTargetRoot,
      backupId,
      backupFolder,
      connectorMode: "browser-sharepoint",
      executionMode: "browser-required",
      browserOperationPlan
    }
  };

  logger.info("jobs", "Backup job queued", {
    type: jobInput.type,
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    sourcePathCount: sourcePaths.length,
    backupTargetRoot
  });

  const job = await createJob(jobInput);

  await Site.findByIdAndUpdate(site._id, { backupStatus: "queued" });
  logger.info("backups", "Site backup queued", {
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    jobId: job._id.toString(),
    sourcePathCount: sourcePaths.length,
    requiresApproval: job.requiresApproval,
    approvalStatus: job.requiresApproval ? "pending" : "not-required"
  });

  return {
    job,
    browserOperationPlan,
    requiresApproval: job.requiresApproval,
    approvalStatus: job.requiresApproval ? "pending" : "browser-required",
    connectorMode: "browser-sharepoint" as const,
    executionMode: "browser-required" as const,
    message: job.requiresApproval
      ? "Backup job queued and requires approval because advanced approvals are enabled."
      : "נוצרה משימת גיבוי שממתינה לדפדפן SharePoint מחובר."
  };
}

export async function enqueueAllBackups(params: {
  createdBy: string;
  siteIds?: string[];
}) {
  logger.info("backups", "Queueing all backups", {
    createdBy: params.createdBy,
    siteIds: params.siteIds
  });
  const sites = params.siteIds?.length
    ? await Site.find({ _id: { $in: params.siteIds.map((id) => new Types.ObjectId(id)) } })
    : await Site.find({ status: { $ne: "archived" } });

  const jobs = [];
  const browserOperationPlans = [];
  for (const site of sites) {
    const queued = await enqueueSiteBackup({
      siteId: site._id.toString(),
      createdBy: params.createdBy,
      executionContext: "browser-user"
    });
    jobs.push(queued.job);
    if (queued.browserOperationPlan) browserOperationPlans.push(queued.browserOperationPlan);
  }

  logger.info("backups", "All backup jobs queued", {
    queued: jobs.length,
    requiresApproval: jobs.some((job) => job.requiresApproval),
    approvalStatus: jobs.some((job) => job.requiresApproval) ? "pending" : "not-required"
  });
  return {
    queued: jobs.length,
    jobs,
    browserOperationPlans,
    requiresApproval: jobs.some((job) => job.requiresApproval),
    approvalStatus: jobs.some((job) => job.requiresApproval) ? "pending" : "browser-required",
    connectorMode: "browser-sharepoint" as const,
    executionMode: "browser-required" as const,
    message: jobs.length
      ? `${jobs.length} backup job${jobs.length === 1 ? "" : "s"} waiting for browser SharePoint execution.`
      : "No backup jobs were queued."
  };
}

type StoredBackupEvidence = {
  sourcePath: string;
  targetPath: string;
  sourceSizeBytes: number;
  sourceSha256: string;
  expectedBackupSizeBytes: number;
  expectedBackupSha256: string;
};

const numberOrZero = (value: unknown) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const stringValue = (value: unknown) => String(value || "").trim();

const dateValue = (value: unknown, fallback = new Date()) => {
  const parsed = value ? new Date(String(value)) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : fallback;
};

const normalizeServerRelativePath = (value: unknown) => {
  const path = stringValue(value).replace(/\\/g, "/").replace(/\/+/g, "/");
  return path.startsWith("/") ? path : "";
};

const normalizeUrl = (value: unknown) => {
  const raw = stringValue(value).replace(/\/+$/g, "");
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/+$/g, "");
  } catch {
    return raw;
  }
};

const fileNameFromPath = (path: string) => path.split("/").filter(Boolean).pop() || "unknown.txt";

const aggregateBackupEvidenceHash = (evidence: BrowserBackupEvidence[], field: "sourceSha256" | "backupSha256") => {
  const complete = evidence.filter((item) => item[field]);
  if (!complete.length) return "";

  const manifest = complete
    .map((item) => `${item.sourcePath}\0${item.targetPath}\0${item[field]}`)
    .sort()
    .join("\n");

  return crypto.createHash("sha256").update(manifest).digest("hex");
};

const evidenceErrorMessage = (errors: unknown) => {
  if (!Array.isArray(errors)) return "";
  return errors
    .map((item) => typeof item === "string" ? item : stringValue((item as any)?.error))
    .filter(Boolean)
    .join("; ")
    .slice(0, 1000);
};

const getStoredBackupEvidence = (backup: any): StoredBackupEvidence[] => {
  const verificationEvidence = Array.isArray(backup.verification?.evidence)
    ? backup.verification.evidence
    : [];
  const sourcePathEvidence = Array.isArray(backup.sourcePaths) ? backup.sourcePaths : [];
  const rows = verificationEvidence.length ? verificationEvidence : sourcePathEvidence;

  return rows
    .map((row: any) => ({
      sourcePath: String(row.sourcePath || row.path || ""),
      targetPath: String(row.targetPath || ""),
      sourceSizeBytes: numberOrZero(row.sourceSizeBytes),
      sourceSha256: String(row.sourceSha256 || ""),
      expectedBackupSizeBytes: numberOrZero(row.expectedBackupSizeBytes || row.backupSizeBytes),
      expectedBackupSha256: String(row.expectedBackupSha256 || row.backupSha256 || "")
    }))
    .filter((row: StoredBackupEvidence) => row.sourcePath || row.targetPath);
};

const buildRestoreFilesFromEvidence = (backup: any): RestoreFilePlan[] =>
  getStoredBackupEvidence(backup)
    .map((row) => ({
      sourcePath: row.targetPath,
      targetPath: row.sourcePath,
      expectedSizeBytes: row.expectedBackupSizeBytes,
      expectedSha256: row.expectedBackupSha256
    }))
    .filter((row) => row.sourcePath && row.targetPath);

type BrowserRestoreEvidencePayload = {
  sourcePath?: string;
  targetPath?: string;
  backupPath?: string;
  status?: "verified" | "failed";
  checkedAt?: string;
  expectedBackupSizeBytes?: number;
  expectedBackupSha256?: string;
  backupSizeBytes?: number;
  backupSha256?: string;
  expectedRestoreSizeBytes?: number;
  expectedRestoreSha256?: string;
  restoredSizeBytes?: number;
  restoredSha256?: string;
  sizeMatches?: boolean;
  sha256Matches?: boolean;
  httpStatus?: number;
  httpStatusText?: string;
  contentType?: string;
  etag?: string;
  lastModified?: string;
  error?: string;
};

type BrowserBackupEvidencePayload = {
  sourcePath?: string;
  targetPath?: string;
  status?: "verified" | "failed";
  checkedAt?: string;
  sourceSizeBytes?: number;
  sourceSha256?: string;
  expectedBackupSizeBytes?: number;
  expectedBackupSha256?: string;
  backupSizeBytes?: number;
  backupSha256?: string;
  sizeMatches?: boolean;
  sha256Matches?: boolean;
  httpStatus?: number;
  httpStatusText?: string;
  contentType?: string;
  etag?: string;
  lastModified?: string;
  error?: string;
};

type BrowserBackupEvidence = {
  sourcePath: string;
  targetPath: string;
  status: "verified" | "failed";
  checkedAt: Date;
  sourceSizeBytes: number;
  sourceSha256: string;
  expectedBackupSizeBytes: number;
  expectedBackupSha256: string;
  backupSizeBytes: number;
  backupSha256: string;
  sizeMatches: boolean;
  sha256Matches: boolean;
  httpStatus?: number;
  httpStatusText?: string;
  contentType?: string;
  etag?: string;
  lastModified?: string;
  error?: string;
};

const browserBackupEvidenceFromPayload = (
  sourcePath: string,
  targetPath: string,
  payload: BrowserBackupEvidencePayload | undefined,
  checkedAt: Date
): BrowserBackupEvidence => {
  if (!payload) {
    return {
      sourcePath,
      targetPath,
      status: "failed",
      checkedAt,
      sourceSizeBytes: 0,
      sourceSha256: "",
      expectedBackupSizeBytes: 0,
      expectedBackupSha256: "",
      backupSizeBytes: 0,
      backupSha256: "",
      sizeMatches: false,
      sha256Matches: false,
      error: "browser-backup-evidence-missing"
    };
  }

  const payloadSourcePath = normalizeServerRelativePath(payload.sourcePath);
  const payloadTargetPath = normalizeServerRelativePath(payload.targetPath);
  if (payloadSourcePath && payloadSourcePath !== sourcePath) throw new Error("browser-backup-source-path-mismatch");
  if (payloadTargetPath && payloadTargetPath !== targetPath) throw new Error("browser-backup-target-path-mismatch");

  const sizeMatches = Boolean(payload.sizeMatches);
  const sha256Matches = Boolean(payload.sha256Matches);
  const status = payload.status === "verified" && sizeMatches && sha256Matches ? "verified" : "failed";

  return {
    sourcePath,
    targetPath,
    status,
    checkedAt: dateValue(payload.checkedAt, checkedAt),
    sourceSizeBytes: numberOrZero(payload.sourceSizeBytes),
    sourceSha256: stringValue(payload.sourceSha256),
    expectedBackupSizeBytes: numberOrZero(payload.expectedBackupSizeBytes),
    expectedBackupSha256: stringValue(payload.expectedBackupSha256),
    backupSizeBytes: numberOrZero(payload.backupSizeBytes),
    backupSha256: stringValue(payload.backupSha256),
    sizeMatches,
    sha256Matches,
    httpStatus: payload.httpStatus === undefined ? undefined : numberOrZero(payload.httpStatus),
    httpStatusText: stringValue(payload.httpStatusText),
    contentType: stringValue(payload.contentType),
    etag: stringValue(payload.etag),
    lastModified: stringValue(payload.lastModified),
    error: stringValue(payload.error)
  };
};

const browserRestoreEvidenceFromPayload = (
  expected: RestoreFilePlan,
  payload: BrowserRestoreEvidencePayload | undefined,
  checkedAt: Date
) => {
  if (!payload) {
    return {
      sourcePath: expected.targetPath,
      targetPath: expected.targetPath,
      backupPath: expected.sourcePath,
      status: "failed" as const,
      checkedAt,
      expectedBackupSizeBytes: expected.expectedSizeBytes,
      expectedBackupSha256: expected.expectedSha256,
      backupSizeBytes: 0,
      backupSha256: "",
      expectedRestoreSizeBytes: expected.expectedSizeBytes,
      expectedRestoreSha256: expected.expectedSha256,
      restoredSizeBytes: 0,
      restoredSha256: "",
      sizeMatches: false,
      sha256Matches: false,
      error: "browser-restore-evidence-missing"
    };
  }

  const payloadBackupPath = normalizeServerRelativePath(payload.backupPath || payload.sourcePath);
  const payloadTargetPath = normalizeServerRelativePath(payload.targetPath);
  if (payloadBackupPath && payloadBackupPath !== expected.sourcePath) throw new Error("browser-restore-backup-path-mismatch");
  if (payloadTargetPath && payloadTargetPath !== expected.targetPath) throw new Error("browser-restore-target-path-mismatch");

  const sizeMatches = Boolean(payload.sizeMatches);
  const sha256Matches = Boolean(payload.sha256Matches);
  const status = payload.status === "verified" && sizeMatches && sha256Matches ? "verified" as const : "failed" as const;

  return {
    sourcePath: expected.targetPath,
    targetPath: expected.targetPath,
    backupPath: expected.sourcePath,
    status,
    checkedAt: dateValue(payload.checkedAt, checkedAt),
    expectedBackupSizeBytes: numberOrZero(payload.expectedBackupSizeBytes || expected.expectedSizeBytes),
    expectedBackupSha256: stringValue(payload.expectedBackupSha256 || expected.expectedSha256),
    backupSizeBytes: numberOrZero(payload.backupSizeBytes),
    backupSha256: stringValue(payload.backupSha256),
    expectedRestoreSizeBytes: numberOrZero(payload.expectedRestoreSizeBytes || expected.expectedSizeBytes),
    expectedRestoreSha256: stringValue(payload.expectedRestoreSha256 || expected.expectedSha256),
    restoredSizeBytes: numberOrZero(payload.restoredSizeBytes),
    restoredSha256: stringValue(payload.restoredSha256),
    sizeMatches,
    sha256Matches,
    httpStatus: payload.httpStatus === undefined ? undefined : numberOrZero(payload.httpStatus),
    httpStatusText: stringValue(payload.httpStatusText),
    contentType: stringValue(payload.contentType),
    etag: stringValue(payload.etag),
    lastModified: stringValue(payload.lastModified),
    error: stringValue(payload.error)
  };
};

const resolveSiteBackupPaths = (site: any) =>
  resolveSiteBuilderPaths({
    siteCode: site.siteCode,
    sharePointHost: site.sharePointHost,
    sharePointSiteUrl: site.sharePointSiteUrl,
    siteDbLibrary: site.siteDbLibrary,
    usersDbLibrary: site.usersDbLibrary,
    bootstrapLibrary: site.bootstrapLibrary,
    bootstrapFolder: site.bootstrapFolder,
    widgetsDbTarget: site.widgetsDbTarget
  });

export async function recordBrowserSharePointBackupEvidence(params: {
  siteId: string;
  actor: string;
  input: {
    connectorMode: "browser-sharepoint";
    jobId?: string;
    targetSiteUrl?: string;
    backupId: string;
    target: {
      backupsRoot?: string;
      backupFolder: string;
    };
    verificationEvidence?: BrowserBackupEvidencePayload[];
    errors?: unknown[];
    startedAt?: string;
    completedAt?: string;
    finalStatus: "success" | "failed";
  };
}) {
  if (params.input.connectorMode !== "browser-sharepoint") throw new Error("browser-backup-connector-mode-required");
  const site = await Site.findById(params.siteId);
  if (!site) throw new Error("site-not-found");

  const resolvedPaths = resolveSiteBackupPaths(site);
  const backupId = stringValue(params.input.backupId);
  if (!backupId) throw new Error("browser-backup-id-required");
  const backupFolder = normalizeServerRelativePath(params.input.target?.backupFolder);
  const backupsRoot = normalizeServerRelativePath(params.input.target?.backupsRoot || resolvedPaths.backupsRoot);
  if (!backupFolder || !backupsRoot || !backupFolder.startsWith(`${resolvedPaths.backupsRoot}/`)) {
    throw new Error("browser-backup-target-folder-invalid");
  }
  if (backupFolder !== `${resolvedPaths.backupsRoot}/${backupId}`) throw new Error("browser-backup-target-folder-mismatch");
  if (backupsRoot !== resolvedPaths.backupsRoot) throw new Error("browser-backup-root-mismatch");
  if (params.input.targetSiteUrl && normalizeUrl(params.input.targetSiteUrl) !== normalizeUrl(resolvedPaths.sharePointSiteUrl)) {
    throw new Error("browser-backup-site-mismatch");
  }

  const checkedAt = dateValue(params.input.completedAt);
  const evidenceBySource = new Map(
    (params.input.verificationEvidence || [])
      .map((item) => [normalizeServerRelativePath(item.sourcePath), item] as const)
      .filter(([sourcePath]) => Boolean(sourcePath))
  );
  const canonicalSources = getCanonicalBackupSourcePaths(resolvedPaths);
  const verificationEvidence = canonicalSources.map((sourcePath) =>
    browserBackupEvidenceFromPayload(sourcePath, `${backupFolder}/${fileNameFromPath(sourcePath)}`, evidenceBySource.get(sourcePath), checkedAt)
  );
  const verifiedFilesCount = verificationEvidence.filter((item) => item.status === "verified" && item.sizeMatches && item.sha256Matches).length;
  const failedFilesCount = verificationEvidence.length - verifiedFilesCount;
  const allVerified = verificationEvidence.length > 0 && failedFilesCount === 0 && verifiedFilesCount === canonicalSources.length;
  const successRequested = params.input.finalStatus === "success";
  const browserEvidenceBypassEnvVar = getDangerousValidationBypassEnvVar("browser-evidence-gates");
  const browserEvidenceBypassed = successRequested && !allVerified && isDangerousValidationBypassEnabled("browser-evidence-gates");
  if (successRequested && !allVerified && !browserEvidenceBypassed) throw new Error("browser-backup-success-evidence-invalid");
  if (browserEvidenceBypassed) {
    logger.warn("backups", "Browser backup evidence gate bypassed by dangerous env", {
      siteId: site._id.toString(),
      siteCode: site.siteCode,
      backupId,
      envVar: browserEvidenceBypassEnvVar,
      verifiedFilesCount,
      failedFilesCount
    });
  }
  const status = successRequested ? "verified" : "failed";
  const sizeBytes = verificationEvidence.reduce((sum, item) => sum + (item.status === "verified" ? item.sourceSizeBytes : 0), 0);
  const errorMessage = successRequested ? "" : evidenceErrorMessage(params.input.errors) || "browser-sharepoint-backup-failed";
  const sourceStatus = verificationEvidence.map((item) => ({
    path: item.sourcePath,
    exists: Boolean(item.sourceSha256 || item.sourceSizeBytes),
    targetPath: item.targetPath,
    status: item.status,
    sourceSizeBytes: item.sourceSizeBytes,
    sourceSha256: item.sourceSha256,
    backupSizeBytes: item.backupSizeBytes,
    backupSha256: item.backupSha256,
    error: item.error
  }));

  const backup = await SiteBackup.create({
    siteId: site._id,
    backupId,
    status,
    storageProvider: "sharepoint",
    storagePath: backupFolder,
    sizeBytes,
    filesCount: verifiedFilesCount,
    sourceSha256: aggregateBackupEvidenceHash(verificationEvidence, "sourceSha256"),
    backupSha256: aggregateBackupEvidenceHash(verificationEvidence, "backupSha256"),
    createdBy: params.actor || "browser-sharepoint",
    sourcePaths: sourceStatus,
    verification: {
      status: successRequested ? "verified" : "failed",
      checkedAt,
      checkedBy: params.actor || "browser-sharepoint",
      details: successRequested
        ? browserEvidenceBypassed
          ? `Browser SharePoint backup accepted by dangerous env without full evidence: ${verifiedFilesCount}/${verificationEvidence.length} files verified.`
          : `Browser SharePoint backup verified ${verifiedFilesCount}/${verificationEvidence.length} files.`
        : `Browser SharePoint backup failed: ${errorMessage}`,
      evidence: verificationEvidence,
      dangerousEvidenceBypass: browserEvidenceBypassed
        ? {
            envVar: browserEvidenceBypassEnvVar,
            reason: "Browser backup success was accepted without complete read-back evidence."
          }
        : undefined
    },
    error: errorMessage
  });

  if (successRequested) {
    site.backupStatus = "succeeded";
    site.lastBackupAt = checkedAt;
    site.lastBackupId = backup.backupId;
    site.backupCount = (site.backupCount || 0) + 1;
    site.backupStorageMb = (site.backupStorageMb || 0) + Math.round(sizeBytes / (1024 * 1024));
    site.lastError = "";
  } else {
    site.backupStatus = "failed";
    site.lastError = errorMessage;
  }
  await site.save();

  if (params.input.jobId) {
    const jobId = stringValue(params.input.jobId);
    await setJobStatus(jobId, "browser-in-progress", {
      progressPercent: 80,
      message: "Browser SharePoint backup evidence received"
    });
    await setJobTargetPaths(jobId, verificationEvidence.map((item) => item.targetPath), "Browser backup target paths recorded");
    await setJobEvidence(jobId, verificationEvidence, "Browser backup per-file evidence recorded");
    await setJobResult(
      jobId,
      {
        connectorMode: "browser-sharepoint",
        backupObjectId: backup._id.toString(),
        backupId: backup.backupId,
        storagePath: backup.storagePath,
        status,
        filesCount: backup.filesCount,
        sizeBytes: backup.sizeBytes,
        verifiedFilesCount,
        failedFilesCount
      },
      "Browser backup result recorded"
    );
    if (successRequested) {
      await setJobSucceeded(jobId, "Browser SharePoint backup completed and verified");
    } else {
      await setJobFailed(jobId, errorMessage);
    }
  }

  logger[successRequested ? "info" : "warn"]("backups", "Browser SharePoint backup evidence recorded", {
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    backupId,
    connectorMode: "browser-sharepoint",
    finalStatus: params.input.finalStatus,
    verifiedFilesCount,
    failedFilesCount
  });

  return {
    site,
    backup,
    summary: {
      connectorMode: "browser-sharepoint" as const,
      finalStatus: params.input.finalStatus,
      filesCount: verificationEvidence.length,
      verifiedFilesCount,
      failedFilesCount,
      siteBackupUpdated: successRequested
    }
  };
}

const findBackupByIdOrExternalId = async (backupId: string) => {
  if (Types.ObjectId.isValid(backupId)) {
    const byId = await SiteBackup.findById(backupId);
    if (byId) return byId;
  }
  return SiteBackup.findOne({ backupId });
};

export async function recordBrowserSharePointBackupVerification(params: {
  backupId: string;
  actor: string;
  input: {
    connectorMode: "browser-sharepoint";
    verificationEvidence: BrowserBackupEvidencePayload[];
    checkedAt?: string;
    finalStatus: "success" | "failed";
  };
}) {
  if (params.input.connectorMode !== "browser-sharepoint") throw new Error("browser-backup-connector-mode-required");
  const backup = await findBackupByIdOrExternalId(params.backupId);
  if (!backup) throw new Error("backup-not-found");
  const site = await Site.findById(backup.siteId);
  if (!site) throw new Error("site-not-found");

  const storedEvidence = getStoredBackupEvidence(backup);
  if (!storedEvidence.length) throw new Error("backup-verification-evidence-missing");
  const checkedAt = dateValue(params.input.checkedAt);
  const payloadByTarget = new Map(
    (params.input.verificationEvidence || [])
      .map((item) => [normalizeServerRelativePath(item.targetPath), item] as const)
      .filter(([targetPath]) => Boolean(targetPath))
  );
  const verificationEvidence = storedEvidence.map((row) =>
    browserBackupEvidenceFromPayload(row.sourcePath, row.targetPath, payloadByTarget.get(row.targetPath), checkedAt)
  );
  const verifiedFilesCount = verificationEvidence.filter((item) => item.status === "verified" && item.sizeMatches && item.sha256Matches).length;
  const failedFilesCount = verificationEvidence.length - verifiedFilesCount;
  const allVerified = verificationEvidence.length > 0 && failedFilesCount === 0;
  const successRequested = params.input.finalStatus === "success";
  const browserEvidenceBypassEnvVar = getDangerousValidationBypassEnvVar("browser-evidence-gates");
  const browserEvidenceBypassed = successRequested && !allVerified && isDangerousValidationBypassEnabled("browser-evidence-gates");
  if (successRequested && !allVerified && !browserEvidenceBypassed) throw new Error("browser-backup-success-evidence-invalid");
  if (browserEvidenceBypassed) {
    logger.warn("backups", "Browser backup verification gate bypassed by dangerous env", {
      backupId: backup._id.toString(),
      backupExternalId: backup.backupId,
      envVar: browserEvidenceBypassEnvVar,
      verifiedFilesCount,
      failedFilesCount
    });
  }

  backup.verification = {
    status: successRequested ? "verified" : "failed",
    checkedAt,
    checkedBy: params.actor || "browser-sharepoint",
    details: browserEvidenceBypassed
      ? `Browser SharePoint verification accepted by dangerous env without full evidence: ${verifiedFilesCount}/${verificationEvidence.length} files verified.`
      : `Browser SharePoint verification completed: ${verifiedFilesCount}/${verificationEvidence.length} files verified.`,
    evidence: verificationEvidence,
    dangerousEvidenceBypass: browserEvidenceBypassed
      ? {
          envVar: browserEvidenceBypassEnvVar,
          reason: "Browser backup verification success was accepted without complete read-back evidence."
        }
      : undefined
  } as any;
  backup.status = successRequested ? "verified" : "failed";
  backup.error = successRequested ? "" : "browser-backup-verification-failed";
  await backup.save();

  if (params.input.finalStatus === "success") {
    site.backupStatus = "succeeded";
    site.lastBackupAt = checkedAt;
    site.lastBackupId = backup.backupId;
    site.lastError = "";
    await site.save();
  }

  return {
    site,
    backup,
    summary: {
      connectorMode: "browser-sharepoint" as const,
      finalStatus: params.input.finalStatus,
      filesCount: verificationEvidence.length,
      verifiedFilesCount,
      failedFilesCount
    }
  };
}

export async function enqueueBackupRestore(params: {
  backupId: string;
  createdBy: string;
  notes?: string;
  connectorMode?: "browser-sharepoint";
}) {
  logger.info("backups", "Queueing backup restore", {
    backupId: params.backupId,
    createdBy: params.createdBy,
    notes: params.notes,
    connectorMode: params.connectorMode || "browser-sharepoint"
  });
  const backup = await findBackupByIdOrExternalId(params.backupId);
  if (!backup) throw new Error("backup-not-found");

  const site = await Site.findById(backup.siteId);
  if (!site) throw new Error("site-not-found");
  const files = buildRestoreFilesFromEvidence(backup);
  if (!files.length) throw new Error("restore-evidence-missing");

  const policy = getSharePointOperationPolicy("restore");
  const job = await createJob({
    type: "restore",
    siteId: site._id.toString(),
    createdBy: params.createdBy,
    executionMode: "browser-required",
    connectorMode: "browser-sharepoint",
    operationPolicy: policy.operation,
    connectorStatusLabel: policy.statusLabelHe,
    connectorBlocker: policy.blockerHe || getBrowserRequiredJobMessage("restore"),
    payload: {
      backupId: backup._id.toString(),
      backupExternalId: backup.backupId,
      notes: params.notes || "",
      connectorMode: "browser-sharepoint",
      executionMode: "browser-required",
      browserOperationPlan: {
        operation: "restore",
        connectorMode: "browser-sharepoint",
        executionMode: "browser-required",
        backupId: backup._id.toString(),
        backupExternalId: backup.backupId,
        siteId: site._id.toString(),
        siteCode: site.siteCode,
        targetSiteUrl: site.sharePointSiteUrl,
        files,
        message: getBrowserRequiredJobMessage("restore")
      }
    }
  });

  backup.restoreStatus = "running";
  backup.lastRestoreJobId = job._id as any;
  backup.lastRestoreError = "";
  await backup.save();

  logger.info("backups", "Restore job queued for browser execution", {
    backupId: backup._id.toString(),
    backupExternalId: backup.backupId,
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    jobId: job._id.toString(),
    filesCount: files.length
  });

  return {
    job,
    backup,
    browserOperationPlan: (job.payload as any).browserOperationPlan,
    connectorMode: "browser-sharepoint" as const,
    executionMode: "browser-required" as const,
    message: "נוצרה משימת שחזור שממתינה להרצה דרך הדפדפן."
  };
}

export async function recordBrowserSharePointRestoreEvidence(params: {
  backupId: string;
  actor: string;
  input: {
    connectorMode: "browser-sharepoint";
    jobId?: string;
    targetSiteUrl?: string;
    restoreEvidence?: BrowserRestoreEvidencePayload[];
    errors?: unknown[];
    startedAt?: string;
    completedAt?: string;
    finalStatus: "success" | "failed";
  };
}) {
  if (params.input.connectorMode !== "browser-sharepoint") throw new Error("browser-restore-connector-mode-required");
  const backup = await findBackupByIdOrExternalId(params.backupId);
  if (!backup) throw new Error("backup-not-found");
  const site = await Site.findById(backup.siteId);
  if (!site) throw new Error("site-not-found");

  const resolvedPaths = resolveSiteBackupPaths(site);
  if (params.input.targetSiteUrl && normalizeUrl(params.input.targetSiteUrl) !== normalizeUrl(resolvedPaths.sharePointSiteUrl)) {
    throw new Error("browser-restore-site-mismatch");
  }

  const expectedFiles = buildRestoreFilesFromEvidence(backup);
  if (!expectedFiles.length) throw new Error("restore-evidence-missing");
  const checkedAt = dateValue(params.input.completedAt);
  const payloadByBackupPath = new Map(
    (params.input.restoreEvidence || [])
      .map((item) => [normalizeServerRelativePath(item.backupPath || item.sourcePath), item] as const)
      .filter(([backupPath]) => Boolean(backupPath))
  );
  const restoreEvidence = expectedFiles.map((file) =>
    browserRestoreEvidenceFromPayload(file, payloadByBackupPath.get(file.sourcePath), checkedAt)
  );
  const verifiedFilesCount = restoreEvidence.filter((item) => item.status === "verified" && item.sizeMatches && item.sha256Matches).length;
  const failedFilesCount = restoreEvidence.length - verifiedFilesCount;
  const successRequested = params.input.finalStatus === "success";
  const allVerified = restoreEvidence.length > 0 && failedFilesCount === 0;
  const finalStatus = successRequested && allVerified ? "verified" : "failed";
  const errorMessage = finalStatus === "verified" ? "" : evidenceErrorMessage(params.input.errors) || "browser-sharepoint-restore-failed";

  backup.restoreStatus = finalStatus;
  backup.lastRestoreAt = checkedAt;
  if (params.input.jobId && Types.ObjectId.isValid(params.input.jobId)) {
    backup.lastRestoreJobId = new Types.ObjectId(params.input.jobId) as any;
  }
  backup.restoreEvidence = restoreEvidence as any;
  backup.lastRestoreError = errorMessage;
  await backup.save();

  site.lastError = errorMessage;
  if (!errorMessage) {
    site.lastHealthCheckAt = checkedAt;
  }
  await site.save();

  const jobId = stringValue(params.input.jobId);
  if (jobId) {
    await setJobStatus(jobId, "browser-in-progress", {
      progressPercent: 80,
      message: "Browser SharePoint restore evidence received"
    });
    await setJobTargetPaths(jobId, restoreEvidence.map((item) => item.targetPath), "Browser restore target paths recorded");
    await setJobEvidence(jobId, restoreEvidence, "Browser restore per-file evidence recorded");
    await setJobResult(
      jobId,
      {
        connectorMode: "browser-sharepoint",
        backupObjectId: backup._id.toString(),
        backupId: backup.backupId,
        status: finalStatus,
        filesCount: restoreEvidence.length,
        verifiedFilesCount,
        failedFilesCount
      },
      "Browser restore result recorded"
    );
    if (finalStatus === "verified") await setJobSucceeded(jobId, "Browser SharePoint restore completed and verified");
    else await setJobFailed(jobId, errorMessage);
  }

  logger[finalStatus === "verified" ? "info" : "warn"]("backups", "Browser SharePoint restore evidence recorded", {
    backupId: backup._id.toString(),
    backupExternalId: backup.backupId,
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    finalStatus,
    verifiedFilesCount,
    failedFilesCount
  });

  return {
    site,
    backup,
    summary: {
      connectorMode: "browser-sharepoint" as const,
      finalStatus,
      filesCount: restoreEvidence.length,
      verifiedFilesCount,
      failedFilesCount
    }
  };
}

const failedVerificationEvidence = (row: StoredBackupEvidence, error: string) => ({
  sourcePath: row.sourcePath,
  targetPath: row.targetPath,
  status: "failed" as const,
  checkedAt: new Date(),
  sourceSizeBytes: row.sourceSizeBytes,
  sourceSha256: row.sourceSha256,
  expectedBackupSizeBytes: row.expectedBackupSizeBytes,
  expectedBackupSha256: row.expectedBackupSha256,
  backupSizeBytes: 0,
  backupSha256: "",
  sizeMatches: false,
  sha256Matches: false,
  error
});

export async function verifyBackup(params: {
  backupId: string;
  checkedBy: string;
  details?: string;
}): Promise<never> {
  logger.info("backups", "Verifying backup", {
    backupId: params.backupId,
    checkedBy: params.checkedBy,
    details: params.details
  });
  const backup = await SiteBackup.findById(params.backupId);
  if (!backup) throw new Error("backup-not-found");
  throw new Error("browser-backup-verification-required");
}

export async function createRestorePlan(params: {
  backupId: string;
  requestedBy: string;
  notes?: string;
}) {
  logger.info("backups", "Creating restore plan", {
    backupId: params.backupId,
    requestedBy: params.requestedBy,
    notes: params.notes
  });
  const backup = await SiteBackup.findById(params.backupId);
  if (!backup) throw new Error("backup-not-found");

  backup.restorePlan = [
    `Requested by: ${params.requestedBy}`,
    `Created at: ${new Date().toISOString()}`,
    "Steps:",
    "1. Validate backup folder access",
    "2. Validate file count and checksum",
    "3. Approve restore maintenance window",
    "4. Restore site libraries and verify health",
    params.notes ? `Notes: ${params.notes}` : ""
  ].filter(Boolean).join("\n");

  await backup.save();
  logger.info("backups", "Restore plan saved", { backupId: backup._id.toString() });
  return backup;
}
