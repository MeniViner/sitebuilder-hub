import { Site } from "../models/Site";
import { resolveSiteBuilderPaths, SiteBuilderResolvedPaths } from "../utils/sitebuilderPaths";
import { logger } from "../utils/logger";

type RuntimeConfigReadStatus = "unknown" | "configured" | "missing" | "invalid" | "mismatch" | "auth-blocked" | "error" | "browser-required";
type RuntimeConfigApiKeyStatus = "unknown" | "configured" | "missing" | "invalid";

export type RuntimeConfigValidationResult = {
  checkedAt: string;
  siteId: string;
  siteCode: string;
  runtimeConfigPath: string;
  runtimeConfigUrl: string;
  readStatus: RuntimeConfigReadStatus;
  storageBackend: "txt" | "mongo" | "unknown" | "";
  backendApiUrl: string;
  backendApiUrlHost: string;
  builderSiteId: string;
  apiKeyStatus: RuntimeConfigApiKeyStatus;
  belongsToSite: boolean;
  warnings: string[];
  evidence: {
    attemptedPaths: string[];
    selectedPath: string;
    connectorMode?: "browser-sharepoint";
    sizeBytes?: number;
    httpStatus?: number;
    error?: string;
  };
};

const RUNTIME_CONFIG_FILENAMES = ["sitebuilder-runtime-config.json", "runtime-config.json"];

const normalizeBackend = (value: unknown): "txt" | "mongo" | "unknown" | "" => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "mongo" || normalized === "txt" || normalized === "unknown") return normalized;
  return normalized ? "unknown" : "";
};

export const redactBackendApiUrl = (value: unknown) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    return parsed.origin;
  } catch {
    return raw.replace(/[?#].*$/g, "").replace(/\/+$/g, "");
  }
};

const hasConfiguredApiKey = (parsed: Record<string, unknown>) => {
  const raw = String(parsed.apiKey || parsed.api_key || parsed.backendApiKey || "").trim();
  return Boolean(raw);
};

const siteRuntimeConfigPath = (site: any, paths: SiteBuilderResolvedPaths) =>
  String(site.runtimeConfigPath || paths.runtimeConfigPath || "").trim();

const runtimeConfigUrl = (paths: SiteBuilderResolvedPaths, path: string) =>
  `https://${paths.host}${path.startsWith("/") ? path : `/${path}`}`;

const candidatePaths = (site: any, paths: SiteBuilderResolvedPaths) => {
  const configured = siteRuntimeConfigPath(site, paths);
  if (configured) return [configured];
  return RUNTIME_CONFIG_FILENAMES.map((filename) => `${paths.finalDistRoot}/${filename}`);
};

const resultFromError = (
  site: any,
  paths: SiteBuilderResolvedPaths,
  selectedPath: string,
  attemptedPaths: string[],
  error: unknown
): RuntimeConfigValidationResult => {
  const message = error instanceof Error ? error.message : String(error);
  const status: RuntimeConfigReadStatus = message.includes("sharepoint-read-failed:401") || message.includes("sharepoint-read-failed:403")
    ? "auth-blocked"
    : message.includes("sharepoint-read-failed:404")
      ? "missing"
      : "error";
  return {
    checkedAt: new Date().toISOString(),
    siteId: String(site._id),
    siteCode: String(site.siteCode || ""),
    runtimeConfigPath: selectedPath,
    runtimeConfigUrl: runtimeConfigUrl(paths, selectedPath),
    readStatus: status,
    storageBackend: "",
    backendApiUrl: "",
    backendApiUrlHost: "",
    builderSiteId: "",
    apiKeyStatus: "unknown",
    belongsToSite: false,
    warnings: status === "missing"
      ? ["קובץ runtime config לא נמצא בנתיב המדויק שהוגדר לאתר."]
      : ["לא ניתן לקרוא את קובץ runtime config דרך חיבור השרת ל־SharePoint."],
    evidence: {
      attemptedPaths,
      selectedPath,
      error: message
    }
  };
};

const resultFromStoredRuntimeConfig = (
  site: any,
  paths: SiteBuilderResolvedPaths,
  attemptedPaths: string[],
  selectedPath: string
): RuntimeConfigValidationResult | null => {
  const stored = site.runtimeConfigStatus;
  if (!stored || stored.evidence?.connectorMode !== "browser-sharepoint") return null;

  return {
    checkedAt: stored.checkedAt ? new Date(stored.checkedAt).toISOString() : new Date().toISOString(),
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    runtimeConfigPath: stored.path || selectedPath,
    runtimeConfigUrl: stored.url || runtimeConfigUrl(paths, stored.path || selectedPath),
    readStatus: stored.readStatus || "unknown",
    storageBackend: stored.storageBackend || "",
    backendApiUrl: stored.backendApiUrl || "",
    backendApiUrlHost: stored.backendApiUrlHost || "",
    builderSiteId: stored.builderSiteId || "",
    apiKeyStatus: stored.apiKeyStatus || "unknown",
    belongsToSite: Boolean(stored.belongsToSite),
    warnings: stored.warnings || [],
    evidence: {
      attemptedPaths,
      selectedPath: stored.path || selectedPath,
      ...(stored.evidence || {}),
      connectorMode: "browser-sharepoint"
    }
  };
};

export async function validateRuntimeConfig(siteId: string): Promise<RuntimeConfigValidationResult> {
  logger.info("sites", "Runtime config validation started", { siteId });
  const site = await Site.findById(siteId);
  if (!site) throw new Error("site-not-found");

  const paths = resolveSiteBuilderPaths({
    siteCode: site.siteCode,
    sharePointHost: site.sharePointHost,
    sharePointSiteUrl: site.sharePointSiteUrl,
    siteDbLibrary: site.siteDbLibrary,
    usersDbLibrary: site.usersDbLibrary,
    bootstrapLibrary: site.bootstrapLibrary,
    bootstrapFolder: site.bootstrapFolder,
    widgetsDbTarget: site.widgetsDbTarget,
    runtimeConfigPath: site.runtimeConfigPath
  });

  const attemptedPaths = candidatePaths(site, paths);
  const selectedPath = attemptedPaths[0] || paths.runtimeConfigPath;
  const storedResult = resultFromStoredRuntimeConfig(site, paths, attemptedPaths, selectedPath);
  if (storedResult) return storedResult;

  const result: RuntimeConfigValidationResult = {
    checkedAt: new Date().toISOString(),
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    runtimeConfigPath: selectedPath,
    runtimeConfigUrl: runtimeConfigUrl(paths, selectedPath),
    readStatus: "browser-required",
    storageBackend: "",
    backendApiUrl: "",
    backendApiUrlHost: "",
    builderSiteId: "",
    apiKeyStatus: "unknown",
    belongsToSite: false,
    warnings: ["בדיקת runtime config מתבצעת דרך הדפדפן בלבד; השרת לא קורא SharePoint."],
    evidence: {
      attemptedPaths,
      selectedPath,
      connectorMode: "browser-sharepoint",
      error: "browser-sharepoint-runtime-config-required"
    }
  };

  await persistRuntimeConfigResult(site, paths, result);
  logger.info("sites", "Runtime config validation completed", {
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    runtimeConfigPath: result.runtimeConfigPath,
    readStatus: result.readStatus,
    storageBackend: result.storageBackend,
    backendApiUrlHost: result.backendApiUrlHost,
    builderSiteId: result.builderSiteId,
    apiKeyStatus: result.apiKeyStatus,
    warningsCount: result.warnings.length
  });
  return result;
}

async function persistRuntimeConfigResult(site: any, paths: SiteBuilderResolvedPaths, result: RuntimeConfigValidationResult) {
  const checkedAt = new Date(result.checkedAt);
  site.runtimeConfigPath = result.runtimeConfigPath || paths.runtimeConfigPath;
  site.runtimeConfigUrl = result.runtimeConfigUrl || paths.runtimeConfigUrl;
  site.runtimeConfigStatus = {
    path: result.runtimeConfigPath,
    url: result.runtimeConfigUrl,
    readStatus: result.readStatus,
    storageBackend: result.storageBackend,
    backendApiUrl: result.backendApiUrl,
    backendApiUrlHost: result.backendApiUrlHost,
    builderSiteId: result.builderSiteId,
    apiKeyStatus: result.apiKeyStatus,
    belongsToSite: result.belongsToSite,
    warnings: result.warnings,
    checkedAt,
    evidence: result.evidence
  };
  site.lastRuntimeConfigCheckAt = checkedAt;
  site.health = {
    ...(site.health as Record<string, unknown>),
    runtimeConfigExists: ["configured", "mismatch", "invalid"].includes(result.readStatus),
    runtimeConfigValid: result.readStatus === "configured" || (result.readStatus === "mismatch" && result.warnings.length === 0)
  };
  if (result.storageBackend && result.storageBackend !== "unknown" && site.storageBackend === "unknown") {
    site.storageBackend = result.storageBackend;
  }
  if (result.builderSiteId && !site.builderSiteId) {
    site.builderSiteId = result.builderSiteId;
  }
  if (result.storageBackend === "mongo") {
    if (result.backendApiUrl && !site.backendApiUrl) site.backendApiUrl = result.backendApiUrl;
    if (result.builderSiteId && !site.mongoSiteId) site.mongoSiteId = result.builderSiteId;
  }
  await site.save();
}
