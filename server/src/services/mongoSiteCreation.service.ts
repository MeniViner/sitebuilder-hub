import crypto from "crypto";
import { env } from "../config/env";
import { Site, SiteHealth } from "../models/Site";
import { resolveSiteBuilderPaths, SiteBuilderResolvedPaths } from "../utils/sitebuilderPaths";
import { buildSiteIdentityKeyFromResolvedPaths } from "../utils/siteIdentity";
import { logger } from "../utils/logger";
import { redactBackendApiUrl } from "./runtimeConfig.service";
import {
  allowedBuilderBackendUrls,
  getBuilderBackendRuntimeSettings,
  isBuilderBackendUrlAllowed,
  isLocalBuilderBackend,
  normalizeBuilderApiBase,
  requestBuilderJson,
  resolveBuilderApiCredential,
  REQUIRED_LEGACY_DOCS,
  runBuilderMongoHealthCheck
} from "./builderMongoHealth.service";

type ExecutionClass = "server-local" | "browser-sharepoint" | "mongo-backend" | "backend-service-auth-required" | "manual";
type PlanStepStatus = "planned" | "blocked" | "optional" | "succeeded" | "failed" | "skipped";

type AdminIdentity = {
  displayName?: string;
  name?: string;
  personalNumber?: string;
  email?: string;
  loginName?: string;
};

type MongoCreateSeedDoc = {
  key: string;
  scope: string;
  entityId: string;
  source: string;
  data: unknown;
};

type MongoCreatePlanStep = {
  key: string;
  label: string;
  executionClass: ExecutionClass;
  target: string;
  status: PlanStepStatus;
  required: boolean;
  blocker?: string;
  warning?: string;
};

type SharePointHostingPlan = {
  sharePointSiteUrl: string;
  siteDbTarget: string;
  siteUsersDbTarget: string;
  siteDbUsersDbSameTarget: boolean;
  siteAssetsPath: string;
  imagesPath: string;
  distPath: string;
  distAssetsPath: string;
  runtimeConfigPath: string;
  connectorPreference: "browser-sharepoint";
  libraryCreationFallback: "backend-service-auth-required-or-manual";
};

export type MongoCreatePlanInput = {
  _id?: string;
  siteCode?: string;
  displayName?: string;
  environment?: string;
  sharePointHost?: string;
  sharePointSiteUrl?: string;
  siteDbLibrary?: string;
  usersDbLibrary?: string;
  bootstrapLibrary?: string;
  bootstrapFolder?: string;
  widgetsDbTarget?: string;
  runtimeConfigPath?: string;
  runtimeConfigUrl?: string;
  backendApiUrl?: string;
  builderApiKeyRef?: string;
  builderSiteId?: string;
  mongoSiteId?: string;
  mongoEnvironment?: string;
  mongoDatabase?: string;
  safeCollectionName?: string;
  ownerName?: string;
  ownerPersonalNumber?: string;
  ownerEmail?: string;
  txtAdmins?: AdminIdentity[];
  creationMode?: string;
  storageBackend?: string;
  lifecycleStatus?: string;
  provisioningStatus?: string;
  resolvedPaths?: Partial<SiteBuilderResolvedPaths>;
};

export type MongoSiteCreationPlan = {
  operation: "create-mongo-site";
  generatedAt: string;
  siteId: string;
  siteCode: string;
  displayName: string;
  storageBackend: "mongo";
  lifecycleStatus: string;
  provisioningStatus: string;
  identity: {
    siteCode: string;
    builderSiteId: string;
    mongoSiteId: string;
    siteIdentityKey: string;
    duplicateStatus: "available" | "duplicate" | "unknown";
    duplicate?: Record<string, unknown>;
  };
  resolvedPaths: SiteBuilderResolvedPaths;
  runtimeConfig: {
    path: string;
    url: string;
    fileName: string;
    redactedPreview: Record<string, unknown>;
    apiKeyStatus: "configured" | "missing";
    backendApiUrlHost: string;
  };
  sharePointHosting: SharePointHostingPlan;
  builderBackend: {
    backendApiUrl: string;
    backendApiUrlHost: string;
    label: string;
    environment: string;
    allowedBackendApiUrls: string[];
    backendUrlAllowed: boolean;
    backendConfigured: boolean;
    backendWillBeWrittenToRuntimeConfig: boolean;
    credentialRef: string;
    credentialConfigured: boolean;
    siteId: string;
    safeCollectionNameStrategy: "generated-by-builder-backend" | "verify-explicit";
    expectedSafeCollectionName: string;
  };
  seedDocs: MongoCreateSeedDoc[];
  steps: MongoCreatePlanStep[];
  blockers: string[];
  warnings: string[];
  summary: {
    totalSteps: number;
    browserSharePointSteps: number;
    mongoBackendSteps: number;
    manualSteps: number;
    readyForPlanReview: boolean;
    readyForMongoBackendExecution: boolean;
    readyForBrowserSharePointExecution: boolean;
    createsApprovalJob: false;
  };
  readinessRules: string[];
};

export type MongoSiteCreationExecuteResult = {
  operation: "create-mongo-site-execute";
  executedAt: string;
  siteId: string;
  siteCode: string;
  builderBackend: MongoSiteCreationPlan["builderBackend"];
  registry: {
    status: "ok" | "failed";
    safeCollectionName: string;
    evidence: unknown;
  };
  seed: {
    status: "ok" | "partial" | "failed";
    written: string[];
    skippedExisting: string[];
    failed: Array<{ key: string; error: string }>;
    evidence: unknown;
  };
  backupCapability: {
    status: "ok" | "missing" | "failed";
    evidence: unknown;
  };
  health: unknown;
  finalStatus: "partially-created" | "failed";
  warnings: string[];
};

export type MongoCreateBrowserEvidenceInput = {
  connectorMode: "browser-sharepoint";
  targetSharePointSiteUrl?: string;
  capturedAt?: string;
  steps?: Array<{
    step: string;
    status: "succeeded" | "failed" | "skipped";
    path?: string;
    httpStatus?: number;
    error?: string;
  }>;
  runtimeConfig?: {
    path?: string;
    uploaded?: boolean;
    verified?: boolean;
    storageBackend?: string;
    backendApiUrlHost?: string;
    siteId?: string;
    apiKeyConfigured?: boolean;
  };
  hosting?: {
    siteDbRootReady?: boolean;
    usersDbRootReady?: boolean;
    finalDistRootReady?: boolean;
    siteAssetsRootReady?: boolean;
    assetsFolderReady?: boolean;
    indexHtmlVerified?: boolean;
  };
  warnings?: string[];
};

const DEFAULT_GANTT_DATA = {
  enabled: false,
  buttonLabel: "גאנט עבודה",
  pageTitle: "גאנט עבודה",
  description: "",
  groupBy: "category",
  defaultView: "month",
  showLegend: true,
  showToday: true,
  categories: [],
  items: []
};

const LEGACY_SEED_SOURCES: Record<string, string> = {
  "bihs_master_config_v1.txt": "Site Builder legacy mapping config:master; same bootstrap default used by HUB siteProvisioning.service.",
  "users_data.txt": "Site Builder legacy mapping admins list; seeded from owner/admin personal numbers supplied in the HUB wizard.",
  "events_data.txt": "Site Builder legacy mapping events list-with-settings; same bootstrap default used by HUB siteProvisioning.service.",
  "nav_data.txt": "Site Builder legacy mapping navigation list; same bootstrap default used by HUB siteProvisioning.service.",
  "site_content_data.txt": "Site Builder legacy mapping content:site; same bootstrap default used by HUB siteProvisioning.service.",
  "theme_data.txt": "Site Builder legacy mapping design:theme; same bootstrap default used by HUB siteProvisioning.service.",
  "widgets_data.txt": "Site Builder legacy mapping widgets:config; same bootstrap default used by HUB siteProvisioning.service.",
  "external_links_data.txt": "Site Builder legacy mapping externalLinks list; same bootstrap default used by HUB siteProvisioning.service.",
  "gantt_data.txt": "Site Builder legacy mapping gantt:settings; same bootstrap default used by HUB siteProvisioning.service."
};

const normalizeAdminKey = (admin: AdminIdentity) =>
  [
    String(admin.loginName || "").trim().toLowerCase(),
    String(admin.email || "").trim().toLowerCase(),
    String(admin.personalNumber || "").trim().toLowerCase(),
    String(admin.displayName || admin.name || "").trim().toLowerCase()
  ].find(Boolean) || "";

const normalizeAdmin = (admin: AdminIdentity, fallbackId: number) => ({
  id: fallbackId,
  name: String(admin.displayName || admin.name || "").trim(),
  role: "admin",
  personalNumber: String(admin.personalNumber || "").trim(),
  email: String(admin.email || "").trim(),
  loginName: String(admin.loginName || "").trim()
});

const initialUsers = (site: MongoCreatePlanInput) => {
  const candidates: AdminIdentity[] = [
    {
      displayName: site.ownerName,
      personalNumber: site.ownerPersonalNumber,
      email: site.ownerEmail,
      loginName: ""
    },
    ...((Array.isArray(site.txtAdmins) ? site.txtAdmins : []) as AdminIdentity[])
  ];
  const seen = new Set<string>();
  const users = [];

  for (const candidate of candidates) {
    const normalized = normalizeAdmin(candidate, users.length + 1);
    const key = normalizeAdminKey(normalized);
    if (!key || seen.has(key)) continue;
    if (!normalized.name && normalized.personalNumber) normalized.name = normalized.personalNumber;
    if (!normalized.name && normalized.email) normalized.name = normalized.email;
    seen.add(key);
    users.push(normalized);
  }

  return users;
};

export const buildMongoSeedDocs = (site: MongoCreatePlanInput): MongoCreateSeedDoc[] => {
  const dataByKey: Record<string, unknown> = {
    "bihs_master_config_v1.txt": { schemaVersion: "1.0.0" },
    "users_data.txt": initialUsers(site),
    "events_data.txt": { displayCount: 3, displayMode: "default", events: [] },
    "nav_data.txt": [],
    "site_content_data.txt": {},
    "theme_data.txt": {},
    "widgets_data.txt": {},
    "external_links_data.txt": [],
    "gantt_data.txt": DEFAULT_GANTT_DATA
  };

  return REQUIRED_LEGACY_DOCS.map((doc) => ({
    ...doc,
    source: LEGACY_SEED_SOURCES[doc.key] || "Site Builder legacy mapping default.",
    data: dataByKey[doc.key]
  }));
};

const resolvePathsForInput = (input: MongoCreatePlanInput) => {
  const generated = resolveSiteBuilderPaths({
    siteCode: String(input.siteCode || ""),
    sharePointHost: String(input.sharePointHost || ""),
    sharePointSiteUrl: String(input.sharePointSiteUrl || ""),
    siteDbLibrary: String(input.siteDbLibrary || ""),
    usersDbLibrary: String(input.usersDbLibrary || ""),
    bootstrapLibrary: String(input.bootstrapLibrary || ""),
    bootstrapFolder: String(input.bootstrapFolder || ""),
    widgetsDbTarget: String(input.widgetsDbTarget || ""),
    runtimeConfigPath: String(input.runtimeConfigPath || "")
  });
  return {
    ...generated,
    ...(input.resolvedPaths || {}),
    txtFiles: {
      ...generated.txtFiles,
      ...(input.resolvedPaths?.txtFiles || {})
    }
  } as SiteBuilderResolvedPaths;
};

const runtimeConfigFileName = (path: string) => {
  const file = String(path || "").split("/").filter(Boolean).pop() || "sitebuilder-runtime-config.json";
  return ["sitebuilder-runtime-config.json", "runtime-config.json"].includes(file) ? file : "sitebuilder-runtime-config.json";
};

export const buildMongoRuntimeConfigPayload = (plan: MongoSiteCreationPlan, apiKey: string) => ({
  storageBackend: "mongo",
  backendApiUrl: plan.builderBackend.backendApiUrl,
  siteId: plan.builderBackend.siteId,
  apiKey,
  generatedBy: "sitebuilder-hub",
  generatedAt: new Date().toISOString()
});

export const buildMongoRuntimeConfigText = (plan: MongoSiteCreationPlan, apiKey: string) =>
  `${JSON.stringify(buildMongoRuntimeConfigPayload(plan, apiKey), null, 2)}\n`;

const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

const duplicateForIdentity = async (siteIdentityKey: string, exceptId?: string) => {
  if (!siteIdentityKey) return null;
  const query: any = { siteIdentityKey };
  if (exceptId) query._id = { $ne: exceptId };
  return Site.findOne(query, {
    _id: 1,
    siteCode: 1,
    displayName: 1,
    sharePointSiteUrl: 1,
    runtimeConfigPath: 1,
    storageBackend: 1,
    builderSiteId: 1,
    mongoSiteId: 1,
    safeCollectionName: 1
  }).lean();
};

const siteInputFromDoc = (site: any): MongoCreatePlanInput => ({
  _id: site._id?.toString?.() || String(site._id || ""),
  siteCode: site.siteCode,
  displayName: site.displayName,
  environment: site.environment,
  sharePointHost: site.sharePointHost,
  sharePointSiteUrl: site.sharePointSiteUrl,
  siteDbLibrary: site.siteDbLibrary,
  usersDbLibrary: site.usersDbLibrary,
  bootstrapLibrary: site.bootstrapLibrary,
  bootstrapFolder: site.bootstrapFolder,
  widgetsDbTarget: site.widgetsDbTarget,
  runtimeConfigPath: site.runtimeConfigPath,
  runtimeConfigUrl: site.runtimeConfigUrl,
  backendApiUrl: site.backendApiUrl,
  builderApiKeyRef: site.builderApiKeyRef,
  builderSiteId: site.builderSiteId,
  mongoSiteId: site.mongoSiteId,
  mongoEnvironment: site.mongoEnvironment,
  mongoDatabase: site.mongoDatabase,
  safeCollectionName: site.safeCollectionName,
  ownerName: site.ownerName,
  ownerPersonalNumber: site.ownerPersonalNumber,
  ownerEmail: site.ownerEmail,
  txtAdmins: site.txtAdmins,
  creationMode: site.creationMode,
  storageBackend: site.storageBackend,
  lifecycleStatus: site.lifecycleStatus,
  provisioningStatus: site.provisioningStatus,
  resolvedPaths: site.resolvedPaths
});

export async function buildMongoSiteCreationPlanFromInput(input: MongoCreatePlanInput): Promise<MongoSiteCreationPlan> {
  const paths = resolvePathsForInput(input);
  const siteCode = String(input.siteCode || paths.siteCode || "").trim();
  const builderSiteId = String(input.mongoSiteId || input.builderSiteId || siteCode || "").trim();
  const backendApiUrl = normalizeBuilderApiBase(String(input.backendApiUrl || ""));
  const credentialProbe = resolveBuilderApiCredential(input);
  const builderBackendConfig = getBuilderBackendRuntimeSettings();
  const configuredBackendOption = builderBackendConfig.builderBackendOptions.find((option) => option.backendApiUrl === backendApiUrl);
  const backendConfigured = builderBackendConfig.builderBackendOptions.length > 0;
  const backendUrlAllowed = !backendApiUrl || isBuilderBackendUrlAllowed(backendApiUrl);
  const productionLocalhostBlocked = String(input.environment || "").trim().toLowerCase() === "production" && isLocalBuilderBackend(backendApiUrl);
  const seedDocs = buildMongoSeedDocs(input);
  const siteIdentityKey = buildSiteIdentityKeyFromResolvedPaths(paths, {
    storageBackend: "mongo",
    builderSiteId,
    mongoSiteId: builderSiteId,
    safeCollectionName: String(input.safeCollectionName || "")
  });
  const duplicate = await duplicateForIdentity(siteIdentityKey, input._id);
  const blockers = [
    !siteCode ? "site-code-missing" : "",
    !String(input.displayName || "").trim() ? "display-name-missing" : "",
    !builderSiteId ? "builder-site-id-missing" : "",
    !backendConfigured ? "builder-backend-not-configured" : "",
    !backendApiUrl ? "builder-backend-api-url-missing" : "",
    backendApiUrl && !backendUrlAllowed ? "builder-backend-url-not-allowed" : "",
    productionLocalhostBlocked ? "production-localhost-backend-blocked" : "",
    !credentialProbe.configured ? "builder-backend-credential-missing" : "",
    seedDocs.find((doc) => doc.key === "users_data.txt" && Array.isArray(doc.data) && doc.data.length === 0) ? "initial-admins-missing" : "",
    duplicate ? "site-physical-runtime-identity-duplicate" : ""
  ].filter(Boolean);
  const runtimePath = String(input.runtimeConfigPath || paths.runtimeConfigPath || "");
  const runtimeUrl = String(input.runtimeConfigUrl || paths.runtimeConfigUrl || "");
  const sameDbTarget = paths.siteDbRoot === paths.usersDbRoot;
  const sharePointHosting: SharePointHostingPlan = {
    sharePointSiteUrl: paths.sharePointSiteUrl,
    siteDbTarget: paths.siteDbRoot,
    siteUsersDbTarget: paths.usersDbRoot,
    siteDbUsersDbSameTarget: sameDbTarget,
    siteAssetsPath: paths.siteAssetsRoot,
    imagesPath: paths.imagesRoot,
    distPath: paths.finalDistRoot,
    distAssetsPath: `${paths.finalDistRoot}/assets`,
    runtimeConfigPath: runtimePath,
    connectorPreference: "browser-sharepoint",
    libraryCreationFallback: "backend-service-auth-required-or-manual"
  };
  const warnings = [
    String(input.safeCollectionName || "").trim()
      ? "safeCollectionName מפורש יאומת מול Builder backend; ה־API הקיים יוצר שם אוסף בטוח דרך ensure site ואינו מקבל forced collection name."
      : "safeCollectionName ייווצר על ידי Builder backend ויישמר ב־HUB אחרי אימות.",
    "קודם יש ליצור את תשתית SharePoint של האתר.",
    "לא ניתן לפרוס לפני שנוצרו siteDB / siteUsersDb / dist.",
    sameDbTarget
      ? "siteDB ו־siteUsersDb מוגדרים לאותו יעד פיזי; התוכנית תוודא יעד אחד ותסמן את siteUsersDb כמשותף."
      : "siteDB ו־siteUsersDb מוגדרים כיעדים נפרדים ויאומתו בנפרד.",
    "פריסה ראשונית חסומה עד שיש ראיית Browser SharePoint שהספריות והתיקיות קיימות."
  ];
  const steps: MongoCreatePlanStep[] = [
    {
      key: "hub-registry-record",
      label: input._id ? "רשומת HUB קיימת ותסומן planned" : "יצירת רשומת HUB draft/planned",
      executionClass: "server-local",
      target: siteIdentityKey,
      status: "planned",
      required: true
    },
    {
      key: "sharepoint-request-digest",
      label: "Browser SharePoint request digest",
      executionClass: "browser-sharepoint",
      target: paths.sharePointSiteUrl,
      status: paths.sharePointSiteUrl ? "planned" : "blocked",
      required: true,
      blocker: paths.sharePointSiteUrl ? undefined : "SharePoint site URL חסר"
    },
    {
      key: "sharepoint-library-site-db",
      label: "Create or verify siteDB document library",
      executionClass: "browser-sharepoint",
      target: paths.siteDbRoot,
      status: "planned",
      required: true
    },
    {
      key: "sharepoint-library-users-db",
      label: sameDbTarget
        ? "siteUsersDb uses the same verified physical target as siteDB"
        : "Create or verify siteUsersDb document library",
      executionClass: "browser-sharepoint",
      target: paths.usersDbRoot,
      status: sameDbTarget ? "skipped" : "planned",
      required: true,
      warning: sameDbTarget ? "same-library-as-siteDB" : undefined
    },
    {
      key: "sharepoint-folder-site-assets",
      label: "Create or verify siteAssets folder",
      executionClass: "browser-sharepoint",
      target: paths.siteAssetsRoot,
      status: "planned",
      required: true
    },
    {
      key: "sharepoint-folder-images",
      label: "Create or verify images folder",
      executionClass: "browser-sharepoint",
      target: paths.imagesRoot,
      status: "planned",
      required: true
    },
    {
      key: "sharepoint-folder-dist",
      label: "Create or verify final dist folder",
      executionClass: "browser-sharepoint",
      target: paths.finalDistRoot,
      status: "planned",
      required: true
    },
    {
      key: "sharepoint-folder-dist-assets",
      label: "Create or verify dist/assets folder",
      executionClass: "browser-sharepoint",
      target: `${paths.finalDistRoot}/assets`,
      status: "planned",
      required: true
    },
    {
      key: "builder-registry",
      label: "Mongo registry נוצר",
      executionClass: "mongo-backend",
      target: `${backendApiUrl || "(missing)"}/api/sites`,
      status: backendConfigured && backendApiUrl && credentialProbe.configured && backendUrlAllowed && !productionLocalhostBlocked ? "planned" : "blocked",
      required: true,
      blocker: !backendConfigured
        ? "Builder backend לא מוגדר בהגדרות HUB"
        : !backendApiUrl
          ? "backendApiUrl חסר"
          : !backendUrlAllowed
            ? "backend URL חסום בהגדרות"
            : productionLocalhostBlocked
              ? "localhost לא מותר לאתר production"
              : !credentialProbe.configured
                ? "credential reference חסר"
                : undefined
    },
    {
      key: "safe-collection",
      label: "safeCollectionName אומת",
      executionClass: "mongo-backend",
      target: builderSiteId || "(missing siteId)",
      status: builderSiteId ? "planned" : "blocked",
      required: true,
      blocker: builderSiteId ? undefined : "Builder siteId חסר"
    },
    ...seedDocs.map((doc) => ({
      key: `seed-${doc.key}`,
      label: `Seed ${doc.scope}:${doc.entityId}`,
      executionClass: "mongo-backend" as const,
      target: doc.key,
      status: "planned" as const,
      required: true
    })),
    {
      key: "runtime-config-upload",
      label: "runtime config תקין",
      executionClass: "browser-sharepoint",
      target: runtimePath,
      status: "planned",
      required: true
    },
    {
      key: "initial-browser-deploy",
      label: "Initial Browser Deploy after provisioning",
      executionClass: "browser-sharepoint",
      target: paths.finalDistRoot,
      status: "blocked",
      required: false,
      blocker: "לא ניתן לפרוס לפני שנוצרו siteDB / siteUsersDb / dist ואומת runtime config."
    }
  ];

  return {
    operation: "create-mongo-site",
    generatedAt: new Date().toISOString(),
    siteId: String(input._id || ""),
    siteCode,
    displayName: String(input.displayName || ""),
    storageBackend: "mongo",
    lifecycleStatus: String(input.lifecycleStatus || "draft"),
    provisioningStatus: String(input.provisioningStatus || "planned"),
    identity: {
      siteCode,
      builderSiteId,
      mongoSiteId: builderSiteId,
      siteIdentityKey,
      duplicateStatus: duplicate ? "duplicate" : "available",
      duplicate: duplicate ? {
        existingSiteId: String(duplicate._id),
        siteCode: duplicate.siteCode,
        displayName: duplicate.displayName,
        sharePointSiteUrl: duplicate.sharePointSiteUrl,
        runtimeConfigPath: duplicate.runtimeConfigPath,
        storageBackend: duplicate.storageBackend,
        builderSiteId: duplicate.builderSiteId,
        mongoSiteId: duplicate.mongoSiteId,
        safeCollectionName: duplicate.safeCollectionName
      } : undefined
    },
    resolvedPaths: paths,
    runtimeConfig: {
      path: runtimePath,
      url: runtimeUrl,
      fileName: runtimeConfigFileName(runtimePath),
      redactedPreview: {
        storageBackend: "mongo",
        backendApiUrl,
        siteId: builderSiteId,
        apiKey: credentialProbe.configured ? "[configured]" : "[missing]"
      },
      apiKeyStatus: credentialProbe.configured ? "configured" : "missing",
      backendApiUrlHost: redactBackendApiUrl(backendApiUrl)
    },
    sharePointHosting,
    builderBackend: {
      backendApiUrl,
      backendApiUrlHost: redactBackendApiUrl(backendApiUrl),
      label: configuredBackendOption?.label || "",
      environment: configuredBackendOption?.environment || "unknown",
      allowedBackendApiUrls: allowedBuilderBackendUrls(),
      backendUrlAllowed,
      backendConfigured,
      backendWillBeWrittenToRuntimeConfig: Boolean(backendApiUrl),
      credentialRef: credentialProbe.ref,
      credentialConfigured: credentialProbe.configured,
      siteId: builderSiteId,
      safeCollectionNameStrategy: String(input.safeCollectionName || "").trim() ? "verify-explicit" : "generated-by-builder-backend",
      expectedSafeCollectionName: String(input.safeCollectionName || "")
    },
    seedDocs,
    steps,
    blockers,
    warnings,
    summary: {
      totalSteps: steps.length,
      browserSharePointSteps: steps.filter((step) => step.executionClass === "browser-sharepoint").length,
      mongoBackendSteps: steps.filter((step) => step.executionClass === "mongo-backend").length,
      manualSteps: steps.filter((step) => step.executionClass === "manual").length,
      readyForPlanReview: blockers.filter((blocker) => blocker !== "site-physical-runtime-identity-duplicate").length === 0,
      readyForMongoBackendExecution: !blockers.some((blocker) => [
        "builder-backend-not-configured",
        "builder-backend-api-url-missing",
        "builder-backend-url-not-allowed",
        "production-localhost-backend-blocked",
        "builder-backend-credential-missing",
        "builder-site-id-missing",
        "initial-admins-missing"
      ].includes(blocker)),
      readyForBrowserSharePointExecution: Boolean(paths.sharePointSiteUrl && runtimePath),
      createsApprovalJob: false
    },
    readinessRules: [
      "האתר נרשם ב־HUB, אבל עדיין לא מוכן לפריסה.",
      "קודם יש ליצור את תשתית SharePoint של האתר.",
      "לא ניתן לפרוס לפני שנוצרו siteDB / siteUsersDb / dist.",
      "Mongo registry נוצר",
      "safeCollectionName אומת",
      "Mongo seed docs קיימים",
      "runtime config תקין",
      "האתר עדיין לא מוכן לשימוש",
      "האתר מוכן רק אחרי SharePoint hosting, runtime config, Mongo backend, seed docs, admins, backup capability ו־deploy/verified dist."
    ]
  };
}

export async function buildMongoSiteCreationPlan(siteId: string) {
  const site = await Site.findById(siteId);
  if (!site) throw new Error("site-not-found");
  return buildMongoSiteCreationPlanFromInput(siteInputFromDoc(site));
}

const findExistingSeedKeys = (payload: any) => {
  const results = Array.isArray(payload?.results) ? payload.results : [];
  return new Set(results.filter((item: any) => item?.ok).map((item: any) => String(item.key || "")));
};

const failedBatchItems = (payload: any) => {
  const results = Array.isArray(payload?.results) ? payload.results : [];
  return results
    .filter((item: any) => !item?.ok)
    .map((item: any) => ({ key: String(item.key || ""), error: String(item.message || item.error || "failed") }));
};

export async function executeMongoSiteCreation(siteId: string): Promise<MongoSiteCreationExecuteResult> {
  logger.info("sites", "Mongo-native site creation execution started", { siteId });
  const site = await Site.findById(siteId);
  if (!site) throw new Error("site-not-found");

  const plan = await buildMongoSiteCreationPlanFromInput(siteInputFromDoc(site));
  if (!plan.summary.readyForMongoBackendExecution) {
    const error = new Error("mongo-site-create-plan-not-ready") as Error & { details?: unknown };
    error.details = { blockers: plan.blockers, warnings: plan.warnings };
    throw error;
  }

  const credential = resolveBuilderApiCredential(site);
  site.storageBackend = "mongo";
  site.creationMode = "create-new";
  site.lifecycleStatus = "provisioning";
  site.provisioningStatus = "running";
  site.dataBackendStatus = "unknown";
  site.lastError = "";
  await site.save();

  const registry = await requestBuilderJson(plan.builderBackend.backendApiUrl, "/api/sites", credential.value, {
    method: "POST",
    body: JSON.stringify({
      siteId: plan.builderBackend.siteId,
      siteSlug: site.siteCode,
      displayName: site.displayName,
      status: "active"
    })
  });
  const registryPayload = registry.payload?.site || registry.payload?.data?.site || registry.payload?.data || registry.payload;
  const safeCollectionName = String(registryPayload?.safeCollectionName || site.safeCollectionName || "").trim();

  const beforeSeedRead = await requestBuilderJson(
    plan.builderBackend.backendApiUrl,
    `/api/sites/${encodeURIComponent(plan.builderBackend.siteId)}/legacy/batch-read`,
    credential.value,
    {
      method: "POST",
      body: JSON.stringify({ keys: plan.seedDocs.map((doc) => doc.key) })
    }
  );
  const existingSeedKeys = findExistingSeedKeys(beforeSeedRead.payload);
  const seedItems = plan.seedDocs
    .filter((doc) => !existingSeedKeys.has(doc.key))
    .map((doc) => ({
      key: doc.key,
      data: doc.data,
      expectedVersion: 0,
      allowEmptyOverwrite: true
    }));
  const seedWrite = seedItems.length
    ? await requestBuilderJson(
        plan.builderBackend.backendApiUrl,
        `/api/sites/${encodeURIComponent(plan.builderBackend.siteId)}/legacy/batch-write`,
        credential.value,
        {
          method: "POST",
          body: JSON.stringify({ items: seedItems })
        }
      )
    : { ok: true, url: "", payload: { ok: true, results: [] } };
  const seedFailures = failedBatchItems(seedWrite.payload);
  const seedStatus = seedFailures.length ? (seedFailures.length === seedItems.length ? "failed" : "partial") : "ok";
  const backups = await requestBuilderJson(
    plan.builderBackend.backendApiUrl,
    `/api/sites/${encodeURIComponent(plan.builderBackend.siteId)}/backups`,
    credential.value
  );
  const health = await runBuilderMongoHealthCheck(siteId);

  const saved = await Site.findById(siteId);
  if (saved) {
    saved.safeCollectionName = safeCollectionName || saved.safeCollectionName;
    saved.mongoSiteId = plan.builderBackend.siteId;
    saved.builderSiteId = plan.builderBackend.siteId;
    saved.storageBackend = "mongo";
    saved.authoritativeAdminSource = "mongo";
    saved.lifecycleStatus = seedStatus === "ok" && registry.ok ? "partially-created" : "failed";
    saved.provisioningStatus = seedStatus === "ok" && registry.ok ? "partially-created" : "failed";
    saved.status = "draft";
    saved.lastError = seedStatus === "ok" && registry.ok ? "" : "Mongo backend creation did not complete cleanly";
    await saved.save();
  }

  const result: MongoSiteCreationExecuteResult = {
    operation: "create-mongo-site-execute",
    executedAt: new Date().toISOString(),
    siteId,
    siteCode: site.siteCode,
    builderBackend: plan.builderBackend,
    registry: {
      status: registry.ok ? "ok" : "failed",
      safeCollectionName,
      evidence: registry
    },
    seed: {
      status: seedStatus,
      written: seedItems.map((item) => String(item.key)).filter((key) => !seedFailures.find((failure: { key: string }) => failure.key === key)),
      skippedExisting: Array.from(existingSeedKeys).map(String),
      failed: seedFailures,
      evidence: {
        beforeSeedRead,
        seedWrite
      }
    },
    backupCapability: {
      status: backups.ok ? "ok" : backups.status === 404 ? "missing" : "failed",
      evidence: backups
    },
    health,
    finalStatus: seedStatus === "ok" && registry.ok ? "partially-created" : "failed",
    warnings: [
      ...plan.warnings,
      backups.ok ? "" : "Backup capability לא אומתה; האתר לא יסומן ready עד שהיכולת תאומת.",
      "SharePoint runtime config ו־initial deploy עדיין דורשים browser SharePoint evidence."
    ].filter(Boolean)
  };

  logger.info("sites", "Mongo-native site creation execution completed", {
    siteId,
    siteCode: site.siteCode,
    registryStatus: result.registry.status,
    seedStatus: result.seed.status,
    safeCollectionName,
    writtenSeeds: result.seed.written.length,
    skippedExistingSeeds: result.seed.skippedExisting.length
  });

  return result;
}

export async function buildMongoRuntimeConfigContent(siteId: string) {
  const plan = await buildMongoSiteCreationPlan(siteId);
  const site = await Site.findById(siteId);
  if (!site) throw new Error("site-not-found");
  const credential = resolveBuilderApiCredential(site);
  if (!credential.configured) throw new Error("mongo-site-runtime-config-credential-missing");
  const text = buildMongoRuntimeConfigText(plan, credential.value);
  return {
    siteId,
    siteCode: plan.siteCode,
    runtimeConfigPath: plan.runtimeConfig.path,
    runtimeConfigUrl: plan.runtimeConfig.url,
    content: text,
    contentType: "application/json;charset=utf-8",
    sizeBytes: Buffer.byteLength(text, "utf8"),
    sha256: sha256(text),
    redactedPreview: plan.runtimeConfig.redactedPreview
  };
}

export async function recordMongoCreateBrowserEvidence(siteId: string, input: MongoCreateBrowserEvidenceInput) {
  if (input.connectorMode !== "browser-sharepoint") throw new Error("browser-sharepoint-evidence-connector-mode-required");
  const site = await Site.findById(siteId);
  if (!site) throw new Error("site-not-found");
  const paths = resolvePathsForInput(siteInputFromDoc(site));
  const capturedAt = input.capturedAt ? new Date(input.capturedAt) : new Date();
  const runtimeVerified = input.runtimeConfig?.uploaded === true && input.runtimeConfig?.verified === true;
  const health: Partial<SiteHealth> = {
    ...(site.health as Partial<SiteHealth>),
    siteDbExists: typeof input.hosting?.siteDbRootReady === "boolean"
      ? input.hosting.siteDbRootReady
      : input.hosting?.finalDistRootReady === true || site.health?.siteDbExists === true,
    usersDbExists: typeof input.hosting?.usersDbRootReady === "boolean"
      ? input.hosting.usersDbRootReady
      : site.health?.usersDbExists === true,
    distExists: input.hosting?.finalDistRootReady === true || site.health?.distExists === true,
    assetsExists: input.hosting?.assetsFolderReady === true || input.hosting?.siteAssetsRootReady === true || site.health?.assetsExists === true,
    indexExists: input.hosting?.indexHtmlVerified === true || site.health?.indexExists === true,
    runtimeConfigExists: runtimeVerified || site.health?.runtimeConfigExists === true,
    runtimeConfigValid: runtimeVerified || site.health?.runtimeConfigValid === true
  };

  site.health = health as any;
  site.runtimeConfigPath = input.runtimeConfig?.path || site.runtimeConfigPath || paths.runtimeConfigPath;
  site.runtimeConfigUrl = site.runtimeConfigUrl || paths.runtimeConfigUrl;
  site.runtimeConfigStatus = {
    ...(site.runtimeConfigStatus as any),
    path: site.runtimeConfigPath,
    url: site.runtimeConfigUrl,
    readStatus: runtimeVerified ? "configured" : site.runtimeConfigStatus?.readStatus || "unknown",
    storageBackend: "mongo",
    backendApiUrl: site.backendApiUrl,
    backendApiUrlHost: input.runtimeConfig?.backendApiUrlHost || redactBackendApiUrl(site.backendApiUrl),
    builderSiteId: input.runtimeConfig?.siteId || site.mongoSiteId || site.builderSiteId || site.siteCode,
    apiKeyStatus: input.runtimeConfig?.apiKeyConfigured ? "configured" : site.runtimeConfigStatus?.apiKeyStatus || "unknown",
    belongsToSite: true,
    warnings: input.warnings || [],
    checkedAt: capturedAt,
    evidence: {
      connectorMode: "browser-sharepoint",
      steps: input.steps || [],
      hosting: input.hosting || {},
      runtimeConfig: {
        ...input.runtimeConfig,
        apiKeyConfigured: Boolean(input.runtimeConfig?.apiKeyConfigured)
      }
    }
  };
  site.lastRuntimeConfigCheckAt = capturedAt;
  site.lastSharePointHostingVerificationAt = capturedAt;
  site.sharePointPathEvidence = {
    connectorMode: "browser-sharepoint",
    targetSharePointSiteUrl: input.targetSharePointSiteUrl || paths.sharePointSiteUrl,
    steps: input.steps || [],
    hosting: input.hosting || {}
  } as any;
  if (
    site.health.siteDbExists &&
    site.health.usersDbExists &&
    site.health.distExists &&
    site.health.indexExists &&
    site.health.runtimeConfigValid &&
    site.health.mongoSeedOk &&
    site.health.mongoBackupsOk
  ) {
    site.lifecycleStatus = "ready";
    site.provisioningStatus = "succeeded";
    site.status = "active";
  } else {
    site.lifecycleStatus = "partially-created";
    site.provisioningStatus = "partially-created";
    site.status = "draft";
  }
  await site.save();

  return {
    siteId,
    siteCode: site.siteCode,
    connectorMode: "browser-sharepoint" as const,
    capturedAt: capturedAt.toISOString(),
    runtimeConfigVerified: runtimeVerified,
    ready: site.lifecycleStatus === "ready",
    health: site.health
  };
}
