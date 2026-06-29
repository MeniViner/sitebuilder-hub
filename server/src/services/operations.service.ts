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

const writeBlockers = (sharePoint: ReturnType<typeof getSharePointOperationCapabilities>) => [
  !sharePoint.writeEnabled ? "sharepoint-write-disabled" : "",
  sharePoint.writeEnabled && !sharePoint.hasAuthMaterial && !sharePoint.unauthenticatedWriteAllowed
    ? "sharepoint-auth-material-missing"
    : "",
  !sharePoint.digest.canRequest ? "sharepoint-request-digest-not-available" : ""
].filter(Boolean);

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
      healthReadOnly: { available: sharePoint.readAvailable, writeRequired: false },
      backupPlan: { available: sharePoint.readAvailable, writeRequired: false },
      liveAdminRead: { available: sharePoint.readAvailable, writeRequired: false },
      adminTxtRepairPlan: { available: sharePoint.readAvailable, writeRequired: false },
      siteBootstrapPlan: { available: true, writeRequired: false },
      siteProvisionPlan: { available: true, writeRequired: false },
      permissionsSetupPlan: { available: true, writeRequired: false },
      deployPlan: { available: true, writeRequired: false },
      requestDigest: { available: sharePoint.digest.canRequest, writeRequired: false, reason: sharePoint.digest.reason },
      backupExecute: { available: sharePoint.writeAvailable, writeRequired: true, reason: sharePoint.reason },
      adminTxtRepairExecute: { available: sharePoint.writeAvailable, writeRequired: true, reason: sharePoint.reason },
      siteBootstrap: { available: sharePoint.siteCreation.canCreate, writeRequired: true, reason: sharePoint.siteCreation.reason },
      siteProvision: { available: sharePoint.writeAvailable, writeRequired: true, reason: sharePoint.reason },
      permissionsSetup: { available: sharePoint.writeAvailable, writeRequired: true, reason: sharePoint.reason },
      deployExecute: { available: sharePoint.writeAvailable, writeRequired: true, reason: sharePoint.reason }
    },
    readiness: {
      readOnlyPreflight: {
        ready: sharePoint.readAvailable,
        blockers: [] as string[]
      },
      writePreflight: {
        ready: sharePoint.writeAvailable && sharePoint.digest.canRequest,
        blockers
      },
      initProvision: {
        readyForPlan: true,
        readyForExecution: sharePoint.writeAvailable && sharePoint.digest.canRequest,
        blockers
      },
      siteBootstrap: {
        readyForPlan: true,
        readyForExecution: sharePoint.siteCreation.canCreate && sharePoint.digest.canRequest,
        blockers
      },
      backup: {
        readyForPlan: sharePoint.readAvailable,
        readyForExecution: sharePoint.writeAvailable && sharePoint.digest.canRequest,
        blockers
      },
      adminTxtRepair: {
        readyForPlan: sharePoint.readAvailable,
        readyForExecution: sharePoint.writeAvailable && sharePoint.digest.canRequest,
        blockers
      },
      deploy: {
        readyForPlan: true,
        readyForExecution: sharePoint.writeAvailable && sharePoint.digest.canRequest,
        blockers
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
        readyForPlan: capabilities.sharePoint.readAvailable,
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
        readyForPlan: capabilities.sharePoint.readAvailable,
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
