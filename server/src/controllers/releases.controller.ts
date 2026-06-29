import { Request, Response } from "express";
import fsSync from "fs";
import { ZodError } from "zod";
import { fail, ok } from "../utils/http";
import { normalizeError } from "../utils/errors";
import { logger } from "../utils/logger";
import { writeAuditLog } from "../services/audit.service";
import {
  buildBatchDeployPlan,
  createRelease,
  enqueueBatchDeploy,
  listReleases,
  enqueueDeployAll,
  enqueueDeploySite,
  enqueueRollbackSite,
  buildRollbackSitePlan,
  listSiteDeployments,
  buildVersionStatus
} from "../services/releases.service";
import {
  buildSiteDeployPlan,
  getReleaseArtifactFile,
  getReleaseArtifactManifest,
  recordBrowserSharePointDeploymentEvidence,
  validateReleaseArtifact
} from "../services/deployArtifact.service";
import {
  createReleaseSchema,
  batchDeployExecuteSchema,
  batchDeployPlanSchema,
  deployAllSchema,
  deploySiteSchema,
  rollbackSiteSchema,
  nextVersionSchema
} from "../validators/release.schema";
import { bumpVersion } from "../utils/version";

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

export const getReleaseArtifactManifestEndpoint = async (req: Request, res: Response) => {
  try {
    const result = await getReleaseArtifactManifest(req.params.id);
    await writeAuditLog({
      req,
      action: "releases.artifact-manifest",
      entityType: "Release",
      entityId: req.params.id,
      metadata: {
        filesCount: result.summary.filesCount,
        deployableFilesCount: result.summary.deployableFilesCount,
        readyForDeploy: result.summary.readyForDeploy
      }
    });
    return ok(res, result);
  } catch (error) {
    return handleError(error, res);
  }
};

export const getReleaseArtifactFileEndpoint = async (req: Request, res: Response) => {
  try {
    const relativePath = String(req.query.path || "");
    const file = await getReleaseArtifactFile(req.params.id, relativePath);
    await writeAuditLog({
      req,
      action: "releases.artifact-file",
      entityType: "Release",
      entityId: req.params.id,
      metadata: {
        relativePath: file.relativePath,
        sizeBytes: file.sizeBytes,
        sha256: file.sha256
      }
    });

    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Content-Length", String(file.sizeBytes));
    res.setHeader("X-Artifact-Sha256", file.sha256);
    res.setHeader("X-Artifact-Size", String(file.sizeBytes));
    res.setHeader("X-Artifact-Relative-Path", encodeURIComponent(file.relativePath));

    const stream = fsSync.createReadStream(file.absolutePath);
    stream.on("error", (error) => {
      logger.error("releases", "Artifact file stream failed", {
        releaseId: req.params.id,
        relativePath: file.relativePath,
        error: error.message
      });
      if (!res.headersSent) {
        fail(res, "ARTIFACT_STREAM_FAILED", "שגיאה בקריאת קובץ artifact", undefined, 500);
      } else {
        res.end();
      }
    });
    return stream.pipe(res);
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
      deployMode: payload.deployMode,
      createdBy: req.user?.name || "system"
    });

    await writeAuditLog({
      req,
      action: "releases.deploy-all",
      entityType: "Release",
      entityId: req.params.id,
      metadata: { queued: result.queued, onlyOutdated: payload.onlyOutdated, deployMode: payload.deployMode }
    });

    return ok(res, { queuedJobs: result.queued, jobs: result.jobs });
  } catch (error) {
    return handleError(error, res);
  }
};

export const planBatchDeploy = async (req: Request, res: Response) => {
  try {
    const payload = batchDeployPlanSchema.parse(req.body || {});
    const plan = await buildBatchDeployPlan({
      releaseId: req.params.id,
      targetMode: payload.targetMode,
      targetSiteIds: payload.targetSiteIds,
      deployMode: payload.deployMode,
      connectorMode: payload.connectorMode,
      allowDeployWithoutBackup: payload.allowDeployWithoutBackup
    });

    await writeAuditLog({
      req,
      action: "releases.deploy-batch-plan",
      entityType: "Release",
      entityId: req.params.id,
      metadata: {
        targetMode: plan.targetMode,
        targetSiteIds: plan.targetSiteIds,
        totalSelectedSites: plan.summary.totalSelectedSites,
        readySites: plan.summary.readySites,
        blockedSites: plan.summary.blockedSites,
        alreadyUpToDateSites: plan.summary.alreadyUpToDateSites,
        deployMode: plan.deployMode,
        connectorMode: plan.connectorMode,
        allowDeployWithoutBackup: plan.allowDeployWithoutBackup
      }
    });

    return ok(res, plan);
  } catch (error) {
    return handleError(error, res);
  }
};

export const deployBatch = async (req: Request, res: Response) => {
  try {
    const payload = batchDeployExecuteSchema.parse(req.body || {});
    const result = await enqueueBatchDeploy({
      releaseId: req.params.id,
      targetMode: payload.targetMode,
      targetSiteIds: payload.targetSiteIds,
      deployMode: payload.deployMode,
      connectorMode: payload.connectorMode,
      allowDeployWithoutBackup: payload.allowDeployWithoutBackup,
      confirmNoPartial: payload.confirmNoPartial,
      createdBy: req.user?.name || "system"
    });

    await writeAuditLog({
      req,
      action: "releases.deploy-batch",
      entityType: "Release",
      entityId: req.params.id,
      metadata: {
        queued: result.queued,
        targetMode: result.plan.targetMode,
        targetSiteIds: result.plan.targetSiteIds,
        skippedUpToDate: result.skippedUpToDate,
        deployMode: result.plan.deployMode,
        connectorMode: result.plan.connectorMode,
        allowDeployWithoutBackup: result.plan.allowDeployWithoutBackup,
        requiresApproval: result.requiresApproval,
        approvalStatus: result.approvalStatus
      }
    });

    return ok(res, result, undefined, 202);
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
      deployMode: payload.deployMode,
      connectorMode: payload.connectorMode,
      allowDeployWithoutBackup: payload.allowDeployWithoutBackup,
      createdBy: req.user?.name || "system"
    });

    await writeAuditLog({
      req,
      action: "sites.deploy-version",
      entityType: "Site",
      entityId: req.params.id,
      metadata: {
        releaseId: payload.releaseId,
        jobId: result.job._id.toString(),
        deployMode: result.deployMode || payload.deployMode,
        requiresApproval: result.requiresApproval,
        approvalStatus: result.approvalStatus
      }
    });

    return ok(res, result, undefined, 202);
  } catch (error) {
    return handleError(error, res);
  }
};

export const recordBrowserDeploymentEvidence = async (req: Request, res: Response) => {
  try {
    const result = await recordBrowserSharePointDeploymentEvidence({
      siteId: req.params.id,
      input: req.body,
      actor: req.user?.name || "browser-sharepoint"
    });

    await writeAuditLog({
      req,
      action: "sites.browser-deploy-evidence",
      entityType: "Site",
      entityId: req.params.id,
      metadata: {
        releaseId: req.body?.releaseId,
        deploymentId: result.deployment._id.toString(),
        connectorMode: "browser-sharepoint",
        finalStatus: req.body?.finalStatus,
        filesCount: result.summary.filesCount,
        verifiedFilesCount: result.summary.verifiedFilesCount,
        failedFilesCount: result.summary.failedFilesCount,
        siteVersionUpdated: result.summary.siteVersionUpdated
      }
    });

    return ok(res, {
      deployment: result.deployment,
      site: result.site,
      summary: result.summary
    }, undefined, 201);
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
    const plan = await buildSiteDeployPlan(req.params.id, payload.releaseId, {
      deployMode: payload.deployMode,
      connectorMode: payload.connectorMode
    });

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
        writeAvailable: plan.capabilities.writeAvailable,
        deployMode: plan.deployMode,
        connectorMode: plan.connectorMode,
        backupRequired: plan.deployPolicy.requiresRecentVerifiedBackup,
        requiresApproval: plan.deployPolicy.requiresApproval
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
    return ok(res, { nextVersion: bumpVersion(payload.fromVersion, payload.releaseType) });
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
