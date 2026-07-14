import { z } from "zod";

export const runSiteBackupSchema = z.object({
  sourcePaths: z.array(z.string()).optional()
});

export const runAllBackupsSchema = z.object({
  siteIds: z.array(z.string()).optional()
});

export const verifyBackupSchema = z.object({
  details: z.string().optional()
});

const backupEvidenceSchema = z.object({
  sourcePath: z.string().optional(),
  targetPath: z.string().optional(),
  status: z.enum(["verified", "failed"]).optional(),
  checkedAt: z.string().optional(),
  sourceSizeBytes: z.number().optional(),
  sourceSha256: z.string().optional(),
  expectedBackupSizeBytes: z.number().optional(),
  expectedBackupSha256: z.string().optional(),
  backupSizeBytes: z.number().optional(),
  backupSha256: z.string().optional(),
  sizeMatches: z.boolean().optional(),
  sha256Matches: z.boolean().optional(),
  httpStatus: z.number().optional(),
  httpStatusText: z.string().optional(),
  contentType: z.string().optional(),
  etag: z.string().optional(),
  lastModified: z.string().optional(),
  error: z.string().optional()
});

const restoreEvidenceSchema = z.object({
  sourcePath: z.string().optional(),
  targetPath: z.string().optional(),
  backupPath: z.string().optional(),
  status: z.enum(["verified", "failed"]).optional(),
  checkedAt: z.string().optional(),
  expectedBackupSizeBytes: z.number().optional(),
  expectedBackupSha256: z.string().optional(),
  backupSizeBytes: z.number().optional(),
  backupSha256: z.string().optional(),
  expectedRestoreSizeBytes: z.number().optional(),
  expectedRestoreSha256: z.string().optional(),
  restoredSizeBytes: z.number().optional(),
  restoredSha256: z.string().optional(),
  sizeMatches: z.boolean().optional(),
  sha256Matches: z.boolean().optional(),
  httpStatus: z.number().optional(),
  httpStatusText: z.string().optional(),
  contentType: z.string().optional(),
  etag: z.string().optional(),
  lastModified: z.string().optional(),
  error: z.string().optional()
});

const backupSourceEvidenceSchema = z.object({
  path: z.string(),
  exists: z.boolean().optional(),
  targetPath: z.string().optional(),
  status: z.enum(["pending", "verified", "failed"]).optional(),
  sourceSizeBytes: z.number().optional(),
  sourceSha256: z.string().optional(),
  backupSizeBytes: z.number().optional(),
  backupSha256: z.string().optional(),
  error: z.string().optional()
});

export const browserBackupEvidenceSchema = z.object({
  connectorMode: z.literal("browser-sharepoint"),
  jobId: z.string().optional(),
  targetSiteUrl: z.string().optional(),
  backupId: z.string().min(1),
  target: z.object({
    backupsRoot: z.string().optional(),
    backupFolder: z.string().min(1)
  }),
  sourcePaths: z.array(backupSourceEvidenceSchema).optional(),
  verificationEvidence: z.array(backupEvidenceSchema).optional(),
  errors: z.array(z.union([
    z.string(),
    z.object({
      sourcePath: z.string().optional(),
      targetPath: z.string().optional(),
      error: z.string(),
      status: z.number().optional()
    })
  ])).optional(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  finalStatus: z.enum(["success", "failed"])
});

export const browserBackupVerificationEvidenceSchema = z.object({
  connectorMode: z.literal("browser-sharepoint"),
  targetSiteUrl: z.string().optional(),
  verificationEvidence: z.array(backupEvidenceSchema),
  checkedAt: z.string().optional(),
  finalStatus: z.enum(["success", "failed"])
});

const backupInventoryFileSchema = z.object({
  name: z.string().optional(),
  serverRelativeUrl: z.string().optional(),
  url: z.string().optional(),
  sizeBytes: z.number().optional(),
  timeCreated: z.string().optional(),
  timeLastModified: z.string().optional(),
  uniqueId: z.string().optional(),
  etag: z.string().optional(),
  contentType: z.string().optional()
});

const backupInventoryFolderSchema = z.object({
  name: z.string().optional(),
  serverRelativeUrl: z.string(),
  url: z.string().optional(),
  itemCount: z.number().optional(),
  timeCreated: z.string().optional(),
  timeLastModified: z.string().optional(),
  uniqueId: z.string().optional(),
  files: z.array(backupInventoryFileSchema).optional(),
  filesStatus: z.object({
    exists: z.boolean(),
    status: z.number().optional(),
    statusText: z.string().optional(),
    authBlocked: z.boolean().optional(),
    error: z.string().optional()
  }).optional(),
  filesCount: z.number().optional(),
  knownSizeBytes: z.number().optional()
});

export const browserBackupInventoryEvidenceSchema = z.object({
  connectorMode: z.literal("browser-sharepoint"),
  targetSiteUrl: z.string().optional(),
  generatedAt: z.string().optional(),
  siteId: z.string().optional(),
  siteCode: z.string().optional(),
  includeFiles: z.boolean().optional(),
  resolvedPaths: z.record(z.unknown()).optional(),
  root: z.object({
    serverRelativePath: z.string(),
    url: z.string().optional(),
    apiUrl: z.string().optional(),
    checkedAt: z.string().optional(),
    exists: z.boolean(),
    status: z.number().optional(),
    statusText: z.string().optional(),
    authBlocked: z.boolean().optional(),
    error: z.string().optional()
  }),
  folders: z.array(backupInventoryFolderSchema).optional(),
  summary: z.object({
    rootExists: z.boolean(),
    foldersCount: z.number().optional(),
    filesCount: z.number().optional(),
    knownSizeBytes: z.number().optional(),
    authBlocked: z.boolean().optional(),
    readOk: z.boolean()
  }),
  notes: z.array(z.string()).optional()
});

export const browserRestoreEvidenceSchema = z.object({
  connectorMode: z.literal("browser-sharepoint"),
  jobId: z.string().optional(),
  targetSiteUrl: z.string().optional(),
  restoreEvidence: z.array(restoreEvidenceSchema),
  errors: z.array(z.union([
    z.string(),
    z.object({
      sourcePath: z.string().optional(),
      targetPath: z.string().optional(),
      backupPath: z.string().optional(),
      error: z.string(),
      status: z.number().optional()
    })
  ])).optional(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  finalStatus: z.enum(["success", "failed"])
});

export const restorePlanSchema = z.object({
  notes: z.string().optional()
});

export const restoreReviewSchema = z.object({
  reason: z.string().trim().max(4000).optional()
});

export const queueRestoreSchema = z.object({
  notes: z.string().trim().min(3).max(4000),
  connectorMode: z.literal("browser-sharepoint").optional()
});

export const backupScheduleSchema = z.object({
  enabled: z.boolean(),
  paused: z.boolean().optional(),
  frequency: z.enum(["daily", "weekly", "monthly", "custom"]),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  timeOfDay: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timezone: z.string().trim().min(1).max(100),
  intervalMinutes: z.number().int().min(5).max(60 * 24 * 366).optional(),
  retention: z.object({
    mode: z.enum(["none", "count", "days", "count-and-days"]),
    keepLast: z.number().int().min(1).max(1000).optional(),
    deleteOlderThanDays: z.number().int().min(1).max(3650).optional()
  }).optional()
});
