import { Request, Response } from "express";
import { fail, ok } from "../utils/http";
import { normalizeError } from "../utils/errors";
import { logger } from "../utils/logger";
import {
  executeAccessChange,
  getAccessDirectory,
  getAccessUser,
  getAccessUserSites,
  planAccessChange
} from "../services/accessDirectory.service";

const handleError = (error: unknown, res: Response) => {
  const normalized = normalizeError(error);
  logger.error("admins", "Access Governance request failed", {
    code: normalized.code,
    error: normalized.message
  });
  return fail(res, normalized.code, normalized.message, normalized.details, normalized.status);
};

export const listAccessUsers = async (_req: Request, res: Response) => {
  try {
    const directory = await getAccessDirectory();
    return ok(res, directory);
  } catch (error) {
    return handleError(error, res);
  }
};

export const getAccessUserEndpoint = async (req: Request, res: Response) => {
  try {
    const user = await getAccessUser(req.params.principalId);
    if (!user) return fail(res, "NOT_FOUND", "המשתמש לא נמצא", undefined, 404);
    return ok(res, user);
  } catch (error) {
    return handleError(error, res);
  }
};

export const getAccessUserSitesEndpoint = async (req: Request, res: Response) => {
  try {
    const sites = await getAccessUserSites(req.params.principalId);
    return ok(res, { principalId: req.params.principalId, sites });
  } catch (error) {
    return handleError(error, res);
  }
};

export const planAccessChangeEndpoint = async (req: Request, res: Response) => {
  try {
    const plan = await planAccessChange(req.body || {});
    return ok(res, plan);
  } catch (error) {
    return handleError(error, res);
  }
};

export const executeAccessChangeEndpoint = async (req: Request, res: Response) => {
  try {
    const result = await executeAccessChange(req.body || {});
    return fail(res, "ACCESS_WRITE_BLOCKED", result.message, result, 409);
  } catch (error) {
    return handleError(error, res);
  }
};

export const accessBrowserEvidenceEndpoint = async (_req: Request, res: Response) => {
  return fail(
    res,
    "ACCESS_BROWSER_WRITE_EVIDENCE_NOT_IMPLEMENTED",
    "שמירת evidence לכתיבת הרשאות דרך הדפדפן עדיין לא ממומשת, ולכן לא נרשמת הצלחת כתיבה.",
    undefined,
    409
  );
};
