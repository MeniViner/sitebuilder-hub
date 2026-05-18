import { Types } from "mongoose";
import { SiteBackup } from "../models/SiteBackup";
import { logger } from "../utils/logger";

const RECENT_VERIFIED_BACKUP_MAX_AGE_HOURS = 24;
const RECENT_VERIFIED_BACKUP_MAX_AGE_MS = RECENT_VERIFIED_BACKUP_MAX_AGE_HOURS * 60 * 60 * 1000;

export type DangerousWriteOperation = "deploy" | "rollback" | "restore";

export type BackupSafetySnapshot = {
  policy: "recent-verified-backup" | "pre-restore-current-state-backup";
  operation: DangerousWriteOperation;
  required: true;
  satisfied: boolean;
  maxAgeHours: number;
  checkedAt: string;
  backup?: {
    id: string;
    backupId: string;
    status: string;
    verificationStatus: string;
    storagePath: string;
    filesCount: number;
    sizeBytes: number;
    createdAt: string;
    verificationCheckedAt: string;
    ageHours: number;
  };
  restoreBackup?: {
    id: string;
    backupId: string;
  };
  reason?: string;
};

const backupTimestamp = (backup: any) => {
  const checkedAt = backup?.verification?.checkedAt ? new Date(backup.verification.checkedAt) : null;
  if (checkedAt && !Number.isNaN(checkedAt.getTime())) return checkedAt;

  const createdAt = backup?.createdAt ? new Date(backup.createdAt) : null;
  if (createdAt && !Number.isNaN(createdAt.getTime())) return createdAt;

  return null;
};

const backupAgeHours = (backup: any, now: Date) => {
  const timestamp = backupTimestamp(backup);
  if (!timestamp) return Number.POSITIVE_INFINITY;
  return Math.max(0, (now.getTime() - timestamp.getTime()) / (60 * 60 * 1000));
};

const backupSnapshot = (
  backup: any,
  operation: DangerousWriteOperation,
  now: Date,
  satisfied: boolean,
  reason?: string,
  options: {
    policy?: BackupSafetySnapshot["policy"];
    restoreBackup?: BackupSafetySnapshot["restoreBackup"];
  } = {}
): BackupSafetySnapshot => {
  const timestamp = backupTimestamp(backup);

  return {
    policy: options.policy || "recent-verified-backup",
    operation,
    required: true,
    satisfied,
    maxAgeHours: RECENT_VERIFIED_BACKUP_MAX_AGE_HOURS,
    checkedAt: now.toISOString(),
    backup: backup
      ? {
          id: backup._id.toString(),
          backupId: String(backup.backupId || ""),
          status: String(backup.status || ""),
          verificationStatus: String(backup.verification?.status || "unverified"),
          storagePath: String(backup.storagePath || ""),
          filesCount: Number(backup.filesCount || 0),
          sizeBytes: Number(backup.sizeBytes || 0),
          createdAt: backup.createdAt ? new Date(backup.createdAt).toISOString() : "",
          verificationCheckedAt: backup.verification?.checkedAt
            ? new Date(backup.verification.checkedAt).toISOString()
            : "",
          ageHours: Number(backupAgeHours(backup, now).toFixed(2))
        }
      : undefined,
    restoreBackup: options.restoreBackup,
    reason: satisfied ? undefined : reason || "recent-verified-backup-required"
  };
};

const toObjectIdQueryValue = (value: string | Types.ObjectId | undefined) => {
  if (!value) return undefined;
  if (value instanceof Types.ObjectId) return value;
  const text = String(value || "").trim();
  return Types.ObjectId.isValid(text) ? new Types.ObjectId(text) : text;
};

export async function assertRecentVerifiedBackupForDangerousWrite(params: {
  siteId: string | Types.ObjectId;
  operation: DangerousWriteOperation;
  now?: Date;
}) {
  const now = params.now || new Date();
  const siteObjectId = params.siteId instanceof Types.ObjectId ? params.siteId : new Types.ObjectId(params.siteId);

  logger.info("backups", "Checking recent verified backup safety policy", {
    siteId: siteObjectId.toString(),
    operation: params.operation,
    maxAgeHours: RECENT_VERIFIED_BACKUP_MAX_AGE_HOURS
  });

  const backup = await SiteBackup.findOne({
    siteId: siteObjectId,
    status: { $in: ["verified", "succeeded"] },
    "verification.status": "verified"
  }).sort({ "verification.checkedAt": -1, createdAt: -1 });

  if (!backup) {
    logger.warn("backups", "Dangerous write blocked because no verified backup exists", {
      siteId: siteObjectId.toString(),
      operation: params.operation
    });
    throw new Error(`dangerous-write-backup-required:${params.operation}`);
  }

  const ageMs = backupTimestamp(backup) ? now.getTime() - backupTimestamp(backup)!.getTime() : Number.POSITIVE_INFINITY;
  if (ageMs > RECENT_VERIFIED_BACKUP_MAX_AGE_MS) {
    logger.warn("backups", "Dangerous write blocked because verified backup is stale", {
      siteId: siteObjectId.toString(),
      operation: params.operation,
      backupId: backup._id.toString(),
      backupExternalId: backup.backupId,
      ageHours: backupAgeHours(backup, now),
      maxAgeHours: RECENT_VERIFIED_BACKUP_MAX_AGE_HOURS
    });
    throw new Error(`dangerous-write-backup-stale:${params.operation}`);
  }

  const snapshot = backupSnapshot(backup, params.operation, now, true);
  logger.info("backups", "Recent verified backup safety policy satisfied", {
    siteId: siteObjectId.toString(),
    operation: params.operation,
    backupId: snapshot.backup?.id,
    backupExternalId: snapshot.backup?.backupId,
    ageHours: snapshot.backup?.ageHours
  });
  return snapshot;
}

export async function assertDistinctRecentVerifiedBackupForRestore(params: {
  siteId: string | Types.ObjectId;
  restoreBackupObjectId: string | Types.ObjectId;
  restoreBackupExternalId?: string;
  now?: Date;
}) {
  const now = params.now || new Date();
  const siteObjectId = params.siteId instanceof Types.ObjectId ? params.siteId : new Types.ObjectId(params.siteId);
  const excludedBackupObjectId = toObjectIdQueryValue(params.restoreBackupObjectId);
  const restoreBackupExternalId = String(params.restoreBackupExternalId || "").trim();
  const query: Record<string, unknown> = {
    siteId: siteObjectId,
    status: { $in: ["verified", "succeeded"] },
    "verification.status": "verified"
  };

  if (excludedBackupObjectId) {
    query._id = { $ne: excludedBackupObjectId };
  }
  if (restoreBackupExternalId) {
    query.backupId = { $ne: restoreBackupExternalId };
  }

  logger.info("backups", "Checking distinct pre-restore current-state backup safety policy", {
    siteId: siteObjectId.toString(),
    restoreBackupObjectId: String(params.restoreBackupObjectId || ""),
    restoreBackupExternalId,
    maxAgeHours: RECENT_VERIFIED_BACKUP_MAX_AGE_HOURS
  });

  const backup = await SiteBackup.findOne(query).sort({ "verification.checkedAt": -1, createdAt: -1 });
  const restoreBackup = {
    id: String(params.restoreBackupObjectId || ""),
    backupId: restoreBackupExternalId
  };

  if (!backup) {
    logger.warn("backups", "Restore blocked because no distinct current-state verified backup exists", {
      siteId: siteObjectId.toString(),
      restoreBackupObjectId: String(params.restoreBackupObjectId || ""),
      restoreBackupExternalId
    });
    throw new Error("pre-restore-backup-required");
  }

  const timestamp = backupTimestamp(backup);
  const ageMs = timestamp ? now.getTime() - timestamp.getTime() : Number.POSITIVE_INFINITY;
  if (ageMs > RECENT_VERIFIED_BACKUP_MAX_AGE_MS) {
    logger.warn("backups", "Restore blocked because distinct current-state verified backup is stale", {
      siteId: siteObjectId.toString(),
      restoreBackupObjectId: String(params.restoreBackupObjectId || ""),
      restoreBackupExternalId,
      backupId: backup._id.toString(),
      backupExternalId: backup.backupId,
      ageHours: backupAgeHours(backup, now),
      maxAgeHours: RECENT_VERIFIED_BACKUP_MAX_AGE_HOURS
    });
    throw new Error("pre-restore-backup-stale");
  }

  const snapshot = backupSnapshot(backup, "restore", now, true, undefined, {
    policy: "pre-restore-current-state-backup",
    restoreBackup
  });
  logger.info("backups", "Distinct pre-restore current-state backup safety policy satisfied", {
    siteId: siteObjectId.toString(),
    restoreBackupObjectId: String(params.restoreBackupObjectId || ""),
    restoreBackupExternalId,
    backupId: snapshot.backup?.id,
    backupExternalId: snapshot.backup?.backupId,
    ageHours: snapshot.backup?.ageHours
  });
  return snapshot;
}
