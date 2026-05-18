import { Types } from "mongoose";
import { Site } from "../models/Site";
import { SiteBackup } from "../models/SiteBackup";
import { getCanonicalBackupSourcePaths } from "./backupPlan.service";
import { createJob } from "./jobs.service";
import { resolveSiteBuilderPaths } from "../utils/sitebuilderPaths";
import {
  assertSharePointWriteAvailable,
  readSharePointFileEvidence
} from "./sharepointOperationClient";
import {
  assertDistinctRecentVerifiedBackupForRestore,
  assertRecentVerifiedBackupForDangerousWrite,
  BackupSafetySnapshot
} from "./writeSafety.service";
import { logger } from "../utils/logger";

type ApprovalGatedJobInput = Parameters<typeof createJob>[0] & {
  requiresApproval: true;
  approvalSummary: Record<string, unknown>;
  approvalSnapshot: Record<string, unknown>;
};

const BACKUP_APPROVAL_MESSAGE = "Backup job is awaiting approval before SharePoint files are copied into the backup folder.";
const RESTORE_APPROVAL_MESSAGE = "Restore job is awaiting approval before backup files overwrite live SharePoint files.";

const buildBackupApproval = (params: {
  site: any;
  createdBy: string;
  sourcePaths: string[];
  backupTargetRoot: string;
}) => ({
  approvalSummary: {
    title: `Back up ${params.site.displayName || params.site.siteCode}`,
    message: BACKUP_APPROVAL_MESSAGE,
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
      message: RESTORE_APPROVAL_MESSAGE,
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
}) {
  logger.info("backups", "Queueing site backup", {
    siteId: params.siteId,
    createdBy: params.createdBy,
    sourcePaths: params.sourcePaths
  });
  const site = await Site.findById(params.siteId);
  if (!site) throw new Error("site-not-found");
  assertSharePointWriteAvailable();

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
  const approval = buildBackupApproval({
    site,
    createdBy: params.createdBy,
    sourcePaths,
    backupTargetRoot: resolvedPaths.backupsRoot
  });
  const jobInput: ApprovalGatedJobInput = {
    type: "backup",
    siteId: site._id.toString(),
    createdBy: params.createdBy,
    requiresApproval: true,
    approvalSummary: approval.approvalSummary,
    approvalSnapshot: approval.approvalSnapshot,
    payload: {
      sourcePaths,
      backupTargetRoot: resolvedPaths.backupsRoot
    }
  };

  logger.info("jobs", "Approval required for backup job", {
    type: jobInput.type,
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    sourcePathCount: sourcePaths.length,
    backupTargetRoot: resolvedPaths.backupsRoot
  });

  const job = await createJob(jobInput);

  await Site.findByIdAndUpdate(site._id, { backupStatus: "queued" });
  logger.info("backups", "Site backup queued awaiting approval", {
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    jobId: job._id.toString(),
    sourcePathCount: sourcePaths.length,
    requiresApproval: true,
    approvalStatus: "pending"
  });

  return {
    job,
    requiresApproval: true,
    approvalStatus: "pending",
    message: BACKUP_APPROVAL_MESSAGE
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
  assertSharePointWriteAvailable();

  const sites = params.siteIds?.length
    ? await Site.find({ _id: { $in: params.siteIds.map((id) => new Types.ObjectId(id)) } })
    : await Site.find({ status: { $ne: "archived" } });

  const jobs = [];
  for (const site of sites) {
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

    const sourcePaths = getCanonicalBackupSourcePaths(resolvedPaths);
    const approval = buildBackupApproval({
      site,
      createdBy: params.createdBy,
      sourcePaths,
      backupTargetRoot: resolvedPaths.backupsRoot
    });
    const jobInput: ApprovalGatedJobInput = {
      type: "backup",
      siteId: site._id.toString(),
      createdBy: params.createdBy,
      requiresApproval: true,
      approvalSummary: approval.approvalSummary,
      approvalSnapshot: approval.approvalSnapshot,
      payload: {
        sourcePaths,
        backupTargetRoot: resolvedPaths.backupsRoot
      }
    };

    logger.info("jobs", "Approval required for backup job", {
      type: jobInput.type,
      siteId: site._id.toString(),
      siteCode: site.siteCode,
      sourcePathCount: sourcePaths.length,
      backupTargetRoot: resolvedPaths.backupsRoot
    });

    const job = await createJob(jobInput);

    await Site.findByIdAndUpdate(site._id, { backupStatus: "queued" });
    logger.info("backups", "Backup job queued awaiting approval", {
      siteId: site._id.toString(),
      siteCode: site.siteCode,
      jobId: job._id.toString(),
      sourcePathCount: sourcePaths.length,
      requiresApproval: true,
      approvalStatus: "pending"
    });
    jobs.push(job);
  }

  logger.info("backups", "All backup jobs queued awaiting approval", {
    queued: jobs.length,
    requiresApproval: true,
    approvalStatus: "pending"
  });
  return {
    queued: jobs.length,
    jobs,
    requiresApproval: true,
    approvalStatus: "pending",
    message: jobs.length
      ? `${jobs.length} backup job${jobs.length === 1 ? "" : "s"} awaiting approval before SharePoint writes start.`
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

export async function enqueueBackupRestore(params: {
  backupId: string;
  createdBy: string;
  notes?: string;
}) {
  logger.info("backups", "Queueing backup restore", {
    backupId: params.backupId,
    createdBy: params.createdBy,
    notes: params.notes
  });
  const backup = await SiteBackup.findById(params.backupId);
  if (!backup) throw new Error("backup-not-found");

  const site = await Site.findById(backup.siteId);
  if (!site) throw new Error("site-not-found");
  assertSharePointWriteAvailable();

  const files = buildRestoreFilesFromEvidence(backup);
  if (!files.length) throw new Error("backup-restore-evidence-missing");
  const backupSafety = await assertRecentVerifiedBackupForDangerousWrite({
    siteId: site._id,
    operation: "restore"
  });
  const preRestoreBackupSafety = await assertDistinctRecentVerifiedBackupForRestore({
    siteId: site._id,
    restoreBackupObjectId: backup._id,
    restoreBackupExternalId: backup.backupId
  });

  const approval = buildRestoreApproval({
    backup,
    site,
    createdBy: params.createdBy,
    files,
    notes: params.notes,
    backupSafety,
    preRestoreBackupSafety
  });

  const jobInput: ApprovalGatedJobInput = {
    type: "restore",
    siteId: site._id.toString(),
    createdBy: params.createdBy,
    requiresApproval: true,
    approvalSummary: approval.approvalSummary,
    approvalSnapshot: approval.approvalSnapshot,
    payload: {
      backupId: backup._id.toString(),
      backupExternalId: backup.backupId,
      files,
      notes: params.notes || "",
      preRestoreBackupId: preRestoreBackupSafety.backup?.id || "",
      preRestoreBackupExternalId: preRestoreBackupSafety.backup?.backupId || ""
    }
  };

  logger.info("jobs", "Approval required for restore job", {
    type: jobInput.type,
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    backupId: backup._id.toString(),
    backupExternalId: backup.backupId,
    fileCount: files.length,
    pathSummary: summarizeRestorePaths(files),
    backupSafety,
    preRestoreBackupSafety
  });

  const job = await createJob(jobInput);

  logger.info("backups", "Restore job queued awaiting approval", {
    backupId: backup._id.toString(),
    backupExternalId: backup.backupId,
    preRestoreBackupId: preRestoreBackupSafety.backup?.id,
    preRestoreBackupExternalId: preRestoreBackupSafety.backup?.backupId,
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    jobId: job._id.toString(),
    fileCount: files.length,
    requiresApproval: true,
    approvalStatus: "pending"
  });

  return {
    job,
    backupId: backup._id.toString(),
    backupExternalId: backup.backupId,
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    files,
    pathSummary: summarizeRestorePaths(files),
    risks: approval.approvalSnapshot.risks,
    preRestoreBackupSafety,
    requiresApproval: true,
    approvalStatus: "pending",
    message: RESTORE_APPROVAL_MESSAGE
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
}) {
  logger.info("backups", "Verifying backup", {
    backupId: params.backupId,
    checkedBy: params.checkedBy,
    details: params.details
  });
  const backup = await SiteBackup.findById(params.backupId);
  if (!backup) throw new Error("backup-not-found");

  const site = await Site.findById(backup.siteId);
  if (!site) throw new Error("site-not-found");

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

  const storedEvidence = getStoredBackupEvidence(backup);
  const checkedAt = new Date();
  const verificationEvidence = [];

  if (!storedEvidence.length) {
    logger.warn("backups", "Backup verification evidence missing", { backupId: backup._id.toString() });
    backup.verification = {
      status: "failed",
      checkedAt,
      checkedBy: params.checkedBy,
      details: "Stored backup verification evidence is missing; read-only verification could not be performed.",
      evidence: []
    } as any;
    backup.status = "failed";
    backup.error = "backup-verification-evidence-missing";
    await backup.save();
    return backup;
  }

  logger.info("backups", "Running read-only SharePoint backup verification", {
    backupId: backup._id.toString(),
    backupExternalId: backup.backupId,
    evidenceCount: storedEvidence.length
  });

  for (const row of storedEvidence) {
    if (!row.targetPath || !row.expectedBackupSha256 || !row.expectedBackupSizeBytes) {
      verificationEvidence.push(failedVerificationEvidence(row, "backup-stored-evidence-incomplete"));
      continue;
    }

    const readEvidence = await readSharePointFileEvidence(resolvedPaths, row.targetPath, {
      sizeBytes: row.expectedBackupSizeBytes,
      sha256: row.expectedBackupSha256
    });

    verificationEvidence.push({
      sourcePath: row.sourcePath,
      targetPath: row.targetPath,
      status: readEvidence.status,
      checkedAt: new Date(readEvidence.checkedAt),
      sourceSizeBytes: row.sourceSizeBytes,
      sourceSha256: row.sourceSha256,
      expectedBackupSizeBytes: row.expectedBackupSizeBytes,
      expectedBackupSha256: row.expectedBackupSha256,
      backupSizeBytes: readEvidence.sizeBytes || 0,
      backupSha256: readEvidence.sha256 || "",
      sizeMatches: Boolean(readEvidence.sizeMatches),
      sha256Matches: Boolean(readEvidence.sha256Matches),
      httpStatus: readEvidence.httpStatus,
      httpStatusText: readEvidence.httpStatusText,
      contentType: readEvidence.contentType,
      etag: readEvidence.etag,
      lastModified: readEvidence.lastModified,
      error: readEvidence.error
    });
  }

  const verifiedCount = verificationEvidence.filter((item) => item.status === "verified").length;
  const failedCount = verificationEvidence.length - verifiedCount;
  const verificationStatus = failedCount === 0 ? "verified" : "failed";
  backup.verification = {
    status: verificationStatus,
    checkedAt,
    checkedBy: params.checkedBy,
    details: params.details || `Read-only SharePoint verification completed: ${verifiedCount}/${verificationEvidence.length} files verified.`,
    evidence: verificationEvidence
  } as any;

  backup.status = verificationStatus === "verified" ? "verified" : "failed";
  backup.error = verificationStatus === "verified" ? "" : "backup-verification-failed";
  await backup.save();

  logger.info("backups", "Backup verification completed", {
    backupId: backup._id.toString(),
    status: backup.status,
    verifiedCount,
    failedCount
  });
  return backup;
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
