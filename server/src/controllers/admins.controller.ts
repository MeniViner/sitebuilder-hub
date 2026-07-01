import { Request, Response } from "express";
import { ZodError } from "zod";
import { fail, ok } from "../utils/http";
import { normalizeError } from "../utils/errors";
import { logger } from "../utils/logger";
import { writeAuditLog } from "../services/audit.service";
import {
  addSiteAdmin,
  buildAdminTxtRepairPlan,
  enqueueAdminSync,
  enqueueAdminTxtRepair,
  getAdminsDiff,
  getSiteAdmins,
  recordBrowserAdminTxtRepairEvidence,
  recordBrowserAdminLiveReadEvidence,
  removeSiteAdmin
} from "../services/admins.service";
import { addAdminSchema, adminTxtRepairSchema, browserAdminLiveReadEvidenceSchema, browserAdminTxtRepairEvidenceSchema, removeAdminSchema, syncAdminsSchema } from "../validators/admin.schema";

const handleError = (error: unknown, res: Response) => {
  if (error instanceof ZodError) {
    logger.warn("admins", "Admins request validation failed", { issues: error.issues.length });
    return fail(res, "VALIDATION_ERROR", "נתוני הבקשה אינם תקינים", error.flatten(), 400);
  }
  const normalized = normalizeError(error);
  logger.error("admins", "Admins request failed", {
    code: normalized.code,
    error: normalized.message
  });
  return fail(res, normalized.code, normalized.message, normalized.details, normalized.status);
};

export const getAdmins = async (req: Request, res: Response) => {
  try {
    const data = await getSiteAdmins(req.params.id);
    return ok(res, data);
  } catch (error) {
    return handleError(error, res);
  }
};

export const syncAdmins = async (req: Request, res: Response) => {
  try {
    const payload = syncAdminsSchema.parse(req.body || {});
    const result = await enqueueAdminSync({
      siteId: req.params.id,
      createdBy: req.user?.name || "system",
      mode: payload.mode
    });

    await writeAuditLog({
      req,
      action: "admins.sync",
      entityType: "Site",
      entityId: req.params.id,
      metadata: { mode: payload.mode, jobId: result.job._id.toString() }
    });

    return ok(res, result, undefined, 202);
  } catch (error) {
    return handleError(error, res);
  }
};

export const addAdmin = async (req: Request, res: Response) => {
  try {
    const payload = addAdminSchema.parse(req.body);
    const site = await addSiteAdmin({
      siteId: req.params.id,
      admin: payload.admin
    });

    await writeAuditLog({
      req,
      action: "admins.add",
      entityType: "Site",
      entityId: req.params.id,
      metadata: { admin: payload.admin, reason: payload.reason || "" }
    });

    return ok(res, site);
  } catch (error) {
    return handleError(error, res);
  }
};

export const deleteAdmin = async (req: Request, res: Response) => {
  try {
    const payload = removeAdminSchema.parse({
      source: req.query.source || req.body?.source,
      reason: req.body?.reason || req.query.reason
    });
    const site = await removeSiteAdmin({
      siteId: req.params.id,
      adminId: req.params.adminId,
      source: payload.source
    });

    await writeAuditLog({
      req,
      action: "admins.remove",
      entityType: "Site",
      entityId: req.params.id,
      metadata: { adminId: req.params.adminId, source: payload.source, reason: payload.reason || "" }
    });

    return ok(res, site);
  } catch (error) {
    return handleError(error, res);
  }
};

export const getAdminsDiffEndpoint = async (req: Request, res: Response) => {
  try {
    const data = await getAdminsDiff(req.params.id);
    return ok(res, data);
  } catch (error) {
    return handleError(error, res);
  }
};

export const readLiveAdminsEndpoint = async (req: Request, res: Response) => {
  try {
    return ok(res, {
      connectorMode: "browser-sharepoint",
      executionMode: "browser-required",
      operation: "admin-live-read",
      siteId: req.params.id,
      message: "קריאת מנהלים מ־SharePoint מתבצעת דרך הדפדפן הפעיל. השרת שומר Evidence בלבד."
    }, undefined, 202);
  } catch (error) {
    return handleError(error, res);
  }
};

export const browserLiveReadEvidenceEndpoint = async (req: Request, res: Response) => {
  try {
    const payload = browserAdminLiveReadEvidenceSchema.parse(req.body || {});
    const result = await recordBrowserAdminLiveReadEvidence({
      siteId: req.params.id,
      actor: req.user?.name || "system",
      input: payload
    });

    await writeAuditLog({
      req,
      action: "admins.browser-live-read-evidence",
      entityType: "Site",
      entityId: req.params.id,
      metadata: {
        connectorMode: payload.connectorMode,
        targetSiteUrl: payload.targetSiteUrl,
        snapshotId: result.snapshot?._id?.toString?.(),
        syncStatus: result.summary.adminSyncStatus,
        adminsCount: result.summary.adminsCount,
        failedSources: result.liveRead.sourceStatus.filter((source) => !source.ok).map((source) => source.source)
      }
    });

    return ok(res, result);
  } catch (error) {
    return handleError(error, res);
  }
};

export const planTxtAdminRepair = async (req: Request, res: Response) => {
  try {
    const payload = adminTxtRepairSchema.parse(req.body || {});
    const plan = await buildAdminTxtRepairPlan(req.params.id, {
      capturedBy: req.user?.name || "system",
      reason: payload.reason || payload.notes || ""
    });
    return ok(res, plan);
  } catch (error) {
    return handleError(error, res);
  }
};

export const queueTxtAdminRepair = async (req: Request, res: Response) => {
  try {
    const payload = adminTxtRepairSchema.parse(req.body || {});
    const reason = payload.reason || payload.notes || "";
    const result = await enqueueAdminTxtRepair({
      siteId: req.params.id,
      createdBy: req.user?.name || "system",
      reason
    });

    await writeAuditLog({
      req,
      action: "admins.repair-txt.browser-required",
      entityType: "Site",
      entityId: req.params.id,
      metadata: {
        jobId: result.job._id.toString(),
        targetPath: result.plan.targetPath,
        connectorMode: "browser-sharepoint"
      }
    });

    return ok(res, result, undefined, 202);
  } catch (error) {
    return handleError(error, res);
  }
};

export const browserTxtRepairEvidenceEndpoint = async (req: Request, res: Response) => {
  try {
    const payload = browserAdminTxtRepairEvidenceSchema.parse(req.body || {});
    const result = await recordBrowserAdminTxtRepairEvidence({
      siteId: req.params.id,
      actor: req.user?.name || "browser-sharepoint",
      input: payload
    });

    await writeAuditLog({
      req,
      action: "admins.repair-txt.browser-evidence",
      entityType: "Site",
      entityId: req.params.id,
      metadata: {
        connectorMode: "browser-sharepoint",
        targetPath: payload.targetPath,
        finalStatus: payload.finalStatus,
        jobId: payload.jobId || "",
        snapshotId: result.summary.snapshotId
      }
    });

    return ok(res, result);
  } catch (error) {
    return handleError(error, res);
  }
};
