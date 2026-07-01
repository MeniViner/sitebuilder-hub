import { Site, SiteHealth } from "../models/Site";
import { deriveHealthStatus } from "../utils/health";
import { resolveSiteBuilderPaths, SiteBuilderResolvedPaths } from "../utils/sitebuilderPaths";
import { logger } from "../utils/logger";
import { getSharePointOperationCapabilities } from "./sharepointOperationClient";

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

export type BrowserSharePointHealthRecordInput = {
  checkedAt?: string;
  connectorMode?: "browser-sharepoint";
  targetSharePointSiteUrl?: string;
  health?: Partial<SiteHealth>;
  derivedHealthStatus?: ReturnType<typeof deriveHealthStatus> | string;
  evidence?: HealthEvidence[];
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

const booleanFromEvidence = (evidence: HealthEvidence) => {
  if (evidence.ok) return true;
  if (evidence.authBlocked) return undefined;
  return false;
};

export async function runReadOnlySharePointHealthCheck(siteId: string): Promise<SharePointReadOnlyHealthResult> {
  logger.info("sharepoint", "Legacy read-only SharePoint health check skipped because server SharePoint is disabled", { siteId });
  logger.info("sites", "Site health read-only check requires browser SharePoint", { siteId });
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

  const evidence: HealthEvidence[] = [
    { key: "siteDbExists", label: "Document Library siteDB", url: listEndpoint(resolvedPaths, resolvedPaths.siteDbLibrary), ok: false, error: "browser-sharepoint-health-required" },
    { key: "usersDbExists", label: "Document Library siteUsersDb", url: listEndpoint(resolvedPaths, resolvedPaths.usersDbLibrary), ok: false, error: "browser-sharepoint-health-required" },
    { key: "distExists", label: "Final dist folder", url: folderEndpoint(resolvedPaths, resolvedPaths.finalDistRoot), ok: false, error: "browser-sharepoint-health-required" },
    { key: "indexExists", label: "Final index.html", url: resolvedPaths.finalAppUrl, ok: false, error: "browser-sharepoint-health-required" },
    { key: "assetsExists", label: "Final assets folder", url: folderEndpoint(resolvedPaths, `${resolvedPaths.finalDistRoot}/assets`), ok: false, error: "browser-sharepoint-health-required" },
    { key: "permissionsOk", label: "Permissions marker", url: fileUrl(resolvedPaths, resolvedPaths.permissionsMarkerFile), ok: false, error: "browser-sharepoint-health-required" },
    ...Object.entries(resolvedPaths.txtFiles).map(([name, path]) => ({
      key: "txtFile" as const,
      label: `TXT ${name}`,
      url: fileUrl(resolvedPaths, path),
      ok: false,
      error: "browser-sharepoint-health-required"
    }))
  ];

  const checkedAt = new Date();
  const derivedHealthStatus = deriveHealthStatus(site.health, site.lastHealthCheckAt, site.storageBackend);
  logger.info("sharepoint", "Legacy read-only SharePoint health check skipped", {
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    derivedHealthStatus,
    evidenceCount: evidence.length,
    reason: "browser-sharepoint-health-required"
  });

  return {
    checkedAt: checkedAt.toISOString(),
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    resolvedPaths,
    capabilities: getSharePointOperationCapabilities(),
    health: {},
    derivedHealthStatus,
    evidence,
    note: "בדיקת SharePoint מהשרת מושבתת. יש להריץ Health דרך הדפדפן המחובר ל־SharePoint."
  };
}

export async function recordBrowserSharePointHealthCheck(
  siteId: string,
  input: BrowserSharePointHealthRecordInput
): Promise<SharePointReadOnlyHealthResult & { connectorMode: "browser-sharepoint"; source: "Browser SharePoint"; targetSharePointSiteUrl?: string }> {
  logger.info("sites", "Browser SharePoint health evidence record started", { siteId });
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

  const checkedAt = input.checkedAt ? new Date(input.checkedAt) : new Date();
  const nextHealth = Object.fromEntries(
    Object.entries(input.health || {}).filter(([, value]) => typeof value === "boolean")
  ) as Partial<SiteHealth>;
  const evidence = Array.isArray(input.evidence) ? input.evidence : [];

  site.health = { ...(site.health as Partial<SiteHealth>), ...nextHealth } as any;
  site.lastHealthCheckAt = Number.isNaN(checkedAt.getTime()) ? new Date() : checkedAt;
  site.lastSharePointHostingVerificationAt = site.lastHealthCheckAt;
  site.resolvedPaths = resolvedPaths as any;
  site.sharePointPathEvidence = evidence as any;
  site.sharePointStatus.documentLibrariesStatus =
    nextHealth.siteDbExists === true && nextHealth.usersDbExists === true
      ? "ok"
      : nextHealth.siteDbExists === false || nextHealth.usersDbExists === false
        ? "failed"
        : site.sharePointStatus.documentLibrariesStatus || "unknown";
  site.sharePointStatus.permissionsStatus =
    nextHealth.permissionsOk === true ? "ok" : nextHealth.permissionsOk === false ? "warning" : site.sharePointStatus.permissionsStatus || "unknown";

  await site.save();

  const derivedHealthStatus = deriveHealthStatus(site.health, site.lastHealthCheckAt, site.storageBackend);
  logger.info("sites", "Browser SharePoint health evidence recorded", {
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    derivedHealthStatus,
    evidenceCount: evidence.length,
    failedChecks: evidence.filter((item) => !item.ok).length,
    authBlockedChecks: evidence.filter((item) => item.authBlocked).length
  });

  return {
    checkedAt: site.lastHealthCheckAt.toISOString(),
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    connectorMode: "browser-sharepoint",
    source: "Browser SharePoint",
    targetSharePointSiteUrl: input.targetSharePointSiteUrl,
    resolvedPaths,
    capabilities: getSharePointOperationCapabilities(),
    health: nextHealth,
    derivedHealthStatus,
    evidence,
    note: input.note
  };
}

export const getFinalAppUrlHealthEvidence = (
  result: SharePointReadOnlyHealthResult
): FinalAppUrlHealthEvidence | undefined => {
  const evidence = result.evidence.find((item) => item.key === "indexExists");
  return evidence ? { ...evidence, checkedAt: result.checkedAt } : undefined;
};
