import type { Backup, Job } from "../api/sitesApi";
import type { Site } from "../types/site";
import {
  getProductScenario,
  makeScenarioBackup,
  makeScenarioJob,
  makeScenarioSite,
  PRODUCT_SCENARIO_NOW,
  scenarioSiteById,
  type ProductScenario,
  type ScenarioEndpoint
} from "./productScenarios";

type ScenarioRuntime = {
  scenario: ProductScenario;
  sites: Site[];
  jobs: Job[];
  backups: Backup[];
  counts: Map<ScenarioEndpoint, number>;
};

declare global {
  interface Window {
    __SITEBUILDER_PRODUCT_SCENARIO__?: string;
  }
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function success(data: unknown, meta?: Record<string, unknown>) {
  return new Response(JSON.stringify({ ok: true, data, ...(meta ? { meta } : {}) }), {
    status: 200,
    headers: { "Content-Type": "application/json", "x-scenario-transport": "true" }
  });
}

function failure(message: string, status = 503) {
  return new Response(JSON.stringify({ ok: false, error: { code: "SCENARIO_UNAVAILABLE", message } }), {
    status,
    headers: { "Content-Type": "application/json", "x-scenario-transport": "true" }
  });
}

function endpointFailure(runtime: ScenarioRuntime, endpoint: ScenarioEndpoint) {
  const rule = runtime.scenario.failures?.[endpoint];
  if (!rule) return null;
  const count = (runtime.counts.get(endpoint) || 0) + 1;
  runtime.counts.set(endpoint, count);
  if (count <= (rule.afterSuccesses || 0)) return null;
  return rule;
}

async function respondOrFail(runtime: ScenarioRuntime, endpoint: ScenarioEndpoint, data: unknown, meta?: Record<string, unknown>) {
  const rule = endpointFailure(runtime, endpoint);
  if (!rule) return success(data, meta);
  if (rule.mode === "timeout") {
    await new Promise((resolve) => window.setTimeout(resolve, 80));
    return failure("הבקשה המשנית חרגה מזמן ההמתנה", 504);
  }
  return failure("המידע המבוקש אינו זמין בתרחיש הנוכחי");
}

function readJsonBody(input: RequestInfo | URL, init?: RequestInit) {
  const body = init?.body || (input instanceof Request ? input.body : null);
  if (typeof body !== "string") return {};
  try { return JSON.parse(body) as Record<string, unknown>; }
  catch { return {}; }
}

function siteStats(sites: Site[]) {
  return {
    total: sites.length,
    active: sites.filter((site) => site.status === "active").length,
    warning: sites.filter((site) => site.status === "warning").length,
    failed: sites.filter((site) => site.status === "failed").length,
    archived: sites.filter((site) => site.status === "archived").length,
    totalStorageMb: 0,
    health: { healthy: sites.filter((site) => site.derivedHealthStatus === "healthy").length, warning: sites.filter((site) => site.derivedHealthStatus === "warning").length, failed: sites.filter((site) => site.derivedHealthStatus === "failed").length, unknown: sites.filter((site) => site.derivedHealthStatus === "unknown").length }
  };
}

function authUserFor(runtime: ScenarioRuntime) {
  return {
    id: `scenario:${runtime.scenario.id}`,
    name: runtime.scenario.authRole === "admin" ? "מנהלת תרחיש" : runtime.scenario.authRole === "viewer" ? "צופת תרחיש" : "משתמש בתפקיד לא מוכר",
    role: runtime.scenario.authRole,
    personalNumber: "s9000001",
    source: "dev",
    identityMode: "local-fallback"
  };
}

function operationalStatus(runtime: ScenarioRuntime) {
  return {
    generatedAt: PRODUCT_SCENARIO_NOW,
    hubApi: { status: "connected", checkedAt: PRODUCT_SCENARIO_NOW, message: "Hub API מחובר" },
    hubMongo: { status: "connected", checkedAt: PRODUCT_SCENARIO_NOW, message: "Hub Mongo מחובר" },
    browserSharePoint: { status: "not_checked", source: "cached evidence", message: "לא נדרש בתרחיש", nextStep: "" },
    builderBackend: { status: "not_relevant", configured: false, message: "לא נדרש בתרחיש", nextStep: "" },
    currentIdentity: { mode: "local-dev-fallback", label: authUserFor(runtime).name, source: "scenario" },
    operationMode: { readOnlyBrowserChecksAvailable: true, browserSharePointWritesAvailable: false, builderBackendMongoOperationsAvailable: false, legacyBackendSharePointAvailable: false, label: "תרחיש מקומי ללא כתיבה" },
    dataSourceMatrix: {
      txt: { appData: "browser-sharepoint-txt", backupInventory: "browser-sharepoint", adminReads: "browser-sharepoint", hostingRuntimeConfig: "browser-sharepoint", hubEvidence: "hub-mongo" },
      mongo: { appData: "builder-backend-mongo", seedRuntimeData: "builder-backend-mongo", backupCapabilityInventory: "builder-backend-mongo", hostingRuntimeConfig: "browser-sharepoint", sharePointAccessChecks: "browser-sharepoint", hubEvidence: "hub-mongo" }
    }
  };
}

function completeCreatedSite(input: Partial<Site>) {
  const siteCode = String(input.siteCode || "created-site");
  const storageBackend = input.storageBackend || "mongo";
  return makeScenarioSite({
    ...input,
    _id: "managed-created-complete",
    siteCode,
    displayName: String(input.displayName || "אתר שנוצר"),
    sharePointSiteUrl: String(input.sharePointSiteUrl || `https://portal.example/sites/${siteCode}`),
    lifecycleStatus: "ready",
    provisioningStatus: "succeeded",
    storageBackend,
    builderSiteId: storageBackend === "mongo" ? String(input.builderSiteId || siteCode) : input.builderSiteId,
    mongoSiteId: storageBackend === "mongo" ? String(input.mongoSiteId || input.builderSiteId || siteCode) : input.mongoSiteId,
    safeCollectionName: storageBackend === "mongo" ? "site_created_complete" : input.safeCollectionName
  });
}

function partialCreatedSite(input: Partial<Site>) {
  const siteCode = String(input.siteCode || "created-site");
  return makeScenarioSite({
    ...input,
    _id: "managed-created-partial",
    siteCode,
    displayName: String(input.displayName || "אתר שנשמר חלקית"),
    sharePointSiteUrl: String(input.sharePointSiteUrl || `https://portal.example/sites/${siteCode}`),
    status: "draft",
    lifecycleStatus: "partially-created",
    provisioningStatus: "partially-created",
    derivedHealthStatus: "unknown",
    dataBackendStatus: "unknown",
    finalAppUrl: undefined,
    safeCollectionName: undefined
  });
}

async function scenarioResponse(runtime: ScenarioRuntime, input: RequestInfo | URL, init?: RequestInit) {
  const requestUrl = new URL(input instanceof Request ? input.url : String(input), window.location.origin);
  const apiMarker = "/api";
  const markerIndex = requestUrl.pathname.indexOf(apiMarker);
  if (markerIndex < 0) return null;
  const path = requestUrl.pathname.slice(markerIndex + apiMarker.length) || "/";
  const method = String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();

  if (path === "/health") return success({ status: "ok", mongo: "connected", serverTime: PRODUCT_SCENARIO_NOW });
  if (path === "/auth/bootstrap-status") return success({ personalNumberLoginEnabled: true, ownerPersonalNumberConfigured: 1, envBootstrapAdminsConfigured: 0, bootstrapAdminsConfigured: 1, bootstrapPersonalNumberAuthAvailable: true });
  if (path === "/auth/me") return success({ authenticated: true, user: authUserFor(runtime) });
  if (path === "/auth/login-personal-number") return success({ authenticated: true, personalNumber: "s9000001", role: "admin", source: "bootstrap", isBootstrapAdmin: true, matchedSite: null });
  if (path === "/operations/status") return success(operationalStatus(runtime));
  if (path === "/operations/capabilities") return success({ generatedAt: PRODUCT_SCENARIO_NOW, operations: {}, sharePoint: {}, builderBackend: {}, txt: {}, mongo: {} });

  if (path === "/sites" && method === "GET") return respondOrFail(runtime, "sites", runtime.sites, { count: runtime.sites.length, stats: siteStats(runtime.sites) });
  if (path === "/sites" && method === "POST") {
    const rule = endpointFailure(runtime, "createSite");
    if (rule || runtime.scenario.createOutcome === "failed") return failure("יצירת האתר נכשלה בתרחיש הבדיקה");
    await new Promise((resolve) => window.setTimeout(resolve, 120));
    const body = readJsonBody(input, init) as Partial<Site>;
    const created = runtime.scenario.createOutcome === "complete" ? completeCreatedSite(body) : partialCreatedSite(body);
    runtime.sites = [...runtime.sites.filter((site) => site._id !== created._id), created];
    return success(created);
  }

  const siteMatch = path.match(/^\/sites\/([^/]+)$/);
  if (siteMatch && method === "GET") {
    const managedSiteId = decodeURIComponent(siteMatch[1]);
    const site = runtime.sites.find((item) => item._id === managedSiteId) || scenarioSiteById(runtime.scenario, managedSiteId);
    return site ? respondOrFail(runtime, "site", site) : failure("המזהה המנוהל אינו מוכר", 404);
  }

  const siteBackupsMatch = path.match(/^\/sites\/([^/]+)\/backups$/);
  if (siteBackupsMatch && method === "GET") {
    const managedSiteId = decodeURIComponent(siteBackupsMatch[1]);
    return respondOrFail(runtime, "siteBackups", runtime.backups.filter((backup) => backup.siteId === managedSiteId));
  }
  if (siteBackupsMatch && method === "POST") {
    const managedSiteId = decodeURIComponent(siteBackupsMatch[1]);
    const backup = makeScenarioBackup({ _id: "backup-new-scenario", siteId: managedSiteId, status: "running" });
    runtime.backups = [backup, ...runtime.backups];
    const job = makeScenarioJob({ _id: "job-backup-new-scenario", siteId: managedSiteId, type: "backup", status: "running" });
    runtime.jobs = [job, ...runtime.jobs];
    return success({ job, message: "תרחיש מקומי בלבד" });
  }

  const accessMatch = path.match(/^\/sites\/([^/]+)\/admins$/);
  if (accessMatch && method === "GET") return respondOrFail(runtime, "access", { admins: [{ id: "admin-1", displayName: "נועה לוי", email: "noa.levi@example.org", personalNumber: "s9000001" }] });
  if (accessMatch && method === "POST") return success({ saved: true, scenarioOnly: true });
  if (/^\/sites\/[^/]+\/deployments$/.test(path) && method === "GET") return respondOrFail(runtime, "deployments", []);
  if (/^\/sites\/[^/]+\/health-check\/(sharepoint-readonly|mongo-backend)$/.test(path) && method === "POST") return success({ checkedAt: PRODUCT_SCENARIO_NOW, derivedHealthStatus: "healthy", evidence: [] });

  if (path === "/jobs" && method === "GET") return respondOrFail(runtime, "activity", runtime.jobs);
  if (path === "/backups" && method === "GET") return respondOrFail(runtime, "operationsBackups", runtime.backups);
  if (path === "/releases" && method === "GET") return respondOrFail(runtime, "releases", runtime.scenario.releases);

  const restoreMatch = path.match(/^\/backups\/([^/]+)\/restore$/);
  if (restoreMatch && method === "POST") {
    const backup = runtime.backups.find((item) => item._id === decodeURIComponent(restoreMatch[1]));
    if (!backup) return failure("הגיבוי אינו מוכר", 404);
    const job = makeScenarioJob({ _id: "job-restore-new-scenario", siteId: backup.siteId, type: "restore", status: "running" });
    runtime.jobs = [job, ...runtime.jobs];
    return success({ job, backup: { ...backup, restoreStatus: "running" }, message: "תרחיש מקומי בלבד" });
  }

  return failure(`אין תשובת תרחיש עבור ${method} ${path}`, 404);
}

export function installScenarioTransportFromLocation() {
  const scenarioId = new URLSearchParams(window.location.search).get("scenario");
  const scenario = getProductScenario(scenarioId);
  if (!scenario || window.__SITEBUILDER_PRODUCT_SCENARIO__) return false;

  const runtime: ScenarioRuntime = {
    scenario,
    sites: clone(scenario.sites),
    jobs: clone(scenario.jobs),
    backups: clone(scenario.backups),
    counts: new Map()
  };
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => (await scenarioResponse(runtime, input, init)) || nativeFetch(input, init);
  window.__SITEBUILDER_PRODUCT_SCENARIO__ = scenario.id;
  document.documentElement.dataset.productScenario = scenario.id;
  return true;
}
