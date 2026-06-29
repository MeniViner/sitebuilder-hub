import { FilterQuery } from "mongoose";
import { Site, SiteDocument, SiteHealth } from "../models/Site";
import { deriveHealthStatus } from "../utils/health";
import { applyResolvedSiteBuilderPaths, resolveSiteBuilderPaths, SiteBuilderPathInput } from "../utils/sitebuilderPaths";
import { buildSiteIdentityKeyFromResolvedPaths } from "../utils/siteIdentity";
import { logger } from "../utils/logger";

export type SiteQueryFilters = {
  status?: string;
  search?: string;
  siteCode?: string;
  includeArchived?: boolean;
};

export const listSites = (filters: SiteQueryFilters) => {
  const query: FilterQuery<SiteDocument> = {};

  if (!filters.includeArchived) {
    query.status = { $ne: "archived" } as any;
  }

  if (filters.status && filters.status !== "all") {
    query.status = filters.status;
  }

  if (filters.siteCode) {
    query.siteCode = filters.siteCode;
  }

  if (filters.search) {
    query.$or = [
      { displayName: { $regex: filters.search, $options: "i" } },
      { siteCode: { $regex: filters.search, $options: "i" } },
      { ownerName: { $regex: filters.search, $options: "i" } },
      { unitName: { $regex: filters.search, $options: "i" } }
    ];
  }

  logger.debug("sites", "Listing sites", { filters, query });
  return Site.find(query).sort({ updatedAt: -1 });
};

export const getSiteById = (id: string) => {
  logger.debug("sites", "Loading site by id", { id });
  return Site.findById(id);
};

export const getSitesByIds = (ids: string[]) => {
  logger.debug("sites", "Loading sites by ids", { ids, count: ids.length });
  return Site.find({ _id: { $in: ids } });
};

const toPathInput = (value: Record<string, unknown>): SiteBuilderPathInput => ({
  siteCode: String(value.siteCode || ""),
  sharePointHost: String(value.sharePointHost || ""),
  sharePointSiteUrl: String(value.sharePointSiteUrl || ""),
  siteDbLibrary: String(value.siteDbLibrary || ""),
  usersDbLibrary: String(value.usersDbLibrary || ""),
  bootstrapLibrary: String(value.bootstrapLibrary || ""),
  bootstrapFolder: String(value.bootstrapFolder || ""),
  widgetsDbTarget: String(value.widgetsDbTarget || ""),
  runtimeConfigPath: String(value.runtimeConfigPath || "")
});

const withResolvedPathsForPersistence = (payload: Record<string, unknown>, base: Record<string, unknown> = {}) => {
  const merged = { ...base, ...payload };
  const resolved = applyResolvedSiteBuilderPaths(toPathInput(merged));
  const runtimeConfigPath = String(payload.runtimeConfigPath || resolved.resolvedPaths.runtimeConfigPath || "");
  const runtimeConfigUrl = String(payload.runtimeConfigUrl || resolved.resolvedPaths.runtimeConfigUrl || "");
  const storageBackend = String(payload.storageBackend || base.storageBackend || "unknown");
  const builderSiteId = String(payload.builderSiteId || base.builderSiteId || payload.mongoSiteId || base.mongoSiteId || "");
  const mongoSiteId = String(payload.mongoSiteId || base.mongoSiteId || builderSiteId || "");
  const safeCollectionName = String(payload.safeCollectionName || base.safeCollectionName || "");
  const next = {
    ...payload,
    ...resolved,
    runtimeConfigPath,
    runtimeConfigUrl,
    builderSiteId,
    mongoSiteId,
    storageBackend,
    authoritativeAdminSource: String(payload.authoritativeAdminSource || base.authoritativeAdminSource || "") ||
      (storageBackend === "mongo" ? "mongo" : storageBackend === "txt" ? "txt" : "unknown"),
    siteIdentityKey: buildSiteIdentityKeyFromResolvedPaths(resolved.resolvedPaths, {
      storageBackend,
      builderSiteId,
      mongoSiteId,
      safeCollectionName
    })
  };
  return guardMongoReadiness(next, merged);
};

const guardMongoReadiness = (next: Record<string, unknown>, merged: Record<string, unknown>) => {
  if (String(next.storageBackend || "unknown") !== "mongo") return next;

  const health = (merged.health || next.health || {}) as Partial<SiteHealth>;
  const runtimeConfigStatus = (merged.runtimeConfigStatus || next.runtimeConfigStatus || {}) as Record<string, unknown>;
  const mongoBackendStatus = (merged.mongoBackendStatus || next.mongoBackendStatus || {}) as Record<string, unknown>;
  const runtimeReady =
    health.runtimeConfigExists === true &&
    health.runtimeConfigValid === true &&
    ["configured", "ok"].includes(String(runtimeConfigStatus.readStatus || "configured"));
  const hostingReady =
    health.siteDbExists === true &&
    health.usersDbExists === true &&
    health.distExists === true &&
    health.indexExists === true;
  const mongoReady =
    health.dataBackendReachable === true &&
    health.mongoRegistryOk === true &&
    health.mongoCollectionOk === true &&
    health.mongoSeedOk === true &&
    String(mongoBackendStatus.seedStatus || "ok") === "ok";
  const ready = hostingReady && runtimeReady && mongoReady;

  if (ready) {
    return {
      ...next,
      lifecycleStatus: next.lifecycleStatus || "ready",
      provisioningStatus: next.provisioningStatus || "succeeded"
    };
  }

  return {
    ...next,
    status: next.status === "active" ? "draft" : next.status,
    lifecycleStatus: next.lifecycleStatus === "ready" ? "partially-created" : next.lifecycleStatus || "draft",
    provisioningStatus: next.provisioningStatus === "succeeded" ? "partially-created" : next.provisioningStatus || "unknown"
  };
};

const throwSiteIdentityDuplicate = (details: Record<string, unknown>) => {
  const error = new Error("site-identity-duplicate") as Error & { details?: Record<string, unknown> };
  error.details = details;
  throw error;
};

const assertSiteIdentityAvailable = async (siteIdentityKey: string, exceptId?: unknown) => {
  const query: FilterQuery<SiteDocument> = { siteIdentityKey };
  if (exceptId) {
    query._id = { $ne: exceptId } as any;
  }

  const existing = await Site.findOne(query, {
    _id: 1,
    siteCode: 1,
    displayName: 1,
    sharePointSiteUrl: 1,
    siteDbLibrary: 1,
    usersDbLibrary: 1,
    storageBackend: 1,
    builderSiteId: 1,
    mongoSiteId: 1,
    safeCollectionName: 1,
    runtimeConfigPath: 1
  }).lean();
  if (!existing) return;

  throwSiteIdentityDuplicate({
    existingSiteId: String(existing._id),
    existingSiteCode: existing.siteCode,
    existingDisplayName: existing.displayName,
    sharePointSiteUrl: existing.sharePointSiteUrl,
    siteDbLibrary: existing.siteDbLibrary,
    usersDbLibrary: existing.usersDbLibrary,
    storageBackend: existing.storageBackend,
    builderSiteId: existing.builderSiteId,
    mongoSiteId: existing.mongoSiteId,
    safeCollectionName: existing.safeCollectionName,
    runtimeConfigPath: existing.runtimeConfigPath
  });
};

const withResolvedPathsForResponse = <T extends Record<string, unknown>>(site: T) => {
  try {
    const resolvedPaths = resolveSiteBuilderPaths(toPathInput(site));
    return {
      ...site,
      sharePointHost: resolvedPaths.host,
      sharePointSiteUrl: resolvedPaths.sharePointSiteUrl,
      finalAppUrl: resolvedPaths.finalAppUrl,
      bootstrapUrl: resolvedPaths.bootstrapUrl,
      runtimeConfigPath: resolvedPaths.runtimeConfigPath,
      runtimeConfigUrl: resolvedPaths.runtimeConfigUrl,
      siteDbLibrary: resolvedPaths.siteDbLibrary,
      usersDbLibrary: resolvedPaths.usersDbLibrary,
      bootstrapLibrary: resolvedPaths.bootstrapLibrary,
      bootstrapFolder: resolvedPaths.bootstrapFolder,
      widgetsDbTarget: resolvedPaths.widgetsDbTarget,
      resolvedPaths
    };
  } catch {
    return site;
  }
};

export const createSite = async (payload: Record<string, unknown>) => {
  logger.info("sites", "Creating site", {
    siteCode: payload.siteCode,
    displayName: payload.displayName,
    status: payload.status
  });
  const nextSite = withResolvedPathsForPersistence(payload);
  await assertSiteIdentityAvailable(String(nextSite.siteIdentityKey || ""));
  const site = await Site.create(nextSite);
  logger.info("sites", "Site persisted", { id: site._id.toString(), siteCode: site.siteCode, siteIdentityKey: site.siteIdentityKey });
  return site;
};

export const updateSite = async (id: string, payload: Record<string, unknown>) => {
  logger.info("sites", "Updating site", { id, fields: Object.keys(payload) });
  const site = await Site.findById(id);
  if (!site) {
    logger.warn("sites", "Update skipped because site was not found", { id });
    return null;
  }

  const nextSite = withResolvedPathsForPersistence(payload, site.toObject());
  await assertSiteIdentityAvailable(String(nextSite.siteIdentityKey || ""), site._id);
  site.set(nextSite);
  const saved = await site.save();
  logger.info("sites", "Site update persisted", { id: saved._id.toString(), siteCode: saved.siteCode, siteIdentityKey: saved.siteIdentityKey });
  return saved;
};

export const archiveOrDeleteSite = async (id: string, force: boolean) => {
  logger.warn("sites", force ? "Deleting site" : "Archiving site", { id, force });
  if (force) return Site.findByIdAndDelete(id);
  return Site.findByIdAndUpdate(id, { status: "archived" }, { new: true, runValidators: true });
};

export const manualHealthCheck = (id: string, health: Record<string, boolean>) =>
  {
    logger.info("sites", "Applying manual health check", { id, health });
    return Site.findByIdAndUpdate(id, { health, lastHealthCheckAt: new Date() }, { new: true, runValidators: true });
  };

export const withDerivedHealth = <T extends Record<string, unknown> & { health?: unknown; lastHealthCheckAt?: Date | null }>(site: T) => ({
  ...withResolvedPathsForResponse(site),
  derivedHealthStatus: deriveHealthStatus(
    site.health as Partial<SiteHealth>,
    site.lastHealthCheckAt ?? null,
    String(site.storageBackend || "unknown")
  )
});

export const getStats = async () => {
  logger.debug("sites", "Building site stats");
  const sites = await Site.find({}, { health: 1, lastHealthCheckAt: 1, status: 1, storageMb: 1 });
  const summary = { healthy: 0, warning: 0, failed: 0, unknown: 0 };

  let totalStorageMb = 0;
  for (const site of sites) {
    totalStorageMb += site.storageMb ?? 0;
    const key = deriveHealthStatus(site.health, site.lastHealthCheckAt ?? null, String(site.storageBackend || "unknown"));
    summary[key] += 1;
  }

  const stats = {
    total: sites.length,
    active: sites.filter((s) => s.status === "active").length,
    warning: sites.filter((s) => s.status === "warning").length,
    failed: sites.filter((s) => s.status === "failed").length,
    archived: sites.filter((s) => s.status === "archived").length,
    totalStorageMb,
    health: summary
  };
  logger.debug("sites", "Site stats built", stats);
  return stats;
};
