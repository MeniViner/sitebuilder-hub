import { z } from "zod";

export const createReleaseSchema = z.object({
  name: z.string().trim().max(120).optional(),
  version: z.string().trim().optional(),
  releaseType: z.enum(["patch", "minor", "major", "hotfix"]).default("patch"),
  notes: z.string().optional(),
  artifactRef: z.string().optional(),
  autoIncrementPatchFrom: z.string().optional()
});

export const updateReleaseNameSchema = z.object({
  name: z.string().trim().min(1, "שם Release הוא שדה חובה").max(120)
});

export const updateReleaseSchema = z.object({
  name: z.string().trim().min(1, "שם Release הוא שדה חובה").max(120),
  version: z.string().trim().min(1, "מספר גרסה הוא שדה חובה").optional(),
  releaseType: z.enum(["patch", "minor", "major", "hotfix"]).optional(),
  notes: z.string().optional(),
  artifactRef: z.string().optional(),
  status: z.enum(["active", "deprecated"]).optional()
});

export const deployAllSchema = z.object({
  onlyOutdated: z.coerce.boolean().optional().default(false),
  deployMode: z.enum(["local-dev-owner", "production-safe"]).optional().default("local-dev-owner")
});

export const deploymentTargetModeSchema = z.enum(["single", "selected", "all"]);
export const sharePointConnectorModeSchema = z.literal("browser-sharepoint");

export const batchDeployPlanSchema = z.object({
  targetMode: deploymentTargetModeSchema.default("all"),
  targetSiteIds: z.array(z.string().min(1)).optional().default([]),
  deployMode: z.enum(["local-dev-owner", "production-safe"]).optional().default("local-dev-owner"),
  connectorMode: sharePointConnectorModeSchema.optional().default("browser-sharepoint"),
  allowDeployWithoutBackup: z.coerce.boolean().optional().default(false)
});

export const batchDeployExecuteSchema = batchDeployPlanSchema.extend({
  confirmNoPartial: z.coerce.boolean().optional().default(true)
});

export const deploySiteSchema = z.object({
  releaseId: z.string().min(1, "releaseId הוא שדה חובה"),
  deployMode: z.enum(["local-dev-owner", "production-safe"]).optional().default("local-dev-owner"),
  connectorMode: sharePointConnectorModeSchema.optional().default("browser-sharepoint"),
  allowDeployWithoutBackup: z.coerce.boolean().optional().default(false)
});

export const rollbackSiteSchema = z.object({
  releaseId: z.string().min(1, "releaseId הוא שדה חובה"),
  reason: z.string().trim().max(4000).optional()
});

export const nextVersionSchema = z.object({
  fromVersion: z.string().min(1, "fromVersion הוא שדה חובה"),
  releaseType: z.enum(["patch", "minor", "major", "hotfix"]).optional().default("patch")
});
