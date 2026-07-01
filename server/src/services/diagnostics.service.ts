import { Request } from "express";
import { Types } from "mongoose";
import { env, getClientOrigins, ownerDirectModeEnabled } from "../config/env";
import { Site } from "../models/Site";
import { resolveSiteBuilderPaths, SiteBuilderResolvedPaths } from "../utils/sitebuilderPaths";
import { getMongoStatus } from "../db/mongo";
import { getSharePointOperationCapabilities } from "./sharepointOperationClient";
import { getActiveDangerousValidationBypasses } from "./dangerousBackupBypass.service";
import { getBuilderBackendRuntimeSettings } from "./builderMongoHealth.service";

type ProbeResult = {
  ok: boolean;
  url: string;
  method: string;
  status?: number;
  statusText?: string;
  errorCode?: string;
  error?: string;
  humanExplanation?: string;
  suggestedFix?: string;
  payloadSummary?: Record<string, unknown>;
};

const encodeSpaces = (value: string) => value.replace(/ /g, "%20");
const escapeODataString = (value: string) => value.replace(/'/g, "''");

const configuredCookieNames = () =>
  env.SHAREPOINT_AUTH_COOKIE
    .split(";")
    .map((part) => part.split("=")[0]?.trim())
    .filter(Boolean);

const isLocalOrigin = (origin = "") => {
  try {
    const parsed = new URL(origin);
    return ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  } catch {
    return false;
  }
};

const appModeFor = (req: Request) => {
  const origin = req.header("origin") || req.header("referer") || "";
  if (isLocalOrigin(origin)) return "local dev";
  if (origin.includes("sharepoint") || origin.includes("portal.army.idf") || origin.includes("/sites/") || origin.includes("/teams/")) {
    return "SharePoint-hosted";
  }
  return env.NODE_ENV === "production" ? "production" : env.NODE_ENV;
};

const siteApiUrl = (paths: SiteBuilderResolvedPaths, suffix: string) =>
  encodeSpaces(`https://${paths.host}${paths.siteRoot}${suffix}`);

const fileUrl = (paths: SiteBuilderResolvedPaths, serverRelativePath: string) =>
  encodeSpaces(`https://${paths.host}${serverRelativePath}`);

const listEndpoint = (paths: SiteBuilderResolvedPaths, title: string) =>
  siteApiUrl(
    paths,
    `/_api/web/lists/GetByTitle('${escapeODataString(title)}')?$select=Id,Title,RootFolder/ServerRelativeUrl&$expand=RootFolder`
  );

const folderEndpoint = (paths: SiteBuilderResolvedPaths, serverRelativePath: string) =>
  siteApiUrl(paths, `/_api/web/GetFolderByServerRelativeUrl('${escapeODataString(serverRelativePath)}')?$select=Name,ServerRelativeUrl`);

const chooseSite = async (siteId?: string) => {
  if (siteId && Types.ObjectId.isValid(siteId)) return Site.findById(siteId).lean();
  return Site.findOne({ status: { $ne: "archived" } }).sort({ updatedAt: -1 }).lean();
};

const pathDiagnostics = (paths: SiteBuilderResolvedPaths) => {
  const txtFiles = Object.entries(paths.txtFiles).map(([key, serverRelativePath]) => ({
    key,
    libraryName: serverRelativePath.startsWith(paths.usersDbRoot) ? paths.usersDbLibrary : paths.siteDbLibrary,
    serverRelativePath,
    finalRestUrl: fileUrl(paths, serverRelativePath),
    unencoded: serverRelativePath,
    encoded: encodeSpaces(serverRelativePath)
  }));

  return [
    {
      key: "siteDB library path",
      libraryName: paths.siteDbLibrary,
      folderPath: paths.siteDbRoot,
      serverRelativePath: paths.siteDbRoot,
      finalRestUrl: listEndpoint(paths, paths.siteDbLibrary),
      unencoded: paths.siteDbRoot,
      encoded: encodeSpaces(paths.siteDbRoot)
    },
    {
      key: "siteUsersDb library path",
      libraryName: paths.usersDbLibrary,
      folderPath: paths.usersDbRoot,
      serverRelativePath: paths.usersDbRoot,
      finalRestUrl: listEndpoint(paths, paths.usersDbLibrary),
      unencoded: paths.usersDbRoot,
      encoded: encodeSpaces(paths.usersDbRoot)
    },
    {
      key: "final dist folder",
      libraryName: paths.siteDbLibrary,
      folderPath: paths.finalDistRoot,
      serverRelativePath: paths.finalDistRoot,
      finalRestUrl: folderEndpoint(paths, paths.finalDistRoot),
      unencoded: paths.finalDistRoot,
      encoded: encodeSpaces(paths.finalDistRoot)
    },
    {
      key: "final index.html",
      libraryName: paths.siteDbLibrary,
      filePath: `${paths.finalDistRoot}/index.html`,
      serverRelativePath: `${paths.finalDistRoot}/index.html`,
      finalRestUrl: paths.finalAppUrl,
      unencoded: `${paths.finalDistRoot}/index.html`,
      encoded: encodeSpaces(`${paths.finalDistRoot}/index.html`)
    },
    {
      key: "assets folder",
      libraryName: paths.siteDbLibrary,
      folderPath: `${paths.finalDistRoot}/assets`,
      serverRelativePath: `${paths.finalDistRoot}/assets`,
      finalRestUrl: folderEndpoint(paths, `${paths.finalDistRoot}/assets`),
      unencoded: `${paths.finalDistRoot}/assets`,
      encoded: encodeSpaces(`${paths.finalDistRoot}/assets`)
    },
    ...txtFiles.map((file) => ({ ...file, key: `TXT ${file.key}` })),
    {
      key: "backup folder",
      libraryName: paths.siteDbLibrary,
      folderPath: paths.backupsRoot,
      serverRelativePath: paths.backupsRoot,
      finalRestUrl: folderEndpoint(paths, paths.backupsRoot),
      unencoded: paths.backupsRoot,
      encoded: encodeSpaces(paths.backupsRoot)
    },
    {
      key: "permissions marker",
      libraryName: paths.usersDbLibrary,
      filePath: paths.permissionsMarkerFile,
      serverRelativePath: paths.permissionsMarkerFile,
      finalRestUrl: fileUrl(paths, paths.permissionsMarkerFile),
      unencoded: paths.permissionsMarkerFile,
      encoded: encodeSpaces(paths.permissionsMarkerFile)
    }
  ];
};

export async function getDiagnostics(req: Request) {
  const selectedSite = await chooseSite(String(req.query.siteId || ""));
  const resolvedPaths = selectedSite
    ? resolveSiteBuilderPaths({
        siteCode: selectedSite.siteCode,
        sharePointHost: selectedSite.sharePointHost,
        sharePointSiteUrl: selectedSite.sharePointSiteUrl,
        siteDbLibrary: selectedSite.siteDbLibrary,
        usersDbLibrary: selectedSite.usersDbLibrary,
        bootstrapLibrary: selectedSite.bootstrapLibrary,
        bootstrapFolder: selectedSite.bootstrapFolder,
        widgetsDbTarget: selectedSite.widgetsDbTarget
      })
    : null;
  const capabilities = getSharePointOperationCapabilities();
  const dangerousOverrides = getActiveDangerousValidationBypasses();
  const builderBackendConfig = getBuilderBackendRuntimeSettings();

  return {
    generatedAt: new Date().toISOString(),
    appMode: appModeFor(req),
    frontendOrigin: req.header("origin") || "",
    configuredClientOrigin: env.CLIENT_ORIGIN,
    configuredClientOrigins: getClientOrigins(),
    currentApiBaseUrl: "/api",
    mongo: getMongoStatus(),
    auth: {
      authEnabled: env.AUTH_ENABLED,
      activeBackendUser: req.user || null,
      ownerDirectMode: ownerDirectModeEnabled(),
      localFallbackActive: req.user?.source === "dev",
      currentUserDetectionResult: req.user?.source === "sharepoint" ? "SharePoint user header received by backend" : "No SharePoint user header on this request"
    },
    sharePoint: {
      targetSiteUrl: resolvedPaths?.sharePointSiteUrl || selectedSite?.sharePointSiteUrl || "",
      preferredConnectorMode: "browser-sharepoint",
      serverSharePointDisabled: true,
      writeEnabled: env.SHAREPOINT_WRITE_ENABLED,
      authCookieConfigured: Boolean(env.SHAREPOINT_AUTH_COOKIE),
      authCookieNames: configuredCookieNames(),
      bearerTokenConfigured: Boolean(env.SHAREPOINT_BEARER_TOKEN),
      unauthenticatedWriteBypassEnabled: env.SHAREPOINT_ALLOW_UNAUTHENTICATED_WRITE,
      capabilities,
      dangerousOverrides
    },
    builderBackendConfig,
    selectedSite: selectedSite ? {
      id: selectedSite._id.toString(),
      siteCode: selectedSite.siteCode,
      displayName: selectedSite.displayName,
      environment: selectedSite.environment,
      status: selectedSite.status,
      storageBackend: selectedSite.storageBackend || "unknown",
      builderSiteId: selectedSite.builderSiteId || selectedSite.mongoSiteId || "",
      dataBackendStatus: selectedSite.dataBackendStatus || "unknown"
    } : null,
    runtimeConfig: selectedSite ? {
      path: selectedSite.runtimeConfigPath || resolvedPaths?.runtimeConfigPath || "",
      url: selectedSite.runtimeConfigUrl || resolvedPaths?.runtimeConfigUrl || "",
      status: selectedSite.runtimeConfigStatus?.readStatus || "unknown",
      storageBackend: selectedSite.runtimeConfigStatus?.storageBackend || "",
      backendApiUrlHost: selectedSite.runtimeConfigStatus?.backendApiUrlHost || "",
      builderSiteId: selectedSite.runtimeConfigStatus?.builderSiteId || "",
      apiKeyStatus: selectedSite.runtimeConfigStatus?.apiKeyStatus || "unknown",
      belongsToSite: selectedSite.runtimeConfigStatus?.belongsToSite ?? false,
      warnings: selectedSite.runtimeConfigStatus?.warnings || [],
      checkedAt: selectedSite.runtimeConfigStatus?.checkedAt
    } : null,
    builderBackend: selectedSite ? {
      connectorMode: "mongo-backend",
      backendApiUrlHost: selectedSite.mongoBackendStatus?.backendApiUrlHost || "",
      siteId: selectedSite.mongoBackendStatus?.siteId || selectedSite.mongoSiteId || selectedSite.builderSiteId || "",
      safeCollectionName: selectedSite.mongoBackendStatus?.safeCollectionName || selectedSite.safeCollectionName || "",
      apiKeyConfigured: selectedSite.mongoBackendStatus?.apiKeyConfigured ?? false,
      backendReachable: selectedSite.mongoBackendStatus?.backendReachable ?? false,
      registryStatus: selectedSite.mongoBackendStatus?.registryStatus || "unknown",
      collectionStatus: selectedSite.mongoBackendStatus?.collectionStatus || "unknown",
      seedStatus: selectedSite.mongoBackendStatus?.seedStatus || "unknown",
      missingScopes: selectedSite.mongoBackendStatus?.missingScopes || [],
      missingDocs: selectedSite.mongoBackendStatus?.missingDocs || [],
      backupsStatus: selectedSite.mongoBackendStatus?.backupsStatus || "unknown",
      revisionsAuditStatus: selectedSite.mongoBackendStatus?.revisionsAuditStatus || "unknown",
      warnings: selectedSite.mongoBackendStatus?.warnings || [],
      checkedAt: selectedSite.mongoBackendStatus?.checkedAt
    } : null,
    paths: resolvedPaths ? {
      siteBaseUrl: resolvedPaths.sharePointSiteUrl,
      siteRoot: resolvedPaths.siteRoot,
      libraryName: resolvedPaths.siteDbLibrary,
      folderPath: resolvedPaths.finalDistRoot,
      finalRestUrl: folderEndpoint(resolvedPaths, resolvedPaths.finalDistRoot),
      resolvedPaths,
      checks: pathDiagnostics(resolvedPaths)
    } : null,
    envWarnings: [
      env.SHAREPOINT_WRITE_ENABLED || env.SHAREPOINT_AUTH_COOKIE || env.SHAREPOINT_BEARER_TOKEN
        ? "Server-side SharePoint REST is disabled. SHAREPOINT_WRITE/auth env vars are ignored for SharePoint execution."
        : "",
      env.AUTH_ENABLED === false ? "AUTH_ENABLED=false: owner-direct/local fallback is active unless SharePoint current user headers are present." : "",
      ...dangerousOverrides.map((override) => `${override.envVar}=true: ${override.description}`)
    ].filter(Boolean)
  };
}

export async function runSharePointDiagnostics(req: Request) {
  const selectedSite = await chooseSite(String(req.body?.siteId || req.query.siteId || ""));
  if (!selectedSite) {
    return {
      generatedAt: new Date().toISOString(),
      ok: false,
      errorCode: "NO_SITE_AVAILABLE",
      humanExplanation: "No active site is available for SharePoint diagnostics.",
      suggestedFix: "Create or restore a site record, then run diagnostics again."
    };
  }

  const paths = resolveSiteBuilderPaths({
    siteCode: selectedSite.siteCode,
    sharePointHost: selectedSite.sharePointHost,
    sharePointSiteUrl: selectedSite.sharePointSiteUrl,
    siteDbLibrary: selectedSite.siteDbLibrary,
    usersDbLibrary: selectedSite.usersDbLibrary,
    bootstrapLibrary: selectedSite.bootstrapLibrary,
    bootstrapFolder: selectedSite.bootstrapFolder,
    widgetsDbTarget: selectedSite.widgetsDbTarget
  });

  const skippedProbe = (url: string, method: string): ProbeResult => ({
    ok: false,
    url,
    method,
    errorCode: "SERVER_SHAREPOINT_DISABLED",
    humanExplanation: "השרת לא מבצע בקשות SharePoint. הבדיקה צריכה לרוץ דרך הדפדפן המחובר.",
    suggestedFix: "הריצו Browser SharePoint diagnostics מתוך אתר SharePoint מחובר."
  });
  const currentUser = skippedProbe(siteApiUrl(paths, "/_api/web/currentuser"), "GET");
  const readTest = skippedProbe(listEndpoint(paths, paths.siteDbLibrary), "GET");
  const digestTest = skippedProbe(siteApiUrl(paths, "/_api/contextinfo"), "POST");
  const writeCapability = {
    connectorMode: "browser-sharepoint",
    configured: false,
    authenticated: false,
    digestWorks: false,
    writeVerified: false,
    message: "חיבור שרת ל־SharePoint מושבת בכוונה. Digest וכתיבה נבדקים רק בדפדפן."
  };

  return {
    generatedAt: new Date().toISOString(),
    connectorMode: "browser-sharepoint",
    site: {
      id: selectedSite._id.toString(),
      siteCode: selectedSite.siteCode,
      displayName: selectedSite.displayName,
      environment: selectedSite.environment,
      status: selectedSite.status
    },
    appMode: appModeFor(req),
    targetSharePointSiteUrl: paths.sharePointSiteUrl,
    configured: {
      serverSharePointDisabled: true,
      sharePointWriteEnabled: false,
      sharePointAuthCookieConfigured: Boolean(env.SHAREPOINT_AUTH_COOKIE),
      sharePointAuthCookieNames: configuredCookieNames(),
      sharePointBearerTokenConfigured: Boolean(env.SHAREPOINT_BEARER_TOKEN),
      unauthenticatedWriteBypassEnabled: env.SHAREPOINT_ALLOW_UNAUTHENTICATED_WRITE
    },
    currentUser,
    readTest,
    digestTest,
    writeCapability,
    paths: {
      siteBaseUrl: paths.sharePointSiteUrl,
      checks: pathDiagnostics(paths)
    },
    overall: {
      reachable: false,
      authenticated: false,
      digestWorks: false,
      writeVerified: false,
      failedUrl: [currentUser, readTest, digestTest].find((item) => !item.ok)?.url || "",
      failedStatus: [currentUser, readTest, digestTest].find((item) => !item.ok)?.status,
      failedBackendErrorCode: [currentUser, readTest, digestTest].find((item) => !item.ok)?.errorCode || "",
      humanExplanation: "חיבור SharePoint מהשרת אינו חלק מהארכיטקטורה. זה לא כשל שצריך לתקן עם cookie/token.",
      suggestedFix: "השתמשו בבדיקות ובפעולות Browser SharePoint מתוך המשתמש המחובר."
    }
  };
}
