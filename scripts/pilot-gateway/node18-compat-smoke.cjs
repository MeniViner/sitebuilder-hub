"use strict";

const http = require("http");
const path = require("path");

const repositoryRoot = path.resolve(__dirname, "..", "..");
const express = require(path.join(repositoryRoot, "server", "node_modules", "express"));
const {
  loadPilotGatewayConfig
} = require(path.join(repositoryRoot, "server", "dist", "config", "pilotGateway.js"));
const {
  createPilotGatewayRouter
} = require(path.join(repositoryRoot, "server", "dist", "services", "pilotGateway.service.js"));

const listen = (server) => new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    server.removeListener("error", reject);
    resolve(server.address().port);
  });
});

const close = (server) => new Promise((resolve) => server.close(() => resolve()));

const request = ({ port, path: requestPath, headers = {} }) => new Promise((resolve, reject) => {
  const req = http.request({
    host: "127.0.0.1",
    port,
    path: requestPath,
    headers
  }, (res) => {
    const chunks = [];
    res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    res.on("error", reject);
    res.on("end", () => resolve({
      status: res.statusCode,
      headers: res.headers,
      body: Buffer.concat(chunks).toString("utf8")
    }));
  });
  req.on("error", reject);
  req.end();
});

const main = async () => {
  let upstreamHeaders = null;
  const upstream = http.createServer((req, res) => {
    upstreamHeaders = req.headers;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, url: req.url }));
  });
  const upstreamPort = await listen(upstream);
  const secret = "node18-smoke-secret";
  const config = loadPilotGatewayConfig({
    SITE_BUILDER_PILOT_GATEWAY_ENABLED: "true",
    SITE_BUILDER_PILOT_GATEWAY_PREFIX: "/builder-api",
    SITE_BUILDER_PILOT_GATEWAY_TARGET: `http://127.0.0.1:${upstreamPort}`,
    SITE_BUILDER_PILOT_GATEWAY_ALLOWED_SITE_IDS: "alphateam-mongo-pilot",
    SITE_BUILDER_PILOT_GATEWAY_ALLOWED_ORIGINS: "https://portal.army.idf",
    SITE_BUILDER_PILOT_GATEWAY_API_KEY_REF: "SITE_BUILDER_BACKEND_API_KEY",
    SITE_BUILDER_BACKEND_API_KEY: secret
  });
  const app = express();
  app.use(config.prefix, createPilotGatewayRouter(config, {
    info() {},
    warn() {},
    error() {}
  }));
  const gateway = http.createServer(app);
  const gatewayPort = await listen(gateway);

  try {
    const response = await request({
      port: gatewayPort,
      path: "/builder-api/api/sites/alphateam-mongo-pilot/legacy-object?key=theme_data.txt",
      headers: {
        Origin: "https://portal.army.idf",
        Authorization: "Bearer browser-value",
        Cookie: "browser-cookie=value",
        "X-API-Key": "browser-value"
      }
    });
    if (response.status !== 200) throw new Error(`Unexpected Gateway status ${response.status}.`);
    if (response.headers["access-control-allow-origin"] !== "https://portal.army.idf") {
      throw new Error("Exact-origin CORS header was not returned.");
    }
    if (!upstreamHeaders || upstreamHeaders["x-api-key"] !== secret) {
      throw new Error("Server API key was not injected upstream.");
    }
    if (upstreamHeaders.authorization || upstreamHeaders.cookie) {
      throw new Error("Browser credentials reached the upstream service.");
    }
    process.stdout.write(`Node ${process.version} Gateway compatibility smoke passed.\n`);
  } finally {
    await close(gateway);
    await close(upstream);
  }
};

main().catch((error) => {
  process.stderr.write(`Node compatibility smoke failed: ${error.message}\n`);
  process.exitCode = 1;
});
