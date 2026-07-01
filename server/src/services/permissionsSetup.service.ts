import { Site } from "../models/Site";
import { logger } from "../utils/logger";
import { resolveSiteBuilderPaths, SiteBuilderResolvedPaths } from "../utils/sitebuilderPaths";
import { getSharePointOperationCapabilities } from "./sharepointOperationClient";

type PermissionStep = {
  key: string;
  label: string;
  target: string;
  status?: "planned" | "succeeded";
};

export type PermissionsSetupPlan = {
  generatedAt: string;
  siteId: string;
  siteCode: string;
  resolvedPaths: SiteBuilderResolvedPaths;
  capabilities: ReturnType<typeof getSharePointOperationCapabilities>;
  steps: PermissionStep[];
  notes: string[];
};

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

export async function buildPermissionsSetupPlan(siteId: string): Promise<PermissionsSetupPlan> {
  logger.info("sites", "Permissions setup plan build started", { siteId });
  const { site, resolvedPaths } = await resolveSite(siteId);

  const plan = {
    generatedAt: new Date().toISOString(),
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    resolvedPaths,
    capabilities: getSharePointOperationCapabilities(),
    steps: [
      {
        key: "resolve-members-group",
        label: "Resolve Associated Members Group",
        target: `${resolvedPaths.siteRoot}/_api/web/associatedmembergroup`
      },
      {
        key: "break-inheritance",
        label: "Break role inheritance on siteUsersDb root",
        target: resolvedPaths.usersDbRoot
      },
      {
        key: "grant-contribute",
        label: "Grant Contribute to Associated Members Group",
        target: resolvedPaths.usersDbRoot
      },
      {
        key: "write-marker",
        label: "Write permissions marker",
        target: resolvedPaths.permissionsMarkerFile
      }
    ],
    notes: [
      "This mirrors the original Site Builder siteUsersDb permissions setup.",
      "It grants Contribute role (1073741827) to the associated members group.",
      "It is a SharePoint write operation executed by the active browser session; the server records evidence only."
    ]
  };

  logger.info("sites", "Permissions setup plan built", {
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    steps: plan.steps.length,
    writeAvailable: plan.capabilities.writeAvailable
  });

  return plan;
}

export async function executePermissionsSetup(siteId: string): Promise<any> {
  logger.info("sites", "Permissions setup execution started", { siteId });
  throw new Error("browser-sharepoint-required");
}
