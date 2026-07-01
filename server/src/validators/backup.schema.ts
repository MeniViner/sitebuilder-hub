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

export const queueRestoreSchema = z.object({
  notes: z.string().trim().max(4000).optional(),
  connectorMode: z.literal("browser-sharepoint").optional()
});
