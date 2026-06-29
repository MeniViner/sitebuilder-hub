import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";
import { fail } from "../utils/http";
import type { UserRole } from "../types/express";
import { findAuthorizedPersonalNumber, normalizePersonalNumber } from "../services/personal-auth.service";
import { logger } from "../utils/logger";
import { withOwnerMode } from "../services/authOwnerMode.service";

const rolePriority: Record<UserRole, number> = {
  viewer: 1,
  operator: 2,
  admin: 3
};

const normalizeRole = (role: string | undefined): UserRole => {
  const value = String(role || "").trim().toLowerCase();
  if (value === "admin" || value === "operator" || value === "viewer") return value;
  return "viewer";
};

const maskPersonalNumber = (value: string) => {
  const normalized = normalizePersonalNumber(value);
  return normalized ? `***${normalized.slice(-4)}` : "";
};

const cleanHeader = (value: unknown) => String(Array.isArray(value) ? value[0] : value || "").trim();

const sharePointIdentityFromHeaders = (req: Request) => {
  const loginName = cleanHeader(req.header("x-sharepoint-login-name"));
  const email = cleanHeader(req.header("x-sharepoint-email"));
  const userId = cleanHeader(req.header("x-sharepoint-user-id"));
  const personalNumber = normalizePersonalNumber(req.header("x-personal-number") || loginName || email);

  if (!loginName && !email && !userId) return null;

  const name = personalNumber || email || loginName || `SharePoint user ${userId}`;
  return {
    id: personalNumber ? `pn:${personalNumber}` : loginName || email || (userId ? `sp:${userId}` : "sharepoint-user"),
    name,
    role: "admin" as const,
    source: "sharepoint" as const,
    personalNumber: personalNumber || undefined,
    loginName,
    email,
    identityMode: "sharepoint-user" as const
  };
};

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const path = req.path || "";
  if (path.startsWith("/api/auth/login-personal-number") || path.startsWith("/api/auth/bootstrap-status") || path.startsWith("/api/health")) {
    logger.debug("auth", "Auth middleware bypassed for public route", {
      requestId: req.requestId,
      path
    });
    return next();
  }

  if (!env.AUTH_ENABLED) {
    const sharePointIdentity = sharePointIdentityFromHeaders(req);
    if (sharePointIdentity) {
      logger.info("auth", "Auth disabled, using SharePoint browser identity", {
        requestId: req.requestId,
        path,
        userId: sharePointIdentity.id,
        hasLoginName: Boolean(sharePointIdentity.loginName),
        hasEmail: Boolean(sharePointIdentity.email)
      });
      req.user = withOwnerMode(sharePointIdentity) || undefined;
      return next();
    }

    logger.debug("auth", "Auth disabled, using local fallback identity", {
      requestId: req.requestId,
      path
    });
    req.user = withOwnerMode({
      id: "dev-local",
      name: "Local Developer",
      role: "admin",
      source: "dev",
      identityMode: "local-fallback"
    }) || undefined;
    return next();
  }

  const suppliedPersonalNumber = normalizePersonalNumber(req.header("x-personal-number") || "");
  if (suppliedPersonalNumber) {
    logger.debug("auth", "Personal number auth attempt", {
      requestId: req.requestId,
      path,
      personalNumber: maskPersonalNumber(suppliedPersonalNumber)
    });

    const match = await findAuthorizedPersonalNumber(suppliedPersonalNumber);
    if (!match) {
      logger.warn("security", "Personal number auth rejected", {
        requestId: req.requestId,
        path,
        personalNumber: maskPersonalNumber(suppliedPersonalNumber)
      });
      return fail(res, "UNAUTHORIZED", "personal number לא מורשה", undefined, 401);
    }

    req.user = withOwnerMode({
      id: `pn:${match.personalNumber}`,
      name: match.isBootstrapAdmin ? `Bootstrap Admin ${match.personalNumber}` : `Admin ${match.personalNumber}`,
      role: match.role,
      personalNumber: match.personalNumber,
      source: match.source,
      identityMode: match.source === "owner" ? "explicit-owner" : undefined,
      isBootstrapAdmin: match.isBootstrapAdmin
    }) || undefined;
    logger.info("auth", "Personal number auth accepted", {
      requestId: req.requestId,
      path,
      source: match.source,
      role: match.role,
      personalNumber: maskPersonalNumber(match.personalNumber),
      matchedSite: match.siteCode
    });
    return next();
  }

  const suppliedKey = req.header("x-api-key");
  if (!suppliedKey || suppliedKey !== env.API_KEY) {
    logger.warn("security", "API key auth rejected", {
      requestId: req.requestId,
      path,
      hasApiKey: Boolean(suppliedKey)
    });
    return fail(res, "UNAUTHORIZED", "נדרש personal number מורשה או API key תקין", undefined, 401);
  }

  const apiUser = withOwnerMode({
    id: req.header("x-user-id") || "api-user",
    name: req.header("x-user-name") || "API User",
    role: normalizeRole(req.header("x-user-role") || "operator"),
    source: "api-key",
    identityMode: "api-key"
  });
  req.user = apiUser || undefined;
  logger.info("auth", "API key auth accepted", {
    requestId: req.requestId,
    path,
    userId: apiUser?.id,
    role: apiUser?.role
  });

  return next();
}

export function requireRole(minRole: UserRole) {
  return (req: Request, res: Response, next: NextFunction) => {
    const currentRole = req.user?.role || "viewer";
    if (rolePriority[currentRole] < rolePriority[minRole]) {
      logger.warn("security", "Role check rejected", {
        requestId: req.requestId,
        currentRole,
        minRole,
        path: req.path
      });
      return fail(res, "FORBIDDEN", "אין הרשאה לפעולה זו", undefined, 403);
    }
    logger.debug("auth", "Role check accepted", {
      requestId: req.requestId,
      currentRole,
      minRole,
      path: req.path
    });
    return next();
  };
}
