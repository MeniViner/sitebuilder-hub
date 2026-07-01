import { z } from "zod";

export const adminIdentitySchema = z.object({
  displayName: z.string().optional(),
  personalNumber: z.string().optional(),
  email: z.string().optional(),
  loginName: z.string().optional(),
  source: z.enum(["txt", "siteCollection", "ownersGroup"]).optional().default("txt")
});

export const addAdminSchema = z.object({
  admin: adminIdentitySchema,
  reason: z.string().trim().max(4000).optional()
});

export const removeAdminSchema = z.object({
  source: z.enum(["txt", "siteCollection", "ownersGroup"]).optional(),
  reason: z.string().trim().max(4000).optional()
});

export const syncAdminsSchema = z.object({
  mode: z.enum(["read-only", "sync"]).optional().default("sync")
});

export const adminTxtRepairSchema = z.object({
  notes: z.string().trim().max(4000).optional(),
  reason: z.string().trim().max(4000).optional()
});

const browserTxtRepairEvidenceSchema = z.object({
  targetPath: z.string().min(1),
  backupPath: z.string().optional(),
  status: z.enum(["verified", "failed"]).optional(),
  checkedAt: z.string().optional(),
  expectedSizeBytes: z.number().optional(),
  actualSizeBytes: z.number().optional(),
  expectedSha256: z.string().optional(),
  actualSha256: z.string().optional(),
  sizeMatches: z.boolean().optional(),
  sha256Matches: z.boolean().optional(),
  httpStatus: z.number().optional(),
  httpStatusText: z.string().optional(),
  contentType: z.string().optional(),
  etag: z.string().optional(),
  lastModified: z.string().optional(),
  error: z.string().optional()
});

export const browserAdminTxtRepairEvidenceSchema = z.object({
  connectorMode: z.literal("browser-sharepoint"),
  jobId: z.string().optional(),
  targetSiteUrl: z.string().optional(),
  targetPath: z.string().min(1),
  mergedTxtAdmins: z.array(adminIdentitySchema).default([]),
  repairEvidence: browserTxtRepairEvidenceSchema.optional(),
  errors: z.array(z.union([z.string(), z.object({ error: z.string(), status: z.number().optional() })])).optional(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  finalStatus: z.enum(["success", "failed"]),
  reason: z.string().trim().max(4000).optional()
});

const adminSourceNameSchema = z.enum(["txt", "siteCollection", "ownersGroup"]);

const browserAdminSourceStatusSchema = z.object({
  source: adminSourceNameSchema,
  status: z.enum(["success", "failed", "skipped"]).optional(),
  ok: z.boolean().optional(),
  count: z.number().int().nonnegative().optional(),
  rawCount: z.number().int().nonnegative().optional(),
  normalizedCount: z.number().int().nonnegative().optional(),
  httpStatus: z.number().int().positive().optional(),
  httpStatusText: z.string().max(400).optional(),
  sourceUrl: z.string().max(3000).optional(),
  readAt: z.string().datetime().optional(),
  errorCode: z.string().max(200).optional(),
  errorMessage: z.string().max(4000).optional(),
  error: z.string().max(4000).optional(),
  warnings: z.array(z.string().max(1000)).optional()
});

export const browserAdminLiveReadEvidenceSchema = z.object({
  connectorMode: z.literal("browser-sharepoint"),
  targetSiteUrl: z.string().trim().min(1).max(3000).optional(),
  generatedAt: z.string().datetime().optional(),
  readAt: z.string().datetime().optional(),
  capturedAt: z.string().datetime().optional(),
  txtAdmins: z.array(adminIdentitySchema).optional().default([]),
  siteCollectionAdmins: z.array(adminIdentitySchema).optional().default([]),
  ownersGroupAdmins: z.array(adminIdentitySchema).optional().default([]),
  uniqueAdmins: z.array(adminIdentitySchema).optional(),
  adminsCount: z.number().int().nonnegative().optional(),
  rawCounts: z.record(z.number().int().nonnegative()).optional(),
  normalizedCounts: z.record(z.number().int().nonnegative()).optional(),
  adminDifferences: z.object({
    missingInTxt: z.array(z.string()).optional().default([]),
    missingInSiteCollection: z.array(z.string()).optional().default([]),
    missingInOwnersGroup: z.array(z.string()).optional().default([])
  }).optional(),
  sourceStatus: z.array(browserAdminSourceStatusSchema).min(1),
  warnings: z.array(z.string().max(1000)).optional().default([]),
  evidence: z.record(z.unknown()).optional().default({})
});
