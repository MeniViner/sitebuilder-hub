import { Types } from "mongoose";
import { Job } from "../models/Job";
import { Site } from "../models/Site";
import { SiteBackup } from "../models/SiteBackup";
import { SiteVersionDeployment } from "../models/SiteVersionDeployment";
import { getSharePointOperationCapabilities } from "./sharepointOperationClient";
import { logger } from "../utils/logger";
import { getActiveDangerousValidationBypasses } from "./dangerousBackupBypass.service";
import { getSharePointOperationInventory } from "./sharepointOperationPolicy.service";
import { getBuilderBackendRuntimeSettings } from "./builderMongoHealth.service";
import { getMongoStatus } from "../db/mongo";
import type { AuthUser } from "../types/express";

export type BrowserSharePointStatus = "connected" | "failed" | "not_checked" | "refreshing";
export type BuilderBackendStatus = "configured" | "reachable" | "failed" | "not_configured" | "not_relevant";

export type DataSourceMatrix = {
  txt: {
    appData: "browser-sharepoint-txt";
    backupInventory: "browser-sharepoint";
    adminReads: "browser-sharepoint";
    hostingRuntimeConfig: "browser-sharepoint";
    hubEvidence: "hub-mongo";
  };
  mongo: {
    appData: "builder-backend-mongo";
    seedRuntimeData: "builder-backend-mongo";
    backupCapabilityInventory: "builder-backend-mongo";
    hostingRuntimeConfig: "browser-sharepoint";
    sharePointAccessChecks: "browser-sharepoint";
    hubEvidence: "hub-mongo";
  };
};

export type OperationalStatusSnapshot = {
  generatedAt: string;
  hubApi: {
    status: "connected" | "failed";
    checkedAt: string;
    message: string;
  };
  hubMongo: {
    status: "connected" | "failed" | "unknown";
    checkedAt: string;
    message: string;
  };
  browserSharePoint: {
    status: BrowserSharePointStatus;
    checkedAt?: string;
    source: "Browser SharePoint" | "cached evidence";
    targetSharePointSiteUrl?: string;
    siteId?: string;
    siteCode?: string;
    message: string;
    nextStep: string;
  };
  builderBackend: {
    status: BuilderBackendStatus;
    checkedAt?: string;
    configured: boolean;
    reachable?: boolean;
    backendApiUrlHost?: string;
    siteId?: string;
    message: string;
    nextStep: string;
  };
  currentIdentity: {
    mode: "sharepoint-user" | "explicit-owner" | "local-dev-fallback" | "api-key" | "unknown";
    label: string;
    source?: string;
  };
  operationMode: {
    readOnlyBrowserChecksAvailable: boolean;
    browserSharePointWritesAvailable: boolean;
    builderBackendMongoOperationsAvailable: boolean;
    legacyBackendSharePointAvailable: false;
    label: string;
  };
  dataSourceMatrix: DataSourceMatrix;
};

export const DATA_SOURCE_MATRIX: DataSourceMatrix = {
  txt: {
    appData: "browser-sharepoint-txt",
    backupInventory: "browser-sharepoint",
    adminReads: "browser-sharepoint",
    hostingRuntimeConfig: "browser-sharepoint",
    hubEvidence: "hub-mongo"
  },
  mongo: {
    appData: "builder-backend-mongo",
    seedRuntimeData: "builder-backend-mongo",
    backupCapabilityInventory: "builder-backend-mongo",
    hostingRuntimeConfig: "browser-sharepoint",
    sharePointAccessChecks: "browser-sharepoint",
    hubEvidence: "hub-mongo"
  }
};

const isoDate = (value: unknown) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
};

const identitySnapshot = (user?: AuthUser): OperationalStatusSnapshot["currentIdentity"] => {
  if (!user) return { mode: "unknown", label: "זהות עדיין לא נבדקה" };
  if (user.identityMode === "sharepoint-user" || user.source === "sharepoint") {
    return {
      mode: "sharepoint-user",
      label: user.loginName || user.email || user.name || "SharePoint user",
      source: user.source
    };
  }
  if (user.identityMode === "explicit-owner" || user.source === "owner" || user.source === "bootstrap" || user.source === "site-admin") {
    return {
      mode: "explicit-owner",
      label: user.personalNumber || user.name || "בעלים/מנהל מורשה",
      source: user.source
    };
  }
  if (user.identityMode === "api-key" || user.source === "api-key") return { mode: "api-key", label: user.name || "API key", source: user.source };
  if (user.identityMode === "local-fallback" || user.source === "dev") return { mode: "local-dev-fallback", label: "Local Developer", source: user.source };
  return { mode: "unknown", label: user.name || "זהות לא ידועה", source: user.source };
};

type BrowserSharePointCandidate = OperationalStatusSnapshot["browserSharePoint"] & { sortTime: number };

const candidateFromHealthEvidence = (site: any): BrowserSharePointCandidate | null => {
  const checkedAt = isoDate(site.lastSharePointHostingVerificationAt || site.lastHealthCheckAt);
  if (!checkedAt) return null;
  const evidence = Array.isArray(site.sharePointPathEvidence) ? site.sharePointPathEvidence : [];
  const hasAuthBlock = evidence.some((item: any) => item?.authBlocked || item?.status === 401 || item?.status === 403);
  const hasReachableHttp = evidence.some((item: any) => typeof item?.status === "number" && item.status !== 401 && item.status !== 403);
  const hasOk = evidence.some((item: any) => item?.ok === true);
  const connected = hasOk || hasReachableHttp || evidence.length === 0;
  return {
    status: connected && !hasAuthBlock ? "connected" : "failed",
    checkedAt,
    source: "cached evidence",
    targetSharePointSiteUrl: site.sharePointSiteUrl,
    siteId: site._id?.toString?.() || String(site._id || ""),
    siteCode: site.siteCode,
    message: connected && !hasAuthBlock
      ? "Browser SharePoint נבדק דרך ראיית Health/Hosting שמורה"
      : "חיבור SharePoint דרך הדפדפן נכשל בבדיקת Health/Hosting האחרונה",
    nextStep: connected && !hasAuthBlock
      ? "אפשר לרענן בדף Health או Diagnostics לפי צורך"
      : "פתחו Diagnostics או Health מתוך SharePoint מחובר ורעננו דרך הדפדפן",
    sortTime: new Date(checkedAt).getTime()
  };
};

const candidateFromRuntimeConfigEvidence = (site: any): BrowserSharePointCandidate | null => {
  const stored = site.runtimeConfigStatus;
  if (!stored || stored.evidence?.connectorMode !== "browser-sharepoint") return null;
  const checkedAt = isoDate(stored.checkedAt || site.lastRuntimeConfigCheckAt);
  if (!checkedAt) return null;
  const failed = stored.readStatus === "auth-blocked" || stored.readStatus === "error";
  return {
    status: failed ? "failed" : "connected",
    checkedAt,
    source: "cached evidence",
    targetSharePointSiteUrl: site.sharePointSiteUrl,
    siteId: site._id?.toString?.() || String(site._id || ""),
    siteCode: site.siteCode,
    message: failed
      ? "חיבור SharePoint דרך הדפדפן נכשל בקריאת runtime config האחרונה"
      : "Browser SharePoint קרא runtime config או קיבל תגובת יעד שמורה",
    nextStep: failed
      ? "רעננו runtime config מתוך דפדפן שמחובר לאתר היעד"
      : "אפשר לרענן runtime config אם המידע ישן",
    sortTime: new Date(checkedAt).getTime()
  };
};

const candidateFromAdminEvidence = (site: any): BrowserSharePointCandidate | null => {
  const checkedAt = isoDate(site.lastAdminLiveReadAt);
  if (!checkedAt) return null;
  const failed = site.adminSyncStatus === "failed";
  return {
    status: failed ? "failed" : "connected",
    checkedAt,
    source: "cached evidence",
    targetSharePointSiteUrl: site.sharePointSiteUrl,
    siteId: site._id?.toString?.() || String(site._id || ""),
    siteCode: site.siteCode,
    message: failed
      ? "חיבור SharePoint דרך הדפדפן נכשל בקריאת מנהלים האחרונה"
      : "Browser SharePoint קרא מנהלים ונשמרה ראיה",
    nextStep: failed
      ? "פתחו Admins ורעננו קריאת דפדפן"
      : "אפשר לרענן Admins אם המידע ישן",
    sortTime: new Date(checkedAt).getTime()
  };
};

const latestBrowserSharePointStatus = (sites: any[]): OperationalStatusSnapshot["browserSharePoint"] => {
  const candidates = sites.flatMap((site) => [
    candidateFromHealthEvidence(site),
    candidateFromRuntimeConfigEvidence(site),
    candidateFromAdminEvidence(site)
  ]).filter(Boolean) as BrowserSharePointCandidate[];
  const latest = candidates.sort((a, b) => b.sortTime - a.sortTime)[0];
  if (!latest) {
    return {
      status: "not_checked",
      source: "cached evidence",
      message: "SharePoint דרך הדפדפן עדיין לא נבדק",
      nextStep: "פתחו Diagnostics, Health, Admins או Backups כדי להריץ בדיקת דפדפן בטוחה"
    };
  }
  const { sortTime: _sortTime, ...snapshot } = latest;
  return snapshot;
};

const builderBackendSnapshot = (sites: any[]): OperationalStatusSnapshot["builderBackend"] => {
  const config = getBuilderBackendRuntimeSettings();
  const configured = Boolean(config.defaultBuilderBackendApiUrl || config.builderBackendOptions.length);
  const mongoSites = sites.filter((site) => site.storageBackend === "mongo");
  const latest = mongoSites
    .map((site) => ({ site, checkedAt: isoDate(site.mongoBackendStatus?.checkedAt || site.lastMongoHealthCheckAt) }))
    .filter((item) => item.checkedAt)
    .sort((a, b) => new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime())[0];

  if (!configured && mongoSites.length === 0) {
    return {
      status: "not_relevant",
      configured: false,
      message: "Builder backend לא נדרש כרגע לאתרי TXT בלבד",
      nextStep: "הגדירו Builder backend לפני יצירת או ניהול אתר Mongo"
    };
  }
  if (!configured) {
    return {
      status: "not_configured",
      configured: false,
      message: "Builder backend לא מוגדר",
      nextStep: "הגדירו SITE_BUILDER_DEFAULT_BACKEND_API_URL או SITE_BUILDER_BACKEND_API_URLS"
    };
  }
  if (!latest) {
    return {
      status: "configured",
      configured: true,
      backendApiUrlHost: config.builderBackendOptions.find((option) => option.default)?.backendApiUrlHost || config.defaultBuilderBackendApiUrl,
      message: "Builder backend מוגדר ועדיין לא נבדק מול אתר Mongo",
      nextStep: "פתחו Health או Settings כדי להריץ בדיקת Builder/Mongo בטוחה"
    };
  }

  const status = latest.site.mongoBackendStatus?.backendReachable ? "reachable" : "failed";
  return {
    status,
    checkedAt: latest.checkedAt,
    configured: true,
    reachable: Boolean(latest.site.mongoBackendStatus?.backendReachable),
    backendApiUrlHost: latest.site.mongoBackendStatus?.backendApiUrlHost,
    siteId: latest.site._id?.toString?.() || String(latest.site._id || ""),
    message: status === "reachable"
      ? "Builder backend נגיש לפי ראיית Mongo אחרונה"
      : "Builder backend מוגדר אך בדיקת Mongo אחרונה נכשלה",
    nextStep: status === "reachable"
      ? "אפשר לרענן Mongo backend אם המידע ישן"
      : "בדקו URL ו־credential ref של Builder backend במסך Settings או Health"
  };
};

export async function getOperationsCapabilities() {
  logger.info("operations", "Building operations capabilities");
  const sharePoint = getSharePointOperationCapabilities();
  const dangerousOverrides = getActiveDangerousValidationBypasses();
  const operationInventory = getSharePointOperationInventory();
  const builderBackendConfig = getBuilderBackendRuntimeSettings();
  const builderBackendApiUrls = builderBackendConfig.builderBackendOptions.map((option) => option.backendApiUrl);

  const capabilities = {
    generatedAt: new Date().toISOString(),
    sharePoint,
    storageBackends: {
      sourceMatrix: DATA_SOURCE_MATRIX,
      supported: ["txt", "mongo", "unknown"],
      txt: {
        sourceOfTruth: "Browser SharePoint TXT files",
        backupMode: "browser-sharepoint-file-copy",
        adminSource: "users_data.txt through Browser SharePoint",
        hostingRuntimeConfig: "Browser SharePoint",
        hubEvidence: "Hub Mongo"
      },
      mongo: {
        sourceOfTruth: "Builder backend API backed by MongoDB",
        connectorMode: "mongo-backend",
        allowedBackendApiUrls: builderBackendApiUrls,
        defaultApiKeyRef: builderBackendConfig.defaultBuilderApiKeyRef,
        defaultBackendApiUrl: builderBackendConfig.defaultBuilderBackendApiUrl,
        builderBackendOptions: builderBackendConfig.builderBackendOptions,
        rawApiKeysExposed: false,
        backupMode: "builder-backend-api",
        adminSource: "Builder backend users/admins scope",
        hostingRuntimeConfig: "Browser SharePoint",
        sharePointAccessChecks: "Browser SharePoint",
        hubEvidence: "Hub Mongo"
      }
    },
    builderBackendConfig,
    sharePointOperationInventory: operationInventory,
    dangerousOverrides: {
      active: dangerousOverrides.length > 0,
      activeCount: dangerousOverrides.length,
      gates: dangerousOverrides
    },
    operations: {
      healthReadOnly: { available: true, writeRequired: false, connectorMode: "browser-sharepoint" },
      backupPlan: { available: true, writeRequired: false, connectorMode: "browser-sharepoint" },
      liveAdminRead: { available: true, writeRequired: false, connectorMode: "browser-sharepoint" },
      adminTxtRepairPlan: { available: true, writeRequired: false, connectorMode: "browser-sharepoint" },
      siteBootstrapPlan: { available: true, writeRequired: false },
      siteProvisionPlan: { available: true, writeRequired: false },
      permissionsSetupPlan: { available: true, writeRequired: false },
      deployPlan: { available: true, writeRequired: false },
      requestDigest: { available: true, writeRequired: false, connectorMode: "browser-sharepoint", reason: "Digest is requested in the browser." },
      backupExecute: { available: true, writeRequired: true, connectorMode: "browser-sharepoint", reason: "Backup executes in the connected browser." },
      restoreExecute: { available: true, writeRequired: true, connectorMode: "browser-sharepoint", reason: "Restore executes in the connected browser and the server records evidence only." },
      adminTxtRepairExecute: { available: true, writeRequired: true, connectorMode: "browser-sharepoint", reason: "Admin TXT repair executes in the connected browser." },
      siteBootstrap: { available: true, writeRequired: true, connectorMode: "browser-sharepoint", reason: "Site bootstrap executes in the connected browser." },
      siteProvision: { available: true, writeRequired: true, connectorMode: "browser-sharepoint", reason: "Site provisioning executes in the connected browser." },
      permissionsSetup: { available: true, writeRequired: true, connectorMode: "browser-sharepoint", reason: "Permissions setup executes in the connected browser." },
      deployExecute: { available: true, writeRequired: true, connectorMode: "browser-sharepoint", reason: "Deploy executes in the connected browser." }
    },
    readiness: {
      readOnlyPreflight: {
        ready: true,
        blockers: [] as string[]
      },
      writePreflight: {
        ready: true,
        blockers: [] as string[]
      },
      initProvision: {
        readyForPlan: true,
        readyForExecution: true,
        blockers: [] as string[]
      },
      siteBootstrap: {
        readyForPlan: true,
        readyForExecution: true,
        blockers: [] as string[]
      },
      backup: {
        readyForPlan: true,
        readyForExecution: true,
        blockers: [] as string[]
      },
      adminTxtRepair: {
        readyForPlan: true,
        readyForExecution: true,
        blockers: [] as string[]
      },
      deploy: {
        readyForPlan: true,
        readyForExecution: true,
        blockers: [] as string[]
      }
    }
  };
  logger.info("operations", "Operations capabilities built", {
    readAvailable: capabilities.sharePoint.readAvailable,
    writeAvailable: capabilities.sharePoint.writeAvailable,
    dangerousOverrides: capabilities.dangerousOverrides.activeCount
  });
  return capabilities;
}

export async function getOperationsStatus(user?: AuthUser): Promise<OperationalStatusSnapshot> {
  logger.info("operations", "Building operational status snapshot");
  const generatedAt = new Date().toISOString();
  const mongo = getMongoStatus();
  const sites = await Site.find({}, {
    siteCode: 1,
    displayName: 1,
    status: 1,
    storageBackend: 1,
    sharePointSiteUrl: 1,
    sharePointPathEvidence: 1,
    lastSharePointHostingVerificationAt: 1,
    lastHealthCheckAt: 1,
    runtimeConfigStatus: 1,
    lastRuntimeConfigCheckAt: 1,
    mongoBackendStatus: 1,
    lastMongoHealthCheckAt: 1,
    lastAdminLiveReadAt: 1,
    lastAdminLiveReadSource: 1,
    adminSyncStatus: 1
  }).lean();
  const builder = builderBackendSnapshot(sites);
  return {
    generatedAt,
    hubApi: {
      status: "connected",
      checkedAt: generatedAt,
      message: "Hub API מחובר"
    },
    hubMongo: {
      status: mongo === "connected" ? "connected" : mongo === "disconnected" ? "failed" : "unknown",
      checkedAt: generatedAt,
      message: mongo === "connected" ? "Hub Mongo מחובר" : mongo === "disconnected" ? "Hub Mongo לא מחובר" : "מצב Hub Mongo לא ידוע"
    },
    browserSharePoint: latestBrowserSharePointStatus(sites),
    builderBackend: builder,
    currentIdentity: identitySnapshot(user),
    operationMode: {
      readOnlyBrowserChecksAvailable: true,
      browserSharePointWritesAvailable: true,
      builderBackendMongoOperationsAvailable: builder.status === "configured" || builder.status === "reachable",
      legacyBackendSharePointAvailable: false,
      label: "Browser SharePoint לפעולות SharePoint; Builder backend לנתוני Mongo; Hub Mongo לראיות ומטא־דאטה"
    },
    dataSourceMatrix: DATA_SOURCE_MATRIX
  };
}

export async function getSiteOperationsSummary(siteId: string) {
  logger.info("operations", "Building site operations summary", { siteId });
  if (!Types.ObjectId.isValid(siteId)) throw new Error("site-not-found");

  const site = await Site.findById(siteId).lean();
  if (!site) throw new Error("site-not-found");

  const [jobs, backups, deployments] = await Promise.all([
    Job.find({ siteId: site._id }).sort({ createdAt: -1 }).limit(12).lean(),
    SiteBackup.find({ siteId: site._id }).sort({ createdAt: -1 }).limit(6).lean(),
    SiteVersionDeployment.find({ siteId: site._id }).sort({ createdAt: -1 }).limit(6).lean()
  ]);
  const capabilities = await getOperationsCapabilities();
  const writeReady = capabilities.readiness.writePreflight.ready;
  const storageBackend = String(site.storageBackend || "unknown");
  const isMongoSite = storageBackend === "mongo";

  const summary = {
    generatedAt: new Date().toISOString(),
    capabilities,
    site: {
      _id: site._id.toString(),
      siteCode: site.siteCode,
      displayName: site.displayName,
      status: site.status,
      storageBackend,
      dataBackendStatus: site.dataBackendStatus,
      runtimeConfigStatus: site.runtimeConfigStatus,
      mongoBackendStatus: site.mongoBackendStatus,
      version: site.currentVersion || site.version,
      finalAppUrl: site.finalAppUrl,
      resolvedPaths: site.resolvedPaths,
      health: site.health,
      sharePointStatus: site.sharePointStatus,
      backupStatus: site.backupStatus,
      adminSyncStatus: site.adminSyncStatus,
      versionStatus: site.versionStatus,
      lastHealthCheckAt: site.lastHealthCheckAt,
      lastBackupAt: site.lastBackupAt,
      lastAdminSyncAt: site.lastAdminSyncAt,
      lastDeployAt: site.lastDeployAt,
      lastError: site.lastError
    },
    recent: {
      jobs,
      backups,
      deployments
    },
    operationReadiness: {
      initProvision: {
        readyForPlan: true,
        readyForExecution: writeReady,
        blockers: capabilities.readiness.initProvision.blockers
      },
      siteBootstrap: {
        readyForPlan: true,
        readyForExecution: writeReady,
        blockers: capabilities.readiness.siteBootstrap.blockers
      },
      backup: {
        readyForPlan: true,
        readyForExecution: isMongoSite
          ? site.health?.mongoBackupsOk === true
          : writeReady && site.health?.txtFilesExist !== false,
        blockers: [
          ...(isMongoSite ? [] : capabilities.readiness.backup.blockers),
          isMongoSite && site.health?.mongoBackupsOk !== true ? "mongo-backup-capability-not-verified" : "",
          !isMongoSite && site.health?.txtFilesExist === false ? "site-required-txt-files-missing" : ""
        ].filter(Boolean)
      },
      deploy: {
        readyForPlan: true,
        readyForExecution: writeReady,
        blockers: capabilities.readiness.deploy.blockers
      },
      adminTxtRepair: {
        readyForPlan: true,
        readyForExecution: writeReady,
        blockers: capabilities.readiness.adminTxtRepair.blockers
      }
    },
    recommendedActions: [
      !site.lastHealthCheckAt && site.status === "draft" ? "run-site-bootstrap-plan" : "",
      !site.health?.siteDbExists || !site.health?.usersDbExists ? "run-provision-plan" : "",
      !site.health?.permissionsOk ? "run-permissions-plan" : "",
      !site.lastHealthCheckAt ? "run-readonly-health" : "",
      isMongoSite && site.mongoBackendStatus?.seedStatus !== "ok" ? "run-mongo-backend-health" : "",
      isMongoSite && site.health?.mongoBackupsOk !== true ? "verify-mongo-backup-capability" : "",
      !isMongoSite && !site.lastBackupAt ? "run-backup-plan" : "",
      !isMongoSite && (site.adminDifferences?.missingInTxt || []).length > 0 ? "run-admin-txt-repair-plan" : "",
      site.versionStatus === "outdated" ? "run-deploy-plan" : ""
    ].filter(Boolean)
  };
  logger.info("operations", "Site operations summary built", {
    siteId,
    siteCode: site.siteCode,
    jobsCount: jobs.length,
    backupsCount: backups.length,
    deploymentsCount: deployments.length,
    recommendedActions: summary.recommendedActions
  });
  return summary;
}
