import { buildSiteIdentityKey } from "../utils/siteIdentity";
import { HUB_SITE_INDEX_DEFINITIONS, inspectSiteIndexes, mongooseSiteIndexInspectionAdapter, SiteIndexInspection } from "./siteIndexes";

export const HUB_INDEX_MIGRATION_CONFIRMATION = "SITE_INDEX_MIGRATION";
export const HUB_INDEX_MIGRATION_VERSION = "1";

export type SiteIdentityCandidate = {
  _id: unknown;
  siteIdentityKey?: string;
  siteCode?: string;
  sharePointHost?: string;
  sharePointSiteUrl?: string;
  siteDbLibrary?: string;
  usersDbLibrary?: string;
  bootstrapLibrary?: string;
  bootstrapFolder?: string;
  widgetsDbTarget?: string;
  storageBackend?: string;
  builderSiteId?: string;
  mongoSiteId?: string;
  safeCollectionName?: string;
};

export type SiteIndexMigrationAdapter = {
  inspect(): Promise<SiteIndexInspection>;
  listIdentityCandidates(): Promise<SiteIdentityCandidate[]>;
  dropIndex(name: string): Promise<void>;
  createIndex(key: Record<string, number>, options: Record<string, unknown>): Promise<void>;
  setSiteIdentityKey(id: unknown, value: string): Promise<void>;
};

export type SiteIndexMigrationPlan = {
  candidateBackfills: Array<{ id: unknown; siteIdentityKey: string }>;
  plannedActions: Array<{ type: "dropIndex" | "backfill" | "createIndex"; target: string; count?: number }>;
  blockers: string[];
  warnings: string[];
  inspection: SiteIndexInspection;
};

const buildCandidate = (site: SiteIdentityCandidate) =>
  buildSiteIdentityKey({
    siteCode: site.siteCode,
    sharePointHost: site.sharePointHost,
    sharePointSiteUrl: site.sharePointSiteUrl,
    siteDbLibrary: site.siteDbLibrary,
    usersDbLibrary: site.usersDbLibrary,
    bootstrapLibrary: site.bootstrapLibrary,
    bootstrapFolder: site.bootstrapFolder,
    widgetsDbTarget: site.widgetsDbTarget as "users" | "site" | undefined,
    storageBackend: site.storageBackend,
    builderSiteId: site.builderSiteId,
    mongoSiteId: site.mongoSiteId,
    safeCollectionName: site.safeCollectionName
  });

export const planSiteIndexMigration = async (adapter: SiteIndexMigrationAdapter): Promise<SiteIndexMigrationPlan> => {
  const [inspection, sites] = await Promise.all([adapter.inspect(), adapter.listIdentityCandidates()]);
  const existingKeys = new Set(sites.map((site) => site.siteIdentityKey).filter(Boolean));
  const candidateBackfills: SiteIndexMigrationPlan["candidateBackfills"] = [];
  const collisions = new Map<string, number>();
  let unbuildableCandidates = 0;

  for (const site of sites.filter((row) => !row.siteIdentityKey)) {
    try {
      const siteIdentityKey = buildCandidate(site);
      collisions.set(siteIdentityKey, (collisions.get(siteIdentityKey) || 0) + 1 + (existingKeys.has(siteIdentityKey) ? 1 : 0));
      candidateBackfills.push({ id: site._id, siteIdentityKey });
    } catch {
      unbuildableCandidates += 1;
    }
  }

  const duplicateCandidateGroups = [...collisions.values()].filter((count) => count > 1).length;
  const blockers = [
    ...inspection.blockers.filter((blocker) =>
      !blocker.startsWith("Required index missing") &&
      !blocker.startsWith("Legacy unique index") &&
      blocker !== "Index definition mismatch: sites.siteCode_1"
    ),
    ...(duplicateCandidateGroups ? [`Cannot apply migration: ${duplicateCandidateGroups} duplicate siteIdentityKey candidate groups`] : []),
    ...(unbuildableCandidates ? [`Cannot apply migration: ${unbuildableCandidates} backfill candidates cannot produce siteIdentityKey`] : [])
  ];
  const plannedActions: SiteIndexMigrationPlan["plannedActions"] = [];
  if (candidateBackfills.length) {
    plannedActions.push({ type: "backfill", target: "sites.siteIdentityKey", count: candidateBackfills.length });
  }
  if (inspection.missingRequired.includes("siteIdentityKey_1")) {
    plannedActions.push({ type: "createIndex", target: "sites.siteIdentityKey_1" });
  }
  const replaceSiteCode = inspection.legacyUniqueSiteCode || inspection.mismatched.includes("siteCode_1");
  if (replaceSiteCode) {
    plannedActions.push({ type: "dropIndex", target: "sites.siteCode_1" });
  }
  if (replaceSiteCode || inspection.missingRecommended.includes("siteCode_1")) {
    plannedActions.push({ type: "createIndex", target: "sites.siteCode_1" });
  }

  return { candidateBackfills, plannedActions, blockers, warnings: inspection.warnings, inspection };
};

export const applySiteIndexMigration = async (
  adapter: SiteIndexMigrationAdapter,
  confirmation: string
) => {
  if (confirmation !== HUB_INDEX_MIGRATION_CONFIRMATION) {
    throw new Error(`Apply requires --confirm ${HUB_INDEX_MIGRATION_CONFIRMATION}`);
  }
  const plan = await planSiteIndexMigration(adapter);
  if (plan.blockers.length) throw new Error(plan.blockers.join("; "));

  const completedActions: string[] = [];
  for (const action of plan.plannedActions) {
    if (action.type === "dropIndex") {
      await adapter.dropIndex("siteCode_1");
      completedActions.push(`dropped:${action.target}`);
    } else if (action.type === "backfill") {
      for (const candidate of plan.candidateBackfills) {
        await adapter.setSiteIdentityKey(candidate.id, candidate.siteIdentityKey);
      }
      completedActions.push(`backfilled:${plan.candidateBackfills.length}`);
    } else {
      const definition = HUB_SITE_INDEX_DEFINITIONS.find((item) => `sites.${item.name}` === action.target);
      if (definition) {
        await adapter.createIndex(definition.key, { name: definition.name, ...definition.options });
        completedActions.push(`created:${action.target}`);
      }
    }
  }
  return { completedActions, status: completedActions.length ? "applied" : "already-current" };
};

export const mongooseSiteIndexMigrationAdapter = (): SiteIndexMigrationAdapter => ({
  inspect: () => inspectSiteIndexes(mongooseSiteIndexInspectionAdapter),
  listIdentityCandidates: async () =>
    (await import("../models/Site")).Site.find({}, {
      _id: 1, siteIdentityKey: 1, siteCode: 1, sharePointHost: 1, sharePointSiteUrl: 1,
      siteDbLibrary: 1, usersDbLibrary: 1, bootstrapLibrary: 1, bootstrapFolder: 1,
      widgetsDbTarget: 1, storageBackend: 1, builderSiteId: 1, mongoSiteId: 1, safeCollectionName: 1
    }).lean<SiteIdentityCandidate[]>(),
  dropIndex: async (name) => { await (await import("../models/Site")).Site.collection.dropIndex(name); },
  createIndex: async (key, options) => { await (await import("../models/Site")).Site.collection.createIndex(key, options); },
  setSiteIdentityKey: async (id, value) => {
    await (await import("../models/Site")).Site.updateOne(
      { _id: id, $or: [{ siteIdentityKey: { $exists: false } }, { siteIdentityKey: "" }] },
      { $set: { siteIdentityKey: value } }
    );
  }
});
