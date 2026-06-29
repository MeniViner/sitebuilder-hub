import { Site } from "../models/Site";
import { resolveSiteBuilderPaths } from "../utils/sitebuilderPaths";
import { logger } from "../utils/logger";
import { AdminIdentity, buildAdminDiff, normalizeAdminKey } from "./admins.service";
import { createJob } from "./jobs.service";
import { readLiveAdminSources } from "./liveAdminSources.service";
import { assertSharePointWriteAvailable, writeSharePointTextFile } from "./sharepointOperationClient";
import { getDangerousValidationBypassEnvVar } from "./dangerousBackupBypass.service";

type ApprovalGatedJobInput = Parameters<typeof createJob>[0] & {
  requiresApproval: boolean;
  approvalSummary: Record<string, unknown>;
  approvalSnapshot: Record<string, unknown>;
};

const TXT_ADMIN_REPAIR_OWNER_DIRECT_MESSAGE =
  "TXT admin repair job queued in owner-direct mode.";
const TXT_ADMIN_REPAIR_ADVANCED_APPROVAL_MESSAGE =
  "TXT admin repair job requires approval because advanced approvals are enabled.";

const normalizeText = (value: unknown) => String(value || "").trim();

const toTxtAdmin = (admin: AdminIdentity & Record<string, unknown>, index: number) => {
  const displayName = normalizeText(admin.displayName || admin.name || admin.title);
  return {
    id: normalizeText(admin.id || admin.Id || index + 1),
    name: displayName,
    displayName,
    role: normalizeText(admin.role) || "admin",
    personalNumber: normalizeText(admin.personalNumber),
    email: normalizeText(admin.email),
    loginName: normalizeText(admin.loginName || admin.login)
  };
};

const dedupeForTxt = (admins: Array<AdminIdentity & Record<string, unknown>>) => {
  const seen = new Set<string>();
  const result: ReturnType<typeof toTxtAdmin>[] = [];

  admins.forEach((admin, index) => {
    const normalized = toTxtAdmin(admin, index);
    const key = normalizeAdminKey(normalized);
    if (seen.has(key)) return;
    seen.add(key);
    result.push({ ...normalized, id: String(result.length + 1) });
  });

  return result;
};

const findMissingTxtAdmins = (live: Awaited<ReturnType<typeof readLiveAdminSources>>) => {
  const missingKeys = new Set(live.adminDifferences.missingInTxt || []);
  const externalAdmins = [...live.siteCollectionAdmins, ...live.ownersGroupAdmins];
  return dedupeForTxt(externalAdmins.filter((admin) => missingKeys.has(normalizeAdminKey(admin))));
};

const getSiteAndPaths = async (siteId: string) => {
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

export async function buildTxtAdminRepairPlan(params: {
  siteId: string;
  requestedBy: string;
  notes?: string;
}) {
  logger.info("admins", "Building TXT admin repair plan", {
    siteId: params.siteId,
    requestedBy: params.requestedBy,
    notes: params.notes
  });
  const { site, resolvedPaths } = await getSiteAndPaths(params.siteId);
  const live = await readLiveAdminSources(site._id.toString(), {
    persist: false,
    capturedBy: params.requestedBy
  });

  const missingAdmins = findMissingTxtAdmins(live);
  const mergedAdmins = dedupeForTxt([...live.txtAdmins, ...missingAdmins]);
  const txtSource = live.sourceStatus.find((source) => source.source === "txt");
  const siteCollectionSource = live.sourceStatus.find((source) => source.source === "siteCollection");
  const ownersSource = live.sourceStatus.find((source) => source.source === "ownersGroup");
  const externalSourceOk = Boolean(siteCollectionSource?.ok || ownersSource?.ok);
  const changed = mergedAdmins.length !== live.txtAdmins.length || missingAdmins.length > 0;
  const blockers = [
    !txtSource?.ok ? "admin-txt-repair-txt-source-unavailable" : "",
    !externalSourceOk ? "admin-txt-repair-live-sources-unavailable" : "",
    !changed ? "admin-txt-repair-no-missing-admins" : ""
  ].filter(Boolean);
  const readyForRepair = blockers.length === 0;

  const plan = {
    generatedAt: new Date().toISOString(),
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    targetPath: resolvedPaths.txtFiles.users,
    requestedBy: params.requestedBy,
    notes: params.notes || "",
    sourceStatus: live.sourceStatus,
    missingAdmins,
    mergedAdmins,
    before: {
      txtCount: live.txtAdmins.length,
      siteCollectionCount: live.siteCollectionAdmins.length,
      ownersGroupCount: live.ownersGroupAdmins.length,
      adminsCount: live.adminsCount,
      missingInTxtCount: live.adminDifferences.missingInTxt.length
    },
    after: {
      txtCount: mergedAdmins.length,
      addedCount: missingAdmins.length
    },
    summary: {
      readyForRepair,
      changed,
      missingInTxtCount: live.adminDifferences.missingInTxt.length,
      addedCount: missingAdmins.length,
      targetPath: resolvedPaths.txtFiles.users
    },
    blockers,
    risks: [
      "TXT repair writes users_data.txt in SharePoint.",
      "TXT repair only updates the local TXT admins source; it does not modify Site Collection Admins or Owners Group.",
      "Approval should verify the missing admin identities before writing."
    ]
  };

  logger.info("admins", "TXT admin repair plan built", {
    siteId: plan.siteId,
    siteCode: plan.siteCode,
    targetPath: plan.targetPath,
    readyForRepair,
    missingAdmins: missingAdmins.length,
    blockers
  });

  return plan;
}

const assertPlanReadyForQueue = (plan: Awaited<ReturnType<typeof buildTxtAdminRepairPlan>>) => {
  const bypassEnvVar = getDangerousValidationBypassEnvVar("admin-repair-gates");
  if (bypassEnvVar) {
    logger.warn("admins", "TXT admin repair queue gates bypassed by dangerous env", {
      siteId: plan.siteId,
      siteCode: plan.siteCode,
      envVar: bypassEnvVar,
      blockers: plan.blockers
    });
    return;
  }
  if (plan.blockers.includes("admin-txt-repair-no-missing-admins")) {
    throw new Error("admin-txt-repair-not-needed");
  }
  if (!plan.summary.readyForRepair) {
    throw new Error("admin-txt-repair-plan-not-ready");
  }
};

export async function enqueueTxtAdminRepair(params: {
  siteId: string;
  createdBy: string;
  notes?: string;
}) {
  logger.info("admins", "Queueing TXT admin repair", {
    siteId: params.siteId,
    createdBy: params.createdBy,
    notes: params.notes
  });
  assertSharePointWriteAvailable();
  const plan = await buildTxtAdminRepairPlan({
    siteId: params.siteId,
    requestedBy: params.createdBy,
    notes: params.notes
  });
  assertPlanReadyForQueue(plan);

  const approvalSummary = {
    title: `Repair TXT admins for ${plan.siteCode}`,
    message: TXT_ADMIN_REPAIR_ADVANCED_APPROVAL_MESSAGE,
    operation: "admin-txt-repair",
    siteId: plan.siteId,
    siteCode: plan.siteCode,
    targetPath: plan.targetPath,
    addedCount: plan.after.addedCount,
    beforeTxtCount: plan.before.txtCount,
    afterTxtCount: plan.after.txtCount,
    requestedBy: params.createdBy
  };
  const approvalSnapshot = {
    capturedAt: new Date().toISOString(),
    operation: "admin-txt-repair",
    site: {
      id: plan.siteId,
      siteCode: plan.siteCode
    },
    targetPath: plan.targetPath,
    sourceStatus: plan.sourceStatus,
    missingAdmins: plan.missingAdmins,
    before: plan.before,
    after: plan.after,
    risks: plan.risks,
    notes: params.notes || ""
  };
  const jobInput: ApprovalGatedJobInput = {
    type: "repair",
    siteId: plan.siteId,
    createdBy: params.createdBy,
    requiresApproval: true,
    approvalSummary,
    approvalSnapshot,
    payload: {
      operation: "admin-txt-repair",
      targetPath: plan.targetPath,
      missingAdmins: plan.missingAdmins,
      expectedBeforeTxtCount: plan.before.txtCount,
      expectedAfterTxtCount: plan.after.txtCount,
      notes: params.notes || ""
    }
  };

  logger.info("jobs", "TXT admin repair job queued", {
    type: jobInput.type,
    siteId: plan.siteId,
    siteCode: plan.siteCode,
    targetPath: plan.targetPath,
    addedCount: plan.after.addedCount
  });
  const job = await createJob(jobInput);

  logger.info("admins", "TXT admin repair queued", {
    siteId: plan.siteId,
    siteCode: plan.siteCode,
    jobId: job._id.toString(),
    targetPath: plan.targetPath,
    requiresApproval: job.requiresApproval,
    approvalStatus: job.requiresApproval ? "pending" : "not-required"
  });
  const requiresApproval = Boolean(job.requiresApproval || job.status === "awaiting-approval");

  return {
    job,
    plan,
    requiresApproval,
    approvalStatus: requiresApproval ? "pending" : "not-required",
    message: requiresApproval ? "TXT admin repair job queued and requires approval because advanced approvals are enabled." : TXT_ADMIN_REPAIR_OWNER_DIRECT_MESSAGE
  };
}

export async function executeTxtAdminRepair(params: {
  siteId: string;
  jobId: string;
  requestedBy: string;
}) {
  logger.info("admins", "Executing TXT admin repair", {
    siteId: params.siteId,
    jobId: params.jobId,
    requestedBy: params.requestedBy
  });
  assertSharePointWriteAvailable();
  const { resolvedPaths } = await getSiteAndPaths(params.siteId);
  const plan = await buildTxtAdminRepairPlan({
    siteId: params.siteId,
    requestedBy: params.requestedBy
  });
  assertPlanReadyForQueue(plan);

  const text = `${JSON.stringify(plan.mergedAdmins, null, 2)}\n`;
  await writeSharePointTextFile(resolvedPaths, plan.targetPath, text);
  logger.info("admins", "TXT admin repair wrote users_data.txt", {
    siteId: plan.siteId,
    siteCode: plan.siteCode,
    targetPath: plan.targetPath,
    writtenCount: plan.mergedAdmins.length,
    addedCount: plan.after.addedCount
  });

  const postRead = await readLiveAdminSources(params.siteId, {
    persist: true,
    jobId: params.jobId,
    capturedBy: params.requestedBy
  });
  const txtSource = postRead.sourceStatus.find((source) => source.source === "txt");
  const completedSteps = [
    {
      step: "plan",
      status: "succeeded",
      target: plan.targetPath,
      beforeTxtCount: plan.before.txtCount,
      afterTxtCount: plan.after.txtCount,
      addedCount: plan.after.addedCount
    },
    {
      step: "write-users-data",
      status: "succeeded",
      target: plan.targetPath,
      writtenCount: plan.mergedAdmins.length
    },
    {
      step: "verify-live-read",
      status: txtSource?.ok ? "succeeded" : "failed",
      target: plan.targetPath,
      txtCount: postRead.txtAdmins.length,
      error: txtSource?.error || ""
    }
  ];

  if (!txtSource?.ok) {
    logger.error("errors", "TXT admin repair verification failed", {
      siteId: plan.siteId,
      siteCode: plan.siteCode,
      jobId: params.jobId,
      sourceStatus: postRead.sourceStatus
    });
    throw new Error("admin-txt-repair-verification-failed");
  }

  logger.info("admins", "TXT admin repair completed", {
    siteId: plan.siteId,
    siteCode: plan.siteCode,
    jobId: params.jobId,
    targetPath: plan.targetPath,
    addedCount: plan.after.addedCount,
    postTxtCount: postRead.txtAdmins.length
  });

  return {
    siteId: plan.siteId,
    siteCode: plan.siteCode,
    targetPath: plan.targetPath,
    before: plan.before,
    after: plan.after,
    missingAdmins: plan.missingAdmins,
    completedSteps,
    postRead: {
      capturedAt: postRead.capturedAt,
      adminsCount: postRead.adminsCount,
      sourceStatus: postRead.sourceStatus,
      adminDifferences: postRead.adminDifferences,
      sourceCounts: {
        txt: postRead.txtAdmins.length,
        siteCollection: postRead.siteCollectionAdmins.length,
        ownersGroup: postRead.ownersGroupAdmins.length
      }
    }
  };
}
