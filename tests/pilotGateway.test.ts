import http, { IncomingHttpHeaders, IncomingMessage, Server, ServerResponse } from "http";
import { AddressInfo } from "net";
import { createRequire } from "module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PILOT_GATEWAY_SITE_ID,
  PilotGatewayConfig,
  loadPilotGatewayConfig
} from "../server/src/config/pilotGateway";
import { createPilotGatewayRouter } from "../server/src/services/pilotGateway.service";

const require = createRequire(import.meta.url);
const express = require("../server/node_modules/express");
const APPROVED_ORIGIN = "https://portal.army.idf";
const SECRET = "synthetic-upstream-key-never-log";

type CapturedRequest = {
  method: string;
  url: string;
  headers: IncomingHttpHeaders;
  body: Buffer;
};

type HttpResult = {
  status: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
  json: Record<string, any> | null;
};

const listen = (server: Server) => new Promise<number>((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    server.removeListener("error", reject);
    resolve((server.address() as AddressInfo).port);
  });
});

const close = (server: Server | null) => new Promise<void>((resolve) => {
  if (!server || !server.listening) return resolve();
  server.close(() => resolve());
});

const readBody = (req: IncomingMessage) => new Promise<Buffer>((resolve, reject) => {
  const chunks: Buffer[] = [];
  req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  req.on("error", reject);
  req.on("end", () => resolve(Buffer.concat(chunks)));
});

const sendJson = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
  res.writeHead(status, {
    "Content-Type": "application/json",
    ...headers
  });
  res.end(JSON.stringify(body));
};

const requestRaw = ({
  port,
  path,
  method = "GET",
  headers = {},
  body
}: {
  port: number;
  path: string;
  method?: string;
  headers?: Record<string, string>;
  body?: Buffer | string;
}) => new Promise<HttpResult>((resolve, reject) => {
  const payload = body === undefined ? null : Buffer.isBuffer(body) ? body : Buffer.from(body);
  const request = http.request({
    host: "127.0.0.1",
    port,
    path,
    method,
    headers: {
      ...headers,
      ...(payload && headers["Content-Length"] === undefined && headers["content-length"] === undefined
        ? { "Content-Length": String(payload.length) }
        : {})
    }
  }, (response) => {
    const chunks: Buffer[] = [];
    response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    response.on("error", reject);
    response.on("end", () => {
      const responseBody = Buffer.concat(chunks);
      let json = null;
      try {
        json = responseBody.length ? JSON.parse(responseBody.toString("utf8")) : null;
      } catch {
        json = null;
      }
      resolve({
        status: Number(response.statusCode || 0),
        headers: response.headers,
        body: responseBody,
        json
      });
    });
  });
  request.on("error", reject);
  if (payload) request.write(payload);
  request.end();
});

const gatewayEnvironment = (target: string) => ({
  SITE_BUILDER_PILOT_GATEWAY_ENABLED: "true",
  SITE_BUILDER_PILOT_GATEWAY_PREFIX: "/builder-api",
  SITE_BUILDER_PILOT_GATEWAY_TARGET: target,
  SITE_BUILDER_PILOT_GATEWAY_ALLOWED_SITE_IDS: PILOT_GATEWAY_SITE_ID,
  SITE_BUILDER_PILOT_GATEWAY_ALLOWED_ORIGINS: APPROVED_ORIGIN,
  SITE_BUILDER_PILOT_GATEWAY_API_KEY_REF: "SITE_BUILDER_BACKEND_API_KEY",
  SITE_BUILDER_BACKEND_API_KEY: SECRET
});

describe("PILOT_ONLY Builder Gateway routing and proxy", () => {
  let upstream: Server | null;
  let gateway: Server | null;
  let upstreamPort: number;
  let gatewayPort: number;
  let captures: CapturedRequest[];
  let config: PilotGatewayConfig;
  let logger: {
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  const startGateway = async (overrides: Partial<PilotGatewayConfig> = {}) => {
    config = {
      ...loadPilotGatewayConfig(gatewayEnvironment(`http://127.0.0.1:${upstreamPort}`)),
      ...overrides
    };
    const app = express();
    app.use(config.prefix, createPilotGatewayRouter(config, logger as any));
    gateway = http.createServer(app);
    gatewayPort = await listen(gateway);
  };

  beforeEach(async () => {
    captures = [];
    logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };
    upstream = http.createServer(async (req, res) => {
      const body = await readBody(req);
      captures.push({
        method: String(req.method || ""),
        url: String(req.url || ""),
        headers: req.headers,
        body
      });

      if (req.url === "/healthz") {
        return sendJson(res, 200, {
          ok: true,
          service: "site-builder-api",
          storageBackend: "mongo",
          internal: "must-not-leak"
        }, {
          "X-Internal-Upstream": "hidden",
          "Set-Cookie": "upstream-cookie=hidden"
        });
      }
      if (req.url?.includes("/slow")) {
        setTimeout(() => sendJson(res, 200, { ok: true }), 150);
        return;
      }
      if (req.url?.includes("status=207")) {
        return sendJson(res, 207, { ok: false, results: [{ ok: false }] }, {
          ETag: "\"version-7\"",
          "Set-Cookie": "upstream-cookie=hidden",
          "X-Internal-Upstream": "hidden"
        });
      }
      return sendJson(res, 200, {
        ok: true,
        method: req.method,
        url: req.url,
        body: body.length ? body.toString("utf8") : ""
      }, {
        ETag: "\"version-1\"",
        "Set-Cookie": "upstream-cookie=hidden",
        "X-Internal-Upstream": "hidden"
      });
    });
    upstreamPort = await listen(upstream);
    await startGateway();
  });

  afterEach(async () => {
    await close(gateway);
    await close(upstream);
    gateway = null;
    upstream = null;
  });

  const browserRequest = (
    path: string,
    options: { method?: string; headers?: Record<string, string>; body?: Buffer | string } = {}
  ) => requestRaw({
    port: gatewayPort,
    path,
    method: options.method,
    headers: {
      Origin: APPROVED_ORIGIN,
      ...(options.headers || {})
    },
    body: options.body
  });

  it("returns only minimal safe health information and permits a server-local missing Origin", async () => {
    const response = await requestRaw({ port: gatewayPort, path: "/builder-api/healthz" });

    expect(response.status).toBe(200);
    expect(response.json).toEqual({ ok: true, mode: "pilot" });
    expect(response.headers["x-sitebuilder-gateway-mode"]).toBe("pilot");
    expect(response.headers["x-internal-upstream"]).toBeUndefined();
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(JSON.stringify(response.json)).not.toContain("mongo");
  });

  it("proxies only the exact pilot site and preserves nested paths and query strings", async () => {
    const response = await browserRequest(
      `/builder-api/api/sites/${PILOT_GATEWAY_SITE_ID}/legacy-object?key=nav_data.txt&read=1`
    );

    expect(response.status).toBe(200);
    expect(response.json?.url).toBe(
      `/api/sites/${PILOT_GATEWAY_SITE_ID}/legacy-object?key=nav_data.txt&read=1`
    );
    expect(captures.at(-1)?.url).toBe(response.json?.url);
  });

  it.each([
    ["/builder-api/api/sites/alphateam/legacy-object?key=nav_data.txt", 403, "site_not_allowed"],
    ["/builder-api/api/sites/another-site/legacy-object?key=nav_data.txt", 403, "site_not_allowed"],
    ["/builder-api/api/sites", 404, "route_not_allowed"],
    ["/builder-api/api/sites/", 404, "route_not_allowed"]
  ])("rejects disallowed route %s", async (path, status, code) => {
    const method = path.endsWith("/sites") ? "POST" : "GET";
    const response = await browserRequest(path, { method });

    expect(response.status).toBe(status);
    expect(response.json?.error?.code).toBe(code);
    expect(captures).toHaveLength(0);
  });

  it("requires an exact approved Origin and never emits a wildcard", async () => {
    const approved = await browserRequest(`/builder-api/api/sites/${PILOT_GATEWAY_SITE_ID}`);
    const rejected = await requestRaw({
      port: gatewayPort,
      path: `/builder-api/api/sites/${PILOT_GATEWAY_SITE_ID}`,
      headers: { Origin: "https://evil.example" }
    });
    const missing = await requestRaw({
      port: gatewayPort,
      path: `/builder-api/api/sites/${PILOT_GATEWAY_SITE_ID}`
    });

    expect(approved.status).toBe(200);
    expect(approved.headers["access-control-allow-origin"]).toBe(APPROVED_ORIGIN);
    expect(approved.headers["access-control-allow-credentials"]).toBe("true");
    expect(approved.headers["access-control-allow-origin"]).not.toBe("*");
    expect(rejected.status).toBe(403);
    expect(missing.status).toBe(403);
  });

  it("answers approved OPTIONS locally with a minimal credential-compatible CORS contract", async () => {
    const response = await browserRequest(
      `/builder-api/api/sites/${PILOT_GATEWAY_SITE_ID}/legacy-object`,
      {
        method: "OPTIONS",
        headers: {
          "Access-Control-Request-Method": "PUT",
          "Access-Control-Request-Headers": "content-type, if-match, x-request-id"
        }
      }
    );

    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(APPROVED_ORIGIN);
    expect(response.headers["access-control-allow-headers"]).toBe("content-type, if-match, x-request-id");
    expect(captures).toHaveLength(0);
  });

  it("strips browser credentials, identity, forwarding, and host headers before injecting the configured key", async () => {
    const response = await browserRequest(`/builder-api/api/sites/${PILOT_GATEWAY_SITE_ID}`, {
      headers: {
        Host: "attacker.invalid",
        Authorization: "Bearer browser-token",
        Cookie: "session=browser",
        "X-API-Key": "browser-key",
        "X-Forwarded-Host": "attacker.invalid",
        Forwarded: "host=attacker.invalid",
        "X-Personal-Number": "spoofed",
        "X-Request-ID": "safe-request-123",
        Accept: "application/json",
        "If-None-Match": "\"version-1\""
      }
    });
    const captured = captures.at(-1)!;

    expect(response.status).toBe(200);
    expect(captured.headers["x-api-key"]).toBe(SECRET);
    expect(captured.headers.authorization).toBeUndefined();
    expect(captured.headers.cookie).toBeUndefined();
    expect(captured.headers["x-forwarded-host"]).toBeUndefined();
    expect(captured.headers.forwarded).toBeUndefined();
    expect(captured.headers["x-personal-number"]).toBeUndefined();
    expect(captured.headers.host).toBe(`127.0.0.1:${upstreamPort}`);
    expect(captured.headers["x-request-id"]).toBe("safe-request-123");
    expect(captured.headers["if-none-match"]).toBe("\"version-1\"");
    expect(response.headers["x-request-id"]).toBe("safe-request-123");
  });

  it.each(["GET", "POST", "PUT", "PATCH", "DELETE"])("preserves %s, JSON bodies, and empty bodies", async (method) => {
    const hasBody = method !== "GET";
    const payload = hasBody ? JSON.stringify({ data: { method } }) : undefined;
    const response = await browserRequest(
      `/builder-api/api/sites/${PILOT_GATEWAY_SITE_ID}/data/test/item`,
      {
        method,
        headers: hasBody ? { "Content-Type": "application/json" } : {},
        body: payload
      }
    );

    expect(response.status).toBe(200);
    expect(response.json?.method).toBe(method);
    expect(response.json?.body).toBe(payload || "");
  });

  it("preserves upstream status, body, and safe headers while dropping unsafe response headers", async () => {
    const response = await browserRequest(
      `/builder-api/api/sites/${PILOT_GATEWAY_SITE_ID}/legacy/batch-write?status=207`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: "{\"items\":[]}" }
    );

    expect(response.status).toBe(207);
    expect(response.json).toEqual({ ok: false, results: [{ ok: false }] });
    expect(response.headers.etag).toBe("\"version-7\"");
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(response.headers["x-internal-upstream"]).toBeUndefined();
  });

  it("rejects a body above the Builder 10 MB limit before contacting upstream", async () => {
    await close(gateway);
    gateway = null;
    await startGateway({ bodyLimitBytes: 64 });
    captures = [];
    const response = await browserRequest(
      `/builder-api/api/sites/${PILOT_GATEWAY_SITE_ID}/legacy-object`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: Buffer.alloc(65, "a")
      }
    );

    expect(response.status).toBe(413);
    expect(response.json?.error?.code).toBe("body_too_large");
    expect(captures).toHaveLength(0);
  });

  it.each([
    [`/builder-api/api/sites/${PILOT_GATEWAY_SITE_ID}//legacy-object`, "unsafe_path"],
    [`/builder-api/api/sites/${PILOT_GATEWAY_SITE_ID}/%2e%2e/sites/other`, "unsafe_path"],
    ["/builder-api/api/sites/alphateam%2dmongo%2dpilot/legacy-object", "site_not_allowed"],
    [`/builder-api/api/sites/${PILOT_GATEWAY_SITE_ID}/legacy-object?siteId=other`, "unsafe_path"],
    [`/builder-api/api/sites/${PILOT_GATEWAY_SITE_ID}/legacy-object?targetSiteId=other`, "unsafe_path"],
    [`/builder-api/api/sites/${PILOT_GATEWAY_SITE_ID}/legacy-object%2fextra`, "unsafe_path"]
  ])("rejects traversal or bypass path %s", async (path, code) => {
    const response = await browserRequest(path);

    expect([403, 404]).toContain(response.status);
    expect(response.json?.error?.code).toBe(code);
    expect(captures).toHaveLength(0);
  });

  it("returns a safe 502 when upstream is unavailable and never logs or returns the key", async () => {
    await close(upstream);
    upstream = null;
    captures = [];
    const response = await browserRequest(`/builder-api/api/sites/${PILOT_GATEWAY_SITE_ID}`);
    const logs = JSON.stringify(logger);

    expect(response.status).toBe(502);
    expect(response.json?.error?.code).toBe("upstream_unavailable");
    expect(response.body.toString("utf8")).not.toContain(SECRET);
    expect(logs).not.toContain(SECRET);
  });

  it("aborts a timed-out upstream request with a safe response", async () => {
    await close(gateway);
    gateway = null;
    await startGateway({ upstreamTimeoutMs: 20 });
    const response = await browserRequest(
      `/builder-api/api/sites/${PILOT_GATEWAY_SITE_ID}/data/test/slow`
    );

    expect(response.status).toBe(504);
    expect(response.json?.error?.code).toBe("upstream_timeout");
    expect(response.body.toString("utf8")).not.toContain(SECRET);
  });
});
