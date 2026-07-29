"use strict";

const fs = require("fs");
const http = require("http");
const readline = require("readline");

const BUILDER_API_ORIGIN = "http://127.0.0.1:3001";
const PILOT_CONFIRMATION = "CREATE_ALPHA_MONGO_PILOT";
const PILOT_IDENTITY = Object.freeze({
  siteId: "alphateam-mongo-pilot",
  displayName: "Alpha Team Mongo Pilot",
  environment: "test"
});
const REQUEST_TIMEOUT_MS = 15000;

const GANTT_EMPTY_DATA = Object.freeze({
  enabled: false,
  buttonLabel: "גאנט עבודה",
  pageTitle: "גאנט עבודה",
  description: "",
  groupBy: "category",
  defaultView: "month",
  showLegend: true,
  showToday: true,
  categories: [],
  items: []
});

const PILOT_SEED_ITEMS = Object.freeze([
  { key: "bihs_master_config_v1.txt", data: { schemaVersion: "1.0.0" } },
  { key: "users_data.txt", data: [] },
  { key: "events_data.txt", data: { displayCount: 3, displayMode: "default", events: [] } },
  { key: "nav_data.txt", data: [] },
  { key: "site_content_data.txt", data: {} },
  { key: "theme_data.txt", data: {} },
  { key: "widgets_data.txt", data: {} },
  { key: "external_links_data.txt", data: [] },
  { key: "gantt_data.txt", data: GANTT_EMPTY_DATA }
]);

const safePath = (path) => {
  const value = String(path || "");
  const allowedPrefix = `/api/sites/${PILOT_IDENTITY.siteId}`;
  if (
    value === "/healthz"
    || value === allowedPrefix
    || value.startsWith(`${allowedPrefix}/`)
    || value === "/api/sites"
  ) {
    return value;
  }
  throw new Error("Bootstrap tool refused a path outside the fixed pilot identity.");
};

const parseEnvText = (text) => {
  const values = {};
  for (const sourceLine of String(text || "").split(/\r?\n/)) {
    const line = sourceLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      value.length >= 2
      && ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "").trim();
    }
    values[match[1]] = value;
  }
  return values;
};

const resolveApiKey = ({ environment = process.env, envFile = "" } = {}) => {
  const processKey = String(
    environment.SITE_BUILDER_BACKEND_API_KEY
    || environment.ADMIN_API_KEY
    || ""
  ).trim();
  if (processKey) return processKey;

  const configuredFile = String(envFile || environment.BUILDER_API_ENV_FILE || "").trim();
  if (!configuredFile) {
    throw new Error(
      "Builder API key is unavailable. Set a process-scoped SITE_BUILDER_BACKEND_API_KEY/ADMIN_API_KEY or provide --env-file."
    );
  }
  const values = parseEnvText(fs.readFileSync(configuredFile, "utf8"));
  const fileKey = String(values.ADMIN_API_KEY || values.SITE_BUILDER_BACKEND_API_KEY || "").trim();
  if (!fileKey) throw new Error("The selected Builder Data API environment file does not contain the required API key.");
  return fileKey;
};

const createJsonTransport = ({
  apiKey,
  origin = BUILDER_API_ORIGIN,
  timeoutMs = REQUEST_TIMEOUT_MS
}) => {
  if (origin !== BUILDER_API_ORIGIN) {
    throw new Error(`Bootstrap tool requires the fixed Builder API origin ${BUILDER_API_ORIGIN}.`);
  }

  return async (method, path, body) => {
    const target = new URL(safePath(path), `${origin}/`);
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    return new Promise((resolve, reject) => {
      let settled = false;
      const request = http.request(target, {
        method,
        timeout: timeoutMs,
        headers: {
          Accept: "application/json",
          "X-API-Key": apiKey,
          ...(payload
            ? {
                "Content-Type": "application/json",
                "Content-Length": String(payload.length)
              }
            : {})
        }
      }, (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        response.on("error", () => {
          if (settled) return;
          settled = true;
          reject(new Error("Builder API response failed."));
        });
        response.on("end", () => {
          if (settled) return;
          settled = true;
          const text = Buffer.concat(chunks).toString("utf8");
          let parsed = null;
          if (text) {
            try {
              parsed = JSON.parse(text);
            } catch {
              reject(new Error(`Builder API returned non-JSON data for ${method} ${path}.`));
              return;
            }
          }
          resolve({ status: Number(response.statusCode || 0), body: parsed });
        });
      });
      request.on("timeout", () => request.destroy(new Error("Builder API request timed out.")));
      request.on("error", () => {
        if (settled) return;
        settled = true;
        reject(new Error(`Builder API request failed for ${method} ${path}.`));
      });
      if (payload) request.write(payload);
      request.end();
    });
  };
};

const assertStatus = (response, allowed, operation) => {
  if (!response || !allowed.includes(Number(response.status))) {
    throw new Error(`${operation} failed with HTTP ${Number(response && response.status) || 0}.`);
  }
  return response.body || {};
};

const stableJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

const inspectSeedResults = (payload) => {
  const results = Array.isArray(payload && payload.results) ? payload.results : [];
  const byKey = new Map(results.map((item) => [String(item && item.key || ""), item]));
  return PILOT_SEED_ITEMS.map((expected) => {
    const actual = byKey.get(expected.key);
    const exists = Boolean(actual && actual.ok === true && actual.missing !== true && Number(actual.version) >= 1);
    return {
      key: expected.key,
      exists,
      shapeMatches: exists && stableJson(actual.data) === stableJson(expected.data)
    };
  });
};

const preflightPilot = async ({ transport, log = () => {} }) => {
  log("Read-only preflight: Builder Data API health.");
  const health = await transport("GET", "/healthz");
  assertStatus(health, [200], "Builder health preflight");
  if (!health.body || health.body.ok !== true) throw new Error("Builder health preflight did not return ok=true.");

  log(`Read-only preflight: registry identity ${PILOT_IDENTITY.siteId}.`);
  const registry = await transport("GET", `/api/sites/${PILOT_IDENTITY.siteId}`);
  if (registry.status === 404) {
    return { healthOk: true, exists: false, site: null };
  }
  const body = assertStatus(registry, [200], "Pilot registry preflight");
  const site = body.site || (body.data && body.data.site) || body.data || null;
  if (!site || site.siteId !== PILOT_IDENTITY.siteId) {
    throw new Error("Builder registry preflight returned an unexpected site identity.");
  }
  return { healthOk: true, exists: true, site };
};

const verifyPilot = async ({ transport, log = () => {}, preflight = null }) => {
  const checked = preflight || await preflightPilot({ transport, log });
  if (!checked.exists) throw new Error("Pilot registry does not exist.");
  if (!String(checked.site.safeCollectionName || "").trim()) {
    throw new Error("Pilot registry is missing the Builder-generated safeCollectionName.");
  }
  if (checked.site.displayName !== PILOT_IDENTITY.displayName) {
    throw new Error("Pilot registry displayName does not match the immutable pilot plan.");
  }

  const seedRead = await transport(
    "POST",
    `/api/sites/${PILOT_IDENTITY.siteId}/legacy/batch-read`,
    { keys: PILOT_SEED_ITEMS.map((item) => item.key) }
  );
  const payload = assertStatus(seedRead, [200, 207], "Pilot seed verification");
  const seedChecks = inspectSeedResults(payload);
  const failed = seedChecks.filter((item) => !item.exists || !item.shapeMatches);
  if (failed.length) {
    throw new Error(`Pilot seed verification failed for ${failed.map((item) => item.key).join(", ")}.`);
  }

  log("Pilot registry and all nine legacy-compatible seed objects verified.");
  return {
    ok: true,
    identity: PILOT_IDENTITY,
    safeCollectionName: checked.site.safeCollectionName,
    seedChecks
  };
};

const runPilotBootstrap = async ({
  mode = "create",
  confirmation = "",
  transport,
  log = () => {}
}) => {
  if (!["create", "dry-run", "verify"].includes(mode)) throw new Error("Unsupported pilot bootstrap mode.");
  log("PILOT_ONLY technical identity:");
  log(`  siteId: ${PILOT_IDENTITY.siteId}`);
  log(`  displayName: ${PILOT_IDENTITY.displayName}`);
  log(`  environment: ${PILOT_IDENTITY.environment}`);

  const preflight = await preflightPilot({ transport, log });
  if (mode === "dry-run") {
    return {
      ok: true,
      status: preflight.exists ? "already-exists-no-write" : "ready-for-confirmation",
      identity: PILOT_IDENTITY,
      plannedSeedKeys: PILOT_SEED_ITEMS.map((item) => item.key),
      writesPerformed: 0
    };
  }
  if (mode === "verify") return verifyPilot({ transport, log, preflight });

  if (preflight.exists) {
    log("Pilot registry already exists. No create or seed write was attempted.");
    try {
      const verification = await verifyPilot({ transport, log, preflight });
      return { ...verification, status: "already-exists-verified", writesPerformed: 0 };
    } catch (error) {
      return {
        ok: false,
        status: "already-exists-verification-required",
        identity: PILOT_IDENTITY,
        writesPerformed: 0,
        error: error.message
      };
    }
  }

  if (confirmation !== PILOT_CONFIRMATION) {
    throw new Error(`Creation confirmation rejected. Enter exactly ${PILOT_CONFIRMATION}.`);
  }

  const create = await transport("POST", "/api/sites", {
    siteId: PILOT_IDENTITY.siteId,
    siteSlug: PILOT_IDENTITY.siteId,
    displayName: PILOT_IDENTITY.displayName,
    status: "active",
    publicRead: false
  });
  const createPayload = assertStatus(create, [201], "Pilot registry creation");
  const createdSite = createPayload.site || (createPayload.data && createPayload.data.site) || createPayload.data;
  if (
    !createdSite
    || createdSite.siteId !== PILOT_IDENTITY.siteId
    || createdSite.displayName !== PILOT_IDENTITY.displayName
    || !String(createdSite.safeCollectionName || "").trim()
  ) {
    throw new Error("Pilot registry creation returned an invalid technical identity.");
  }

  const beforeSeed = await transport(
    "POST",
    `/api/sites/${PILOT_IDENTITY.siteId}/legacy/batch-read`,
    { keys: PILOT_SEED_ITEMS.map((item) => item.key) }
  );
  const beforePayload = assertStatus(beforeSeed, [200, 207], "Pilot seed preflight");
  const existing = new Set(
    inspectSeedResults(beforePayload)
      .filter((item) => item.exists)
      .map((item) => item.key)
  );
  const missingItems = PILOT_SEED_ITEMS.filter((item) => !existing.has(item.key));
  if (missingItems.length) {
    const seedWrite = await transport(
      "POST",
      `/api/sites/${PILOT_IDENTITY.siteId}/legacy/batch-write`,
      {
        items: missingItems.map((item) => ({
          key: item.key,
          data: item.data,
          expectedVersion: 0,
          allowEmptyOverwrite: true
        }))
      }
    );
    const seedPayload = assertStatus(seedWrite, [200], "Pilot seed write");
    const failed = Array.isArray(seedPayload.results)
      ? seedPayload.results.filter((item) => !item || item.ok !== true)
      : [];
    if (failed.length) throw new Error("One or more pilot seed writes failed.");
  }

  const verification = await verifyPilot({
    transport,
    log,
    preflight: { healthOk: true, exists: true, site: createdSite }
  });
  return {
    ...verification,
    status: "created-and-verified",
    writesPerformed: 1 + (missingItems.length ? 1 : 0),
    seeded: missingItems.map((item) => item.key),
    skippedExisting: Array.from(existing)
  };
};

const parseArgs = (args) => {
  const modeArg = args[0] || "create";
  const options = {
    mode: modeArg === "verify" ? "verify" : args.includes("--dry-run") ? "dry-run" : "create",
    envFile: "",
    confirmation: ""
  };
  for (let index = 1; index < args.length; index += 1) {
    if (args[index] === "--env-file") options.envFile = String(args[index + 1] || "");
    if (args[index] === "--confirm") options.confirmation = String(args[index + 1] || "");
  }
  return options;
};

const promptForConfirmation = () => new Promise((resolve) => {
  const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
  prompt.question(`Type ${PILOT_CONFIRMATION} to create the pilot: `, (answer) => {
    prompt.close();
    resolve(String(answer || "").trim());
  });
});

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  const apiKey = resolveApiKey({ envFile: options.envFile });
  const transport = createJsonTransport({ apiKey });
  const log = (message) => process.stdout.write(`${message}\n`);

  if (options.mode === "create" && !options.confirmation) {
    log("The helper will run a read-only preflight before prompting.");
    const preflight = await preflightPilot({ transport, log });
    if (preflight.exists) {
      const result = await runPilotBootstrap({ mode: "create", transport, log });
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      process.exitCode = result.ok ? 0 : 2;
      return;
    }
    log("PILOT_ONLY technical identity:");
    log(`  siteId: ${PILOT_IDENTITY.siteId}`);
    log(`  displayName: ${PILOT_IDENTITY.displayName}`);
    log(`  environment: ${PILOT_IDENTITY.environment}`);
    options.confirmation = await promptForConfirmation();
  }

  const result = await runPilotBootstrap({
    mode: options.mode,
    confirmation: options.confirmation,
    transport,
    log
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.ok === false ? 2 : 0;
};

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`Pilot helper failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  BUILDER_API_ORIGIN,
  PILOT_CONFIRMATION,
  PILOT_IDENTITY,
  PILOT_SEED_ITEMS,
  createJsonTransport,
  inspectSeedResults,
  parseEnvText,
  preflightPilot,
  resolveApiKey,
  runPilotBootstrap,
  verifyPilot
};
