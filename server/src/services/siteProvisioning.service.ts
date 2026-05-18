import { Site } from "../models/Site";
import { logger } from "../utils/logger";
import { resolveSiteBuilderPaths, SiteBuilderResolvedPaths } from "../utils/sitebuilderPaths";
import {
  ensureDocumentLibrary,
  ensureSharePointFolderHierarchy,
  ensureSharePointTextFile,
  getRequestDigest,
  getSharePointOperationCapabilities,
} from "./sharepointOperationClient";

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

const defaultTextFiles = (paths: SiteBuilderResolvedPaths) => [
  { path: paths.txtFiles.masterConfig, content: JSON.stringify({ schemaVersion: "1.0.0" }, null, 2) },
  { path: paths.txtFiles.users, content: JSON.stringify([], null, 2) },
  { path: paths.txtFiles.events, content: JSON.stringify({ displayCount: 3, displayMode: "default", events: [] }, null, 2) },
  { path: paths.txtFiles.navigation, content: JSON.stringify([], null, 2) },
  { path: paths.txtFiles.siteContent, content: JSON.stringify({}, null, 2) },
  { path: paths.txtFiles.theme, content: JSON.stringify({}, null, 2) },
  { path: paths.txtFiles.widgets, content: JSON.stringify({}, null, 2) },
  { path: paths.txtFiles.externalLinks, content: JSON.stringify([], null, 2) }
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
  const textFiles = defaultTextFiles(resolvedPaths);
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
  const readyForProvisionExecution = capabilities.writeAvailable && capabilities.digest.canRequest;
  const blockers = [
    !capabilities.writeAvailable ? "sharepoint-write-not-configured" : "",
    !capabilities.digest.canRequest ? "sharepoint-request-digest-not-available" : ""
  ].filter(Boolean);

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
      "Execution is blocked unless SharePoint write capability and request digest acquisition are available."
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

export async function executeSiteProvisioning(siteId: string) {
  logger.info("sites", "Site provisioning execution started", { siteId });
  const { site, resolvedPaths } = await resolvePathsForSite(siteId);
  const digest = await getRequestDigest(resolvedPaths);
  const completedSteps: ProvisionStep[] = [];

  const record = (step: ProvisionStep) => {
    completedSteps.push({ ...step, status: "succeeded" });
    logger.info("sites", "Site provisioning step completed", {
      siteId: site._id.toString(),
      siteCode: site.siteCode,
      step: step.key,
      target: step.target
    });
  };

  await ensureDocumentLibrary(resolvedPaths, resolvedPaths.siteDbLibrary, digest);
  record({ key: "library-site-db", label: "Ensure siteDB Document Library", mode: "read-write", target: resolvedPaths.siteDbLibrary });

  await ensureDocumentLibrary(resolvedPaths, resolvedPaths.usersDbLibrary, digest);
  record({ key: "library-users-db", label: "Ensure siteUsersDb Document Library", mode: "read-write", target: resolvedPaths.usersDbLibrary });

  await ensureDocumentLibrary(resolvedPaths, resolvedPaths.bootstrapLibrary, digest);
  record({ key: "library-bootstrap", label: "Ensure bootstrap Document Library", mode: "read-write", target: resolvedPaths.bootstrapLibrary });

  for (const folder of [
    resolvedPaths.siteAssetsRoot,
    resolvedPaths.imagesRoot,
    resolvedPaths.finalDistRoot,
    resolvedPaths.backupsRoot,
    resolvedPaths.bootstrapRoot,
    resolvedPaths.bootstrapDistRoot
  ]) {
    await ensureSharePointFolderHierarchy(resolvedPaths, folder, digest);
    record({ key: `folder-${folder}`, label: "Ensure folder", mode: "read-write", target: folder });
  }

  for (const file of defaultTextFiles(resolvedPaths)) {
    try {
      await ensureSharePointTextFile(resolvedPaths, file.path, file.content, digest);
      record({ key: `txt-${file.path}`, label: "Ensure TXT file", mode: "read-write", target: file.path });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("sites", "Site provisioning TXT step failed", {
        siteId: site._id.toString(),
        siteCode: site.siteCode,
        path: file.path,
        error: message
      });
      throw new Error(`site-provision-text-file-failed:${file.path}:${message}`);
    }
  }

  for (const file of defaultBootstrapFiles(site, resolvedPaths)) {
    try {
      await ensureSharePointTextFile(resolvedPaths, file.path, file.content, digest);
      record({ key: `bootstrap-${file.path}`, label: "Ensure bootstrap file", mode: "read-write", target: file.path });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("sites", "Site provisioning bootstrap file step failed", {
        siteId: site._id.toString(),
        siteCode: site.siteCode,
        path: file.path,
        error: message
      });
      throw new Error(`site-provision-bootstrap-file-failed:${file.path}:${message}`);
    }
  }

  site.resolvedPaths = resolvedPaths as any;
  site.health = {
    ...(site.health as any),
    siteDbExists: true,
    usersDbExists: true,
    distExists: true,
    assetsExists: true,
    txtFilesExist: true
  };
  site.lastHealthCheckAt = new Date();
  site.sharePointStatus.documentLibrariesStatus = "ok";
  site.lastError = "";
  await site.save();
  logger.info("sites", "Site provisioning execution completed", {
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    completedSteps: completedSteps.length
  });

  return {
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    resolvedPaths,
    completedSteps
  };
}
