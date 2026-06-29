import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetTestEnv } from "./setup/env";

const mocks = vi.hoisted(() => ({
  Site: {
    findById: vi.fn()
  },
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    isPayloadLoggingEnabled: vi.fn(() => false)
  }
}));

vi.mock("../server/src/models/Site", () => ({ Site: mocks.Site }));
vi.mock("../server/src/utils/logger", () => ({ logger: mocks.logger }));

const siteDoc = (overrides: Record<string, unknown> = {}) => ({
  _id: { toString: () => "hub-site-1" },
  siteCode: "alphateam",
  storageBackend: "mongo",
  backendApiUrl: "http://127.0.0.1:3001",
  builderApiKeyRef: "SITE_BUILDER_BACKEND_API_KEY",
  builderSiteId: "alphateam",
  mongoSiteId: "alphateam",
  safeCollectionName: "site_alphateam_123",
  health: {},
  save: vi.fn().mockResolvedValue(undefined),
  ...overrides
});

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });

beforeEach(() => {
  vi.resetModules();
  resetTestEnv({
    SITE_BUILDER_BACKEND_API_KEY: "builder-secret",
    SITE_BUILDER_BACKEND_API_URLS: "http://127.0.0.1:3001",
    SITE_BUILDER_BACKEND_DEFAULT_API_KEY_REF: "SITE_BUILDER_BACKEND_API_KEY"
  });
  mocks.Site.findById.mockReset();
});

describe("Builder Mongo backend health", () => {
  it("marks missing seed docs and does not mark Mongo site ready", async () => {
    const site = siteDoc();
    mocks.Site.findById.mockResolvedValue(site);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      expect(new Headers(init?.headers).get("X-API-Key")).toBe("builder-secret");
      if (url.endsWith("/api/healthz")) return jsonResponse({ ok: true, storageBackend: "mongo" });
      if (url.endsWith("/healthz") || url.endsWith("/api/health")) return jsonResponse({ ok: false }, 404);
      if (url.endsWith("/api/sites")) return jsonResponse({ ok: true, sites: [] });
      if (url.endsWith("/api/sites/alphateam")) {
        return jsonResponse({ ok: true, site: { siteId: "alphateam", safeCollectionName: "site_alphateam_123" } });
      }
      if (url.endsWith("/api/sites/alphateam/legacy/batch-read")) {
        return jsonResponse({
          ok: false,
          results: [
            { ok: true, key: "bihs_master_config_v1.txt", data: {}, version: 1 },
            { ok: false, key: "users_data.txt", error: "not_found", message: "missing" },
            { ok: true, key: "events_data.txt", data: [], version: 1 },
            { ok: true, key: "nav_data.txt", data: [], version: 1 },
            { ok: true, key: "site_content_data.txt", data: {}, version: 1 },
            { ok: true, key: "theme_data.txt", data: {}, version: 1 },
            { ok: true, key: "widgets_data.txt", data: {}, version: 1 },
            { ok: true, key: "external_links_data.txt", data: [], version: 1 },
            { ok: true, key: "gantt_data.txt", data: {}, version: 1 }
          ]
        }, 207);
      }
      if (url.endsWith("/api/sites/alphateam/backups")) return jsonResponse({ ok: true, backups: [] });
      return jsonResponse({ ok: false }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { runBuilderMongoHealthCheck } = await import("../server/src/services/builderMongoHealth.service");
    const result = await runBuilderMongoHealthCheck("hub-site-1");

    expect(result.backendReachable).toBe(true);
    expect(result.registryStatus).toBe("ok");
    expect(result.collectionStatus).toBe("ok");
    expect(result.seedStatus).toBe("partial");
    expect(result.missingDocs).toContain("users_data.txt");
    expect(site.health.mongoSeedOk).toBe(false);
    expect(site.dataBackendStatus).toBe("warning");
    expect(site.save).toHaveBeenCalled();
  });

  it("does not call the backend when the credential reference is missing", async () => {
    const site = siteDoc({ builderApiKeyRef: "MISSING_BUILDER_KEY" });
    mocks.Site.findById.mockResolvedValue(site);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { runBuilderMongoHealthCheck } = await import("../server/src/services/builderMongoHealth.service");
    const result = await runBuilderMongoHealthCheck("hub-site-1");

    expect(result.apiKeyConfigured).toBe(false);
    expect(result.backendReachable).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.warnings.join(" ")).toContain("credential");
  });

  it("does not call a backend outside the configured allowlist", async () => {
    resetTestEnv({
      SITE_BUILDER_BACKEND_API_KEY: "builder-secret",
      SITE_BUILDER_BACKEND_API_URLS: "http://127.0.0.1:3001",
      SITE_BUILDER_BACKEND_DEFAULT_API_KEY_REF: "SITE_BUILDER_BACKEND_API_KEY"
    });
    const site = siteDoc({ backendApiUrl: "https://unexpected.example.com" });
    mocks.Site.findById.mockResolvedValue(site);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { runBuilderMongoHealthCheck } = await import("../server/src/services/builderMongoHealth.service");
    const result = await runBuilderMongoHealthCheck("hub-site-1");

    expect(result.backendReachable).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.warnings.join(" ")).toContain("רשימת הכתובות המותרות");
    expect(site.dataBackendStatus).toBe("failed");
  });
});
