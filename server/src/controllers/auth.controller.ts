import { Request, Response } from "express";
import { fail, ok } from "../utils/http";
import {
  findAuthorizedPersonalNumber,
  getAllBootstrapPersonalNumbers,
  getBootstrapAdminPersonalNumbers,
  getHardcodedAlwaysAllowedPersonalNumbers,
  normalizePersonalNumber
} from "../services/personal-auth.service";

export const loginByPersonalNumber = async (req: Request, res: Response) => {
  const raw = String(req.body?.personalNumber || "");
  const pn = normalizePersonalNumber(raw);

  if (!pn) {
    return fail(res, "VALIDATION_ERROR", "יש להזין personal number תקין", undefined, 400);
  }

  const match = await findAuthorizedPersonalNumber(pn);
  if (!match) {
    return fail(res, "UNAUTHORIZED", "המשתמש לא מורשה למערכת", undefined, 401);
  }

  return ok(res, {
    authenticated: true,
    personalNumber: match.personalNumber,
    role: match.role,
    source: match.source,
    isBootstrapAdmin: match.isBootstrapAdmin,
    matchedSite: match.siteId
      ? {
          siteId: match.siteId,
          siteCode: match.siteCode,
          siteName: match.siteName
        }
      : null
  });
};

export const bootstrapStatus = async (_req: Request, res: Response) => {
  return ok(res, {
    personalNumberLoginEnabled: true,
    hardcodedAdminsConfigured: getHardcodedAlwaysAllowedPersonalNumbers().length,
    envBootstrapAdminsConfigured: getBootstrapAdminPersonalNumbers().length,
    bootstrapAdminsConfigured: getAllBootstrapPersonalNumbers().length,
    bootstrapPersonalNumberAuthAvailable: getAllBootstrapPersonalNumbers().length > 0
  });
};

export const whoAmI = async (req: Request, res: Response) => {
  return ok(res, {
    authenticated: Boolean(req.user),
    user: req.user || null
  });
};
