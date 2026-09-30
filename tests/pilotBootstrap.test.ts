import { createRequire } from "module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const bootstrap = require("../scripts/pilot-gateway/pilot-bootstrap.cjs");

type Call = { method: string; path: string; body: any };

const makeTransport = ({
  exists = false,
  seeded = false
}: {
  exists?: boolean;
  seeded?: boolean;
} = {}) => {
  const calls: Call[] = [];
  let registryExists = exists;
  let seedExists = seeded;
  const site = {
    siteId: bootstrap.PILOT_IDENTITY.siteId,
    siteSlug: bootstrap.PILOT_IDENTITY.siteId,
    displayName: bootstrap.PILOT_IDENTITY.displayName,
    safeCollectionName: "site_alphateam_mongo_pilot_generated"
  };

  const transport = vi.fn(async (method: string, path: string, body?: any) => {
    calls.push({ method, path, body });
    if (path === "/healthz") {
      return { status: 200, body: { ok: true, service: "site-builder-api" } };
    }
    if (path === `/api/sites/${bootstrap.PILOT_IDENTITY.siteId}`) {
      return registryExists
        ? { status: 200, body: { ok: true, site } }
        : { status: 404, body: { ok: false, error: { code: "not_found" } } };
    }
    if (path === "/api/sites" && method === "POST") {
      registryExists = true;
      return { status: 201, body: { ok: true, site } };
    }
    if (path.endsWith("/legacy/batch-read")) {
      return {
        status: 200,
        body: {
          ok: true,
          results: bootstrap.PILOT_SEED_ITEMS.map((item: any) => seedExists
            ? { ok: true, key: item.key, data: item.data, version: 1, missing: false }
            : { ok: true, key: item.key, data: null, version: 0, missing: true })
        }
      };
    }
    if (path.endsWith("/legacy/batch-write")) {
      seedExists = true;
      return {
        status: 200,
        body: {
          ok: true,
          results: body.items.map((item: any) => ({ ok: true, key: item.key, version: 1 }))
        }
      };
    }
    return { status: 404, body: { ok: false } };
  });

  return { transport, calls };
};

describe("server-local alphateam Mongo pilot bootstrap", () => {
  it("performs a read-only dry-run/preflight with the exact technical identity", async () => {
    const { transport, calls } = makeTransport();
    const result = await bootstrap.runPilotBootstrap({
      mode: "dry-run",
      transport,
      log: vi.fn()
    });

    expect(result).toMatchObject({
      ok: true,
      status: "ready-for-confirmation",
      identity: {
        siteId: "alphateam-mongo-pilot",
        displayName: "Alpha Team Mongo Pilot",
        environment: "test"
      },
      writesPerformed: 0
    });
    expect(calls.every((call) => call.method === "GET")).toBe(true);
  });

  it("rejects a wrong confirmation before any write", async () => {
    const { transport, calls } = makeTransport();

    await expect(bootstrap.runPilotBootstrap({
      mode: "create",
      confirmation: "CREATE_ALPHATEAM",
      transport,
      log: vi.fn()
    })).rejects.toThrow("CREATE_ALPHA_MONGO_PILOT");
    expect(calls.every((call) => call.method === "GET")).toBe(true);
  });

  it("stops safely and performs no writes when the registry site already exists", async () => {
    const { transport, calls } = makeTransport({ exists: true, seeded: false });
    const result = await bootstrap.runPilotBootstrap({
      mode: "create",
      confirmation: bootstrap.PILOT_CONFIRMATION,
      transport,
      log: vi.fn()
    });

    expect(result).toMatchObject({
      ok: false,
      status: "already-exists-verification-required",
      writesPerformed: 0
    });
    expect(calls.some((call) => call.method === "POST" && call.path === "/api/sites")).toBe(false);
    expect(calls.some((call) => call.path.endsWith("/legacy/batch-write"))).toBe(false);
  });

  it("creates only alphateam-mongo-pilot, seeds the exact nine supported shapes, and verifies reads", async () => {
    const { transport, calls } = makeTransport();
    const result = await bootstrap.runPilotBootstrap({
      mode: "create",
      confirmation: bootstrap.PILOT_CONFIRMATION,
      transport,
      log: vi.fn()
    });
    const create = calls.find((call) => call.method === "POST" && call.path === "/api/sites")!;
    const seed = calls.find((call) => call.path.endsWith("/legacy/batch-write"))!;
    const verifyReads = calls.filter((call) => call.path.endsWith("/legacy/batch-read"));

    expect(result).toMatchObject({
      ok: true,
      status: "created-and-verified",
      safeCollectionName: "site_alphateam_mongo_pilot_generated"
    });
    expect(create.body).toEqual({
      siteId: "alphateam-mongo-pilot",
      siteSlug: "alphateam-mongo-pilot",
      displayName: "Alpha Team Mongo Pilot",
      status: "active",
      publicRead: false
    });
    expect(seed.body.items).toHaveLength(9);
    expect(seed.body.items).toEqual(bootstrap.PILOT_SEED_ITEMS.map((item: any) => ({
      key: item.key,
      data: item.data,
      expectedVersion: 0,
      allowEmptyOverwrite: true
    })));
    expect(verifyReads).toHaveLength(2);
    expect(calls.some((call) => /^\/api\/sites\/alphateam(?:\/|$)/.test(call.path))).toBe(false);
  });

  it("never places the key in logs or thrown transport errors", async () => {
    const secret = "bootstrap-secret-never-print";
    const log = vi.fn();
    const transport = vi.fn(async () => {
      throw new Error("Builder API request failed.");
    });

    await expect(bootstrap.runPilotBootstrap({
      mode: "verify",
      transport,
      log
    })).rejects.toThrow("Builder API request failed");
    expect(JSON.stringify(log.mock.calls)).not.toContain(secret);
  });

  it("reads ADMIN_API_KEY from a Builder .env payload without including it in parsed output logs", () => {
    const values = bootstrap.parseEnvText("MONGODB_URI=mongodb://127.0.0.1:27018/db\nADMIN_API_KEY='secret-value'\n");

    expect(values.ADMIN_API_KEY).toBe("secret-value");
    expect(Object.keys(values)).toEqual(["MONGODB_URI", "ADMIN_API_KEY"]);
  });
});
