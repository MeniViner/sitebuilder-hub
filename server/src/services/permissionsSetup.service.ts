import { Site } from "../models/Site";
import { logger } from "../utils/logger";
import { resolveSiteBuilderPaths, SiteBuilderResolvedPaths } from "../utils/sitebuilderPaths";
import {
  getRequestDigest,
  getSharePointOperationCapabilities,
  postSharePointJsonApi,
  readSharePointJsonApi,
  writeSharePointTextFile
} from "./sharepointOperationClient";

const CONTRIBUTE_ROLE_DEF_ID = 1073741827;

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

const escapeODataString = (value: string) => value.replace(/'/g, "''");

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

const listItemPrefix = (usersDbRoot: string) =>
  `/_api/web/GetFolderByServerRelativeUrl('${escapeODataString(usersDbRoot)}')/ListItemAllFields`;

const extractAssociatedGroupId = (payload: any) => {
  const group = payload?.d || payload;
  const id = Number(group?.Id || group?.id);
  if (!id) throw new Error("associated-members-group-id-missing");
  return id;
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
      "It is a SharePoint write operation and requires explicit write capability."
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

export async function executePermissionsSetup(siteId: string) {
  logger.info("sites", "Permissions setup execution started", { siteId });
  const { site, resolvedPaths } = await resolveSite(siteId);
  const digest = await getRequestDigest(resolvedPaths);
  const completedSteps: PermissionStep[] = [];

  const record = (step: PermissionStep) => {
    completedSteps.push({ ...step, status: "succeeded" });
    logger.info("sites", "Permissions setup step completed", {
      siteId: site._id.toString(),
      siteCode: site.siteCode,
      step: step.key,
      target: step.target
    });
  };

  const membersGroupPayload = await readSharePointJsonApi(resolvedPaths, "/_api/web/associatedmembergroup");
  const membersGroupId = extractAssociatedGroupId(membersGroupPayload);
  record({
    key: "resolve-members-group",
    label: "Resolve Associated Members Group",
    target: String(membersGroupId),
    status: "succeeded"
  });

  await postSharePointJsonApi(
    resolvedPaths,
    `${listItemPrefix(resolvedPaths.usersDbRoot)}/breakroleinheritance(copyRoleAssignments=true,clearSubscopes=true)`,
    undefined,
    digest
  );
  record({
    key: "break-inheritance",
    label: "Break role inheritance on siteUsersDb root",
    target: resolvedPaths.usersDbRoot,
    status: "succeeded"
  });

  await postSharePointJsonApi(
    resolvedPaths,
    `${listItemPrefix(resolvedPaths.usersDbRoot)}/roleassignments/addroleassignment(principalid=${membersGroupId},roledefid=${CONTRIBUTE_ROLE_DEF_ID})`,
    undefined,
    digest
  );
  record({
    key: "grant-contribute",
    label: "Grant Contribute to Associated Members Group",
    target: resolvedPaths.usersDbRoot,
    status: "succeeded"
  });

  await writeSharePointTextFile(
    resolvedPaths,
    resolvedPaths.permissionsMarkerFile,
    JSON.stringify({
      status: "ok",
      configuredAt: new Date().toISOString(),
      membersGroupId,
      roleDefId: CONTRIBUTE_ROLE_DEF_ID
    }, null, 2),
    digest
  );
  record({
    key: "write-marker",
    label: "Write permissions marker",
    target: resolvedPaths.permissionsMarkerFile,
    status: "succeeded"
  });

  site.health = {
    ...(site.health as any),
    permissionsOk: true
  };
  site.sharePointStatus.permissionsStatus = "ok";
  site.lastHealthCheckAt = new Date();
  site.lastError = "";
  await site.save();
  logger.info("sites", "Permissions setup execution completed", {
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
