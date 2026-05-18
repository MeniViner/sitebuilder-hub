import { randomUUID } from "crypto";
import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";

export function requestContextMiddleware(req: Request, res: Response, next: NextFunction) {
  const requestId = req.header("x-request-id") || randomUUID();
  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  logger.debug("http", "Request context assigned", {
    requestId,
    providedByClient: Boolean(req.header("x-request-id")),
    method: req.method,
    path: req.path
  });
  next();
}
