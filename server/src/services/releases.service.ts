import { Types } from "mongoose";
import { Release } from "../models/Release";
import { Site } from "../models/Site";
import { SiteVersionDeployment } from "../models/SiteVersionDeployment";
import { compareSemver, bumpPatch } from "../utils/version";
import { createJob } from "./jobs.service";
import { assertSharePointWriteAvailable } from "./sharepointOperationClient";
import { logger } from "../utils/logger";
import { assertReleaseArtifactReady, buildSiteDeployPlan } from "./deployArtifact.service";
import { assertRecentVerifiedBackupForDangerousWrite, BackupSafetySnapshot } from "./writeSafety.service";

type ApprovalGatedJobInput = Parameters<typeof createJob>[0] & {
  requiresApproval: true;
  approvalSummary: Record<string, unknown>;
  approvalSnapshot: Record<string, unknown>;
};

const DEPLOY_APPROVAL_MESSAGE = "Deploy job is awaiting approval before SharePoint files or site version metadata are changed.";
const ROLLBACK_APPROVAL_MESSAGE = "Rollback job is awaiting approval before an older release overwrites the live SharePoint dist files.";

const buildDeployApproval = (params: {
  site: any;
  release: any;
  deployment: any;
  createdBy: string;
  mode?: "deploy" | "rollback";
  reason?: string;
  backupSafety: BackupSafetySnapshot;
  deployPlan?: Awaited<ReturnType<typeof buildSiteDeployPlan>>;
}) => {
  const fromVersion = params.deployment.fromVersion || params.site.currentVersion || params.site.version || "0.1.0";
  const toVersion = params.deployment.toVersion || params.release.version;
  const isRollback = params.mode === "rollback";
  const targetDistInventory = (params.deployPlan as any)?.targetDistInventory || (params.deployPlan as any)?.targetInventory;
  const staleFilePolicy = (params.deployPlan as any)?.staleFilePolicy || targetDistInventory?.staleFilePolicy;

  return {
    approvalSummary: {
      title: isRollback
        ? `Rollback ${params.site.displayName || params.site.siteCode} to ${toVersion}`
        : `Deploy ${toVersion} to ${params.site.displayName || params.site.siteCode}`,
      message: isRollback ? ROLLBACK_APPROVAL_MESSAGE : DEPLOY_APPROVAL_MESSAGE,
      operation: isRollback ? "version-rollback" : "version-upgrade",
      siteId: params.site._id.toString(),
      siteCode: params.site.siteCode,
      releaseId: params.release._id.toString(),
      releaseVersion: params.release.version,
      fromVersion,
      toVersion,
      deploymentId: params.deployment._id.toString(),
      rollbackReason: isRollback ? params.reason || "" : undefined,
      requestedBy: params.createdBy
    },
    approvalSnapshot: {
      capturedAt: new Date().toISOString(),
      operation: isRollback ? "version-rollback" : "version-upgrade",
      site: {
        id: params.site._id.toString(),
        siteCode: params.site.siteCode,
        displayName: params.site.displayName,
        currentVersion: params.site.currentVersion || params.site.version || "0.1.0",
        targetVersion: toVersion,
        sharePointSiteUrl: params.site.sharePointSiteUrl
      },
      release: {
        id: params.release._id.toString(),
        version: params.release.version,
        releaseType: params.release.releaseType,
        artifactRef: params.release.artifactRef
      },
      deployment: {
        id: params.deployment._id.toString(),
        fromVersion,
        toVersion,
        status: params.deployment.status,
        deploymentKind: isRollback ? "rollback" : "deploy",
        rollbackReason: isRollback ? params.reason || "" : undefined
      },
      backupSafety: params.backupSafety,
      targetDistInventory: targetDistInventory
        ? {
            ...targetDistInventory,
            filesSample: targetDistInventory.filesSample?.slice?.(0, 30) || [],
            staleFiles: targetDistInventory.staleFiles?.slice?.(0, 100) || []
          }
        : undefined,
      staleFilePolicy,
      writeOperations: [
        isRollback
          ? "Validate and deploy the rollback release artifact to the SharePoint final dist folder"
          : "Validate and deploy the release artifact to the SharePoint final dist folder",
        "Update the deployment record with execution logs and verification results",
        "Update the site version fields and SharePoint deploy status"
      ],
      risks: isRollback
        ? [
            "Rollback overwrites live SharePoint dist files with the selected older release artifact.",
            "Rollback does not mirror-delete files that are absent from the rollback artifact.",
            targetDistInventory?.staleFilesCount
              ? `${targetDistInventory.staleFilesCount} stale target dist file(s) were detected and will be kept by default.`
              : "",
            "Rollback should be paired with a recent verified backup or restore point."
          ].filter(Boolean)
        : [
            "Deploy overwrites listed live SharePoint dist files.",
            "Deploy does not mirror-delete files that are absent from the release artifact.",
            targetDistInventory?.staleFilesCount
              ? `${targetDistInventory.staleFilesCount} stale target dist file(s) were detected and will be kept by default.`
              : "",
            "Deploy should be approved only after artifact validation passes."
          ].filter(Boolean)
    }
  };
};

const getSiteCurrentVersion = (site: any) => site.currentVersion || site.version || "0.1.0";

const assertRollbackTargetOlder = (site: any, release: any) => {
  const currentVersion = getSiteCurrentVersion(site);
  if (release.version === currentVersion) {
    logger.warn("releases", "Rollback rejected because target version equals current version", {
      siteId: site._id.toString(),
      siteCode: site.siteCode,
      currentVersion,
      targetVersion: release.version
    });
    throw new Error("rollback-target-version-same-as-current");
  }
  if (compareSemver(release.version, currentVersion) >= 0) {
    logger.warn("releases", "Rollback rejected because target release is not older than current version", {
      siteId: site._id.toString(),
      siteCode: site.siteCode,
      currentVersion,
      targetVersion: release.version
    });
    throw new Error("rollback-target-version-not-older");
  }
  return currentVersion;
};

export async function listReleases() {
  logger.debug("releases", "Listing releases");
  return Release.find({}).sort({ createdAt: -1 });
}

export async function getReleaseById(id: string) {
  logger.debug("releases", "Loading release by id", { id });
  return Release.findById(id);
}

export async function createRelease(input: {
  version?: string;
  releaseType: "patch" | "minor" | "major" | "hotfix";
  notes?: string;
  artifactRef?: string;
  autoIncrementPatchFrom?: string;
  createdBy: string;
}) {
  logger.info("releases", "Creating release", {
    requestedVersion: input.version,
    releaseType: input.releaseType,
    artifactRef: input.artifactRef,
    autoIncrementPatchFrom: input.autoIncrementPatchFrom,
    createdBy: input.createdBy
  });
  let version = String(input.version || "").trim();

  if (!version) {
    const base = input.autoIncrementPatchFrom || (await getLatestVersion()) || "0.1.0";
    version = bumpPatch(base);
  }

  const existing = await Release.findOne({ version });
  if (existing) {
    logger.warn("releases", "Duplicate release version rejected", { version });
    throw new Error("duplicate-release-version");
  }

  const release = await Release.create({
    version,
    releaseType: input.releaseType,
    notes: input.notes || "",
    artifactRef: input.artifactRef || "",
    createdBy: input.createdBy
  });
  logger.info("releases", "Release created", { releaseId: release._id.toString(), version: release.version });
  return release;
}

export async function getLatestVersion() {
  logger.debug("releases", "Resolving latest release version");
  const releases = await Release.find({}).select({ version: 1 }).lean();
  if (releases.length === 0) return "";

  releases.sort((a, b) => compareSemver(b.version, a.version));
  logger.debug("releases", "Latest release version resolved", { latestVersion: releases[0].version, releaseCount: releases.length });
  return releases[0].version;
}

export async function buildVersionStatus() {
  logger.info("releases", "Building version status");
  const latestVersion = await getLatestVersion();
  const sites = await Site.find({});

  const bySite = sites.map((site) => {
    const currentVersion = site.currentVersion || site.version || "0.1.0";
    const status = !latestVersion
      ? "unknown"
      : compareSemver(currentVersion, latestVersion) < 0
        ? "outdated"
        : "up_to_date";

    return {
      siteId: site._id.toString(),
      siteCode: site.siteCode,
      displayName: site.displayName,
      currentVersion,
      latestVersion,
      status
    };
  });

  const status = {
    latestVersion,
    totalSites: bySite.length,
    outdatedSites: bySite.filter((x) => x.status === "outdated").length,
    sites: bySite
  };
  logger.info("releases", "Version status built", {
    latestVersion,
    totalSites: status.totalSites,
    outdatedSites: status.outdatedSites
  });
  return status;
}

export async function enqueueDeployAll(params: {
  releaseId: string;
  onlyOutdated: boolean;
  createdBy: string;
}) {
  logger.info("releases", "Queueing deploy all", {
    releaseId: params.releaseId,
    onlyOutdated: params.onlyOutdated,
    createdBy: params.createdBy
  });
  const release = await Release.findById(params.releaseId);
  if (!release) throw new Error("release-not-found");
  assertSharePointWriteAvailable();
  await assertReleaseArtifactReady(release._id.toString());

  const sites = await Site.find({ status: { $ne: "archived" } });
  const targetSites = params.onlyOutdated
    ? sites.filter((site) => compareSemver(site.currentVersion || site.version || "0.1.0", release.version) < 0)
    : sites;

  const backupSafetyBySiteId = new Map<string, BackupSafetySnapshot>();
  const deployPlanBySiteId = new Map<string, Awaited<ReturnType<typeof buildSiteDeployPlan>>>();
  for (const site of targetSites) {
    const safety = await assertRecentVerifiedBackupForDangerousWrite({
      siteId: site._id,
      operation: "deploy"
    });
    backupSafetyBySiteId.set(site._id.toString(), safety);
    const deployPlan = await buildSiteDeployPlan(site._id.toString(), release._id.toString());
    deployPlanBySiteId.set(site._id.toString(), deployPlan);
  }

  const jobs = [];
  for (const site of targetSites) {
    const deployment = await SiteVersionDeployment.create({
      siteId: site._id,
      releaseId: release._id,
      fromVersion: getSiteCurrentVersion(site),
      toVersion: release.version,
      deploymentKind: "deploy",
      status: "queued",
      triggeredBy: params.createdBy,
      logLines: [{ level: "info", message: "Deployment queued", at: new Date() }]
    });

    const approval = buildDeployApproval({
      site,
      release,
      deployment,
      createdBy: params.createdBy,
      backupSafety: backupSafetyBySiteId.get(site._id.toString())!,
      deployPlan: deployPlanBySiteId.get(site._id.toString())
    });
    const jobInput: ApprovalGatedJobInput = {
      type: "version-upgrade",
      siteId: site._id.toString(),
      createdBy: params.createdBy,
      requiresApproval: true,
      approvalSummary: approval.approvalSummary,
      approvalSnapshot: approval.approvalSnapshot,
      payload: {
        releaseId: release._id.toString(),
        deploymentId: deployment._id.toString(),
        targetVersion: release.version
      }
    };

    logger.info("jobs", "Approval required for deploy job", {
      type: jobInput.type,
      siteId: site._id.toString(),
      siteCode: site.siteCode,
      releaseId: release._id.toString(),
      releaseVersion: release.version,
      deploymentId: deployment._id.toString(),
      backupSafety: backupSafetyBySiteId.get(site._id.toString()),
      staleTargetFilesCount: deployPlanBySiteId.get(site._id.toString())?.targetInventory?.staleFilesCount
    });

    const job = await createJob(jobInput);

    await SiteVersionDeployment.findByIdAndUpdate(deployment._id, { jobId: job._id });
    logger.info("releases", "Deploy job queued awaiting approval", {
      siteId: site._id.toString(),
      siteCode: site.siteCode,
      releaseId: release._id.toString(),
      version: release.version,
      jobId: job._id.toString(),
      deploymentId: deployment._id.toString(),
      requiresApproval: true
    });
    jobs.push(job);
  }

  logger.info("releases", "Deploy all queued", {
    releaseId: release._id.toString(),
    version: release.version,
    queued: jobs.length,
    scannedSites: sites.length,
    requiresApproval: true,
    approvalStatus: "pending"
  });
  return {
    queued: jobs.length,
    jobs,
    requiresApproval: true,
    approvalStatus: "pending",
    message: jobs.length
      ? `${jobs.length} deploy job${jobs.length === 1 ? "" : "s"} awaiting approval before SharePoint writes start.`
      : "No deploy jobs were queued."
  };
}

export async function enqueueDeploySite(params: {
  siteId: string;
  releaseId: string;
  createdBy: string;
}) {
  logger.info("releases", "Queueing deploy site", {
    siteId: params.siteId,
    releaseId: params.releaseId,
    createdBy: params.createdBy
  });
  const site = await Site.findById(params.siteId);
  if (!site) throw new Error("site-not-found");

  const release = await Release.findById(params.releaseId);
  if (!release) throw new Error("release-not-found");
  assertSharePointWriteAvailable();
  await assertReleaseArtifactReady(release._id.toString());
  const deployPlan = await buildSiteDeployPlan(site._id.toString(), release._id.toString());
  const backupSafety = await assertRecentVerifiedBackupForDangerousWrite({
    siteId: site._id,
    operation: "deploy"
  });

  const deployment = await SiteVersionDeployment.create({
    siteId: site._id,
    releaseId: release._id,
    fromVersion: getSiteCurrentVersion(site),
    toVersion: release.version,
    deploymentKind: "deploy",
    status: "queued",
    triggeredBy: params.createdBy,
    logLines: [{ level: "info", message: "Deployment queued", at: new Date() }]
  });

  const approval = buildDeployApproval({ site, release, deployment, createdBy: params.createdBy, backupSafety, deployPlan });
  const jobInput: ApprovalGatedJobInput = {
    type: "version-upgrade",
    siteId: site._id.toString(),
    createdBy: params.createdBy,
    requiresApproval: true,
    approvalSummary: approval.approvalSummary,
    approvalSnapshot: approval.approvalSnapshot,
    payload: {
      releaseId: release._id.toString(),
      deploymentId: deployment._id.toString(),
      targetVersion: release.version
    }
  };

  logger.info("jobs", "Approval required for deploy job", {
    type: jobInput.type,
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    releaseId: release._id.toString(),
    releaseVersion: release.version,
    deploymentId: deployment._id.toString(),
    backupSafety,
    staleTargetFilesCount: deployPlan?.targetInventory?.staleFilesCount
  });

  const job = await createJob(jobInput);

  await SiteVersionDeployment.findByIdAndUpdate(deployment._id, { jobId: job._id });

  logger.info("releases", "Site deploy queued awaiting approval", {
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    releaseId: release._id.toString(),
    version: release.version,
    jobId: job._id.toString(),
    deploymentId: deployment._id.toString(),
    requiresApproval: true,
    approvalStatus: "pending"
  });
  return {
    job,
    deployment,
    requiresApproval: true,
    approvalStatus: "pending",
    message: DEPLOY_APPROVAL_MESSAGE
  };
}

export async function enqueueRollbackSite(params: {
  siteId: string;
  releaseId: string;
  reason?: string;
  createdBy: string;
}) {
  const reason = String(params.reason || "").trim();
  logger.info("releases", "Queueing site rollback", {
    siteId: params.siteId,
    releaseId: params.releaseId,
    createdBy: params.createdBy,
    reason
  });

  const site = await Site.findById(params.siteId);
  if (!site) throw new Error("site-not-found");

  const release = await Release.findById(params.releaseId);
  if (!release) throw new Error("release-not-found");

  const currentVersion = assertRollbackTargetOlder(site, release);

  assertSharePointWriteAvailable();
  await assertReleaseArtifactReady(release._id.toString());
  const deployPlan = await buildSiteDeployPlan(site._id.toString(), release._id.toString());
  const backupSafety = await assertRecentVerifiedBackupForDangerousWrite({
    siteId: site._id,
    operation: "rollback"
  });

  const deployment = await SiteVersionDeployment.create({
    siteId: site._id,
    releaseId: release._id,
    fromVersion: currentVersion,
    toVersion: release.version,
    deploymentKind: "rollback",
    rollbackReason: reason,
    status: "queued",
    triggeredBy: params.createdBy,
    logLines: [{ level: "warn", message: reason ? `Rollback queued: ${reason}` : "Rollback queued", at: new Date() }]
  });

  const approval = buildDeployApproval({
    site,
    release,
    deployment,
    createdBy: params.createdBy,
    mode: "rollback",
    reason,
    backupSafety,
    deployPlan
  });
  const jobInput: ApprovalGatedJobInput = {
    type: "version-rollback",
    siteId: site._id.toString(),
    createdBy: params.createdBy,
    requiresApproval: true,
    approvalSummary: approval.approvalSummary,
    approvalSnapshot: approval.approvalSnapshot,
    payload: {
      releaseId: release._id.toString(),
      deploymentId: deployment._id.toString(),
      targetVersion: release.version,
      rollback: true,
      rollbackReason: reason
    }
  };

  logger.warn("jobs", "Approval required for rollback job", {
    type: jobInput.type,
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    releaseId: release._id.toString(),
    releaseVersion: release.version,
    fromVersion: currentVersion,
    deploymentId: deployment._id.toString(),
    reason,
    backupSafety,
    staleTargetFilesCount: deployPlan?.targetInventory?.staleFilesCount
  });

  const job = await createJob(jobInput);
  await SiteVersionDeployment.findByIdAndUpdate(deployment._id, { jobId: job._id });

  logger.warn("releases", "Site rollback queued awaiting approval", {
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    releaseId: release._id.toString(),
    fromVersion: currentVersion,
    targetVersion: release.version,
    jobId: job._id.toString(),
    deploymentId: deployment._id.toString(),
    requiresApproval: true,
    approvalStatus: "pending"
  });

  return {
    job,
    deployment,
    requiresApproval: true,
    approvalStatus: "pending",
    message: ROLLBACK_APPROVAL_MESSAGE
  };
}

export async function buildRollbackSitePlan(params: {
  siteId: string;
  releaseId: string;
  reason?: string;
}) {
  logger.info("releases", "Building rollback plan", {
    siteId: params.siteId,
    releaseId: params.releaseId,
    reason: params.reason
  });
  const [site, release] = await Promise.all([
    Site.findById(params.siteId),
    Release.findById(params.releaseId)
  ]);

  if (!site) throw new Error("site-not-found");
  if (!release) throw new Error("release-not-found");

  const currentVersion = assertRollbackTargetOlder(site, release);
  const plan = await buildSiteDeployPlan(params.siteId, params.releaseId);

  return {
    ...plan,
    rollback: {
      fromVersion: currentVersion,
      toVersion: release.version,
      reason: params.reason || "",
      risks: [
        "Rollback overwrites live SharePoint dist files with the selected older release artifact.",
        "Rollback does not mirror-delete files that are absent from the rollback artifact.",
        "Rollback should be approved only after confirming recent backup or restore evidence."
      ]
    }
  };
}

export async function listSiteDeployments(siteId: string) {
  logger.debug("releases", "Listing site deployments", { siteId });
  if (!Types.ObjectId.isValid(siteId)) {
    logger.warn("releases", "Invalid site id for deployment list", { siteId });
    return [];
  }
  return SiteVersionDeployment.find({ siteId: new Types.ObjectId(siteId) }).sort({ createdAt: -1 });
}
