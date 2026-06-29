import { Types } from "mongoose";
import { Release } from "../models/Release";
import { Site } from "../models/Site";
import { SiteVersionDeployment } from "../models/SiteVersionDeployment";
import { compareSemver, bumpVersion } from "../utils/version";
import { createJob } from "./jobs.service";
import { assertSharePointWriteAvailable } from "./sharepointOperationClient";
import { logger } from "../utils/logger";
import { assertReleaseArtifactReady, buildSiteDeployPlan } from "./deployArtifact.service";
import { assertRecentVerifiedBackupForDangerousWrite, BackupSafetySnapshot } from "./writeSafety.service";
import {
  buildDeployPolicy,
  buildLocalDevDeploySafetySnapshot,
  DeployMode,
  DeployPolicySnapshot,
  DeploySafetySnapshot
} from "./deployPolicy.service";
import { getDangerousValidationBypassEnvVar, isDangerousValidationBypassEnabled } from "./dangerousBackupBypass.service";

export type BatchDeployTargetMode = "single" | "selected" | "all";
export type BatchDeployTargetStatus = "ready" | "warning" | "blocked" | "up_to_date";
export type SharePointConnectorMode = "backend-sharepoint" | "browser-sharepoint";

export type BatchDeployPlanRow = {
  siteId: string;
  siteCode: string;
  displayName: string;
  environment: string;
  currentVersion: string;
  targetVersion: string;
  alreadyUpToDate: boolean;
  included: boolean;
  status: BatchDeployTargetStatus;
  blockers: string[];
  warnings: string[];
  plan?: Awaited<ReturnType<typeof buildSiteDeployPlan>>;
};

export type BatchDeployPlan = {
  generatedAt: string;
  dryRun: true;
  releaseId: string;
  releaseVersion: string;
  targetMode: BatchDeployTargetMode;
  targetSiteIds: string[];
  deployMode: DeployMode;
  connectorMode: SharePointConnectorMode;
  allowDeployWithoutBackup: boolean;
  summary: {
    totalSelectedSites: number;
    readySites: number;
    blockedSites: number;
    warningSites: number;
    alreadyUpToDateSites: number;
    executionReady: boolean;
  };
  results: BatchDeployPlanRow[];
  blockers: string[];
  warnings: string[];
};

type ApprovalGatedJobInput = Parameters<typeof createJob>[0] & {
  requiresApproval: boolean;
  approvalSummary: Record<string, unknown>;
  approvalSnapshot: Record<string, unknown>;
};

const DEPLOY_OWNER_DIRECT_MESSAGE = "Deploy job queued in owner-direct mode. SharePoint upload, read-back verification, post-deploy health, audit, logs, and evidence still run.";
const ROLLBACK_OWNER_DIRECT_MESSAGE = "Rollback job queued in owner-direct mode. Verify backup evidence before running rollback in production-safe mode.";
const DEPLOY_ADVANCED_APPROVAL_MESSAGE = "Deploy job requires approval because advanced approvals are enabled.";
const ROLLBACK_ADVANCED_APPROVAL_MESSAGE = "Rollback job requires approval because advanced approvals are enabled.";

const buildDeployApproval = (params: {
  site: any;
  release: any;
  deployment: any;
  createdBy: string;
  mode?: "deploy" | "rollback";
  reason?: string;
  backupSafety: BackupSafetySnapshot | DeploySafetySnapshot;
  deployPolicy?: DeployPolicySnapshot;
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
      message: isRollback ? ROLLBACK_ADVANCED_APPROVAL_MESSAGE : DEPLOY_ADVANCED_APPROVAL_MESSAGE,
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
      deployPolicy: params.deployPolicy,
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

const assertDeployPolicyUsable = (deployPolicy: DeployPolicySnapshot) => {
  if (deployPolicy.blockers.length > 0) {
    throw new Error(deployPolicy.blockers[0]);
  }
};

const getSiteCurrentVersion = (site: any) => site.currentVersion || site.version || "0.1.0";

const getSiteEnvironment = (site: any) => String(site.environment || "unknown");

const normalizeTargetSiteIds = (targetSiteIds?: string[]) =>
  Array.from(new Set((targetSiteIds || []).map((id) => String(id || "").trim()).filter(Boolean)));

const resolveBatchTargetSites = async (params: {
  targetMode: BatchDeployTargetMode;
  targetSiteIds?: string[];
}) => {
  if (params.targetMode === "all") {
    return Site.find({ status: { $ne: "archived" } });
  }

  const targetSiteIds = normalizeTargetSiteIds(params.targetSiteIds);
  if (params.targetMode === "single" && targetSiteIds.length !== 1) {
    throw new Error("batch-deploy-single-target-required");
  }
  if (params.targetMode === "selected" && targetSiteIds.length === 0) {
    throw new Error("batch-deploy-selected-targets-required");
  }

  const sites = await Site.find({ _id: { $in: targetSiteIds }, status: { $ne: "archived" } });
  const sitesById = new Map(sites.map((site: any) => [site._id.toString(), site]));
  const orderedSites = targetSiteIds.map((id) => sitesById.get(id)).filter(Boolean);
  if (orderedSites.length !== targetSiteIds.length) {
    throw new Error("batch-deploy-target-sites-not-found");
  }
  return orderedSites;
};

const dedupeMessages = (messages: string[]) => Array.from(new Set(messages.filter(Boolean)));
const BROWSER_DEPLOY_EXECUTION_NOTICE = "Browser deploy requires browser Digest and per-file upload verification at execution time.";
const actionableDeployMissingRequirements = (requirements: string[] = []) =>
  requirements.filter((message) => String(message || "").trim() !== BROWSER_DEPLOY_EXECUTION_NOTICE);

const buildBackupOverrideSafety = (operation: "deploy" | "rollback", reason?: string): DeploySafetySnapshot => ({
  ...buildLocalDevDeploySafetySnapshot(operation),
  reason: reason || `Dangerous backup override accepted for ${operation}.`
});

const assertRollbackTargetOlder = (site: any, release: any) => {
  const currentVersion = getSiteCurrentVersion(site);
  if (release.version === currentVersion) {
    const bypassEnvVar = getDangerousValidationBypassEnvVar("deploy-plan-blockers");
    if (bypassEnvVar) {
      logger.warn("releases", "Rollback same-version guard bypassed by dangerous env", {
        siteId: site._id.toString(),
        siteCode: site.siteCode,
        currentVersion,
        targetVersion: release.version,
        envVar: bypassEnvVar
      });
      return currentVersion;
    }
    logger.warn("releases", "Rollback rejected because target version equals current version", {
      siteId: site._id.toString(),
      siteCode: site.siteCode,
      currentVersion,
      targetVersion: release.version
    });
    throw new Error("rollback-target-version-same-as-current");
  }
  if (compareSemver(release.version, currentVersion) >= 0) {
    const bypassEnvVar = getDangerousValidationBypassEnvVar("deploy-plan-blockers");
    if (bypassEnvVar) {
      logger.warn("releases", "Rollback target ordering guard bypassed by dangerous env", {
        siteId: site._id.toString(),
        siteCode: site.siteCode,
        currentVersion,
        targetVersion: release.version,
        envVar: bypassEnvVar
      });
      return currentVersion;
    }
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
    version = bumpVersion(base, input.releaseType);
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

export async function buildBatchDeployPlan(params: {
  releaseId: string;
  targetMode: BatchDeployTargetMode;
  targetSiteIds?: string[];
  deployMode?: DeployMode | string;
  connectorMode?: SharePointConnectorMode | string;
  allowDeployWithoutBackup?: boolean;
}) {
  logger.info("releases", "Building batch deploy plan", {
    releaseId: params.releaseId,
    targetMode: params.targetMode,
    targetSiteIds: normalizeTargetSiteIds(params.targetSiteIds),
    deployMode: params.deployMode,
    connectorMode: params.connectorMode,
    allowDeployWithoutBackup: Boolean(params.allowDeployWithoutBackup)
  });

  const release = await Release.findById(params.releaseId);
  if (!release) throw new Error("release-not-found");

  const deployPolicy = buildDeployPolicy(params.deployMode || "local-dev-owner");
  const connectorMode: SharePointConnectorMode = params.connectorMode === "browser-sharepoint" ? "browser-sharepoint" : "backend-sharepoint";
  const backupOverrideAllowed = Boolean(params.allowDeployWithoutBackup && deployPolicy.localDevOwnerMode && connectorMode === "browser-sharepoint");
  const deployPlanBypassEnvVar = getDangerousValidationBypassEnvVar("deploy-plan-blockers");
  const deployPlanBlockersBypassed = Boolean(deployPlanBypassEnvVar);
  const sites = await resolveBatchTargetSites({
    targetMode: params.targetMode,
    targetSiteIds: params.targetSiteIds
  });
  const targetSiteIds = sites.map((site: any) => site._id.toString());
  const releaseArtifactRef = String(release.artifactRef || "").trim();

  const results: BatchDeployPlanRow[] = [];
  for (const site of sites as any[]) {
    const siteId = site._id.toString();
    const currentVersion = getSiteCurrentVersion(site);
    const versionComparison = compareSemver(currentVersion, release.version);
    const baseRow = {
      siteId,
      siteCode: site.siteCode,
      displayName: site.displayName,
      environment: getSiteEnvironment(site),
      currentVersion,
      targetVersion: release.version
    };

    if (versionComparison === 0) {
      results.push({
        ...baseRow,
        alreadyUpToDate: true,
        included: false,
        status: "up_to_date",
        blockers: [],
        warnings: ["האתר כבר נמצא בגרסה הזו ולא ייפרס מחדש."]
      });
      continue;
    }

    if (versionComparison > 0) {
      results.push({
        ...baseRow,
        alreadyUpToDate: false,
        included: deployPlanBlockersBypassed,
        status: deployPlanBlockersBypassed ? "warning" : "blocked",
        blockers: deployPlanBlockersBypassed ? [] : ["האתר נמצא בגרסה חדשה יותר מהגרסה שנבחרה. השתמשו ב-Rollback מתוכנן במקום Deploy רגיל."],
        warnings: deployPlanBlockersBypassed
          ? [`${deployPlanBypassEnvVar}=true: newer-version deploy blocker bypassed.`]
          : []
      });
      continue;
    }

    if (!releaseArtifactRef) {
      results.push({
        ...baseRow,
        alreadyUpToDate: false,
        included: deployPlanBlockersBypassed,
        status: deployPlanBlockersBypassed ? "warning" : "blocked",
        blockers: deployPlanBlockersBypassed ? [] : ["Deploy cannot run because the release artifact is missing."],
        warnings: deployPlanBlockersBypassed
          ? [`${deployPlanBypassEnvVar}=true: missing artifact blocker bypassed for queueing; execution still needs real files.`]
          : []
      });
      continue;
    }

    try {
      const plan = await buildSiteDeployPlan(siteId, release._id.toString(), {
        deployMode: deployPolicy.mode,
        connectorMode
      });
      const blockers = dedupeMessages([
        ...deployPolicy.blockers,
        ...plan.blockers,
        ...actionableDeployMissingRequirements(plan.missingRequirements),
        !plan.summary.readyForDeployExecution ? "Dry-run did not pass all execution gates." : ""
      ]);
      const warnings = dedupeMessages([
        plan.targetInventory?.readOk === false ? "קריאת inventory ב-SharePoint חלקית; יש לבדוק stale files לפני ביצוע." : "",
        plan.summary.staleTargetFilesCount ? `${plan.summary.staleTargetFilesCount} קבצי יעד ישנים יישארו כברירת מחדל.` : "",
        plan.deployPolicy?.warning || ""
      ]);
      if (deployPolicy.requiresRecentVerifiedBackup) {
        try {
          await assertRecentVerifiedBackupForDangerousWrite({
            siteId: site._id,
            operation: "deploy"
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "recent-verified-backup-required";
          if (backupOverrideAllowed) {
            warnings.push("backup-override-accepted:deploy");
          } else {
            blockers.push(message);
          }
        }
      }
      const effectiveBlockers = deployPlanBlockersBypassed ? [] : blockers;
      const bypassWarnings = deployPlanBlockersBypassed && blockers.length
        ? [`${deployPlanBypassEnvVar}=true: ${blockers.length} dry-run blocker(s) bypassed.`, ...blockers]
        : [];
      const ready = effectiveBlockers.length === 0;
      const effectiveWarnings = [...warnings, ...bypassWarnings];
      results.push({
        ...baseRow,
        alreadyUpToDate: false,
        included: ready,
        status: ready ? (effectiveWarnings.length ? "warning" : "ready") : "blocked",
        blockers: effectiveBlockers,
        warnings: effectiveWarnings,
        plan
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "deploy-plan-failed";
      results.push({
        ...baseRow,
        alreadyUpToDate: false,
        included: deployPlanBlockersBypassed,
        status: deployPlanBlockersBypassed ? "warning" : "blocked",
        blockers: deployPlanBlockersBypassed ? [] : [message],
        warnings: deployPlanBlockersBypassed
          ? [`${deployPlanBypassEnvVar}=true: deploy plan error bypassed for queueing.`, message]
          : []
      });
    }
  }

  const readySites = results.filter((row) => row.status === "ready" || row.status === "warning").length;
  const blockedSites = results.filter((row) => row.status === "blocked").length;
  const warningSites = results.filter((row) => row.status === "warning").length;
  const alreadyUpToDateSites = results.filter((row) => row.status === "up_to_date").length;
  const plan: BatchDeployPlan = {
    generatedAt: new Date().toISOString(),
    dryRun: true,
    releaseId: release._id.toString(),
    releaseVersion: release.version,
    targetMode: params.targetMode,
    targetSiteIds,
    deployMode: deployPolicy.mode,
    connectorMode,
    allowDeployWithoutBackup: backupOverrideAllowed,
    summary: {
      totalSelectedSites: results.length,
      readySites,
      blockedSites,
      warningSites,
      alreadyUpToDateSites,
      executionReady: readySites > 0 && blockedSites === 0
    },
    results,
    blockers: dedupeMessages([
      blockedSites ? `${blockedSites} target site(s) are blocked.` : "",
      readySites === 0 ? "No target sites are ready for deploy execution." : "",
      ...deployPolicy.blockers
    ]),
    warnings: dedupeMessages([
      warningSites ? `${warningSites} target site(s) have warnings.` : "",
      alreadyUpToDateSites ? `${alreadyUpToDateSites} target site(s) are already up to date and will be skipped.` : ""
    ])
  };

  logger.info("releases", "Batch deploy plan built", {
    releaseId: plan.releaseId,
    releaseVersion: plan.releaseVersion,
    targetMode: plan.targetMode,
    totalSelectedSites: plan.summary.totalSelectedSites,
    readySites,
    blockedSites,
    warningSites,
    alreadyUpToDateSites,
    executionReady: plan.summary.executionReady
  });
  return plan;
}

const queueBatchDeployForSite = async (params: {
  site: any;
  release: any;
  deployPolicy: DeployPolicySnapshot;
  backupSafety: BackupSafetySnapshot | DeploySafetySnapshot;
  deployPlan?: Awaited<ReturnType<typeof buildSiteDeployPlan>>;
  createdBy: string;
}) => {
  const deployment = await SiteVersionDeployment.create({
    siteId: params.site._id,
    releaseId: params.release._id,
    fromVersion: getSiteCurrentVersion(params.site),
    toVersion: params.release.version,
    deploymentKind: "deploy",
    status: "queued",
    triggeredBy: params.createdBy,
    logLines: [{
      level: params.deployPolicy.localDevOwnerMode ? "warn" : "info",
      message: params.deployPolicy.localDevOwnerMode
        ? "Batch deployment queued in owner-direct mode; approval is skipped by policy."
        : "Batch deployment queued",
      at: new Date()
    }]
  });

  const approval = buildDeployApproval({
    site: params.site,
    release: params.release,
    deployment,
    createdBy: params.createdBy,
    backupSafety: params.backupSafety,
    deployPolicy: params.deployPolicy,
    deployPlan: params.deployPlan
  });
  const jobInput: Parameters<typeof createJob>[0] = {
    type: "version-upgrade",
    siteId: params.site._id.toString(),
    createdBy: params.createdBy,
    requiresApproval: params.deployPolicy.requiresApproval,
    approvalSummary: params.deployPolicy.requiresApproval ? approval.approvalSummary : undefined,
    approvalSnapshot: params.deployPolicy.requiresApproval ? approval.approvalSnapshot : {
      ...approval.approvalSnapshot,
      approvalSkipped: true,
      approvalSkippedReason: "owner-direct-mode"
    },
    payload: {
      releaseId: params.release._id.toString(),
      deploymentId: deployment._id.toString(),
      targetVersion: params.release.version,
      deployMode: params.deployPolicy.mode,
      deployPolicy: params.deployPolicy,
      backupSafety: params.backupSafety,
      batchDeploy: true
    }
  };

  const job = await createJob(jobInput);
  await SiteVersionDeployment.findByIdAndUpdate(deployment._id, { jobId: job._id });
  return { job, deployment };
};

export async function enqueueBatchDeploy(params: {
  releaseId: string;
  targetMode: BatchDeployTargetMode;
  targetSiteIds?: string[];
  deployMode?: DeployMode | string;
  connectorMode?: SharePointConnectorMode | string;
  allowDeployWithoutBackup?: boolean;
  confirmNoPartial?: boolean;
  createdBy: string;
}) {
  logger.info("releases", "Queueing batch deploy", {
    releaseId: params.releaseId,
    targetMode: params.targetMode,
    targetSiteIds: normalizeTargetSiteIds(params.targetSiteIds),
    deployMode: params.deployMode,
    connectorMode: params.connectorMode,
    allowDeployWithoutBackup: Boolean(params.allowDeployWithoutBackup),
    confirmNoPartial: params.confirmNoPartial
  });
  const plan = await buildBatchDeployPlan(params);
  const executableRows = plan.results.filter((row) => row.status === "ready" || row.status === "warning");
  if ((params.confirmNoPartial ?? true) && plan.summary.blockedSites > 0 && !isDangerousValidationBypassEnabled("deploy-plan-blockers")) {
    throw new Error("batch-deploy-plan-has-blockers");
  }
  if (executableRows.length === 0) {
    throw new Error("batch-deploy-plan-has-no-ready-sites");
  }

  const [release, sites] = await Promise.all([
    Release.findById(params.releaseId),
    Site.find({ _id: { $in: executableRows.map((row) => row.siteId) }, status: { $ne: "archived" } })
  ]);
  if (!release) throw new Error("release-not-found");

  const deployPolicy = buildDeployPolicy(plan.deployMode);
  assertDeployPolicyUsable(deployPolicy);
  assertSharePointWriteAvailable();
  await assertReleaseArtifactReady(release._id.toString());
  const backupOverrideForExecution = Boolean(plan.allowDeployWithoutBackup && deployPolicy.localDevOwnerMode && plan.connectorMode === "browser-sharepoint");

  const sitesById = new Map((sites as any[]).map((site) => [site._id.toString(), site]));
  const backupSafetyBySiteId = new Map<string, BackupSafetySnapshot | DeploySafetySnapshot>();
  for (const row of executableRows) {
    const site = sitesById.get(row.siteId);
    if (!site) throw new Error("batch-deploy-target-sites-not-found");
    const backupSafety = deployPolicy.requiresRecentVerifiedBackup && !backupOverrideForExecution
      ? await assertRecentVerifiedBackupForDangerousWrite({
          siteId: site._id,
          operation: "deploy"
        })
      : backupOverrideForExecution
        ? buildBackupOverrideSafety("deploy", "Dangerous no-backup deploy override accepted from browser-sharepoint dry-run.")
        : buildLocalDevDeploySafetySnapshot("deploy");
    backupSafetyBySiteId.set(row.siteId, backupSafety);
  }

  const jobs = [];
  const deployments = [];
  for (const row of executableRows) {
    const site = sitesById.get(row.siteId);
    const queued = await queueBatchDeployForSite({
      site,
      release,
      deployPolicy,
      backupSafety: backupSafetyBySiteId.get(row.siteId)!,
      deployPlan: row.plan,
      createdBy: params.createdBy
    });
    jobs.push(queued.job);
    deployments.push(queued.deployment);
  }

  logger.info("releases", "Batch deploy queued", {
    releaseId: release._id.toString(),
    version: release.version,
    queued: jobs.length,
    skippedUpToDate: plan.summary.alreadyUpToDateSites,
    requiresApproval: jobs.some((job) => job.requiresApproval)
  });
  return {
    plan,
    queued: jobs.length,
    skippedUpToDate: plan.summary.alreadyUpToDateSites,
    jobs,
    deployments,
    requiresApproval: jobs.some((job) => job.requiresApproval),
    approvalStatus: jobs.some((job) => job.requiresApproval) ? "pending" : "not-required",
    message: `${jobs.length} batch deploy job${jobs.length === 1 ? "" : "s"} queued.`
  };
}

export async function enqueueDeployAll(params: {
  releaseId: string;
  onlyOutdated: boolean;
  deployMode?: DeployMode | string;
  createdBy: string;
}) {
  logger.info("releases", "Queueing deploy all", {
    releaseId: params.releaseId,
    onlyOutdated: params.onlyOutdated,
    createdBy: params.createdBy
  });
  const release = await Release.findById(params.releaseId);
  if (!release) throw new Error("release-not-found");
  const deployPolicy = buildDeployPolicy(params.deployMode || "production-safe");
  assertDeployPolicyUsable(deployPolicy);
  assertSharePointWriteAvailable();
  await assertReleaseArtifactReady(release._id.toString());

  const sites = await Site.find({ status: { $ne: "archived" } });
  const targetSites = params.onlyOutdated
    ? sites.filter((site) => compareSemver(site.currentVersion || site.version || "0.1.0", release.version) < 0)
    : sites;

  const backupSafetyBySiteId = new Map<string, BackupSafetySnapshot | DeploySafetySnapshot>();
  const deployPlanBySiteId = new Map<string, Awaited<ReturnType<typeof buildSiteDeployPlan>>>();
  for (const site of targetSites) {
    const safety = deployPolicy.requiresRecentVerifiedBackup
      ? await assertRecentVerifiedBackupForDangerousWrite({
          siteId: site._id,
          operation: "deploy"
        })
      : buildLocalDevDeploySafetySnapshot("deploy");
    backupSafetyBySiteId.set(site._id.toString(), safety);
    const deployPlan = await buildSiteDeployPlan(site._id.toString(), release._id.toString(), {
      deployMode: deployPolicy.mode
    });
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
      deployPolicy,
      deployPlan: deployPlanBySiteId.get(site._id.toString())
    });
    const jobInput: ApprovalGatedJobInput = {
      type: "version-upgrade",
      siteId: site._id.toString(),
      createdBy: params.createdBy,
      requiresApproval: deployPolicy.requiresApproval,
      approvalSummary: approval.approvalSummary,
      approvalSnapshot: approval.approvalSnapshot,
      payload: {
        releaseId: release._id.toString(),
        deploymentId: deployment._id.toString(),
        targetVersion: release.version,
        deployMode: deployPolicy.mode,
        deployPolicy,
        backupSafety: backupSafetyBySiteId.get(site._id.toString())
      }
    };

    logger.info("jobs", deployPolicy.requiresApproval ? "Approval required for deploy job" : "Owner-direct deploy job", {
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
    logger.info("releases", "Deploy job queued", {
      siteId: site._id.toString(),
      siteCode: site.siteCode,
      releaseId: release._id.toString(),
      version: release.version,
      jobId: job._id.toString(),
      deploymentId: deployment._id.toString(),
      requiresApproval: job.requiresApproval
    });
    jobs.push(job);
  }

  logger.info("releases", "Deploy all queued", {
    releaseId: release._id.toString(),
    version: release.version,
    queued: jobs.length,
    scannedSites: sites.length,
    requiresApproval: jobs.some((job) => job.requiresApproval),
    approvalStatus: jobs.some((job) => job.requiresApproval) ? "pending" : "not-required"
  });
  return {
    queued: jobs.length,
    jobs,
    requiresApproval: jobs.some((job) => job.requiresApproval),
    approvalStatus: jobs.some((job) => job.requiresApproval) ? "pending" : "not-required",
    message: jobs.length
      ? `${jobs.length} deploy job${jobs.length === 1 ? "" : "s"} queued.`
      : "No deploy jobs were queued."
  };
}

export async function enqueueDeploySite(params: {
  siteId: string;
  releaseId: string;
  deployMode?: DeployMode | string;
  connectorMode?: SharePointConnectorMode | string;
  allowDeployWithoutBackup?: boolean;
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
  const deployPolicy = buildDeployPolicy(params.deployMode);
  const connectorMode: SharePointConnectorMode = params.connectorMode === "browser-sharepoint" ? "browser-sharepoint" : "backend-sharepoint";
  const backupOverrideAllowed = Boolean(params.allowDeployWithoutBackup && deployPolicy.localDevOwnerMode && connectorMode === "browser-sharepoint");
  assertDeployPolicyUsable(deployPolicy);
  assertSharePointWriteAvailable();
  await assertReleaseArtifactReady(release._id.toString());
  const deployPlanOptions = params.connectorMode
    ? { deployMode: deployPolicy.mode, connectorMode }
    : { deployMode: deployPolicy.mode };
  const deployPlan = await buildSiteDeployPlan(site._id.toString(), release._id.toString(), deployPlanOptions);
  const backupSafety = deployPolicy.requiresRecentVerifiedBackup && !backupOverrideAllowed
    ? await assertRecentVerifiedBackupForDangerousWrite({
        siteId: site._id,
        operation: "deploy"
      })
    : backupOverrideAllowed
      ? buildBackupOverrideSafety("deploy", "Dangerous no-backup deploy override accepted for browser-sharepoint site deploy.")
      : buildLocalDevDeploySafetySnapshot("deploy");

  const deployment = await SiteVersionDeployment.create({
    siteId: site._id,
    releaseId: release._id,
    fromVersion: getSiteCurrentVersion(site),
    toVersion: release.version,
    deploymentKind: "deploy",
    status: "queued",
    triggeredBy: params.createdBy,
    logLines: [{
      level: deployPolicy.localDevOwnerMode ? "warn" : "info",
      message: deployPolicy.localDevOwnerMode
        ? "Deployment queued in owner-direct mode; approval is skipped by policy."
        : "Deployment queued",
      at: new Date()
    }]
  });

  const approval = buildDeployApproval({ site, release, deployment, createdBy: params.createdBy, backupSafety, deployPolicy, deployPlan });
  const jobInput: Parameters<typeof createJob>[0] = {
    type: "version-upgrade",
    siteId: site._id.toString(),
    createdBy: params.createdBy,
    requiresApproval: deployPolicy.requiresApproval,
    approvalSummary: deployPolicy.requiresApproval ? approval.approvalSummary : undefined,
    approvalSnapshot: deployPolicy.requiresApproval ? approval.approvalSnapshot : {
      ...approval.approvalSnapshot,
      approvalSkipped: true,
      approvalSkippedReason: "owner-direct-mode"
    },
    payload: {
      releaseId: release._id.toString(),
      deploymentId: deployment._id.toString(),
      targetVersion: release.version,
      deployMode: deployPolicy.mode,
      deployPolicy,
      backupSafety
    }
  };

  logger.info("jobs", deployPolicy.requiresApproval ? "Approval required for deploy job" : "Owner-direct deploy job", {
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

  logger.info("releases", "Site deploy queued", {
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    releaseId: release._id.toString(),
    version: release.version,
    jobId: job._id.toString(),
    deploymentId: deployment._id.toString(),
    requiresApproval: deployPolicy.requiresApproval,
    approvalStatus: deployPolicy.requiresApproval ? "pending" : "not-required"
  });
  return {
    job,
    deployment,
    requiresApproval: deployPolicy.requiresApproval,
    approvalStatus: deployPolicy.requiresApproval ? "pending" : "not-required",
    deployMode: deployPolicy.mode,
    deployPolicy,
    message: deployPolicy.requiresApproval
      ? "Deploy job queued and requires approval because advanced approvals are enabled."
      : DEPLOY_OWNER_DIRECT_MESSAGE
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
  const deployPolicy = buildDeployPolicy(undefined, "rollback");
  const backupSafety = deployPolicy.requiresRecentVerifiedBackup
    ? await assertRecentVerifiedBackupForDangerousWrite({
        siteId: site._id,
        operation: "rollback"
      })
    : buildLocalDevDeploySafetySnapshot("rollback");

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
    deployPolicy,
    deployPlan
  });
  const jobInput: ApprovalGatedJobInput = {
    type: "version-rollback",
    siteId: site._id.toString(),
    createdBy: params.createdBy,
    requiresApproval: deployPolicy.requiresApproval,
    approvalSummary: approval.approvalSummary,
    approvalSnapshot: approval.approvalSnapshot,
    payload: {
      releaseId: release._id.toString(),
      deploymentId: deployment._id.toString(),
      targetVersion: release.version,
      rollback: true,
      rollbackReason: reason,
      deployPolicy,
      backupSafety
    }
  };

  logger.warn("jobs", deployPolicy.requiresApproval ? "Approval required for rollback job" : "Owner-direct rollback job", {
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
  const requiresApproval = Boolean(job.requiresApproval || job.status === "awaiting-approval");

  logger.warn("releases", "Site rollback queued", {
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    releaseId: release._id.toString(),
    fromVersion: currentVersion,
    targetVersion: release.version,
    jobId: job._id.toString(),
    deploymentId: deployment._id.toString(),
    requiresApproval,
    approvalStatus: requiresApproval ? "pending" : "not-required"
  });

  return {
    job,
    deployment,
    requiresApproval,
    approvalStatus: requiresApproval ? "pending" : "not-required",
    message: requiresApproval ? "Rollback job requires approval because advanced approvals are enabled." : ROLLBACK_OWNER_DIRECT_MESSAGE
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
