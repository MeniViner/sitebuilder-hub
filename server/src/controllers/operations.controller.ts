import { Request, Response } from "express";
import { fail, ok } from "../utils/http";
import { normalizeError } from "../utils/errors";
import { getOperationsCapabilities, getSiteOperationsSummary } from "../services/operations.service";

const handleError = (error: unknown, res: Response) => {
  const normalized = normalizeError(error);
  return fail(res, normalized.code, normalized.message, normalized.details, normalized.status);
};

export const getCapabilities = async (_req: Request, res: Response) => {
  try {
    return ok(res, await getOperationsCapabilities());
  } catch (error) {
    return handleError(error, res);
  }
};

export const getSiteSummary = async (req: Request, res: Response) => {
  try {
    return ok(res, await getSiteOperationsSummary(req.params.id));
  } catch (error) {
    return handleError(error, res);
  }
};
