import { Site } from "../models/Site";
import { resolveSiteBuilderPaths, SiteBuilderResolvedPaths } from "../utils/sitebuilderPaths";
import { logger } from "../utils/logger";
import { getSharePointOperationCapabilities } from "./sharepointOperationClient";

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

type BackupInventoryFolderMetadata = {
  name: string;
  serverRelativeUrl: string;
  url: string;
  itemCount?: number;
  timeCreated?: string;
  timeLastModified?: string;
  uniqueId?: string;
};

type BackupInventoryFileMetadata = {
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

export type SiteBackupInventoryFolder = BackupInventoryFolderMetadata & {
  files?: BackupInventoryFileMetadata[];
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

  const sources = sourceEntries.map(([key, serverRelativePath]) => ({
    key,
    label: key,
    serverRelativePath,
    url: fileUrl(resolvedPaths, serverRelativePath),
    required: true,
    exists: false,
    error: "browser-sharepoint-plan-required"
  }));

  const authBlockedSources = 0;
  const missingSources = sources.length;
  const existingSources = 0;
  const knownSizeBytes = 0;
  const readyForBackup = false;
  const capabilities = getSharePointOperationCapabilities();
  const readyForBackupExecution = false;
  const blockers = [
    "browser-sharepoint-plan-required"
  ].filter(Boolean);
  const notes = [
    "השרת לא קורא קבצי TXT מ־SharePoint. תוכנית זו מציגה נתיבים בלבד.",
    "אימות קיום/גודל קבצים והרצת הגיבוי מתבצעים דרך הדפדפן המחובר ל־SharePoint.",
    "אין צורך בהזדהות SharePoint בצד השרת."
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
  const folders: SiteBackupInventoryFolder[] = [];
  const filesCount = 0;
  const knownSizeBytes = 0;
  const authBlocked = false;
  const readOk = false;
  const checkedAt = new Date().toISOString();

  logger.info("backups", "Read-only SharePoint backup inventory listed", {
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    backupsRoot: resolvedPaths.backupsRoot,
    includeFiles,
    rootExists: false,
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
      apiUrl: "",
      checkedAt,
      exists: false,
      authBlocked,
      error: "browser-sharepoint-inventory-required"
    },
    capabilities,
    folders,
    summary: {
      rootExists: false,
      foldersCount: folders.length,
      filesCount,
      knownSizeBytes,
      authBlocked,
      readOk
    },
    notes: [
      "Inventory של תיקיות גיבוי ב־SharePoint צריך להיקרא דרך הדפדפן.",
      includeFiles ? "קריאת קבצים בתוך תיקיות הגיבוי לא בוצעה בשרת." : "קריאת שורש הגיבויים לא בוצעה בשרת.",
      "השרת לא משתמש ב־SharePoint REST גם לא לקריאה."
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
