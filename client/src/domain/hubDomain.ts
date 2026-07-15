import {
  type AccessChangePlanInput,
  type Backup,
  type Job,
  type Release,
  sitesApi
} from "../api/sitesApi";
import type { Site, SitesStats } from "../types/site";
import { settleSlice, type SettledSlice } from "./presentation";

export type ManagedSiteId = string & { readonly __managedSiteId: unique symbol };
export type BuilderLogicalSiteId = string & { readonly __builderLogicalSiteId: unique symbol };
export type PhysicalCollectionName = string & { readonly __physicalCollectionName: unique symbol };

export type SiteIdentityBoundary = {
  managedSiteId: ManagedSiteId;
  builderSiteId?: BuilderLogicalSiteId;
  mongoSiteId?: BuilderLogicalSiteId;
  safeCollectionName?: PhysicalCollectionName;
  siteIdentityKey?: string;
};

export function identityBoundaryForSite(site: Site): SiteIdentityBoundary {
  return {
    managedSiteId: site._id as ManagedSiteId,
    builderSiteId: site.builderSiteId as BuilderLogicalSiteId | undefined,
    mongoSiteId: site.mongoSiteId as BuilderLogicalSiteId | undefined,
    safeCollectionName: site.safeCollectionName as PhysicalCollectionName | undefined,
    siteIdentityKey: site.siteIdentityKey
  };
}

export type CreateManagedSiteInput = Partial<Site> & Pick<Site, "displayName" | "siteCode" | "sharePointSiteUrl">;

export type OperationsOverview = {
  jobs: SettledSlice<Job[]>;
  backups: SettledSlice<Backup[]>;
  releases: SettledSlice<Release[]>;
};

export type AccessMutation =
  | { action: "add"; siteId: string; admin: Record<string, string>; reason: string }
  | { action: "remove"; siteId: string; adminId: string; source?: "txt" | "siteCollection" | "ownersGroup"; reason: string }
  | { action: "change"; payload: AccessChangePlanInput };

type HubApi = typeof sitesApi;

export function createHubDomain(api: HubApi = sitesApi) {
  return {
    async listSites(params?: Record<string, string>): Promise<{ sites: Site[]; stats?: SitesStats; count: number }> {
      const response = await api.list(params);
      return {
        sites: response.data,
        stats: response.meta?.stats,
        count: response.meta?.count ?? response.data.length
      };
    },

    async getSite(managedSiteId: string) {
      return (await api.getById(managedSiteId)).data;
    },

    async checkSite(managedSiteId: string) {
      const site = (await api.getById(managedSiteId)).data;
      const result = site.storageBackend === "mongo"
        ? await api.runMongoBackendHealth(managedSiteId)
        : await api.runSharePointReadOnlyHealth(managedSiteId);
      return { site, result: result.data };
    },

    async createSite(input: CreateManagedSiteInput) {
      return (await api.create(input)).data;
    },

    async continueSiteSetup(managedSiteId: string) {
      const site = (await api.getById(managedSiteId)).data;
      const complete = site.lifecycleStatus === "ready" && site.provisioningStatus === "succeeded";
      return {
        site,
        complete,
        resumeRoute: `/sites/new?resume=${encodeURIComponent(site._id)}`,
        advancedRoute: `/advanced/sites?site=${encodeURIComponent(site._id)}`
      };
    },

    async listOperations(): Promise<OperationsOverview> {
      const [jobs, backups, releases] = await Promise.all([
        settleSlice(api.jobs().then((response) => response.data)),
        settleSlice(api.backups().then((response) => response.data)),
        settleSlice(api.releases().then((response) => response.data))
      ]);
      return { jobs, backups, releases };
    },

    async deployVersion(managedSiteId: string, releaseId: string) {
      return (await api.deploySiteVersion(managedSiteId, releaseId)).data;
    },

    async listBackups(managedSiteId?: string) {
      return (await (managedSiteId ? api.siteBackups(managedSiteId) : api.backups())).data;
    },

    async createBackup(managedSiteId: string) {
      return (await api.runSiteBackup(managedSiteId)).data;
    },

    async restoreBackup(backupId: string, notes = "") {
      return (await api.queueRestoreBackup(backupId, notes)).data;
    },

    async getAccess(managedSiteId: string) {
      return (await api.siteAdmins(managedSiteId)).data;
    },

    async updateAccess(mutation: AccessMutation) {
      if (mutation.action === "add") {
        return (await api.addSiteAdmin(mutation.siteId, mutation.admin, mutation.reason)).data;
      }
      if (mutation.action === "remove") {
        return (await api.removeSiteAdmin(mutation.siteId, mutation.adminId, mutation.source, mutation.reason)).data;
      }
      return (await api.executeAccessChange(mutation.payload)).data;
    }
  };
}

export const hubDomain = createHubDomain();

