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
  it("validates Mongo runtime config and redacts raw API keys", async () => {
    const site = siteDoc();
    mocks.Site.findById.mockResolvedValue(site);
    mocks.readSharePointTextFile.mockResolvedValue({
      path: "/sites/alphateam/siteDB/dist/sitebuilder-runtime-config.json",
      text: JSON.stringify({
        storageBackend: "mongo",
        backendApiUrl: "http://127.0.0.1:3001/private/path?token=secret",
        siteId: "alphateam",
        apiKey: "raw-secret-key"
      }),
      sizeBytes: 160
    });

    const { validateRuntimeConfig } = await import("../server/src/services/runtimeConfig.service");
    const result = await validateRuntimeConfig("hub-site-1");

    expect(result.readStatus).toBe("configured");
    expect(result.storageBackend).toBe("mongo");
    expect(result.backendApiUrlHost).toBe("http://127.0.0.1:3001");
    expect(result.apiKeyStatus).toBe("configured");
    expect(JSON.stringify(result)).not.toContain("raw-secret-key");
    expect(site.save).toHaveBeenCalled();
    expect(site.health.runtimeConfigExists).toBe(true);
    expect(site.health.runtimeConfigValid).toBe(true);
  });

  it("marks wrong siteId as a mismatch", async () => {
    const site = siteDoc();
    mocks.Site.findById.mockResolvedValue(site);
    mocks.readSharePointTextFile.mockResolvedValue({
      path: "/sites/alphateam/siteDB/dist/sitebuilder-runtime-config.json",
      text: JSON.stringify({
        storageBackend: "mongo",
        backendApiUrl: "http://127.0.0.1:3001",
        siteId: "other-site",
        apiKey: "raw-secret-key"
      }),
      sizeBytes: 120
    });

    const { validateRuntimeConfig } = await import("../server/src/services/runtimeConfig.service");
    const result = await validateRuntimeConfig("hub-site-1");

    expect(result.readStatus).toBe("mismatch");
    expect(result.belongsToSite).toBe(false);
    expect(result.warnings.join(" ")).toContain("siteId");
  });
});
