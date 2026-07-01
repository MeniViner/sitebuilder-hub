import crypto from "crypto";
import { env } from "../config/env";
import { SiteBuilderResolvedPaths } from "../utils/sitebuilderPaths";
import { logger } from "../utils/logger";
import {
  getDangerousValidationBypassEnvVar
} from "./dangerousBackupBypass.service";

export type SharePointOperationCapabilities = {
  readAvailable: boolean;
  readUsesAuthMaterial: boolean;
  configured: {
    writeEnabled: boolean;
    authCookieConfigured: boolean;
    bearerTokenConfigured: boolean;
    unauthenticatedWriteBypassEnabled: boolean;
    dangerousWriteGateBypassEnabled?: boolean;
    dangerousWriteGateBypassEnvVar?: string;
  };
  writeEnabled: boolean;
  hasAuthMaterial: boolean;
  unauthenticatedWriteAllowed: boolean;
  writeAvailable: boolean;
  writeVerified: boolean;
  authMode: "bearer" | "cookie" | "none";
  authModes: Array<"bearer" | "cookie">;
  requestTimeoutMs: number;
  digest: {
    requiredForWrites: boolean;
    endpointSuffix: "/_api/contextinfo";
    canRequest: boolean;
    reason?: string;
  };
  siteCreation: {
    modernSiteCollectionEndpoint: "/_api/SPSiteManager/create";
    statusEndpoint: "/_api/SPSiteManager/status";
    canCreate: boolean;
    pollAttempts: number;
    pollIntervalMs: number;
    reason?: string;
  };
  reason?: string;
};

export type SharePointSiteCreationStatusName = "not-found" | "provisioning" | "ready" | "error" | "already-exists" | "unknown";

export type SharePointSiteCreationStatus = {
  checkedAt: string;
  url: string;
  endpoint: string;
  ok: boolean;
  httpStatus?: number;
  httpStatusText?: string;
  siteId?: string;
  siteStatus?: number;
  statusName: SharePointSiteCreationStatusName;
  siteUrl?: string;
  raw?: unknown;
  error?: string;
};

export type SharePointSiteCollectionCreateInput = {
  title: string;
  description?: string;
  owner?: string;
  lcid?: number;
  webTemplate?: string;
  shareByEmailEnabled?: boolean;
  classification?: string;
  sensitivityLabel?: string;
  siteDesignId?: string;
  webTemplateExtensionId?: string;
};

export type SharePointSiteCollectionEnsureResult = {
  action: "already-exists" | "created";
  targetUrl: string;
  createRequest?: Record<string, unknown>;
  createResponse?: unknown;
  statusBefore: SharePointSiteCreationStatus;
  statusAfter: SharePointSiteCreationStatus;
  polls: SharePointSiteCreationStatus[];
};

export type SharePointTextFile = {
  path: string;
  text: string;
  sizeBytes: number;
};

export type SharePointFileExpectedEvidence = {
  sizeBytes?: number;
  sha256?: string;
};

export type SharePointFileEvidence = {
  serverRelativePath: string;
  url: string;
  checkedAt: string;
  status: "verified" | "failed";
  readOk: boolean;
  matchesExpected: boolean;
  httpStatus?: number;
  httpStatusText?: string;
  sizeBytes?: number;
  sha256?: string;
  expectedSizeBytes?: number;
  expectedSha256?: string;
  sizeMatches?: boolean;
  sha256Matches?: boolean;
  contentType?: string;
  etag?: string;
  lastModified?: string;
  error?: string;
};

export type SharePointFileBytes = {
  serverRelativePath: string;
  url: string;
  bytes: Buffer;
  sizeBytes: number;
  sha256: string;
  evidence: SharePointFileEvidence;
};

export type SharePointListStatus = {
  serverRelativePath: string;
  url: string;
  checkedAt: string;
  exists: boolean;
  status?: number;
  statusText?: string;
  authBlocked?: boolean;
  error?: string;
};

export type SharePointFolderMetadata = {
  name: string;
  serverRelativeUrl: string;
  url: string;
  itemCount?: number;
  timeCreated?: string;
  timeLastModified?: string;
  uniqueId?: string;
};

export type SharePointFileMetadata = {
  name: string;
  serverRelativeUrl: string;
  url: string;
  sizeBytes?: number;
  timeCreated?: string;
  timeLastModified?: string;
  uniqueId?: string;
  etag?: string;
  contentType?: string;
};

export type SharePointFolderListResult = SharePointListStatus & {
  folders: SharePointFolderMetadata[];
};

export type SharePointFileListResult = SharePointListStatus & {
  files: SharePointFileMetadata[];
};

export type SharePointEnsuredUser = {
  id?: number;
  displayName: string;
  email: string;
  loginName: string;
  raw: unknown;
};

export type SharePointAssociatedGroup = {
  id: number;
  title: string;
  raw: unknown;
};

export class SharePointWriteCapabilityError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "SharePointWriteCapabilityError";
  }
}

const SERVER_SHAREPOINT_REST_DISABLED_REASON =
  "Server-side SharePoint REST is disabled. Use the active browser SharePoint session for SharePoint reads and writes.";

const assertServerSharePointRestDisabled = () => {
  throw new Error("server-sharepoint-rest-disabled");
};

const encodeSpaces = (value: string) => value.replace(/ /g, "%20");
const escapeODataString = (value: string) => value.replace(/'/g, "''");
const encodeODataUrlValue = (value: string) => encodeURIComponent(value).replace(/'/g, "%27");

const authHeaders = () => ({});

export const getSharePointReadHeaders = (accept = "application/json;odata=verbose, text/plain, */*") => ({
  Accept: accept
});

const describeBody = (body: BodyInit | null | undefined) => {
  if (body === undefined || body === null) return {};
  if (typeof body === "string") {
    return {
      bodyType: "string",
      bodyBytes: new TextEncoder().encode(body).length,
      ...(logger.isPayloadLoggingEnabled() ? { body } : {})
    };
  }
  if (Buffer.isBuffer(body)) return { bodyType: "buffer", bodyBytes: body.length };
  if (body instanceof Uint8Array) return { bodyType: "uint8array", bodyBytes: body.byteLength };
  return { bodyType: typeof body };
};

const withTimeout = async (url: string, init: RequestInit) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.SHAREPOINT_REQUEST_TIMEOUT_MS);
  const startedAt = Date.now();
  const method = init.method || "GET";

  logger.info("sharepoint", "SharePoint request started", {
    method,
    url,
    timeoutMs: env.SHAREPOINT_REQUEST_TIMEOUT_MS,
    headers: init.headers,
    ...describeBody(init.body)
  });

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    logger.info("sharepoint", "SharePoint request finished", {
      method,
      url,
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      durationMs: Date.now() - startedAt
    });
    return response;
  } catch (error) {
    logger.error("sharepoint", "SharePoint request failed", {
      method,
      url,
      durationMs: Date.now() - startedAt,
      error
    });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

const absoluteFileUrl = (paths: SiteBuilderResolvedPaths, serverRelativePath: string) =>
  encodeSpaces(`https://${paths.host}${serverRelativePath}`);

const siteApiUrl = (paths: SiteBuilderResolvedPaths, suffix: string) =>
  encodeSpaces(`https://${paths.host}${paths.siteRoot}${suffix}`);

const siteRootApiUrl = (paths: SiteBuilderResolvedPaths, siteRoot: string, suffix: string) =>
  encodeSpaces(`https://${paths.host}${siteRoot === "/" ? "" : siteRoot}${suffix}`);

const sha256Bytes = (bytes: Uint8Array) => crypto.createHash("sha256").update(bytes).digest("hex");

const responseHeader = (response: Response, name: string) => response.headers.get(name) || undefined;

const stringOrUndefined = (value: unknown) => {
  if (value === undefined || value === null || value === "") return undefined;
  return String(value);
};

const numberOrUndefined = (value: unknown) => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const lastPathSegment = (serverRelativeUrl: string) => {
  const segment = serverRelativeUrl.split("/").filter(Boolean).pop() || serverRelativeUrl;
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
};

const serverRelativeUrlFromRow = (row: any) =>
  stringOrUndefined(row?.ServerRelativeUrl) ||
  stringOrUndefined(row?.serverRelativeUrl) ||
  stringOrUndefined(row?.ServerRelativePath?.DecodedUrl) ||
  stringOrUndefined(row?.serverRelativePath?.decodedUrl) ||
  "";

const collectionResults = (payload: any, collectionKey: "Folders" | "Files") => {
  if (Array.isArray(payload?.value)) return payload.value;
  if (Array.isArray(payload?.d?.results)) return payload.d.results;
  if (Array.isArray(payload?.d?.[collectionKey]?.results)) return payload.d[collectionKey].results;
  if (Array.isArray(payload?.[collectionKey]?.results)) return payload[collectionKey].results;
  return [];
};

const getSharePointCollectionPayload = async (
  paths: SiteBuilderResolvedPaths,
  serverRelativePath: string,
  suffix: string,
  collectionKind: "folders" | "files"
): Promise<SharePointListStatus & { payload?: unknown }> => {
  const url = siteApiUrl(paths, suffix);
  logger.info("sharepoint", `Listing SharePoint ${collectionKind}`, { serverRelativePath, url });

  try {
    const response = await withTimeout(url, {
      method: "GET",
      headers: getSharePointReadHeaders("application/json;odata=verbose"),
      redirect: "follow"
    });
    const base: SharePointListStatus = {
      serverRelativePath,
      url,
      checkedAt: new Date().toISOString(),
      exists: response.ok,
      status: response.status,
      statusText: response.statusText,
      authBlocked: response.status === 401 || response.status === 403
    };

    if (!response.ok) {
      const error = `sharepoint-list-${collectionKind}-failed:${response.status}:${serverRelativePath}`;
      logger.warn("sharepoint", `SharePoint ${collectionKind} list failed`, {
        serverRelativePath,
        status: response.status,
        statusText: response.statusText,
        authBlocked: base.authBlocked
      });
      return { ...base, error };
    }

    try {
      return { ...base, payload: await response.json() };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn("sharepoint", `SharePoint ${collectionKind} list JSON parse failed`, {
        serverRelativePath,
        error: message
      });
      return { ...base, error: message };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("sharepoint", `SharePoint ${collectionKind} list request failed`, {
      serverRelativePath,
      error: message
    });
    return {
      serverRelativePath,
      url,
      checkedAt: new Date().toISOString(),
      exists: false,
      error: message
    };
  }
};

export const getSharePointOperationCapabilities = (): SharePointOperationCapabilities => {
  const dangerousWriteGateBypassEnvVar = getDangerousValidationBypassEnvVar("sharepoint-write-gates");
  const dangerousWriteGateBypass = Boolean(dangerousWriteGateBypassEnvVar);
  const reason = dangerousWriteGateBypass
    ? `${dangerousWriteGateBypassEnvVar}=true is ignored. ${SERVER_SHAREPOINT_REST_DISABLED_REASON}`
    : SERVER_SHAREPOINT_REST_DISABLED_REASON;

  const capabilities: SharePointOperationCapabilities = {
    readAvailable: false,
    readUsesAuthMaterial: false,
    configured: {
      writeEnabled: env.SHAREPOINT_WRITE_ENABLED,
      authCookieConfigured: Boolean(env.SHAREPOINT_AUTH_COOKIE),
      bearerTokenConfigured: Boolean(env.SHAREPOINT_BEARER_TOKEN),
      unauthenticatedWriteBypassEnabled: env.SHAREPOINT_ALLOW_UNAUTHENTICATED_WRITE,
      dangerousWriteGateBypassEnabled: dangerousWriteGateBypass,
      dangerousWriteGateBypassEnvVar: dangerousWriteGateBypassEnvVar || undefined
    },
    writeEnabled: false,
    hasAuthMaterial: false,
    unauthenticatedWriteAllowed: false,
    writeAvailable: false,
    writeVerified: false,
    authMode: "none",
    authModes: [],
    requestTimeoutMs: env.SHAREPOINT_REQUEST_TIMEOUT_MS,
    digest: {
      requiredForWrites: true,
      endpointSuffix: "/_api/contextinfo",
      canRequest: false,
      reason
    },
    siteCreation: {
      modernSiteCollectionEndpoint: "/_api/SPSiteManager/create",
      statusEndpoint: "/_api/SPSiteManager/status",
      canCreate: false,
      pollAttempts: env.SHAREPOINT_SITE_CREATE_POLL_ATTEMPTS,
      pollIntervalMs: env.SHAREPOINT_SITE_CREATE_POLL_INTERVAL_MS,
      reason
    },
    reason
  };
  logger.debug("sharepoint", "SharePoint capabilities evaluated", capabilities);
  return capabilities;
};

export const assertSharePointWriteAvailable = () => {
  const capabilities = getSharePointOperationCapabilities();
  logger.warn("sharepoint", "Server SharePoint write capability is disabled", capabilities);
  throw new SharePointWriteCapabilityError(capabilities.reason || SERVER_SHAREPOINT_REST_DISABLED_REASON);
};

export async function readSharePointTextFile(paths: SiteBuilderResolvedPaths, serverRelativePath: string): Promise<SharePointTextFile> {
  assertServerSharePointRestDisabled();
  const url = absoluteFileUrl(paths, serverRelativePath);
  logger.info("sharepoint", "Reading SharePoint text file", { serverRelativePath, url });
  const response = await withTimeout(url, {
    method: "GET",
    headers: getSharePointReadHeaders("text/plain, application/json, */*"),
    redirect: "follow"
  });

  if (!response.ok) {
    throw new Error(`sharepoint-read-failed:${response.status}:${serverRelativePath}`);
  }

  const text = await response.text();
  logger.info("sharepoint", "SharePoint text file read", {
    serverRelativePath,
    sizeBytes: new TextEncoder().encode(text).length
  });
  return {
    path: serverRelativePath,
    text,
    sizeBytes: new TextEncoder().encode(text).length
  };
}

export async function readSharePointFileBytes(
  paths: SiteBuilderResolvedPaths,
  serverRelativePath: string
): Promise<SharePointFileBytes> {
  assertServerSharePointRestDisabled();
  const url = absoluteFileUrl(paths, serverRelativePath);
  logger.info("sharepoint", "Reading SharePoint file bytes", { serverRelativePath, url });
  const response = await withTimeout(url, {
    method: "GET",
    headers: getSharePointReadHeaders("application/octet-stream, text/plain, application/json, */*"),
    redirect: "follow"
  });

  const baseEvidence = {
    serverRelativePath,
    url,
    checkedAt: new Date().toISOString(),
    httpStatus: response.status,
    httpStatusText: response.statusText,
    contentType: responseHeader(response, "content-type"),
    etag: responseHeader(response, "etag"),
    lastModified: responseHeader(response, "last-modified")
  };

  if (!response.ok) {
    const evidence: SharePointFileEvidence = {
      ...baseEvidence,
      status: "failed",
      readOk: false,
      matchesExpected: false,
      error: `sharepoint-byte-read-failed:${response.status}:${serverRelativePath}`
    };
    const error = new Error(evidence.error);
    (error as Error & { evidence?: SharePointFileEvidence }).evidence = evidence;
    throw error;
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  const sha256 = sha256Bytes(bytes);
  const evidence: SharePointFileEvidence = {
    ...baseEvidence,
    status: "verified",
    readOk: true,
    matchesExpected: true,
    sizeBytes: bytes.byteLength,
    sha256
  };

  logger.info("sharepoint", "SharePoint file bytes read", {
    serverRelativePath,
    sizeBytes: evidence.sizeBytes,
    sha256
  });

  return {
    serverRelativePath,
    url,
    bytes,
    sizeBytes: bytes.byteLength,
    sha256,
    evidence
  };
}

export async function readSharePointFileEvidence(
  paths: SiteBuilderResolvedPaths,
  serverRelativePath: string,
  expected: SharePointFileExpectedEvidence = {}
): Promise<SharePointFileEvidence> {
  try {
    const file = await readSharePointFileBytes(paths, serverRelativePath);
    const expectedSha256 = expected.sha256?.toLowerCase();
    const sizeMatches = expected.sizeBytes === undefined || file.sizeBytes === expected.sizeBytes;
    const sha256Matches = !expectedSha256 || file.sha256.toLowerCase() === expectedSha256;
    const matchesExpected = sizeMatches && sha256Matches;

    const evidence: SharePointFileEvidence = {
      ...file.evidence,
      expectedSizeBytes: expected.sizeBytes,
      expectedSha256: expected.sha256,
      sizeMatches,
      sha256Matches,
      matchesExpected,
      status: matchesExpected ? "verified" : "failed"
    };

    logger.info("sharepoint", "SharePoint file evidence read", {
      serverRelativePath,
      status: evidence.status,
      sizeBytes: evidence.sizeBytes,
      expectedSizeBytes: evidence.expectedSizeBytes,
      sha256Matches: evidence.sha256Matches,
      sizeMatches: evidence.sizeMatches
    });

    return evidence;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const readError = (error as Error & { evidence?: SharePointFileEvidence }).evidence;
    const evidence: SharePointFileEvidence = {
      ...readError,
      serverRelativePath,
      url: readError?.url || absoluteFileUrl(paths, serverRelativePath),
      checkedAt: readError?.checkedAt || new Date().toISOString(),
      status: "failed",
      readOk: false,
      matchesExpected: false,
      expectedSizeBytes: expected.sizeBytes,
      expectedSha256: expected.sha256,
      error: readError?.error || message
    };

    logger.warn("sharepoint", "SharePoint file evidence failed", {
      serverRelativePath,
      expectedSizeBytes: expected.sizeBytes,
      expectedSha256: expected.sha256,
      error: message
    });

    return evidence;
  }
}

export async function readSharePointJsonApi(paths: SiteBuilderResolvedPaths, suffix: string) {
  assertServerSharePointRestDisabled();
  logger.info("sharepoint", "Reading SharePoint JSON API", { suffix });
  const response = await withTimeout(siteApiUrl(paths, suffix), {
    method: "GET",
    headers: getSharePointReadHeaders("application/json;odata=verbose"),
    redirect: "follow"
  });

  if (!response.ok) {
    throw new Error(`sharepoint-api-read-failed:${response.status}:${suffix}`);
  }

  const payload = await response.json();
  logger.debug("sharepoint", "SharePoint JSON API payload received", {
    suffix,
    payload: logger.isPayloadLoggingEnabled() ? payload : undefined
  });
  return payload;
}

export async function listSharePointFolders(
  paths: SiteBuilderResolvedPaths,
  serverRelativeFolder: string
): Promise<SharePointFolderListResult> {
  assertServerSharePointRestDisabled();
  const escapedFolder = escapeODataString(serverRelativeFolder);
  const result = await getSharePointCollectionPayload(
    paths,
    serverRelativeFolder,
    `/_api/web/GetFolderByServerRelativeUrl('${escapedFolder}')/Folders?$select=Name,ServerRelativeUrl,ItemCount,TimeCreated,TimeLastModified,UniqueId&$orderby=TimeLastModified desc&$top=5000`,
    "folders"
  );
  const folders = result.payload
    ? collectionResults(result.payload, "Folders").map((row: any) => {
      const serverRelativeUrl = serverRelativeUrlFromRow(row);
      return {
        name: stringOrUndefined(row?.Name) || lastPathSegment(serverRelativeUrl),
        serverRelativeUrl,
        url: absoluteFileUrl(paths, serverRelativeUrl),
        itemCount: numberOrUndefined(row?.ItemCount),
        timeCreated: stringOrUndefined(row?.TimeCreated),
        timeLastModified: stringOrUndefined(row?.TimeLastModified),
        uniqueId: stringOrUndefined(row?.UniqueId)
      };
    }).filter((folder: SharePointFolderMetadata) => Boolean(folder.serverRelativeUrl))
    : [];
  const { payload: _payload, ...status } = result;

  logger.info("sharepoint", "SharePoint folder inventory listed", {
    serverRelativeFolder,
    exists: status.exists,
    foldersCount: folders.length,
    status: status.status,
    authBlocked: status.authBlocked
  });

  return { ...status, folders };
}

export async function listSharePointFiles(
  paths: SiteBuilderResolvedPaths,
  serverRelativeFolder: string
): Promise<SharePointFileListResult> {
  assertServerSharePointRestDisabled();
  const escapedFolder = escapeODataString(serverRelativeFolder);
  const result = await getSharePointCollectionPayload(
    paths,
    serverRelativeFolder,
    `/_api/web/GetFolderByServerRelativeUrl('${escapedFolder}')/Files?$select=Name,ServerRelativeUrl,Length,TimeCreated,TimeLastModified,UniqueId&$orderby=TimeLastModified desc&$top=5000`,
    "files"
  );
  const files = result.payload
    ? collectionResults(result.payload, "Files").map((row: any) => {
      const serverRelativeUrl = serverRelativeUrlFromRow(row);
      return {
        name: stringOrUndefined(row?.Name) || lastPathSegment(serverRelativeUrl),
        serverRelativeUrl,
        url: absoluteFileUrl(paths, serverRelativeUrl),
        sizeBytes: numberOrUndefined(row?.Length),
        timeCreated: stringOrUndefined(row?.TimeCreated),
        timeLastModified: stringOrUndefined(row?.TimeLastModified),
        uniqueId: stringOrUndefined(row?.UniqueId),
        etag: stringOrUndefined(row?.ETag) || stringOrUndefined(row?.Etag) || stringOrUndefined(row?.__metadata?.etag),
        contentType: stringOrUndefined(row?.MimeType)
      };
    }).filter((file: SharePointFileMetadata) => Boolean(file.serverRelativeUrl))
    : [];
  const { payload: _payload, ...status } = result;

  logger.info("sharepoint", "SharePoint file inventory listed", {
    serverRelativeFolder,
    exists: status.exists,
    filesCount: files.length,
    status: status.status,
    authBlocked: status.authBlocked
  });

  return { ...status, files };
}

export async function postSharePointJsonApi(
  paths: SiteBuilderResolvedPaths,
  suffix: string,
  body?: unknown,
  digest?: string
) {
  assertSharePointWriteAvailable();
  const requestDigest = digest || await getRequestDigest(paths);
  logger.info("sharepoint", "Posting SharePoint JSON API", {
    suffix,
    hasBody: body !== undefined,
    body: logger.isPayloadLoggingEnabled() ? body : undefined
  });

  const response = await withTimeout(siteApiUrl(paths, suffix), {
    method: "POST",
    headers: {
      Accept: "application/json;odata=verbose",
      "Content-Type": "application/json;odata=verbose",
      "X-RequestDigest": requestDigest,
      ...authHeaders()
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`sharepoint-api-post-failed:${response.status}:${suffix}`);
  }

  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function postSharePointJsonApiWithHeaders(
  paths: SiteBuilderResolvedPaths,
  suffix: string,
  body: unknown,
  headers: Record<string, string>,
  digest?: string
) {
  assertSharePointWriteAvailable();
  const requestDigest = digest || await getRequestDigest(paths);
  logger.info("sharepoint", "Posting SharePoint JSON API with write headers", {
    suffix,
    headerNames: Object.keys(headers),
    hasBody: body !== undefined,
    body: logger.isPayloadLoggingEnabled() ? body : undefined
  });

  const response = await withTimeout(siteApiUrl(paths, suffix), {
    method: "POST",
    headers: {
      Accept: "application/json;odata=verbose",
      "Content-Type": "application/json;odata=verbose",
      "X-RequestDigest": requestDigest,
      ...headers,
      ...authHeaders()
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`sharepoint-api-write-failed:${response.status}:${suffix}`);
  }

  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

const payloadData = (payload: any) => payload?.d || payload;

const ensuredUserFromPayload = (payload: unknown, fallbackLoginName: string): SharePointEnsuredUser => {
  const user = payloadData(payload);
  const id = numberOrUndefined(user?.Id || user?.id);
  const loginName = stringOrUndefined(user?.LoginName) || stringOrUndefined(user?.loginName) || fallbackLoginName;
  return {
    id,
    displayName: stringOrUndefined(user?.Title) || stringOrUndefined(user?.title) || stringOrUndefined(user?.displayName) || "",
    email: stringOrUndefined(user?.Email) || stringOrUndefined(user?.email) || "",
    loginName,
    raw: payload
  };
};

export async function ensureSharePointUser(
  paths: SiteBuilderResolvedPaths,
  loginName: string,
  digest?: string
): Promise<SharePointEnsuredUser> {
  assertSharePointWriteAvailable();
  const normalizedLogin = String(loginName || "").trim();
  if (!normalizedLogin) throw new Error("sharepoint-user-login-required");

  logger.info("sharepoint", "Ensuring SharePoint user", {
    loginName: logger.isPayloadLoggingEnabled() ? normalizedLogin : "[REDACTED]"
  });
  const payload = await postSharePointJsonApi(paths, "/_api/web/ensureuser", { logonName: normalizedLogin }, digest);
  const ensured = ensuredUserFromPayload(payload, normalizedLogin);
  if (!ensured.loginName) throw new Error("sharepoint-user-login-missing");

  logger.info("sharepoint", "SharePoint user ensured", {
    userId: ensured.id,
    hasEmail: Boolean(ensured.email),
    hasDisplayName: Boolean(ensured.displayName)
  });
  return ensured;
}

export async function setSharePointSiteCollectionAdmin(
  paths: SiteBuilderResolvedPaths,
  user: Pick<SharePointEnsuredUser, "id" | "loginName"> | string,
  isSiteAdmin: boolean,
  digest?: string
) {
  assertSharePointWriteAvailable();
  const userId = typeof user === "string" ? undefined : numberOrUndefined(user.id);
  const loginName = typeof user === "string" ? String(user || "").trim() : String(user.loginName || "").trim();
  const suffix = userId
    ? `/_api/web/getuserbyid(${userId})`
    : `/_api/web/siteusers/getbyloginname(@v)?@v='${encodeODataUrlValue(loginName)}'`;

  if (!userId && !loginName) throw new Error("sharepoint-user-login-required");

  logger.info("sharepoint", "Setting SharePoint site collection admin flag", {
    userId,
    hasLoginName: Boolean(loginName),
    isSiteAdmin
  });
  await postSharePointJsonApiWithHeaders(
    paths,
    suffix,
    {
      __metadata: { type: "SP.User" },
      IsSiteAdmin: isSiteAdmin
    },
    {
      "IF-MATCH": "*",
      "X-HTTP-Method": "MERGE"
    },
    digest
  );
  logger.info("sharepoint", "SharePoint site collection admin flag updated", {
    userId,
    hasLoginName: Boolean(loginName),
    isSiteAdmin
  });
}

export async function getAssociatedOwnerGroupId(paths: SiteBuilderResolvedPaths): Promise<SharePointAssociatedGroup> {
  const payload = await readSharePointJsonApi(paths, "/_api/web/associatedownergroup?$select=Id,Title");
  const group = payloadData(payload);
  const id = numberOrUndefined(group?.Id || group?.id);
  if (!id) throw new Error("owners-group-id-missing");

  return {
    id,
    title: stringOrUndefined(group?.Title) || stringOrUndefined(group?.title) || "",
    raw: payload
  };
}

const assertGroupId = (groupId: number) => {
  if (!Number.isFinite(groupId) || groupId <= 0) throw new Error("owners-group-id-missing");
};

export async function addSharePointUserToGroup(
  paths: SiteBuilderResolvedPaths,
  groupId: number,
  loginName: string,
  digest?: string
) {
  assertSharePointWriteAvailable();
  assertGroupId(groupId);
  const normalizedLogin = String(loginName || "").trim();
  if (!normalizedLogin) throw new Error("sharepoint-user-login-required");

  logger.info("sharepoint", "Adding SharePoint user to group", { groupId });
  await postSharePointJsonApi(
    paths,
    `/_api/web/sitegroups(${groupId})/users`,
    {
      __metadata: { type: "SP.User" },
      LoginName: normalizedLogin
    },
    digest
  );
  logger.info("sharepoint", "SharePoint user added to group", { groupId });
}

export async function removeSharePointUserFromGroup(
  paths: SiteBuilderResolvedPaths,
  groupId: number,
  loginName: string,
  digest?: string
) {
  assertSharePointWriteAvailable();
  assertGroupId(groupId);
  const normalizedLogin = String(loginName || "").trim();
  if (!normalizedLogin) throw new Error("sharepoint-user-login-required");

  logger.info("sharepoint", "Removing SharePoint user from group", { groupId });
  await postSharePointJsonApi(
    paths,
    `/_api/web/sitegroups(${groupId})/users/removebyloginname(@v)?@v='${encodeODataUrlValue(normalizedLogin)}'`,
    undefined,
    digest
  );
  logger.info("sharepoint", "SharePoint user removed from group", { groupId });
}

export async function getRequestDigest(paths: SiteBuilderResolvedPaths) {
  assertSharePointWriteAvailable();
  logger.info("sharepoint", "Requesting SharePoint digest", { host: paths.host, siteRoot: paths.siteRoot });

  const response = await withTimeout(siteApiUrl(paths, "/_api/contextinfo"), {
    method: "POST",
    headers: {
      Accept: "application/json;odata=verbose",
      "Content-Type": "application/json;odata=verbose",
      ...authHeaders()
    }
  });

  if (!response.ok) {
    throw new Error(`sharepoint-digest-failed:${response.status}`);
  }

  const payload = await response.json() as any;
  const digest =
    payload?.d?.GetContextWebInformation?.FormDigestValue ||
    payload?.GetContextWebInformation?.FormDigestValue ||
    payload?.FormDigestValue;

  if (!digest) throw new Error("sharepoint-digest-missing");
  logger.debug("sharepoint", "SharePoint digest received", { host: paths.host, siteRoot: paths.siteRoot, digest });
  return String(digest);
}

async function getRequestDigestForSiteRoot(paths: SiteBuilderResolvedPaths, siteRoot: string) {
  assertSharePointWriteAvailable();
  logger.info("sharepoint", "Requesting SharePoint digest for site root", { host: paths.host, siteRoot });

  const response = await withTimeout(siteRootApiUrl(paths, siteRoot, "/_api/contextinfo"), {
    method: "POST",
    headers: {
      Accept: "application/json;odata=verbose",
      "Content-Type": "application/json;odata=verbose",
      ...authHeaders()
    }
  });

  if (!response.ok) {
    throw new Error(`sharepoint-digest-failed:${response.status}:${siteRoot}`);
  }

  const payload = await response.json() as any;
  const digest =
    payload?.d?.GetContextWebInformation?.FormDigestValue ||
    payload?.GetContextWebInformation?.FormDigestValue ||
    payload?.FormDigestValue;

  if (!digest) throw new Error("sharepoint-digest-missing");
  logger.debug("sharepoint", "SharePoint digest received for site root", { host: paths.host, siteRoot, digest });
  return String(digest);
}

const compactRecord = (value: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== ""));

const siteStatusName = (status?: number): SharePointSiteCreationStatusName => {
  switch (status) {
    case 0:
      return "not-found";
    case 1:
      return "provisioning";
    case 2:
      return "ready";
    case 3:
      return "error";
    case 4:
      return "already-exists";
    default:
      return "unknown";
  }
};

const extractSiteCreationStatusPayload = (payload: any) => {
  const value = payload?.d || payload?.value || payload;
  return {
    siteId: stringOrUndefined(value?.SiteId || value?.siteId),
    siteStatus: numberOrUndefined(value?.SiteStatus ?? value?.siteStatus),
    siteUrl: stringOrUndefined(value?.SiteUrl || value?.siteUrl),
    raw: payload
  };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function readSharePointSiteCollectionStatus(paths: SiteBuilderResolvedPaths): Promise<SharePointSiteCreationStatus> {
  assertServerSharePointRestDisabled();
  const encodedTargetUrl = encodeURIComponent(paths.sharePointSiteUrl);
  const endpoint = siteRootApiUrl(paths, "/", `/_api/SPSiteManager/status?url='${encodedTargetUrl}'`);
  logger.info("sharepoint", "Reading SharePoint site creation status", {
    targetUrl: paths.sharePointSiteUrl,
    endpoint
  });

  try {
    const response = await withTimeout(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json;odata.metadata=none",
        "odata-version": "4.0",
        ...authHeaders()
      },
      redirect: "follow"
    });

    const base = {
      checkedAt: new Date().toISOString(),
      url: paths.sharePointSiteUrl,
      endpoint,
      ok: response.ok,
      httpStatus: response.status,
      httpStatusText: response.statusText
    };

    if (!response.ok) {
      const error = `sharepoint-site-status-failed:${response.status}:${paths.sharePointSiteUrl}`;
      logger.warn("sharepoint", "SharePoint site creation status failed", {
        targetUrl: paths.sharePointSiteUrl,
        status: response.status,
        statusText: response.statusText
      });
      return { ...base, statusName: "unknown", error };
    }

    const payload = await response.json();
    const extracted = extractSiteCreationStatusPayload(payload);
    const status: SharePointSiteCreationStatus = {
      ...base,
      ...extracted,
      statusName: siteStatusName(extracted.siteStatus)
    };
    logger.info("sharepoint", "SharePoint site creation status read", {
      targetUrl: paths.sharePointSiteUrl,
      siteStatus: status.siteStatus,
      statusName: status.statusName,
      siteId: status.siteId
    });
    return status;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("sharepoint", "SharePoint site creation status request failed", {
      targetUrl: paths.sharePointSiteUrl,
      error: message
    });
    return {
      checkedAt: new Date().toISOString(),
      url: paths.sharePointSiteUrl,
      endpoint,
      ok: false,
      statusName: "unknown",
      error: message
    };
  }
}

async function createSharePointSiteCollection(
  paths: SiteBuilderResolvedPaths,
  input: SharePointSiteCollectionCreateInput,
  digest?: string
) {
  assertSharePointWriteAvailable();
  const requestDigest = digest || await getRequestDigestForSiteRoot(paths, "/");
  const request = compactRecord({
    Title: input.title,
    Url: paths.sharePointSiteUrl,
    Lcid: input.lcid ?? 1033,
    ShareByEmailEnabled: input.shareByEmailEnabled ?? false,
    Classification: input.classification,
    SensitivityLabel: input.sensitivityLabel,
    Description: input.description || "",
    WebTemplate: input.webTemplate || "STS#3",
    SiteDesignId: input.siteDesignId,
    Owner: input.owner,
    WebTemplateExtensionId: input.webTemplateExtensionId
  });
  const endpoint = siteRootApiUrl(paths, "/", "/_api/SPSiteManager/create");

  logger.warn("sharepoint", "Creating SharePoint site collection", {
    targetUrl: paths.sharePointSiteUrl,
    endpoint,
    request: logger.isPayloadLoggingEnabled() ? request : compactRecord({
      Title: request.Title,
      Url: request.Url,
      Lcid: request.Lcid,
      WebTemplate: request.WebTemplate,
      hasOwner: Boolean(request.Owner)
    })
  });

  const response = await withTimeout(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json;odata.metadata=none",
      "Content-Type": "application/json;odata.metadata=none",
      "odata-version": "4.0",
      "X-RequestDigest": requestDigest,
      ...authHeaders()
    },
    body: JSON.stringify({ request })
  });

  const text = await response.text();
  let payload: unknown = {};
  if (text.trim()) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
  }

  if (!response.ok) {
    logger.error("sharepoint", "SharePoint site collection create failed", {
      targetUrl: paths.sharePointSiteUrl,
      status: response.status,
      statusText: response.statusText,
      response: logger.isPayloadLoggingEnabled() ? payload : undefined
    });
    throw new Error(`sharepoint-site-create-failed:${response.status}:${paths.sharePointSiteUrl}`);
  }

  logger.info("sharepoint", "SharePoint site collection create request accepted", {
    targetUrl: paths.sharePointSiteUrl,
    response: logger.isPayloadLoggingEnabled() ? payload : undefined
  });

  return { request, response: payload };
}

export async function ensureSharePointSiteCollection(
  paths: SiteBuilderResolvedPaths,
  input: SharePointSiteCollectionCreateInput
): Promise<SharePointSiteCollectionEnsureResult> {
  assertSharePointWriteAvailable();
  logger.info("sharepoint", "Ensuring SharePoint site collection", {
    targetUrl: paths.sharePointSiteUrl,
    siteRoot: paths.siteRoot
  });

  const statusBefore = await readSharePointSiteCollectionStatus(paths);
  if (statusBefore.statusName === "ready" || statusBefore.statusName === "already-exists") {
    return {
      action: "already-exists",
      targetUrl: paths.sharePointSiteUrl,
      statusBefore,
      statusAfter: statusBefore,
      polls: []
    };
  }

  if (statusBefore.statusName === "error") {
    throw new Error(`sharepoint-site-status-error:${paths.sharePointSiteUrl}`);
  }

  const digest = await getRequestDigestForSiteRoot(paths, "/");
  const createResult = statusBefore.statusName === "provisioning"
    ? undefined
    : await createSharePointSiteCollection(paths, input, digest);
  const polls: SharePointSiteCreationStatus[] = [];

  for (let attempt = 0; attempt < env.SHAREPOINT_SITE_CREATE_POLL_ATTEMPTS; attempt += 1) {
    const current = await readSharePointSiteCollectionStatus(paths);
    polls.push(current);

    if (current.statusName === "ready" || current.statusName === "already-exists") {
      return {
        action: createResult ? "created" : "already-exists",
        targetUrl: paths.sharePointSiteUrl,
        createRequest: createResult?.request,
        createResponse: createResult?.response,
        statusBefore,
        statusAfter: current,
        polls
      };
    }

    if (current.statusName === "error") {
      throw new Error(`sharepoint-site-create-status-error:${paths.sharePointSiteUrl}`);
    }

    if (attempt < env.SHAREPOINT_SITE_CREATE_POLL_ATTEMPTS - 1) {
      await sleep(env.SHAREPOINT_SITE_CREATE_POLL_INTERVAL_MS);
    }
  }

  const last = polls[polls.length - 1] || statusBefore;
  logger.error("sharepoint", "SharePoint site collection create timed out", {
    targetUrl: paths.sharePointSiteUrl,
    lastStatus: last.statusName,
    siteStatus: last.siteStatus,
    attempts: env.SHAREPOINT_SITE_CREATE_POLL_ATTEMPTS
  });
  throw new Error(`sharepoint-site-create-timeout:${paths.sharePointSiteUrl}:${last.statusName}`);
}

async function createFolder(paths: SiteBuilderResolvedPaths, digest: string, serverRelativeFolder: string) {
  logger.info("sharepoint", "Creating SharePoint folder if missing", { serverRelativeFolder });
  const response = await withTimeout(siteApiUrl(paths, "/_api/web/folders"), {
    method: "POST",
    headers: {
      Accept: "application/json;odata=verbose",
      "Content-Type": "application/json;odata=verbose",
      "X-RequestDigest": digest,
      ...authHeaders()
    },
    body: JSON.stringify({
      __metadata: { type: "SP.Folder" },
      ServerRelativeUrl: serverRelativeFolder
    })
  });

  if (response.ok || response.status === 409) return;
  throw new Error(`sharepoint-create-folder-failed:${response.status}:${serverRelativeFolder}`);
}

const parentFolder = (serverRelativePath: string) =>
  serverRelativePath.split("/").filter(Boolean).slice(0, -1).join("/");

const createableFolderChain = (paths: SiteBuilderResolvedPaths, serverRelativeFolder: string) => {
  const normalized = serverRelativeFolder.startsWith("/") ? serverRelativeFolder : `/${serverRelativeFolder}`;
  const bootstrapLibraryRoot = `${paths.siteRoot}/${paths.bootstrapLibrary}`.replace(/\/+/g, "/");
  const roots = [paths.siteDbRoot, paths.usersDbRoot, bootstrapLibraryRoot].sort((a, b) => b.length - a.length);
  const root = roots.find((candidate) => normalized === candidate || normalized.startsWith(`${candidate}/`));

  if (!root || normalized === root) return [];

  const suffix = normalized.slice(root.length).split("/").filter(Boolean);
  const chain: string[] = [];
  let current = root;
  for (const segment of suffix) {
    current = `${current}/${segment}`;
    chain.push(current);
  }

  return chain;
};

export async function ensureSharePointFolderHierarchy(paths: SiteBuilderResolvedPaths, serverRelativeFolder: string, digest?: string) {
  assertSharePointWriteAvailable();
  const requestDigest = digest || await getRequestDigest(paths);
  const chain = createableFolderChain(paths, serverRelativeFolder);
  logger.info("sharepoint", "Ensuring SharePoint folder hierarchy", {
    serverRelativeFolder,
    foldersToCreate: chain,
    count: chain.length
  });

  for (const folder of chain) {
    await createFolder(paths, requestDigest, folder);
  }
}

export async function writeSharePointTextFile(
  paths: SiteBuilderResolvedPaths,
  serverRelativePath: string,
  text: string,
  digest?: string
) {
  assertSharePointWriteAvailable();
  const requestDigest = digest || await getRequestDigest(paths);
  const folder = `/${parentFolder(serverRelativePath)}`;
  logger.info("sharepoint", "Writing SharePoint text file", {
    serverRelativePath,
    folder,
    sizeBytes: new TextEncoder().encode(text).length
  });
  await ensureSharePointFolderHierarchy(paths, folder, requestDigest);

  const response = await withTimeout(absoluteFileUrl(paths, serverRelativePath), {
    method: "PUT",
    headers: {
      Accept: "application/json;odata=verbose",
      "Content-Type": "text/plain;charset=utf-8",
      "X-RequestDigest": requestDigest,
      ...authHeaders()
    },
    body: text
  });

  if (!response.ok) {
    throw new Error(`sharepoint-write-file-failed:${response.status}:${serverRelativePath}`);
  }
  logger.info("sharepoint", "SharePoint text file written", { serverRelativePath });
}

export async function uploadSharePointFile(
  paths: SiteBuilderResolvedPaths,
  serverRelativePath: string,
  bytes: Uint8Array,
  contentType = "application/octet-stream",
  digest?: string
) {
  assertSharePointWriteAvailable();
  const requestDigest = digest || await getRequestDigest(paths);
  const folder = `/${parentFolder(serverRelativePath)}`;
  logger.info("sharepoint", "Uploading SharePoint file", {
    serverRelativePath,
    folder,
    contentType,
    sizeBytes: bytes.byteLength
  });
  await ensureSharePointFolderHierarchy(paths, folder, requestDigest);

  const fileName = serverRelativePath.split("/").filter(Boolean).pop();
  if (!fileName) throw new Error(`sharepoint-upload-file-missing-name:${serverRelativePath}`);

  const uploadUrl = siteApiUrl(
    paths,
    `/_api/web/GetFolderByServerRelativeUrl('${escapeODataString(folder)}')/Files/add(url='${encodeURIComponent(fileName)}',overwrite=true)`
  );

  const response = await withTimeout(uploadUrl, {
    method: "POST",
    headers: {
      Accept: "application/json;odata=verbose",
      "Content-Type": contentType,
      "X-RequestDigest": requestDigest,
      ...authHeaders()
    },
    body: Buffer.from(bytes)
  });

  if (!response.ok) {
    throw new Error(`sharepoint-upload-file-failed:${response.status}:${serverRelativePath}`);
  }
  logger.info("sharepoint", "SharePoint file uploaded", { serverRelativePath, sizeBytes: bytes.byteLength });
}

export async function ensureSharePointTextFile(
  paths: SiteBuilderResolvedPaths,
  serverRelativePath: string,
  defaultText: string,
  digest?: string
) {
  logger.info("sharepoint", "Ensuring SharePoint text file exists", { serverRelativePath });
  try {
    await readSharePointTextFile(paths, serverRelativePath);
    logger.debug("sharepoint", "SharePoint text file already exists", { serverRelativePath });
    return { created: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.startsWith("sharepoint-read-failed:404:")) throw error;
  }

  await writeSharePointTextFile(paths, serverRelativePath, defaultText, digest);
  logger.info("sharepoint", "SharePoint text file created", { serverRelativePath });
  return { created: true };
}

export async function ensureDocumentLibrary(paths: SiteBuilderResolvedPaths, libraryTitle: string, digest?: string) {
  assertSharePointWriteAvailable();
  const escapedTitle = escapeODataString(libraryTitle);
  logger.info("sharepoint", "Ensuring SharePoint document library", { libraryTitle });
  const check = await withTimeout(
    siteApiUrl(paths, `/_api/web/lists/GetByTitle('${escapedTitle}')?$select=Id,Title,BaseTemplate`),
    {
      method: "GET",
      headers: {
        Accept: "application/json;odata=verbose",
        ...authHeaders()
      }
    }
  );

  if (check.ok) {
    logger.debug("sharepoint", "SharePoint document library already exists", { libraryTitle });
    return { created: false };
  }
  if (check.status !== 404) {
    throw new Error(`sharepoint-library-check-failed:${check.status}:${libraryTitle}`);
  }

  const requestDigest = digest || await getRequestDigest(paths);
  const create = await withTimeout(siteApiUrl(paths, "/_api/web/lists"), {
    method: "POST",
    headers: {
      Accept: "application/json;odata=verbose",
      "Content-Type": "application/json;odata=verbose",
      "X-RequestDigest": requestDigest,
      ...authHeaders()
    },
    body: JSON.stringify({
      __metadata: { type: "SP.List" },
      Title: libraryTitle,
      Description: `Site Builder managed library: ${libraryTitle}`,
      BaseTemplate: 101,
      OnQuickLaunch: true
    })
  });

  if (!create.ok && create.status !== 409) {
    throw new Error(`sharepoint-library-create-failed:${create.status}:${libraryTitle}`);
  }

  logger.info("sharepoint", "SharePoint document library ensure completed", {
    libraryTitle,
    created: create.ok,
    status: create.status
  });
  return { created: create.ok };
}
