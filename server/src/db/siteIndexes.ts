import { Site } from "../models/Site";

export const HUB_SITE_INDEX_DEFINITIONS = Object.freeze([
  { name: "siteCode_1", key: { siteCode: 1 }, required: false, options: {} },
  {
    name: "siteIdentityKey_1",
    key: { siteIdentityKey: 1 },
    required: true,
    options: { unique: true, partialFilterExpression: { siteIdentityKey: { $exists: true } } }
  }
] as const);

export type MongoIndexDescription = {
  name?: string;
  key?: Record<string, number>;
  unique?: boolean;
  partialFilterExpression?: unknown;
};

export type DuplicateCandidate = { field: string; groups: number; documents: number };

export type SiteIndexInspection = {
  status: "healthy" | "warnings" | "blockers";
  existingIndexes: MongoIndexDescription[];
  missingRequired: string[];
  missingRecommended: string[];
  mismatched: string[];
  legacyUniqueSiteCode: boolean;
  missingSiteIdentityKey: number;
  duplicates: DuplicateCandidate[];
  warnings: string[];
  blockers: string[];
};

export type SiteIndexInspectionAdapter = {
  listIndexes(): Promise<MongoIndexDescription[]>;
  countMissingSiteIdentityKey(): Promise<number>;
  findDuplicateCandidates(field: "siteIdentityKey" | "builderSiteId" | "safeCollectionName"): Promise<DuplicateCandidate>;
};

const sameJson = (left: unknown, right: unknown) => JSON.stringify(left || {}) === JSON.stringify(right || {});

export const mongooseSiteIndexInspectionAdapter: SiteIndexInspectionAdapter = {
  listIndexes: async () => {
    try { return (await Site.collection.indexes()) as MongoIndexDescription[]; }
    catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && Number((error as { code?: unknown }).code) === 26) return [];
      throw error;
    }
  },
  countMissingSiteIdentityKey: async () =>
    Site.countDocuments({ $or: [{ siteIdentityKey: { $exists: false } }, { siteIdentityKey: "" }] }),
  findDuplicateCandidates: async (field) => {
    const rows = await Site.aggregate<{ _id: string; count: number }>([
      { $match: { [field]: { $exists: true, $type: "string", $ne: "" } } },
      { $group: { _id: `$${field}`, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } }
    ]);
    return { field, groups: rows.length, documents: rows.reduce((sum, row) => sum + row.count, 0) };
  }
};

export const inspectSiteIndexes = async (
  adapter: SiteIndexInspectionAdapter = mongooseSiteIndexInspectionAdapter
): Promise<SiteIndexInspection> => {
  const existingIndexes = await adapter.listIndexes();
  const missingRequired: string[] = [];
  const missingRecommended: string[] = [];
  const mismatched: string[] = [];

  for (const definition of HUB_SITE_INDEX_DEFINITIONS) {
    const existing = existingIndexes.find((index) => index.name === definition.name);
    if (!existing) {
      (definition.required ? missingRequired : missingRecommended).push(definition.name);
      continue;
    }
    const expectedOptions = definition.options as { unique?: boolean; partialFilterExpression?: unknown };
    if (
      !sameJson(existing.key, definition.key) ||
      Boolean(existing.unique) !== Boolean(expectedOptions.unique) ||
      !sameJson(existing.partialFilterExpression, expectedOptions.partialFilterExpression)
    ) {
      mismatched.push(definition.name);
    }
  }

  const [missingSiteIdentityKey, ...duplicates] = await Promise.all([
    adapter.countMissingSiteIdentityKey(),
    adapter.findDuplicateCandidates("siteIdentityKey"),
    adapter.findDuplicateCandidates("builderSiteId"),
    adapter.findDuplicateCandidates("safeCollectionName")
  ]);
  const legacyUniqueSiteCode = existingIndexes.some((index) => index.name === "siteCode_1" && index.unique === true);
  const warnings = [
    ...missingRecommended.map((name) => `Recommended index missing: sites.${name}`),
    ...(missingSiteIdentityKey > 0 ? [`${missingSiteIdentityKey} site records are missing siteIdentityKey`] : []),
    ...duplicates
      .filter((duplicate) => duplicate.field !== "siteIdentityKey" && duplicate.groups > 0)
      .map((duplicate) => `${duplicate.groups} duplicate ${duplicate.field} candidate groups`)
  ];
  const blockers = [
    ...missingRequired.map((name) => `Required index missing: sites.${name}`),
    ...mismatched.map((name) => `Index definition mismatch: sites.${name}`),
    ...(legacyUniqueSiteCode ? ["Legacy unique index present: sites.siteCode_1"] : []),
    ...duplicates
      .filter((duplicate) => duplicate.field === "siteIdentityKey" && duplicate.groups > 0)
      .map((duplicate) => `${duplicate.groups} duplicate siteIdentityKey groups prevent a safe unique index`)
  ];

  return {
    status: blockers.length ? "blockers" : warnings.length ? "warnings" : "healthy",
    existingIndexes,
    missingRequired,
    missingRecommended,
    mismatched,
    legacyUniqueSiteCode,
    missingSiteIdentityKey,
    duplicates,
    warnings,
    blockers
  };
};

export const assertSiteIndexStartupPolicy = (inspection: SiteIndexInspection, nodeEnv: string) => {
  if (nodeEnv === "production" && inspection.blockers.length > 0) {
    throw new Error(`Mongo startup validation blocked: ${inspection.blockers.join("; ")}`);
  }
};
