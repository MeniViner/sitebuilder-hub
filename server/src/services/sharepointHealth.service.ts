import { Site, SiteHealth } from "../models/Site";
import { deriveHealthStatus } from "../utils/health";
import { resolveSiteBuilderPaths, SiteBuilderResolvedPaths } from "../utils/sitebuilderPaths";
import { logger } from "../utils/logger";
import { getSharePointOperationCapabilities, getSharePointReadHeaders } from "./sharepointOperationClient";

type CheckKey = keyof SiteHealth | "txtFile";

export type HealthEvidence = {
  key: CheckKey;
  label: string;
  url: string;
  ok: boolean;
  status?: number;
  statusText?: string;
  authBlocked?: boolean;
  error?: string;
};

export type SharePointReadOnlyHealthResult = {
  checkedAt: string;
  siteId: string;
  siteCode: string;
  resolvedPaths: SiteBuilderResolvedPaths;
  capabilities: ReturnType<typeof getSharePointOperationCapabilities>;
  health: Partial<SiteHealth>;
  derivedHealthStatus: ReturnType<typeof deriveHealthStatus>;
  evidence: HealthEvidence[];
  note?: string;
};

export type FinalAppUrlHealthEvidence = HealthEvidence & {
  checkedAt: string;
};

const escapeODataString = (value: string) => value.replace(/'/g, "''");
const encodeSpaces = (value: string) => value.replace(/ /g, "%20");

const buildSiteApiUrl = (paths: SiteBuilderResolvedPaths, suffix: string) =>
  encodeSpaces(`https://${paths.host}${paths.siteRoot}${suffix}`);

const listEndpoint = (paths: SiteBuilderResolvedPaths, title: string) =>
  buildSiteApiUrl(
    paths,
    `/_api/web/lists/GetByTitle('${escapeODataString(title)}')?$select=Id,Title,BaseTemplate,RootFolder/ServerRelativeUrl&$expand=RootFolder`
  );

const folderEndpoint = (paths: SiteBuilderResolvedPaths, serverRelativeUrl: string) =>
  buildSiteApiUrl(
    paths,
    `/_api/web/GetFolderByServerRelativeUrl('${escapeODataString(serverRelativeUrl)}')?$select=Name,ServerRelativeUrl`
  );

const fileUrl = (paths: SiteBuilderResolvedPaths, serverRelativeUrl: string) =>
  encodeSpaces(`https://${paths.host}${serverRelativeUrl}`);

const fetchReadOnly = async (url: string): Promise<Pick<HealthEvidence, "ok" | "status" | "statusText" | "authBlocked" | "error">> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  const startedAt = Date.now();
  logger.info("sharepoint", "SharePoint health probe started", { url });

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: getSharePointReadHeaders("application/json;odata=nometadata, text/plain, */*"),
      redirect: "follow",
      signal: controller.signal
    });

    logger.info("sharepoint", "SharePoint health probe finished", {
      url,
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      authBlocked: response.status === 401 || response.status === 403,
      durationMs: Date.now() - startedAt
    });

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      authBlocked: response.status === 401 || response.status === 403
    };
  } catch (error) {
    logger.error("sharepoint", "SharePoint health probe failed", {
      url,
      durationMs: Date.now() - startedAt,
      error
    });
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    clearTimeout(timeout);
  }
};

const booleanFromEvidence = (evidence: HealthEvidence) => {
  if (evidence.ok) return true;
  if (evidence.authBlocked) return undefined;
  return false;
};

const check = async (key: CheckKey, label: string, url: string): Promise<HealthEvidence> => {
  logger.debug("sharepoint", "SharePoint health check item queued", { key, label, url });
  const result = await fetchReadOnly(url);
  const evidence = { key, label, url, ...result };
  logger.debug("sharepoint", "SharePoint health check item completed", evidence);
  return evidence;
};

export async function runReadOnlySharePointHealthCheck(siteId: string): Promise<SharePointReadOnlyHealthResult> {
  logger.info("sharepoint", "Read-only SharePoint health check started", { siteId });
  logger.info("sites", "Site health read-only check started", { siteId });
  const site = await Site.findById(siteId);
  if (!site) throw new Error("site-not-found");

  const resolvedPaths = resolveSiteBuilderPaths({
    siteCode: site.siteCode,
    sharePointHost: site.sharePointHost,
    sharePointSiteUrl: site.sharePointSiteUrl,
    siteDbLibrary: site.siteDbLibrary,
    usersDbLibrary: site.usersDbLibrary,
    bootstrapLibrary: site.bootstrapLibrary,
    bootstrapFolder: site.bootstrapFolder,
    widgetsDbTarget: site.widgetsDbTarget
  });

  const requiredTxtFiles = Object.entries(resolvedPaths.txtFiles);
  const evidence = await Promise.all([
    check("siteDbExists", "Document Library siteDB", listEndpoint(resolvedPaths, resolvedPaths.siteDbLibrary)),
    check("usersDbExists", "Document Library siteUsersDb", listEndpoint(resolvedPaths, resolvedPaths.usersDbLibrary)),
    check("distExists", "Final dist folder", folderEndpoint(resolvedPaths, resolvedPaths.finalDistRoot)),
    check("indexExists", "Final index.html", resolvedPaths.finalAppUrl),
    check("assetsExists", "Final assets folder", folderEndpoint(resolvedPaths, `${resolvedPaths.finalDistRoot}/assets`)),
    check("permissionsOk", "Permissions marker", fileUrl(resolvedPaths, resolvedPaths.permissionsMarkerFile)),
    ...requiredTxtFiles.map(([name, path]) => check("txtFile", `TXT ${name}`, fileUrl(resolvedPaths, path)))
  ]);

  const siteDbExists = booleanFromEvidence(evidence.find((item) => item.key === "siteDbExists")!);
  const usersDbExists = booleanFromEvidence(evidence.find((item) => item.key === "usersDbExists")!);
  const distExists = booleanFromEvidence(evidence.find((item) => item.key === "distExists")!);
  const indexExists = booleanFromEvidence(evidence.find((item) => item.key === "indexExists")!);
  const assetsExists = booleanFromEvidence(evidence.find((item) => item.key === "assetsExists")!);
  const permissionsOk = booleanFromEvidence(evidence.find((item) => item.key === "permissionsOk")!);
  const txtEvidence = evidence.filter((item) => item.key === "txtFile");
  const txtFilesExist = txtEvidence.some((item) => item.authBlocked)
    ? undefined
    : txtEvidence.every((item) => item.ok);

  const nextHealth: Partial<SiteHealth> = {
    ...(siteDbExists !== undefined ? { siteDbExists } : {}),
    ...(usersDbExists !== undefined ? { usersDbExists } : {}),
    ...(distExists !== undefined ? { distExists } : {}),
    ...(indexExists !== undefined ? { indexExists } : {}),
    ...(assetsExists !== undefined ? { assetsExists } : {}),
    ...(txtFilesExist !== undefined ? { txtFilesExist } : {}),
    ...(permissionsOk !== undefined ? { permissionsOk } : {})
  };

  site.health = { ...(site.health as Partial<SiteHealth>), ...nextHealth } as any;
  site.lastHealthCheckAt = new Date();
  site.resolvedPaths = resolvedPaths as any;
  site.sharePointStatus.documentLibrariesStatus =
    siteDbExists === true && usersDbExists === true
      ? "ok"
      : siteDbExists === false || usersDbExists === false
        ? "failed"
        : "unknown";
  site.sharePointStatus.permissionsStatus =
    permissionsOk === true ? "ok" : permissionsOk === false ? "warning" : "unknown";
  await site.save();
  logger.info("sites", "Site health state saved from SharePoint evidence", {
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    documentLibrariesStatus: site.sharePointStatus.documentLibrariesStatus,
    permissionsStatus: site.sharePointStatus.permissionsStatus,
    updatedHealthKeys: Object.keys(nextHealth)
  });

  const derivedHealthStatus = deriveHealthStatus(site.health, site.lastHealthCheckAt);
  logger.info("sharepoint", "Read-only SharePoint health check completed", {
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    derivedHealthStatus,
    evidenceCount: evidence.length,
    failedChecks: evidence.filter((item) => !item.ok).length,
    authBlockedChecks: evidence.filter((item) => item.authBlocked).length,
    health: nextHealth
  });
  logger.info("sites", "Site health read-only check completed", {
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    derivedHealthStatus,
    failedChecks: evidence.filter((item) => !item.ok).length,
    authBlockedChecks: evidence.filter((item) => item.authBlocked).length
  });

  return {
    checkedAt: site.lastHealthCheckAt.toISOString(),
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    resolvedPaths,
    capabilities: getSharePointOperationCapabilities(),
    health: nextHealth,
    derivedHealthStatus,
    evidence,
    note: evidence.some((item) => item.authBlocked)
      ? "חלק מהבדיקות נחסמו על ידי SharePoint בגלל authentication/permissions; ערכים אלה לא עודכנו ככשל."
      : undefined
  };
}

export const getFinalAppUrlHealthEvidence = (
  result: SharePointReadOnlyHealthResult
): FinalAppUrlHealthEvidence | undefined => {
  const evidence = result.evidence.find((item) => item.key === "indexExists");
  return evidence ? { ...evidence, checkedAt: result.checkedAt } : undefined;
};
