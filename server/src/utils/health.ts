import { SiteHealth } from "../models/Site";

export type DerivedHealthStatus = "healthy" | "warning" | "failed" | "unknown";
export type StorageBackend = "txt" | "mongo" | "unknown" | string;

const criticalKeys: Array<keyof SiteHealth> = ["siteDbExists", "usersDbExists", "distExists", "indexExists"];
const nonCriticalKeys: Array<keyof SiteHealth> = ["assetsExists", "txtFilesExist", "adminsSyncOk", "permissionsOk"];
const mongoCriticalKeys: Array<keyof SiteHealth> = [
  "siteDbExists",
  "usersDbExists",
  "distExists",
  "indexExists",
  "runtimeConfigExists",
  "runtimeConfigValid",
  "dataBackendReachable",
  "mongoRegistryOk",
  "mongoCollectionOk",
  "mongoSeedOk"
];
const mongoNonCriticalKeys: Array<keyof SiteHealth> = ["assetsExists", "mongoBackupsOk", "mongoRevisionsAuditOk", "adminsSyncOk", "permissionsOk"];

const txtCriticalKeys: Array<keyof SiteHealth> = [...criticalKeys, "txtFilesExist"];

export function deriveHealthStatus(
  health?: Partial<SiteHealth>,
  lastHealthCheckAt?: Date | string | null,
  storageBackend: StorageBackend = "unknown"
): DerivedHealthStatus {
  if (!lastHealthCheckAt) return "unknown";
  if (!health) return "unknown";

  const normalizedBackend = String(storageBackend || "unknown").toLowerCase();
  const activeCriticalKeys = normalizedBackend === "mongo" ? mongoCriticalKeys : normalizedBackend === "txt" ? txtCriticalKeys : criticalKeys;
  const activeNonCriticalKeys = normalizedBackend === "mongo" ? mongoNonCriticalKeys : nonCriticalKeys;

  const hasCriticalFailure = activeCriticalKeys.some((key) => health[key] === false);
  if (hasCriticalFailure) return "failed";

  const hasMissingNonCritical = activeNonCriticalKeys.some((key) => health[key] === false);
  if (hasMissingNonCritical) return "warning";

  const allKnownTrue = [...activeCriticalKeys, ...activeNonCriticalKeys].every((key) => health[key] === true);
  return allKnownTrue ? "healthy" : "warning";
}
