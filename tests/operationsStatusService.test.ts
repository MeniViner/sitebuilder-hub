import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  Site: {
    find: vi.fn()
  },
  getMongoStatus: vi.fn(() => "connected"),
  getBuilderBackendRuntimeSettings: vi.fn(() => ({
    defaultBuilderBackendApiUrl: "https://builder.example.local/api",
    defaultBuilderApiKeyRef: "SITE_BUILDER_BACKEND_API_KEY",
    builderBackendOptions: [{
      backendApiUrl: "https://builder.example.local/api",
      backendApiUrlHost: "https://builder.example.local",
      label: "Builder",
      environment: "production",
      allowed: true,
      default: true,
      credentialConfigured: true,
      credentialRef: "SITE_BUILDER_BACKEND_API_KEY"
    }]
  })),
  getSharePointOperationCapabilities: vi.fn(),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

vi.mock("../server/src/models/Site", () => ({ Site: mocks.Site }));
vi.mock("../server/src/db/mongo", () => ({ getMongoStatus: mocks.getMongoStatus }));
vi.mock("../server/src/services/builderMongoHealth.service", () => ({
  getBuilderBackendRuntimeSettings: mocks.getBuilderBackendRuntimeSettings
}));
vi.mock("../server/src/services/sharepointOperationClient", () => ({
  getSharePointOperationCapabilities: mocks.getSharePointOperationCapabilities
}));
vi.mock("../server/src/utils/logger", () => ({ logger: mocks.logger }));
vi.mock("../server/src/services/dangerousBackupBypass.service", () => ({ getActiveDangerousValidationBypasses: vi.fn(() => []) }));
vi.mock("../server/src/services/sharepointOperationPolicy.service", () => ({ getSharePointOperationInventory: vi.fn(() => []) }));

beforeEach(() => {
  vi.resetModules();
  mocks.Site.find.mockReset();
  mocks.getMongoStatus.mockClear();
  mocks.getBuilderBackendRuntimeSettings.mockClear();
  mocks.getSharePointOperationCapabilities.mockClear();
});

describe("operations status snapshot", () => {
  it("uses stored browser evidence and keeps Builder backend failure separate from SharePoint", async () => {
    mocks.Site.find.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          _id: { toString: () => "site-mongo" },
          siteCode: "alpha",
          storageBackend: "mongo",
          sharePointSiteUrl: "https://portal.army.idf/sites/alpha",
          runtimeConfigStatus: {
            checkedAt: new Date("2026-07-02T08:00:00.000Z"),
            readStatus: "configured",
            evidence: { connectorMode: "browser-sharepoint" }
          },
          mongoBackendStatus: {
            checkedAt: new Date("2026-07-02T08:01:00.000Z"),
            backendReachable: false,
            backendApiUrlHost: "https://builder.example.local"
          }
        }
      ])
    });

    const { getOperationsStatus } = await import("../server/src/services/operations.service");
    const status = await getOperationsStatus({
      role: "operator",
      source: "sharepoint",
      identityMode: "sharepoint-user",
      loginName: "i:0#.f|membership|user@example.test"
    } as any);

    expect(status.hubApi.status).toBe("connected");
    expect(status.hubMongo.status).toBe("connected");
    expect(status.browserSharePoint.status).toBe("connected");
    expect(status.browserSharePoint.message).toContain("Browser SharePoint");
    expect(status.builderBackend.status).toBe("failed");
    expect(status.currentIdentity.mode).toBe("sharepoint-user");
    expect(status.operationMode.legacyBackendSharePointAvailable).toBe(false);
    expect(status.dataSourceMatrix.mongo.hostingRuntimeConfig).toBe("browser-sharepoint");
    expect(mocks.getSharePointOperationCapabilities).not.toHaveBeenCalled();
  });
});
