import { Request, Response } from "express";
import { fail, ok } from "../utils/http";
import {
  findAuthorizedPersonalNumber,
  getAllBootstrapPersonalNumbers,
  getBootstrapAdminPersonalNumbers,
  getOwnerPersonalNumbers,
  normalizePersonalNumber
} from "../services/personal-auth.service";
import { resolveAuthOwnerMode, withOwnerMode } from "../services/authOwnerMode.service";

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
  const identityMode = match.source === "owner" ? "explicit-owner" as const : undefined;
  const ownerMode = resolveAuthOwnerMode({
    id: `pn:${match.personalNumber}`,
    name: match.isBootstrapAdmin ? `Bootstrap Admin ${match.personalNumber}` : `Admin ${match.personalNumber}`,
    role: match.role,
    personalNumber: match.personalNumber,
    source: match.source,
    identityMode,
    isBootstrapAdmin: match.isBootstrapAdmin
  });

  return ok(res, {
    authenticated: true,
    personalNumber: match.personalNumber,
    role: match.role,
    source: match.source,
    identityMode,
    isBootstrapAdmin: match.isBootstrapAdmin,
    ownerMode: ownerMode.ownerMode,
    ownerModeReason: ownerMode.ownerModeReason,
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
    ownerPersonalNumberConfigured: getOwnerPersonalNumbers().length,
    envBootstrapAdminsConfigured: getBootstrapAdminPersonalNumbers().length,
    bootstrapAdminsConfigured: getAllBootstrapPersonalNumbers().length,
    bootstrapPersonalNumberAuthAvailable: getAllBootstrapPersonalNumbers().length > 0
  });
};

export const whoAmI = async (req: Request, res: Response) => {
  const user = withOwnerMode(req.user || null);
  const ownerMode = resolveAuthOwnerMode(user);
  return ok(res, {
    authenticated: Boolean(user),
    ownerMode: ownerMode.ownerMode,
    ownerModeReason: ownerMode.ownerModeReason,
    user
  });
};
