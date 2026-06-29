import { describe, expect, it } from "vitest";
import { createSiteSchema } from "../server/src/validators/site.schema";

describe("storage backend site validation", () => {
  it("accepts Mongo-backed managed site metadata without a raw API key", () => {
    const parsed = createSiteSchema.parse({
      siteCode: "alphateam",
      displayName: "Alpha Team",
      sharePointSiteUrl: "https://portal.army.idf/sites/alphateam",
      storageBackend: "mongo",
      builderSiteId: "alphateam",
      mongoSiteId: "alphateam",
      safeCollectionName: "site_alphateam_123",
      backendApiUrl: "http://127.0.0.1:3001",
      builderApiKeyRef: "SITE_BUILDER_BACKEND_API_KEY",
      runtimeConfigPath: "/sites/alphateam/siteDB/dist/sitebuilder-runtime-config.json",
      runtimeConfigStatus: {
        readStatus: "configured",
        storageBackend: "mongo",
        apiKeyStatus: "configured"
      },
      mongoBackendStatus: {
        registryStatus: "ok",
        collectionStatus: "ok",
        seedStatus: "ok",
        safeCollectionName: "site_alphateam_123"
      }
    });

    expect(parsed.storageBackend).toBe("mongo");
    expect(parsed.builderApiKeyRef).toBe("SITE_BUILDER_BACKEND_API_KEY");
    expect(JSON.stringify(parsed)).not.toContain("dev-local-api-key");
  });

  it("rejects unsupported storage backends", () => {
    expect(() => createSiteSchema.parse({
      siteCode: "alphateam",
      displayName: "Alpha Team",
      sharePointSiteUrl: "https://portal.army.idf/sites/alphateam",
      storageBackend: "sharepoint-list"
    })).toThrow();
  });
});
