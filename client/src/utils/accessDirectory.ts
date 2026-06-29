import type { AccessDirectoryUser, AccessRoleType, AccessSourceType, AccessUserStatus } from "../api/sitesApi";

export type AccessQuickView = "all" | "admins" | "drift" | "failed-sources" | "production" | "not-verified";
export type AccessSortKey = "displayName" | "personalNumber" | "email" | "sitesCount" | "highestAccess" | "lastVerifiedAt";

export type AccessUserFilters = {
  search: string;
  siteId: string;
  environment: string;
  storageBackend: string;
  role: AccessRoleType | "";
  source: AccessSourceType | "";
  status: AccessUserStatus | "";
  quickView: AccessQuickView;
  sort: AccessSortKey;
};

const accessRank: Record<string, number> = {
  "sharepoint-site-collection-admin": 8,
  "sharepoint-owners-group": 7,
  "site-owner": 6,
  "app-admin": 5,
  "hub-metadata-admin": 4,
  "hub-metadata-owner": 3,
  "regular-user": 2,
  unknown: 1
};

const normalized = (value: unknown) => String(value || "").trim().toLowerCase();

const userSearchText = (user: AccessDirectoryUser) =>
  [
    user.displayName,
    user.normalizedPersonalNumber,
    ...user.emails,
    ...user.aliases,
    ...user.sites.flatMap((site) => [site.displayName, site.siteCode])
  ].map(normalized).join(" ");

const highestAccessRank = (user: AccessDirectoryUser) =>
  Math.max(0, ...user.roles.map((role) => accessRank[role] || 0));

export function filterAccessUsers(users: AccessDirectoryUser[], filters: AccessUserFilters) {
  const query = normalized(filters.search);
  return users.filter((user) => {
    if (query && !userSearchText(user).includes(query)) return false;
    if (filters.siteId && !user.sites.some((site) => site.siteId === filters.siteId)) return false;
    if (filters.environment && !user.sites.some((site) => site.environment === filters.environment)) return false;
    if (filters.storageBackend && !user.sites.some((site) => site.storageBackend === filters.storageBackend)) return false;
    if (filters.role && !user.roles.includes(filters.role)) return false;
    if (filters.source && !user.sources.includes(filters.source)) return false;
    if (filters.status && !user.status.includes(filters.status)) return false;

    if (filters.quickView === "admins" && !user.roles.some((role) => ["app-admin", "sharepoint-owners-group", "sharepoint-site-collection-admin", "hub-metadata-admin"].includes(role))) return false;
    if (filters.quickView === "drift" && !user.status.includes("conflict")) return false;
    if (filters.quickView === "failed-sources" && !user.status.includes("source-failed") && !user.status.includes("stale")) return false;
    if (filters.quickView === "production" && !user.sites.some((site) => site.environment === "production")) return false;
    if (filters.quickView === "not-verified" && !user.status.includes("not-verified")) return false;

    return true;
  }).sort((a, b) => {
    if (filters.sort === "personalNumber") return normalized(a.normalizedPersonalNumber).localeCompare(normalized(b.normalizedPersonalNumber), "he");
    if (filters.sort === "email") return normalized(a.emails[0]).localeCompare(normalized(b.emails[0]), "he");
    if (filters.sort === "sitesCount") return b.sites.length - a.sites.length || a.displayName.localeCompare(b.displayName, "he");
    if (filters.sort === "highestAccess") return highestAccessRank(b) - highestAccessRank(a) || a.displayName.localeCompare(b.displayName, "he");
    if (filters.sort === "lastVerifiedAt") return normalized(b.lastVerifiedAt).localeCompare(normalized(a.lastVerifiedAt), "he");
    return a.displayName.localeCompare(b.displayName, "he");
  });
}

export const defaultAccessFilters: AccessUserFilters = {
  search: "",
  siteId: "",
  environment: "",
  storageBackend: "",
  role: "",
  source: "",
  status: "",
  quickView: "all",
  sort: "displayName"
};
