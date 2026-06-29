import { env } from "../config/env";
import { Site } from "../models/Site";
import { logger } from "../utils/logger";
import { redactBackendApiUrl } from "./runtimeConfig.service";

type BackendCheckStatus = "ok" | "missing" | "mismatch" | "error" | "unknown";
type SeedStatus = "ok" | "missing" | "partial" | "error" | "unknown";

export type BuilderBackendFetchResult = {
  ok: boolean;
  url: string;
  status?: number;
  statusText?: string;
  payload?: any;
  error?: string;
};

export type MongoSeedCheck = {
  key: string;
  scope: string;
  entityId: string;
  ok: boolean;
  status: "ok" | "missing" | "error";
  message?: string;
};

export type BuilderMongoHealthResult = {
  checkedAt: string;
  siteId: string;
  siteCode: string;
  storageBackend: string;
  backendApiUrl: string;
  backendApiUrlHost: string;
  builderSiteId: string;
  apiKeyConfigured: boolean;
  backendReachable: boolean;
  registryStatus: BackendCheckStatus;
  collectionStatus: "ok" | "missing" | "error" | "unknown";
  seedStatus: SeedStatus;
  adminsStatus: "ok" | "missing" | "error" | "unknown";
  backupsStatus: "ok" | "missing" | "error" | "unknown";
  revisionsAuditStatus: "ok" | "unsupported" | "error" | "unknown";
  safeCollectionName: string;
  expectedScopes: string[];
  missingScopes: string[];
  missingDocs: string[];
  warnings: string[];
  checks: {
    health: BuilderBackendFetchResult[];
    sitesList?: BuilderBackendFetchResult;
    siteRegistry?: BuilderBackendFetchResult;
    seedBatch?: BuilderBackendFetchResult;
    backups?: BuilderBackendFetchResult;
  };
  seedChecks: MongoSeedCheck[];
};

export type BuilderBackendOption = {
  label: string;
  backendApiUrl: string;
  backendApiUrlHost: string;
  environment: "local" | "dev" | "test" | "staging" | "production" | "unknown";
  default: boolean;
  credentialRef: string;
  credentialConfigured: boolean;
  allowed: boolean;
  localhost: boolean;
};

export type BuilderBackendRuntimeSettings = {
  builderBackendOptions: BuilderBackendOption[];
  defaultBuilderBackendApiUrl: string;
  defaultBuilderApiKeyRef: string;
  currentEnvironment: string;
  productionClassifiedDefaultExists: boolean;
  defaultStorageBackend: "txt" | "mongo" | "unknown";
  advancedManualFieldsEnabled: boolean;
  rawApiKeysExposed: false;
};

export const REQUIRED_LEGACY_DOCS = [
  { key: "bihs_master_config_v1.txt", scope: "config", entityId: "master" },
  { key: "users_data.txt", scope: "admins", entityId: "list" },
  { key: "events_data.txt", scope: "events", entityId: "list" },
  { key: "nav_data.txt", scope: "navigation", entityId: "list" },
  { key: "site_content_data.txt", scope: "content", entityId: "site" },
  { key: "theme_data.txt", scope: "design", entityId: "theme" },
  { key: "widgets_data.txt", scope: "widgets", entityId: "config" },
  { key: "external_links_data.txt", scope: "externalLinks", entityId: "list" },
  { key: "gantt_data.txt", scope: "gantt", entityId: "settings" }
] as const;

export const normalizeBuilderApiBase = (value: string) => String(value || "").trim().replace(/\/+$/g, "");

export const builderApiKeyEnvName = (ref: string) => {
  const trimmed = String(ref || "").trim();
  if (!trimmed) return "";
  return trimmed.startsWith("env:") ? trimmed.slice(4).trim() : trimmed;
};

const defaultBuilderApiKeyRef = () =>
  String(env.SITE_BUILDER_DEFAULT_API_KEY_REF || env.SITE_BUILDER_BACKEND_DEFAULT_API_KEY_REF || "").trim();

const parseConfiguredBuilderBackend = (raw: string, index: number) => {
  const value = String(raw || "").trim();
  if (!value) return null;
  const parts = value.split("|").map((part) => part.trim()).filter(Boolean);
  const urlPart = parts.find((part) => /^https?:\/\//i.test(part)) || value;
  const backendApiUrl = normalizeBuilderApiBase(urlPart);
  if (!backendApiUrl) return null;
  const label = parts.length > 1 && parts[0] !== urlPart ? parts[0] : "";
  const environment = parts.find((part) => ["local", "dev", "test", "staging", "production", "unknown"].includes(part.toLowerCase())) || "";
  const credentialRef = parts.find((part) => part !== label && part !== urlPart && part !== environment && /^[A-Z][A-Z0-9_]*(?::[A-Z0-9_]+)?$/.test(part)) || "";
  return {
    label,
    backendApiUrl,
    environment: environment.toLowerCase() as BuilderBackendOption["environment"] | "",
    credentialRef,
    index
  };
};

const isLocalBuilderBackendUrl = (backendApiUrl: string) => {
  try {
    const { hostname } = new URL(normalizeBuilderApiBase(backendApiUrl));
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname.endsWith(".localhost");
  } catch {
    return /(^https?:\/\/)?(localhost|127\.0\.0\.1|\[?::1\]?)(:|\/|$)/i.test(String(backendApiUrl || ""));
  }
};

export const isLocalBuilderBackend = isLocalBuilderBackendUrl;

const inferBuilderBackendEnvironment = (backendApiUrl: string): BuilderBackendOption["environment"] => {
  const normalized = normalizeBuilderApiBase(backendApiUrl);
  if (!normalized) return "unknown";
  if (isLocalBuilderBackendUrl(normalized)) return "local";
  try {
    const host = new URL(normalized).hostname.toLowerCase();
    if (host.includes("staging") || host.includes("stage")) return "staging";
    if (host.includes("test") || host.includes("qa")) return "test";
    if (host.includes("dev")) return "dev";
    if (host.includes("prod") || host.includes("classified") || host.includes("internal")) return "production";
  } catch {
    // Keep unknown when URL parsing fails; validation handles invalid URLs elsewhere.
  }
  return env.NODE_ENV === "production" ? "production" : "unknown";
};

const labelForBuilderBackend = (
  backendApiUrl: string,
  environment: BuilderBackendOption["environment"],
  explicitLabel = "",
  isDefault = false
) => {
  const trimmed = explicitLabel.trim();
  if (trimmed) return trimmed;
  if (isDefault && env.SITE_BUILDER_DEFAULT_BACKEND_LABEL.trim()) return env.SITE_BUILDER_DEFAULT_BACKEND_LABEL.trim();
  if (isLocalBuilderBackendUrl(backendApiUrl)) return "Local Builder Backend";
  if (environment === "production") return "Production / Classified";
  if (environment !== "unknown") return `${environment[0].toUpperCase()}${environment.slice(1)} Builder Backend`;
  return redactBackendApiUrl(backendApiUrl) || "Builder Backend";
};

export const resolveBuilderApiCredential = (site: any) => {
  const ref = String(site.builderApiKeyRef || defaultBuilderApiKeyRef() || "").trim();
  const envName = builderApiKeyEnvName(ref);
  if (!envName) return { ref, configured: false, value: "" };
  const value = String(process.env[envName] || "").trim();
  return { ref, configured: Boolean(value), value };
};

export const allowedBuilderBackendUrls = () =>
  [
    ...env.SITE_BUILDER_BACKEND_API_URLS
    .split(",")
      .map((item, index) => parseConfiguredBuilderBackend(item, index)?.backendApiUrl || "")
      .filter(Boolean),
    normalizeBuilderApiBase(env.SITE_BUILDER_DEFAULT_BACKEND_API_URL)
  ]
    .filter(Boolean)
    .filter((url, index, values) => values.indexOf(url) === index);

export const isBuilderBackendUrlAllowed = (backendApiUrl: string) => {
  const allowed = allowedBuilderBackendUrls();
  if (allowed.length === 0) return true;
  const normalized = normalizeBuilderApiBase(backendApiUrl);
  return allowed.includes(normalized);
};

export const getBuilderBackendRuntimeSettings = (): BuilderBackendRuntimeSettings => {
  const defaultUrl = normalizeBuilderApiBase(env.SITE_BUILDER_DEFAULT_BACKEND_API_URL);
  const defaultRef = defaultBuilderApiKeyRef();
  const parsedOptions = env.SITE_BUILDER_BACKEND_API_URLS
    .split(",")
    .map((item, index) => parseConfiguredBuilderBackend(item, index))
    .filter((item): item is NonNullable<ReturnType<typeof parseConfiguredBuilderBackend>> => Boolean(item));
  if (defaultUrl && !parsedOptions.some((item) => item.backendApiUrl === defaultUrl)) {
    parsedOptions.unshift({
      label: env.SITE_BUILDER_DEFAULT_BACKEND_LABEL,
      backendApiUrl: defaultUrl,
      environment: "",
      credentialRef: defaultRef,
      index: -1
    });
  }

  const uniqueOptions = parsedOptions.filter((item, index, values) =>
    values.findIndex((candidate) => candidate.backendApiUrl === item.backendApiUrl) === index
  );
  const effectiveDefaultUrl = defaultUrl || (uniqueOptions.length === 1 ? uniqueOptions[0].backendApiUrl : "");
  const allowed = allowedBuilderBackendUrls();
  const builderBackendOptions = uniqueOptions.map((item) => {
    const environment = item.environment || inferBuilderBackendEnvironment(item.backendApiUrl);
    const credentialRef = item.credentialRef || defaultRef;
    const envName = builderApiKeyEnvName(credentialRef);
    const optionDefault = Boolean(effectiveDefaultUrl && item.backendApiUrl === effectiveDefaultUrl);
    return {
      label: labelForBuilderBackend(item.backendApiUrl, environment, item.label, optionDefault),
      backendApiUrl: item.backendApiUrl,
      backendApiUrlHost: redactBackendApiUrl(item.backendApiUrl),
      environment,
      default: optionDefault,
      credentialRef,
      credentialConfigured: Boolean(envName && process.env[envName]),
      allowed: allowed.length === 0 || allowed.includes(item.backendApiUrl),
      localhost: isLocalBuilderBackendUrl(item.backendApiUrl)
    };
  });

  return {
    builderBackendOptions,
    defaultBuilderBackendApiUrl: effectiveDefaultUrl,
    defaultBuilderApiKeyRef: defaultRef,
    currentEnvironment: env.NODE_ENV,
    productionClassifiedDefaultExists: builderBackendOptions.some((option) =>
      option.default && option.environment === "production" && !option.localhost
    ),
    defaultStorageBackend: env.SITE_BUILDER_DEFAULT_STORAGE_BACKEND,
    advancedManualFieldsEnabled: env.HUB_ADVANCED_MANUAL_SITE_FIELDS_ENABLED,
    rawApiKeysExposed: false
  };
};

export const requestBuilderJson = async (
  backendApiUrl: string,
  path: string,
  apiKey: string,
  init: RequestInit = {}
): Promise<BuilderBackendFetchResult> => {
  const url = `${normalizeBuilderApiBase(backendApiUrl)}${path.startsWith("/") ? path : `/${path}`}`;
  try {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    if (apiKey) headers.set("X-API-Key", apiKey);
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const response = await fetch(url, {
      ...init,
      headers,
      redirect: "follow"
    });
    let payload: any = undefined;
    const text = await response.text();
    if (text.trim()) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { raw: text.slice(0, 500) };
      }
    }
    return {
      ok: response.ok,
      url,
      status: response.status,
      statusText: response.statusText,
      payload
    };
  } catch (error) {
    return {
      ok: false,
      url,
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

const findSitePayload = (payload: any) => payload?.site || payload?.data?.site || payload?.data || payload;

const summarizeSeedChecks = (payload: any): MongoSeedCheck[] => {
  const results = Array.isArray(payload?.results) ? payload.results : Array.isArray(payload?.data?.results) ? payload.data.results : [];
  const byKey = new Map(results.map((item: any) => [String(item?.key || ""), item]));
  return REQUIRED_LEGACY_DOCS.map((doc) => {
    const result = byKey.get(doc.key) as any;
    const ok = Boolean(result?.ok);
    const message = String(result?.message || result?.error || "");
    return {
      ...doc,
      ok,
      status: ok ? "ok" as const : message.includes("not") || message.includes("404") ? "missing" as const : "error" as const,
      message
    };
  });
};

export async function runBuilderMongoHealthCheck(siteId: string): Promise<BuilderMongoHealthResult> {
  logger.info("sites", "Builder Mongo backend health check started", { siteId });
  const site = await Site.findById(siteId);
  if (!site) throw new Error("site-not-found");

  const backendApiUrl = normalizeBuilderApiBase(String(site.backendApiUrl || site.runtimeConfigStatus?.backendApiUrl || ""));
  const builderSiteId = String(site.mongoSiteId || site.builderSiteId || site.runtimeConfigStatus?.builderSiteId || site.siteCode || "").trim();
  const credential = resolveBuilderApiCredential(site);
  const backendAllowed = !backendApiUrl || isBuilderBackendUrlAllowed(backendApiUrl);
  const warnings = [
    site.storageBackend !== "mongo" ? "האתר אינו מוגדר כ־Mongo ב־HUB; בדיקת backend נשמרת כאינפורמטיבית בלבד." : "",
    !backendApiUrl ? "חסר backendApiUrl עבור Builder backend." : "",
    backendApiUrl && !backendAllowed ? "כתובת Builder backend אינה ברשימת הכתובות המותרות בהגדרות HUB; הבדיקה לא הורצה." : "",
    !builderSiteId ? "חסר Mongo/Builder siteId." : "",
    !credential.configured ? "חסר credential reference פעיל ל־Builder backend; לא נשמר או מוצג API key גולמי." : ""
  ].filter(Boolean);

  if (!backendApiUrl || !backendAllowed || !builderSiteId || !credential.configured) {
    const result = emptyResult(site, backendApiUrl, builderSiteId, credential.configured, warnings);
    await persistMongoHealthResult(site, result);
    return result;
  }

  const healthChecks = [
    await requestBuilderJson(backendApiUrl, "/api/healthz", credential.value),
    await requestBuilderJson(backendApiUrl, "/healthz", credential.value),
    await requestBuilderJson(backendApiUrl, "/api/health", credential.value)
  ];
  const backendReachable = healthChecks.some((item) => item.ok);
  const sitesList = await requestBuilderJson(backendApiUrl, "/api/sites", credential.value);
  const siteRegistry = await requestBuilderJson(backendApiUrl, `/api/sites/${encodeURIComponent(builderSiteId)}`, credential.value);
  const registryPayload = findSitePayload(siteRegistry.payload);
  const registrySafeCollectionName = String(registryPayload?.safeCollectionName || "").trim();
  const expectedSafeCollectionName = String(site.safeCollectionName || "").trim();
  const registryStatus: BackendCheckStatus = siteRegistry.ok
    ? expectedSafeCollectionName && registrySafeCollectionName && expectedSafeCollectionName !== registrySafeCollectionName
      ? "mismatch"
      : "ok"
    : siteRegistry.status === 404
      ? "missing"
      : "error";
  const safeCollectionName = registrySafeCollectionName || expectedSafeCollectionName;
  const collectionStatus = safeCollectionName ? "ok" as const : registryStatus === "ok" ? "missing" as const : "unknown" as const;

  const seedBatch = await requestBuilderJson(backendApiUrl, `/api/sites/${encodeURIComponent(builderSiteId)}/legacy/batch-read`, credential.value, {
    method: "POST",
    body: JSON.stringify({ keys: REQUIRED_LEGACY_DOCS.map((doc) => doc.key) })
  });
  const seedChecks = seedBatch.ok || seedBatch.status === 207 ? summarizeSeedChecks(seedBatch.payload) : [];
  const missingSeedChecks = seedChecks.filter((item) => !item.ok);
  const seedStatus: SeedStatus = seedBatch.ok || seedBatch.status === 207
    ? missingSeedChecks.length === 0
      ? "ok"
      : missingSeedChecks.length === seedChecks.length
        ? "missing"
        : "partial"
    : "error";

  const backups = await requestBuilderJson(backendApiUrl, `/api/sites/${encodeURIComponent(builderSiteId)}/backups`, credential.value);
  const backupsStatus = backups.ok ? "ok" as const : backups.status === 404 ? "missing" as const : "error" as const;
  const adminsStatus = seedChecks.find((item) => item.key === "users_data.txt")?.ok ? "ok" as const : seedStatus === "error" ? "error" as const : "missing" as const;
  const result: BuilderMongoHealthResult = {
    checkedAt: new Date().toISOString(),
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    storageBackend: String(site.storageBackend || "unknown"),
    backendApiUrl,
    backendApiUrlHost: redactBackendApiUrl(backendApiUrl),
    builderSiteId,
    apiKeyConfigured: credential.configured,
    backendReachable,
    registryStatus,
    collectionStatus,
    seedStatus,
    adminsStatus,
    backupsStatus,
    revisionsAuditStatus: "unsupported",
    safeCollectionName,
    expectedScopes: Array.from(new Set(REQUIRED_LEGACY_DOCS.map((doc) => doc.scope))),
    missingScopes: Array.from(new Set(missingSeedChecks.map((item) => item.scope))),
    missingDocs: missingSeedChecks.map((item) => item.key),
    warnings: [
      ...warnings,
      registryStatus === "mismatch" ? "safeCollectionName ב־Mongo אינו תואם לערך שמנוהל ב־HUB." : "",
      seedStatus !== "ok" ? "חסרים מסמכי seed ב־Mongo; האתר לא נחשב מוכן." : "",
      "בדיקת revisions/audit דרך API אינה זמינה כרגע ולכן מסומנת כ־unsupported."
    ].filter(Boolean),
    checks: {
      health: healthChecks,
      sitesList,
      siteRegistry,
      seedBatch,
      backups
    },
    seedChecks
  };

  await persistMongoHealthResult(site, result);
  logger.info("sites", "Builder Mongo backend health check completed", {
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    backendApiUrlHost: result.backendApiUrlHost,
    builderSiteId,
    backendReachable,
    registryStatus,
    collectionStatus,
    seedStatus,
    missingDocsCount: result.missingDocs.length
  });
  return result;
}

function emptyResult(site: any, backendApiUrl: string, builderSiteId: string, apiKeyConfigured: boolean, warnings: string[]): BuilderMongoHealthResult {
  return {
    checkedAt: new Date().toISOString(),
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    storageBackend: String(site.storageBackend || "unknown"),
    backendApiUrl,
    backendApiUrlHost: redactBackendApiUrl(backendApiUrl),
    builderSiteId,
    apiKeyConfigured,
    backendReachable: false,
    registryStatus: "unknown",
    collectionStatus: "unknown",
    seedStatus: "unknown",
    adminsStatus: "unknown",
    backupsStatus: "unknown",
    revisionsAuditStatus: "unknown",
    safeCollectionName: String(site.safeCollectionName || ""),
    expectedScopes: Array.from(new Set(REQUIRED_LEGACY_DOCS.map((doc) => doc.scope))),
    missingScopes: [],
    missingDocs: [],
    warnings,
    checks: { health: [] },
    seedChecks: []
  };
}

async function persistMongoHealthResult(site: any, result: BuilderMongoHealthResult) {
  const checkedAt = new Date(result.checkedAt);
  site.mongoBackendStatus = {
    backendApiUrl: result.backendApiUrl,
    backendApiUrlHost: result.backendApiUrlHost,
    apiKeyRef: site.builderApiKeyRef || env.SITE_BUILDER_BACKEND_DEFAULT_API_KEY_REF || "",
    apiKeyConfigured: result.apiKeyConfigured,
    mongoEnvironment: site.mongoEnvironment || "",
    mongoDatabase: site.mongoDatabase || "",
    siteId: result.builderSiteId,
    safeCollectionName: result.safeCollectionName,
    backendReachable: result.backendReachable,
    registryStatus: result.registryStatus,
    collectionStatus: result.collectionStatus,
    seedStatus: result.seedStatus,
    adminsStatus: result.adminsStatus,
    backupsStatus: result.backupsStatus,
    revisionsAuditStatus: result.revisionsAuditStatus,
    expectedScopes: result.expectedScopes,
    missingScopes: result.missingScopes,
    missingDocs: result.missingDocs,
    warnings: result.warnings,
    checkedAt,
    evidence: {
      checks: result.checks,
      seedChecks: result.seedChecks
    }
  };
  site.lastMongoHealthCheckAt = checkedAt;
  site.dataBackendStatus =
    result.backendReachable &&
    result.registryStatus === "ok" &&
    result.collectionStatus === "ok" &&
    result.seedStatus === "ok"
      ? "ok"
      : result.backendReachable
        ? "warning"
        : "failed";
  if (result.safeCollectionName && !site.safeCollectionName) site.safeCollectionName = result.safeCollectionName;
  if (result.builderSiteId && !site.mongoSiteId) site.mongoSiteId = result.builderSiteId;
  site.health = {
    ...(site.health as Record<string, unknown>),
    dataBackendReachable: result.backendReachable,
    mongoRegistryOk: result.registryStatus === "ok",
    mongoCollectionOk: result.collectionStatus === "ok",
    mongoSeedOk: result.seedStatus === "ok",
    mongoBackupsOk: result.backupsStatus === "ok",
    mongoRevisionsAuditOk: result.revisionsAuditStatus === "ok" || result.revisionsAuditStatus === "unsupported",
    adminsSyncOk: result.adminsStatus === "ok"
  };
  await site.save();
}
