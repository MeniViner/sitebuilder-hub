import { z } from "zod";

export const SITE_DATA_MIGRATION_STATES = ["source", "shadow", "frozen", "target", "rollback"] as const;
export type SiteDataMigrationState = (typeof SITE_DATA_MIGRATION_STATES)[number];

export const siteDataBindingSchema = z.object({
  builderSiteId: z.string().trim().min(1).max(160),
  database: z.literal("sitebuilder_site_data"),
  safeCollectionName: z.string().trim().regex(/^[a-zA-Z0-9_]{1,120}$/),
  apiVersion: z.literal("v1"),
  migrationState: z.enum(SITE_DATA_MIGRATION_STATES),
  sourceProfileRef: z.string().trim().min(1).max(200).optional(),
  lastValidatedAt: z.coerce.date().optional(),
  manifestHash: z.string().trim().regex(/^[a-fA-F0-9]{64}$/).optional()
}).strict();

export type SiteDataBinding = z.infer<typeof siteDataBindingSchema>;

export const normalizeSiteDataBinding = (value: unknown): SiteDataBinding => {
  const parsed = siteDataBindingSchema.parse(value);
  return {
    ...parsed,
    builderSiteId: parsed.builderSiteId.trim(),
    safeCollectionName: parsed.safeCollectionName.trim(),
    ...(parsed.sourceProfileRef ? { sourceProfileRef: parsed.sourceProfileRef.trim() } : {}),
    ...(parsed.manifestHash ? { manifestHash: parsed.manifestHash.toLowerCase() } : {})
  };
};

export const compareSiteDataBindings = (left: SiteDataBinding, right: SiteDataBinding) => {
  const fields = ["builderSiteId", "database", "safeCollectionName", "apiVersion", "migrationState", "sourceProfileRef", "manifestHash"] as const;
  return fields.filter((field) => (left[field] || "") !== (right[field] || ""));
};

export const findDuplicateSiteDataBindings = (bindings: SiteDataBinding[]) => {
  const duplicates = (field: "builderSiteId" | "safeCollectionName") => {
    const counts = new Map<string, number>();
    bindings.forEach((binding) => counts.set(binding[field], (counts.get(binding[field]) || 0) + 1));
    return [...counts.entries()].filter(([, count]) => count > 1).map(([value, count]) => ({ field, value, count }));
  };
  return [...duplicates("builderSiteId"), ...duplicates("safeCollectionName")];
};
