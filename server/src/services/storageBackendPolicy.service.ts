import { env } from "../config/env";

export type DeployedStorageBackend = "txt" | "mongo";
export type StorageBackendPolicySource =
  | "safe-production-default"
  | "environment:SITE_BUILDER_PRODUCTION_STORAGE_BACKEND";

export type ProductionStorageBackendPolicy = {
  storageBackend: DeployedStorageBackend;
  source: StorageBackendPolicySource;
  environmentVariable: "SITE_BUILDER_PRODUCTION_STORAGE_BACKEND";
  explicit: boolean;
};

export function resolveProductionStorageBackendPolicy(
  rawValue: unknown = env.SITE_BUILDER_PRODUCTION_STORAGE_BACKEND
): ProductionStorageBackendPolicy {
  const normalized = String(rawValue ?? "").trim();
  if (!normalized) {
    return {
      storageBackend: "txt",
      source: "safe-production-default",
      environmentVariable: "SITE_BUILDER_PRODUCTION_STORAGE_BACKEND",
      explicit: false
    };
  }
  if (normalized !== "txt" && normalized !== "mongo") {
    throw new Error(`invalid-production-storage-backend:${normalized}`);
  }
  return {
    storageBackend: normalized,
    source: "environment:SITE_BUILDER_PRODUCTION_STORAGE_BACKEND",
    environmentVariable: "SITE_BUILDER_PRODUCTION_STORAGE_BACKEND",
    explicit: true
  };
}
