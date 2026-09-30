import http, { Server } from "http";
import { AddressInfo } from "net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetTestEnv } from "./setup/env";

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

const get = (port: number, path: string) => new Promise<{
  status: number;
  headers: http.IncomingHttpHeaders;
  body: any;
}>((resolve, reject) => {
  http.get({ host: "127.0.0.1", port, path }, (response) => {
    const chunks: Buffer[] = [];
    response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    response.on("error", reject);
    response.on("end", () => resolve({
      status: Number(response.statusCode || 0),
      headers: response.headers,
      body: JSON.parse(Buffer.concat(chunks).toString("utf8"))
    }));
  }).on("error", reject);
});

describe("HUB app pilot Gateway registration", () => {
  let upstream: Server | null = null;
  let hub: Server | null = null;

  afterEach(async () => {
    await close(hub);
    await close(upstream);
    hub = null;
    upstream = null;
  });

  it("mounts the enabled prefix before normal HUB CORS, JSON parsing, and auth middleware", async () => {
    upstream = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        ok: true,
        service: "site-builder-api",
        storageBackend: "mongo"
      }));
    });
    const upstreamPort = await listen(upstream);
    resetTestEnv({
      SITE_BUILDER_PILOT_GATEWAY_ENABLED: "true",
      SITE_BUILDER_PILOT_GATEWAY_PREFIX: "/builder-api",
      SITE_BUILDER_PILOT_GATEWAY_TARGET: `http://127.0.0.1:${upstreamPort}`,
      SITE_BUILDER_PILOT_GATEWAY_ALLOWED_SITE_IDS: "alphateam-mongo-pilot",
      SITE_BUILDER_PILOT_GATEWAY_ALLOWED_ORIGINS: "https://portal.army.idf",
      SITE_BUILDER_PILOT_GATEWAY_API_KEY_REF: "SITE_BUILDER_BACKEND_API_KEY",
      SITE_BUILDER_BACKEND_API_KEY: "registration-test-secret"
    });
    vi.resetModules();
    const { app, pilotGatewayConfig } = await import("../server/src/app");
    hub = http.createServer(app);
    const hubPort = await listen(hub);

    const response = await get(hubPort, "/builder-api/healthz");

    expect(pilotGatewayConfig.enabled).toBe(true);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, mode: "pilot" });
    expect(response.headers["x-sitebuilder-gateway-mode"]).toBe("pilot");
  });
});
