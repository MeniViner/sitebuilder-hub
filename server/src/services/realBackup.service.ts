import crypto from "crypto";
import { Types } from "mongoose";
import { Site } from "../models/Site";
import { SiteBackup } from "../models/SiteBackup";
import { resolveSiteBuilderPaths } from "../utils/sitebuilderPaths";
import { logger } from "../utils/logger";
import { getCanonicalBackupSourcePaths } from "./backupPlan.service";
import {
  ensureSharePointFolderHierarchy,
  getRequestDigest,
  readSharePointFileBytes,
  readSharePointFileEvidence,
  uploadSharePointFile
} from "./sharepointOperationClient";

export type ExecuteSharePointBackupInput = {
  siteId: string;
  jobId: string;
  createdBy: string;
  sourcePaths?: string[];
};

export type ExecuteSharePointRestoreInput = {
  backupId: string;
  jobId: string;
  requestedBy: string;
  siteId?: string;
};

const fileNameFromPath = (path: string) => path.split("/").filter(Boolean).pop() || "unknown.txt";

type BackupSourceStatus = {
  path: string;
  exists: boolean;
  targetPath: string;
  status: "pending" | "verified" | "failed";
  sourceSizeBytes: number;
  sourceSha256: string;
  backupSizeBytes: number;
  backupSha256: string;
  error?: string;
};

type BackupEvidence = {
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

type StoredRestoreEvidence = {
  sourcePath: string;
  backupPath: string;
  expectedBackupSizeBytes?: number;
  expectedBackupSha256: string;
  storedStatus: string;
};

type RestoreEvidence = {
  sourcePath: string;
  targetPath: string;
  backupPath: string;
  status: "verified" | "failed";
  checkedAt: Date;
  expectedBackupSizeBytes: number;
  expectedBackupSha256: string;
  backupSizeBytes: number;
  backupSha256: string;
  expectedRestoreSizeBytes: number;
  expectedRestoreSha256: string;
  restoredSizeBytes: number;
  restoredSha256: string;
  sizeMatches: boolean;
  sha256Matches: boolean;
  httpStatus?: number;
  httpStatusText?: string;
  contentType?: string;
  etag?: string;
  lastModified?: string;
  error?: string;
};

const contentTypeForBackupPath = (serverRelativePath: string) => {
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

const aggregateEvidenceHash = (evidence: BackupEvidence[], field: "sourceSha256" | "backupSha256") => {
  const complete = evidence.filter((item) => item[field]);
  if (!complete.length) return "";

  const manifest = complete
    .map((item) => `${item.sourcePath}\0${item.targetPath}\0${item[field]}`)
    .sort()
    .join("\n");

  return crypto.createHash("sha256").update(manifest).digest("hex");
};

const backupEvidenceFromRead = (
  sourcePath: string,
  targetPath: string,
  sourceSizeBytes: number,
  sourceSha256: string,
  evidence: Awaited<ReturnType<typeof readSharePointFileEvidence>>
): BackupEvidence => ({
  sourcePath,
  targetPath,
  status: evidence.status,
  checkedAt: new Date(evidence.checkedAt),
  sourceSizeBytes,
  sourceSha256,
  expectedBackupSizeBytes: sourceSizeBytes,
  expectedBackupSha256: sourceSha256,
  backupSizeBytes: evidence.sizeBytes || 0,
  backupSha256: evidence.sha256 || "",
  sizeMatches: Boolean(evidence.sizeMatches),
  sha256Matches: Boolean(evidence.sha256Matches),
  httpStatus: evidence.httpStatus,
  httpStatusText: evidence.httpStatusText,
  contentType: evidence.contentType,
  etag: evidence.etag,
  lastModified: evidence.lastModified,
  error: evidence.error
});

const failedBackupEvidence = (
  sourcePath: string,
  targetPath: string,
  error: unknown,
  sourceSizeBytes = 0,
  sourceSha256 = ""
): BackupEvidence => ({
  sourcePath,
  targetPath,
  status: "failed",
  checkedAt: new Date(),
  sourceSizeBytes,
  sourceSha256,
  expectedBackupSizeBytes: sourceSizeBytes,
  expectedBackupSha256: sourceSha256,
  backupSizeBytes: 0,
  backupSha256: "",
  sizeMatches: false,
  sha256Matches: false,
  error: error instanceof Error ? error.message : String(error)
});

const stringOrEmpty = (value: unknown) => String(value || "").trim();

const numberOrUndefined = (value: unknown) => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const getStoredRestoreEvidence = (backup: any): StoredRestoreEvidence[] => {
  const verificationEvidence = Array.isArray(backup.verification?.evidence)
    ? backup.verification.evidence
    : [];
  const sourcePathEvidence = Array.isArray(backup.sourcePaths) ? backup.sourcePaths : [];
  const rows = verificationEvidence.length ? verificationEvidence : sourcePathEvidence;

  return rows.map((row: any) => ({
    sourcePath: stringOrEmpty(row.sourcePath || row.path),
    backupPath: stringOrEmpty(row.targetPath || row.backupPath),
    expectedBackupSizeBytes: numberOrUndefined(row.expectedBackupSizeBytes ?? row.backupSizeBytes ?? row.sourceSizeBytes),
    expectedBackupSha256: stringOrEmpty(row.expectedBackupSha256 || row.backupSha256 || row.sourceSha256),
    storedStatus: stringOrEmpty(row.status)
  }));
};

const restoreEvidenceValidationError = (row: StoredRestoreEvidence) => {
  if (!row.sourcePath) return "backup-stored-evidence-missing-source-path";
  if (!row.backupPath) return "backup-stored-evidence-missing-backup-path";
  if (row.expectedBackupSizeBytes === undefined) return "backup-stored-evidence-missing-backup-size";
  if (!row.expectedBackupSha256) return "backup-stored-evidence-missing-backup-sha256";
  if (row.storedStatus && row.storedStatus !== "verified") return "backup-stored-evidence-not-verified";
  return "";
};

const failedRestoreEvidence = (row: StoredRestoreEvidence, error: unknown): RestoreEvidence => ({
  sourcePath: row.sourcePath,
  targetPath: row.sourcePath,
  backupPath: row.backupPath,
  status: "failed",
  checkedAt: new Date(),
  expectedBackupSizeBytes: row.expectedBackupSizeBytes ?? 0,
  expectedBackupSha256: row.expectedBackupSha256,
  backupSizeBytes: 0,
  backupSha256: "",
  expectedRestoreSizeBytes: row.expectedBackupSizeBytes ?? 0,
  expectedRestoreSha256: row.expectedBackupSha256,
  restoredSizeBytes: 0,
  restoredSha256: "",
  sizeMatches: false,
  sha256Matches: false,
  error: error instanceof Error ? error.message : String(error)
});

const restoreEvidenceFromRead = (
  row: StoredRestoreEvidence,
  backupFile: Awaited<ReturnType<typeof readSharePointFileBytes>>,
  evidence: Awaited<ReturnType<typeof readSharePointFileEvidence>>
): RestoreEvidence => ({
  sourcePath: row.sourcePath,
  targetPath: row.sourcePath,
  backupPath: row.backupPath,
  status: evidence.status,
  checkedAt: new Date(evidence.checkedAt),
  expectedBackupSizeBytes: row.expectedBackupSizeBytes ?? 0,
  expectedBackupSha256: row.expectedBackupSha256,
  backupSizeBytes: backupFile.sizeBytes,
  backupSha256: backupFile.sha256,
  expectedRestoreSizeBytes: backupFile.sizeBytes,
  expectedRestoreSha256: backupFile.sha256,
  restoredSizeBytes: evidence.sizeBytes || 0,
  restoredSha256: evidence.sha256 || "",
  sizeMatches: Boolean(evidence.sizeMatches),
  sha256Matches: Boolean(evidence.sha256Matches),
  httpStatus: evidence.httpStatus,
  httpStatusText: evidence.httpStatusText,
  contentType: evidence.contentType,
  etag: evidence.etag,
  lastModified: evidence.lastModified,
  error: evidence.error
});

export async function executeSharePointBackup(input: ExecuteSharePointBackupInput) {
  logger.info("backups", "Executing SharePoint backup", {
    siteId: input.siteId,
    jobId: input.jobId,
    createdBy: input.createdBy
  });
  const site = await Site.findById(input.siteId);
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

  const backupId = `backup-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const backupFolder = `${resolvedPaths.backupsRoot}/${backupId}`;
  const sourcePaths = input.sourcePaths?.length ? input.sourcePaths : getCanonicalBackupSourcePaths(resolvedPaths);

  const backup = await SiteBackup.create({
    siteId: site._id,
    jobId: input.jobId,
    backupId,
    status: "running",
    storageProvider: "sharepoint",
    storagePath: backupFolder,
    createdBy: input.createdBy,
    sourcePaths: sourcePaths.map((path) => ({ path, exists: false, status: "pending" })),
    verification: { status: "unverified" }
  });

  const sourceStatus: BackupSourceStatus[] = [];
  const verificationEvidence: BackupEvidence[] = [];

  try {
    const digest = await getRequestDigest(resolvedPaths);
    await ensureSharePointFolderHierarchy(resolvedPaths, backupFolder, digest);

    let sizeBytes = 0;
    let filesCount = 0;

    for (const sourcePath of sourcePaths) {
      const targetPath = `${backupFolder}/${fileNameFromPath(sourcePath)}`;
      let sourceSizeBytes = 0;
      let sourceSha256 = "";

      try {
        const file = await readSharePointFileBytes(resolvedPaths, sourcePath);
        sourceSizeBytes = file.sizeBytes;
        sourceSha256 = file.sha256;

        await uploadSharePointFile(resolvedPaths, targetPath, file.bytes, contentTypeForBackupPath(sourcePath), digest);
        const targetEvidence = await readSharePointFileEvidence(resolvedPaths, targetPath, {
          sizeBytes: file.sizeBytes,
          sha256: file.sha256
        });
        const evidence = backupEvidenceFromRead(sourcePath, targetPath, file.sizeBytes, file.sha256, targetEvidence);
        verificationEvidence.push(evidence);

        sourceStatus.push({
          path: sourcePath,
          exists: true,
          targetPath,
          status: evidence.status,
          sourceSizeBytes: file.sizeBytes,
          sourceSha256: file.sha256,
          backupSizeBytes: evidence.backupSizeBytes,
          backupSha256: evidence.backupSha256,
          error: evidence.error
        });

        if (evidence.status !== "verified") {
          throw new Error(`backup-target-verification-failed:${sourcePath}`);
        }

        sizeBytes += file.sizeBytes;
        filesCount += 1;

        logger.info("backups", "Backup source copied and verified", {
          backupId: backup.backupId,
          sourcePath,
          targetPath,
          sourceSizeBytes: file.sizeBytes,
          status: evidence.status
        });
      } catch (error) {
        const failedEvidence = failedBackupEvidence(sourcePath, targetPath, error, sourceSizeBytes, sourceSha256);
        if (!verificationEvidence.some((item) => item.sourcePath === sourcePath)) {
          verificationEvidence.push(failedEvidence);
        }
        if (!sourceStatus.some((item) => item.path === sourcePath)) {
          sourceStatus.push({
            path: sourcePath,
            exists: Boolean(sourceSha256),
            targetPath,
            status: "failed",
            sourceSizeBytes,
            sourceSha256,
            backupSizeBytes: 0,
            backupSha256: "",
            error: error instanceof Error ? error.message : String(error)
          });
        }
        throw error;
      }
    }

    backup.status = "succeeded";
    backup.sizeBytes = sizeBytes;
    backup.filesCount = filesCount;
    backup.sourceSha256 = aggregateEvidenceHash(verificationEvidence, "sourceSha256");
    backup.backupSha256 = aggregateEvidenceHash(verificationEvidence, "backupSha256");
    backup.sourcePaths = sourceStatus as any;
    backup.verification = {
      status: "verified",
      checkedAt: new Date(),
      checkedBy: input.createdBy,
      details: `Backup execution read back and verified ${filesCount} files from SharePoint.`,
      evidence: verificationEvidence
    } as any;
    await backup.save();

    site.backupStatus = "succeeded";
    site.lastBackupAt = new Date();
    site.lastBackupId = backup.backupId;
    site.backupCount = (site.backupCount || 0) + 1;
    site.backupStorageMb = (site.backupStorageMb || 0) + Math.round(sizeBytes / (1024 * 1024));
    site.lastError = "";
    await site.save();

    logger.info("backups", "SharePoint backup succeeded with read-back verification", {
      backupId: backup.backupId,
      siteId: site._id.toString(),
      filesCount,
      sizeBytes,
      backupSha256: backup.backupSha256
    });

    return backup;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("errors", "SharePoint backup failed", {
      backupId: backup.backupId,
      siteId: site._id.toString(),
      error: message
    });
    backup.status = "failed";
    backup.error = message;
    if (sourceStatus.length) backup.sourcePaths = sourceStatus as any;
    backup.verification = {
      status: "failed",
      checkedAt: new Date(),
      checkedBy: input.createdBy,
      details: message,
      evidence: verificationEvidence
    } as any;
    await backup.save();

    site.backupStatus = "failed";
    site.lastError = message;
    await site.save();

    throw error;
  }
}

const findBackupForRestore = async (backupId: string) => {
  if (Types.ObjectId.isValid(backupId)) {
    const byId = await SiteBackup.findById(backupId);
    if (byId) return byId;
  }
  return SiteBackup.findOne({ backupId });
};

export async function executeSharePointRestore(input: ExecuteSharePointRestoreInput) {
  logger.info("backups", "Executing SharePoint restore", {
    backupId: input.backupId,
    jobId: input.jobId,
    requestedBy: input.requestedBy,
    siteId: input.siteId
  });

  const backup = await findBackupForRestore(input.backupId);
  if (!backup) throw new Error("backup-not-found");

  const site = await Site.findById(backup.siteId);
  if (!site) throw new Error("site-not-found");
  if (input.siteId && site._id.toString() !== input.siteId) {
    throw new Error("restore-backup-site-mismatch");
  }
  if (String(backup.storageProvider || "sharepoint") !== "sharepoint") {
    throw new Error(`restore-unsupported-storage-provider:${backup.storageProvider}`);
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

  const storedEvidence = getStoredRestoreEvidence(backup);
  const validationFailures = storedEvidence
    .map((row) => ({ row, error: restoreEvidenceValidationError(row) }))
    .filter((item) => item.error);
  const restoreEvidence: RestoreEvidence[] = validationFailures.map((item) =>
    failedRestoreEvidence(item.row, item.error)
  );
  const now = new Date();
  const jobObjectId = Types.ObjectId.isValid(input.jobId) ? new Types.ObjectId(input.jobId) : undefined;

  if (!storedEvidence.length || validationFailures.length > 0) {
    const message = !storedEvidence.length
      ? "backup-restore-evidence-missing"
      : "backup-restore-evidence-incomplete";

    backup.restoreStatus = "failed";
    backup.lastRestoreAt = now;
    backup.lastRestoreJobId = jobObjectId as any;
    backup.restoreEvidence = restoreEvidence as any;
    backup.lastRestoreError = message;
    await backup.save();

    logger.error("errors", "SharePoint restore preflight failed", {
      backupId: backup._id.toString(),
      backupExternalId: backup.backupId,
      siteId: site._id.toString(),
      evidenceCount: storedEvidence.length,
      validationFailures: validationFailures.map((item) => ({
        sourcePath: item.row.sourcePath,
        backupPath: item.row.backupPath,
        error: item.error
      }))
    });
    const error = new Error(message);
    (error as Error & { restoreEvidence?: RestoreEvidence[] }).restoreEvidence = restoreEvidence;
    throw error;
  }

  backup.restoreStatus = "running";
  backup.lastRestoreJobId = jobObjectId as any;
  backup.restoreEvidence = [] as any;
  backup.lastRestoreError = "";
  await backup.save();

  try {
    const digest = await getRequestDigest(resolvedPaths);
    let restoredCount = 0;
    let totalSizeBytes = 0;

    for (const row of storedEvidence) {
      try {
        const backupFile = await readSharePointFileBytes(resolvedPaths, row.backupPath);
        const expectedSha256 = row.expectedBackupSha256.toLowerCase();
        const backupFileMatches =
          backupFile.sizeBytes === row.expectedBackupSizeBytes &&
          backupFile.sha256.toLowerCase() === expectedSha256;

        if (!backupFileMatches) {
          throw new Error(`restore-backup-file-verification-failed:${row.backupPath}`);
        }

        await uploadSharePointFile(
          resolvedPaths,
          row.sourcePath,
          backupFile.bytes,
          contentTypeForBackupPath(row.sourcePath),
          digest
        );
        const restoredReadBack = await readSharePointFileEvidence(resolvedPaths, row.sourcePath, {
          sizeBytes: backupFile.sizeBytes,
          sha256: backupFile.sha256
        });
        const evidence = restoreEvidenceFromRead(row, backupFile, restoredReadBack);
        restoreEvidence.push(evidence);

        if (evidence.status !== "verified") {
          throw new Error(`restore-target-verification-failed:${row.sourcePath}`);
        }

        restoredCount += 1;
        totalSizeBytes += backupFile.sizeBytes;

        logger.info("backups", "Backup file restored and verified", {
          backupId: backup.backupId,
          sourcePath: row.backupPath,
          targetPath: row.sourcePath,
          sizeBytes: backupFile.sizeBytes,
          status: evidence.status
        });
      } catch (error) {
        if (!restoreEvidence.some((item) => item.sourcePath === row.sourcePath)) {
          restoreEvidence.push(failedRestoreEvidence(row, error));
        }
        throw error;
      }
    }

    backup.restoreStatus = "succeeded";
    backup.lastRestoreAt = new Date();
    backup.lastRestoreJobId = jobObjectId as any;
    backup.restoreEvidence = restoreEvidence as any;
    backup.lastRestoreError = "";
    await backup.save();

    site.lastError = "";
    await site.save();

    logger.info("backups", "SharePoint restore succeeded with read-back verification", {
      backupId: backup._id.toString(),
      backupExternalId: backup.backupId,
      siteId: site._id.toString(),
      restoredCount,
      totalSizeBytes
    });

    return {
      backupId: backup._id.toString(),
      backupExternalId: backup.backupId,
      siteId: site._id.toString(),
      siteCode: site.siteCode,
      restoredCount,
      filesCount: restoreEvidence.length,
      totalSizeBytes,
      evidence: restoreEvidence
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("errors", "SharePoint restore failed", {
      backupId: backup._id.toString(),
      backupExternalId: backup.backupId,
      siteId: site._id.toString(),
      jobId: input.jobId,
      error: message
    });

    backup.restoreStatus = "failed";
    backup.lastRestoreAt = new Date();
    backup.lastRestoreJobId = jobObjectId as any;
    backup.restoreEvidence = restoreEvidence as any;
    backup.lastRestoreError = message;
    await backup.save();

    site.lastError = message;
    await site.save();

    (error as Error & { restoreEvidence?: RestoreEvidence[] }).restoreEvidence = restoreEvidence;
    throw error;
  }
}
