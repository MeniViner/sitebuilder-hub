import { Request, Response } from "express";
import { ZodError } from "zod";
import { fail, ok } from "../utils/http";
import { normalizeError } from "../utils/errors";
import { logger } from "../utils/logger";
import { writeAuditLog } from "../services/audit.service";
import {
  createRelease,
  listReleases,
  enqueueDeployAll,
  enqueueDeploySite,
  enqueueRollbackSite,
  buildRollbackSitePlan,
  listSiteDeployments,
  buildVersionStatus
} from "../services/releases.service";
import { buildSiteDeployPlan, validateReleaseArtifact } from "../services/deployArtifact.service";
import {
  createReleaseSchema,
  deployAllSchema,
  deploySiteSchema,
  rollbackSiteSchema,
  nextVersionSchema
} from "../validators/release.schema";
import { bumpPatch } from "../utils/version";

const handleError = (error: unknown, res: Response) => {
  if (error instanceof ZodError) {
    logger.warn("releases", "Releases request validation failed", { issues: error.issues.length });
    return fail(res, "VALIDATION_ERROR", "נתוני הבקשה אינם תקינים", error.flatten(), 400);
  }
  const normalized = normalizeError(error);
  logger.error("releases", "Releases request failed", {
    code: normalized.code,
    error: normalized.message
  });
  return fail(res, normalized.code, normalized.message, normalized.details, normalized.status);
};

export const getReleases = async (_req: Request, res: Response) => {
  try {
    const releases = await listReleases();
    return ok(res, releases);
  } catch (error) {
    return handleError(error, res);
  }
};

export const getReleaseArtifactValidation = async (req: Request, res: Response) => {
  try {
    const result = await validateReleaseArtifact(req.params.id);
    return ok(res, result);
  } catch (error) {
    return handleError(error, res);
  }
};

export const postRelease = async (req: Request, res: Response) => {
  try {
    const payload = createReleaseSchema.parse(req.body);
    const release = await createRelease({
      ...payload,
      createdBy: req.user?.name || "system"
    });

    await writeAuditLog({
      req,
      action: "releases.create",
      entityType: "Release",
      entityId: release._id.toString(),
      after: release.toObject()
    });

    return ok(res, release, undefined, 201);
  } catch (error) {
    return handleError(error, res);
  }
};

export const deployAll = async (req: Request, res: Response) => {
  try {
    const payload = deployAllSchema.parse(req.body || {});
    const result = await enqueueDeployAll({
      releaseId: req.params.id,
      onlyOutdated: payload.onlyOutdated,
      createdBy: req.user?.name || "system"
    });

    await writeAuditLog({
      req,
      action: "releases.deploy-all",
      entityType: "Release",
      entityId: req.params.id,
      metadata: { queued: result.queued, onlyOutdated: payload.onlyOutdated }
    });

    return ok(res, { queuedJobs: result.queued, jobs: result.jobs });
  } catch (error) {
    return handleError(error, res);
  }
};

export const deploySiteVersion = async (req: Request, res: Response) => {
  try {
    const payload = deploySiteSchema.parse(req.body);
    const result = await enqueueDeploySite({
      siteId: req.params.id,
      releaseId: payload.releaseId,
      createdBy: req.user?.name || "system"
    });

    await writeAuditLog({
      req,
      action: "sites.deploy-version",
      entityType: "Site",
      entityId: req.params.id,
      metadata: { releaseId: payload.releaseId, jobId: result.job._id.toString() }
    });

    return ok(res, result, undefined, 202);
  } catch (error) {
    return handleError(error, res);
  }
};

export const rollbackSiteVersion = async (req: Request, res: Response) => {
  try {
    const payload = rollbackSiteSchema.parse(req.body);
    const result = await enqueueRollbackSite({
      siteId: req.params.id,
      releaseId: payload.releaseId,
      reason: payload.reason,
      createdBy: req.user?.name || "system"
    });

    await writeAuditLog({
      req,
      action: "sites.rollback-version",
      entityType: "Site",
      entityId: req.params.id,
      metadata: {
        releaseId: payload.releaseId,
        jobId: result.job._id.toString(),
        deploymentId: result.deployment._id.toString(),
        reason: payload.reason || ""
      }
    });

    logger.warn("releases", "Rollback job queued from API", {
      siteId: req.params.id,
      releaseId: payload.releaseId,
      jobId: result.job._id.toString(),
      deploymentId: result.deployment._id.toString()
    });

    return ok(res, result, undefined, 202);
  } catch (error) {
    return handleError(error, res);
  }
};

export const planRollbackSiteVersion = async (req: Request, res: Response) => {
  try {
    const payload = rollbackSiteSchema.parse(req.body);
    const plan = await buildRollbackSitePlan({
      siteId: req.params.id,
      releaseId: payload.releaseId,
      reason: payload.reason
    });

    await writeAuditLog({
      req,
      action: "sites.rollback-plan",
      entityType: "Site",
      entityId: req.params.id,
      metadata: {
        releaseId: payload.releaseId,
        fromVersion: plan.rollback.fromVersion,
        toVersion: plan.rollback.toVersion,
        filesCount: plan.summary.filesCount,
        totalSizeBytes: plan.summary.totalSizeBytes,
        readyForDeploy: plan.summary.readyForDeploy,
        writeAvailable: plan.capabilities.writeAvailable
      }
    });

    return ok(res, plan);
  } catch (error) {
    return handleError(error, res);
  }
};

export const planSiteDeployVersion = async (req: Request, res: Response) => {
  try {
    const payload = deploySiteSchema.parse(req.body);
    const plan = await buildSiteDeployPlan(req.params.id, payload.releaseId);

    await writeAuditLog({
      req,
      action: "sites.deploy-plan",
      entityType: "Site",
      entityId: req.params.id,
      metadata: {
        releaseId: payload.releaseId,
        filesCount: plan.summary.filesCount,
        totalSizeBytes: plan.summary.totalSizeBytes,
        readyForDeploy: plan.summary.readyForDeploy,
        writeAvailable: plan.capabilities.writeAvailable
      }
    });

    return ok(res, plan);
  } catch (error) {
    return handleError(error, res);
  }
};

export const getSiteDeployments = async (req: Request, res: Response) => {
  try {
    const deployments = await listSiteDeployments(req.params.id);
    return ok(res, deployments);
  } catch (error) {
    return handleError(error, res);
  }
};

export const getNextVersion = async (req: Request, res: Response) => {
  try {
    const payload = nextVersionSchema.parse(req.body);
    return ok(res, { nextVersion: bumpPatch(payload.fromVersion) });
  } catch (error) {
    return handleError(error, res);
  }
};

export const getVersionStatus = async (_req: Request, res: Response) => {
  try {
    const status = await buildVersionStatus();
    return ok(res, status);
  } catch (error) {
    return handleError(error, res);
  }
};
