import { z } from "zod";

export const createReleaseSchema = z.object({
  version: z.string().trim().optional(),
  releaseType: z.enum(["patch", "minor", "major", "hotfix"]).default("patch"),
  notes: z.string().optional(),
  artifactRef: z.string().optional(),
  autoIncrementPatchFrom: z.string().optional()
});

export const deployAllSchema = z.object({
  onlyOutdated: z.coerce.boolean().optional().default(false),
  deployMode: z.enum(["local-dev-owner", "production-safe"]).optional().default("local-dev-owner")
});

export const deploymentTargetModeSchema = z.enum(["single", "selected", "all"]);
export const sharePointConnectorModeSchema = z.enum(["backend-sharepoint", "browser-sharepoint"]);

export const batchDeployPlanSchema = z.object({
  targetMode: deploymentTargetModeSchema.default("all"),
  targetSiteIds: z.array(z.string().min(1)).optional().default([]),
  deployMode: z.enum(["local-dev-owner", "production-safe"]).optional().default("local-dev-owner"),
  connectorMode: sharePointConnectorModeSchema.optional().default("backend-sharepoint")
});

export const batchDeployExecuteSchema = batchDeployPlanSchema.extend({
  confirmNoPartial: z.coerce.boolean().optional().default(true)
});

export const deploySiteSchema = z.object({
  releaseId: z.string().min(1, "releaseId הוא שדה חובה"),
  deployMode: z.enum(["local-dev-owner", "production-safe"]).optional().default("local-dev-owner"),
  connectorMode: sharePointConnectorModeSchema.optional().default("backend-sharepoint")
});

export const rollbackSiteSchema = z.object({
  releaseId: z.string().min(1, "releaseId הוא שדה חובה"),
  reason: z.string().trim().max(4000).optional()
});

export const nextVersionSchema = z.object({
  fromVersion: z.string().min(1, "fromVersion הוא שדה חובה"),
  releaseType: z.enum(["patch", "minor", "major", "hotfix"]).optional().default("patch")
});
