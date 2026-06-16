import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env, getClientOrigins } from "./config/env";
import { getMongoStatus } from "./db/mongo";
import auditRoutes from "./routes/audit.routes";
import authRoutes from "./routes/auth.routes";
import backupsRoutes from "./routes/backups.routes";
import diagnosticsRoutes from "./routes/diagnostics.routes";
import jobsRoutes from "./routes/jobs.routes";
import monitoringRoutes from "./routes/monitoring.routes";
import operationsRoutes from "./routes/operations.routes";
import releasesRoutes from "./routes/releases.routes";
import sitesRoutes from "./routes/sites.routes";
import versionRoutes from "./routes/version.routes";
import { fail, ok } from "./utils/http";
import { logger } from "./utils/logger";
import { authMiddleware } from "./middlewares/auth";
import { requestContextMiddleware } from "./middlewares/request-context";
import { rateLimitMiddleware } from "./middlewares/rate-limit";

export const app = express();

app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const allowedOrigins = getClientOrigins();
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS origin is not allowed: ${origin}`));
  }
}));
app.use(express.json({ limit: "1mb" }));
app.use(requestContextMiddleware);
app.use(rateLimitMiddleware);

app.use((req, res, next) => {
  const start = Date.now();
  const payloadLoggingEnabled = logger.isPayloadLoggingEnabled();
  const requestContext = {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    originalUrl: req.originalUrl,
    query: req.query,
    ip: req.ip,
    userAgent: req.header("user-agent"),
    contentType: req.header("content-type"),
    contentLength: req.header("content-length"),
    ...(payloadLoggingEnabled ? { headers: req.headers, body: req.body } : {})
  };

  logger.info("http", "API request started", requestContext);

  const originalJson = res.json.bind(res);
  res.json = ((body?: unknown) => {
    if (payloadLoggingEnabled) {
      logger.debug("http", "API response body", {
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        body
      });
    }

    return originalJson(body);
  }) as typeof res.json;

  res.on("finish", () => {
    logger.info("http", "API request finished", {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Date.now() - start,
      actor: req.user?.name,
      role: req.user?.role,
      responseBytes: res.getHeader("content-length")
    });
  });

  next();
});

app.get("/api/health/live", (req, res) => {
  logger.debug("http", "Liveness probe", { requestId: req.requestId });
  return ok(res, { status: "ok", type: "liveness" });
});

app.get("/api/health/ready", (req, res) => {
  const mongo = getMongoStatus();
  logger.debug("http", "Readiness probe", { requestId: req.requestId, mongo });
  if (mongo !== "connected") {
    return fail(res, "NOT_READY", "MongoDB לא מחובר", { mongo }, 503);
  }

  return ok(res, {
    status: "ok",
    type: "readiness",
    mongo,
    serverTime: new Date().toISOString()
  });
});

app.get("/api/health", (req, res) => {
  logger.debug("http", "Health probe", { requestId: req.requestId, mongo: getMongoStatus() });
  return ok(res, {
    status: "ok",
    serverTime: new Date().toISOString(),
    mongo: getMongoStatus()
  });
});

app.use(authMiddleware);
app.use("/api/auth", authRoutes);

app.use("/api/diagnostics", diagnosticsRoutes);
app.use("/api/sites", sitesRoutes);
app.use("/api/releases", releasesRoutes);
app.use("/api/backups", backupsRoutes);
app.use("/api/version", versionRoutes);
app.use("/api/jobs", jobsRoutes);
app.use("/api/monitoring", monitoringRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/operations", operationsRoutes);

app.use((req, res) => {
  logger.warn("http", "API route not found", {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    originalUrl: req.originalUrl
  });
  return fail(res, "NOT_FOUND", "הנתיב המבוקש לא נמצא", undefined, 404);
});

app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error("errors", "Unhandled error", {
    requestId: req.requestId,
    message: err.message,
    stack: env.NODE_ENV === "development" ? err.stack : undefined
  });
  return fail(res, "INTERNAL_ERROR", "אירעה שגיאה פנימית בשרת", undefined, 500);
});
