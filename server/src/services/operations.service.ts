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

const writeBlockers = (_sharePoint: ReturnType<typeof getSharePointOperationCapabilities>) => [
  "server-sharepoint-disabled-use-browser"
];

export async function getOperationsCapabilities() {
  logger.info("operations", "Building operations capabilities");
  const sharePoint = getSharePointOperationCapabilities();
  const blockers = writeBlockers(sharePoint);
  const dangerousOverrides = getActiveDangerousValidationBypasses();
  const operationInventory = getSharePointOperationInventory();
  const builderBackendConfig = getBuilderBackendRuntimeSettings();
  const builderBackendApiUrls = builderBackendConfig.builderBackendOptions.map((option) => option.backendApiUrl);

  const capabilities = {
    generatedAt: new Date().toISOString(),
    sharePoint,
    storageBackends: {
      supported: ["txt", "mongo", "unknown"],
      txt: {
        sourceOfTruth: "SharePoint TXT files",
        backupMode: "browser-sharepoint-file-copy",
        adminSource: "users_data.txt"
      },
      mongo: {
        sourceOfTruth: "Site Builder backend API backed by MongoDB",
        connectorMode: "mongo-backend",
        allowedBackendApiUrls: builderBackendApiUrls,
        defaultApiKeyRef: builderBackendConfig.defaultBuilderApiKeyRef,
        defaultBackendApiUrl: builderBackendConfig.defaultBuilderBackendApiUrl,
        builderBackendOptions: builderBackendConfig.builderBackendOptions,
        rawApiKeysExposed: false,
        backupMode: "builder-backend-api",
        adminSource: "mongo-admins-scope"
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
    dangerousOverrides: capabilities.dangerousOverrides.activeCount,
    blockers
  });
  return capabilities;
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
