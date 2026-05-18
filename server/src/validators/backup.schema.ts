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

export const restorePlanSchema = z.object({
  notes: z.string().optional()
});

export const queueRestoreSchema = z.object({
  notes: z.string().trim().max(4000).optional()
});
