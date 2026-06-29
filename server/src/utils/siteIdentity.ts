import { resolveSiteBuilderPaths, SiteBuilderPathInput, SiteBuilderResolvedPaths } from "./sitebuilderPaths";

const normalizeIdentityPart = (value: string) => String(value || "").trim().replace(/\/+$/g, "").toLowerCase();

export type SiteRuntimeIdentityInput = {
  storageBackend?: string;
  builderSiteId?: string;
  mongoSiteId?: string;
  safeCollectionName?: string;
};

export const buildSiteIdentityKeyFromResolvedPaths = (
  paths: SiteBuilderResolvedPaths,
  runtime: SiteRuntimeIdentityInput = {}
) =>
  JSON.stringify({
    sharePointSiteUrl: normalizeIdentityPart(paths.sharePointSiteUrl),
    finalDistRoot: normalizeIdentityPart(paths.finalDistRoot),
    runtimeConfigPath: normalizeIdentityPart(paths.runtimeConfigPath),
    siteDbRoot: normalizeIdentityPart(paths.siteDbRoot),
    usersDbRoot: normalizeIdentityPart(paths.usersDbRoot),
    storageBackend: normalizeIdentityPart(runtime.storageBackend || "unknown"),
    builderSiteId: normalizeIdentityPart(runtime.builderSiteId || runtime.mongoSiteId || ""),
    mongoSiteId: normalizeIdentityPart(runtime.mongoSiteId || runtime.builderSiteId || ""),
    safeCollectionName: normalizeIdentityPart(runtime.safeCollectionName || "")
  });

export const buildSiteIdentityKey = (input: SiteBuilderPathInput & SiteRuntimeIdentityInput) =>
  buildSiteIdentityKeyFromResolvedPaths(resolveSiteBuilderPaths(input), input);
