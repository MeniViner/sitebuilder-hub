import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";
import { fail } from "../utils/http";
import { logger } from "../utils/logger";

type Bucket = {
  startedAt: number;
  count: number;
};

const buckets = new Map<string, Bucket>();

const getKey = (req: Request) => req.ip || req.header("x-forwarded-for") || "unknown";

export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  const key = getKey(req);
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now - existing.startedAt > env.RATE_LIMIT_WINDOW_MS) {
    buckets.set(key, { startedAt: now, count: 1 });
    logger.debug("rateLimit", "Rate limit bucket opened", {
      requestId: req.requestId,
      key,
      path: req.path,
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      max: env.RATE_LIMIT_MAX
    });
    return next();
  }

  existing.count += 1;
  logger.debug("rateLimit", "Rate limit bucket incremented", {
    requestId: req.requestId,
    key,
    path: req.path,
    count: existing.count,
    max: env.RATE_LIMIT_MAX
  });

  if (existing.count > env.RATE_LIMIT_MAX) {
    logger.warn("rateLimit", "Rate limit exceeded", {
      requestId: req.requestId,
      key,
      path: req.path,
      count: existing.count,
      max: env.RATE_LIMIT_MAX
    });
    return fail(res, "RATE_LIMITED", "נחסמת זמנית בשל עומס בקשות", undefined, 429);
  }

  return next();
}
