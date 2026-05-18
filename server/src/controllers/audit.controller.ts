import { Request, Response } from "express";
import { ZodError } from "zod";
import { buildAuditReport, exportAuditRows, listAuditLogs } from "../services/audit.service";
import { normalizeError } from "../utils/errors";
import { fail, ok } from "../utils/http";
import { logger } from "../utils/logger";
import { auditExportQuerySchema, auditQuerySchema, auditReportQuerySchema } from "../validators/audit.schema";

const handleError = (error: unknown, req: Request, res: Response, message: string) => {
  if (error instanceof ZodError) {
    logger.warn("audit", "Audit request validation failed", {
      requestId: req.requestId,
      issues: error.issues.length
    });
    return fail(res, "VALIDATION_ERROR", "נתוני הבקשה אינם תקינים", error.flatten(), 400);
  }

  const normalized = normalizeError(error);
  logger.error("audit", message, {
    requestId: req.requestId,
    code: normalized.code,
    error: normalized.message
  });
  return fail(res, normalized.code, normalized.message, normalized.details, normalized.status);
};

export const getAuditLogs = async (req: Request, res: Response) => {
  try {
    const query = auditQuerySchema.parse(req.query);
    const result = await listAuditLogs(query);
    return ok(res, result.rows, result.meta);
  } catch (error) {
    return handleError(error, req, res, "Audit list request failed");
  }
};

export const getAuditReport = async (req: Request, res: Response) => {
  try {
    const query = auditReportQuerySchema.parse(req.query);
    const report = await buildAuditReport(query);
    return ok(res, report);
  } catch (error) {
    return handleError(error, req, res, "Audit report request failed");
  }
};

export const exportAudit = async (req: Request, res: Response) => {
  try {
    const query = auditExportQuerySchema.parse(req.query);
    if (query.format === "json") {
      const report = await buildAuditReport(query);
      return ok(res, report);
    }

    const exported = await exportAuditRows(query);
    const timestamp = exported.generatedAt.replace(/[:.]/g, "-");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="audit-export-${timestamp}.csv"`);
    res.setHeader("X-Audit-Export-Generated-At", exported.generatedAt);
    res.setHeader("X-Audit-Export-Row-Count", String(exported.rowCount));
    return res.status(200).send(exported.csv);
  } catch (error) {
    return handleError(error, req, res, "Audit export request failed");
  }
};
