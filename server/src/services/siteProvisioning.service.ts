import { Site } from "../models/Site";
import { logger } from "../utils/logger";
import { resolveSiteBuilderPaths, SiteBuilderResolvedPaths } from "../utils/sitebuilderPaths";
import { getSharePointOperationCapabilities } from "./sharepointOperationClient";

type ProvisionStep = {
  key: string;
  label: string;
  mode: "read-write";
  target: string;
  status?: "planned" | "succeeded";
};

export type SiteProvisionPlan = {
  generatedAt: string;
  siteId: string;
  siteCode: string;
  resolvedPaths: SiteBuilderResolvedPaths;
  capabilities: ReturnType<typeof getSharePointOperationCapabilities>;
  steps: ProvisionStep[];
  summary: {
    totalSteps: number;
    writeRequired: boolean;
    requestDigestRequired: boolean;
    readyForProvisionExecution: boolean;
  };
  blockers: string[];
  notes: string[];
};

type AdminIdentity = {
  displayName?: string;
  name?: string;
  personalNumber?: string;
  email?: string;
  loginName?: string;
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

const initialUsers = (site: any) => {
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

const defaultTextFiles = (site: any, paths: SiteBuilderResolvedPaths) => [
  { path: paths.txtFiles.masterConfig, content: JSON.stringify({ schemaVersion: "1.0.0" }, null, 2) },
  { path: paths.txtFiles.users, content: JSON.stringify(initialUsers(site), null, 2) },
  { path: paths.txtFiles.events, content: JSON.stringify({ displayCount: 3, displayMode: "default", events: [] }, null, 2) },
  { path: paths.txtFiles.navigation, content: JSON.stringify([], null, 2) },
  { path: paths.txtFiles.siteContent, content: JSON.stringify({}, null, 2) },
  { path: paths.txtFiles.theme, content: JSON.stringify({}, null, 2) },
  { path: paths.txtFiles.widgets, content: JSON.stringify({}, null, 2) },
  { path: paths.txtFiles.externalLinks, content: JSON.stringify([], null, 2) },
  { path: paths.txtFiles.gantt, content: JSON.stringify(DEFAULT_GANTT_DATA, null, 2) }
];

const defaultBootstrapFiles = (site: any, paths: SiteBuilderResolvedPaths) => [
  {
    path: paths.deployManifestFile,
    content: JSON.stringify({
      schemaVersion: "1.0.0",
      kind: "sitebuilder-bootstrap-manifest",
      siteId: site._id.toString(),
      siteCode: site.siteCode,
      displayName: site.displayName,
      sharePointSiteUrl: paths.sharePointSiteUrl,
      finalAppUrl: paths.finalAppUrl,
      bootstrapUrl: paths.bootstrapUrl,
      createdAt: new Date().toISOString(),
      paths: {
        siteRoot: paths.siteRoot,
        siteDbRoot: paths.siteDbRoot,
        usersDbRoot: paths.usersDbRoot,
        finalDistRoot: paths.finalDistRoot,
        backupsRoot: paths.backupsRoot
      }
    }, null, 2)
  }
];

const resolvePathsForSite = async (siteId: string) => {
  const site = await Site.findById(siteId);
  if (!site) throw new Error("site-not-found");

  return {
    site,
    resolvedPaths: resolveSiteBuilderPaths({
      siteCode: site.siteCode,
      sharePointHost: site.sharePointHost,
      sharePointSiteUrl: site.sharePointSiteUrl,
      siteDbLibrary: site.siteDbLibrary,
      usersDbLibrary: site.usersDbLibrary,
      bootstrapLibrary: site.bootstrapLibrary,
      bootstrapFolder: site.bootstrapFolder,
      widgetsDbTarget: site.widgetsDbTarget
    })
  };
};

export async function buildSiteProvisionPlan(siteId: string): Promise<SiteProvisionPlan> {
  logger.info("sites", "Site provisioning plan build started", { siteId });
  const { site, resolvedPaths } = await resolvePathsForSite(siteId);
  const textFiles = defaultTextFiles(site, resolvedPaths);
  const bootstrapFiles = defaultBootstrapFiles(site, resolvedPaths);
  const capabilities = getSharePointOperationCapabilities();
  const steps = [
    { key: "library-site-db", label: "Ensure siteDB Document Library", mode: "read-write" as const, target: resolvedPaths.siteDbLibrary },
    { key: "library-users-db", label: "Ensure siteUsersDb Document Library", mode: "read-write" as const, target: resolvedPaths.usersDbLibrary },
    { key: "library-bootstrap", label: "Ensure bootstrap Document Library", mode: "read-write" as const, target: resolvedPaths.bootstrapLibrary },
    { key: "folder-site-assets", label: "Ensure siteAssets folder", mode: "read-write" as const, target: resolvedPaths.siteAssetsRoot },
    { key: "folder-images", label: "Ensure images folder", mode: "read-write" as const, target: resolvedPaths.imagesRoot },
    { key: "folder-dist", label: "Ensure final dist folder", mode: "read-write" as const, target: resolvedPaths.finalDistRoot },
    { key: "folder-backups", label: "Ensure backups folder", mode: "read-write" as const, target: resolvedPaths.backupsRoot },
    { key: "folder-bootstrap-root", label: "Ensure bootstrap folder", mode: "read-write" as const, target: resolvedPaths.bootstrapRoot },
    { key: "folder-bootstrap-dist", label: "Ensure bootstrap dist folder", mode: "read-write" as const, target: resolvedPaths.bootstrapDistRoot },
    ...textFiles.map((file) => ({
      key: `txt-${file.path.split("/").pop() || file.path}`,
      label: `Ensure TXT file ${file.path.split("/").pop() || file.path}`,
      mode: "read-write" as const,
      target: file.path
    })),
    ...bootstrapFiles.map((file) => ({
      key: `bootstrap-${file.path.split("/").pop() || file.path}`,
      label: `Ensure bootstrap file ${file.path.split("/").pop() || file.path}`,
      mode: "read-write" as const,
      target: file.path
    }))
  ];
  const readyForProvisionExecution = true;
  const blockers = [] as string[];

  const plan = {
    generatedAt: new Date().toISOString(),
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    resolvedPaths,
    capabilities,
    steps,
    summary: {
      totalSteps: steps.length,
      writeRequired: true,
      requestDigestRequired: true,
      readyForProvisionExecution
    },
    blockers,
    notes: [
      "This provisions Site Builder libraries, folders, and default TXT/JSON files inside an existing SharePoint web.",
      "It does not create a SharePoint site collection/subsite.",
      "It does not deploy dist assets; controlled deploy still requires a release artifact/manifest flow.",
      "It ensures bootstrap and backup folders plus an initial bootstrap manifest when they are missing.",
      "Execution runs through the active browser SharePoint session; the server records evidence only."
    ]
  };

  logger.info("sites", "Site provisioning plan built", {
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    totalSteps: plan.summary.totalSteps,
    readyForProvisionExecution: plan.summary.readyForProvisionExecution,
    blockers: plan.blockers
  });

  return plan;
}

export async function executeSiteProvisioning(siteId: string): Promise<any> {
  logger.info("sites", "Site provisioning execution started", { siteId });
  throw new Error("browser-sharepoint-required");
}
