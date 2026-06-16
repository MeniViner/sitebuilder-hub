import { Request, Response } from "express";
import { getDiagnostics, runSharePointDiagnostics } from "../services/diagnostics.service";
import { normalizeError } from "../utils/errors";
import { fail, ok } from "../utils/http";

const handleError = (error: unknown, res: Response) => {
  const normalized = normalizeError(error);
  return fail(res, normalized.code, normalized.message, normalized.details, normalized.status);
};

export const diagnostics = async (req: Request, res: Response) => {
  try {
    return ok(res, await getDiagnostics(req));
  } catch (error) {
    return handleError(error, res);
  }
};

export const sharePointCheck = async (req: Request, res: Response) => {
  try {
    return ok(res, await runSharePointDiagnostics(req));
  } catch (error) {
    return handleError(error, res);
  }
};
