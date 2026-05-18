import { Site } from "../models/Site";
import { logger } from "../utils/logger";
import { resolveSiteBuilderPaths, SiteBuilderResolvedPaths } from "../utils/sitebuilderPaths";
import { buildPermissionsSetupPlan, executePermissionsSetup } from "./permissionsSetup.service";
import {
  ensureSharePointSiteCollection,
  getSharePointOperationCapabilities,
  SharePointSiteCollectionCreateInput
} from "./sharepointOperationClient";
import { buildSiteProvisionPlan, executeSiteProvisioning } from "./siteProvisioning.service";

export type SiteBootstrapOptions = {
  owner?: string;
  lcid?: number;
  webTemplate?: string;
  shareByEmailEnabled?: boolean;
  classification?: string;
  sensitivityLabel?: string;
  siteDesignId?: string;
  webTemplateExtensionId?: string;
  runProvisioning?: boolean;
  runPermissionsSetup?: boolean;
  reason?: string;
};

type SiteBootstrapStep = {
  key: string;
  label: string;
  mode: "read-write";
  target: string;
  phase: "site-create" | "provision" | "permissions";
  status?: "planned" | "succeeded";
};

export type SiteBootstrapPlan = {
  operation: "site-bootstrap";
  generatedAt: string;
  siteId: string;
  siteCode: string;
  targetWeb: {
    sharePointSiteUrl: string;
    siteRoot: string;
    creationMode: "site-collection";
    owner: string;
    webTemplate: string;
    lcid: number;
  };
  resolvedPaths: SiteBuilderResolvedPaths;
  capabilities: ReturnType<typeof getSharePointOperationCapabilities>;
  steps: SiteBootstrapStep[];
  summary: {
    totalSteps: number;
    createsSharePointSite: boolean;
    runsProvisioning: boolean;
    runsPermissionsSetup: boolean;
    writeRequired: boolean;
    requestDigestRequired: boolean;
    readyForBootstrapExecution: boolean;
  };
  blockers: string[];
  risks: string[];
  notes: string[];
};

const normalizeBoolean = (value: unknown, fallback: boolean) =>
  value === undefined || value === null ? fallback : Boolean(value);

export const normalizeSiteBootstrapOptions = (options: SiteBootstrapOptions = {}): SiteBootstrapOptions => ({
  owner: String(options.owner || "").trim(),
  lcid: Number.isFinite(Number(options.lcid)) ? Number(options.lcid) : 1033,
  webTemplate: String(options.webTemplate || "STS#3").trim() || "STS#3",
  shareByEmailEnabled: normalizeBoolean(options.shareByEmailEnabled, false),
  classification: String(options.classification || "").trim(),
  sensitivityLabel: String(options.sensitivityLabel || "").trim(),
  siteDesignId: String(options.siteDesignId || "").trim(),
  webTemplateExtensionId: String(options.webTemplateExtensionId || "").trim(),
  runProvisioning: normalizeBoolean(options.runProvisioning, true),
  runPermissionsSetup: normalizeBoolean(options.runPermissionsSetup, true),
  reason: String(options.reason || "").trim()
});

const resolveSite = async (siteId: string) => {
  const site = await Site.findById(siteId);
  if (!site) throw new Error("site-not-found");

  const resolvedPaths = resolveSiteBuilderPaths({
    siteCode: site.siteCode,
    sharePointHost: site.sharePointHost,
    sharePointSiteUrl: site.sharePointSiteUrl,
    siteDbLibrary: site.siteDbLibrary,
    usersDbLibrary: site.usersDbLibrary,
    bootstrapLibrary: site.bootstrapLibrary,
    bootstrapFolder: site.bootstrapFolder,
    widgetsDbTarget: site.widgetsDbTarget
  });

  return { site, resolvedPaths };
};

const withSiteDefaults = (site: any, options: SiteBootstrapOptions = {}) => {
  const normalized = normalizeSiteBootstrapOptions(options);
  return {
    ...normalized,
    owner: normalized.owner || String(site.ownerEmail || "").trim()
  };
};

const siteCreateSteps = (paths: SiteBuilderResolvedPaths): SiteBootstrapStep[] => [
  {
    key: "site-status",
    label: "Check SharePoint site creation status",
    mode: "read-write",
    phase: "site-create",
    target: paths.sharePointSiteUrl
  },
  {
    key: "site-create",
    label: "Create SharePoint site collection if missing",
    mode: "read-write",
    phase: "site-create",
    target: paths.sharePointSiteUrl
  },
  {
    key: "site-ready",
    label: "Wait for SharePoint site to be ready",
    mode: "read-write",
    phase: "site-create",
    target: paths.sharePointSiteUrl
  }
];

const stepFromProvision = (step: { key: string; label: string; target: string }): SiteBootstrapStep => ({
  key: `provision-${step.key}`,
  label: step.label,
  mode: "read-write",
  phase: "provision",
  target: step.target
});

const stepFromPermissions = (step: { key: string; label: string; target: string }): SiteBootstrapStep => ({
  key: `permissions-${step.key}`,
  label: step.label,
  mode: "read-write",
  phase: "permissions",
  target: step.target
});

export async function buildSiteBootstrapPlan(siteId: string, options: SiteBootstrapOptions = {}): Promise<SiteBootstrapPlan> {
  logger.info("sites", "SharePoint site bootstrap plan build started", { siteId });
  const { site, resolvedPaths } = await resolveSite(siteId);
  const resolvedOptions = withSiteDefaults(site, options);
  const capabilities = getSharePointOperationCapabilities();
  const provisionPlan = resolvedOptions.runProvisioning
    ? await buildSiteProvisionPlan(siteId)
    : undefined;
  const permissionsPlan = resolvedOptions.runPermissionsSetup
    ? await buildPermissionsSetupPlan(siteId)
    : undefined;

  const steps = [
    ...siteCreateSteps(resolvedPaths),
    ...(provisionPlan?.steps || []).map(stepFromProvision),
    ...(permissionsPlan?.steps || []).map(stepFromPermissions)
  ];
  const blockers = [
    !capabilities.writeAvailable ? "sharepoint-write-not-configured" : "",
    !capabilities.digest.canRequest ? "sharepoint-request-digest-not-available" : "",
    !resolvedOptions.owner ? "sharepoint-site-owner-missing" : ""
  ].filter(Boolean);

  const plan = {
    operation: "site-bootstrap" as const,
    generatedAt: new Date().toISOString(),
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    targetWeb: {
      sharePointSiteUrl: resolvedPaths.sharePointSiteUrl,
      siteRoot: resolvedPaths.siteRoot,
      creationMode: "site-collection" as const,
      owner: resolvedOptions.owner || "",
      webTemplate: resolvedOptions.webTemplate || "STS#3",
      lcid: Number(resolvedOptions.lcid || 1033)
    },
    resolvedPaths,
    capabilities,
    steps,
    summary: {
      totalSteps: steps.length,
      createsSharePointSite: true,
      runsProvisioning: resolvedOptions.runProvisioning !== false,
      runsPermissionsSetup: resolvedOptions.runPermissionsSetup !== false,
      writeRequired: true,
      requestDigestRequired: true,
      readyForBootstrapExecution: blockers.length === 0
    },
    blockers,
    risks: [
      "Creates a SharePoint site collection at the target URL if it is missing.",
      "Runs Site Builder provisioning that creates or ensures document libraries, folders, default TXT files, and bootstrap manifest.",
      resolvedOptions.runPermissionsSetup !== false
        ? "Runs permissions setup for siteUsersDb after provisioning."
        : ""
    ].filter(Boolean),
    notes: [
      "This is the full Hub-driven new-site bootstrap flow: create/ensure SharePoint site, then bootstrap Site Builder structure.",
      "Modern SharePoint site creation uses the SharePoint REST SPSiteManager endpoint and the existing Hub SharePoint auth material.",
      "If the target site already exists and SharePoint reports it as ready, execution reuses it and continues idempotent bootstrap steps."
    ]
  };

  logger.info("sites", "SharePoint site bootstrap plan built", {
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    totalSteps: plan.summary.totalSteps,
    readyForBootstrapExecution: plan.summary.readyForBootstrapExecution,
    blockers
  });

  return plan;
}

export async function executeSiteBootstrap(siteId: string, options: SiteBootstrapOptions = {}) {
  logger.info("sites", "SharePoint site bootstrap execution started", { siteId });
  const { site, resolvedPaths } = await resolveSite(siteId);
  const resolvedOptions = withSiteDefaults(site, options);
  if (!resolvedOptions.owner) throw new Error("site-bootstrap-owner-missing");

  const siteCreateInput: SharePointSiteCollectionCreateInput = {
    title: site.displayName || site.siteCode,
    description: site.description || "",
    owner: resolvedOptions.owner,
    lcid: Number(resolvedOptions.lcid || 1033),
    webTemplate: resolvedOptions.webTemplate || "STS#3",
    shareByEmailEnabled: resolvedOptions.shareByEmailEnabled,
    classification: resolvedOptions.classification,
    sensitivityLabel: resolvedOptions.sensitivityLabel,
    siteDesignId: resolvedOptions.siteDesignId,
    webTemplateExtensionId: resolvedOptions.webTemplateExtensionId
  };
  const siteCollection = await ensureSharePointSiteCollection(resolvedPaths, siteCreateInput);
  const completedSteps: SiteBootstrapStep[] = siteCreateSteps(resolvedPaths).map((step) => ({ ...step, status: "succeeded" as const }));

  const provisioning = resolvedOptions.runProvisioning !== false
    ? await executeSiteProvisioning(siteId)
    : undefined;
  if (provisioning) {
    completedSteps.push(...provisioning.completedSteps.map((step) => ({ ...stepFromProvision(step), status: "succeeded" as const })));
  }

  const permissions = resolvedOptions.runPermissionsSetup !== false
    ? await executePermissionsSetup(siteId)
    : undefined;
  if (permissions) {
    completedSteps.push(...permissions.completedSteps.map((step) => ({ ...stepFromPermissions(step), status: "succeeded" as const })));
  }

  const saved = await Site.findById(siteId);
  if (saved) {
    saved.status = saved.status === "draft" ? "active" : saved.status;
    saved.lastError = "";
    saved.lastHealthCheckAt = new Date();
    saved.resolvedPaths = resolvedPaths as any;
    await saved.save();
  }

  logger.info("sites", "SharePoint site bootstrap execution completed", {
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    action: siteCollection.action,
    completedSteps: completedSteps.length
  });

  return {
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    resolvedPaths,
    siteCollection,
    provisioning,
    permissions,
    completedSteps
  };
}
