import { Request, Response } from "express";
import { ZodError } from "zod";
import { fail, ok } from "../utils/http";
import { normalizeError } from "../utils/errors";
import { logger } from "../utils/logger";
import {
  acknowledgeMonitoringAlert,
  getMonitoringSummary,
  listMonitoringAlerts,
  refreshMonitoringAlerts
} from "../services/monitoring.service";
import {
  monitoringAlertAcknowledgeSchema,
  monitoringAlertsQuerySchema
} from "../validators/monitoring.schema";

const handleError = (error: unknown, req: Request, res: Response, message: string) => {
  if (error instanceof ZodError) {
    logger.warn("monitoring", "Monitoring request validation failed", {
      requestId: req.requestId,
      issues: error.issues.length
    });
    return fail(res, "VALIDATION_ERROR", "נתוני הבקשה אינם תקינים", error.flatten(), 400);
  }

  const normalized = normalizeError(error);
  logger.error("monitoring", message, {
    requestId: req.requestId,
    alertId: req.params.id,
    code: normalized.code,
    error: normalized.message
  });
  return fail(res, normalized.code, normalized.message, normalized.details, normalized.status);
};

export const getMonitoringAlerts = async (req: Request, res: Response) => {
  try {
    const query = monitoringAlertsQuerySchema.parse(req.query);
    const alerts = await listMonitoringAlerts(query);
    return ok(res, alerts);
  } catch (error) {
    return handleError(error, req, res, "List monitoring alerts request failed");
  }
};

export const postRefreshMonitoringAlerts = async (req: Request, res: Response) => {
  try {
    const result = await refreshMonitoringAlerts();
    return ok(res, result);
  } catch (error) {
    return handleError(error, req, res, "Refresh monitoring alerts request failed");
  }
};

export const getMonitoringAlertsSummary = async (req: Request, res: Response) => {
  try {
    const summary = await getMonitoringSummary();
    return ok(res, summary);
  } catch (error) {
    return handleError(error, req, res, "Monitoring summary request failed");
  }
};

export const postAcknowledgeMonitoringAlert = async (req: Request, res: Response) => {
  try {
    const payload = monitoringAlertAcknowledgeSchema.parse(req.body || {});
    const alert = await acknowledgeMonitoringAlert(req.params.id, req.user?.name || "system", payload.note);
    return ok(res, alert);
  } catch (error) {
    return handleError(error, req, res, "Acknowledge monitoring alert request failed");
  }
};
