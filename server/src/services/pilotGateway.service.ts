import crypto from "crypto";
import express, { NextFunction, Request, Response, Router } from "express";
import http from "http";
import https from "https";
import { URL, URLSearchParams } from "url";
import {
  PILOT_GATEWAY_MODE,
  PilotGatewayConfig
} from "../config/pilotGateway";
import { logger } from "../utils/logger";

const ALLOWED_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);
const FORBIDDEN_SITE_QUERY_KEYS = new Set(["site", "siteid", "sitecode", "buildersiteid", "mongositeid"]);
const REQUEST_HEADERS = new Set([
  "accept",
  "content-type",
  "if-match",
  "if-none-match",
  "if-modified-since",
  "if-unmodified-since"
]);
const RESPONSE_HEADERS = new Set(["content-type", "etag", "last-modified", "cache-control"]);
const PREFLIGHT_HEADERS = new Set([
  "accept",
  "content-type",
  "if-match",
  "if-none-match",
  "if-modified-since",
  "if-unmodified-since",
  "x-request-id"
]);
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

type GatewayLogger = Pick<typeof logger, "info" | "warn" | "error">;

const safeJson = (res: Response, status: number, body: Record<string, unknown>) => {
  if (res.headersSent) return;
  res.status(status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
};

const reject = (res: Response, status: number, code: string, requestId: string) =>
  safeJson(res, status, {
    ok: false,
    error: { code, message: "Pilot Gateway request rejected." },
    requestId
  });

const requestIdFor = (req: Request) => {
  const incoming = String(req.get("x-request-id") || "").trim();
  return REQUEST_ID_PATTERN.test(incoming) ? incoming : crypto.randomUUID();
};

const addGatewayHeaders = (res: Response, requestId: string) => {
  res.setHeader("X-SiteBuilder-Gateway-Mode", PILOT_GATEWAY_MODE);
  res.setHeader("X-Request-ID", requestId);
  res.setHeader("Cache-Control", "no-store");
};

const applyCors = (res: Response, origin: string) => {
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Expose-Headers", "ETag, X-Request-ID, X-SiteBuilder-Gateway-Mode");
  res.setHeader("Vary", "Origin");
};

const approvedOrigin = (req: Request, config: PilotGatewayConfig, allowMissing: boolean) => {
  const origin = req.get("origin");
  if (!origin) return allowMissing ? "" : null;
  if (origin.includes(",") || !config.allowedOrigins.has(origin)) return null;
  return origin;
};

const rawPathAndQuery = (req: Request, prefix: string) => {
  const original = req.originalUrl || req.url;
  const question = original.indexOf("?");
  const rawPath = question >= 0 ? original.slice(0, question) : original;
  const rawQuery = question >= 0 ? original.slice(question + 1) : "";
  if (rawPath !== prefix && !rawPath.startsWith(`${prefix}/`)) return null;
  return { rawPath: rawPath.slice(prefix.length) || "/", rawQuery };
};

const hasUnsafePath = (rawPath: string) => {
  if (
    rawPath.includes("\\")
    || rawPath.includes("//")
    || /%(?:2e|2f|5c|00|25)/i.test(rawPath)
  ) {
    return true;
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    return true;
  }
  return decoded.split("/").some((segment) => segment === "." || segment === "..");
};

const forbiddenSiteQuery = (rawQuery: string) => {
  let query: URLSearchParams;
  try {
    query = new URLSearchParams(rawQuery);
  } catch {
    return true;
  }
  for (const key of query.keys()) {
    const normalized = key.trim().toLowerCase();
    if (FORBIDDEN_SITE_QUERY_KEYS.has(normalized) || normalized.endsWith("siteid")) return true;
  }
  return false;
};

const resolveSitePath = (
  req: Request,
  config: PilotGatewayConfig
): { upstreamPath: string; rawQuery: string } | { error: "unsafe_path" | "site_not_allowed" | "route_not_allowed" } => {
  const raw = rawPathAndQuery(req, config.prefix);
  if (!raw || hasUnsafePath(raw.rawPath) || forbiddenSiteQuery(raw?.rawQuery || "")) {
    return { error: "unsafe_path" };
  }

  if (raw.rawPath === "/api/sites" || raw.rawPath === "/api/sites/") {
    return { error: "route_not_allowed" };
  }

  const match = raw.rawPath.match(/^\/api\/sites\/([^/]+)(?:\/|$)/);
  if (!match) return { error: "route_not_allowed" };
  const rawSiteId = match[1];
  if (rawSiteId !== decodeURIComponent(rawSiteId) || !config.allowedSiteIds.has(rawSiteId)) {
    return { error: "site_not_allowed" };
  }

  return {
    upstreamPath: raw.rawPath,
    rawQuery: raw.rawQuery
  };
};

const collectRequestBody = (req: Request, limit: number) =>
  new Promise<Buffer>((resolve, rejectBody) => {
    const declared = Number(req.get("content-length") || 0);
    if (Number.isFinite(declared) && declared > limit) {
      rejectBody(Object.assign(new Error("body_too_large"), { code: "body_too_large" }));
      return;
    }

    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const fail = (code: string) => {
      if (settled) return;
      settled = true;
      rejectBody(Object.assign(new Error(code), { code }));
    };

    req.on("aborted", () => fail("request_aborted"));
    req.on("error", () => fail("request_read_failed"));
    req.on("data", (chunk: Buffer | string) => {
      if (settled) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > limit) {
        fail("body_too_large");
        return;
      }
      chunks.push(buffer);
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks));
    });
  });

const requestHeaders = (req: Request, apiKey: string, requestId: string, body: Buffer) => {
  const headers: http.OutgoingHttpHeaders = {
    "x-api-key": apiKey,
    "x-request-id": requestId
  };
  for (const name of REQUEST_HEADERS) {
    const value = req.headers[name];
    if (typeof value === "string") headers[name] = value;
  }
  if (body.length > 0) headers["content-length"] = String(body.length);
  return headers;
};

const copyResponseHeaders = (upstream: http.IncomingMessage, res: Response) => {
  for (const name of RESPONSE_HEADERS) {
    const value = upstream.headers[name];
    if (typeof value === "string") res.setHeader(name, value);
  }
};

const targetUrl = (config: PilotGatewayConfig, path: string, rawQuery = "") => {
  const target = new URL(config.target!.toString());
  target.pathname = path;
  target.search = rawQuery ? `?${rawQuery}` : "";
  return target;
};

const upstreamRequest = (
  req: Request,
  res: Response,
  config: PilotGatewayConfig,
  requestId: string,
  body: Buffer,
  path: string,
  rawQuery: string,
  gatewayLogger: GatewayLogger
) => {
  const target = targetUrl(config, path, rawQuery);
  const transport = target.protocol === "https:" ? https : http;
  let completed = false;
  const finishWithError = (status: number, code: string) => {
    if (completed) return;
    completed = true;
    gatewayLogger.warn("security", "PILOT_ONLY Builder Gateway upstream request failed", {
      requestId,
      code,
      method: req.method,
      path
    });
    reject(res, status, code, requestId);
  };

  const upstream = transport.request(target, {
    method: req.method,
    headers: requestHeaders(req, config.apiKey, requestId, body),
    timeout: config.upstreamTimeoutMs
  }, (upstreamResponse) => {
    if (completed) {
      upstreamResponse.destroy();
      return;
    }
    completed = true;
    res.status(upstreamResponse.statusCode || 502);
    copyResponseHeaders(upstreamResponse, res);
    addGatewayHeaders(res, requestId);
    upstreamResponse.on("error", () => {
      if (!res.headersSent) reject(res, 502, "upstream_response_failed", requestId);
      else res.end();
    });
    upstreamResponse.pipe(res);
  });

  upstream.on("timeout", () => {
    upstream.destroy();
    finishWithError(504, "upstream_timeout");
  });
  upstream.on("error", () => finishWithError(502, "upstream_unavailable"));
  req.on("aborted", () => upstream.destroy());
  res.on("close", () => {
    if (!res.writableEnded) upstream.destroy();
  });
  if (body.length > 0) upstream.write(body);
  upstream.end();
};

const healthRequest = (
  res: Response,
  config: PilotGatewayConfig,
  requestId: string,
  gatewayLogger: GatewayLogger
) => {
  const target = targetUrl(config, "/healthz");
  const transport = target.protocol === "https:" ? https : http;
  let completed = false;
  const finish = (ok: boolean, code = "upstream_unavailable") => {
    if (completed) return;
    completed = true;
    addGatewayHeaders(res, requestId);
    if (!ok) {
      gatewayLogger.warn("security", "PILOT_ONLY Builder Gateway health check failed", { requestId, code });
    }
    safeJson(res, ok ? 200 : code === "upstream_timeout" ? 504 : 502, { ok, mode: PILOT_GATEWAY_MODE });
  };
  const upstream = transport.get(target, {
    timeout: config.upstreamTimeoutMs,
    headers: { accept: "application/json", "x-request-id": requestId }
  }, (upstreamResponse) => {
    upstreamResponse.resume();
    upstreamResponse.on("end", () => finish(Boolean(upstreamResponse.statusCode && upstreamResponse.statusCode >= 200 && upstreamResponse.statusCode < 300), "upstream_bad_status"));
  });
  upstream.on("timeout", () => {
    upstream.destroy();
    finish(false, "upstream_timeout");
  });
  upstream.on("error", () => finish(false));
  res.on("close", () => {
    if (!res.writableEnded) upstream.destroy();
  });
};

export const createPilotGatewayRouter = (
  config: PilotGatewayConfig,
  gatewayLogger: GatewayLogger = logger
): Router => {
  if (!config.enabled || !config.target) {
    throw new Error("Cannot create the pilot Gateway router while it is disabled.");
  }

  const router = express.Router();

  router.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = requestIdFor(req);
    addGatewayHeaders(res, requestId);
    (req as Request & { pilotGatewayRequestId?: string }).pilotGatewayRequestId = requestId;
    next();
  });

  router.get("/healthz", (req, res) => {
    const requestId = (req as Request & { pilotGatewayRequestId: string }).pilotGatewayRequestId;
    const origin = approvedOrigin(req, config, true);
    if (origin === null) return reject(res, 403, "origin_not_allowed", requestId);
    if (origin) applyCors(res, origin);
    return healthRequest(res, config, requestId, gatewayLogger);
  });

  router.use((req, res) => {
    const requestId = (req as Request & { pilotGatewayRequestId: string }).pilotGatewayRequestId;
    if (!ALLOWED_METHODS.has(req.method)) {
      res.setHeader("Allow", Array.from(ALLOWED_METHODS).join(", "));
      return reject(res, 405, "method_not_allowed", requestId);
    }

    const origin = approvedOrigin(req, config, false);
    if (origin === null || origin === "") return reject(res, 403, "origin_not_allowed", requestId);
    applyCors(res, origin);

    const resolved = resolveSitePath(req, config);
    if ("error" in resolved) {
      return reject(res, resolved.error === "site_not_allowed" ? 403 : 404, resolved.error, requestId);
    }

    if (req.method === "OPTIONS") {
      const requestedMethod = String(req.get("access-control-request-method") || "").toUpperCase();
      if (!requestedMethod || !ALLOWED_METHODS.has(requestedMethod) || requestedMethod === "OPTIONS") {
        return reject(res, 405, "preflight_method_not_allowed", requestId);
      }
      const requestedHeaders = String(req.get("access-control-request-headers") || "")
        .split(",")
        .map((header) => header.trim().toLowerCase())
        .filter(Boolean);
      if (requestedHeaders.some((header) => !PREFLIGHT_HEADERS.has(header))) {
        return reject(res, 403, "preflight_header_not_allowed", requestId);
      }
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
      if (requestedHeaders.length) {
        res.setHeader("Access-Control-Allow-Headers", requestedHeaders.join(", "));
      }
      res.setHeader("Access-Control-Max-Age", "600");
      return res.status(204).end();
    }

    return collectRequestBody(req, config.bodyLimitBytes)
      .then((body) => upstreamRequest(
        req,
        res,
        config,
        requestId,
        body,
        resolved.upstreamPath,
        resolved.rawQuery,
        gatewayLogger
      ))
      .catch((error: Error & { code?: string }) => {
        const code = error.code === "body_too_large" ? "body_too_large" : "request_body_failed";
        return reject(res, code === "body_too_large" ? 413 : 400, code, requestId);
      });
  });

  return router;
};
