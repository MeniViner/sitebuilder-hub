import { Request } from "express";
import { Types } from "mongoose";
import { env, getClientOrigins, ownerDirectModeEnabled } from "../config/env";
import { Site } from "../models/Site";
import { resolveSiteBuilderPaths, SiteBuilderResolvedPaths } from "../utils/sitebuilderPaths";
import { getMongoStatus } from "../db/mongo";
import { getSharePointOperationCapabilities, getSharePointReadHeaders } from "./sharepointOperationClient";

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

const explainFailure = (status?: number, error?: string) => {
  if (status === 401) {
    return {
      errorCode: "SHAREPOINT_401",
      humanExplanation: "SharePoint rejected the backend request. The browser may be logged into SharePoint, but the backend does not automatically inherit that login.",
      suggestedFix: "Check SharePoint auth cookie / bearer token / current-user mode / target site URL."
    };
  }
  if (status === 403) {
    return {
      errorCode: "SHAREPOINT_403",
      humanExplanation: "SharePoint accepted the request identity but it does not have permission for this path.",
      suggestedFix: "Check the configured account permissions for the target SharePoint site/library/folder."
    };
  }
  if (status === 404) {
    return {
      errorCode: "SHAREPOINT_404",
      humanExplanation: "The SharePoint URL or server-relative path was not found.",
      suggestedFix: "Check the site URL, library name, folder path, and encoded/unencoded path forms."
    };
  }
  return {
    errorCode: error ? "SHAREPOINT_REQUEST_FAILED" : undefined,
    humanExplanation: error ? "The SharePoint request failed before a successful response was received." : undefined,
    suggestedFix: error ? "Check network access, target site URL, and backend SharePoint credentials." : undefined
  };
};

const probe = async (url: string, init: RequestInit): Promise<ProbeResult> => {
  const method = init.method || "GET";
  try {
    const response = await fetch(url, init);
    const explanation = response.ok ? {} : explainFailure(response.status);
    return {
      ok: response.ok,
      url,
      method,
      status: response.status,
      statusText: response.statusText,
      ...explanation
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      url,
      method,
      error: message,
      ...explainFailure(undefined, message)
    };
  }
};

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
      preferredConnectorMode: appModeFor(req) === "SharePoint-hosted" ? "browser-sharepoint" : "backend-sharepoint",
      writeEnabled: env.SHAREPOINT_WRITE_ENABLED,
      authCookieConfigured: Boolean(env.SHAREPOINT_AUTH_COOKIE),
      authCookieNames: configuredCookieNames(),
      bearerTokenConfigured: Boolean(env.SHAREPOINT_BEARER_TOKEN),
      unauthenticatedWriteBypassEnabled: env.SHAREPOINT_ALLOW_UNAUTHENTICATED_WRITE,
      capabilities
    },
    selectedSite: selectedSite ? {
      id: selectedSite._id.toString(),
      siteCode: selectedSite.siteCode,
      displayName: selectedSite.displayName,
      environment: selectedSite.environment,
      status: selectedSite.status
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
      env.SHAREPOINT_WRITE_ENABLED && env.SHAREPOINT_ALLOW_UNAUTHENTICATED_WRITE && !env.SHAREPOINT_AUTH_COOKIE && !env.SHAREPOINT_BEARER_TOKEN
        ? "SHAREPOINT_ALLOW_UNAUTHENTICATED_WRITE=true does not mean SharePoint will accept writes. Configure cookie or bearer token and verify contextinfo."
        : "",
      env.AUTH_ENABLED === false ? "AUTH_ENABLED=false: owner-direct/local fallback is active unless SharePoint current user headers are present." : ""
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

  const currentUser = await probe(siteApiUrl(paths, "/_api/web/currentuser"), {
    method: "GET",
    headers: getSharePointReadHeaders("application/json;odata=verbose"),
    redirect: "follow"
  });
  const readTest = await probe(listEndpoint(paths, paths.siteDbLibrary), {
    method: "GET",
    headers: getSharePointReadHeaders("application/json;odata=verbose"),
    redirect: "follow"
  });
  const digestTest = await probe(siteApiUrl(paths, "/_api/contextinfo"), {
    method: "POST",
    headers: {
      ...getSharePointReadHeaders("application/json;odata=verbose"),
      "Content-Type": "application/json;odata=verbose"
    }
  });
  const writeCapability = {
    connectorMode: "backend-sharepoint",
    configured: env.SHAREPOINT_WRITE_ENABLED,
    authenticated: Boolean(env.SHAREPOINT_AUTH_COOKIE || env.SHAREPOINT_BEARER_TOKEN),
    digestWorks: digestTest.ok,
    writeVerified: env.SHAREPOINT_WRITE_ENABLED && digestTest.ok,
    message: env.SHAREPOINT_WRITE_ENABLED && !digestTest.ok
      ? "כתיבה ל-SharePoint מוגדרת אבל ההתחברות נכשלה."
      : digestTest.ok
        ? "Digest/contextinfo succeeded; backend identity can request SharePoint write tokens."
        : "SharePoint write is not verified."
  };

  return {
    generatedAt: new Date().toISOString(),
    connectorMode: "backend-sharepoint",
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
      sharePointWriteEnabled: env.SHAREPOINT_WRITE_ENABLED,
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
      reachable: currentUser.ok || readTest.ok || digestTest.ok,
      authenticated: currentUser.ok || readTest.ok || digestTest.ok,
      digestWorks: digestTest.ok,
      writeVerified: writeCapability.writeVerified,
      failedUrl: [currentUser, readTest, digestTest].find((item) => !item.ok)?.url || "",
      failedStatus: [currentUser, readTest, digestTest].find((item) => !item.ok)?.status,
      failedBackendErrorCode: [currentUser, readTest, digestTest].find((item) => !item.ok)?.errorCode || "",
      humanExplanation: [currentUser, readTest, digestTest].find((item) => !item.ok)?.humanExplanation || "SharePoint checks passed.",
      suggestedFix: [currentUser, readTest, digestTest].find((item) => !item.ok)?.suggestedFix || "No immediate fix needed."
    }
  };
}
