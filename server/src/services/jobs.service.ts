import { Types } from "mongoose";
import { env, ownerDirectModeEnabled } from "../config/env";
import { Job } from "../models/Job";
import { logger } from "../utils/logger";
import { getDangerousValidationBypassEnvVar, isDangerousValidationBypassEnabled } from "./dangerousBackupBypass.service";

export type JobType = "health-check" | "deploy" | "backup" | "restore" | "admin-sync" | "repair" | "version-upgrade" | "version-rollback" | "site-provision" | "permissions-setup" | "site-bootstrap" | "runtime-config-check" | "mongo-health-check" | "mongo-seed";
export type JobStatus =
  | "awaiting-approval"
  | "queued"
  | "browser-required"
  | "browser-in-progress"
  | "blocked-service-auth-required"
  | "preflight"
  | "running"
  | "verifying"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "retrying";
export type JobExecutionMode = "backend" | "browser-required" | "browser-in-progress" | "completed" | "failed" | "blocked-service-auth-required";
export type JobConnectorMode = "backend-sharepoint" | "browser-sharepoint" | "mongo-backend" | "server-local" | "backend-service-auth-required" | "manual" | "none";
type JobLogLevel = "info" | "warn" | "error";

const clampProgress = (progressPercent: number) => Math.max(0, Math.min(100, progressPercent));

const appendLogUpdate = (message?: string, level: JobLogLevel = "info") =>
  message ? { $push: { logs: { level, message, at: new Date() } } } : {};

const normalizeActorName = (actor?: string) => {
  const normalized = String(actor || "").trim();
  return normalized || "system";
};

const normalizeActorId = (actor?: string) => String(actor || "").trim();
const normalizeComparisonValue = (value?: unknown) => String(value || "").trim().toLowerCase();
const normalizeDecisionReason = (reason?: string) => String(reason || "").trim();

const selfApprovalLoggedTypes = new Set<JobType>([
  "backup",
  "restore",
  "deploy",
  "version-upgrade",
  "version-rollback",
  "repair",
  "site-provision",
  "permissions-setup",
  "site-bootstrap"
]);

const browserOnlySharePointJobTypes = new Set<JobType>([
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

const approvalTtlMs = () => {
  const hours = Number((env as any).JOB_APPROVAL_TTL_HOURS || 24);
  const normalizedHours = Number.isFinite(hours) && hours > 0 ? hours : 24;
  return normalizedHours * 60 * 60 * 1000;
};

export const approvalsEnabled = () => !ownerDirectModeEnabled() && !isDangerousValidationBypassEnabled("approval-gates");

const formatApprovalSummary = (summary?: string | Record<string, unknown>) => {
  if (!summary) return "";
  if (typeof summary === "string") return summary.trim();

  const title = String(summary.title || "").trim();
  const message = String(summary.message || "").trim();
  const operation = String(summary.operation || "").trim();
  const siteCode = String(summary.siteCode || "").trim();
  const fallback = [operation, siteCode].filter(Boolean).join(" ");
  return [title || fallback, message].filter(Boolean).join(" - ");
};

const logSelfApprovalIfSameActor = (job: any, actorName: string, actorId = "") => {
  if (!job.requiresApproval || !selfApprovalLoggedTypes.has(job.type)) return;

  const normalizedActorName = normalizeComparisonValue(actorName);
  const normalizedActorId = normalizeComparisonValue(actorId);
  const requesterNames = [
    normalizeComparisonValue(job.approvalRequestedBy),
    normalizeComparisonValue(job.createdBy)
  ].filter(Boolean);
  const requesterIds = [
    normalizeComparisonValue(job.approvalRequestedById),
    normalizeComparisonValue(job.createdById)
  ].filter(Boolean);

  const sameActorById = Boolean(normalizedActorId && requesterIds.includes(normalizedActorId));
  const sameActorByName = Boolean(normalizedActorName && requesterNames.includes(normalizedActorName));

  if (!sameActorById && !sameActorByName) return;

  logger.warn("security", "Job self-approval accepted", {
    jobId: job._id?.toString?.() || "",
    type: job.type,
    siteId: job.siteId?.toString?.(),
    approvalRequestedBy: job.approvalRequestedBy,
    approvalRequestedById: job.approvalRequestedById,
    createdBy: job.createdBy,
    createdById: job.createdById,
    approvedBy: actorName,
    approvedById: actorId,
    matchedBy: sameActorById ? "id" : "name"
  });
};

export async function createJob(input: {
  type: JobType;
  siteId?: string;
  payload?: Record<string, unknown>;
  createdBy?: string;
  createdById?: string;
  maxAttempts?: number;
  requiresApproval?: boolean;
  approvalSummary?: string | Record<string, unknown>;
  approvalSnapshot?: unknown;
  approvalExpiresAt?: Date;
  executionMode?: JobExecutionMode;
  connectorMode?: JobConnectorMode;
  operationPolicy?: string;
  connectorStatusLabel?: string;
  connectorBlocker?: string;
}) {
  const requestedApproval = Boolean(input.requiresApproval);
  const requiresApproval = approvalsEnabled() ? requestedApproval : false;
  const createdBy = normalizeActorName(input.createdBy);
  const createdById = normalizeActorId(input.createdById);
  const now = new Date();
  const executionMode: JobExecutionMode = input.executionMode || "backend";
  const connectorMode: JobConnectorMode = input.connectorMode || (executionMode === "browser-required" ? "browser-sharepoint" : "server-local");
  const initialStatus: JobStatus = requiresApproval
    ? "awaiting-approval"
    : executionMode === "browser-required"
      ? "browser-required"
      : executionMode === "blocked-service-auth-required"
        ? "blocked-service-auth-required"
        : "queued";
  const approvalSummary = formatApprovalSummary(input.approvalSummary);
  const approvalExpiresAt = input.approvalExpiresAt || (requiresApproval ? new Date(now.getTime() + approvalTtlMs()) : undefined);

  logger.info("jobs", "Creating job", {
    type: input.type,
    siteId: input.siteId,
    createdBy,
    createdById,
    maxAttempts: input.maxAttempts ?? 3,
    requiresApproval,
    requestedApproval,
    executionMode,
    connectorMode,
    operationPolicy: input.operationPolicy,
    ownerDirectMode: ownerDirectModeEnabled(),
    dangerousApprovalBypassEnvVar: getDangerousValidationBypassEnvVar("approval-gates") || undefined,
    approvalSummary,
    approvalExpiresAt,
    payload: logger.isPayloadLoggingEnabled() ? input.payload : undefined,
    approvalSnapshot: logger.isPayloadLoggingEnabled() ? input.approvalSnapshot : undefined
  });

  const job = await Job.create({
    type: input.type,
    siteId: input.siteId ? new Types.ObjectId(input.siteId) : undefined,
    payload: input.payload || {},
    createdBy,
    createdById,
    maxAttempts: input.maxAttempts ?? 3,
    status: initialStatus,
    executionMode,
    connectorMode,
    operationPolicy: input.operationPolicy || "",
    connectorStatusLabel: input.connectorStatusLabel || "",
    connectorBlocker: input.connectorBlocker || "",
    progressPercent: 0,
    attempt: 0,
    requiresApproval,
    approvalSummary,
    approvalSnapshot: requestedApproval && !requiresApproval
      ? {
          ...(typeof input.approvalSnapshot === "object" && input.approvalSnapshot !== null ? input.approvalSnapshot as Record<string, unknown> : {}),
          approvalSkipped: true,
          approvalSkippedReason: getDangerousValidationBypassEnvVar("approval-gates") || "owner-direct-mode"
        }
      : input.approvalSnapshot,
    approvalExpiresAt,
    approvalRequestedAt: requiresApproval ? now : undefined,
    approvalRequestedBy: requiresApproval ? createdBy : "",
    approvalRequestedById: requiresApproval ? createdById : "",
    logs: [{
      level: executionMode === "blocked-service-auth-required" ? "warn" : "info",
      message: requiresApproval
        ? "Job awaiting approval"
        : executionMode === "browser-required"
          ? "Job waiting for browser SharePoint execution"
          : executionMode === "blocked-service-auth-required"
            ? input.connectorBlocker || "Job blocked because this legacy server SharePoint path is disabled"
            : "Job queued",
      at: now
    }]
  });
  logger.info("jobs", requiresApproval ? "Job awaiting approval" : initialStatus === "browser-required" ? "Job waiting for browser execution" : initialStatus === "blocked-service-auth-required" ? "Job blocked for legacy server SharePoint" : "Job queued", {
    jobId: job._id.toString(),
    type: job.type,
    siteId: job.siteId?.toString(),
    status: job.status,
    executionMode,
    connectorMode,
    requiresApproval
  });
  return job;
}

export async function approveJob(jobId: string, approvedBy: string, reason?: string) {
  const actor = normalizeActorName(approvedBy);
  const actorId = "";
  return approveJobWithActor(jobId, { name: actor, id: actorId }, reason);
}

export async function approveJobWithActor(jobId: string, approvedBy: { name: string; id?: string }, reason?: string) {
  const actor = normalizeActorName(approvedBy.name);
  const actorId = normalizeActorId(approvedBy.id);
  const decisionReason = normalizeDecisionReason(reason);
  const now = new Date();
  const job = await Job.findById(jobId);
  if (!job) throw new Error("job-not-found");
  if (job.status !== "awaiting-approval") throw new Error("job-approval-not-awaiting");
  if (job.approvalExpiresAt && job.approvalExpiresAt.getTime() < now.getTime()) {
    throw new Error("job-approval-expired");
  }
  logSelfApprovalIfSameActor(job, actor, actorId);
  const executionMode = String((job as any).executionMode || "backend");
  const browserConnector =
    (job as any).connectorMode === "browser-sharepoint" ||
    (job.payload as any)?.connectorMode === "browser-sharepoint" ||
    browserOnlySharePointJobTypes.has(job.type as JobType);
  const approvedStatus: JobStatus = browserConnector
    ? "browser-required"
    : executionMode === "blocked-service-auth-required"
      ? "blocked-service-auth-required"
      : "queued";

  logger.info("jobs", "Approving job", {
    jobId,
    type: job.type,
    siteId: job.siteId?.toString(),
    executionMode,
    approvedStatus,
    approvedBy: actor,
    reason: decisionReason
  });

  const updated = await Job.findByIdAndUpdate(
    jobId,
    {
      $set: {
        status: approvedStatus,
        executionMode: approvedStatus === "browser-required" ? "browser-required" : approvedStatus === "blocked-service-auth-required" ? "blocked-service-auth-required" : "backend",
        connectorMode: approvedStatus === "browser-required" ? "browser-sharepoint" : (job as any).connectorMode || "server-local",
        progressPercent: 0,
        approvedAt: now,
        approvedBy: actor,
        approvedById: actorId,
        approvalDecisionReason: decisionReason,
        approvalResult: {
          decision: "approved",
          decidedAt: now,
          decidedBy: actor,
          decidedById: actorId,
          reason: decisionReason
        },
        errorCode: "",
        errorMessage: "",
        errorDetails: ""
      },
      $unset: {
        rejectedAt: "",
        startedAt: "",
        finishedAt: "",
        nextRetryAt: ""
      },
      $push: {
        logs: {
          level: "info",
          message: decisionReason
            ? approvedStatus === "browser-required"
              ? `Job approved and waiting for browser SharePoint execution: ${decisionReason}`
              : `Job approved: ${decisionReason}`
            : approvedStatus === "browser-required"
              ? "Job approved and waiting for browser SharePoint execution"
              : "Job approved",
          at: now
        }
      }
    },
    { new: true }
  );
  if (!updated) throw new Error("job-not-found");
  return updated;
}

export async function rejectJob(jobId: string, rejectedBy: string, reason?: string) {
  const actor = normalizeActorName(rejectedBy);
  return rejectJobWithActor(jobId, { name: actor }, reason);
}

export async function rejectJobWithActor(jobId: string, rejectedBy: { name: string; id?: string }, reason?: string) {
  const actor = normalizeActorName(rejectedBy.name);
  const actorId = normalizeActorId(rejectedBy.id);
  const decisionReason = normalizeDecisionReason(reason);
  const now = new Date();
  const job = await Job.findById(jobId);
  if (!job) throw new Error("job-not-found");
  if (job.status !== "awaiting-approval") throw new Error("job-approval-not-awaiting");

  logger.warn("jobs", "Rejecting job approval", {
    jobId,
    type: job.type,
    siteId: job.siteId?.toString(),
    rejectedBy: actor,
    reason: decisionReason
  });

  const updated = await Job.findByIdAndUpdate(
    jobId,
    {
      $set: {
        status: "cancelled",
        progressPercent: 0,
        finishedAt: now,
        rejectedAt: now,
        rejectedBy: actor,
        rejectedById: actorId,
        approvalDecisionReason: decisionReason,
        approvalResult: {
          decision: "rejected",
          decidedAt: now,
          decidedBy: actor,
          decidedById: actorId,
          reason: decisionReason
        },
        errorCode: "JOB_REJECTED",
        errorMessage: decisionReason ? `Job rejected: ${decisionReason}` : "Job rejected"
      },
      $push: {
        logs: {
          level: "warn",
          message: decisionReason ? `Job rejected: ${decisionReason}` : "Job rejected",
          at: now
        }
      }
    },
    { new: true }
  );
  if (!updated) throw new Error("job-not-found");
  return updated;
}

export function listJobs(filters: { status?: string; type?: string; siteId?: string }) {
  const query: Record<string, unknown> = {};
  if (filters.status) query.status = filters.status;
  if (filters.type) query.type = filters.type;
  if (filters.siteId) query.siteId = filters.siteId;

  logger.debug("jobs", "Listing jobs", { filters, query });
  return Job.find(query).sort({ createdAt: -1 }).limit(400);
}

export function getJobById(id: string) {
  logger.debug("jobs", "Loading job by id", { id });
  return Job.findById(id);
}

export async function appendJobLog(jobId: string, message: string, level: "info" | "warn" | "error" = "info") {
  logger[level]("jobs", "Appending job log", { jobId, message });
  return Job.findByIdAndUpdate(jobId, { $push: { logs: { level, message, at: new Date() } } }, { new: true });
}

export async function setJobStatus(jobId: string, status: JobStatus, options: {
  progressPercent?: number;
  message?: string;
  level?: JobLogLevel;
  startedAt?: Date;
  finishedAt?: Date;
  clearFinishedAt?: boolean;
  clearErrors?: boolean;
  incAttempt?: boolean;
} = {}) {
  logger.info("jobs", "Setting job status", {
    jobId,
    status,
    progressPercent: options.progressPercent,
    message: options.message,
    incAttempt: options.incAttempt
  });

  const $set: Record<string, unknown> = { status };
  const $unset: Record<string, string> = {};

  if (options.progressPercent !== undefined) {
    $set.progressPercent = clampProgress(options.progressPercent);
  }
  if (status === "browser-in-progress") {
    $set.executionMode = "browser-in-progress";
  } else if (status === "blocked-service-auth-required") {
    $set.executionMode = "blocked-service-auth-required";
  }
  if (options.startedAt) {
    $set.startedAt = options.startedAt;
  }
  if (options.finishedAt) {
    $set.finishedAt = options.finishedAt;
  }
  if (options.clearFinishedAt) {
    $unset.finishedAt = "";
  }
  if (options.clearErrors) {
    $set.errorCode = "";
    $set.errorMessage = "";
    $set.errorDetails = "";
  }

  const update: Record<string, unknown> = {
    $set,
    ...appendLogUpdate(options.message, options.level)
  };

  if (Object.keys($unset).length > 0) {
    update.$unset = $unset;
  }
  if (options.incAttempt) {
    update.$inc = { attempt: 1 };
  }

  return Job.findByIdAndUpdate(jobId, update, { new: true });
}

export async function setJobEvidence(jobId: string, evidence: unknown, message?: string) {
  logger.info("jobs", "Setting job evidence", {
    jobId,
    evidenceKind: Array.isArray(evidence) ? "array" : typeof evidence,
    evidenceCount: Array.isArray(evidence) ? evidence.length : undefined,
    payload: logger.isPayloadLoggingEnabled() ? evidence : undefined
  });

  return Job.findByIdAndUpdate(
    jobId,
    {
      $set: { evidence },
      ...appendLogUpdate(message)
    },
    { new: true }
  );
}

export async function setJobResult(jobId: string, result: unknown, message?: string) {
  logger.info("jobs", "Setting job result", {
    jobId,
    resultKind: Array.isArray(result) ? "array" : typeof result,
    payload: logger.isPayloadLoggingEnabled() ? result : undefined
  });

  return Job.findByIdAndUpdate(
    jobId,
    {
      $set: { result },
      ...appendLogUpdate(message)
    },
    { new: true }
  );
}

export async function setJobTargetPaths(jobId: string, targetPaths: string[], message?: string) {
  logger.info("jobs", "Setting job target paths", {
    jobId,
    targetPathCount: targetPaths.length,
    targetPaths: logger.isPayloadLoggingEnabled() ? targetPaths : targetPaths.slice(0, 10)
  });

  return Job.findByIdAndUpdate(
    jobId,
    {
      $set: { targetPaths },
      ...appendLogUpdate(message)
    },
    { new: true }
  );
}

export async function setJobRunning(jobId: string) {
  return setJobStatus(jobId, "running", {
    startedAt: new Date(),
    incAttempt: true,
    message: "Job started"
  });
}

export async function setJobProgress(jobId: string, progressPercent: number, message?: string) {
  logger.info("jobs", "Setting job progress", { jobId, progressPercent, message });
  const update: Record<string, unknown> = { $set: { progressPercent: clampProgress(progressPercent) } };
  if (message) {
    update.$push = { logs: { level: "info", message, at: new Date() } };
  }

  return Job.findByIdAndUpdate(jobId, update, { new: true });
}

export async function setJobSucceeded(jobId: string, message = "Job completed") {
  const updated = await setJobStatus(jobId, "succeeded", {
    progressPercent: 100,
    finishedAt: new Date(),
    message
  });
  if (updated) {
    updated.executionMode = "completed" as any;
    await updated.save();
  }
  return updated;
}

export async function setJobFailed(jobId: string, errorMessage: string) {
  logger.error("jobs", "Setting job failed", { jobId, errorMessage });
  return Job.findByIdAndUpdate(
    jobId,
    {
      $set: {
        status: "failed",
        executionMode: "failed",
        finishedAt: new Date(),
        errorMessage,
        errorCode: "JOB_FAILED"
      },
      $push: { logs: { level: "error", message: errorMessage, at: new Date() } }
    },
    { new: true }
  );
}

export async function claimNextJob() {
  const now = new Date();
  logger.debug("jobs", "Claiming next queued job for preflight", { now: now.toISOString() });
  const job = await Job.findOneAndUpdate(
    {
      status: "queued",
      executionMode: { $nin: ["browser-required", "browser-in-progress", "blocked-service-auth-required"] },
      connectorMode: { $nin: ["browser-sharepoint", "backend-sharepoint", "backend-service-auth-required"] },
      "payload.connectorMode": { $nin: ["browser-sharepoint", "backend-sharepoint", "backend-service-auth-required"] },
      "payload.executionMode": { $ne: "browser-required" },
      $or: [{ nextRetryAt: { $exists: false } }, { nextRetryAt: null }, { nextRetryAt: { $lte: now } }]
    },
    {
      $set: {
        status: "preflight",
        progressPercent: 0,
        startedAt: now,
        errorCode: "",
        errorMessage: "",
        errorDetails: ""
      },
      $unset: { nextRetryAt: "" },
      $inc: { attempt: 1 },
      $push: { logs: { level: "info", message: "Job claimed for preflight", at: now } }
    },
    { sort: { createdAt: 1 }, new: true }
  );
  logger.debug("jobs", job ? "Queued job claimed for preflight" : "No queued jobs available", {
    jobId: job?._id.toString(),
    type: job?.type,
    siteId: job?.siteId?.toString()
  });
  return job;
}
