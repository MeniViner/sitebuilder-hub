import { env } from "../config/env";
import { Job } from "../models/Job";
import { Release } from "../models/Release";
import { Site } from "../models/Site";
import { SiteVersionDeployment } from "../models/SiteVersionDeployment";
import { logger } from "../utils/logger";
import { executeSharePointBackup, executeSharePointRestore } from "./realBackup.service";
import { executeSiteBootstrap } from "./siteBootstrap.service";
import { executeSiteProvisioning } from "./siteProvisioning.service";
import { executeSharePointDeploy } from "./deployArtifact.service";
import { executeAdminTxtRepair } from "./admins.service";
import { readLiveAdminSources } from "./liveAdminSources.service";
import { executePermissionsSetup } from "./permissionsSetup.service";
import { runReadOnlySharePointHealthCheck } from "./sharepointHealth.service";
import { assertSharePointWriteAvailable } from "./sharepointOperationClient";
import {
  assertDistinctRecentVerifiedBackupForRestore,
  assertRecentVerifiedBackupForDangerousWrite
} from "./writeSafety.service";
import { writeSystemAuditLog } from "./audit.service";
import {
  claimNextJob,
  setJobEvidence,
  setJobFailed,
  setJobProgress,
  setJobResult,
  setJobStatus,
  setJobTargetPaths,
  setJobSucceeded
} from "./jobs.service";

let timer: NodeJS.Timeout | null = null;
let isProcessing = false;

const SUMMARY_FIELD_PATTERN = /(id|code|version|count|counts|bytes|status|at|steps|type|attempt)$/i;
const AUDIT_PAYLOAD_PREVIEW_LIMIT = 10;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date);

const compactUndefined = (value: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));

const getJobId = (job: any) => job?._id?.toString() || "";
const getJobSiteId = (job: any) => job?.siteId?.toString();
const getAdminSyncMode = (job: any): "read-only" | "sync" =>
  (job?.payload as any)?.mode === "read-only" ? "read-only" : "sync";

const shouldPersistJobFailureToSite = (job: any) =>
  !(job?.type === "admin-sync" && getAdminSyncMode(job) === "read-only");

const assertApprovedForExecution = (job: any, errorCode: string) => {
  if (job.requiresApproval && (!job.approvedAt || !job.approvedBy)) {
    logger.error("jobs", "Approval-gated job blocked before execution", {
      jobId: job._id.toString(),
      type: job.type,
      siteId: job.siteId?.toString(),
      requiresApproval: Boolean(job.requiresApproval),
      approvedAt: job.approvedAt,
      approvedBy: job.approvedBy
    });
    throw new Error(errorCode);
  }
};

const getJobAuditActorName = (job: any) => {
  const createdBy = String(job?.createdBy || "").trim();
  return createdBy && createdBy.toLowerCase() !== "system" ? createdBy : undefined;
};

const summarizeTargetPaths = (targetPaths: unknown) => {
  if (!Array.isArray(targetPaths) || targetPaths.length === 0) return undefined;
  return compactUndefined({
    kind: "array",
    count: targetPaths.length,
    values: logger.isPayloadLoggingEnabled() ? targetPaths.slice(0, AUDIT_PAYLOAD_PREVIEW_LIMIT) : undefined
  });
};

const summarizeValue = (value: unknown): unknown => {
  if (value === undefined || value === null) return undefined;

  if (Array.isArray(value)) {
    const firstRecord = value.find(isRecord);
    return compactUndefined({
      kind: "array",
      count: value.length,
      itemKeys: firstRecord ? Object.keys(firstRecord).slice(0, 20) : undefined,
      values: logger.isPayloadLoggingEnabled() ? value.slice(0, AUDIT_PAYLOAD_PREVIEW_LIMIT) : undefined
    });
  }

  if (value instanceof Date) return value.toISOString();
  if (!isRecord(value)) return value;

  const scalarFields: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    const isScalar = entry === null || ["string", "number", "boolean"].includes(typeof entry) || entry instanceof Date;
    if (isScalar && SUMMARY_FIELD_PATTERN.test(key)) {
      scalarFields[key] = entry instanceof Date ? entry.toISOString() : entry;
    }
  }

  return compactUndefined({
    kind: "object",
    keys: Object.keys(value).slice(0, 20),
    fields: Object.keys(scalarFields).length > 0 ? scalarFields : undefined,
    value: logger.isPayloadLoggingEnabled() ? value : undefined
  });
};

const buildJobAuditMetadata = (job: any, status: string, extra: Record<string, unknown> = {}) =>
  compactUndefined({
    jobId: getJobId(job),
    type: job?.type,
    siteId: getJobSiteId(job),
    status,
    createdBy: job?.createdBy || "system",
    attempt: job?.attempt,
    progressPercent: job?.progressPercent,
    targetPaths: summarizeTargetPaths(job?.targetPaths),
    result: summarizeValue(job?.result),
    evidence: summarizeValue(job?.evidence),
    ...extra
  });

async function writeJobLifecycleAuditLog(params: {
  job: any;
  action: string;
  status: string;
  result?: "success" | "failure";
  error?: string;
  durationMs?: number;
}) {
  const jobId = getJobId(params.job);
  const siteId = getJobSiteId(params.job);
  const metadata = buildJobAuditMetadata(params.job, params.status, {
    durationMs: params.durationMs,
    error: params.error
  });

  logger.info("jobs", "Writing job lifecycle audit log", {
    jobId,
    type: params.job?.type,
    siteId,
    action: params.action,
    status: params.status,
    result: params.result || "success"
  });

  try {
    const auditLog = await writeSystemAuditLog({
      actorName: getJobAuditActorName(params.job),
      action: params.action,
      entityType: "Job",
      entityId: jobId,
      result: params.result || "success",
      error: params.error || "",
      metadata
    });
    logger.debug("jobs", "Job lifecycle audit log persisted", {
      auditLogId: auditLog._id.toString(),
      jobId,
      action: params.action
    });
  } catch (auditError) {
    logger.error("audit", "Failed to persist job lifecycle audit log", {
      jobId,
      action: params.action,
      error: auditError
    });
    logger.error("jobs", "Failed to persist job lifecycle audit log", {
      jobId,
      type: params.job?.type,
      siteId,
      action: params.action,
      error: auditError
    });
  }
}

async function handleVersionUpgrade(job: any) {
  const isRollback = job.type === "version-rollback" || Boolean((job.payload as any)?.rollback);
  logger.info("jobs", "Handling version upgrade job", {
    jobId: job._id.toString(),
    mode: isRollback ? "rollback" : "deploy",
    siteId: job.siteId?.toString(),
    payload: logger.isPayloadLoggingEnabled() ? job.payload : undefined
  });
  logger[isRollback ? "warn" : "info"]("releases", isRollback ? "Handling version rollback job" : "Handling version deploy job", {
    jobId: job._id.toString(),
    siteId: job.siteId?.toString(),
    rollbackReason: isRollback ? (job.payload as any)?.rollbackReason : undefined
  });
  assertApprovedForExecution(job, isRollback ? "version-rollback-job-requires-approval" : "version-upgrade-job-requires-approval");
  assertSharePointWriteAvailable();

  const payload = (job.payload || {}) as {
    releaseId?: string;
    deploymentId?: string;
    targetVersion?: string;
  };

  if (!job.siteId || !payload.releaseId || !payload.deploymentId) {
    throw new Error("Missing deployment payload");
  }

  const [site, release, deployment] = await Promise.all([
    Site.findById(job.siteId),
    Release.findById(payload.releaseId),
    SiteVersionDeployment.findById(payload.deploymentId)
  ]);

  if (!site || !release || !deployment) {
    throw new Error("Site/Release/Deployment not found");
  }

  await setJobProgress(
    job._id.toString(),
    15,
    isRollback ? "Checking recent verified backup before SharePoint rollback" : "Checking recent verified backup before SharePoint deploy"
  );
  const backupSafety = await assertRecentVerifiedBackupForDangerousWrite({
    siteId: site._id,
    operation: isRollback ? "rollback" : "deploy"
  });
  logger.info("backups", "Execution-time dangerous write backup safety satisfied", {
    jobId: job._id.toString(),
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    operation: isRollback ? "rollback" : "deploy",
    backupSafety
  });
  logger.info("releases", "Deploy/rollback execution backup safety re-check completed", {
    jobId: job._id.toString(),
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    operation: isRollback ? "rollback" : "deploy",
    backupId: backupSafety.backup?.id,
    backupExternalId: backupSafety.backup?.backupId
  });

  site.targetVersion = release.version;
  site.versionStatus = "updating";
  site.sharePointStatus.deployStatus = "running" as any;
  await site.save();

  await setJobProgress(
    job._id.toString(),
    25,
    isRollback ? "Planning SharePoint rollback from release artifact" : "Planning SharePoint deploy from release artifact"
  );
  const result = await executeSharePointDeploy({
    siteId: site._id.toString(),
    releaseId: release._id.toString(),
    deploymentId: deployment._id.toString()
  });
  const targetPaths = result.plan.files.map((file) => file.targetPath);
  await setJobTargetPaths(job._id.toString(), targetPaths, `Recorded ${targetPaths.length} deploy target paths`);
  await setJobEvidence(
    job._id.toString(),
    (result.deployment as any).verification?.evidence || [],
    isRollback ? "Rollback verification evidence recorded" : "Deploy verification evidence recorded"
  );
  await setJobResult(
    job._id.toString(),
    {
      finalAppUrl: (result.deployment as any).verification?.finalAppUrlVerification?.url,
      finalAppUrlVerification: (result.deployment as any).verification?.finalAppUrlVerification,
      postHealth: (result.deployment as any).verification?.postHealth
        ? {
            checkedAt: (result.deployment as any).verification.postHealth.checkedAt,
            derivedHealthStatus: (result.deployment as any).verification.postHealth.derivedHealthStatus,
            evidenceCount: (result.deployment as any).verification.postHealth.evidenceCount,
            failedCount: (result.deployment as any).verification.postHealth.failedCount,
            authBlockedCount: (result.deployment as any).verification.postHealth.authBlockedCount
          }
        : undefined,
      siteId: site._id.toString(),
      siteCode: site.siteCode,
      releaseId: release._id.toString(),
      releaseVersion: release.version,
      deploymentId: deployment._id.toString(),
      filesCount: result.plan.summary.filesCount,
      totalSizeBytes: result.plan.summary.totalSizeBytes,
      finalDistRoot: result.plan.resolvedPaths.finalDistRoot,
      targetVersion: release.version,
      mode: isRollback ? "rollback" : "deploy",
      rollbackReason: isRollback ? (job.payload as any)?.rollbackReason || "" : undefined,
      backupSafety
    },
    isRollback ? "Rollback result recorded" : "Deploy result recorded"
  );

  await setJobProgress(
    job._id.toString(),
    95,
    isRollback
      ? `Rolled back ${result.plan.summary.filesCount} files to ${result.plan.resolvedPaths.finalDistRoot}`
      : `Uploaded ${result.plan.summary.filesCount} files to ${result.plan.resolvedPaths.finalDistRoot}`
  );
}

async function handleBackup(job: any) {
  logger.info("jobs", "Handling backup job", {
    jobId: job._id.toString(),
    siteId: job.siteId?.toString(),
    payload: logger.isPayloadLoggingEnabled() ? job.payload : undefined
  });
  assertApprovedForExecution(job, "backup-job-requires-approval");
  assertSharePointWriteAvailable();

  if (!job.siteId) throw new Error("Missing siteId for backup job");
  const site = await Site.findById(job.siteId);
  if (!site) throw new Error("Site not found");

  await setJobProgress(job._id.toString(), 20, "Starting real SharePoint backup execution");
  const backup = await executeSharePointBackup({
    siteId: site._id.toString(),
    jobId: job._id.toString(),
    createdBy: job.createdBy || "system",
    sourcePaths: (job.payload as any)?.sourcePaths
  });
  await setJobTargetPaths(job._id.toString(), [backup.storagePath], "Backup target path recorded");
  await setJobEvidence(job._id.toString(), (backup as any).sourcePaths || [], "Backup source evidence recorded");
  await setJobResult(
    job._id.toString(),
    {
      backupId: backup.backupId,
      storagePath: backup.storagePath,
      filesCount: backup.filesCount,
      sizeBytes: backup.sizeBytes
    },
    "Backup result recorded"
  );
  await setJobProgress(job._id.toString(), 90, `SharePoint backup created at ${backup.storagePath}`);
}

async function handleRestore(job: any) {
  logger.info("jobs", "Handling restore job", {
    jobId: job._id.toString(),
    siteId: job.siteId?.toString(),
    payload: logger.isPayloadLoggingEnabled() ? job.payload : undefined
  });
  logger.info("backups", "Restore job execution requested", {
    jobId: job._id.toString(),
    siteId: job.siteId?.toString(),
    requiresApproval: Boolean(job.requiresApproval),
    approvedAt: job.approvedAt
  });

  if (!job.requiresApproval || !job.approvedAt || !job.approvedBy) {
    logger.error("errors", "Restore job blocked because approval is missing", {
      jobId: job._id.toString(),
      siteId: job.siteId?.toString(),
      requiresApproval: Boolean(job.requiresApproval),
      approvedAt: job.approvedAt
    });
    throw new Error("restore-job-requires-approval");
  }

  assertSharePointWriteAvailable();

  const payload = (job.payload || {}) as {
    backupId?: string;
    siteBackupId?: string;
    backupObjectId?: string;
    backupExternalId?: string;
  };
  const backupId = String(payload.backupId || payload.siteBackupId || payload.backupObjectId || "").trim();
  if (!backupId) throw new Error("Missing backupId for restore job");

  await setJobProgress(job._id.toString(), 15, "Checking recent verified backup before SharePoint restore");
  const backupSafety = await assertRecentVerifiedBackupForDangerousWrite({
    siteId: job.siteId,
    operation: "restore"
  });
  const preRestoreBackupSafety = await assertDistinctRecentVerifiedBackupForRestore({
    siteId: job.siteId,
    restoreBackupObjectId: backupId,
    restoreBackupExternalId: payload.backupExternalId
  });
  logger.info("backups", "Execution-time restore backup safety re-check completed", {
    jobId: job._id.toString(),
    siteId: job.siteId?.toString(),
    backupId,
    backupExternalId: payload.backupExternalId,
    backupSafety,
    preRestoreBackupSafety
  });

  await setJobProgress(job._id.toString(), 20, "Starting SharePoint restore execution");
  const result = await executeSharePointRestore({
    backupId,
    jobId: job._id.toString(),
    requestedBy: job.createdBy || job.approvedBy || "system",
    siteId: job.siteId?.toString()
  });

  const targetPaths = result.evidence.map((item) => item.targetPath);
  await setJobTargetPaths(job._id.toString(), targetPaths, `Recorded ${targetPaths.length} restore target paths`);
  await setJobEvidence(job._id.toString(), result.evidence, "Restore verification evidence recorded");
  await setJobResult(
    job._id.toString(),
    {
      backupId: result.backupId,
      backupExternalId: result.backupExternalId,
      siteId: result.siteId,
      siteCode: result.siteCode,
      filesCount: result.filesCount,
      restoredCount: result.restoredCount,
      totalSizeBytes: result.totalSizeBytes,
      backupSafety,
      preRestoreBackupSafety
    },
    "Restore result recorded"
  );
  await setJobProgress(job._id.toString(), 90, `Restored and verified ${result.restoredCount} files from backup`);
}

async function handleSiteProvision(job: any) {
  logger.info("jobs", "Handling site provisioning job", {
    jobId: job._id.toString(),
    siteId: job.siteId?.toString()
  });
  assertApprovedForExecution(job, "site-provision-job-requires-approval");
  assertSharePointWriteAvailable();

  if (!job.siteId) throw new Error("Missing siteId for site provisioning job");

  await setJobProgress(job._id.toString(), 15, "Starting SharePoint Site Builder provisioning");
  const result = await executeSiteProvisioning(job.siteId.toString());
  const targetPaths = result.completedSteps.map((step) => step.target);
  await setJobTargetPaths(job._id.toString(), targetPaths, `Recorded ${targetPaths.length} provisioning targets`);
  await setJobEvidence(job._id.toString(), result.completedSteps, "Provisioning step evidence recorded");
  await setJobResult(
    job._id.toString(),
    {
      siteId: result.siteId,
      siteCode: result.siteCode,
      completedSteps: result.completedSteps.length,
      finalDistRoot: result.resolvedPaths.finalDistRoot,
      usersDbRoot: result.resolvedPaths.usersDbRoot,
      siteDbRoot: result.resolvedPaths.siteDbRoot
    },
    "Provisioning result recorded"
  );
  await setJobProgress(job._id.toString(), 90, `Provisioned ${result.completedSteps.length} SharePoint structure steps`);
}

async function handleSiteBootstrap(job: any) {
  logger.info("jobs", "Handling SharePoint site bootstrap job", {
    jobId: job._id.toString(),
    siteId: job.siteId?.toString(),
    payload: logger.isPayloadLoggingEnabled() ? job.payload : undefined
  });
  assertSharePointWriteAvailable();

  if (!job.siteId) throw new Error("Missing siteId for site bootstrap job");
  if (!job.requiresApproval || !job.approvedAt || !job.approvedBy) {
    logger.error("jobs", "Site bootstrap job blocked because approval is missing", {
      jobId: job._id.toString(),
      siteId: job.siteId?.toString(),
      requiresApproval: Boolean(job.requiresApproval),
      approvedAt: job.approvedAt
    });
    throw new Error("site-bootstrap-job-requires-approval");
  }

  await setJobProgress(job._id.toString(), 10, "Starting SharePoint site collection creation and bootstrap");
  const result = await executeSiteBootstrap(job.siteId.toString(), job.payload || {});
  const targetPaths = [
    result.resolvedPaths.sharePointSiteUrl,
    ...result.completedSteps.map((step) => step.target)
  ];
  await setJobTargetPaths(job._id.toString(), targetPaths, `Recorded ${targetPaths.length} bootstrap targets`);
  await setJobEvidence(
    job._id.toString(),
    {
      siteCollection: result.siteCollection,
      provisioningSteps: result.provisioning?.completedSteps || [],
      permissionsSteps: result.permissions?.completedSteps || []
    },
    "Site bootstrap evidence recorded"
  );
  await setJobResult(
    job._id.toString(),
    {
      siteId: result.siteId,
      siteCode: result.siteCode,
      sharePointSiteUrl: result.resolvedPaths.sharePointSiteUrl,
      finalAppUrl: result.resolvedPaths.finalAppUrl,
      bootstrapUrl: result.resolvedPaths.bootstrapUrl,
      siteCollectionAction: result.siteCollection.action,
      completedSteps: result.completedSteps.length,
      provisioningSteps: result.provisioning?.completedSteps.length || 0,
      permissionsSteps: result.permissions?.completedSteps.length || 0
    },
    "Site bootstrap result recorded"
  );
  await setJobProgress(job._id.toString(), 90, `Bootstrapped SharePoint site ${result.siteCode}`);
}

async function handlePermissionsSetup(job: any) {
  logger.info("jobs", "Handling permissions setup job", {
    jobId: job._id.toString(),
    siteId: job.siteId?.toString()
  });
  assertApprovedForExecution(job, "permissions-setup-job-requires-approval");
  assertSharePointWriteAvailable();

  if (!job.siteId) throw new Error("Missing siteId for permissions setup job");

  await setJobProgress(job._id.toString(), 20, "Starting siteUsersDb permissions setup");
  const result = await executePermissionsSetup(job.siteId.toString());
  const targetPaths = result.completedSteps.map((step) => step.target);
  await setJobTargetPaths(job._id.toString(), targetPaths, `Recorded ${targetPaths.length} permission targets`);
  await setJobEvidence(job._id.toString(), result.completedSteps, "Permissions setup evidence recorded");
  await setJobResult(
    job._id.toString(),
    {
      siteId: result.siteId,
      siteCode: result.siteCode,
      completedSteps: result.completedSteps.length,
      permissionsMarkerFile: result.resolvedPaths.permissionsMarkerFile,
      usersDbRoot: result.resolvedPaths.usersDbRoot
    },
    "Permissions setup result recorded"
  );
  await setJobProgress(job._id.toString(), 90, `Configured ${result.completedSteps.length} permissions steps`);
}

async function handleAdminSync(job: any) {
  const mode = getAdminSyncMode(job);
  const persistSnapshot = mode === "sync";
  logger.info("jobs", "Handling admin sync job", {
    jobId: job._id.toString(),
    siteId: job.siteId?.toString(),
    mode,
    persistSnapshot,
    payload: logger.isPayloadLoggingEnabled() ? job.payload : undefined
  });
  if (!job.siteId) throw new Error("Missing siteId for admin sync job");

  await setJobProgress(
    job._id.toString(),
    30,
    persistSnapshot
      ? "Reading live admin sources from SharePoint and persisting Hub snapshot"
      : "Reading live admin sources from SharePoint without persisting Hub snapshot"
  );
  const result = await readLiveAdminSources(job.siteId.toString(), {
    persist: persistSnapshot,
    jobId: job._id.toString(),
    capturedBy: job.createdBy || "system"
  });
  const failedSources = result.sourceStatus.filter((source) => !source.ok);
  await setJobEvidence(job._id.toString(), result.sourceStatus, "Admin source status evidence recorded");
  await setJobResult(
    job._id.toString(),
    {
      siteId: result.siteId,
      siteCode: result.siteCode,
      mode,
      readOnly: !persistSnapshot,
      persistedSnapshot: persistSnapshot,
      capturedAt: result.capturedAt,
      adminsCount: result.adminsCount,
      sourceStatus: result.sourceStatus,
      adminDifferences: result.adminDifferences,
      sourceCounts: {
        txt: result.txtAdmins.length,
        siteCollection: result.siteCollectionAdmins.length,
        ownersGroup: result.ownersGroupAdmins.length
      }
    },
    "Admin sync result recorded"
  );
  logger.info("admins", "Admin sync job result persisted", {
    jobId: job._id.toString(),
    siteId: result.siteId,
    siteCode: result.siteCode,
    mode,
    persistedSnapshot: persistSnapshot,
    adminsCount: result.adminsCount,
    failedSources: failedSources.length
  });

  if (failedSources.length > 0) {
    const message = `admin-sync-source-failed:${failedSources.map((source) => source.source).join(",")}`;
    logger.warn("admins", "Admin sync job failed because one or more sources failed", {
      jobId: job._id.toString(),
      siteId: result.siteId,
      siteCode: result.siteCode,
      failedSources
    });
    throw new Error(message);
  }

  await setJobProgress(
    job._id.toString(),
    80,
    persistSnapshot
      ? `Captured ${result.adminsCount} unique admins from live sources and persisted Hub snapshot`
      : `Captured ${result.adminsCount} unique admins from live sources without persistence`
  );
}

async function handleHealthCheck(job: any) {
  logger.info("jobs", "Handling health-check job", {
    jobId: job._id.toString(),
    siteId: job.siteId?.toString(),
    payload: logger.isPayloadLoggingEnabled() ? job.payload : undefined
  });
  if (!job.siteId) throw new Error("Missing siteId for health-check job");

  await setJobProgress(job._id.toString(), 20, "Running read-only SharePoint health check");
  const result = await runReadOnlySharePointHealthCheck(job.siteId.toString());
  await setJobTargetPaths(
    job._id.toString(),
    result.evidence.map((item) => item.url),
    `Recorded ${result.evidence.length} health-check probe URLs`
  );
  await setJobEvidence(job._id.toString(), result.evidence, "Health-check evidence recorded");
  await setJobResult(
    job._id.toString(),
    {
      siteId: result.siteId,
      siteCode: result.siteCode,
      checkedAt: result.checkedAt,
      derivedHealthStatus: result.derivedHealthStatus,
      health: result.health,
      evidenceCount: result.evidence.length,
      failedCount: result.evidence.filter((item) => !item.ok).length,
      authBlockedCount: result.evidence.filter((item) => item.authBlocked).length,
      scheduled: Boolean((job.payload as any)?.scheduled)
    },
    "Health-check result recorded"
  );
  await setJobProgress(job._id.toString(), 90, `Read-only health check completed: ${result.derivedHealthStatus}`);
}

async function handleRepair(job: any) {
  logger.info("jobs", "Handling repair job", {
    jobId: job._id.toString(),
    siteId: job.siteId?.toString(),
    payload: logger.isPayloadLoggingEnabled() ? job.payload : undefined
  });

  if (!job.siteId) throw new Error("Missing siteId for repair job");
  if (!job.requiresApproval || !job.approvedAt || !job.approvedBy) {
    logger.error("jobs", "Repair job blocked because approval is missing", {
      jobId: job._id.toString(),
      siteId: job.siteId?.toString(),
      requiresApproval: Boolean(job.requiresApproval),
      approvedAt: job.approvedAt,
      approvedBy: job.approvedBy
    });
    throw new Error("repair-job-requires-approval");
  }

  const payload = (job.payload || {}) as {
    operation?: string;
    repairType?: string;
    targetPath?: string;
    missingInTxt?: string[];
    mergedTxtAdmins?: Array<{
      displayName?: string;
      personalNumber?: string;
      email?: string;
      loginName?: string;
    }>;
    reason?: string;
  };

  if (payload.repairType !== "admin-txt" && payload.operation !== "admin-txt-repair") {
    logger.warn("jobs", "Unsupported repair job payload failed", {
      jobId: job._id.toString(),
      repairType: payload.repairType,
      operation: payload.operation
    });
    throw new Error(`unsupported-repair-type:${payload.repairType || payload.operation || "unknown"}`);
  }

  logger.info("admins", "Approved TXT admin repair job started", {
    jobId: job._id.toString(),
    siteId: job.siteId.toString(),
    targetPath: payload.targetPath
  });

  await setJobProgress(job._id.toString(), 20, "Starting approved admin TXT repair");
  const result = await executeAdminTxtRepair({
    siteId: job.siteId.toString(),
    jobId: job._id.toString(),
    requestedBy: job.createdBy || job.approvedBy || "system",
    targetPath: payload.targetPath,
    missingInTxt: payload.missingInTxt,
    mergedTxtAdmins: payload.mergedTxtAdmins,
    reason: payload.reason
  });

  await setJobTargetPaths(job._id.toString(), [result.targetPath], "Recorded admin TXT repair target path");
  await setJobEvidence(job._id.toString(), result.evidence, "Admin TXT repair evidence recorded");
  await setJobResult(
    job._id.toString(),
    {
      siteId: result.siteId,
      siteCode: result.siteCode,
      targetPath: result.targetPath,
      repairedMissingInTxtCount: result.repairedMissingInTxtCount,
      adminsCount: result.adminsCount,
      adminDifferences: result.adminDifferences,
      sourceCounts: result.sourceCounts,
      capturedAt: result.capturedAt
    },
    "Admin TXT repair result recorded"
  );
  await setJobProgress(job._id.toString(), 90, "Repaired users_data.txt and refreshed live admin evidence");

  logger.info("admins", "Approved TXT admin repair job completed", {
    jobId: job._id.toString(),
    siteId: result.siteId,
    siteCode: result.siteCode,
    targetPath: result.targetPath,
    repairedMissingInTxtCount: result.repairedMissingInTxtCount
  });
}

async function processJob(job: any) {
  logger.info("jobs", "Processing job by type", {
    jobId: job._id.toString(),
    type: job.type,
    siteId: job.siteId?.toString()
  });
  switch (job.type) {
    case "version-upgrade":
    case "version-rollback":
    case "deploy":
      return handleVersionUpgrade(job);
    case "backup":
      return handleBackup(job);
    case "restore":
      return handleRestore(job);
    case "site-bootstrap":
      return handleSiteBootstrap(job);
    case "site-provision":
      return handleSiteProvision(job);
    case "permissions-setup":
      return handlePermissionsSetup(job);
    case "admin-sync":
      return handleAdminSync(job);
    case "repair":
      return handleRepair(job);
    case "health-check":
      return handleHealthCheck(job);
    default:
      logger.warn("jobs", "Unsupported job type failed", {
        jobId: job._id.toString(),
        type: job.type,
        siteId: job.siteId?.toString()
      });
      throw new Error(`unsupported-job-type:${job.type}`);
  }
}

async function tick() {
  if (isProcessing) {
    logger.debug("jobs", "Worker tick skipped because a job is already processing");
    return;
  }
  isProcessing = true;
  const startedAt = Date.now();
  logger.debug("jobs", "Worker tick started");

  try {
    const job = await claimNextJob();
    if (!job) return;

    logger.info("jobs", "Worker picked job", { jobId: job._id.toString(), type: job.type, siteId: job.siteId?.toString() });
    try {
      const runningJob = await setJobStatus(job._id.toString(), "running", {
        progressPercent: 5,
        message: "Preflight completed; job started"
      });
      await writeJobLifecycleAuditLog({
        job: runningJob || job,
        action: "jobs.running",
        status: "running"
      });
      await processJob(job);
      await setJobStatus(job._id.toString(), "verifying", {
        progressPercent: 95,
        message: "Verifying job outputs"
      });
      const succeededJob = await setJobSucceeded(job._id.toString());
      await writeJobLifecycleAuditLog({
        job: succeededJob || job,
        action: "jobs.succeeded",
        status: "succeeded",
        durationMs: Date.now() - startedAt
      });
      logger.info("jobs", "Worker completed job", {
        jobId: job._id.toString(),
        type: job.type,
        durationMs: Date.now() - startedAt
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("jobs", "Worker job failed", {
        jobId: job._id.toString(),
        type: job.type,
        siteId: job.siteId?.toString(),
        durationMs: Date.now() - startedAt,
        error
      });
      const failedJob = await setJobFailed(job._id.toString(), message);
      await writeJobLifecycleAuditLog({
        job: failedJob || job,
        action: "jobs.failed",
        status: "failed",
        result: "failure",
        error: message,
        durationMs: Date.now() - startedAt
      });

      if ((job.type === "version-upgrade" || job.type === "version-rollback") && (job.payload as any)?.deploymentId) {
        await SiteVersionDeployment.findByIdAndUpdate((job.payload as any).deploymentId, {
          status: "failed",
          finishedAt: new Date(),
          error: message,
          $push: { logLines: { level: "error", message, at: new Date() } }
        });
      }

      if (job.siteId && shouldPersistJobFailureToSite(job)) {
        await Site.findByIdAndUpdate(job.siteId, { lastError: message });
      }
    }
  } finally {
    logger.debug("jobs", "Worker tick finished", { durationMs: Date.now() - startedAt });
    isProcessing = false;
  }
}

export function startJobsWorker() {
  if (!env.JOB_WORKER_ENABLED) {
    logger.warn("jobs", "Jobs worker not started because it is disabled");
    return;
  }
  if (timer) {
    logger.debug("jobs", "Jobs worker start skipped because timer already exists");
    return;
  }
  timer = setInterval(() => {
    tick().catch((error) => {
      logger.error("jobs", "Worker tick failed", { error });
    });
  }, env.JOB_WORKER_POLL_MS);

  logger.info("jobs", "Jobs worker started", { pollMs: env.JOB_WORKER_POLL_MS });
}

export function stopJobsWorker() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
  logger.info("jobs", "Jobs worker stopped");
}

export async function runJobNow(jobId: string) {
  logger.info("jobs", "Running job immediately", { jobId });
  const job = await Job.findById(jobId);
  if (!job) throw new Error("job-not-found");

  if (["preflight", "running", "verifying", "awaiting-approval"].includes(job.status)) {
    throw new Error(`job-already-${job.status}`);
  }

  const now = new Date();
  const nextStatus = job.requiresApproval ? "awaiting-approval" : "queued";
  await Job.findByIdAndUpdate(jobId, {
    $set: {
      status: nextStatus,
      progressPercent: 0,
      errorCode: "",
      errorMessage: "",
      errorDetails: "",
      targetPaths: [],
      ...(job.requiresApproval
        ? {
            approvalRequestedAt: now,
            approvalRequestedBy: job.createdBy || "system",
            approvedBy: "",
            rejectedBy: "",
            approvalDecisionReason: "",
            approvalResult: {
              decision: "rerun-requested",
              requestedAt: now,
              previousStatus: job.status
            }
          }
        : {})
    },
    $unset: {
      startedAt: "",
      finishedAt: "",
      nextRetryAt: "",
      evidence: "",
      result: "",
      approvedAt: "",
      rejectedAt: ""
    },
    $push: {
      logs: {
        level: "info",
        message: job.requiresApproval ? "Job rerun requested and is awaiting approval" : "Job queued for immediate rerun",
        at: now
      }
    }
  });

  if (job.requiresApproval) {
    logger.info("jobs", "Approval-gated job rerun requested", { jobId, status: nextStatus });
    return Job.findById(jobId);
  }

  await tick();
  return Job.findById(jobId);
}
