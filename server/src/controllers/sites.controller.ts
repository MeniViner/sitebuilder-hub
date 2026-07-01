import { Request, Response } from "express";
import { ZodError } from "zod";
import {
  createSiteSchema,
  browserSiteOperationEvidenceSchema,
  manualHealthSchema,
  querySchema,
  siteBootstrapSchema,
  txtToMongoMigrationSchema,
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
import { recordBrowserSiteOperationEvidence } from "../services/browserSharePointEvidence.service";
import { getDangerousValidationBypassEnvVar, isDangerousValidationBypassEnabled } from "../services/dangerousBackupBypass.service";
import { getBrowserRequiredJobMessage, getSharePointOperationPolicy, shouldBlockBackendSharePointByDefault } from "../services/sharepointOperationPolicy.service";
import { validateRuntimeConfig } from "../services/runtimeConfig.service";
import { runBuilderMongoHealthCheck } from "../services/builderMongoHealth.service";
import {
  buildMongoRuntimeConfigContent,
  buildMongoSiteCreationPlan,
  buildMongoSiteCreationPlanFromInput,
  executeTxtToMongoMigration,
  executeMongoSiteCreation,
  recordMongoCreateBrowserEvidence
} from "../services/mongoSiteCreation.service";

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

export const runtimeConfigValidation = async (req: Request, res: Response) => {
  try {
    const result = await validateRuntimeConfig(req.params.id);

    await writeAuditLog({
      req,
      action: "sites.runtime-config.validate",
      entityType: "Site",
      entityId: result.siteId,
      metadata: {
        siteCode: result.siteCode,
        runtimeConfigPath: result.runtimeConfigPath,
        readStatus: result.readStatus,
        storageBackend: result.storageBackend,
        backendApiUrlHost: result.backendApiUrlHost,
        builderSiteId: result.builderSiteId,
        apiKeyStatus: result.apiKeyStatus,
        warnings: result.warnings
      }
    });

    return ok(res, result);
  } catch (error) {
    return handleError(error, req, res);
  }
};

export const builderMongoHealthCheck = async (req: Request, res: Response) => {
  try {
    const result = await runBuilderMongoHealthCheck(req.params.id);

    await writeAuditLog({
      req,
      action: "sites.mongo-backend.health",
      entityType: "Site",
      entityId: result.siteId,
      metadata: {
        siteCode: result.siteCode,
        storageBackend: result.storageBackend,
        backendApiUrlHost: result.backendApiUrlHost,
        builderSiteId: result.builderSiteId,
        safeCollectionName: result.safeCollectionName,
        backendReachable: result.backendReachable,
        registryStatus: result.registryStatus,
        collectionStatus: result.collectionStatus,
        seedStatus: result.seedStatus,
        missingDocs: result.missingDocs,
        warnings: result.warnings
      }
    });

    return ok(res, result);
  } catch (error) {
    return handleError(error, req, res);
  }
};

export const planMongoSiteCreationFromPayload = async (req: Request, res: Response) => {
  try {
    const payload = createSiteSchema.parse({
      ...req.body,
      storageBackend: "mongo",
      creationMode: "create-new"
    });
    const plan = await buildMongoSiteCreationPlanFromInput(payload);

    await writeAuditLog({
      req,
      action: "sites.mongo-create.plan-payload",
      entityType: "Site",
      result: "success",
      metadata: {
        siteCode: plan.siteCode,
        storageBackend: "mongo",
        builderSiteId: plan.identity.builderSiteId,
        backendApiUrlHost: plan.builderBackend.backendApiUrlHost,
        runtimeConfigPath: plan.runtimeConfig.path,
        blockers: plan.blockers,
        warnings: plan.warnings
      }
    });

    return ok(res, plan);
  } catch (error) {
    return handleError(error, req, res);
  }
};

export const getMongoSiteCreationPlan = async (req: Request, res: Response) => {
  try {
    const plan = await buildMongoSiteCreationPlan(req.params.id);
    return ok(res, plan);
  } catch (error) {
    return handleError(error, req, res);
  }
};

export const executeMongoSiteCreationEndpoint = async (req: Request, res: Response) => {
  try {
    const result = await executeMongoSiteCreation(req.params.id);

    await writeAuditLog({
      req,
      action: "sites.mongo-create.execute",
      entityType: "Site",
      entityId: result.siteId,
      result: result.finalStatus === "failed" ? "failure" : "success",
      metadata: {
        siteCode: result.siteCode,
        backendApiUrlHost: result.builderBackend.backendApiUrlHost,
        builderSiteId: result.builderBackend.siteId,
        safeCollectionName: result.registry.safeCollectionName,
        registryStatus: result.registry.status,
        seedStatus: result.seed.status,
        writtenSeeds: result.seed.written,
        skippedExistingSeeds: result.seed.skippedExisting,
        failedSeeds: result.seed.failed,
        backupCapabilityStatus: result.backupCapability.status,
        warnings: result.warnings
      }
    });

    return ok(res, result);
  } catch (error) {
    return handleError(error, req, res);
  }
};

export const migrateTxtToMongoEndpoint = async (req: Request, res: Response) => {
  try {
    const payload = txtToMongoMigrationSchema.parse(req.body || {});
    const result = await executeTxtToMongoMigration(req.params.id, payload);

    await writeAuditLog({
      req,
      action: "sites.txt-to-mongo.migrate",
      entityType: "Site",
      entityId: result.siteId,
      result: result.finalStatus === "failed" ? "failure" : "success",
      metadata: {
        siteCode: result.siteCode,
        connectorMode: "browser-sharepoint",
        sourceSharePointSiteUrl: result.sourceSharePointSiteUrl,
        builderSiteId: result.builderBackend.siteId,
        registryStatus: result.registry.status,
        importStatus: result.import.status,
        importedFiles: result.import.written,
        failedFiles: result.import.failed,
        warnings: result.warnings
      }
    });

    return ok(res, result);
  } catch (error) {
    return handleError(error, req, res);
  }
};

export const getMongoRuntimeConfigContent = async (req: Request, res: Response) => {
  try {
    const content = await buildMongoRuntimeConfigContent(req.params.id);
    await writeAuditLog({
      req,
      action: "sites.mongo-create.runtime-config-content",
      entityType: "Site",
      entityId: content.siteId,
      metadata: {
        siteCode: content.siteCode,
        runtimeConfigPath: content.runtimeConfigPath,
        sizeBytes: content.sizeBytes,
        sha256: content.sha256,
        apiKey: "[redacted]"
      }
    });
    return ok(res, content);
  } catch (error) {
    return handleError(error, req, res);
  }
};

export const recordMongoCreateBrowserEvidenceEndpoint = async (req: Request, res: Response) => {
  try {
    const result = await recordMongoCreateBrowserEvidence(req.params.id, req.body || {});

    await writeAuditLog({
      req,
      action: "sites.mongo-create.browser-evidence",
      entityType: "Site",
      entityId: result.siteId,
      metadata: {
        siteCode: result.siteCode,
        connectorMode: "browser-sharepoint",
        runtimeConfigVerified: result.runtimeConfigVerified,
        ready: result.ready
      }
    });

    return ok(res, result);
  } catch (error) {
    return handleError(error, req, res);
  }
};

export const verifyMongoSiteCreationEndpoint = async (req: Request, res: Response) => {
  try {
    const site = await sitesService.getSiteById(req.params.id);
    if (!site) return fail(res, "NOT_FOUND", "האתר לא נמצא", undefined, 404);
    const hasBrowserRuntimeEvidence =
      site.health?.runtimeConfigValid === true &&
      (site.runtimeConfigStatus?.evidence as any)?.connectorMode === "browser-sharepoint";
    const [runtimeConfig, mongoHealth] = await Promise.allSettled([
      hasBrowserRuntimeEvidence ? Promise.resolve(site.runtimeConfigStatus) : validateRuntimeConfig(req.params.id),
      runBuilderMongoHealthCheck(req.params.id)
    ]);
    const verifiedSite = await sitesService.getSiteById(req.params.id);
    if (!verifiedSite) return fail(res, "NOT_FOUND", "האתר לא נמצא", undefined, 404);

    const health = verifiedSite.health || {};
    const ready = Boolean(
      health.siteDbExists &&
      health.usersDbExists &&
      health.distExists &&
      health.indexExists &&
      health.runtimeConfigExists &&
      health.runtimeConfigValid &&
      health.dataBackendReachable &&
      health.mongoRegistryOk &&
      health.mongoCollectionOk &&
      health.mongoSeedOk &&
      health.adminsSyncOk &&
      health.mongoBackupsOk
    );

    verifiedSite.lifecycleStatus = ready ? "ready" : "partially-created";
    verifiedSite.provisioningStatus = ready ? "succeeded" : "partially-created";
    verifiedSite.status = ready ? "active" : "draft";
    verifiedSite.lastError = ready ? "" : "האתר עדיין לא מוכן לשימוש";
    await verifiedSite.save();

    const result = {
      checkedAt: new Date().toISOString(),
      siteId: verifiedSite._id.toString(),
      siteCode: verifiedSite.siteCode,
      ready,
      status: ready ? "ready" : "partially-created",
      message: ready ? "האתר מוכן" : "האתר עדיין לא מוכן לשימוש",
      runtimeConfig: runtimeConfig.status === "fulfilled" ? runtimeConfig.value : { error: runtimeConfig.reason?.message || String(runtimeConfig.reason) },
      mongoHealth: mongoHealth.status === "fulfilled" ? mongoHealth.value : { error: mongoHealth.reason?.message || String(mongoHealth.reason) },
      health: verifiedSite.health
    };

    await writeAuditLog({
      req,
      action: "sites.mongo-create.verify",
      entityType: "Site",
      entityId: verifiedSite._id.toString(),
      result: "success",
      metadata: {
        siteCode: verifiedSite.siteCode,
        ready,
        storageBackend: verifiedSite.storageBackend,
        mongoSiteId: verifiedSite.mongoSiteId,
        safeCollectionName: verifiedSite.safeCollectionName
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
    const options = siteBootstrapSchema.parse(req.body || {});
    const plan = await buildSiteBootstrapPlan(req.params.id, normalizeSiteBootstrapOptions(options));
    const policy = getSharePointOperationPolicy("site-bootstrap");
    const job = await createJob({
      type: "site-bootstrap",
      siteId: req.params.id,
      createdBy: req.user?.name || "system",
      executionMode: "browser-required",
      connectorMode: "browser-sharepoint",
      operationPolicy: policy.operation,
      connectorStatusLabel: policy.statusLabelHe,
      connectorBlocker: policy.blockerHe || getBrowserRequiredJobMessage("site-bootstrap"),
      payload: {
        connectorMode: "browser-sharepoint",
        executionMode: "browser-required",
        browserOperationPlan: plan
      }
    });
    return ok(res, {
      job,
      plan,
      requiresApproval: job.requiresApproval,
      approvalStatus: job.requiresApproval ? "pending" : "browser-required",
      message: "Bootstrap ממתין להרצה דרך הדפדפן המחובר ל־SharePoint."
    }, undefined, 202);
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
    void req.body;
    const plan = await buildSiteProvisionPlan(req.params.id);
    const policy = getSharePointOperationPolicy("site-provision");
    const job = await createJob({
      type: "site-provision",
      siteId: req.params.id,
      createdBy: req.user?.name || "system",
      executionMode: "browser-required",
      connectorMode: "browser-sharepoint",
      operationPolicy: policy.operation,
      connectorStatusLabel: policy.statusLabelHe,
      connectorBlocker: policy.blockerHe || getBrowserRequiredJobMessage("site-provision"),
      payload: {
        connectorMode: "browser-sharepoint",
        executionMode: "browser-required",
        browserOperationPlan: plan
      }
    });
    return ok(res, {
      job,
      plan,
      message: "Provision ממתין להרצה דרך הדפדפן המחובר ל־SharePoint."
    }, undefined, 202);
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
    void req.body;
    const plan = await buildPermissionsSetupPlan(req.params.id);
    const policy = getSharePointOperationPolicy("permissions-setup");
    const job = await createJob({
      type: "permissions-setup",
      siteId: req.params.id,
      createdBy: req.user?.name || "system",
      executionMode: "browser-required",
      connectorMode: "browser-sharepoint",
      operationPolicy: policy.operation,
      connectorStatusLabel: policy.statusLabelHe,
      connectorBlocker: policy.blockerHe || getBrowserRequiredJobMessage("permissions-setup"),
      payload: {
        connectorMode: "browser-sharepoint",
        executionMode: "browser-required",
        browserOperationPlan: plan
      }
    });
    return ok(res, {
      job,
      plan,
      message: "Permissions setup ממתין להרצה דרך הדפדפן המחובר ל־SharePoint."
    }, undefined, 202);
  } catch (error) {
    return handleError(error, req, res);
  }
};

export const recordBrowserSiteOperationEvidenceEndpoint = async (req: Request, res: Response) => {
  try {
    const payload = browserSiteOperationEvidenceSchema.parse(req.body || {});
    const result = await recordBrowserSiteOperationEvidence(req.params.id, payload, req.user?.name || "browser-sharepoint");

    await writeAuditLog({
      req,
      action: `sites.${payload.operation}.browser-evidence`,
      entityType: "Site",
      entityId: req.params.id,
      metadata: {
        connectorMode: "browser-sharepoint",
        operation: payload.operation,
        finalStatus: payload.finalStatus,
        stepsCount: result.summary.stepsCount,
        failedStepsCount: result.summary.failedStepsCount
      }
    });

    return ok(res, {
      site: sitesService.withDerivedHealth(result.site.toObject()),
      summary: result.summary
    });
  } catch (error) {
    return handleError(error, req, res);
  }
};
