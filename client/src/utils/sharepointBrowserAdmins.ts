import type { LiveAdminSourcesResult } from "../api/sitesApi";
import type { Site } from "../types/site";
import { derivePersonalNumberFromSharePointIdentity } from "./personalNumber";
import { resolveSiteBuilderPaths } from "./sitebuilderPaths";

type AdminIdentity = {
  displayName?: string;
  personalNumber?: string;
  email?: string;
  loginName?: string;
};

type SourceName = "txt" | "siteCollection" | "ownersGroup";

type SourceStatus = LiveAdminSourcesResult["sourceStatus"][number];

type ResolvedPaths = NonNullable<ReturnType<typeof resolveSiteBuilderPaths>>;

const ODATA_ACCEPT = "application/json;odata=verbose";

const trimSlash = (value: string) => value.replace(/\/+$/g, "");
const encodeSpaces = (value: string) => value.replace(/ /g, "%20");

const extractResults = (payload: any) => {
  if (Array.isArray(payload?.d?.results)) return payload.d.results;
  if (Array.isArray(payload?.value)) return payload.value;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
};

const normalizeAdmin = (row: any): AdminIdentity => {
  const displayName = String(row.displayName || row.name || row.Title || row.title || "").trim();
  const email = String(row.email || row.Email || "").trim();
  const loginName = String(row.loginName || row.LoginName || "").trim();
  const personalNumber =
    String(row.personalNumber || row.PersonalNumber || "").trim() ||
    derivePersonalNumberFromSharePointIdentity(loginName, email, displayName);

  return { displayName, personalNumber, email, loginName };
};

const normalizeAdminKey = (admin: AdminIdentity) => {
  const login = String(admin.loginName || "").trim().toLowerCase();
  if (login) return `login:${login}`;
  const pn = String(admin.personalNumber || "").trim().toLowerCase();
  if (pn) return `pn:${pn}`;
  const email = String(admin.email || "").trim().toLowerCase();
  if (email) return `mail:${email}`;
  const name = String(admin.displayName || "").trim().toLowerCase();
  return `name:${name}`;
};

const dedupeAdmins = (rows: any[]) => {
  const seen = new Set<string>();
  const result: AdminIdentity[] = [];

  for (const row of rows.map(normalizeAdmin)) {
    const key = normalizeAdminKey(row);
    if (!key || key === "name:") continue;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(row);
  }

  return result;
};

const buildAdminDiff = (txt: AdminIdentity[], siteCollection: AdminIdentity[], owners: AdminIdentity[]) => {
  const txtSet = new Set(txt.map(normalizeAdminKey));
  const siteSet = new Set(siteCollection.map(normalizeAdminKey));
  const ownersSet = new Set(owners.map(normalizeAdminKey));

  return {
    missingInTxt: [...new Set([...siteSet, ...ownersSet])].filter((key) => !txtSet.has(key)),
    missingInSiteCollection: [...new Set([...txtSet, ...ownersSet])].filter((key) => !siteSet.has(key)),
    missingInOwnersGroup: [...new Set([...txtSet, ...siteSet])].filter((key) => !ownersSet.has(key))
  };
};

const mapFetchError = (error: unknown, url: string) => {
  const message = error instanceof Error ? error.message : String(error);
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return [
      "הדפדפן לא הצליח לקרוא מ-SharePoint.",
      "אם ה-Hub רץ מ-localhost, ייתכן שמדובר בחסימת CORS.",
      "הקריאה הזו עובדת כשה-Hub נטען מתוך אותו SharePoint origin או כאשר SharePoint מאפשר CORS.",
      `URL: ${url}`
    ].join(" ");
  }
  return `${message} (${url})`;
};

const fetchJson = async (url: string) => {
  const encodedUrl = encodeSpaces(url);
  let response: Response;
  try {
    response = await fetch(encodedUrl, {
      method: "GET",
      credentials: "include",
      headers: { Accept: ODATA_ACCEPT }
    });
  } catch (error) {
    throw new Error(mapFetchError(error, encodedUrl));
  }

  if (!response.ok) {
    throw new Error(`SharePoint request failed: ${response.status} ${response.statusText} (${encodedUrl})`);
  }

  return response.json();
};

const fetchText = async (url: string) => {
  const encodedUrl = encodeSpaces(url);
  let response: Response;
  try {
    response = await fetch(encodedUrl, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "text/plain, application/json, */*" }
    });
  } catch (error) {
    throw new Error(mapFetchError(error, encodedUrl));
  }

  if (!response.ok) {
    throw new Error(`SharePoint text read failed: ${response.status} ${response.statusText} (${encodedUrl})`);
  }

  return response.text();
};

const resolvePathsForSite = (site: Site): ResolvedPaths => {
  const generated = resolveSiteBuilderPaths({
    siteCode: site.siteCode,
    sharePointHost: site.sharePointHost,
    sharePointSiteUrl: site.sharePointSiteUrl,
    siteDbLibrary: site.siteDbLibrary,
    usersDbLibrary: site.usersDbLibrary,
    bootstrapLibrary: site.bootstrapLibrary,
    bootstrapFolder: site.bootstrapFolder,
    widgetsDbTarget: site.widgetsDbTarget
  });

  if (!generated) throw new Error("לא ניתן לחשב נתיבי SharePoint לאתר הנבחר");

  const stored = site.resolvedPaths || {};
  return {
    ...generated,
    ...stored,
    host: stored.host || generated.host,
    siteRoot: stored.siteRoot || generated.siteRoot,
    sharePointSiteUrl: stored.sharePointSiteUrl || site.sharePointSiteUrl || generated.sharePointSiteUrl,
    txtFiles: {
      ...generated.txtFiles,
      ...(stored.txtFiles || {})
    }
  };
};

const getWebUrl = (paths: ResolvedPaths) => trimSlash(paths.sharePointSiteUrl || `https://${paths.host}${paths.siteRoot}`);
const absoluteFileUrl = (paths: ResolvedPaths, serverRelativePath: string) => `https://${paths.host}${serverRelativePath}`;

const readTxtAdmins = async (paths: ResolvedPaths) => {
  const text = await fetchText(absoluteFileUrl(paths, paths.txtFiles.users));
  const parsed = JSON.parse(text || "[]");
  const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.users) ? parsed.users : [];
  return dedupeAdmins(rows);
};

const readSiteCollectionAdmins = async (webUrl: string) => {
  const payload = await fetchJson(
    `${webUrl}/_api/web/siteusers?$select=Id,Title,Email,LoginName,IsSiteAdmin,PrincipalType&$filter=IsSiteAdmin eq true`
  );
  return dedupeAdmins(extractResults(payload));
};

const readOwnersGroupAdmins = async (webUrl: string) => {
  const groupPayload = await fetchJson(`${webUrl}/_api/web/associatedownergroup`);
  const group = groupPayload?.d || groupPayload;
  const groupId = Number(group?.Id || group?.id);
  if (!groupId) throw new Error("owners-group-id-missing");

  const usersPayload = await fetchJson(
    `${webUrl}/_api/web/sitegroups(${groupId})/users?$select=Id,Title,Email,LoginName,IsSiteAdmin,PrincipalType`
  );
  return dedupeAdmins(extractResults(usersPayload));
};

const readSource = async (
  source: SourceName,
  reader: () => Promise<AdminIdentity[]>
): Promise<{ rows: AdminIdentity[]; status: SourceStatus }> => {
  try {
    const rows = await reader();
    return { rows, status: { source, ok: true, count: rows.length } };
  } catch (error) {
    return {
      rows: [],
      status: {
        source,
        ok: false,
        count: 0,
        error: error instanceof Error ? error.message : String(error)
      }
    };
  }
};

export async function readSharePointAdminsFromBrowser(site: Site): Promise<LiveAdminSourcesResult> {
  const paths = resolvePathsForSite(site);
  const webUrl = getWebUrl(paths);
  const capturedAt = new Date().toISOString();

  const [txt, siteCollection, ownersGroup] = await Promise.all([
    readSource("txt", () => readTxtAdmins(paths)),
    readSource("siteCollection", () => readSiteCollectionAdmins(webUrl)),
    readSource("ownersGroup", () => readOwnersGroupAdmins(webUrl))
  ]);

  const txtAdmins = txt.rows;
  const siteCollectionAdmins = siteCollection.rows;
  const ownersGroupAdmins = ownersGroup.rows;
  const adminDifferences = buildAdminDiff(txtAdmins, siteCollectionAdmins, ownersGroupAdmins);
  const adminsCount = new Set([...txtAdmins, ...siteCollectionAdmins, ...ownersGroupAdmins].map(normalizeAdminKey)).size;

  return {
    siteId: site._id,
    siteCode: site.siteCode,
    capturedAt,
    txtAdmins,
    siteCollectionAdmins,
    ownersGroupAdmins,
    adminDifferences,
    adminsCount,
    sourceStatus: [txt.status, siteCollection.status, ownersGroup.status]
  };
}

export function buildAdminSnapshotForPersistence(live: LiveAdminSourcesResult, previous: any = {}) {
  const sourceOk = (source: SourceName) => live.sourceStatus.some((row) => row.source === source && row.ok);
  const txtAdmins = sourceOk("txt") ? live.txtAdmins : previous?.txtAdmins || [];
  const siteCollectionAdmins = sourceOk("siteCollection") ? live.siteCollectionAdmins : previous?.siteCollectionAdmins || [];
  const ownersGroupAdmins = sourceOk("ownersGroup") ? live.ownersGroupAdmins : previous?.ownersGroupAdmins || [];
  const adminDifferences = buildAdminDiff(txtAdmins, siteCollectionAdmins, ownersGroupAdmins);
  const adminsCount = new Set([...txtAdmins, ...siteCollectionAdmins, ...ownersGroupAdmins].map(normalizeAdminKey)).size;
  const failedSources = live.sourceStatus.filter((source) => !source.ok);

  return {
    txtAdmins,
    siteCollectionAdmins,
    ownersGroupAdmins,
    adminDifferences,
    adminsCount,
    lastAdminSyncAt: live.capturedAt,
    adminSyncStatus: failedSources.length ? "failed" as const : "succeeded" as const,
    lastError: failedSources.map((source) => `${source.source}: ${source.error || "failed"}`).join("; ")
  };
}
