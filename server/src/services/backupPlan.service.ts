import { Site } from "../models/Site";
import { resolveSiteBuilderPaths, SiteBuilderResolvedPaths } from "../utils/sitebuilderPaths";
import { logger } from "../utils/logger";
import {
  getSharePointOperationCapabilities,
  getSharePointReadHeaders,
  listSharePointFiles,
  listSharePointFolders,
  SharePointFileMetadata,
  SharePointFolderMetadata
} from "./sharepointOperationClient";

type BackupPlanEvidence = {
  key: string;
  label: string;
  serverRelativePath: string;
  url: string;
  required: boolean;
  exists: boolean;
  status?: number;
  statusText?: string;
  sizeBytes?: number;
  authBlocked?: boolean;
  error?: string;
};

export type SiteBackupPlan = {
  generatedAt: string;
  siteId: string;
  siteCode: string;
  storageBackend: string;
  backupIdPreview: string;
  resolvedPaths: SiteBuilderResolvedPaths;
  target: {
    backupsRoot: string;
    backupFolder: string;
    backendApiUrl?: string;
    builderSiteId?: string;
  };
  capabilities: ReturnType<typeof getSharePointOperationCapabilities>;
  sources: BackupPlanEvidence[];
  summary: {
    totalSources: number;
    existingSources: number;
    missingSources: number;
    authBlockedSources: number;
    knownSizeBytes: number;
    readyForBackup: boolean;
    readyForBackupExecution: boolean;
  };
  blockers: string[];
  notes: string[];
};

type BackupInventoryReadStatus = {
  exists: boolean;
  status?: number;
  statusText?: string;
  authBlocked?: boolean;
  error?: string;
};

export type SiteBackupInventoryFolder = SharePointFolderMetadata & {
  files?: SharePointFileMetadata[];
  filesStatus?: BackupInventoryReadStatus;
  filesCount: number;
  knownSizeBytes: number;
};

export type SiteBackupInventory = {
  generatedAt: string;
  siteId: string;
  siteCode: string;
  includeFiles: boolean;
  resolvedPaths: SiteBuilderResolvedPaths;
  root: {
    serverRelativePath: string;
    url: string;
    apiUrl: string;
    checkedAt: string;
  } & BackupInventoryReadStatus;
  capabilities: ReturnType<typeof getSharePointOperationCapabilities>;
  folders: SiteBackupInventoryFolder[];
  summary: {
    rootExists: boolean;
    foldersCount: number;
    filesCount: number;
    knownSizeBytes: number;
    authBlocked: boolean;
    readOk: boolean;
  };
  notes: string[];
};

const encodeSpaces = (value: string) => value.replace(/ /g, "%20");

const fileUrl = (paths: SiteBuilderResolvedPaths, serverRelativePath: string) =>
  encodeSpaces(`https://${paths.host}${serverRelativePath}`);

const fetchReadOnlyFile = async (url: string) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  const startedAt = Date.now();

  try {
    logger.info("sharepoint", "Checking backup source with read-only request", { url });
    const response = await fetch(url, {
      method: "GET",
      headers: getSharePointReadHeaders("text/plain, application/json, */*"),
      redirect: "follow",
      signal: controller.signal
    });

    const contentLength = Number(response.headers.get("content-length") || 0);

    logger.info("sharepoint", "Backup source read-only check finished", {
      url,
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      durationMs: Date.now() - startedAt
    });

    return {
      exists: response.ok,
      status: response.status,
      statusText: response.statusText,
      sizeBytes: Number.isFinite(contentLength) && contentLength > 0 ? contentLength : undefined,
      authBlocked: response.status === 401 || response.status === 403
    };
  } catch (error) {
    logger.warn("sharepoint", "Backup source read-only check failed", {
      url,
      durationMs: Date.now() - startedAt,
      error
    });
    return {
      exists: false,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    clearTimeout(timeout);
  }
};

export const getCanonicalBackupSourcePaths = (paths: SiteBuilderResolvedPaths) => [
  paths.txtFiles.masterConfig,
  paths.txtFiles.users,
  paths.txtFiles.events,
  paths.txtFiles.navigation,
  paths.txtFiles.siteContent,
  paths.txtFiles.theme,
  paths.txtFiles.widgets,
  paths.txtFiles.externalLinks,
  paths.txtFiles.gantt
];

const getPathsForSite = (site: {
  siteCode: string;
  sharePointHost?: string;
  sharePointSiteUrl?: string;
  siteDbLibrary?: string;
  usersDbLibrary?: string;
  bootstrapLibrary?: string;
  bootstrapFolder?: string;
  widgetsDbTarget?: string;
}) => {
  if (!site) throw new Error("site-not-found");

  return resolveSiteBuilderPaths({
    siteCode: site.siteCode,
    sharePointHost: site.sharePointHost,
    sharePointSiteUrl: site.sharePointSiteUrl,
    siteDbLibrary: site.siteDbLibrary,
    usersDbLibrary: site.usersDbLibrary,
    bootstrapLibrary: site.bootstrapLibrary,
    bootstrapFolder: site.bootstrapFolder,
    widgetsDbTarget: site.widgetsDbTarget
  });
};

export async function buildReadOnlyBackupPlan(siteId: string): Promise<SiteBackupPlan> {
  logger.info("backups", "Building read-only backup plan", { siteId });
  const site = await Site.findById(siteId);
  if (!site) throw new Error("site-not-found");

  const resolvedPaths = getPathsForSite(site);
  const generatedAt = new Date();
  const backupIdPreview = `backup-${generatedAt.toISOString().replace(/[:.]/g, "-")}`;
  const storageBackend = String(site.storageBackend || "unknown");

  if (storageBackend === "mongo") {
    const backendApiUrl = String(site.backendApiUrl || site.mongoBackendStatus?.backendApiUrl || "");
    const builderSiteId = String(site.mongoSiteId || site.builderSiteId || site.mongoBackendStatus?.siteId || site.siteCode || "");
    const backupCapabilityOk = site.mongoBackendStatus?.backupsStatus === "ok" || site.health?.mongoBackupsOk === true;
    return {
      generatedAt: generatedAt.toISOString(),
      siteId: site._id.toString(),
      siteCode: site.siteCode,
      storageBackend,
      backupIdPreview,
      resolvedPaths,
      target: {
        backupsRoot: `mongo-backend:/api/sites/${builderSiteId}/backups`,
        backupFolder: `mongo-backend:/api/sites/${builderSiteId}/backups/${backupIdPreview}`,
        backendApiUrl,
        builderSiteId
      },
      capabilities: getSharePointOperationCapabilities(),
      sources: [],
      summary: {
        totalSources: 0,
        existingSources: 0,
        missingSources: backupCapabilityOk ? 0 : 1,
        authBlockedSources: 0,
        knownSizeBytes: 0,
        readyForBackup: backupCapabilityOk,
        readyForBackupExecution: backupCapabilityOk
      },
      blockers: [
        !backendApiUrl ? "mongo-backend-api-url-missing" : "",
        !builderSiteId ? "mongo-site-id-missing" : "",
        !backupCapabilityOk ? "mongo-backup-capability-not-verified" : ""
      ].filter(Boolean),
      notes: [
        "אתר Mongo מגובה דרך Builder backend ולא דרך העתקת קבצי TXT ב־SharePoint.",
        backupCapabilityOk
          ? "יכולת backup ב־Mongo אומתה בבדיקת backend האחרונה."
          : "יש להריץ בדיקת Mongo backend לפני שמסמנים backup כזמין.",
        "ניתן עדיין לגבות metadata של אירוח SharePoint בנפרד, אך זה אינו גיבוי הנתונים החיים."
      ]
    };
  }

  const sourceEntries = Object.entries(resolvedPaths.txtFiles);

  const sources = await Promise.all(
    sourceEntries.map(async ([key, serverRelativePath]) => {
      const url = fileUrl(resolvedPaths, serverRelativePath);
      const result = await fetchReadOnlyFile(url);

      return {
        key,
        label: key,
        serverRelativePath,
        url,
        required: true,
        ...result
      };
    })
  );

  const authBlockedSources = sources.filter((source) => source.authBlocked).length;
  const missingSources = sources.filter((source) => !source.exists && !source.authBlocked).length;
  const existingSources = sources.filter((source) => source.exists).length;
  const knownSizeBytes = sources.reduce((sum, source) => sum + (source.sizeBytes || 0), 0);
  const readyForBackup = missingSources === 0 && authBlockedSources === 0;
  const capabilities = getSharePointOperationCapabilities();
  const readyForBackupExecution = readyForBackup && capabilities.writeAvailable;
  const blockers = [
    missingSources > 0 ? "missing-required-source-files" : "",
    authBlockedSources > 0 ? "sharepoint-read-auth-blocked" : "",
    !capabilities.writeAvailable ? "sharepoint-write-not-configured" : "",
    !capabilities.digest.canRequest ? "sharepoint-request-digest-not-available" : ""
  ].filter(Boolean);
  const notes = [
    "Read-only plan only. No SharePoint files or folders were created, updated, or deleted.",
    authBlockedSources > 0
      ? "Some source files could not be verified because SharePoint returned 401/403 from the Hub server context."
      : "",
    missingSources > 0 ? "One or more required TXT/JSON source files appear to be missing." : "",
    readyForBackupExecution
      ? "Backup execution is write-gated and currently allowed by SharePoint capability settings."
      : "Backup execution requires SharePoint write capability and request digest availability."
  ].filter(Boolean);

  return {
    generatedAt: generatedAt.toISOString(),
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    storageBackend,
    backupIdPreview,
    resolvedPaths,
    target: {
      backupsRoot: resolvedPaths.backupsRoot,
      backupFolder: `${resolvedPaths.backupsRoot}/${backupIdPreview}`
    },
    capabilities,
    sources,
    summary: {
      totalSources: sources.length,
      existingSources,
      missingSources,
      authBlockedSources,
      knownSizeBytes,
      readyForBackup,
      readyForBackupExecution
    },
    blockers,
    notes
  };
}

export async function listReadOnlyBackupInventory(
  siteId: string,
  params: { includeFiles?: boolean } = {}
): Promise<SiteBackupInventory> {
  const includeFiles = Boolean(params.includeFiles);
  logger.info("backups", "Listing read-only SharePoint backup inventory", { siteId, includeFiles });

  const site = await Site.findById(siteId);
  if (!site) throw new Error("site-not-found");

  const resolvedPaths = getPathsForSite(site);
  const capabilities = getSharePointOperationCapabilities();
  const foldersResult = await listSharePointFolders(resolvedPaths, resolvedPaths.backupsRoot);
  const baseFolders: SiteBackupInventoryFolder[] = foldersResult.folders.map((folder) => ({
    ...folder,
    filesCount: 0,
    knownSizeBytes: 0
  }));

  const folders = includeFiles && foldersResult.exists
    ? await Promise.all(baseFolders.map(async (folder) => {
      const filesResult = await listSharePointFiles(resolvedPaths, folder.serverRelativeUrl);
      const knownSizeBytes = filesResult.files.reduce((sum, file) => sum + (file.sizeBytes || 0), 0);
      return {
        ...folder,
        files: filesResult.files,
        filesCount: filesResult.files.length,
        knownSizeBytes,
        filesStatus: {
          exists: filesResult.exists,
          status: filesResult.status,
          statusText: filesResult.statusText,
          authBlocked: filesResult.authBlocked,
          error: filesResult.error
        }
      };
    }))
    : baseFolders;

  const filesCount = folders.reduce((sum, folder) => sum + folder.filesCount, 0);
  const knownSizeBytes = folders.reduce((sum, folder) => sum + folder.knownSizeBytes, 0);
  const fileReadBlocked = folders.some((folder) => folder.filesStatus?.authBlocked);
  const fileReadFailed = folders.some((folder) => folder.filesStatus && (!folder.filesStatus.exists || Boolean(folder.filesStatus.error)));
  const authBlocked = Boolean(foldersResult.authBlocked || fileReadBlocked);
  const readOk = Boolean(foldersResult.exists && !foldersResult.error && (!includeFiles || !fileReadFailed));

  logger.info("backups", "Read-only SharePoint backup inventory listed", {
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    backupsRoot: resolvedPaths.backupsRoot,
    includeFiles,
    rootExists: foldersResult.exists,
    foldersCount: folders.length,
    filesCount,
    knownSizeBytes,
    authBlocked,
    readOk
  });

  return {
    generatedAt: new Date().toISOString(),
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    includeFiles,
    resolvedPaths,
    root: {
      serverRelativePath: resolvedPaths.backupsRoot,
      url: fileUrl(resolvedPaths, resolvedPaths.backupsRoot),
      apiUrl: foldersResult.url,
      checkedAt: foldersResult.checkedAt,
      exists: foldersResult.exists,
      status: foldersResult.status,
      statusText: foldersResult.statusText,
      authBlocked: foldersResult.authBlocked,
      error: foldersResult.error
    },
    capabilities,
    folders,
    summary: {
      rootExists: foldersResult.exists,
      foldersCount: folders.length,
      filesCount,
      knownSizeBytes,
      authBlocked,
      readOk
    },
    notes: [
      "SharePoint backup inventory uses REST GET only. No SharePoint folders or files were created, updated, or deleted.",
      includeFiles ? "Folder file metadata was requested for each discovered backup folder." : "Only backup folder metadata was requested.",
      foldersResult.authBlocked ? "SharePoint returned 401/403 while reading the backup root." : "",
      foldersResult.error && !foldersResult.authBlocked ? "The backup root could not be listed from the Hub server context." : "",
      fileReadBlocked ? "One or more backup folders returned 401/403 while listing files." : "",
      fileReadFailed && !fileReadBlocked ? "One or more backup folders could not be fully listed." : ""
    ].filter(Boolean)
  };
}

export async function buildAllReadOnlyBackupPlans(params: { siteIds?: string[] } = {}) {
  const sites = params.siteIds?.length
    ? await Site.find({ _id: { $in: params.siteIds } })
    : await Site.find({ status: { $ne: "archived" } });

  const results = [];

  for (const site of sites) {
    try {
      const plan = await buildReadOnlyBackupPlan(site._id.toString());
      results.push({ ok: true as const, siteId: site._id.toString(), siteCode: site.siteCode, plan });
    } catch (error) {
      logger.error("errors", "Read-only backup plan failed", {
        siteId: site._id.toString(),
        siteCode: site.siteCode,
        error
      });
      results.push({
        ok: false as const,
        siteId: site._id.toString(),
        siteCode: site.siteCode,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    count: results.length,
    readyCount: results.filter((item) => item.ok && item.plan.summary.readyForBackup).length,
    failedCount: results.filter((item) => !item.ok).length,
    results
  };
}
