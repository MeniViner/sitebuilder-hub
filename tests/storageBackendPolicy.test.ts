import { describe, expect, it } from "vitest";
import { resolveProductionStorageBackendPolicy } from "../server/src/services/storageBackendPolicy.service";

describe("production storage backend policy", () => {
  it("keeps production on TXT when the environment selector is missing", () => {
    expect(resolveProductionStorageBackendPolicy(undefined)).toEqual(expect.objectContaining({
      storageBackend: "txt",
      source: "safe-production-default",
      explicit: false
    }));
  });

  it("selects Mongo only when production explicitly says mongo", () => {
    expect(resolveProductionStorageBackendPolicy("mongo")).toEqual(expect.objectContaining({
      storageBackend: "mongo",
      source: "environment:SITE_BUILDER_PRODUCTION_STORAGE_BACKEND",
      explicit: true
    }));
  });

  it("blocks invalid explicit values", () => {
    expect(() => resolveProductionStorageBackendPolicy("unknown")).toThrow("invalid-production-storage-backend:unknown");
    expect(() => resolveProductionStorageBackendPolicy("local-dev")).toThrow("invalid-production-storage-backend:local-dev");
    expect(() => resolveProductionStorageBackendPolicy("MONGO")).toThrow("invalid-production-storage-backend:MONGO");
  });
});
