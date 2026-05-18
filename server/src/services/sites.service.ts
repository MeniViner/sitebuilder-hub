import { FilterQuery } from "mongoose";
import { Site, SiteDocument, SiteHealth } from "../models/Site";
import { deriveHealthStatus } from "../utils/health";
import { applyResolvedSiteBuilderPaths, resolveSiteBuilderPaths, SiteBuilderPathInput } from "../utils/sitebuilderPaths";
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
  widgetsDbTarget: String(value.widgetsDbTarget || "")
});

const withResolvedPathsForPersistence = (payload: Record<string, unknown>, base: Record<string, unknown> = {}) => {
  const merged = { ...base, ...payload };
  return {
    ...payload,
    ...applyResolvedSiteBuilderPaths(toPathInput(merged))
  };
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
  const site = await Site.create(withResolvedPathsForPersistence(payload));
  logger.info("sites", "Site persisted", { id: site._id.toString(), siteCode: site.siteCode });
  return site;
};

export const updateSite = async (id: string, payload: Record<string, unknown>) => {
  logger.info("sites", "Updating site", { id, fields: Object.keys(payload) });
  const site = await Site.findById(id);
  if (!site) {
    logger.warn("sites", "Update skipped because site was not found", { id });
    return null;
  }

  site.set(withResolvedPathsForPersistence(payload, site.toObject()));
  const saved = await site.save();
  logger.info("sites", "Site update persisted", { id: saved._id.toString(), siteCode: saved.siteCode });
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
  derivedHealthStatus: deriveHealthStatus(site.health as Partial<SiteHealth>, site.lastHealthCheckAt ?? null)
});

export const getStats = async () => {
  logger.debug("sites", "Building site stats");
  const sites = await Site.find({}, { health: 1, lastHealthCheckAt: 1, status: 1, storageMb: 1 });
  const summary = { healthy: 0, warning: 0, failed: 0, unknown: 0 };

  let totalStorageMb = 0;
  for (const site of sites) {
    totalStorageMb += site.storageMb ?? 0;
    const key = deriveHealthStatus(site.health, site.lastHealthCheckAt ?? null);
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
