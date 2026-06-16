import { Request, Response } from "express";
import { ZodError } from "zod";
import {
  createSiteSchema,
  manualHealthSchema,
  querySchema,
  siteBootstrapSchema,
  updateSiteSchema
} from "../validators/site.schema";
import * as sitesService from "../services/sites.service";
import { fail, ok } from "../utils/http";
import { logger } from "../utils/logger";
import { normalizeError } from "../utils/errors";
import { writeAuditLog } from "../services/audit.service";
import { recordBrowserSharePointHealthCheck, runReadOnlySharePointHealthCheck } from "../services/sharepointHealth.service";
import { createJob } from "../services/jobs.service";
import { buildSiteProvisionPlan } from "../services/siteProvisioning.service";
import { getSharePointOperationCapabilities } from "../services/sharepointOperationClient";
import { buildPermissionsSetupPlan } from "../services/permissionsSetup.service";
import { buildSiteBootstrapPlan, normalizeSiteBootstrapOptions } from "../services/siteBootstrap.service";

type ApprovalGatedJobInput = Parameters<typeof createJob>[0] & {
  requiresApproval: boolean;
  approvalSummary: Record<string, unknown>;
  approvalSnapshot: Record<string, unknown>;
};

const SITE_PROVISION_APPROVAL_MESSAGE =
  "Site provisioning job requires approval because advanced approvals are enabled.";
const SITE_BOOTSTRAP_APPROVAL_MESSAGE =
  "Site bootstrap job requires approval because advanced approvals are enabled.";
const PERMISSIONS_APPROVAL_MESSAGE =
  "Permissions setup job requires approval because advanced approvals are enabled.";
const ownerDirectMessage = (operation: string) => `${operation} job queued in owner-direct mode.`;

const handleError = async (error: unknown, req: Request, res: Response) => {
  if (error instanceof ZodError) {
    return fail(res, "VALIDATION_ERROR", "נתוני הבקשה אינם תקינים", error.flatten(), 400);
  }

  const normalized = normalizeError(error);
  logger.error("errors", "Sites request failed", {
    requestId: req.requestId,
    error: normalized.message,
    code: normalized.code
  });

  if (normalized.status >= 500) {
    await writeAuditLog({
      req,
      action: "sites.error",
      entityType: "Site",
      result: "failure",
      error: normalized.message,
      metadata: { code: normalized.code }
    });
  }

  return fail(res, normalized.code, normalized.message, normalized.details, normalized.status);
};

export const listSites = async (req: Request, res: Response) => {
  try {
    const filters = querySchema.parse(req.query);
    const [sites, stats] = await Promise.all([sitesService.listSites(filters), sitesService.getStats()]);
    const data = sites.map((site) => sitesService.withDerivedHealth(site.toObject()));
    return ok(res, data, { count: data.length, stats });
  } catch (error) {
    return handleError(error, req, res);
  }
};

export const getSite = async (req: Request, res: Response) => {
  try {
    const site = await sitesService.getSiteById(req.params.id);
    if (!site) return fail(res, "NOT_FOUND", "האתר לא נמצא", undefined, 404);
    return ok(res, sitesService.withDerivedHealth(site.toObject()));
  } catch (error) {
    return handleError(error, req, res);
  }
};

export const createSite = async (req: Request, res: Response) => {
  try {
    const payload = createSiteSchema.parse(req.body);
    const site = await sitesService.createSite(payload);
    logger.info("sites", "Site created", { requestId: req.requestId, id: site._id.toString(), siteCode: site.siteCode });

    await writeAuditLog({
      req,
      action: "sites.create",
      entityType: "Site",
      entityId: site._id.toString(),
      after: site.toObject()
    });

    return ok(res, sitesService.withDerivedHealth(site.toObject()), undefined, 201);
  } catch (error) {
    return handleError(error, req, res);
  }
};

export const updateSite = async (req: Request, res: Response) => {
  try {
    const payload = updateSiteSchema.parse(req.body);
    const before = await sitesService.getSiteById(req.params.id);
    const site = await sitesService.updateSite(req.params.id, payload);
    if (!site) return fail(res, "NOT_FOUND", "האתר לא נמצא", undefined, 404);

    logger.info("sites", "Site updated", { requestId: req.requestId, id: site._id.toString(), siteCode: site.siteCode });

    await writeAuditLog({
      req,
      action: "sites.update",
      entityType: "Site",
      entityId: site._id.toString(),
      before: before?.toObject(),
      after: site.toObject()
    });

    return ok(res, sitesService.withDerivedHealth(site.toObject()));
  } catch (error) {
    return handleError(error, req, res);
  }
};

export const deleteSite = async (req: Request, res: Response) => {
  try {
    const force = req.query.force === "true";
    const before = await sitesService.getSiteById(req.params.id);
    const site = await sitesService.archiveOrDeleteSite(req.params.id, force);
    if (!site) return fail(res, "NOT_FOUND", "האתר לא נמצא", undefined, 404);

    logger.info("sites", force ? "Site deleted" : "Site archived", {
      requestId: req.requestId,
      id: site._id.toString(),
      siteCode: site.siteCode
    });

    await writeAuditLog({
      req,
      action: force ? "sites.delete" : "sites.archive",
      entityType: "Site",
      entityId: site._id.toString(),
      before: before?.toObject(),
      after: site.toObject()
    });

    return ok(res, sitesService.withDerivedHealth(site.toObject()), { mode: force ? "deleted" : "archived" });
  } catch (error) {
    return handleError(error, req, res);
  }
};

export const manualHealthCheck = async (req: Request, res: Response) => {
  try {
    const { health } = manualHealthSchema.parse(req.body);
    const site = await sitesService.manualHealthCheck(req.params.id, health);
    if (!site) return fail(res, "NOT_FOUND", "האתר לא נמצא", undefined, 404);

    await writeAuditLog({
      req,
      action: "sites.manual-health",
      entityType: "Site",
      entityId: site._id.toString(),
      metadata: { health }
    });

    return ok(res, sitesService.withDerivedHealth(site.toObject()));
  } catch (error) {
    return handleError(error, req, res);
  }
};

export const readOnlySharePointHealthCheck = async (req: Request, res: Response) => {
  try {
    const result = await runReadOnlySharePointHealthCheck(req.params.id);

    await writeAuditLog({
      req,
      action: "sites.sharepoint-health-readonly",
      entityType: "Site",
      entityId: result.siteId,
      metadata: {
        siteCode: result.siteCode,
        derivedHealthStatus: result.derivedHealthStatus,
        checks: result.evidence.length,
        authBlocked: result.evidence.filter((item) => item.authBlocked).length
      }
    });

    return ok(res, result);
  } catch (error) {
    return handleError(error, req, res);
  }
};

export const browserSharePointHealthCheckEvidence = async (req: Request, res: Response) => {
  try {
    const result = await recordBrowserSharePointHealthCheck(req.params.id, req.body || {});

    await writeAuditLog({
      req,
      action: "sites.sharepoint-health-browser",
      entityType: "Site",
      entityId: result.siteId,
      metadata: {
        siteCode: result.siteCode,
        connectorMode: "browser-sharepoint",
        derivedHealthStatus: result.derivedHealthStatus,
        checks: result.evidence.length,
        authBlocked: result.evidence.filter((item) => item.authBlocked).length
      }
    });

    return ok(res, result);
  } catch (error) {
    return handleError(error, req, res);
  }
};

export const getSiteBootstrapPlan = async (req: Request, res: Response) => {
  try {
    const options = siteBootstrapSchema.parse(req.query || {});
    const plan = await buildSiteBootstrapPlan(req.params.id, normalizeSiteBootstrapOptions(options));
    return ok(res, plan);
  } catch (error) {
    return handleError(error, req, res);
  }
};

export const queueSiteBootstrap = async (req: Request, res: Response) => {
  try {
    const capabilities = getSharePointOperationCapabilities();
    if (!capabilities.writeAvailable) {
      return fail(res, "SHAREPOINT_WRITE_NOT_CONFIGURED", capabilities.reason || "SharePoint write is not configured", capabilities, 409);
    }

    const site = await sitesService.getSiteById(req.params.id);
    if (!site) return fail(res, "NOT_FOUND", "האתר לא נמצא", undefined, 404);

    const options = normalizeSiteBootstrapOptions(siteBootstrapSchema.parse(req.body || {}));
    const plan = await buildSiteBootstrapPlan(site._id.toString(), options);
    if (!plan.summary.readyForBootstrapExecution) {
      return fail(res, "SITE_BOOTSTRAP_PLAN_NOT_READY", "SharePoint site bootstrap plan is not ready for execution", plan, 409);
    }

    const createdBy = req.user?.name || "system";
    const approvalSummary = {
      title: `Create and bootstrap SharePoint site for ${site.displayName || site.siteCode}`,
      message: SITE_BOOTSTRAP_APPROVAL_MESSAGE,
      operation: "site-bootstrap",
      siteId: site._id.toString(),
      siteCode: site.siteCode,
      sharePointSiteUrl: plan.targetWeb.sharePointSiteUrl,
      owner: plan.targetWeb.owner,
      totalSteps: plan.summary.totalSteps,
      requestedBy: createdBy,
      reason: options.reason || ""
    };
    const approvalSnapshot = {
      capturedAt: new Date().toISOString(),
      operation: "site-bootstrap",
      site: {
        id: site._id.toString(),
        siteCode: site.siteCode,
        displayName: site.displayName,
        sharePointSiteUrl: plan.targetWeb.sharePointSiteUrl
      },
      planGeneratedAt: plan.generatedAt,
      capabilities: plan.capabilities,
      targetWeb: plan.targetWeb,
      summary: plan.summary,
      blockers: plan.blockers,
      risks: plan.risks,
      resolvedPaths: plan.resolvedPaths,
      steps: plan.steps.map((step) => ({
        key: step.key,
        label: step.label,
        mode: step.mode,
        phase: step.phase,
        target: step.target
      })),
      writeOperations: [
        "Create or reuse the SharePoint site collection at the target URL",
        "Create or ensure Site Builder document libraries, folders, default TXT files, backup folder, and bootstrap manifest",
        options.runPermissionsSetup === false
          ? "Skip siteUsersDb permissions setup by request"
          : "Configure siteUsersDb permissions after provisioning"
      ],
      requestedBy: createdBy,
      reason: options.reason || ""
    };
    const jobInput: ApprovalGatedJobInput = {
      type: "site-bootstrap",
      siteId: site._id.toString(),
      createdBy,
      requiresApproval: true,
      approvalSummary,
      approvalSnapshot,
      payload: {
        ...options,
        owner: plan.targetWeb.owner,
        lcid: plan.targetWeb.lcid,
        webTemplate: plan.targetWeb.webTemplate,
        mode: "sharepoint-site-bootstrap"
      }
    };

    logger.info("jobs", "SharePoint site bootstrap job queued", {
      type: jobInput.type,
      siteId: site._id.toString(),
      siteCode: site.siteCode,
      sharePointSiteUrl: plan.targetWeb.sharePointSiteUrl,
      totalSteps: plan.summary.totalSteps
    });

    const job = await createJob(jobInput);
    logger.info("sites", "SharePoint site bootstrap job queued", {
      siteId: site._id.toString(),
      siteCode: site.siteCode,
      jobId: job._id.toString(),
      totalSteps: plan.summary.totalSteps,
      requiresApproval: job.requiresApproval,
      approvalStatus: job.requiresApproval ? "pending" : "not-required"
    });

    await writeAuditLog({
      req,
      action: "sites.bootstrap.queue",
      entityType: "Site",
      entityId: site._id.toString(),
      metadata: {
        jobId: job._id.toString(),
        siteCode: site.siteCode,
        sharePointSiteUrl: plan.targetWeb.sharePointSiteUrl,
        requiresApproval: job.requiresApproval,
        approvalStatus: job.requiresApproval ? "pending" : "not-required"
      }
    });

    return ok(
      res,
      {
        job,
        plan,
        requiresApproval: job.requiresApproval,
        approvalStatus: job.requiresApproval ? "pending" : "not-required",
        message: job.requiresApproval ? SITE_BOOTSTRAP_APPROVAL_MESSAGE : ownerDirectMessage("Site bootstrap")
      },
      {
        requiresApproval: job.requiresApproval,
        approvalStatus: job.requiresApproval ? "pending" : "not-required",
        message: job.requiresApproval ? SITE_BOOTSTRAP_APPROVAL_MESSAGE : ownerDirectMessage("Site bootstrap")
      },
      202
    );
  } catch (error) {
    return handleError(error, req, res);
  }
};

export const getSiteProvisionPlan = async (req: Request, res: Response) => {
  try {
    const plan = await buildSiteProvisionPlan(req.params.id);
    return ok(res, plan);
  } catch (error) {
    return handleError(error, req, res);
  }
};

export const queueSiteProvision = async (req: Request, res: Response) => {
  try {
    const capabilities = getSharePointOperationCapabilities();
    if (!capabilities.writeAvailable) {
      return fail(res, "SHAREPOINT_WRITE_NOT_CONFIGURED", capabilities.reason || "SharePoint write is not configured", capabilities, 409);
    }

    const site = await sitesService.getSiteById(req.params.id);
    if (!site) return fail(res, "NOT_FOUND", "האתר לא נמצא", undefined, 404);

    const plan = await buildSiteProvisionPlan(site._id.toString());
    const createdBy = req.user?.name || "system";
    const approvalSummary = {
      title: `Provision Site Builder structure for ${site.displayName || site.siteCode}`,
      message: SITE_PROVISION_APPROVAL_MESSAGE,
      operation: "site-provision",
      siteId: site._id.toString(),
      siteCode: site.siteCode,
      totalSteps: plan.summary.totalSteps,
      requestedBy: createdBy
    };
    const approvalSnapshot = {
      capturedAt: new Date().toISOString(),
      operation: "site-provision",
      site: {
        id: site._id.toString(),
        siteCode: site.siteCode,
        displayName: site.displayName,
        sharePointSiteUrl: site.sharePointSiteUrl
      },
      planGeneratedAt: plan.generatedAt,
      capabilities: plan.capabilities,
      summary: plan.summary,
      blockers: plan.blockers,
      resolvedPaths: plan.resolvedPaths,
      steps: plan.steps.map((step) => ({
        key: step.key,
        label: step.label,
        mode: step.mode,
        target: step.target
      })),
      writeOperations: [
        "Create or ensure Site Builder document libraries",
        "Create or ensure Site Builder SharePoint folders",
        "Create or ensure default TXT/JSON configuration files",
        "Update site health and resolved path metadata after successful execution"
      ]
    };
    const jobInput: ApprovalGatedJobInput = {
      type: "site-provision",
      siteId: site._id.toString(),
      createdBy,
      requiresApproval: true,
      approvalSummary,
      approvalSnapshot,
      payload: {
        mode: "sharepoint-structure",
        description: "Create/ensure Site Builder document libraries, folders, and default TXT files"
      }
    };

    logger.info("jobs", "Site provisioning job queued", {
      type: jobInput.type,
      siteId: site._id.toString(),
      siteCode: site.siteCode,
      totalSteps: plan.summary.totalSteps
    });

    const job = await createJob(jobInput);
    logger.info("sites", "Site provisioning job queued", {
      siteId: site._id.toString(),
      siteCode: site.siteCode,
      jobId: job._id.toString(),
      totalSteps: plan.summary.totalSteps,
      requiresApproval: job.requiresApproval,
      approvalStatus: job.requiresApproval ? "pending" : "not-required"
    });

    await writeAuditLog({
      req,
      action: "sites.provision.queue",
      entityType: "Site",
      entityId: site._id.toString(),
      metadata: {
        jobId: job._id.toString(),
        siteCode: site.siteCode,
        requiresApproval: job.requiresApproval,
        approvalStatus: job.requiresApproval ? "pending" : "not-required"
      }
    });

    return ok(
      res,
      {
        job,
        requiresApproval: job.requiresApproval,
        approvalStatus: job.requiresApproval ? "pending" : "not-required",
        message: job.requiresApproval ? SITE_PROVISION_APPROVAL_MESSAGE : ownerDirectMessage("Site provisioning")
      },
      {
        requiresApproval: job.requiresApproval,
        approvalStatus: job.requiresApproval ? "pending" : "not-required",
        message: job.requiresApproval ? SITE_PROVISION_APPROVAL_MESSAGE : ownerDirectMessage("Site provisioning")
      },
      202
    );
  } catch (error) {
    return handleError(error, req, res);
  }
};

export const getPermissionsSetupPlan = async (req: Request, res: Response) => {
  try {
    const plan = await buildPermissionsSetupPlan(req.params.id);
    return ok(res, plan);
  } catch (error) {
    return handleError(error, req, res);
  }
};

export const queuePermissionsSetup = async (req: Request, res: Response) => {
  try {
    const capabilities = getSharePointOperationCapabilities();
    if (!capabilities.writeAvailable) {
      return fail(res, "SHAREPOINT_WRITE_NOT_CONFIGURED", capabilities.reason || "SharePoint write is not configured", capabilities, 409);
    }

    const site = await sitesService.getSiteById(req.params.id);
    if (!site) return fail(res, "NOT_FOUND", "האתר לא נמצא", undefined, 404);

    const plan = await buildPermissionsSetupPlan(site._id.toString());
    const createdBy = req.user?.name || "system";
    const approvalSummary = {
      title: `Configure siteUsersDb permissions for ${site.displayName || site.siteCode}`,
      message: PERMISSIONS_APPROVAL_MESSAGE,
      operation: "permissions-setup",
      siteId: site._id.toString(),
      siteCode: site.siteCode,
      steps: plan.steps.length,
      roleDefId: 1073741827,
      requestedBy: createdBy
    };
    const approvalSnapshot = {
      capturedAt: new Date().toISOString(),
      operation: "permissions-setup",
      site: {
        id: site._id.toString(),
        siteCode: site.siteCode,
        displayName: site.displayName,
        sharePointSiteUrl: site.sharePointSiteUrl
      },
      planGeneratedAt: plan.generatedAt,
      capabilities: plan.capabilities,
      resolvedPaths: plan.resolvedPaths,
      steps: plan.steps.map((step) => ({
        key: step.key,
        label: step.label,
        target: step.target
      })),
      roleDefId: 1073741827,
      writeOperations: [
        "Break role inheritance on the siteUsersDb root item",
        "Grant Contribute to the associated members group",
        "Write the permissions marker file",
        "Update site permissions health metadata after successful execution"
      ]
    };
    const jobInput: ApprovalGatedJobInput = {
      type: "permissions-setup",
      siteId: site._id.toString(),
      createdBy,
      requiresApproval: true,
      approvalSummary,
      approvalSnapshot,
      payload: {
        mode: "siteUsersDb-permissions",
        roleDefId: 1073741827
      }
    };

    logger.info("jobs", "Permissions setup job queued", {
      type: jobInput.type,
      siteId: site._id.toString(),
      siteCode: site.siteCode,
      steps: plan.steps.length,
      roleDefId: 1073741827
    });

    const job = await createJob(jobInput);
    logger.info("sites", "Permissions setup job queued", {
      siteId: site._id.toString(),
      siteCode: site.siteCode,
      jobId: job._id.toString(),
      steps: plan.steps.length,
      requiresApproval: job.requiresApproval,
      approvalStatus: job.requiresApproval ? "pending" : "not-required"
    });

    await writeAuditLog({
      req,
      action: "sites.permissions-setup.queue",
      entityType: "Site",
      entityId: site._id.toString(),
      metadata: {
        jobId: job._id.toString(),
        siteCode: site.siteCode,
        requiresApproval: job.requiresApproval,
        approvalStatus: job.requiresApproval ? "pending" : "not-required"
      }
    });

    return ok(
      res,
      {
        job,
        requiresApproval: job.requiresApproval,
        approvalStatus: job.requiresApproval ? "pending" : "not-required",
        message: job.requiresApproval ? PERMISSIONS_APPROVAL_MESSAGE : ownerDirectMessage("Permissions setup")
      },
      {
        requiresApproval: job.requiresApproval,
        approvalStatus: job.requiresApproval ? "pending" : "not-required",
        message: job.requiresApproval ? PERMISSIONS_APPROVAL_MESSAGE : ownerDirectMessage("Permissions setup")
      },
      202
    );
  } catch (error) {
    return handleError(error, req, res);
  }
};
