import type {
  Backup,
  BackupPlan,
  BackupPlanSource,
  BackupSourceEvidence,
  BackupVerificationEvidence,
  DeploymentFinalAppUrlVerification,
  DeploymentVerificationEvidence,
  ReleaseArtifactFileResponse,
  ReleaseArtifactManifestFile,
  SharePointBackupInventory,
  SharePointBackupInventoryFile,
  SharePointBackupInventoryFolder,
  SharePointHealthEvidence,
  SharePointHealthResult,
  SharePointDiagnosticsCheck
} from "../api/sitesApi";
import type { Site, SiteHealth } from "../types/site";
import { resolveSiteBuilderPaths, type SiteBuilderResolvedPaths } from "./sitebuilderPaths";

export type SharePointConnectorMode = "browser-sharepoint";

export type BrowserSharePointProbe = {
  connectorMode: "browser-sharepoint";
  ok: boolean;
  url: string;
  method: string;
  status?: number;
  statusText?: string;
  error?: string;
  authBlocked?: boolean;
  payloadSummary?: Record<string, unknown>;
};

export type BrowserSharePointDigestProbe = BrowserSharePointProbe & {
  digestFound: boolean;
  digestPreview?: string;
  digestLength?: number;
  cacheKey: string;
  fromCache?: boolean;
};

export type BrowserSharePointDiagnosticsResult = {
  generatedAt: string;
  connectorMode: "browser-sharepoint";
  targetSharePointSiteUrl: string;
  site: Pick<Site, "_id" | "siteCode" | "displayName" | "environment" | "status">;
  currentUser: BrowserSharePointProbe;
  readTest: BrowserSharePointProbe;
  digestTest: BrowserSharePointDigestProbe;
  writeCapability: {
    connectorMode: "browser-sharepoint";
    digestWorks: boolean;
    writeVerified: boolean;
    uploadImplemented: boolean;
    message: string;
  };
  overall: {
    reachable: boolean;
    authenticated: boolean;
    digestWorks: boolean;
    writeVerified: boolean;
    preferredConnectorMode: SharePointConnectorMode;
    failedUrl?: string;
    failedStatus?: number;
    humanExplanation: string;
    suggestedFix: string;
  };
};

export type CombinedSharePointConnectorDiagnostics = {
  preferredConnectorMode: SharePointConnectorMode;
  browserHealthy: boolean;
  backendHealthy: boolean;
  digestWorks: boolean;
  backendBlockedBy401: boolean;
  globalBlocked: boolean;
  message: string;
};

export type BrowserSharePointHealthResult = SharePointHealthResult & {
  connectorMode: "browser-sharepoint";
  targetSharePointSiteUrl: string;
  resolvedPaths: SiteBuilderResolvedPaths;
  source: "Browser SharePoint";
};

export type BrowserSharePointUploadOptions = {
  targetSiteUrl: string;
  targetPath: string;
  relativePath: string;
  body: Blob | ArrayBuffer | Uint8Array;
  contentType?: string;
  expectedSizeBytes?: number;
  expectedSha256?: string;
};

export type BrowserSharePointUploadResult = {
  connectorMode: "browser-sharepoint";
  relativePath: string;
  targetPath: string;
  uploadUrl: string;
  status: "uploaded" | "failed";
  httpStatus?: number;
  httpStatusText?: string;
  etag?: string;
  error?: string;
};

export type BrowserSharePointDeployFile = ReleaseArtifactManifestFile & {
  targetPath: string;
};

export type BrowserSharePointDeployOptions = {
  releaseId: string;
  siteId: string;
  siteCode: string;
  targetSiteUrl: string;
  targetDistPath: string;
  finalAppUrl?: string;
  files: BrowserSharePointDeployFile[];
  loadArtifactFile: (relativePath: string) => Promise<ReleaseArtifactFileResponse>;
  onFileProgress?: (event: {
    siteId: string;
    siteCode: string;
    relativePath: string;
    status: "loading" | "uploading" | "verifying" | "verified" | "failed";
    error?: string;
  }) => void;
};

export type BrowserSharePointDeployResult = {
  releaseId: string;
  siteId: string;
  siteCode: string;
  connectorMode: "browser-sharepoint";
  targetSiteUrl: string;
  targetDistPath: string;
  startedAt: string;
  completedAt: string;
  finalStatus: "success" | "failed";
  uploadedFilesEvidence: DeploymentVerificationEvidence[];
  readBackEvidence: DeploymentVerificationEvidence[];
  finalAppUrlVerification?: DeploymentFinalAppUrlVerification;
  errors: Array<{ relativePath?: string; targetPath?: string; error: string; status?: number }>;
};

export type BrowserSharePointBackupProgressEvent = {
  siteId: string;
  siteCode: string;
  sourcePath?: string;
  targetPath?: string;
  status: "reading" | "uploading" | "verifying" | "verified" | "failed";
  error?: string;
};

export type BrowserSharePointBackupResult = {
  siteId: string;
  siteCode: string;
  connectorMode: "browser-sharepoint";
  targetSiteUrl: string;
  backupId: string;
  target: {
    backupsRoot: string;
    backupFolder: string;
  };
  startedAt: string;
  completedAt: string;
  finalStatus: "success" | "failed";
  sourcePaths: BackupSourceEvidence[];
  verificationEvidence: BackupVerificationEvidence[];
  errors: Array<{ sourcePath?: string; targetPath?: string; error: string; status?: number }>;
};

export type BrowserSharePointBackupOptions = {
  onFileProgress?: (event: BrowserSharePointBackupProgressEvent) => void;
};

type DigestCacheEntry = {
  digest: string;
  expiresAt: number;
  createdAt: number;
};

const ODATA_ACCEPT = "application/json;odata=verbose";
const ODATA_CONTENT_TYPE = "application/json;odata=verbose";
const DIGEST_DEFAULT_TTL_MS = 25 * 60 * 1000;
const DIGEST_SAFETY_MS = 60 * 1000;

const digestCache = new Map<string, DigestCacheEntry>();

const trimTrailingSlash = (value: string) => value.replace(/\/+$/g, "");
const encodeSpaces = (value: string) => value.replace(/ /g, "%20");
const escapeODataString = (value: string) => value.replace(/'/g, "''");

const responseTextSafe = async (response: Response) => {
  try {
    return await response.text();
  } catch {
    return "";
  }
};

const summarizeErrorText = (text: string) => String(text || "").replace(/\s+/g, " ").trim().slice(0, 240);

export function normalizeSharePointSiteUrl(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    parsed.hash = "";
    parsed.search = "";
    return trimTrailingSlash(parsed.toString());
  } catch {
    return trimTrailingSlash(raw);
  }
}

export function buildSharePointApiUrl(targetSiteUrl: string, suffix: string) {
  const siteUrl = normalizeSharePointSiteUrl(targetSiteUrl);
  const normalizedSuffix = suffix.startsWith("/") ? suffix : `/${suffix}`;
  if (!siteUrl) throw new Error("sharepoint-site-url-missing");
  return encodeSpaces(`${siteUrl}${normalizedSuffix}`);
}

export function buildContextInfoUrl(targetSiteUrl: string) {
  return buildSharePointApiUrl(targetSiteUrl, "/_api/contextinfo");
}

export function extractFormDigestValue(payload: any) {
  return String(
    payload?.d?.GetContextWebInformation?.FormDigestValue ||
    payload?.GetContextWebInformation?.FormDigestValue ||
    payload?.d?.FormDigestValue ||
    payload?.FormDigestValue ||
    ""
  );
}

const extractDigestTimeoutSeconds = (payload: any) => {
  const raw =
    payload?.d?.GetContextWebInformation?.FormDigestTimeoutSeconds ??
    payload?.GetContextWebInformation?.FormDigestTimeoutSeconds ??
    payload?.d?.FormDigestTimeoutSeconds ??
    payload?.FormDigestTimeoutSeconds;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const digestPreview = (digest: string) => String(digest || "").slice(0, 10);

const payloadData = (payload: any) => payload?.d || payload;

const odataResults = (payload: any) => {
  const data = payloadData(payload);
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.value)) return data.value;
  if (Array.isArray(payload?.value)) return payload.value;
  return [];
};

const summarizeCurrentUserPayload = (payload: any) => {
  const user = payloadData(payload);
  return {
    id: user?.Id ?? user?.id,
    hasTitle: Boolean(user?.Title || user?.title),
    hasLoginName: Boolean(user?.LoginName || user?.loginName),
    hasEmail: Boolean(user?.Email || user?.email),
    isSiteAdmin: Boolean(user?.IsSiteAdmin ?? user?.isSiteAdmin)
  };
};

async function parseJsonSafe(response: Response) {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

export async function browserSharePointProbe(
  url: string,
  init: RequestInit = {},
  payloadSummary?: (payload: any) => Record<string, unknown>
): Promise<BrowserSharePointProbe> {
  const method = init.method || "GET";
  try {
    const response = await fetch(url, {
      ...init,
      method,
      credentials: "include",
      redirect: init.redirect || "follow"
    });
    const base: BrowserSharePointProbe = {
      connectorMode: "browser-sharepoint",
      ok: response.ok,
      url,
      method,
      status: response.status,
      statusText: response.statusText,
      authBlocked: response.status === 401 || response.status === 403
    };

    if (!response.ok) {
      const text = await responseTextSafe(response);
      return { ...base, error: text ? summarizeErrorText(text) : undefined };
    }

    if (!payloadSummary) return base;
    const payload = await parseJsonSafe(response);
    return {
      ...base,
      payloadSummary: payload ? payloadSummary(payload) : { jsonParsed: false }
    };
  } catch (error) {
    return {
      connectorMode: "browser-sharepoint",
      ok: false,
      url,
      method,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function fetchBrowserDigest(targetSiteUrl: string, forceRefresh = false): Promise<BrowserSharePointDigestProbe & { digestValue?: string }> {
  const normalizedSiteUrl = normalizeSharePointSiteUrl(targetSiteUrl);
  const url = buildContextInfoUrl(normalizedSiteUrl);
  const now = Date.now();
  const cached = digestCache.get(normalizedSiteUrl);
  if (!forceRefresh && cached && cached.expiresAt > now) {
    return {
      connectorMode: "browser-sharepoint",
      ok: true,
      url,
      method: "POST",
      digestFound: true,
      digestPreview: digestPreview(cached.digest),
      digestLength: cached.digest.length,
      cacheKey: normalizedSiteUrl,
      fromCache: true,
      digestValue: cached.digest
    };
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: ODATA_ACCEPT,
        "Content-Type": ODATA_CONTENT_TYPE
      }
    });
    const base = {
      connectorMode: "browser-sharepoint" as const,
      url,
      method: "POST",
      status: response.status,
      statusText: response.statusText,
      authBlocked: response.status === 401 || response.status === 403,
      cacheKey: normalizedSiteUrl
    };

    if (!response.ok) {
      const text = await responseTextSafe(response);
      return {
        ...base,
        ok: false,
        digestFound: false,
        error: text ? summarizeErrorText(text) : `sharepoint-contextinfo-failed:${response.status}`
      };
    }

    const payload = await parseJsonSafe(response);
    const digest = extractFormDigestValue(payload);
    const timeoutSeconds = extractDigestTimeoutSeconds(payload);
    if (!digest) {
      return {
        ...base,
        ok: false,
        digestFound: false,
        payloadSummary: { hasContextWebInformation: Boolean(payload?.d?.GetContextWebInformation || payload?.GetContextWebInformation) },
        error: "sharepoint-digest-missing"
      };
    }

    const ttlMs = Math.max(0, (timeoutSeconds ? timeoutSeconds * 1000 : DIGEST_DEFAULT_TTL_MS) - DIGEST_SAFETY_MS);
    digestCache.set(normalizedSiteUrl, {
      digest,
      createdAt: now,
      expiresAt: now + ttlMs
    });

    return {
      ...base,
      ok: true,
      digestFound: true,
      digestPreview: digestPreview(digest),
      digestLength: digest.length,
      payloadSummary: {
        hasContextWebInformation: true,
        timeoutSeconds: timeoutSeconds || null,
        webFullUrl: payload?.d?.GetContextWebInformation?.WebFullUrl || payload?.GetContextWebInformation?.WebFullUrl || ""
      },
      digestValue: digest
    };
  } catch (error) {
    return {
      connectorMode: "browser-sharepoint",
      ok: false,
      url,
      method: "POST",
      digestFound: false,
      cacheKey: normalizedSiteUrl,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function requestBrowserDigest(targetSiteUrl: string, options: { forceRefresh?: boolean } = {}) {
  const { digestValue: _digestValue, ...probe } = await fetchBrowserDigest(targetSiteUrl, Boolean(options.forceRefresh));
  return probe;
}

export async function getBrowserRequestDigest(targetSiteUrl: string, options: { forceRefresh?: boolean } = {}) {
  const probe = await fetchBrowserDigest(targetSiteUrl, Boolean(options.forceRefresh));
  if (!probe.ok || !probe.digestValue) {
    throw new Error(probe.error || `browser-sharepoint-digest-failed:${probe.status || "unknown"}`);
  }
  return probe.digestValue;
}

export function clearBrowserDigestCache() {
  digestCache.clear();
}

function resolvePathsForSite(site: Site): SiteBuilderResolvedPaths {
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
  if (!generated) throw new Error("sharepoint-paths-missing");

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
}

const absoluteFileUrl = (paths: SiteBuilderResolvedPaths, serverRelativePath: string) =>
  encodeSpaces(`https://${paths.host}${serverRelativePath}`);

const listEndpoint = (paths: SiteBuilderResolvedPaths, title: string) =>
  buildSharePointApiUrl(
    paths.sharePointSiteUrl,
    `/_api/web/lists/GetByTitle('${escapeODataString(title)}')?$select=Id,Title,RootFolder/ServerRelativeUrl&$expand=RootFolder`
  );

const folderEndpoint = (paths: SiteBuilderResolvedPaths, serverRelativePath: string) =>
  buildSharePointApiUrl(
    paths.sharePointSiteUrl,
    `/_api/web/GetFolderByServerRelativeUrl('${escapeODataString(serverRelativePath)}')?$select=Name,ServerRelativeUrl`
  );

const serverRelativeParent = (serverRelativePath: string) => {
  const normalized = String(serverRelativePath || "").replace(/\\/g, "/").replace(/\/+/g, "/");
  const index = normalized.lastIndexOf("/");
  return index > 0 ? normalized.slice(0, index) : "";
};

const serverRelativeFileName = (serverRelativePath: string) => {
  const normalized = String(serverRelativePath || "").replace(/\\/g, "/");
  return normalized.split("/").filter(Boolean).pop() || normalized;
};

const contentTypeForSharePointPath = (serverRelativePath: string) => {
  const lower = serverRelativePath.toLowerCase();
  if (lower.endsWith(".html")) return "text/html;charset=utf-8";
  if (lower.endsWith(".css")) return "text/css;charset=utf-8";
  if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "text/javascript;charset=utf-8";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".json")) return "application/json;charset=utf-8";
  if (lower.endsWith(".txt")) return "text/plain;charset=utf-8";
  return "application/octet-stream";
};

export function buildSharePointFilesAddUrl(targetSiteUrl: string, targetPath: string) {
  const folder = serverRelativeParent(targetPath);
  const fileName = serverRelativeFileName(targetPath);
  if (!folder || !fileName) throw new Error("sharepoint-upload-target-path-invalid");
  return buildSharePointApiUrl(
    targetSiteUrl,
    `/_api/web/GetFolderByServerRelativeUrl('${escapeODataString(folder)}')/Files/add(url='${escapeODataString(fileName)}',overwrite=true)`
  );
}

export const absoluteSharePointFileUrl = (targetSiteUrl: string, serverRelativePath: string) => {
  const siteUrl = new URL(normalizeSharePointSiteUrl(targetSiteUrl));
  return encodeSpaces(`${siteUrl.origin}${serverRelativePath}`);
};

const arrayBufferFromBody = async (body: Blob | ArrayBuffer | Uint8Array) => {
  if (body instanceof ArrayBuffer) return body;
  if (body instanceof Uint8Array) {
    const copy = new Uint8Array(body.byteLength);
    copy.set(body);
    return copy.buffer;
  }
  return body.arrayBuffer();
};

const sha256Hex = async (body: ArrayBuffer) => {
  const hash = await globalThis.crypto.subtle.digest("SHA-256", body);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

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

export async function ensureSharePointFolderHierarchyBrowser(paths: SiteBuilderResolvedPaths, serverRelativeFolder: string) {
  const digest = await getBrowserRequestDigest(paths.sharePointSiteUrl);
  const folders = createableFolderChain(paths, serverRelativeFolder);
  for (const folder of folders) {
    const response = await fetch(buildSharePointApiUrl(paths.sharePointSiteUrl, "/_api/web/folders"), {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: ODATA_ACCEPT,
        "Content-Type": ODATA_CONTENT_TYPE,
        "X-RequestDigest": digest
      },
      body: JSON.stringify({
        __metadata: { type: "SP.Folder" },
        ServerRelativeUrl: folder
      })
    });
    if (response.ok || response.status === 409) continue;
    const text = await responseTextSafe(response);
    throw new Error(text ? summarizeErrorText(text) : `browser-sharepoint-create-folder-failed:${response.status}:${folder}`);
  }
}

export type BrowserSharePointLibraryEnsureResult = {
  connectorMode: "browser-sharepoint";
  title: string;
  expectedRootUrl: string;
  rootServerRelativeUrl: string;
  status: "exists" | "created";
  httpStatus?: number;
};

const listByTitleEndpoint = (targetSiteUrl: string, title: string) =>
  buildSharePointApiUrl(
    targetSiteUrl,
    `/_api/web/lists/GetByTitle('${escapeODataString(title)}')?$select=Id,Title,BaseTemplate,DefaultViewUrl,OnQuickLaunch,RootFolder/ServerRelativeUrl,RootFolder/WelcomePage&$expand=RootFolder`
  );

const libraryRootFromPayload = (payload: any) => {
  const item = payloadData(payload);
  return String(item?.RootFolder?.ServerRelativeUrl || item?.rootFolder?.serverRelativeUrl || "");
};

const libraryBaseTemplateFromPayload = (payload: any) => Number(payloadData(payload)?.BaseTemplate || payloadData(payload)?.baseTemplate || 0);

export async function ensureSharePointDocumentLibraryBrowser(
  paths: SiteBuilderResolvedPaths,
  title: string,
  expectedRootUrl: string
): Promise<BrowserSharePointLibraryEnsureResult> {
  const targetSiteUrl = paths.sharePointSiteUrl;
  const readUrl = listByTitleEndpoint(targetSiteUrl, title);
  const existing = await fetchBrowserJson(readUrl);

  if (existing.exists) {
    const baseTemplate = libraryBaseTemplateFromPayload(existing.payload);
    const rootServerRelativeUrl = libraryRootFromPayload(existing.payload) || expectedRootUrl;
    if (baseTemplate && baseTemplate !== 101) {
      throw new Error(`browser-sharepoint-library-not-document-library:${title}:BaseTemplate=${baseTemplate}`);
    }
    if (rootServerRelativeUrl !== expectedRootUrl) {
      throw new Error(`browser-sharepoint-library-root-mismatch:${title}:${rootServerRelativeUrl}`);
    }
    return {
      connectorMode: "browser-sharepoint",
      title,
      expectedRootUrl,
      rootServerRelativeUrl,
      status: "exists",
      httpStatus: existing.status
    };
  }

  if (existing.status !== 404) {
    throw new Error(existing.error || `browser-sharepoint-library-check-failed:${title}:${existing.status || "unknown"}`);
  }

  const digest = await getBrowserRequestDigest(targetSiteUrl);
  const createUrl = buildSharePointApiUrl(targetSiteUrl, "/_api/web/lists");
  const createResponse = await fetch(createUrl, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: ODATA_ACCEPT,
      "Content-Type": ODATA_CONTENT_TYPE,
      "X-RequestDigest": digest
    },
    body: JSON.stringify({
      __metadata: { type: "SP.List" },
      BaseTemplate: 101,
      Title: title,
      Description: "Site Builder system document library",
      OnQuickLaunch: true
    })
  });

  if (!createResponse.ok) {
    const text = await responseTextSafe(createResponse);
    const existsLikeError = createResponse.status === 409 || /exist|already|name|שכבר|A list/i.test(text);
    if (!existsLikeError) {
      throw new Error(text ? summarizeErrorText(text) : `browser-sharepoint-create-library-failed:${title}:${createResponse.status}`);
    }
    const recheck = await fetchBrowserJson(readUrl);
    if (!recheck.exists) {
      throw new Error(text ? summarizeErrorText(text) : `browser-sharepoint-create-library-duplicate-unverified:${title}`);
    }
  }

  const created = await fetchBrowserJson(readUrl);
  if (!created.exists) {
    throw new Error(`browser-sharepoint-create-library-verification-failed:${title}`);
  }
  const rootServerRelativeUrl = libraryRootFromPayload(created.payload) || expectedRootUrl;
  if (rootServerRelativeUrl !== expectedRootUrl) {
    throw new Error(`browser-sharepoint-library-root-mismatch:${title}:${rootServerRelativeUrl}`);
  }

  return {
    connectorMode: "browser-sharepoint",
    title,
    expectedRootUrl,
    rootServerRelativeUrl,
    status: "created",
    httpStatus: created.status
  };
}

export type BrowserSharePointFileReadResult = {
  connectorMode: "browser-sharepoint";
  sourcePath: string;
  url: string;
  ok: boolean;
  status?: number;
  statusText?: string;
  authBlocked?: boolean;
  sizeBytes?: number;
  sha256?: string;
  bytes?: ArrayBuffer;
  contentType?: string;
  etag?: string;
  lastModified?: string;
  error?: string;
};

export async function readSharePointFileBrowser(targetSiteUrl: string, serverRelativePath: string): Promise<BrowserSharePointFileReadResult> {
  const url = absoluteSharePointFileUrl(targetSiteUrl, serverRelativePath);
  try {
    const response = await fetch(url, {
      method: "GET",
      credentials: "include",
      cache: "no-store"
    });
    const base = {
      connectorMode: "browser-sharepoint" as const,
      sourcePath: serverRelativePath,
      url,
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      authBlocked: response.status === 401 || response.status === 403,
      contentType: response.headers.get("content-type") || "",
      etag: response.headers.get("etag") || "",
      lastModified: response.headers.get("last-modified") || ""
    };
    if (!response.ok) {
      const text = await responseTextSafe(response);
      return { ...base, error: text ? summarizeErrorText(text) : `browser-sharepoint-file-read-failed:${response.status}` };
    }

    const bytes = await response.arrayBuffer();
    return {
      ...base,
      sizeBytes: bytes.byteLength,
      sha256: await sha256Hex(bytes),
      bytes
    };
  } catch (error) {
    return {
      connectorMode: "browser-sharepoint",
      sourcePath: serverRelativePath,
      url,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export type BrowserSharePointTextEnsureResult = Omit<BrowserSharePointUploadResult, "status"> & {
  status: "uploaded" | "failed" | "exists";
};

export async function ensureSharePointTextFileIfMissingBrowser(params: {
  paths: SiteBuilderResolvedPaths;
  targetPath: string;
  content: string;
  contentType?: string;
}): Promise<BrowserSharePointTextEnsureResult> {
  const targetSiteUrl = params.paths.sharePointSiteUrl;
  const existing = await readSharePointFileBrowser(targetSiteUrl, params.targetPath);
  if (existing.ok && existing.bytes) {
    const text = new TextDecoder().decode(existing.bytes);
    if (text.trim().length > 0) {
      return {
        connectorMode: "browser-sharepoint",
        relativePath: serverRelativeFileName(params.targetPath),
        targetPath: params.targetPath,
        uploadUrl: absoluteSharePointFileUrl(targetSiteUrl, params.targetPath),
        status: "exists",
        httpStatus: existing.status,
        httpStatusText: existing.statusText,
        etag: existing.etag
      };
    }
  } else if (existing.status && existing.status !== 404) {
    return {
      connectorMode: "browser-sharepoint",
      relativePath: serverRelativeFileName(params.targetPath),
      targetPath: params.targetPath,
      uploadUrl: absoluteSharePointFileUrl(targetSiteUrl, params.targetPath),
      status: "failed",
      httpStatus: existing.status,
      httpStatusText: existing.statusText,
      error: existing.error || `browser-sharepoint-file-read-failed:${existing.status}`
    };
  }

  await ensureSharePointFolderHierarchyBrowser(params.paths, serverRelativeParent(params.targetPath));
  const bytes = new TextEncoder().encode(`${params.content.replace(/\s*$/g, "")}\n`);
  return uploadFileToSharePointBrowser({
    targetSiteUrl,
    targetPath: params.targetPath,
    relativePath: serverRelativeFileName(params.targetPath),
    body: bytes,
    contentType: params.contentType || contentTypeForSharePointPath(params.targetPath),
    expectedSizeBytes: bytes.byteLength
  });
}

const sourceEntriesForBackup = (paths: SiteBuilderResolvedPaths) => Object.entries(paths.txtFiles);

export async function buildBrowserSharePointBackupPlan(site: Site): Promise<BackupPlan> {
  const paths = resolvePathsForSite(site);
  const generatedAt = new Date();
  const backupIdPreview = `backup-${generatedAt.toISOString().replace(/[:.]/g, "-")}`;
  const targetSiteUrl = normalizeSharePointSiteUrl(paths.sharePointSiteUrl || site.sharePointSiteUrl);
  const digestProbe = await requestBrowserDigest(targetSiteUrl);
  const sources = await Promise.all(
    sourceEntriesForBackup(paths).map(async ([key, serverRelativePath]): Promise<BackupPlanSource> => {
      const result = await readSharePointFileBrowser(targetSiteUrl, serverRelativePath);
      return {
        key,
        label: key,
        serverRelativePath,
        url: result.url,
        required: true,
        exists: result.ok,
        status: result.status,
        statusText: result.statusText,
        sizeBytes: result.sizeBytes,
        authBlocked: result.authBlocked,
        error: result.error
      };
    })
  );

  const authBlockedSources = sources.filter((source) => source.authBlocked).length;
  const missingSources = sources.filter((source) => !source.exists && !source.authBlocked).length;
  const existingSources = sources.filter((source) => source.exists).length;
  const knownSizeBytes = sources.reduce((sum, source) => sum + (source.sizeBytes || 0), 0);
  const readyForBackup = missingSources === 0 && authBlockedSources === 0;

  return {
    generatedAt: generatedAt.toISOString(),
    siteId: site._id,
    siteCode: site.siteCode,
    backupIdPreview,
    target: {
      backupsRoot: paths.backupsRoot,
      backupFolder: `${paths.backupsRoot}/${backupIdPreview}`
    },
    sources,
    summary: {
      totalSources: sources.length,
      existingSources,
      missingSources,
      authBlockedSources,
      knownSizeBytes,
      readyForBackup,
      readyForBackupExecution: readyForBackup && digestProbe.ok && digestProbe.digestFound
    },
    notes: [
      "Browser SharePoint Connector: הקבצים נקראו מהדפדפן עם credentials include.",
      digestProbe.ok && digestProbe.digestFound
        ? "Digest התקבל מאתר היעד עצמו, לא מאתר ה־Hub ולא מהשרת."
        : `Digest דרך הדפדפן לא תקין: ${digestProbe.error || digestProbe.status || "unknown"}`,
      authBlockedSources > 0
        ? "SharePoint חסם חלק מקריאות הדפדפן; בדקו הרשאות משתמש לאתר היעד."
        : "",
      missingSources > 0 ? "חסרים קבצי TXT/JSON נדרשים באתר היעד." : ""
    ].filter(Boolean)
  };
}

const backupEvidenceFromReadBack = (
  sourcePath: string,
  targetPath: string,
  source: BrowserSharePointFileReadResult,
  readBack: DeploymentVerificationEvidence
): BackupVerificationEvidence => ({
  sourcePath,
  targetPath,
  status: readBack.status,
  checkedAt: readBack.checkedAt,
  sourceSizeBytes: source.sizeBytes || 0,
  sourceSha256: source.sha256 || "",
  expectedBackupSizeBytes: source.sizeBytes || 0,
  expectedBackupSha256: source.sha256 || "",
  backupSizeBytes: readBack.actualSizeBytes || 0,
  backupSha256: readBack.actualSha256 || "",
  sizeMatches: Boolean(readBack.sizeMatches),
  sha256Matches: Boolean(readBack.sha256Matches),
  httpStatus: readBack.httpStatus,
  httpStatusText: readBack.httpStatusText,
  contentType: readBack.contentType,
  etag: readBack.etag,
  lastModified: readBack.lastModified,
  error: readBack.error
});

const failedBackupEvidence = (
  sourcePath: string,
  targetPath: string,
  error: unknown,
  sourceSizeBytes = 0,
  sourceSha256 = "",
  httpStatus?: number,
  httpStatusText?: string
): BackupVerificationEvidence => ({
  sourcePath,
  targetPath,
  status: "failed",
  checkedAt: new Date().toISOString(),
  sourceSizeBytes,
  sourceSha256,
  expectedBackupSizeBytes: sourceSizeBytes,
  expectedBackupSha256: sourceSha256,
  backupSizeBytes: 0,
  backupSha256: "",
  sizeMatches: false,
  sha256Matches: false,
  httpStatus,
  httpStatusText,
  error: error instanceof Error ? error.message : String(error)
});

export async function backupSiteToSharePointBrowser(site: Site, options: BrowserSharePointBackupOptions = {}): Promise<BrowserSharePointBackupResult> {
  const startedAt = new Date().toISOString();
  const paths = resolvePathsForSite(site);
  const targetSiteUrl = normalizeSharePointSiteUrl(paths.sharePointSiteUrl || site.sharePointSiteUrl);
  const backupId = `backup-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const backupFolder = `${paths.backupsRoot}/${backupId}`;
  const sourcePaths: BackupSourceEvidence[] = [];
  const verificationEvidence: BackupVerificationEvidence[] = [];
  const errors: BrowserSharePointBackupResult["errors"] = [];

  await getBrowserRequestDigest(targetSiteUrl);
  await ensureSharePointFolderHierarchyBrowser(paths, backupFolder);

  for (const [, sourcePath] of sourceEntriesForBackup(paths)) {
    const targetPath = `${backupFolder}/${serverRelativeFileName(sourcePath)}`;
    let source: BrowserSharePointFileReadResult | undefined;
    try {
      options.onFileProgress?.({ siteId: site._id, siteCode: site.siteCode, sourcePath, targetPath, status: "reading" });
      source = await readSharePointFileBrowser(targetSiteUrl, sourcePath);
      if (!source.ok || !source.bytes) {
        throw new Error(source.error || `browser-sharepoint-source-read-failed:${source.status || "unknown"}`);
      }

      options.onFileProgress?.({ siteId: site._id, siteCode: site.siteCode, sourcePath, targetPath, status: "uploading" });
      const upload = await uploadFileToSharePointBrowser({
        targetSiteUrl,
        targetPath,
        relativePath: serverRelativeFileName(sourcePath),
        body: source.bytes,
        contentType: source.contentType || contentTypeForSharePointPath(sourcePath),
        expectedSizeBytes: source.sizeBytes,
        expectedSha256: source.sha256
      });
      if (upload.status !== "uploaded") {
        throw new Error(upload.error || `browser-sharepoint-backup-upload-failed:${upload.httpStatus || "unknown"}`);
      }

      options.onFileProgress?.({ siteId: site._id, siteCode: site.siteCode, sourcePath, targetPath, status: "verifying" });
      const readBack = await readBackSharePointFileBrowser({
        targetSiteUrl,
        targetPath,
        relativePath: serverRelativeFileName(sourcePath),
        body: source.bytes,
        contentType: source.contentType || contentTypeForSharePointPath(sourcePath),
        expectedSizeBytes: source.sizeBytes,
        expectedSha256: source.sha256
      });
      const evidence = backupEvidenceFromReadBack(sourcePath, targetPath, source, readBack);
      verificationEvidence.push(evidence);
      sourcePaths.push({
        path: sourcePath,
        exists: true,
        targetPath,
        status: evidence.status,
        sourceSizeBytes: source.sizeBytes || 0,
        sourceSha256: source.sha256 || "",
        backupSizeBytes: evidence.backupSizeBytes || 0,
        backupSha256: evidence.backupSha256 || "",
        error: evidence.error
      });

      if (evidence.status === "verified" && evidence.sizeMatches && evidence.sha256Matches) {
        options.onFileProgress?.({ siteId: site._id, siteCode: site.siteCode, sourcePath, targetPath, status: "verified" });
      } else {
        errors.push({ sourcePath, targetPath, error: evidence.error || "browser-sharepoint-backup-readback-mismatch", status: evidence.httpStatus });
        options.onFileProgress?.({ siteId: site._id, siteCode: site.siteCode, sourcePath, targetPath, status: "failed", error: evidence.error });
      }
    } catch (error) {
      const failed = failedBackupEvidence(sourcePath, targetPath, error, source?.sizeBytes || 0, source?.sha256 || "", source?.status, source?.statusText);
      verificationEvidence.push(failed);
      sourcePaths.push({
        path: sourcePath,
        exists: Boolean(source?.ok),
        targetPath,
        status: "failed",
        sourceSizeBytes: source?.sizeBytes || 0,
        sourceSha256: source?.sha256 || "",
        backupSizeBytes: 0,
        backupSha256: "",
        error: failed.error
      });
      errors.push({ sourcePath, targetPath, error: failed.error || "browser-sharepoint-backup-file-failed", status: failed.httpStatus });
      options.onFileProgress?.({ siteId: site._id, siteCode: site.siteCode, sourcePath, targetPath, status: "failed", error: failed.error });
    }
  }

  const finalStatus =
    verificationEvidence.length === sourceEntriesForBackup(paths).length &&
    verificationEvidence.every((item) => item.status === "verified" && item.sizeMatches && item.sha256Matches)
      ? "success"
      : "failed";

  return {
    siteId: site._id,
    siteCode: site.siteCode,
    connectorMode: "browser-sharepoint",
    targetSiteUrl,
    backupId,
    target: {
      backupsRoot: paths.backupsRoot,
      backupFolder
    },
    startedAt,
    completedAt: new Date().toISOString(),
    finalStatus,
    sourcePaths,
    verificationEvidence,
    errors
  };
}

export async function verifyBackupToSharePointBrowser(site: Site, backup: Backup) {
  const paths = resolvePathsForSite(site);
  const targetSiteUrl = normalizeSharePointSiteUrl(paths.sharePointSiteUrl || site.sharePointSiteUrl);
  const rows = (backup.verification?.evidence?.length ? backup.verification.evidence : (backup.sourcePaths || []).map((row) => ({
    sourcePath: row.path,
    targetPath: row.targetPath || "",
    sourceSizeBytes: row.sourceSizeBytes || 0,
    sourceSha256: row.sourceSha256 || "",
    expectedBackupSizeBytes: row.backupSizeBytes || row.sourceSizeBytes || 0,
    expectedBackupSha256: row.backupSha256 || row.sourceSha256 || ""
  }))).filter((row) => row.sourcePath || row.targetPath);

  const evidence = await Promise.all(rows.map(async (row): Promise<BackupVerificationEvidence> => {
    if (!row.targetPath) {
      return failedBackupEvidence(row.sourcePath || "", "", "backup-target-path-missing", row.sourceSizeBytes || 0, row.sourceSha256 || "");
    }
    const expectedSize = row.expectedBackupSizeBytes || row.sourceSizeBytes || 0;
    const expectedSha = row.expectedBackupSha256 || row.sourceSha256 || "";
    const readBack = await readBackSharePointFileBrowser({
      targetSiteUrl,
      targetPath: row.targetPath,
      relativePath: serverRelativeFileName(row.targetPath),
      body: new ArrayBuffer(0),
      expectedSizeBytes: expectedSize,
      expectedSha256: expectedSha
    });
    return {
      sourcePath: row.sourcePath || "",
      targetPath: row.targetPath,
      status: readBack.status,
      checkedAt: readBack.checkedAt,
      sourceSizeBytes: row.sourceSizeBytes || 0,
      sourceSha256: row.sourceSha256 || "",
      expectedBackupSizeBytes: expectedSize,
      expectedBackupSha256: expectedSha,
      backupSizeBytes: readBack.actualSizeBytes || 0,
      backupSha256: readBack.actualSha256 || "",
      sizeMatches: Boolean(readBack.sizeMatches),
      sha256Matches: Boolean(readBack.sha256Matches),
      httpStatus: readBack.httpStatus,
      httpStatusText: readBack.httpStatusText,
      contentType: readBack.contentType,
      etag: readBack.etag,
      lastModified: readBack.lastModified,
      error: readBack.error
    };
  }));

  return {
    backupId: backup._id,
    connectorMode: "browser-sharepoint" as const,
    targetSiteUrl,
    verificationEvidence: evidence,
    finalStatus: evidence.length > 0 && evidence.every((item) => item.status === "verified" && item.sizeMatches && item.sha256Matches) ? "success" as const : "failed" as const,
    checkedAt: new Date().toISOString()
  };
}

type BrowserJsonReadResult = {
  exists: boolean;
  status?: number;
  statusText?: string;
  authBlocked?: boolean;
  payload?: any;
  error?: string;
};

async function fetchBrowserJson(url: string): Promise<BrowserJsonReadResult> {
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: { Accept: ODATA_ACCEPT }
  });
  const base = {
    exists: response.ok,
    status: response.status,
    statusText: response.statusText,
    authBlocked: response.status === 401 || response.status === 403
  };
  if (!response.ok) {
    const text = await responseTextSafe(response);
    return { ...base, payload: undefined, error: text ? summarizeErrorText(text) : `browser-sharepoint-json-read-failed:${response.status}` };
  }
  return { ...base, payload: await parseJsonSafe(response) };
}

const backupFolderFilesEndpoint = (targetSiteUrl: string, serverRelativePath: string) =>
  buildSharePointApiUrl(
    targetSiteUrl,
    `/_api/web/GetFolderByServerRelativeUrl('${escapeODataString(serverRelativePath)}')/Files?$select=Name,ServerRelativeUrl,Length,TimeCreated,TimeLastModified,UniqueId,ETag`
  );

export async function listBrowserSharePointBackupInventory(site: Site, includeFiles = true): Promise<SharePointBackupInventory> {
  const paths = resolvePathsForSite(site);
  const targetSiteUrl = normalizeSharePointSiteUrl(paths.sharePointSiteUrl || site.sharePointSiteUrl);
  const rootUrl = folderEndpoint(paths, paths.backupsRoot);
  const root = await fetchBrowserJson(rootUrl);
  const foldersApiUrl = buildSharePointApiUrl(
    targetSiteUrl,
    `/_api/web/GetFolderByServerRelativeUrl('${escapeODataString(paths.backupsRoot)}')/Folders?$select=Name,ServerRelativeUrl,ItemCount,TimeCreated,TimeLastModified,UniqueId`
  );
  const folderRead = root.exists ? await fetchBrowserJson(foldersApiUrl) : { exists: false, payload: undefined, error: root.error, status: root.status, statusText: root.statusText, authBlocked: root.authBlocked };
  const folderRows = odataResults(folderRead.payload);
  const folders: SharePointBackupInventoryFolder[] = await Promise.all(folderRows.map(async (row: any) => {
    const serverRelativeUrl = String(row.ServerRelativeUrl || row.serverRelativeUrl || "");
    const filesStatus = includeFiles ? await fetchBrowserJson(backupFolderFilesEndpoint(targetSiteUrl, serverRelativeUrl)) : undefined;
    const files: SharePointBackupInventoryFile[] = includeFiles && filesStatus?.payload
      ? odataResults(filesStatus.payload).map((file: any) => ({
          name: String(file.Name || file.name || ""),
          serverRelativeUrl: String(file.ServerRelativeUrl || file.serverRelativeUrl || ""),
          url: absoluteSharePointFileUrl(targetSiteUrl, String(file.ServerRelativeUrl || file.serverRelativeUrl || "")),
          sizeBytes: Number(file.Length || file.length || 0),
          timeCreated: String(file.TimeCreated || file.timeCreated || ""),
          timeLastModified: String(file.TimeLastModified || file.timeLastModified || ""),
          uniqueId: String(file.UniqueId || file.uniqueId || ""),
          etag: String(file.ETag || file.etag || "")
        }))
      : [];
    return {
      name: String(row.Name || row.name || serverRelativeFileName(serverRelativeUrl)),
      serverRelativeUrl,
      url: absoluteSharePointFileUrl(targetSiteUrl, serverRelativeUrl),
      itemCount: Number(row.ItemCount || row.itemCount || 0),
      timeCreated: String(row.TimeCreated || row.timeCreated || ""),
      timeLastModified: String(row.TimeLastModified || row.timeLastModified || ""),
      uniqueId: String(row.UniqueId || row.uniqueId || ""),
      files,
      filesStatus: includeFiles && filesStatus
        ? {
            exists: filesStatus.exists,
            status: filesStatus.status,
            statusText: filesStatus.statusText,
            authBlocked: filesStatus.authBlocked,
            error: filesStatus.error
          }
        : undefined,
      filesCount: includeFiles ? files.length : Number(row.ItemCount || row.itemCount || 0),
      knownSizeBytes: files.reduce((sum, file) => sum + (file.sizeBytes || 0), 0)
    };
  }));

  const filesCount = folders.reduce((sum, folder) => sum + folder.filesCount, 0);
  const knownSizeBytes = folders.reduce((sum, folder) => sum + folder.knownSizeBytes, 0);

  return {
    generatedAt: new Date().toISOString(),
    siteId: site._id,
    siteCode: site.siteCode,
    includeFiles,
    resolvedPaths: paths as unknown as Record<string, unknown>,
    root: {
      serverRelativePath: paths.backupsRoot,
      url: absoluteSharePointFileUrl(targetSiteUrl, paths.backupsRoot),
      apiUrl: rootUrl,
      checkedAt: new Date().toISOString(),
      exists: root.exists,
      status: root.status,
      statusText: root.statusText,
      authBlocked: root.authBlocked,
      error: root.error
    },
    folders,
    summary: {
      rootExists: root.exists,
      foldersCount: folders.length,
      filesCount,
      knownSizeBytes,
      authBlocked: Boolean(root.authBlocked || folders.some((folder) => folder.filesStatus?.authBlocked)),
      readOk: root.exists && (!includeFiles || folders.every((folder) => folder.filesStatus?.exists))
    },
    notes: [
      "Browser SharePoint Connector: Inventory נקרא מהדפדפן עם credentials include.",
      root.authBlocked ? "SharePoint החזיר 401/403 לדפדפן עבור תיקיית הגיבויים." : ""
    ].filter(Boolean)
  };
}

const failedBrowserEvidence = (
  options: Pick<BrowserSharePointUploadOptions, "relativePath" | "targetPath" | "expectedSizeBytes" | "expectedSha256" | "contentType">,
  error: unknown,
  httpStatus?: number,
  httpStatusText?: string
): DeploymentVerificationEvidence => ({
  relativePath: options.relativePath,
  sourcePath: `artifact:${options.relativePath}`,
  targetPath: options.targetPath,
  status: "failed",
  checkedAt: new Date().toISOString(),
  expectedSizeBytes: options.expectedSizeBytes || 0,
  actualSizeBytes: 0,
  expectedSha256: options.expectedSha256 || "",
  actualSha256: "",
  sizeMatches: false,
  sha256Matches: false,
  httpStatus,
  httpStatusText,
  contentType: options.contentType || "",
  error: error instanceof Error ? error.message : String(error)
});

export async function uploadFileToSharePointBrowser(options: BrowserSharePointUploadOptions): Promise<BrowserSharePointUploadResult> {
  const uploadUrl = buildSharePointFilesAddUrl(options.targetSiteUrl, options.targetPath);
  const digest = await getBrowserRequestDigest(options.targetSiteUrl);
  const response = await fetch(uploadUrl, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: ODATA_ACCEPT,
      "Content-Type": options.contentType || "application/octet-stream",
      "X-RequestDigest": digest
    },
    body: options.body as BodyInit
  });

  if (!response.ok) {
    const text = await responseTextSafe(response);
    return {
      connectorMode: "browser-sharepoint",
      relativePath: options.relativePath,
      targetPath: options.targetPath,
      uploadUrl,
      status: "failed",
      httpStatus: response.status,
      httpStatusText: response.statusText,
      error: text ? summarizeErrorText(text) : `sharepoint-upload-failed:${response.status}`
    };
  }

  return {
    connectorMode: "browser-sharepoint",
    relativePath: options.relativePath,
    targetPath: options.targetPath,
    uploadUrl,
    status: "uploaded",
    httpStatus: response.status,
    httpStatusText: response.statusText,
    etag: response.headers.get("etag") || undefined
  };
}

export async function readBackSharePointFileBrowser(options: BrowserSharePointUploadOptions): Promise<DeploymentVerificationEvidence> {
  const url = absoluteSharePointFileUrl(options.targetSiteUrl, options.targetPath);
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
    cache: "no-store"
  });

  if (!response.ok) {
    const text = await responseTextSafe(response);
    return failedBrowserEvidence(
      options,
      text ? summarizeErrorText(text) : `sharepoint-readback-failed:${response.status}`,
      response.status,
      response.statusText
    );
  }

  const bytes = await response.arrayBuffer();
  const actualSha256 = await sha256Hex(bytes);
  const expectedSizeBytes = options.expectedSizeBytes || bytes.byteLength;
  const expectedSha256 = options.expectedSha256 || actualSha256;
  const sizeMatches = bytes.byteLength === expectedSizeBytes;
  const sha256Matches = actualSha256 === expectedSha256;

  return {
    relativePath: options.relativePath,
    sourcePath: `artifact:${options.relativePath}`,
    targetPath: options.targetPath,
    status: sizeMatches && sha256Matches ? "verified" : "failed",
    checkedAt: new Date().toISOString(),
    expectedSizeBytes,
    actualSizeBytes: bytes.byteLength,
    expectedSha256,
    actualSha256,
    sizeMatches,
    sha256Matches,
    httpStatus: response.status,
    httpStatusText: response.statusText,
    contentType: response.headers.get("content-type") || options.contentType || "",
    etag: response.headers.get("etag") || "",
    lastModified: response.headers.get("last-modified") || "",
    error: sizeMatches && sha256Matches ? "" : "browser-sharepoint-readback-mismatch"
  };
}

export async function verifyFinalAppUrlBrowser(finalAppUrl?: string): Promise<DeploymentFinalAppUrlVerification | undefined> {
  const url = String(finalAppUrl || "").trim();
  if (!url) return undefined;
  const checkedAt = new Date().toISOString();

  try {
    const response = await fetch(url, {
      method: "GET",
      credentials: "include",
      cache: "no-store"
    });
    return {
      key: "finalAppUrl",
      label: "Final app URL",
      url,
      finalAppUrl: url,
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      httpStatus: response.status,
      httpStatusText: response.statusText,
      checkedAt,
      authBlocked: response.status === 401 || response.status === 403,
      error: response.ok ? "" : `final-app-url-failed:${response.status}`
    };
  } catch (error) {
    return {
      key: "finalAppUrl",
      label: "Final app URL",
      url,
      finalAppUrl: url,
      ok: false,
      checkedAt,
      authBlocked: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function deployArtifactToSharePointBrowser(options: BrowserSharePointDeployOptions): Promise<BrowserSharePointDeployResult> {
  const startedAt = new Date().toISOString();
  const uploadedFilesEvidence: DeploymentVerificationEvidence[] = [];
  const readBackEvidence: DeploymentVerificationEvidence[] = [];
  const errors: BrowserSharePointDeployResult["errors"] = [];

  await getBrowserRequestDigest(options.targetSiteUrl);

  for (const file of options.files.filter((item) => item.deployable)) {
    try {
      options.onFileProgress?.({ siteId: options.siteId, siteCode: options.siteCode, relativePath: file.relativePath, status: "loading" });
      const artifactFile = await options.loadArtifactFile(file.relativePath);
      const body = await arrayBufferFromBody(artifactFile.blob);
      const expectedSha256 = artifactFile.sha256 || file.sha256;
      const expectedSizeBytes = artifactFile.sizeBytes || file.sizeBytes;
      const contentType = artifactFile.contentType || file.contentType || "application/octet-stream";

      options.onFileProgress?.({ siteId: options.siteId, siteCode: options.siteCode, relativePath: file.relativePath, status: "uploading" });
      const upload = await uploadFileToSharePointBrowser({
        targetSiteUrl: options.targetSiteUrl,
        targetPath: file.targetPath,
        relativePath: file.relativePath,
        body,
        contentType,
        expectedSizeBytes,
        expectedSha256
      });
      if (upload.status !== "uploaded") {
        const failed = failedBrowserEvidence(
          { relativePath: file.relativePath, targetPath: file.targetPath, contentType, expectedSizeBytes, expectedSha256 },
          upload.error || "sharepoint-upload-failed",
          upload.httpStatus,
          upload.httpStatusText
        );
        uploadedFilesEvidence.push(failed);
        readBackEvidence.push(failed);
        errors.push({ relativePath: file.relativePath, targetPath: file.targetPath, error: failed.error || "sharepoint-upload-failed", status: upload.httpStatus });
        options.onFileProgress?.({ siteId: options.siteId, siteCode: options.siteCode, relativePath: file.relativePath, status: "failed", error: failed.error });
        continue;
      }

      options.onFileProgress?.({ siteId: options.siteId, siteCode: options.siteCode, relativePath: file.relativePath, status: "verifying" });
      const readBack = await readBackSharePointFileBrowser({
        targetSiteUrl: options.targetSiteUrl,
        targetPath: file.targetPath,
        relativePath: file.relativePath,
        body,
        contentType,
        expectedSizeBytes,
        expectedSha256
      });
      uploadedFilesEvidence.push(readBack);
      readBackEvidence.push(readBack);
      if (readBack.status !== "verified") {
        errors.push({ relativePath: file.relativePath, targetPath: file.targetPath, error: readBack.error || "sharepoint-readback-failed", status: readBack.httpStatus });
        options.onFileProgress?.({ siteId: options.siteId, siteCode: options.siteCode, relativePath: file.relativePath, status: "failed", error: readBack.error });
      } else {
        options.onFileProgress?.({ siteId: options.siteId, siteCode: options.siteCode, relativePath: file.relativePath, status: "verified" });
      }
    } catch (error) {
      const failed = failedBrowserEvidence(file, error);
      uploadedFilesEvidence.push(failed);
      readBackEvidence.push(failed);
      errors.push({ relativePath: file.relativePath, targetPath: file.targetPath, error: failed.error || "browser-deploy-file-failed" });
      options.onFileProgress?.({ siteId: options.siteId, siteCode: options.siteCode, relativePath: file.relativePath, status: "failed", error: failed.error });
    }
  }

  const finalAppUrlVerification = await verifyFinalAppUrlBrowser(options.finalAppUrl);
  const completedAt = new Date().toISOString();
  const finalStatus = readBackEvidence.length === options.files.filter((file) => file.deployable).length &&
    readBackEvidence.every((item) => item.status === "verified" && item.sizeMatches && item.sha256Matches)
    ? "success"
    : "failed";

  return {
    releaseId: options.releaseId,
    siteId: options.siteId,
    siteCode: options.siteCode,
    connectorMode: "browser-sharepoint",
    targetSiteUrl: normalizeSharePointSiteUrl(options.targetSiteUrl),
    targetDistPath: options.targetDistPath,
    startedAt,
    completedAt,
    finalStatus,
    uploadedFilesEvidence,
    readBackEvidence,
    finalAppUrlVerification,
    errors
  };
}

export async function runBrowserSharePointDiagnostics(site: Site): Promise<BrowserSharePointDiagnosticsResult> {
  const paths = resolvePathsForSite(site);
  const targetSharePointSiteUrl = normalizeSharePointSiteUrl(paths.sharePointSiteUrl || site.sharePointSiteUrl);
  const currentUser = await browserSharePointProbe(
    buildSharePointApiUrl(targetSharePointSiteUrl, "/_api/web/currentuser?$select=Id,Title,Email,LoginName,IsSiteAdmin"),
    { method: "GET", headers: { Accept: ODATA_ACCEPT } },
    summarizeCurrentUserPayload
  );
  const readTest = await browserSharePointProbe(
    listEndpoint(paths, paths.siteDbLibrary || site.siteDbLibrary || "siteDB"),
    { method: "GET", headers: { Accept: ODATA_ACCEPT } }
  );
  const digestTest = await requestBrowserDigest(targetSharePointSiteUrl, { forceRefresh: true });

  const digestWorks = digestTest.ok && digestTest.digestFound;
  const browserHealthy = currentUser.ok || readTest.ok || digestWorks;
  const failed = [currentUser, readTest, digestTest].find((item) => !item.ok);

  return {
    generatedAt: new Date().toISOString(),
    connectorMode: "browser-sharepoint",
    targetSharePointSiteUrl,
    site: {
      _id: site._id,
      siteCode: site.siteCode,
      displayName: site.displayName,
      environment: site.environment,
      status: site.status
    },
    currentUser,
    readTest,
    digestTest,
    writeCapability: {
      connectorMode: "browser-sharepoint",
      digestWorks,
      writeVerified: digestWorks,
      uploadImplemented: true,
      message: digestWorks
        ? "Digest דרך הדפדפן תקין. העלאה דרך הדפדפן זמינה ותיבדק בזמן פריסה."
        : "Digest דרך הדפדפן לא תקין ולכן כתיבה דרך הדפדפן אינה מוכנה."
    },
    overall: {
      reachable: browserHealthy,
      authenticated: browserHealthy,
      digestWorks,
      writeVerified: digestWorks,
      preferredConnectorMode: "browser-sharepoint",
      failedUrl: failed?.url,
      failedStatus: failed?.status,
      humanExplanation: digestWorks
        ? "הדפדפן מחובר ל־SharePoint ומצליח לקבל Digest מאתר היעד."
        : "הדפדפן לא הצליח לאמת Digest מול אתר היעד.",
      suggestedFix: digestWorks
        ? "במצב SharePoint-hosted יש להשתמש בחיבור דרך הדפדפן."
        : "בדקו שה־Hub נטען מאותו SharePoint origin ושלמשתמש יש הרשאה לאתר היעד."
    }
  };
}

function booleanFromEvidence(evidence: SharePointHealthEvidence) {
  if (evidence.ok) return true;
  if (evidence.authBlocked) return undefined;
  return false;
}

function deriveHealthStatus(health: Partial<SiteHealth>, checkedAt?: string) {
  if (!checkedAt) return "unknown";
  const criticalKeys: Array<keyof SiteHealth> = ["siteDbExists", "usersDbExists", "distExists", "indexExists"];
  const nonCriticalKeys: Array<keyof SiteHealth> = ["assetsExists", "txtFilesExist", "adminsSyncOk", "permissionsOk"];
  if (criticalKeys.some((key) => health[key] === false)) return "failed";
  if (nonCriticalKeys.some((key) => health[key] === false)) return "warning";
  return [...criticalKeys, ...nonCriticalKeys].every((key) => health[key] === true) ? "healthy" : "warning";
}

export function buildBrowserHealthChecks(site: Site) {
  const paths = resolvePathsForSite(site);
  const requiredTxtFiles = Object.entries(paths.txtFiles);
  return {
    paths,
    checks: [
      { key: "siteDbExists", label: "Document Library siteDB", url: listEndpoint(paths, paths.siteDbLibrary || "siteDB") },
      { key: "usersDbExists", label: "Document Library siteUsersDb", url: listEndpoint(paths, paths.usersDbLibrary || "siteUsersDb") },
      { key: "distExists", label: "Final dist folder", url: folderEndpoint(paths, paths.finalDistRoot) },
      { key: "indexExists", label: "Final index.html", url: paths.finalAppUrl },
      { key: "assetsExists", label: "Final assets folder", url: folderEndpoint(paths, `${paths.finalDistRoot}/assets`) },
      { key: "permissionsOk", label: "Permissions marker", url: absoluteFileUrl(paths, paths.permissionsMarkerFile) },
      ...requiredTxtFiles.map(([name, path]) => ({ key: "txtFile", label: `TXT ${name}`, url: absoluteFileUrl(paths, path) }))
    ]
  };
}

export async function runBrowserSharePointHealthCheck(site: Site): Promise<BrowserSharePointHealthResult> {
  const checkedAt = new Date().toISOString();
  const { paths, checks } = buildBrowserHealthChecks(site);
  const evidence = await Promise.all(
    checks.map(async (item): Promise<SharePointHealthEvidence> => {
      const result = await browserSharePointProbe(item.url, {
        method: "GET",
        headers: { Accept: "application/json;odata=nometadata, text/plain, */*" }
      });
      return {
        key: item.key,
        label: item.label,
        url: item.url,
        ok: result.ok,
        status: result.status,
        statusText: result.statusText,
        authBlocked: result.authBlocked,
        error: result.error
      };
    })
  );

  const health: Partial<SiteHealth> = {};
  const setFromEvidence = (healthKey: keyof SiteHealth, evidenceKey = healthKey) => {
    const item = evidence.find((row) => row.key === evidenceKey);
    if (!item) return;
    const value = booleanFromEvidence(item);
    if (value !== undefined) health[healthKey] = value;
  };

  setFromEvidence("siteDbExists");
  setFromEvidence("usersDbExists");
  setFromEvidence("distExists");
  setFromEvidence("indexExists");
  setFromEvidence("assetsExists");
  setFromEvidence("permissionsOk");
  const txtEvidence = evidence.filter((item) => item.key === "txtFile");
  if (txtEvidence.length) {
    health.txtFilesExist = txtEvidence.some((item) => item.authBlocked)
      ? undefined
      : txtEvidence.every((item) => item.ok);
  }

  return {
    checkedAt,
    siteId: site._id,
    siteCode: site.siteCode,
    connectorMode: "browser-sharepoint",
    targetSharePointSiteUrl: normalizeSharePointSiteUrl(paths.sharePointSiteUrl),
    resolvedPaths: paths,
    source: "Browser SharePoint",
    health: health as SiteHealth,
    derivedHealthStatus: deriveHealthStatus(health, checkedAt),
    evidence,
    note: evidence.some((item) => item.authBlocked)
      ? "חלק מהבדיקות נחסמו על ידי SharePoint דרך הדפדפן; ערכים אלה לא עודכנו ככשל."
      : undefined
  };
}

export function combineSharePointConnectorDiagnostics(
  browser?: BrowserSharePointDiagnosticsResult | null,
  backend?: SharePointDiagnosticsCheck | null
): CombinedSharePointConnectorDiagnostics {
  const browserHealthy = Boolean(browser?.overall?.digestWorks || browser?.currentUser?.ok || browser?.readTest?.ok);
  const backendHealthy = false;
  const backendFailedStatus = backend?.overall?.failedStatus || Number(backend?.digestTest?.status || backend?.currentUser?.status || backend?.readTest?.status || 0);
  const backendBlockedBy401 = backendFailedStatus === 401;
  const digestWorks = Boolean(browser?.overall?.digestWorks);
  const preferredConnectorMode: SharePointConnectorMode = "browser-sharepoint";
  const globalBlocked = !browserHealthy && !backendHealthy;
  const message = browser?.overall?.digestWorks && backendBlockedBy401
    ? "הדפדפן מחובר ל־SharePoint ומצליח לקבל Digest. אין SharePoint בשרת; המערכת תשתמש בחיבור דרך הדפדפן."
    : browser?.overall?.digestWorks
      ? "הדפדפן מחובר ל־SharePoint ומצליח לקבל Digest. המערכת תעדיף browser-sharepoint עבור אתר היעד."
      : "לא נמצא חיבור SharePoint תקין דרך הדפדפן. השרת לא משמש כחיבור חלופי ל־SharePoint.";

  return {
    preferredConnectorMode,
    browserHealthy,
    backendHealthy,
    digestWorks,
    backendBlockedBy401,
    globalBlocked,
    message
  };
}
