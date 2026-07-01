import { env } from "../config/env";
import { Job } from "../models/Job";
import { Site } from "../models/Site";
import { SiteVersionDeployment } from "../models/SiteVersionDeployment";
import { logger } from "../utils/logger";
import { getDangerousValidationBypassEnvVar } from "./dangerousBackupBypass.service";
import { writeSystemAuditLog } from "./audit.service";
import { isBrowserRequiredJob } from "./sharepointOperationPolicy.service";
import {
  claimNextJob,
  setJobFailed,
  setJobStatus,
  setJobSucceeded
} from "./jobs.service";

let timer: NodeJS.Timeout | null = null;
let isProcessing = false;

const SHAREPOINT_BROWSER_ONLY_JOB_TYPES = new Set([
  "health-check",
  "deploy",
  "backup",
  "restore",
  "admin-sync",
  "repair",
  "version-upgrade",
  "version-rollback",
  "site-provision",
  "permissions-setup",
  "site-bootstrap"
]);

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
    const bypassEnvVar = getDangerousValidationBypassEnvVar("approval-gates");
    if (bypassEnvVar) {
      logger.warn("jobs", "Approval-gated job execution bypassed by dangerous env", {
        jobId: job._id.toString(),
        type: job.type,
        siteId: job.siteId?.toString(),
        envVar: bypassEnvVar
      });
      return;
    }
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
  logger.warn("jobs", "Server worker refused SharePoint version job; use the browser connector", {
    jobId: job._id.toString(),
    siteId: job.siteId?.toString(),
    type: job.type,
    connectorMode: job.connectorMode,
    executionMode: job.executionMode,
    rollbackReason: isRollback ? (job.payload as any)?.rollbackReason : undefined
  });
  throw new Error("sharepoint-browser-execution-required");
}

async function handleBackup(job: any) {
  logger.info("jobs", "Handling backup job", {
    jobId: job._id.toString(),
    siteId: job.siteId?.toString(),
    payload: logger.isPayloadLoggingEnabled() ? job.payload : undefined
  });
  throw new Error("sharepoint-browser-execution-required");
}

async function handleRestore(job: any) {
  logger.info("jobs", "Handling restore job", {
    jobId: job._id.toString(),
    siteId: job.siteId?.toString(),
    payload: logger.isPayloadLoggingEnabled() ? job.payload : undefined
  });
  throw new Error("sharepoint-browser-execution-required");
}

async function handleSiteProvision(job: any) {
  logger.info("jobs", "Handling site provisioning job", {
    jobId: job._id.toString(),
    siteId: job.siteId?.toString()
  });
  throw new Error("sharepoint-browser-execution-required");
}

async function handleSiteBootstrap(job: any) {
  logger.info("jobs", "Handling SharePoint site bootstrap job", {
    jobId: job._id.toString(),
    siteId: job.siteId?.toString(),
    payload: logger.isPayloadLoggingEnabled() ? job.payload : undefined
  });
  throw new Error("sharepoint-browser-execution-required");
}

async function handlePermissionsSetup(job: any) {
  logger.info("jobs", "Handling permissions setup job", {
    jobId: job._id.toString(),
    siteId: job.siteId?.toString()
  });
  throw new Error("sharepoint-browser-execution-required");
}

async function handleAdminSync(job: any) {
  const mode = getAdminSyncMode(job);
  logger.info("jobs", "Handling admin sync job", {
    jobId: job._id.toString(),
    siteId: job.siteId?.toString(),
    mode,
    payload: logger.isPayloadLoggingEnabled() ? job.payload : undefined
  });
  throw new Error("sharepoint-browser-execution-required");
}

async function handleHealthCheck(job: any) {
  logger.info("jobs", "Handling health-check job", {
    jobId: job._id.toString(),
    siteId: job.siteId?.toString(),
    payload: logger.isPayloadLoggingEnabled() ? job.payload : undefined
  });
  throw new Error("sharepoint-browser-execution-required");
}

async function handleRepair(job: any) {
  logger.info("jobs", "Handling repair job", {
    jobId: job._id.toString(),
    siteId: job.siteId?.toString(),
    payload: logger.isPayloadLoggingEnabled() ? job.payload : undefined
  });
  throw new Error("sharepoint-browser-execution-required");
}

async function processJob(job: any) {
  logger.info("jobs", "Processing job by type", {
    jobId: job._id.toString(),
    type: job.type,
    siteId: job.siteId?.toString(),
    executionMode: job.executionMode,
    connectorMode: job.connectorMode
  });
  if (isBrowserRequiredJob(job)) {
    logger.warn("jobs", "Worker refused to process browser-required SharePoint job", {
      jobId: job._id.toString(),
      type: job.type,
      siteId: job.siteId?.toString(),
      executionMode: job.executionMode,
      connectorMode: job.connectorMode
    });
    throw new Error("browser-required-job-cannot-run-in-worker");
  }
  if (SHAREPOINT_BROWSER_ONLY_JOB_TYPES.has(String(job.type))) {
    logger.warn("jobs", "Worker refused to process SharePoint job because server SharePoint is disabled", {
      jobId: job._id.toString(),
      type: job.type,
      siteId: job.siteId?.toString(),
      executionMode: job.executionMode,
      connectorMode: job.connectorMode
    });
    throw new Error("sharepoint-browser-execution-required");
  }
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
  const executionMode = String((job as any).executionMode || "backend");
  const browserOnlySharePointJob = SHAREPOINT_BROWSER_ONLY_JOB_TYPES.has(String(job.type));
  const browserConnector =
    browserOnlySharePointJob ||
    job.connectorMode === "browser-sharepoint" ||
    (job.payload as any)?.connectorMode === "browser-sharepoint" ||
    job.connectorMode === "backend-sharepoint" ||
    (job.payload as any)?.connectorMode === "backend-sharepoint";
  const nextStatus = job.requiresApproval
    ? "awaiting-approval"
    : browserConnector
      ? "browser-required"
      : "queued";
  const nextExecutionMode = nextStatus === "browser-required"
    ? "browser-required"
    : "backend";
  await Job.findByIdAndUpdate(jobId, {
    $set: {
      status: nextStatus,
      executionMode: nextExecutionMode,
      progressPercent: 0,
      connectorMode: browserConnector ? "browser-sharepoint" : job.connectorMode || "server-local",
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
        message: job.requiresApproval
          ? "Job rerun requested and is awaiting approval"
          : nextStatus === "browser-required"
            ? "Job rerun requested and is waiting for browser SharePoint execution"
            : "Job queued for immediate rerun",
        at: now
      }
    }
  });

  if (job.requiresApproval) {
    logger.info("jobs", "Approval-gated job rerun requested", { jobId, status: nextStatus });
    return Job.findById(jobId);
  }
  if (nextStatus !== "queued") {
    logger.info("jobs", "Non-backend job rerun requested without worker execution", {
      jobId,
      status: nextStatus,
      executionMode
    });
    return Job.findById(jobId);
  }

  await tick();
  return Job.findById(jobId);
}
