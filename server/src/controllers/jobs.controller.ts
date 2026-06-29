import { Request, Response } from "express";
import { ZodError } from "zod";
import { fail, ok } from "../utils/http";
import { normalizeError } from "../utils/errors";
import { logger } from "../utils/logger";
import { jobApprovalDecisionSchema, jobRerunSchema, jobsQuerySchema } from "../validators/job.schema";
import { approveJobWithActor, getJobById, listJobs, rejectJobWithActor } from "../services/jobs.service";
import { runJobNow } from "../services/jobs.worker";
import { writeAuditLog } from "../services/audit.service";

const handleError = (error: unknown, req: Request, res: Response, message: string) => {
  if (error instanceof ZodError) {
    logger.warn("jobs", "Jobs request validation failed", {
      requestId: req.requestId,
      issues: error.issues.length
    });
    return fail(res, "VALIDATION_ERROR", "נתוני הבקשה אינם תקינים", error.flatten(), 400);
  }

  const normalized = normalizeError(error);
  logger.error("jobs", message, {
    requestId: req.requestId,
    jobId: req.params.id,
    code: normalized.code,
    error: normalized.message
  });
  return fail(res, normalized.code, normalized.message, normalized.details, normalized.status);
};

export const getJobs = async (req: Request, res: Response) => {
  try {
    const query = jobsQuerySchema.parse(req.query);
    const jobs = await listJobs(query);
    return ok(res, jobs);
  } catch (error) {
    return handleError(error, req, res, "List jobs request failed");
  }
};

export const getJob = async (req: Request, res: Response) => {
  try {
    const job = await getJobById(req.params.id);
    if (!job) return fail(res, "NOT_FOUND", "Job לא נמצא", undefined, 404);
    return ok(res, job);
  } catch (error) {
    return handleError(error, req, res, "Get job request failed");
  }
};

export const rerunJob = async (req: Request, res: Response) => {
  try {
    const payload = jobRerunSchema.parse(req.body || {});
    const job = await runJobNow(req.params.id);
    await writeAuditLog({
      req,
      action: "jobs.rerun",
      entityType: "Job",
      entityId: job?._id?.toString?.() || req.params.id,
      metadata: {
        jobId: req.params.id,
        type: job?.type,
        siteId: job?.siteId?.toString(),
        reason: payload.reason || "",
        status: job?.status
      }
    });
    return ok(res, job);
  } catch (error) {
    return handleError(error, req, res, "Rerun job request failed");
  }
};

export const approveJobRequest = async (req: Request, res: Response) => {
  const approvedBy = req.user?.name || "system";
  const approvedById = req.user?.id || "";
  let payload: { reason?: string } = {};
  try {
    payload = jobApprovalDecisionSchema.parse(req.body || {});
    const job = await approveJobWithActor(req.params.id, { name: approvedBy, id: approvedById }, payload.reason);

    await writeAuditLog({
      req,
      action: "jobs.approve",
      entityType: "Job",
      entityId: job._id.toString(),
      metadata: {
        jobId: job._id.toString(),
        type: job.type,
        siteId: job.siteId?.toString(),
        approvedBy,
        approvedById,
        reason: payload.reason || "",
        status: job.status
      }
    });

    return ok(res, job);
  } catch (error) {
    const normalized = normalizeError(error);
    await writeAuditLog({
      req,
      action: "jobs.approve",
      entityType: "Job",
      entityId: req.params.id,
      result: "failure",
      error: normalized.message,
      metadata: {
        jobId: req.params.id,
        approvedBy,
        approvedById,
        reason: payload.reason || "",
        code: normalized.code
      }
    }).catch((auditError) => {
      logger.error("audit", "Failed to write failed approval audit log", {
        requestId: req.requestId,
        jobId: req.params.id,
        error: auditError
      });
    });
    return handleError(error, req, res, "Approve job request failed");
  }
};

export const rejectJobRequest = async (req: Request, res: Response) => {
  try {
    const payload = jobApprovalDecisionSchema.parse(req.body || {});
    const rejectedBy = req.user?.name || "system";
    const rejectedById = req.user?.id || "";
    const job = await rejectJobWithActor(req.params.id, { name: rejectedBy, id: rejectedById }, payload.reason);

    await writeAuditLog({
      req,
      action: "jobs.reject",
      entityType: "Job",
      entityId: job._id.toString(),
      metadata: {
        jobId: job._id.toString(),
        type: job.type,
        siteId: job.siteId?.toString(),
        rejectedBy,
        rejectedById,
        reason: payload.reason || "",
        status: job.status
      }
    });

    return ok(res, job);
  } catch (error) {
    return handleError(error, req, res, "Reject job request failed");
  }
};
