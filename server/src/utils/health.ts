import { SiteHealth } from "../models/Site";

export type DerivedHealthStatus = "healthy" | "warning" | "failed" | "unknown";

const criticalKeys: Array<keyof SiteHealth> = ["siteDbExists", "usersDbExists", "distExists", "indexExists"];
const nonCriticalKeys: Array<keyof SiteHealth> = ["assetsExists", "txtFilesExist", "adminsSyncOk", "permissionsOk"];

export function deriveHealthStatus(health?: Partial<SiteHealth>, lastHealthCheckAt?: Date | string | null): DerivedHealthStatus {
  if (!lastHealthCheckAt) return "unknown";
  if (!health) return "unknown";

  const hasCriticalFailure = criticalKeys.some((key) => health[key] === false);
  if (hasCriticalFailure) return "failed";

  const hasMissingNonCritical = nonCriticalKeys.some((key) => health[key] === false);
  if (hasMissingNonCritical) return "warning";

  const allKnownTrue = [...criticalKeys, ...nonCriticalKeys].every((key) => health[key] === true);
  return allKnownTrue ? "healthy" : "warning";
}
