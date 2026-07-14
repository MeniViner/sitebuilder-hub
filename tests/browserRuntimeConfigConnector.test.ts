import { afterEach, describe, expect, it, vi } from "vitest";
import type { Site } from "../client/src/types/site";
import { readBrowserRuntimeConfig } from "../client/src/utils/sharepointBrowserSiteOperations";

const makeMongoSite = (): Site => ({
  _id: "site-alpha",
  siteCode: "alpha",
  displayName: "Alpha",
  sharePointHost: "portal.army.idf",
  sharePointSiteUrl: "https://portal.army.idf/sites/alpha",
  siteDbLibrary: "siteDB",
  usersDbLibrary: "siteUsersDb",
  bootstrapLibrary: "SiteAssets",
  bootstrapFolder: "sitebuilder-bootstrap",
  widgetsDbTarget: "users",
  storageBackend: "mongo",
  builderSiteId: "alpha",
  runtimeConfigPath: "/sites/alpha/siteDB/dist/sitebuilder-runtime-config.json",
  status: "active",
  createdAt: "2026-06-16T00:00:00.000Z",
  updatedAt: "2026-06-16T00:00:00.000Z",
  derivedHealthStatus: "unknown"
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("browser runtime config connector", () => {
  it("reads runtime config from the exact target SharePoint site with credentials include", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      storageBackend: "mongo",
      backendApiUrl: "https://builder.example.local/api",
      builderSiteId: "alpha",
      apiKey: "raw-secret-that-must-not-return"
    }), {
      status: 200,
      statusText: "OK",
      headers: { "Content-Type": "application/json" }
    }));
    vi.stubGlobal("fetch", fetchSpy);

    const result = await readBrowserRuntimeConfig(makeMongoSite());

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://portal.army.idf/sites/alpha/siteDB/dist/sitebuilder-runtime-config.json",
      expect.objectContaining({
        method: "GET",
        credentials: "include",
        cache: "no-store"
      })
    );
    expect(result.connectorMode).toBe("browser-sharepoint");
    expect(result.readStatus).toBe("configured");
    expect(result.storageBackend).toBe("mongo");
    expect(result.backendApiUrlHost).toBe("https://builder.example.local");
    expect(result.apiKeyStatus).toBe("configured");
    expect(JSON.stringify(result)).not.toContain("raw-secret-that-must-not-return");
  });
});
