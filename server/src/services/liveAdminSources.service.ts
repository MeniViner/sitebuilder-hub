import { Site } from "../models/Site";
import { SiteAdminSnapshot } from "../models/SiteAdminSnapshot";
import { logger } from "../utils/logger";
import { resolveSiteBuilderPaths } from "../utils/sitebuilderPaths";
import { AdminIdentity, buildAdminDiff, normalizeAdminKey } from "./admins.service";
import { readSharePointJsonApi, readSharePointTextFile } from "./sharepointOperationClient";

type SourceStatus = {
  source: "txt" | "siteCollection" | "ownersGroup";
  ok: boolean;
  count: number;
  error?: string;
};

export type LiveAdminSourcesResult = {
  siteId: string;
  siteCode: string;
  capturedAt: string;
  txtAdmins: AdminIdentity[];
  siteCollectionAdmins: AdminIdentity[];
  ownersGroupAdmins: AdminIdentity[];
  adminDifferences: ReturnType<typeof buildAdminDiff>;
  adminsCount: number;
  sourceStatus: SourceStatus[];
};

const extractResults = (payload: any) => {
  if (Array.isArray(payload?.d?.results)) return payload.d.results;
  if (Array.isArray(payload?.value)) return payload.value;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
};

const derivePersonalNumber = (...values: Array<unknown>) => {
  for (const value of values) {
    const text = String(value || "").toLowerCase();
    const match = text.match(/(?:^|[^a-z0-9])s?(\d{6,8})(?:@|[^a-z0-9]|$)/i);
    if (match?.[1]) return `s${match[1]}`;
  }
  return "";
};

const normalizeAdmin = (row: any): AdminIdentity => {
  const displayName = String(row.displayName || row.name || row.Title || row.title || "").trim();
  const email = String(row.email || row.Email || "").trim();
  const loginName = String(row.loginName || row.LoginName || "").trim();
  const personalNumber = String(row.personalNumber || row.PersonalNumber || "").trim() || derivePersonalNumber(loginName, email, displayName);

  return { displayName, personalNumber, email, loginName };
};

const dedupeAdmins = (admins: AdminIdentity[]) => {
  const seen = new Set<string>();
  const result: AdminIdentity[] = [];

  for (const admin of admins.map(normalizeAdmin)) {
    const key = normalizeAdminKey(admin);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(admin);
  }

  return result;
};

const safeReadTxtAdmins = async (paths: ReturnType<typeof resolveSiteBuilderPaths>) => {
  const file = await readSharePointTextFile(paths, paths.txtFiles.users);
  const parsed = JSON.parse(file.text || "[]");
  const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.users) ? parsed.users : [];
  return dedupeAdmins(rows);
};

const safeReadSiteCollectionAdmins = async (paths: ReturnType<typeof resolveSiteBuilderPaths>) => {
  const payload = await readSharePointJsonApi(
    paths,
    "/_api/web/siteusers?$select=Id,Title,Email,LoginName,IsSiteAdmin&$filter=IsSiteAdmin eq true"
  );
  return dedupeAdmins(extractResults(payload));
};

const safeReadOwnersGroupAdmins = async (paths: ReturnType<typeof resolveSiteBuilderPaths>) => {
  const groupPayload = await readSharePointJsonApi(paths, "/_api/web/associatedownergroup");
  const group = groupPayload?.d || groupPayload;
  const groupId = Number(group?.Id || group?.id);
  if (!groupId) throw new Error("owners-group-id-missing");

  const usersPayload = await readSharePointJsonApi(
    paths,
    `/_api/web/sitegroups(${groupId})/users?$select=Id,Title,Email,LoginName,IsSiteAdmin,PrincipalType`
  );
  return dedupeAdmins(extractResults(usersPayload));
};

export async function readLiveAdminSources(siteId: string, options: { persist?: boolean; jobId?: string; capturedBy?: string } = {}): Promise<LiveAdminSourcesResult> {
  logger.info("admins", "Live admin source read started", {
    siteId,
    persist: Boolean(options.persist),
    jobId: options.jobId,
    capturedBy: options.capturedBy
  });

  const site = await Site.findById(siteId);
  if (!site) throw new Error("site-not-found");

  const paths = resolveSiteBuilderPaths({
    siteCode: site.siteCode,
    sharePointHost: site.sharePointHost,
    sharePointSiteUrl: site.sharePointSiteUrl,
    siteDbLibrary: site.siteDbLibrary,
    usersDbLibrary: site.usersDbLibrary,
    bootstrapLibrary: site.bootstrapLibrary,
    bootstrapFolder: site.bootstrapFolder,
    widgetsDbTarget: site.widgetsDbTarget
  });

  const sourceStatus: SourceStatus[] = [];
  let txtAdmins: AdminIdentity[] = [];
  let siteCollectionAdmins: AdminIdentity[] = [];
  let ownersGroupAdmins: AdminIdentity[] = [];

  try {
    logger.debug("admins", "Reading TXT admin source", { siteId, siteCode: site.siteCode, path: paths.txtFiles.users });
    txtAdmins = await safeReadTxtAdmins(paths);
    sourceStatus.push({ source: "txt", ok: true, count: txtAdmins.length });
    logger.info("admins", "TXT admin source read completed", { siteId, siteCode: site.siteCode, count: txtAdmins.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sourceStatus.push({ source: "txt", ok: false, count: 0, error: message });
    logger.warn("admins", "TXT admin source read failed", { siteId, siteCode: site.siteCode, error: message });
  }

  try {
    logger.debug("admins", "Reading Site Collection admin source", { siteId, siteCode: site.siteCode, siteRoot: paths.siteRoot });
    siteCollectionAdmins = await safeReadSiteCollectionAdmins(paths);
    sourceStatus.push({ source: "siteCollection", ok: true, count: siteCollectionAdmins.length });
    logger.info("admins", "Site Collection admin source read completed", { siteId, siteCode: site.siteCode, count: siteCollectionAdmins.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sourceStatus.push({ source: "siteCollection", ok: false, count: 0, error: message });
    logger.warn("admins", "Site Collection admin source read failed", { siteId, siteCode: site.siteCode, error: message });
  }

  try {
    logger.debug("admins", "Reading Owners Group admin source", { siteId, siteCode: site.siteCode, siteRoot: paths.siteRoot });
    ownersGroupAdmins = await safeReadOwnersGroupAdmins(paths);
    sourceStatus.push({ source: "ownersGroup", ok: true, count: ownersGroupAdmins.length });
    logger.info("admins", "Owners Group admin source read completed", { siteId, siteCode: site.siteCode, count: ownersGroupAdmins.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sourceStatus.push({ source: "ownersGroup", ok: false, count: 0, error: message });
    logger.warn("admins", "Owners Group admin source read failed", { siteId, siteCode: site.siteCode, error: message });
  }

  const adminDifferences = buildAdminDiff(txtAdmins, siteCollectionAdmins, ownersGroupAdmins);
  const adminsCount = new Set([...txtAdmins, ...siteCollectionAdmins, ...ownersGroupAdmins].map(normalizeAdminKey)).size;
  logger.info("admins", "Live admin source diff built", {
    siteId,
    siteCode: site.siteCode,
    adminsCount,
    sourceStatus,
    missingInTxt: adminDifferences.missingInTxt.length,
    missingInSiteCollection: adminDifferences.missingInSiteCollection.length,
    missingInOwnersGroup: adminDifferences.missingInOwnersGroup.length
  });

  if (options.persist) {
    logger.info("admins", "Persisting live admin source snapshot", {
      siteId,
      siteCode: site.siteCode,
      jobId: options.jobId,
      syncStatus: sourceStatus.every((source) => source.ok) ? "succeeded" : "failed"
    });
    site.txtAdmins = txtAdmins as any;
    site.siteCollectionAdmins = siteCollectionAdmins as any;
    site.ownersGroupAdmins = ownersGroupAdmins as any;
    site.adminDifferences = adminDifferences as any;
    site.adminsCount = adminsCount;
    site.lastAdminSyncAt = new Date();
    site.adminSyncStatus = sourceStatus.every((source) => source.ok) ? "succeeded" : "failed";
    site.lastError = sourceStatus.find((source) => !source.ok)?.error || "";
    await site.save();

    await SiteAdminSnapshot.create({
      siteId: site._id,
      jobId: options.jobId,
      capturedBy: options.capturedBy || "system",
      txtAdmins,
      siteCollectionAdmins,
      ownersGroupAdmins,
      syncStatus: sourceStatus.every((source) => source.ok) ? "succeeded" : "failed",
      syncError: sourceStatus.filter((source) => !source.ok).map((source) => `${source.source}: ${source.error}`).join("; "),
      adminDifferences
    });
    logger.info("admins", "Live admin source snapshot persisted", {
      siteId,
      siteCode: site.siteCode,
      jobId: options.jobId,
      adminsCount
    });
  }

  logger.info("admins", "Live admin source read completed", {
    siteId,
    siteCode: site.siteCode,
    adminsCount,
    failedSources: sourceStatus.filter((source) => !source.ok).length
  });

  return {
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    capturedAt: new Date().toISOString(),
    txtAdmins,
    siteCollectionAdmins,
    ownersGroupAdmins,
    adminDifferences,
    adminsCount,
    sourceStatus
  };
}
