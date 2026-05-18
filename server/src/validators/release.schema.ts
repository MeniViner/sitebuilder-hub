import { z } from "zod";

export const createReleaseSchema = z.object({
  version: z.string().trim().optional(),
  releaseType: z.enum(["patch", "minor", "major", "hotfix"]).default("patch"),
  notes: z.string().optional(),
  artifactRef: z.string().optional(),
  autoIncrementPatchFrom: z.string().optional()
});

export const deployAllSchema = z.object({
  onlyOutdated: z.coerce.boolean().optional().default(false)
});

export const deploySiteSchema = z.object({
  releaseId: z.string().min(1, "releaseId הוא שדה חובה")
});

export const rollbackSiteSchema = z.object({
  releaseId: z.string().min(1, "releaseId הוא שדה חובה"),
  reason: z.string().trim().max(4000).optional()
});

export const nextVersionSchema = z.object({
  fromVersion: z.string().min(1, "fromVersion הוא שדה חובה")
});
