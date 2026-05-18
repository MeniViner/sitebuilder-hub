import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";
import { fail } from "../utils/http";
import type { UserRole } from "../types/express";
import { findAuthorizedPersonalNumber } from "../services/personal-auth.service";
import { logger } from "../utils/logger";

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

const normalizePersonalNumber = (value: string) => String(value || "").replace(/\D/g, "");
const maskPersonalNumber = (value: string) => {
  const normalized = normalizePersonalNumber(value);
  return normalized ? `***${normalized.slice(-4)}` : "";
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
    logger.debug("auth", "Auth disabled, using local developer identity", {
      requestId: req.requestId,
      path
    });
    req.user = {
      id: "dev-local",
      name: "Local Developer",
      role: "admin",
      source: "dev"
    };
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

    req.user = {
      id: `pn:${match.personalNumber}`,
      name: match.isBootstrapAdmin ? `Bootstrap Admin ${match.personalNumber}` : `Admin ${match.personalNumber}`,
      role: match.role,
      personalNumber: match.personalNumber,
      source: match.source,
      isBootstrapAdmin: match.isBootstrapAdmin
    };
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

  req.user = {
    id: req.header("x-user-id") || "api-user",
    name: req.header("x-user-name") || "API User",
    role: normalizeRole(req.header("x-user-role") || "operator"),
    source: "api-key"
  };
  logger.info("auth", "API key auth accepted", {
    requestId: req.requestId,
    path,
    userId: req.user.id,
    role: req.user.role
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
