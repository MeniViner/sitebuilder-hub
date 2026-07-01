import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetTestEnv } from "./setup/env";

const mocks = vi.hoisted(() => ({
  Site: {
    findById: vi.fn(),
    findOne: vi.fn()
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
  displayName: "Alpha Team",
  environment: "dev",
  sharePointHost: "portal.army.idf",
  sharePointSiteUrl: "https://portal.army.idf/sites/main-site/subsite",
  siteDbLibrary: "siteDB",
  usersDbLibrary: "siteUsersDb",
  bootstrapLibrary: "SiteAssets",
  bootstrapFolder: "sitebuilder-bootstrap",
  widgetsDbTarget: "users",
  runtimeConfigPath: "/sites/main-site/subsite/siteDB/dist/sitebuilder-runtime-config.json",
  storageBackend: "mongo",
  creationMode: "create-new",
  lifecycleStatus: "planned",
  provisioningStatus: "planned",
  backendApiUrl: "http://127.0.0.1:3001",
  builderApiKeyRef: "SITE_BUILDER_BACKEND_API_KEY",
  builderSiteId: "alphateam",
  mongoSiteId: "alphateam",
  safeCollectionName: "",
  ownerName: "Owner",
  ownerPersonalNumber: "1234567",
  ownerEmail: "owner@example.com",
  txtAdmins: [{ displayName: "Admin", personalNumber: "7654321", email: "admin@example.com" }],
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
  mocks.Site.findOne.mockReset();
});

describe("Mongo-native site creation planning", () => {
  it("builds a plan with exact physical paths, Mongo backend steps, runtime config, seed docs, and no raw API key", async () => {
    mocks.Site.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const { buildMongoSiteCreationPlanFromInput } = await import("../server/src/services/mongoSiteCreation.service");

    const plan = await buildMongoSiteCreationPlanFromInput(siteDoc());

    expect(plan.storageBackend).toBe("mongo");
    expect(plan.identity.builderSiteId).toBe("alphateam");
    expect(plan.resolvedPaths.siteRoot).toBe("/sites/main-site/subsite");
    expect(plan.runtimeConfig.path).toBe("/sites/main-site/subsite/siteDB/dist/sitebuilder-runtime-config.json");
    expect(plan.sharePointHosting.siteDbTarget).toBe("/sites/main-site/subsite/siteDB");
    expect(plan.sharePointHosting.siteUsersDbTarget).toBe("/sites/main-site/subsite/siteUsersDb");
    expect(plan.sharePointHosting.siteDbUsersDbSameTarget).toBe(false);
    expect(plan.steps.findIndex((step) => step.key === "sharepoint-library-site-db")).toBeLessThan(
      plan.steps.findIndex((step) => step.key === "builder-registry")
    );
    expect(plan.steps.findIndex((step) => step.key === "sharepoint-folder-dist")).toBeLessThan(
      plan.steps.findIndex((step) => step.key === "initial-browser-deploy")
    );
    expect(plan.steps.some((step) => step.key === "builder-registry" && step.executionClass === "mongo-backend")).toBe(true);
    expect(plan.steps.some((step) => step.key === "runtime-config-upload" && step.executionClass === "browser-sharepoint")).toBe(true);
    expect(plan.steps.find((step) => step.key === "initial-browser-deploy")).toMatchObject({
      executionClass: "browser-sharepoint",
      status: "blocked"
    });
    expect(plan.seedDocs.map((doc) => doc.key)).toEqual(expect.arrayContaining([
      "bihs_master_config_v1.txt",
      "users_data.txt",
      "events_data.txt",
      "nav_data.txt",
      "site_content_data.txt",
      "theme_data.txt",
      "widgets_data.txt",
      "external_links_data.txt",
      "gantt_data.txt"
    ]));
    expect(JSON.stringify(plan)).not.toContain("builder-secret");
    expect(plan.summary.createsApprovalJob).toBe(false);
  });

  it("supports using the same physical library for siteDB and siteUsersDb", async () => {
    mocks.Site.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const { buildMongoSiteCreationPlanFromInput } = await import("../server/src/services/mongoSiteCreation.service");

    const plan = await buildMongoSiteCreationPlanFromInput(siteDoc({
      usersDbLibrary: "siteDB"
    }));

    expect(plan.sharePointHosting.siteDbUsersDbSameTarget).toBe(true);
    expect(plan.sharePointHosting.siteDbTarget).toBe(plan.sharePointHosting.siteUsersDbTarget);
    expect(plan.steps.find((step) => step.key === "sharepoint-library-users-db")).toMatchObject({
      status: "skipped",
      warning: "same-library-as-siteDB"
    });
  });

  it("keeps separate siteDB and siteUsersDb targets distinct in the creation plan", async () => {
    mocks.Site.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const { buildMongoSiteCreationPlanFromInput } = await import("../server/src/services/mongoSiteCreation.service");

    const plan = await buildMongoSiteCreationPlanFromInput(siteDoc({
      siteDbLibrary: "siteDB",
      usersDbLibrary: "siteUsersDb"
    }));

    expect(plan.sharePointHosting.siteDbUsersDbSameTarget).toBe(false);
    expect(plan.sharePointHosting.siteDbTarget).not.toBe(plan.sharePointHosting.siteUsersDbTarget);
    expect(plan.steps.find((step) => step.key === "sharepoint-library-users-db")).toMatchObject({
      status: "planned",
      executionClass: "browser-sharepoint"
    });
  });

  it("warns through blockers when the same physical/runtime identity already exists", async () => {
    mocks.Site.findOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: "existing-1",
        siteCode: "alphateam",
        displayName: "Existing Alpha",
        sharePointSiteUrl: "https://portal.army.idf/sites/main-site/subsite",
        runtimeConfigPath: "/sites/main-site/subsite/siteDB/dist/sitebuilder-runtime-config.json",
        storageBackend: "mongo",
        builderSiteId: "alphateam",
        mongoSiteId: "alphateam",
        safeCollectionName: "site_alpha_existing"
      })
    });
    const { buildMongoSiteCreationPlanFromInput } = await import("../server/src/services/mongoSiteCreation.service");

    const plan = await buildMongoSiteCreationPlanFromInput(siteDoc());

    expect(plan.identity.duplicateStatus).toBe("duplicate");
    expect(plan.blockers).toContain("site-physical-runtime-identity-duplicate");
  });
});

describe("Mongo-native site creation execution", () => {
  it("creates Builder registry, writes missing seed docs, verifies safe collection, and keeps site partially-created", async () => {
    const site = siteDoc();
    mocks.Site.findById.mockResolvedValue(site);
    mocks.Site.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    let batchReadCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      expect(new Headers(init?.headers).get("X-API-Key")).toBe("builder-secret");
      if (url.endsWith("/api/sites") && init?.method === "POST") {
        return jsonResponse({ ok: true, site: { siteId: "alphateam", safeCollectionName: "site_alphateam_123" } }, 201);
      }
      if (url.endsWith("/api/healthz")) return jsonResponse({ ok: true });
      if (url.endsWith("/healthz") || url.endsWith("/api/health")) return jsonResponse({ ok: false }, 404);
      if (url.endsWith("/api/sites")) return jsonResponse({ ok: true, sites: [] });
      if (url.endsWith("/api/sites/alphateam")) {
        return jsonResponse({ ok: true, site: { siteId: "alphateam", safeCollectionName: "site_alphateam_123" } });
      }
      if (url.endsWith("/api/sites/alphateam/legacy/batch-read")) {
        batchReadCount += 1;
        const keys = [
          "bihs_master_config_v1.txt",
          "users_data.txt",
          "events_data.txt",
          "nav_data.txt",
          "site_content_data.txt",
          "theme_data.txt",
          "widgets_data.txt",
          "external_links_data.txt",
          "gantt_data.txt"
        ];
        return jsonResponse({
          ok: batchReadCount > 1,
          results: keys.map((key) => batchReadCount > 1 ? { ok: true, key, data: {}, version: 1 } : { ok: false, key, error: "not_found", message: "missing" })
        });
      }
      if (url.endsWith("/api/sites/alphateam/legacy/batch-write")) {
        const body = JSON.parse(String(init?.body || "{}"));
        return jsonResponse({ ok: true, results: body.items.map((item: { key: string }) => ({ ok: true, key: item.key, version: 1 })) });
      }
      if (url.endsWith("/api/sites/alphateam/backups")) return jsonResponse({ ok: true, backups: [] });
      return jsonResponse({ ok: false }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { executeMongoSiteCreation } = await import("../server/src/services/mongoSiteCreation.service");
    const result = await executeMongoSiteCreation("hub-site-1");

    expect(result.registry.status).toBe("ok");
    expect(result.registry.safeCollectionName).toBe("site_alphateam_123");
    expect(result.seed.status).toBe("ok");
    expect(result.seed.written).toContain("users_data.txt");
    expect(site.safeCollectionName).toBe("site_alphateam_123");
    expect(site.lifecycleStatus).toBe("partially-created");
    expect(site.status).toBe("draft");
    expect(site.health.mongoSeedOk).toBe(true);
  });

  it("does not mark a Mongo site ready when siteUsersDb is missing", async () => {
    const site = siteDoc({
      health: {
        siteDbExists: true,
        usersDbExists: false,
        distExists: true,
        indexExists: true,
        runtimeConfigExists: true,
        runtimeConfigValid: true,
        mongoSeedOk: true,
        mongoBackupsOk: true
      }
    });
    mocks.Site.findById.mockResolvedValue(site);
    const { recordMongoCreateBrowserEvidence } = await import("../server/src/services/mongoSiteCreation.service");

    await recordMongoCreateBrowserEvidence("hub-site-1", {
      connectorMode: "browser-sharepoint",
      targetSharePointSiteUrl: site.sharePointSiteUrl,
      runtimeConfig: {
        path: site.runtimeConfigPath,
        uploaded: true,
        verified: true,
        storageBackend: "mongo",
        backendApiUrlHost: "http://127.0.0.1:3001",
        siteId: "alphateam",
        apiKeyConfigured: true
      },
      hosting: {
        siteDbRootReady: true,
        usersDbRootReady: false,
        finalDistRootReady: true,
        siteAssetsRootReady: true,
        assetsFolderReady: true,
        indexHtmlVerified: true
      }
    });

    expect(site.health.usersDbExists).toBe(false);
    expect(site.lifecycleStatus).toBe("partially-created");
    expect(site.provisioningStatus).toBe("partially-created");
    expect(site.status).toBe("draft");
  });
});

describe("TXT to Mongo migration", () => {
  const legacyKeys = [
    "bihs_master_config_v1.txt",
    "users_data.txt",
    "events_data.txt",
    "nav_data.txt",
    "site_content_data.txt",
    "theme_data.txt",
    "widgets_data.txt",
    "external_links_data.txt",
    "gantt_data.txt"
  ];

  const dataForKey = (key: string) => {
    if (key === "users_data.txt") return [{ id: "admin-1", name: "Admin One" }];
    if (key === "events_data.txt") return { displayCount: 1, displayMode: "default", events: [{ id: "event-1", title: "Existing event" }] };
    if (key === "nav_data.txt") return [{ id: "home", label: "Home" }];
    if (key === "external_links_data.txt") return [];
    return {};
  };

  it("imports browser-read TXT snapshot into Builder Mongo and switches the site to Mongo", async () => {
    const site = siteDoc({
      storageBackend: "txt",
      creationMode: "track-existing",
      health: {
        siteDbExists: true,
        usersDbExists: true,
        distExists: true,
        indexExists: true,
        txtFilesExist: true
      }
    });
    mocks.Site.findById.mockResolvedValue(site);
    mocks.Site.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const batchWriteBodies: any[] = [];
    let batchReadCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      expect(new Headers(init?.headers).get("X-API-Key")).toBe("builder-secret");
      if (url.endsWith("/api/sites") && init?.method === "POST") {
        return jsonResponse({ ok: true, site: { siteId: "alphateam", safeCollectionName: "site_alphateam_123" } }, 201);
      }
      if (url.endsWith("/api/healthz")) return jsonResponse({ ok: true });
      if (url.endsWith("/healthz") || url.endsWith("/api/health")) return jsonResponse({ ok: false }, 404);
      if (url.endsWith("/api/sites")) return jsonResponse({ ok: true, sites: [] });
      if (url.endsWith("/api/sites/alphateam")) {
        return jsonResponse({ ok: true, site: { siteId: "alphateam", safeCollectionName: "site_alphateam_123" } });
      }
      if (url.endsWith("/api/sites/alphateam/legacy/batch-read")) {
        batchReadCount += 1;
        return jsonResponse({
          ok: true,
          results: legacyKeys.map((key) => ({
            ok: true,
            key,
            data: dataForKey(key),
            version: batchReadCount === 1 && key === "users_data.txt" ? 7 : 0
          }))
        });
      }
      if (url.endsWith("/api/sites/alphateam/legacy/batch-write")) {
        const body = JSON.parse(String(init?.body || "{}"));
        batchWriteBodies.push(body);
        return jsonResponse({ ok: true, results: body.items.map((item: { key: string }) => ({ ok: true, key: item.key, version: 1 })) });
      }
      if (url.endsWith("/api/sites/alphateam/backups")) return jsonResponse({ ok: true, backups: [] });
      return jsonResponse({ ok: false }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { executeTxtToMongoMigration } = await import("../server/src/services/mongoSiteCreation.service");
    const result = await executeTxtToMongoMigration("hub-site-1", {
      connectorMode: "browser-sharepoint",
      sourceSharePointSiteUrl: site.sharePointSiteUrl,
      files: legacyKeys.map((key) => ({
        key,
        fileName: key,
        sourcePath: `/sites/main-site/subsite/siteDB/siteAssets/${key}`,
        exists: true,
        status: "read",
        data: dataForKey(key),
        parseStatus: "json"
      }))
    });

    expect(result.finalStatus).toBe("runtime-config-required");
    expect(result.import.status).toBe("ok");
    expect(result.import.written).toEqual(expect.arrayContaining(legacyKeys));
    expect(site.storageBackend).toBe("mongo");
    expect(site.creationMode).toBe("migration");
    expect(site.authoritativeAdminSource).toBe("mongo");
    expect(site.safeCollectionName).toBe("site_alphateam_123");
    expect(batchWriteBodies).toHaveLength(1);
    expect(batchWriteBodies[0].items.find((item: any) => item.key === "users_data.txt")).toMatchObject({
      expectedVersion: 7,
      allowEmptyOverwrite: true,
      data: [{ id: "admin-1", name: "Admin One" }]
    });
  });

  it("blocks migration when a required TXT file is missing from the browser snapshot", async () => {
    const site = siteDoc({ storageBackend: "txt" });
    mocks.Site.findById.mockResolvedValue(site);
    const { executeTxtToMongoMigration } = await import("../server/src/services/mongoSiteCreation.service");

    await expect(executeTxtToMongoMigration("hub-site-1", {
      connectorMode: "browser-sharepoint",
      sourceSharePointSiteUrl: site.sharePointSiteUrl,
      files: legacyKeys.filter((key) => key !== "users_data.txt").map((key) => ({
        key,
        fileName: key,
        sourcePath: `/sites/main-site/subsite/siteDB/siteAssets/${key}`,
        exists: true,
        status: "read",
        data: dataForKey(key),
        parseStatus: "json"
      }))
    })).rejects.toThrow("txt-to-mongo-migration-snapshot-invalid");
  });
});
