import { Site } from "../models/Site";
import { logger } from "../utils/logger";

export type AccessRoleType =
  | "regular-user"
  | "app-admin"
  | "site-owner"
  | "hub-metadata-owner"
  | "hub-metadata-admin"
  | "sharepoint-owners-group"
  | "sharepoint-site-collection-admin"
  | "unknown";

export type AccessSourceType =
  | "hub-metadata-owner"
  | "hub-metadata-admin"
  | "txt-users-data"
  | "txt-admins"
  | "mongo-users-data"
  | "builder-backend-users"
  | "sharepoint-owners-group"
  | "sharepoint-site-collection-admin"
  | "unknown";

export type AccessUserStatus =
  | "healthy"
  | "conflict"
  | "stale"
  | "source-failed"
  | "missing-email"
  | "duplicate-identity"
  | "not-verified";

export type AccessReadStatus = "success" | "failed" | "stale" | "unknown" | "skipped";
export type AccessSourceAuthority = "authoritative" | "supporting" | "hosting" | "metadata" | "unknown";
export type AccessExecutionMode =
  | "browser-sharepoint"
  | "mongo-backend"
  | "server-local"
  | "backend-service-auth-required"
  | "manual"
  | "metadata-only";

export type AccessIdentity = {
  displayName: string;
  normalizedPersonalNumber: string;
  emails: string[];
  aliases: string[];
};

export type AccessSiteMembership = {
  siteId: string;
  siteCode: string;
  displayName: string;
  environment: string;
  storageBackend: "txt" | "mongo" | "unknown" | string;
  roleType: AccessRoleType;
  sourceType: AccessSourceType;
  sourceAuthority: AccessSourceAuthority;
  effectiveAccess: string;
  readStatus: AccessReadStatus;
  lastReadAt?: string;
  evidence: {
    sourceUrl?: string;
    httpStatus?: number;
    httpStatusText?: string;
    errorCode?: string;
    errorMessage?: string;
    connectorMode?: string;
    coverage?: "full-users" | "admin-only" | "metadata-only" | "unavailable";
  };
  warnings: string[];
  blockers: string[];
};

export type AccessDirectoryUser = {
  principalId: string;
  displayName: string;
  normalizedPersonalNumber: string;
  emails: string[];
  aliases: string[];
  unitName: string;
  sites: AccessSiteMembership[];
  roles: AccessRoleType[];
  sources: AccessSourceType[];
  conflicts: string[];
  lastVerifiedAt?: string;
  status: AccessUserStatus[];
  evidenceRefs: string[];
};

export type AccessSourceMatrixRow = {
  id: string;
  siteId: string;
  siteCode: string;
  siteName: string;
  environment: string;
  storageBackend: string;
  sourceType: AccessSourceType;
  status: AccessReadStatus;
  count?: number;
  lastReadAt?: string;
  connector: AccessExecutionMode | "browser-sharepoint" | "metadata-only" | "mongo-backend" | "unknown";
  error?: string;
  blocker?: string;
  coverage: "full-users" | "admin-only" | "metadata-only" | "unavailable";
  authority: AccessSourceAuthority;
  httpStatus?: number;
  sourceUrl?: string;
};

export type AccessDirectorySite = {
  siteId: string;
  siteCode: string;
  displayName: string;
  environment: string;
  storageBackend: string;
  status: string;
  lifecycleStatus?: string;
  archived: boolean;
  sourceHealth: AccessReadStatus;
  writeCapability: "blocked" | "plan-only" | "metadata-only" | "unknown";
};

export type AccessDirectorySummary = {
  totalUsers: number;
  totalAppAdmins: number;
  totalSiteOwners: number;
  usersWithConflicts: number;
  failedOrStaleSources: number;
  lastSuccessfulLiveRead?: string;
  connectorMode: "browser-sharepoint" | "mongo-backend" | "metadata-only" | "backend-service-auth-required";
  connectorModeLabelHe: string;
  generatedAt: string;
};

export type AccessDirectory = {
  generatedAt: string;
  summary: AccessDirectorySummary;
  users: AccessDirectoryUser[];
  sites: AccessDirectorySite[];
  sourceMatrix: AccessSourceMatrixRow[];
  issues: Array<{ severity: "danger" | "warning" | "info"; titleHe: string; detailHe: string; actionHe: string }>;
};

export type AccessChangeAction = "add-to-site" | "remove-from-site" | "change-access";

export type AccessChangePlanInput = {
  action: AccessChangeAction;
  principalId?: string;
  targetSiteIds?: string[];
  sourceType?: AccessSourceType;
  roleType?: AccessRoleType;
  reason?: string;
};

export type AccessChangePlan = {
  operation: "access-change-plan";
  generatedAt: string;
  action: AccessChangeAction;
  principalId: string;
  user?: Pick<AccessDirectoryUser, "principalId" | "displayName" | "normalizedPersonalNumber" | "emails" | "aliases" | "status">;
  targetSource: AccessSourceType;
  targetRole: AccessRoleType;
  executionMode: AccessExecutionMode;
  liveWrite: boolean;
  approvalRequired: boolean;
  strongerConfirmationRequired: boolean;
  affectedSites: Array<{
    siteId: string;
    siteCode: string;
    displayName: string;
    environment: string;
    storageBackend: string;
    currentAccess: string[];
    before: string;
    after: string;
    writeCapability: AccessDirectorySite["writeCapability"];
  }>;
  willChange: string[];
  willNotChange: string[];
  blockers: string[];
  warnings: string[];
  reasonRequired: true;
  canExecute: boolean;
};

type MutableUser = AccessDirectoryUser & { statusSet: Set<AccessUserStatus>; roleSet: Set<AccessRoleType>; sourceSet: Set<AccessSourceType>; evidenceSet: Set<string>; conflictSet: Set<string> };

type SourceStatusLike = {
  source?: string;
  status?: string;
  ok?: boolean;
  count?: number;
  rawCount?: number;
  normalizedCount?: number;
  httpStatus?: number;
  httpStatusText?: string;
  sourceUrl?: string;
  readAt?: string | Date;
  errorCode?: string;
  errorMessage?: string;
  error?: string;
  warnings?: string[];
};

const PERSONAL_NUMBER_RE = /(?:^|[\\|/@\s])s?(\d{6,8})(?=$|[.@\\|\s])/i;

const unique = <T>(values: T[]) => Array.from(new Set(values.filter(Boolean)));
const asString = (value: unknown) => String(value || "").trim();
const isoDate = (value: unknown) => {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

export const normalizeAccessPersonalNumber = (value: unknown) => {
  const raw = asString(value).toLowerCase();
  if (!raw) return "";
  const direct = raw.match(/^s?(\d{6,8})$/);
  if (direct) return `s${direct[1]}`;
  const embedded = raw.match(PERSONAL_NUMBER_RE);
  return embedded ? `s${embedded[1]}` : "";
};

const derivePersonalNumber = (row: Record<string, unknown>) =>
  normalizeAccessPersonalNumber(row.personalNumber) ||
  normalizeAccessPersonalNumber(row.loginName) ||
  normalizeAccessPersonalNumber(row.email) ||
  normalizeAccessPersonalNumber(row.displayName || row.name || row.Title);

const normalizeEmail = (value: unknown) => asString(value).toLowerCase();

const normalizeIdentity = (row: Record<string, unknown>): AccessIdentity => {
  const displayName = asString(row.displayName || row.name || row.Title || row.title);
  const email = normalizeEmail(row.email || row.Email);
  const loginName = asString(row.loginName || row.LoginName).toLowerCase();
  const normalizedPersonalNumber = derivePersonalNumber({ ...row, displayName, email, loginName });
  const aliases = unique([
    normalizedPersonalNumber,
    normalizedPersonalNumber ? `${normalizedPersonalNumber}@army.idf.il` : "",
    normalizedPersonalNumber ? `i:0#.w|army\\${normalizedPersonalNumber}` : "",
    email,
    loginName
  ]);

  return {
    displayName,
    normalizedPersonalNumber,
    emails: email ? [email] : [],
    aliases
  };
};

export const normalizeAccessIdentityKey = (row: Record<string, unknown>, siteScopedFallback = "") => {
  const identity = normalizeIdentity(row);
  if (identity.normalizedPersonalNumber) return `pn:${identity.normalizedPersonalNumber}`;
  if (identity.emails[0]) return `mail:${identity.emails[0]}`;
  const loginName = identity.aliases.find((alias) => alias.includes("|") || alias.includes("\\"));
  if (loginName) return `login:${loginName}`;
  const name = identity.displayName.toLowerCase();
  return name ? `name:${siteScopedFallback}:${name}` : `unknown:${siteScopedFallback}:${Math.random().toString(36).slice(2)}`;
};

const accessLabelHe = (role: AccessRoleType) => {
  if (role === "regular-user") return "משתמש רגיל";
  if (role === "app-admin") return "מנהל אפליקציה";
  if (role === "site-owner") return "בעל אתר";
  if (role === "hub-metadata-owner") return "בעלים ב־HUB metadata";
  if (role === "hub-metadata-admin") return "מנהל ב־HUB metadata";
  if (role === "sharepoint-owners-group") return "SharePoint Owners Group";
  if (role === "sharepoint-site-collection-admin") return "SharePoint Site Collection Admin";
  return "לא ידוע";
};

const sourceAuthority = (sourceType: AccessSourceType, storageBackend: string): AccessSourceAuthority => {
  if (sourceType === "hub-metadata-owner" || sourceType === "hub-metadata-admin") return "metadata";
  if (sourceType === "sharepoint-owners-group" || sourceType === "sharepoint-site-collection-admin") return "hosting";
  if (storageBackend === "mongo" && (sourceType === "mongo-users-data" || sourceType === "builder-backend-users")) return "authoritative";
  if (storageBackend === "txt" && (sourceType === "txt-users-data" || sourceType === "txt-admins")) return "authoritative";
  return "supporting";
};

const sourceConnector = (sourceType: AccessSourceType): AccessSourceMatrixRow["connector"] => {
  if (sourceType === "hub-metadata-owner" || sourceType === "hub-metadata-admin") return "metadata-only";
  if (sourceType === "mongo-users-data" || sourceType === "builder-backend-users") return "mongo-backend";
  if (sourceType === "txt-users-data" || sourceType === "txt-admins" || sourceType.startsWith("sharepoint-")) return "browser-sharepoint";
  return "unknown";
};

const sourceStatusToReadStatus = (status?: SourceStatusLike): AccessReadStatus => {
  if (!status) return "unknown";
  if (status.ok === true || status.status === "success") return "success";
  if (status.ok === false || status.status === "failed") return "failed";
  if (status.status === "skipped") return "skipped";
  return "unknown";
};

const sourceStatusByName = (site: any, name: string): SourceStatusLike | undefined =>
  Array.isArray(site.adminSourceStatus) ? site.adminSourceStatus.find((row: SourceStatusLike) => row.source === name) : undefined;

const membershipEvidenceFromStatus = (status?: SourceStatusLike) => ({
  sourceUrl: status?.sourceUrl,
  httpStatus: status?.httpStatus,
  httpStatusText: status?.httpStatusText,
  errorCode: status?.errorCode,
  errorMessage: status?.errorMessage || status?.error,
  connectorMode: "browser-sharepoint"
});

const addUserMembership = (
  users: Map<string, MutableUser>,
  site: any,
  row: Record<string, unknown>,
  membership: Omit<AccessSiteMembership, "siteId" | "siteCode" | "displayName" | "environment" | "storageBackend">
) => {
  const siteId = String(site._id?.toString?.() || site._id || "");
  const key = normalizeAccessIdentityKey(row, siteId);
  const identity = normalizeIdentity(row);
  const existing = users.get(key);
  const nowUser: MutableUser = existing || {
    principalId: key,
    displayName: identity.displayName || identity.emails[0] || identity.normalizedPersonalNumber || "משתמש לא מזוהה",
    normalizedPersonalNumber: identity.normalizedPersonalNumber,
    emails: [],
    aliases: [],
    unitName: asString(site.unitName),
    sites: [],
    roles: [],
    sources: [],
    conflicts: [],
    lastVerifiedAt: undefined,
    status: [],
    evidenceRefs: [],
    statusSet: new Set<AccessUserStatus>(),
    roleSet: new Set<AccessRoleType>(),
    sourceSet: new Set<AccessSourceType>(),
    evidenceSet: new Set<string>(),
    conflictSet: new Set<string>()
  };

  nowUser.displayName = nowUser.displayName || identity.displayName;
  nowUser.normalizedPersonalNumber = nowUser.normalizedPersonalNumber || identity.normalizedPersonalNumber;
  nowUser.emails = unique([...nowUser.emails, ...identity.emails]);
  nowUser.aliases = unique([...nowUser.aliases, ...identity.aliases]);
  nowUser.unitName = nowUser.unitName || asString(site.unitName);
  nowUser.sites.push({
    siteId,
    siteCode: asString(site.siteCode),
    displayName: asString(site.displayName),
    environment: asString(site.environment || "unknown"),
    storageBackend: asString(site.storageBackend || "unknown"),
    ...membership
  });
  nowUser.roleSet.add(membership.roleType);
  nowUser.sourceSet.add(membership.sourceType);
  if (membership.sourceType === "hub-metadata-owner") nowUser.roleSet.add("hub-metadata-owner");
  if (membership.sourceType === "hub-metadata-admin") nowUser.roleSet.add("hub-metadata-admin");
  if (membership.readStatus === "failed") nowUser.statusSet.add("source-failed");
  if (membership.readStatus === "stale") nowUser.statusSet.add("stale");
  if (membership.readStatus === "unknown" || membership.readStatus === "skipped") nowUser.statusSet.add("not-verified");
  if (!identity.emails.length) nowUser.statusSet.add("missing-email");
  if (membership.evidence.sourceUrl || membership.evidence.errorCode) {
    nowUser.evidenceSet.add(`${membership.sourceType}:${membership.evidence.sourceUrl || membership.evidence.errorCode}`);
  }
  const lastRead = isoDate(membership.lastReadAt);
  if (lastRead && (!nowUser.lastVerifiedAt || lastRead > nowUser.lastVerifiedAt)) nowUser.lastVerifiedAt = lastRead;
  users.set(key, nowUser);
};

const rowLooksAdmin = (row: Record<string, unknown>) => {
  const role = asString(row.role || row.access || row.permission || row.type).toLowerCase();
  return Boolean(row.isAdmin || row.admin || role.includes("admin") || role.includes("owner") || role.includes("מנהל"));
};

const roleFromFullUsersRow = (row: Record<string, unknown>): AccessRoleType => rowLooksAdmin(row) ? "app-admin" : "regular-user";

const rowsFromUsersPayload = (payload: unknown): Record<string, unknown>[] => {
  const value = payload as any;
  const rows = Array.isArray(value)
    ? value
    : Array.isArray(value?.users)
      ? value.users
      : Array.isArray(value?.data?.users)
        ? value.data.users
        : Array.isArray(value?.admins)
          ? value.admins
          : [];
  return rows.filter((row: unknown): row is Record<string, unknown> => Boolean(row && typeof row === "object"));
};

const batchReadResults = (site: any) => {
  const payload = site.mongoBackendStatus?.evidence?.checks?.seedBatch?.payload;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data?.results)) return payload.data.results;
  return [];
};

const extractMongoUsersRows = (site: any) => {
  const directSources = [site.users, site.appUsers, site.usersData, site.mongoUsers, site.builderUsers].flatMap(rowsFromUsersPayload);
  const seedUsersResult = batchReadResults(site).find((row: any) => String(row?.key || "") === "users_data.txt");
  const seedRows = rowsFromUsersPayload(seedUsersResult?.data || seedUsersResult?.value || seedUsersResult?.payload);
  return unique([...directSources, ...seedRows]);
};

const buildSourceRow = (
  site: any,
  sourceType: AccessSourceType,
  status: AccessReadStatus,
  count: number | undefined,
  details: Partial<AccessSourceMatrixRow> = {}
): AccessSourceMatrixRow => ({
  id: `${site._id?.toString?.() || site._id}:${sourceType}`,
  siteId: String(site._id?.toString?.() || site._id || ""),
  siteCode: asString(site.siteCode),
  siteName: asString(site.displayName),
  environment: asString(site.environment || "unknown"),
  storageBackend: asString(site.storageBackend || "unknown"),
  sourceType,
  status,
  count,
  connector: details.connector || sourceConnector(sourceType),
  coverage: details.coverage || "admin-only",
  authority: details.authority || sourceAuthority(sourceType, asString(site.storageBackend || "unknown")),
  lastReadAt: details.lastReadAt,
  error: details.error,
  blocker: details.blocker,
  httpStatus: details.httpStatus,
  sourceUrl: details.sourceUrl
});

const addSourceMatrixRows = (site: any, sourceMatrix: AccessSourceMatrixRow[]) => {
  const txtStatus = sourceStatusByName(site, "txt");
  const scStatus = sourceStatusByName(site, "siteCollection");
  const ownersStatus = sourceStatusByName(site, "ownersGroup");
  const mongoStatus = asString(site.mongoBackendStatus?.adminsStatus || "");
  const mongoCheckedAt = isoDate(site.mongoBackendStatus?.checkedAt);
  const ownerExists = Boolean(asString(site.ownerName) || asString(site.ownerPersonalNumber) || asString(site.ownerEmail));

  if (ownerExists) {
    sourceMatrix.push(buildSourceRow(site, "hub-metadata-owner", "success", 1, {
      connector: "metadata-only",
      coverage: "metadata-only",
      authority: "metadata",
      lastReadAt: isoDate(site.updatedAt)
    }));
  }

  sourceMatrix.push(buildSourceRow(site, "txt-users-data", sourceStatusToReadStatus(txtStatus), txtStatus?.ok ? txtStatus.count ?? txtStatus.normalizedCount : undefined, {
    coverage: txtStatus?.ok ? "full-users" : "unavailable",
    lastReadAt: isoDate(txtStatus?.readAt || site.lastAdminLiveReadAt || site.lastAdminSyncAt),
    error: txtStatus?.errorMessage || txtStatus?.error,
    blocker: sourceStatusToReadStatus(txtStatus) === "failed" ? "קריאת users_data.txt נכשלה; אין לספור זאת כאפס משתמשים." : undefined,
    httpStatus: txtStatus?.httpStatus,
    sourceUrl: txtStatus?.sourceUrl
  }));

  if (asString(site.storageBackend) === "mongo" || mongoStatus) {
    sourceMatrix.push(buildSourceRow(site, "mongo-users-data", mongoStatus === "ok" ? "success" : mongoStatus === "error" ? "failed" : mongoStatus === "missing" ? "failed" : "unknown", undefined, {
      connector: "mongo-backend",
      coverage: mongoStatus === "ok" ? "full-users" : "unavailable",
      authority: asString(site.storageBackend) === "mongo" ? "authoritative" : "supporting",
      lastReadAt: mongoCheckedAt,
      error: mongoStatus && mongoStatus !== "ok" ? `Mongo users_data status: ${mongoStatus}` : undefined,
      blocker: mongoStatus && mongoStatus !== "ok" ? "מקור משתמשי Mongo לא זמין או לא אומת." : undefined
    }));
  }

  sourceMatrix.push(buildSourceRow(site, "sharepoint-site-collection-admin", sourceStatusToReadStatus(scStatus), scStatus?.ok ? scStatus.count ?? scStatus.normalizedCount : undefined, {
    coverage: "admin-only",
    authority: "hosting",
    lastReadAt: isoDate(scStatus?.readAt || site.lastAdminLiveReadAt || site.lastAdminSyncAt),
    error: scStatus?.errorMessage || scStatus?.error,
    blocker: sourceStatusToReadStatus(scStatus) === "failed" ? "קריאת Site Collection Admins נכשלה." : undefined,
    httpStatus: scStatus?.httpStatus,
    sourceUrl: scStatus?.sourceUrl
  }));

  sourceMatrix.push(buildSourceRow(site, "sharepoint-owners-group", sourceStatusToReadStatus(ownersStatus), ownersStatus?.ok ? ownersStatus.count ?? ownersStatus.normalizedCount : undefined, {
    coverage: "admin-only",
    authority: "hosting",
    lastReadAt: isoDate(ownersStatus?.readAt || site.lastAdminLiveReadAt || site.lastAdminSyncAt),
    error: ownersStatus?.errorMessage || ownersStatus?.error,
    blocker: sourceStatusToReadStatus(ownersStatus) === "failed" ? "קריאת Owners Group נכשלה." : undefined,
    httpStatus: ownersStatus?.httpStatus,
    sourceUrl: ownersStatus?.sourceUrl
  }));
};

const sourceHealthForSite = (site: any): AccessReadStatus => {
  const statuses = Array.isArray(site.adminSourceStatus) ? site.adminSourceStatus.map(sourceStatusToReadStatus) : [];
  if (statuses.includes("failed")) return "failed";
  if (statuses.includes("success")) return "success";
  if (site.mongoBackendStatus?.adminsStatus === "ok") return "success";
  if (site.mongoBackendStatus?.adminsStatus === "missing" || site.mongoBackendStatus?.adminsStatus === "error") return "failed";
  return "unknown";
};

export function buildAccessDirectoryFromSites(rawSites: any[], generatedAt = new Date().toISOString()): AccessDirectory {
  const sites = rawSites.map((site) => ({
    ...site,
    _id: site._id?.toString?.() || site._id
  }));
  const users = new Map<string, MutableUser>();
  const sourceMatrix: AccessSourceMatrixRow[] = [];

  for (const site of sites) {
    addSourceMatrixRows(site, sourceMatrix);
    const siteId = String(site._id || "");
    const storageBackend = asString(site.storageBackend || "unknown");
    const ownerIdentity = {
      displayName: site.ownerName,
      personalNumber: site.ownerPersonalNumber,
      email: site.ownerEmail
    };
    if (asString(ownerIdentity.displayName) || asString(ownerIdentity.personalNumber) || asString(ownerIdentity.email)) {
      addUserMembership(users, site, ownerIdentity, {
        roleType: "site-owner",
        sourceType: "hub-metadata-owner",
        sourceAuthority: "metadata",
        effectiveAccess: "site-owner-metadata",
        readStatus: "success",
        lastReadAt: isoDate(site.updatedAt),
        evidence: { connectorMode: "metadata-only", coverage: "metadata-only" },
        warnings: ["זהו מקור metadata של ה־HUB, לא הוכחת הרשאה חיה ב־SharePoint."],
        blockers: []
      });
    }

    const txtStatus = sourceStatusByName(site, "txt");
    const txtReadStatus = sourceStatusToReadStatus(txtStatus);
    for (const row of Array.isArray(site.txtAdmins) ? site.txtAdmins : []) {
      addUserMembership(users, site, row, {
        roleType: "app-admin",
        sourceType: storageBackend === "txt" ? "txt-users-data" : "txt-admins",
        sourceAuthority: sourceAuthority(storageBackend === "txt" ? "txt-users-data" : "txt-admins", storageBackend),
        effectiveAccess: "app-admin",
        readStatus: txtReadStatus === "failed" ? "stale" : txtReadStatus,
        lastReadAt: isoDate(txtStatus?.readAt || site.lastAdminLiveReadAt || site.lastAdminSyncAt),
        evidence: { ...membershipEvidenceFromStatus(txtStatus), coverage: txtStatus?.ok ? "full-users" : "admin-only" },
        warnings: txtReadStatus === "failed" ? ["המקור האחרון נכשל; הרשומה מוצגת מתוך snapshot קודם."] : [],
        blockers: txtReadStatus === "failed" ? ["קריאת TXT נכשלה ולכן אי אפשר לאמת את הרשומה כרגע."] : []
      });
    }

    for (const row of extractMongoUsersRows(site)) {
      const roleType = roleFromFullUsersRow(row);
      addUserMembership(users, site, row, {
        roleType,
        sourceType: "mongo-users-data",
        sourceAuthority: sourceAuthority("mongo-users-data", storageBackend),
        effectiveAccess: roleType === "app-admin" ? "app-admin" : "app-user",
        readStatus: site.mongoBackendStatus?.adminsStatus === "ok" ? "success" : "unknown",
        lastReadAt: isoDate(site.mongoBackendStatus?.checkedAt || site.lastMongoHealthCheckAt),
        evidence: { connectorMode: "mongo-backend", coverage: "full-users" },
        warnings: storageBackend === "mongo" ? [] : ["מקור Mongo מופיע באתר שאינו מוגדר כ־Mongo ב־HUB."],
        blockers: []
      });
    }

    const scStatus = sourceStatusByName(site, "siteCollection");
    const scReadStatus = sourceStatusToReadStatus(scStatus);
    for (const row of Array.isArray(site.siteCollectionAdmins) ? site.siteCollectionAdmins : []) {
      addUserMembership(users, site, row, {
        roleType: "sharepoint-site-collection-admin",
        sourceType: "sharepoint-site-collection-admin",
        sourceAuthority: "hosting",
        effectiveAccess: "hosting-admin",
        readStatus: scReadStatus === "failed" ? "stale" : scReadStatus,
        lastReadAt: isoDate(scStatus?.readAt || site.lastAdminLiveReadAt || site.lastAdminSyncAt),
        evidence: { ...membershipEvidenceFromStatus(scStatus), coverage: "admin-only" },
        warnings: storageBackend === "mongo" ? ["זהו מקור אירוח SharePoint, לא מקור אמת למנהל אפליקציה באתר Mongo."] : [],
        blockers: scReadStatus === "failed" ? ["קריאת Site Collection Admins נכשלה ולכן הרשומה לא אומתה."] : []
      });
    }

    const ownersStatus = sourceStatusByName(site, "ownersGroup");
    const ownersReadStatus = sourceStatusToReadStatus(ownersStatus);
    for (const row of Array.isArray(site.ownersGroupAdmins) ? site.ownersGroupAdmins : []) {
      addUserMembership(users, site, row, {
        roleType: "sharepoint-owners-group",
        sourceType: "sharepoint-owners-group",
        sourceAuthority: "hosting",
        effectiveAccess: "hosting-owner",
        readStatus: ownersReadStatus === "failed" ? "stale" : ownersReadStatus,
        lastReadAt: isoDate(ownersStatus?.readAt || site.lastAdminLiveReadAt || site.lastAdminSyncAt),
        evidence: { ...membershipEvidenceFromStatus(ownersStatus), coverage: "admin-only" },
        warnings: storageBackend === "mongo" ? ["Owners Group הוא מקור אירוח SharePoint, לא הוכחת מנהל אפליקציה באתר Mongo."] : [],
        blockers: ownersReadStatus === "failed" ? ["קריאת Owners Group נכשלה ולכן הרשומה לא אומתה."] : []
      });
    }

    const driftKeys = unique([
      ...(site.adminDifferences?.missingInTxt || []),
      ...(site.adminDifferences?.missingInSiteCollection || []),
      ...(site.adminDifferences?.missingInOwnersGroup || [])
    ]).map((value) => String(value).toLowerCase());
    if (driftKeys.length) {
      for (const user of users.values()) {
        if (!user.sites.some((membership) => membership.siteId === siteId)) continue;
        const aliases = new Set([
          ...user.aliases.map((alias) => alias.toLowerCase()),
          user.normalizedPersonalNumber ? `pn:${user.normalizedPersonalNumber}` : "",
          user.emails[0] ? `mail:${user.emails[0]}` : ""
        ].filter(Boolean));
        if (driftKeys.some((key) => aliases.has(key))) {
          user.statusSet.add("conflict");
          user.conflictSet.add(`פער הרשאה באתר ${site.siteCode}`);
        }
      }
    }
  }

  const duplicateIndex = new Map<string, MutableUser[]>();
  for (const user of users.values()) {
    for (const email of user.emails) {
      const key = `mail:${email}`;
      duplicateIndex.set(key, [...(duplicateIndex.get(key) || []), user]);
    }
  }
  for (const duplicates of duplicateIndex.values()) {
    const personalNumbers = new Set(duplicates.map((user) => user.normalizedPersonalNumber).filter(Boolean));
    if (duplicates.length > 1 && personalNumbers.size > 1) {
      duplicates.forEach((user) => user.statusSet.add("duplicate-identity"));
    }
  }

  const normalizedUsers = Array.from(users.values()).map((user) => {
    if (!user.statusSet.size) user.statusSet.add("healthy");
    user.roles = Array.from(user.roleSet);
    user.sources = Array.from(user.sourceSet);
    user.status = Array.from(user.statusSet);
    user.conflicts = Array.from(user.conflictSet);
    user.evidenceRefs = Array.from(user.evidenceSet);
    delete (user as Partial<MutableUser>).statusSet;
    delete (user as Partial<MutableUser>).roleSet;
    delete (user as Partial<MutableUser>).sourceSet;
    delete (user as Partial<MutableUser>).evidenceSet;
    delete (user as Partial<MutableUser>).conflictSet;
    return user as AccessDirectoryUser;
  }).sort((a, b) => a.displayName.localeCompare(b.displayName, "he"));

  const directorySites: AccessDirectorySite[] = sites.map((site) => ({
    siteId: String(site._id || ""),
    siteCode: asString(site.siteCode),
    displayName: asString(site.displayName),
    environment: asString(site.environment || "unknown"),
    storageBackend: asString(site.storageBackend || "unknown"),
    status: asString(site.status || "unknown"),
    lifecycleStatus: asString(site.lifecycleStatus || ""),
    archived: site.status === "archived" || site.lifecycleStatus === "archived",
    sourceHealth: sourceHealthForSite(site),
    writeCapability: "plan-only"
  }));

  const successfulReads = sourceMatrix
    .filter((source) => source.status === "success" && source.lastReadAt && source.connector !== "metadata-only")
    .map((source) => source.lastReadAt!)
    .sort();
  const failedOrStaleSources = sourceMatrix.filter((source) => source.status === "failed" || source.status === "stale").length;
  const connectorMode = sourceMatrix.some((source) => source.httpStatus === 401 || source.httpStatus === 403)
    ? "backend-service-auth-required"
    : sourceMatrix.some((source) => source.connector === "browser-sharepoint" && source.status === "success")
      ? "browser-sharepoint"
      : sourceMatrix.some((source) => source.connector === "mongo-backend" && source.status === "success")
        ? "mongo-backend"
        : "metadata-only";
  const connectorModeLabelHe = connectorMode === "browser-sharepoint"
    ? "Browser SharePoint"
    : connectorMode === "mongo-backend"
      ? "Mongo Backend"
      : connectorMode === "backend-service-auth-required"
        ? "נדרשת הרשאת שרת"
        : "Metadata בלבד";

  const summary: AccessDirectorySummary = {
    totalUsers: normalizedUsers.length,
    totalAppAdmins: normalizedUsers.filter((user) => user.roles.includes("app-admin") || user.roles.includes("hub-metadata-admin")).length,
    totalSiteOwners: normalizedUsers.filter((user) => user.roles.includes("site-owner") || user.roles.includes("sharepoint-owners-group")).length,
    usersWithConflicts: normalizedUsers.filter((user) => user.status.includes("conflict")).length,
    failedOrStaleSources,
    lastSuccessfulLiveRead: successfulReads.at(-1),
    connectorMode,
    connectorModeLabelHe,
    generatedAt
  };

  const issues = [
    failedOrStaleSources ? {
      severity: "danger" as const,
      titleHe: "יש מקורות שנכשלו או התיישנו",
      detailHe: `${failedOrStaleSources} מקורות אינם מאומתים כרגע. כשל אינו נספר כאפס משתמשים.`,
      actionHe: "פתחו את מקורות הרשאה ורעננו דרך חיבור הדפדפן."
    } : null,
    summary.usersWithConflicts ? {
      severity: "warning" as const,
      titleHe: "זוהו פערי הרשאה",
      detailHe: `${summary.usersWithConflicts} משתמשים מופיעים בפער בין מקור אפליקטיבי למקור אירוח.`,
      actionHe: "עברו ללשונית פערים וסנכרון ובחנו את הראיות לפני שינוי."
    } : null,
    !normalizedUsers.length ? {
      severity: "info" as const,
      titleHe: "אין משתמשים זמינים להצגה",
      detailHe: "לא נקראו מקורות משתמשים מלאים או snapshots של מנהלים.",
      actionHe: "הריצו קריאת Browser SharePoint או בדיקת Mongo Backend."
    } : null
  ].filter(Boolean) as AccessDirectory["issues"];

  return { generatedAt, summary, users: normalizedUsers, sites: directorySites, sourceMatrix, issues };
}

export async function getAccessDirectory() {
  logger.info("admins", "Building access directory");
  const sites = await Site.find({}).sort({ displayName: 1, siteCode: 1 }).lean();
  return buildAccessDirectoryFromSites(sites);
}

export async function getAccessUser(principalId: string) {
  const directory = await getAccessDirectory();
  return directory.users.find((user) => user.principalId === principalId) || null;
}

export async function getAccessUserSites(principalId: string) {
  const user = await getAccessUser(principalId);
  return user?.sites || [];
}

const executionModeForSource = (sourceType: AccessSourceType): AccessExecutionMode => {
  if (sourceType === "mongo-users-data" || sourceType === "builder-backend-users") return "mongo-backend";
  if (sourceType === "hub-metadata-owner" || sourceType === "hub-metadata-admin") return "metadata-only";
  if (sourceType === "txt-users-data" || sourceType === "txt-admins") return "browser-sharepoint";
  if (sourceType === "sharepoint-owners-group" || sourceType === "sharepoint-site-collection-admin") return "browser-sharepoint";
  return "manual";
};

export async function planAccessChange(input: AccessChangePlanInput): Promise<AccessChangePlan> {
  const directory = await getAccessDirectory();
  const action = input.action || "add-to-site";
  const principalId = asString(input.principalId);
  const user = directory.users.find((item) => item.principalId === principalId);
  const targetSource = input.sourceType || "unknown";
  const targetRole = input.roleType || (targetSource.includes("sharepoint") ? "sharepoint-owners-group" : "regular-user");
  const executionMode = executionModeForSource(targetSource);
  const targetIds = (input.targetSiteIds || []).filter(Boolean);
  const affectedSites = directory.sites
    .filter((site) => targetIds.includes(site.siteId))
    .map((site) => {
      const currentAccess = (user?.sites || [])
        .filter((membership) => membership.siteId === site.siteId)
        .map((membership) => `${accessLabelHe(membership.roleType)} · ${membership.sourceType}`);
      const roleLabel = accessLabelHe(targetRole);
      return {
        siteId: site.siteId,
        siteCode: site.siteCode,
        displayName: site.displayName,
        environment: site.environment,
        storageBackend: site.storageBackend,
        currentAccess,
        before: currentAccess.length ? currentAccess.join(", ") : "אין גישה ידועה במקורות שנקראו",
        after: action === "remove-from-site" ? `הסרת ${roleLabel} מתוך ${targetSource}` : `${roleLabel} דרך ${targetSource}`,
        writeCapability: site.writeCapability
      };
    });
  const blockers = [
    !principalId ? "לא נבחר משתמש." : "",
    !user ? "המשתמש לא נמצא ב־Access Directory הנוכחי." : "",
    !affectedSites.length ? "לא נבחרו אתרי יעד." : "",
    targetSource === "unknown" ? "לא נבחר מקור הרשאה יעד." : "",
    executionMode === "browser-sharepoint" ? "כתיבת הרשאות דרך Browser SharePoint עדיין לא ממומשת במסך זה." : "",
    executionMode === "mongo-backend" ? "כתיבת משתמשים ל־Builder backend/Mongo עדיין לא ממומשת במסך זה." : "",
    executionMode === "metadata-only" ? "עדכון metadata מתוך Access Governance עדיין תוכנית בלבד כדי לא לשנות בעלים בטעות." : ""
  ].filter(Boolean);
  const warnings = [
    affectedSites.some((site) => site.environment === "production") ? "הפעולה נוגעת באתר ייצור ולכן דורשת אישור חזק יותר." : "",
    targetSource.startsWith("sharepoint") ? "מקור SharePoint הוא מקור אירוח; שינוי בו לא בהכרח משנה הרשאת אפליקציה." : "",
    action === "remove-from-site" ? "הסרה ממקור אחד לא מבטיחה הסרת גישה אפקטיבית אם מקור אחר עדיין מעניק הרשאה." : ""
  ].filter(Boolean);
  const willChange = affectedSites.map((site) => `${site.displayName}: ${site.after}`);
  const willNotChange = [
    "לא תתבצע כתיבה ללא נימוק ואישור מוגן.",
    "לא תתבצע קריאת SharePoint דרך Backend כתחליף לחיבור הדפדפן.",
    targetSource.startsWith("sharepoint") ? "מקורות Mongo/TXT לא ישתנו אוטומטית." : "מקורות SharePoint לא ישתנו אוטומטית."
  ];

  return {
    operation: "access-change-plan",
    generatedAt: new Date().toISOString(),
    action,
    principalId,
    user: user ? {
      principalId: user.principalId,
      displayName: user.displayName,
      normalizedPersonalNumber: user.normalizedPersonalNumber,
      emails: user.emails,
      aliases: user.aliases,
      status: user.status
    } : undefined,
    targetSource,
    targetRole,
    executionMode,
    liveWrite: false,
    approvalRequired: true,
    strongerConfirmationRequired: affectedSites.some((site) => site.environment === "production") || affectedSites.length > 1,
    affectedSites,
    willChange,
    willNotChange,
    blockers,
    warnings,
    reasonRequired: true,
    canExecute: false
  };
}

export async function executeAccessChange(input: AccessChangePlanInput & { reason?: string }) {
  const plan = await planAccessChange(input);
  return {
    plan,
    executed: false,
    message: "הפעולה חסומה: אין מימוש כתיבה מאומת עבור מקור היעד, ולכן לא בוצע שינוי."
  };
}
