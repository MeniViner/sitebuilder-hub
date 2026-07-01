import { Request, Response } from "express";
import { ZodError } from "zod";
import { fail, ok } from "../utils/http";
import { normalizeError } from "../utils/errors";
import { logger } from "../utils/logger";
import { writeAuditLog } from "../services/audit.service";
import {
  buildAllReadOnlyBackupPlans,
  buildReadOnlyBackupPlan,
  listReadOnlyBackupInventory
} from "../services/backupPlan.service";
import {
  createRestorePlan,
  enqueueAllBackups,
  enqueueBackupRestore,
  enqueueSiteBackup,
  getBackupById,
  listBackups,
  listSiteBackups,
  recordBrowserSharePointRestoreEvidence,
  recordBrowserSharePointBackupEvidence,
  recordBrowserSharePointBackupVerification,
  verifyBackup
} from "../services/backups.service";
import {
  browserBackupEvidenceSchema,
  browserBackupVerificationEvidenceSchema,
  browserRestoreEvidenceSchema,
  queueRestoreSchema,
  restorePlanSchema,
  runAllBackupsSchema,
  runSiteBackupSchema,
  verifyBackupSchema
} from "../validators/backup.schema";

const handleError = (error: unknown, res: Response) => {
  if (error instanceof ZodError) {
    logger.warn("backups", "Backups request validation failed", { issues: error.issues.length });
    return fail(res, "VALIDATION_ERROR", "נתוני הבקשה אינם תקינים", error.flatten(), 400);
  }
  const normalized = normalizeError(error);
  logger.error("backups", "Backups request failed", {
    code: normalized.code,
    error: normalized.message
  });
  return fail(res, normalized.code, normalized.message, normalized.details, normalized.status);
};

const queryFlag = (value: unknown) => {
  const raw = Array.isArray(value) ? value[0] : value;
  return ["1", "true", "yes"].includes(String(raw || "").toLowerCase());
};

export const getBackups = async (_req: Request, res: Response) => {
  try {
    const backups = await listBackups();
    return ok(res, backups);
  } catch (error) {
    return handleError(error, res);
  }
};

export const getSiteBackups = async (req: Request, res: Response) => {
  try {
    const backups = await listSiteBackups(req.params.id);
    return ok(res, backups);
  } catch (error) {
    return handleError(error, res);
  }
};

export const runSiteBackup = async (req: Request, res: Response) => {
  try {
    const payload = runSiteBackupSchema.parse(req.body || {});
    const result = await enqueueSiteBackup({
      siteId: req.params.id,
      createdBy: req.user?.name || "system",
      sourcePaths: payload.sourcePaths
    });

    await writeAuditLog({
      req,
      action: "backups.run-site",
      entityType: "Site",
      entityId: req.params.id,
      metadata: { jobId: result.job._id.toString() }
    });

    return ok(res, result, undefined, 202);
  } catch (error) {
    return handleError(error, res);
  }
};

export const recordBrowserBackupEvidence = async (req: Request, res: Response) => {
  try {
    const payload = browserBackupEvidenceSchema.parse(req.body || {});
    const result = await recordBrowserSharePointBackupEvidence({
      siteId: req.params.id,
      actor: req.user?.name || "browser-sharepoint",
      input: payload
    });

    await writeAuditLog({
      req,
      action: "sites.browser-backup-evidence",
      entityType: "Site",
      entityId: req.params.id,
      metadata: {
        backupId: result.backup.backupId,
        jobId: payload.jobId || "",
        connectorMode: "browser-sharepoint",
        finalStatus: payload.finalStatus,
        filesCount: result.summary.filesCount,
        verifiedFilesCount: result.summary.verifiedFilesCount,
        failedFilesCount: result.summary.failedFilesCount,
        siteBackupUpdated: result.summary.siteBackupUpdated
      }
    });

    return ok(res, {
      backup: result.backup,
      site: result.site,
      summary: result.summary
    }, undefined, 201);
  } catch (error) {
    return handleError(error, res);
  }
};

export const planSiteBackup = async (req: Request, res: Response) => {
  try {
    const plan = await buildReadOnlyBackupPlan(req.params.id);

    await writeAuditLog({
      req,
      action: "backups.plan-site-readonly",
      entityType: "Site",
      entityId: req.params.id,
      metadata: {
        siteCode: plan.siteCode,
        totalSources: plan.summary.totalSources,
        existingSources: plan.summary.existingSources,
        missingSources: plan.summary.missingSources,
        authBlockedSources: plan.summary.authBlockedSources,
        readyForBackup: plan.summary.readyForBackup
      }
    });

    return ok(res, plan);
  } catch (error) {
    return handleError(error, res);
  }
};

export const getSiteBackupInventory = async (req: Request, res: Response) => {
  try {
    const includeFiles = queryFlag(req.query.includeFiles);
    logger.info("backups", "Site backup inventory request received", {
      siteId: req.params.id,
      includeFiles
    });
    const inventory = await listReadOnlyBackupInventory(req.params.id, { includeFiles });
    return ok(res, inventory);
  } catch (error) {
    return handleError(error, res);
  }
};

export const runAllBackups = async (req: Request, res: Response) => {
  try {
    const payload = runAllBackupsSchema.parse(req.body || {});
    const result = await enqueueAllBackups({
      createdBy: req.user?.name || "system",
      siteIds: payload.siteIds
    });

    await writeAuditLog({
      req,
      action: "backups.run-all",
      entityType: "Backup",
      metadata: { queued: result.queued }
    });

    return ok(res, result, undefined, 202);
  } catch (error) {
    return handleError(error, res);
  }
};

export const planAllBackups = async (req: Request, res: Response) => {
  try {
    const payload = runAllBackupsSchema.parse(req.body || {});
    const plan = await buildAllReadOnlyBackupPlans({ siteIds: payload.siteIds });

    await writeAuditLog({
      req,
      action: "backups.plan-all-readonly",
      entityType: "Backup",
      metadata: {
        count: plan.count,
        readyCount: plan.readyCount,
        failedCount: plan.failedCount
      }
    });

    return ok(res, plan);
  } catch (error) {
    return handleError(error, res);
  }
};

export const getBackup = async (req: Request, res: Response) => {
  try {
    const backup = await getBackupById(req.params.id);
    if (!backup) return fail(res, "NOT_FOUND", "Backup לא נמצא", undefined, 404);
    return ok(res, backup);
  } catch (error) {
    return handleError(error, res);
  }
};

export const postVerifyBackup = async (req: Request, res: Response) => {
  try {
    const payload = verifyBackupSchema.parse(req.body || {});
    await verifyBackup({
      backupId: req.params.id,
      checkedBy: req.user?.name || "system",
      details: payload.details
    });

    return ok(res, null);
  } catch (error) {
    return handleError(error, res);
  }
};

export const postBrowserVerifyBackup = async (req: Request, res: Response) => {
  try {
    const payload = browserBackupVerificationEvidenceSchema.parse(req.body || {});
    const result = await recordBrowserSharePointBackupVerification({
      backupId: req.params.id,
      actor: req.user?.name || "browser-sharepoint",
      input: payload
    });

    await writeAuditLog({
      req,
      action: "backups.browser-verify",
      entityType: "SiteBackup",
      entityId: result.backup._id.toString(),
      metadata: {
        connectorMode: "browser-sharepoint",
        status: result.backup.status,
        filesCount: result.summary.filesCount,
        verifiedFilesCount: result.summary.verifiedFilesCount,
        failedFilesCount: result.summary.failedFilesCount
      }
    });

    return ok(res, {
      backup: result.backup,
      site: result.site,
      summary: result.summary
    });
  } catch (error) {
    return handleError(error, res);
  }
};

export const postRestorePlan = async (req: Request, res: Response) => {
  try {
    const payload = restorePlanSchema.parse(req.body || {});
    const backup = await createRestorePlan({
      backupId: req.params.id,
      requestedBy: req.user?.name || "system",
      notes: payload.notes
    });

    await writeAuditLog({
      req,
      action: "backups.restore-plan",
      entityType: "SiteBackup",
      entityId: backup._id.toString()
    });

    return ok(res, backup);
  } catch (error) {
    return handleError(error, res);
  }
};

export const postRestoreBackup = async (req: Request, res: Response) => {
  try {
    const payload = queueRestoreSchema.parse(req.body || {});
    const result = await enqueueBackupRestore({
      backupId: req.params.id,
      createdBy: req.user?.name || "system",
      notes: payload.notes,
      connectorMode: payload.connectorMode
    });

    await writeAuditLog({
      req,
      action: "backups.restore-browser-required",
      entityType: "SiteBackup",
      entityId: result.backup._id.toString(),
      metadata: {
        jobId: result.job._id.toString(),
        connectorMode: "browser-sharepoint",
        filesCount: result.browserOperationPlan?.files?.length || 0
      }
    });

    return ok(res, result, undefined, 202);
  } catch (error) {
    return handleError(error, res);
  }
};

export const postBrowserRestoreEvidence = async (req: Request, res: Response) => {
  try {
    const payload = browserRestoreEvidenceSchema.parse(req.body || {});
    const result = await recordBrowserSharePointRestoreEvidence({
      backupId: req.params.id,
      actor: req.user?.name || "browser-sharepoint",
      input: payload
    });

    await writeAuditLog({
      req,
      action: "backups.browser-restore-evidence",
      entityType: "SiteBackup",
      entityId: result.backup._id.toString(),
      metadata: {
        connectorMode: "browser-sharepoint",
        finalStatus: payload.finalStatus,
        filesCount: result.summary.filesCount,
        verifiedFilesCount: result.summary.verifiedFilesCount,
        failedFilesCount: result.summary.failedFilesCount,
        jobId: payload.jobId || ""
      }
    });

    return ok(res, {
      backup: result.backup,
      site: result.site,
      summary: result.summary
    });
  } catch (error) {
    return handleError(error, res);
  }
};
