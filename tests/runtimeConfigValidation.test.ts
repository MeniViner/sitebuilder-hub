import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  Site: {
    findById: vi.fn()
  },
  readSharePointTextFile: vi.fn(),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    isPayloadLoggingEnabled: vi.fn(() => false)
  }
}));

vi.mock("../server/src/models/Site", () => ({ Site: mocks.Site }));
vi.mock("../server/src/services/sharepointOperationClient", () => ({
  readSharePointTextFile: mocks.readSharePointTextFile
}));
vi.mock("../server/src/utils/logger", () => ({ logger: mocks.logger }));

const siteDoc = (overrides: Record<string, unknown> = {}) => ({
  _id: { toString: () => "hub-site-1" },
  siteCode: "alphateam",
  displayName: "Alpha Team",
  sharePointHost: "portal.army.idf",
  sharePointSiteUrl: "https://portal.army.idf/sites/alphateam",
  siteDbLibrary: "siteDB",
  usersDbLibrary: "siteUsersDb",
  bootstrapLibrary: "SiteAssets",
  bootstrapFolder: "sitebuilder-bootstrap",
  widgetsDbTarget: "users",
  storageBackend: "mongo",
  builderSiteId: "alphateam",
  mongoSiteId: "alphateam",
  builderApiKeyRef: "SITE_BUILDER_BACKEND_API_KEY",
  health: {},
  save: vi.fn().mockResolvedValue(undefined),
  ...overrides
});

beforeEach(() => {
  vi.resetModules();
  mocks.Site.findById.mockReset();
  mocks.readSharePointTextFile.mockReset();
});

describe("runtime config validation", () => {
  it("returns stored browser runtime config evidence and keeps raw API keys redacted", async () => {
    const site = siteDoc({
      runtimeConfigStatus: {
        path: "/sites/alphateam/siteDB/dist/sitebuilder-runtime-config.json",
        url: "https://portal.army.idf/sites/alphateam/siteDB/dist/sitebuilder-runtime-config.json",
        readStatus: "configured",
        storageBackend: "mongo",
        backendApiUrl: "http://127.0.0.1:3001",
        backendApiUrlHost: "http://127.0.0.1:3001",
        builderSiteId: "alphateam",
        apiKeyStatus: "configured",
        belongsToSite: true,
        warnings: [],
        checkedAt: new Date("2026-06-30T10:00:00.000Z"),
        evidence: {
          connectorMode: "browser-sharepoint",
          selectedPath: "/sites/alphateam/siteDB/dist/sitebuilder-runtime-config.json",
          sizeBytes: 160
        }
      }
    });
    mocks.Site.findById.mockResolvedValue(site);

    const { validateRuntimeConfig } = await import("../server/src/services/runtimeConfig.service");
    const result = await validateRuntimeConfig("hub-site-1");

    expect(result.readStatus).toBe("configured");
    expect(result.storageBackend).toBe("mongo");
    expect(result.backendApiUrlHost).toBe("http://127.0.0.1:3001");
    expect(result.apiKeyStatus).toBe("configured");
    expect(JSON.stringify(result)).not.toContain("raw-secret-key");
    expect(result.evidence.connectorMode).toBe("browser-sharepoint");
    expect(mocks.readSharePointTextFile).not.toHaveBeenCalled();
    expect(site.save).not.toHaveBeenCalled();
  });

  it("returns browser-required when no browser runtime config evidence was recorded", async () => {
    const site = siteDoc();
    mocks.Site.findById.mockResolvedValue(site);

    const { validateRuntimeConfig } = await import("../server/src/services/runtimeConfig.service");
    const result = await validateRuntimeConfig("hub-site-1");

    expect(result.readStatus).toBe("browser-required");
    expect(result.belongsToSite).toBe(false);
    expect(result.warnings.join(" ")).toContain("נדרש רענון runtime config דרך Browser SharePoint");
    expect(result.evidence.connectorMode).toBe("browser-sharepoint");
    expect(mocks.readSharePointTextFile).not.toHaveBeenCalled();
    expect(site.save).not.toHaveBeenCalled();
  });

  it("preserves last good browser evidence when a later browser refresh fails", async () => {
    const site = siteDoc({
      runtimeConfigStatus: {
        path: "/sites/alphateam/siteDB/dist/sitebuilder-runtime-config.json",
        url: "https://portal.army.idf/sites/alphateam/siteDB/dist/sitebuilder-runtime-config.json",
        readStatus: "configured",
        storageBackend: "mongo",
        backendApiUrl: "https://builder.example.local",
        backendApiUrlHost: "https://builder.example.local",
        builderSiteId: "alphateam",
        apiKeyStatus: "configured",
        belongsToSite: true,
        warnings: [],
        checkedAt: new Date("2026-06-30T10:00:00.000Z"),
        evidence: {
          connectorMode: "browser-sharepoint",
          selectedPath: "/sites/alphateam/siteDB/dist/sitebuilder-runtime-config.json",
          ok: true
        }
      }
    });
    mocks.Site.findById.mockResolvedValue(site);

    const { recordBrowserRuntimeConfigEvidence } = await import("../server/src/services/runtimeConfig.service");
    const result = await recordBrowserRuntimeConfigEvidence("hub-site-1", {
      checkedAt: "2026-07-01T08:00:00.000Z",
      runtimeConfigPath: "/sites/alphateam/siteDB/dist/sitebuilder-runtime-config.json",
      readStatus: "auth-blocked",
      storageBackend: "",
      backendApiUrl: "",
      backendApiUrlHost: "",
      builderSiteId: "",
      apiKeyStatus: "unknown",
      belongsToSite: false,
      warnings: ["SharePoint החזיר 401/403 לדפדפן"],
      evidence: {
        connectorMode: "browser-sharepoint",
        selectedPath: "/sites/alphateam/siteDB/dist/sitebuilder-runtime-config.json",
        authBlocked: true,
        ok: false,
        error: "sharepoint-read-failed:401"
      }
    });

    expect(result.readStatus).toBe("configured");
    expect(result.preservedLastGoodEvidence).toBe(true);
    expect(result.refreshFailure?.readStatus).toBe("auth-blocked");
    expect(result.refreshFailure?.evidence.connectorMode).toBe("browser-sharepoint");
    expect(mocks.readSharePointTextFile).not.toHaveBeenCalled();
    expect(site.save).not.toHaveBeenCalled();
  });
});
