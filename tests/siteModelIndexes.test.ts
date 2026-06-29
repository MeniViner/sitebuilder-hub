import { describe, expect, it } from "vitest";
import { Site } from "../server/src/models/Site";

describe("Site model indexes", () => {
  it("does not enforce global uniqueness on siteCode", () => {
    const siteCodePath = Site.schema.path("siteCode") as { options?: { unique?: boolean } };

    expect(siteCodePath.options?.unique).not.toBe(true);
    expect(Site.schema.indexes()).toEqual(
      expect.arrayContaining([
        [{ siteCode: 1 }, expect.not.objectContaining({ unique: true })]
      ])
    );
  });

  it("enforces uniqueness on the resolved site identity key", () => {
    expect(Site.schema.indexes()).toEqual(
      expect.arrayContaining([
        [
          { siteIdentityKey: 1 },
          expect.objectContaining({
            unique: true,
            name: "siteIdentityKey_1"
          })
        ]
      ])
    );
  });

  it("stores storage backend and runtime/Mongo status fields", () => {
    const storageBackendPath = Site.schema.path("storageBackend") as { options?: { enum?: string[]; default?: string } };
    const builderSiteIdPath = Site.schema.path("builderSiteId");
    const runtimeConfigPath = Site.schema.path("runtimeConfigStatus");
    const mongoBackendPath = Site.schema.path("mongoBackendStatus");

    expect(storageBackendPath.options?.enum).toEqual(expect.arrayContaining(["txt", "mongo", "unknown"]));
    expect(storageBackendPath.options?.default).toBe("unknown");
    expect(builderSiteIdPath).toBeTruthy();
    expect(runtimeConfigPath).toBeTruthy();
    expect(mongoBackendPath).toBeTruthy();
  });

  it("indexes storage backend and Mongo identity without making siteCode unique", () => {
    expect(Site.schema.indexes()).toEqual(
      expect.arrayContaining([
        [{ storageBackend: 1, updatedAt: -1 }, expect.any(Object)],
        [{ builderSiteId: 1 }, expect.any(Object)],
        [{ mongoSiteId: 1, safeCollectionName: 1 }, expect.any(Object)]
      ])
    );
  });
});
