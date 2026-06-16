import { Types } from "mongoose";
import { Site } from "../models/Site";
import { SiteAdminSnapshot } from "../models/SiteAdminSnapshot";
import { createJob } from "./jobs.service";
import type { LiveAdminSourcesResult } from "./liveAdminSources.service";
import { logger } from "../utils/logger";
import { resolveSiteBuilderPaths } from "../utils/sitebuilderPaths";
import {
  addSharePointUserToGroup,
  assertSharePointWriteAvailable,
  ensureSharePointUser,
  getAssociatedOwnerGroupId,
  getRequestDigest,
  removeSharePointUserFromGroup,
  setSharePointSiteCollectionAdmin,
  writeSharePointTextFile
} from "./sharepointOperationClient";

export type AdminIdentity = {
  displayName?: string;
  personalNumber?: string;
  email?: string;
  loginName?: string;
};

type AdminSourceStatus = {
  source: "txt" | "siteCollection" | "ownersGroup";
  ok: boolean;
  count: number;
  error?: string;
};

type AdminSource = AdminSourceStatus["source"];
type SharePointAdminSource = Exclude<AdminSource, "txt">;

type AdminDifferences = {
  missingInTxt: string[];
  missingInSiteCollection: string[];
  missingInOwnersGroup: string[];
};

type AdminTxtRepairOptions = {
  capturedBy?: string;
  reason?: string;
};

export type AdminTxtRepairPlan = {
  operation: "admin-txt-repair";
  generatedAt: string;
  siteId: string;
  siteCode: string;
  siteDisplayName: string;
  targetPath: string;
  sourceStatus: AdminSourceStatus[];
  sourceCounts: {
    txt: number;
    siteCollection: number;
    ownersGroup: number;
  };
  missingInTxt: string[];
  missingAdmins: AdminIdentity[];
  mergedTxtAdmins: AdminIdentity[];
  additions: AdminIdentity[];
  toAdd: AdminIdentity[];
  unchanged: AdminIdentity[];
  diff: {
    additions: AdminIdentity[];
    missingInTxt: AdminIdentity[];
    removals: AdminIdentity[];
    unchanged: AdminIdentity[];
  };
  summary: {
    readyForRepair: boolean;
    targetPath: string;
    currentTxtAdminsCount: number;
    targetTxtAdminsCount: number;
    missingInTxtCount: number;
    additionsCount: number;
    removalsCount: number;
    unchangedCount: number;
  };
  liveRead: {
    capturedAt: string;
    adminsCount: number;
    sourceStatus: AdminSourceStatus[];
    adminDifferences: AdminDifferences;
  };
  notes: string[];
};

export const normalizeAdminKey = (admin: AdminIdentity) => {
  const login = String(admin.loginName || "").trim().toLowerCase();
  if (login) return `login:${login}`;
  const pn = String(admin.personalNumber || "").trim().toLowerCase();
  if (pn) return `pn:${pn}`;
  const email = String(admin.email || "").trim().toLowerCase();
  if (email) return `mail:${email}`;
  const name = String(admin.displayName || "").trim().toLowerCase();
  return `name:${name}`;
};

export const buildAdminDiff = (txt: AdminIdentity[], siteCollection: AdminIdentity[], owners: AdminIdentity[]) => {
  const txtSet = new Set(txt.map(normalizeAdminKey));
  const siteSet = new Set(siteCollection.map(normalizeAdminKey));
  const ownersSet = new Set(owners.map(normalizeAdminKey));

  return {
    missingInTxt: [...new Set([...siteSet, ...ownersSet])].filter((key) => !txtSet.has(key)),
    missingInSiteCollection: [...new Set([...txtSet, ...ownersSet])].filter((key) => !siteSet.has(key)),
    missingInOwnersGroup: [...new Set([...txtSet, ...siteSet])].filter((key) => !ownersSet.has(key))
  };
};

const getSiteId = (site: any) => site?._id?.toString?.() || String(site?._id || "");
const sharePointAdminSources = new Set<AdminSource>(["siteCollection", "ownersGroup"]);

const buildPathsForSite = (site: any) =>
  resolveSiteBuilderPaths({
    siteCode: site.siteCode,
    sharePointHost: site.sharePointHost,
    sharePointSiteUrl: site.sharePointSiteUrl,
    siteDbLibrary: site.siteDbLibrary,
    usersDbLibrary: site.usersDbLibrary,
    bootstrapLibrary: site.bootstrapLibrary,
    bootstrapFolder: site.bootstrapFolder,
    widgetsDbTarget: site.widgetsDbTarget
  });

const normalizeRepairAdmin = (admin: AdminIdentity): AdminIdentity => ({
  displayName: String(admin.displayName || "").trim(),
  personalNumber: String(admin.personalNumber || "").trim(),
  email: String(admin.email || "").trim(),
  loginName: String(admin.loginName || "").trim()
});

const isMeaningfulAdmin = (admin: AdminIdentity) => {
  const normalized = normalizeRepairAdmin(admin);
  return Boolean(normalized.displayName || normalized.personalNumber || normalized.email || normalized.loginName);
};

const adminIdentityTokens = (admin: AdminIdentity) =>
  [
    normalizeAdminKey(admin),
    String(admin.personalNumber || "").trim().toLowerCase(),
    String(admin.email || "").trim().toLowerCase(),
    String(admin.loginName || "").trim().toLowerCase()
  ].filter(Boolean);

const adminMatchesToken = (admin: AdminIdentity, token: string) => adminIdentityTokens(admin).some((value) => value === token || value.endsWith(token));

const adminMatchesAnyToken = (admin: AdminIdentity, tokens: Set<string>) =>
  adminIdentityTokens(admin).some((value) => tokens.has(value));

const resolveSharePointLoginName = (admin: AdminIdentity) => {
  const normalized = normalizeRepairAdmin(admin);
  return normalized.loginName || normalized.email || normalized.personalNumber || normalized.displayName;
};

const sourceAdmins = (site: any, source: AdminSource) =>
  source === "txt"
    ? site.txtAdmins || []
    : source === "siteCollection"
      ? site.siteCollectionAdmins || []
      : site.ownersGroupAdmins || [];

const sourceLabel = (source: SharePointAdminSource) =>
  source === "siteCollection" ? "Site Collection Admins" : "Owners Group";

const resolveAdminForRemoval = (site: any, source: AdminSource | undefined, adminId: string): AdminIdentity => {
  const token = String(adminId || "").trim().toLowerCase();
  const sources: AdminSource[] = source ? [source] : ["txt", "siteCollection", "ownersGroup"];
  const match = sources.flatMap((item) => sourceAdmins(site, item)).find((admin: AdminIdentity) => adminMatchesToken(admin, token));
  if (match) return normalizeRepairAdmin(match);

  const raw = String(adminId || "").trim();
  return {
    displayName: "",
    personalNumber: /^s?\d{6,8}$/i.test(raw) ? raw : "",
    email: raw.includes("@") ? raw : "",
    loginName: raw
  };
};

const verifySharePointAdminMembership = (
  liveRead: LiveAdminSourcesResult,
  source: SharePointAdminSource,
  expectedAdmin: AdminIdentity,
  operation: "add" | "remove"
) => {
  const sourceStatus = liveRead.sourceStatus.find((item) => item.source === source);
  if (sourceStatus?.ok !== true) throw new Error(`admin-${source}-verification-source-failed`);

  const tokens = new Set(adminIdentityTokens(expectedAdmin));
  const rows = source === "siteCollection" ? liveRead.siteCollectionAdmins : liveRead.ownersGroupAdmins;
  const present = rows.some((admin) => adminMatchesAnyToken(admin, tokens));

  if (operation === "add" && !present) throw new Error(`admin-${source}-add-verification-failed`);
  if (operation === "remove" && present) throw new Error(`admin-${source}-remove-verification-failed`);
};

async function refreshLiveAdminsAfterSharePointWrite(params: {
  siteId: string;
  source: SharePointAdminSource;
  expectedAdmin: AdminIdentity;
  operation: "add" | "remove";
  capturedBy?: string;
}) {
  const readLiveAdminSources = await getLiveAdminReader();
  const liveRead = await readLiveAdminSources(params.siteId, {
    persist: true,
    capturedBy: params.capturedBy || "system"
  });
  verifySharePointAdminMembership(liveRead, params.source, params.expectedAdmin, params.operation);
  return liveRead;
}

const dedupeAdminsForRepair = (admins: AdminIdentity[]) => {
  const seen = new Set<string>();
  const result: AdminIdentity[] = [];

  for (const admin of admins.map(normalizeRepairAdmin).filter(isMeaningfulAdmin)) {
    const key = normalizeAdminKey(admin);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(admin);
  }

  return result;
};

const findAdminsByKeys = (keys: string[], ...sources: AdminIdentity[][]) => {
  const wanted = new Set(keys);
  const found: AdminIdentity[] = [];
  const seen = new Set<string>();

  for (const admin of sources.flat().map(normalizeRepairAdmin).filter(isMeaningfulAdmin)) {
    const key = normalizeAdminKey(admin);
    if (!wanted.has(key) || seen.has(key)) continue;
    seen.add(key);
    found.push(admin);
  }

  return found;
};

const sourceCount = (status: AdminSourceStatus[], source: AdminSourceStatus["source"], fallback: number) =>
  status.find((item) => item.source === source)?.count ?? fallback;

const getLiveAdminReader = async () => {
  const mod = await import("./liveAdminSources.service");
  return mod.readLiveAdminSources;
};

export async function buildAdminTxtRepairPlan(siteId: string, options: AdminTxtRepairOptions = {}): Promise<AdminTxtRepairPlan> {
  logger.info("admins", "Planning TXT admin repair", {
    siteId,
    capturedBy: options.capturedBy,
    reason: options.reason
  });

  if (!Types.ObjectId.isValid(siteId) && !String(siteId || "").trim()) throw new Error("site-not-found");
  const site = await Site.findById(siteId);
  if (!site) throw new Error("site-not-found");

  const paths = buildPathsForSite(site);
  const readLiveAdminSources = await getLiveAdminReader();
  const liveRead = await readLiveAdminSources(siteId, {
    persist: false,
    capturedBy: options.capturedBy || "system"
  });

  const sourceStatus = liveRead.sourceStatus as AdminSourceStatus[];
  const missingInTxt = [...new Set(liveRead.adminDifferences.missingInTxt || [])];
  const missingAdmins = findAdminsByKeys(missingInTxt, liveRead.siteCollectionAdmins, liveRead.ownersGroupAdmins);
  const mergedTxtAdmins = dedupeAdminsForRepair([...(liveRead.txtAdmins || []), ...missingAdmins]);
  const txtOk = sourceStatus.find((source) => source.source === "txt")?.ok === true;
  const liveSourceOk = sourceStatus.some((source) => source.source !== "txt" && source.ok);
  const readyForRepair = txtOk && liveSourceOk && missingInTxt.length > 0 && missingAdmins.length > 0;
  const notes = [
    txtOk ? "" : "TXT admin source could not be read.",
    liveSourceOk ? "" : "At least one live SharePoint admin source must be readable before TXT repair.",
    missingInTxt.length > 0 ? "" : "No admins are missing from TXT.",
    missingInTxt.length === missingAdmins.length ? "" : "Some missing TXT keys could not be resolved to admin identities."
  ].filter(Boolean);

  const plan: AdminTxtRepairPlan = {
    operation: "admin-txt-repair",
    generatedAt: new Date().toISOString(),
    siteId: getSiteId(site),
    siteCode: site.siteCode,
    siteDisplayName: site.displayName,
    targetPath: paths.txtFiles.users,
    sourceStatus,
    sourceCounts: {
      txt: sourceCount(sourceStatus, "txt", liveRead.txtAdmins.length),
      siteCollection: sourceCount(sourceStatus, "siteCollection", liveRead.siteCollectionAdmins.length),
      ownersGroup: sourceCount(sourceStatus, "ownersGroup", liveRead.ownersGroupAdmins.length)
    },
    missingInTxt,
    missingAdmins,
    mergedTxtAdmins,
    additions: missingAdmins,
    toAdd: missingAdmins,
    unchanged: dedupeAdminsForRepair(liveRead.txtAdmins || []),
    diff: {
      additions: missingAdmins,
      missingInTxt: missingAdmins,
      removals: [],
      unchanged: dedupeAdminsForRepair(liveRead.txtAdmins || [])
    },
    summary: {
      readyForRepair,
      targetPath: paths.txtFiles.users,
      currentTxtAdminsCount: liveRead.txtAdmins.length,
      targetTxtAdminsCount: mergedTxtAdmins.length,
      missingInTxtCount: missingInTxt.length,
      additionsCount: missingAdmins.length,
      removalsCount: 0,
      unchangedCount: liveRead.txtAdmins.length
    },
    liveRead: {
      capturedAt: liveRead.capturedAt,
      adminsCount: liveRead.adminsCount,
      sourceStatus,
      adminDifferences: liveRead.adminDifferences
    },
    notes
  };

  logger.info("admins", "TXT admin repair plan built", {
    siteId: plan.siteId,
    siteCode: plan.siteCode,
    targetPath: plan.targetPath,
    readyForRepair,
    missingInTxtCount: missingInTxt.length,
    additionsCount: missingAdmins.length
  });

  return plan;
}

export async function enqueueAdminTxtRepair(params: {
  siteId: string;
  createdBy: string;
  reason?: string;
  notes?: string;
}) {
  const requestedBy = params.createdBy || "system";
  const reason = String(params.reason || params.notes || "").trim();
  logger.info("admins", "Queueing TXT admin repair", {
    siteId: params.siteId,
    requestedBy,
    reason
  });

  assertSharePointWriteAvailable();

  const plan = await buildAdminTxtRepairPlan(params.siteId, {
    capturedBy: requestedBy,
    reason
  });

  if (!plan.summary.readyForRepair) {
    const errorCode = plan.missingInTxt.length === 0 ? "admin-txt-repair-not-needed" : "admin-txt-repair-plan-not-ready";
    logger.warn("admins", "TXT admin repair queue blocked by plan readiness", {
      siteId: plan.siteId,
      siteCode: plan.siteCode,
      errorCode,
      notes: plan.notes
    });
    throw new Error(errorCode);
  }

  const job = await createJob({
    type: "repair",
    siteId: plan.siteId,
    createdBy: requestedBy,
    requiresApproval: true,
    approvalSummary: {
      title: `Repair ${plan.siteDisplayName} admin TXT source`,
      operation: "admin-txt-repair",
      siteId: plan.siteId,
      siteCode: plan.siteCode,
      targetPath: plan.targetPath,
      missingInTxtCount: plan.missingInTxt.length,
      requestedBy,
      reason
    },
    approvalSnapshot: {
      operation: "admin-txt-repair",
      site: {
        id: plan.siteId,
        siteCode: plan.siteCode,
        displayName: plan.siteDisplayName,
        sharePointSiteUrl: (await Site.findById(plan.siteId))?.sharePointSiteUrl || ""
      },
      targetPath: plan.targetPath,
      missingInTxt: plan.missingInTxt,
      missingAdmins: plan.missingAdmins,
      mergedTxtAdmins: plan.mergedTxtAdmins,
      liveRead: {
        capturedAt: plan.liveRead.capturedAt,
        adminsCount: plan.liveRead.adminsCount,
        sourceStatus: plan.liveRead.sourceStatus,
        adminDifferences: plan.liveRead.adminDifferences,
        sourceCounts: plan.sourceCounts
      },
      summary: plan.summary,
      writeOperations: [
        "Overwrite users_data.txt with the merged TXT, Site Collection admin, and Owners Group admin list",
        "Read live admin sources after the write and persist the refreshed snapshot"
      ],
      risks: [
        "Overwrites the TXT admin source file.",
        "Does not change Site Collection Admins or Owners Group membership."
      ],
      requestedBy,
      reason
    },
    payload: {
      operation: "admin-txt-repair",
      repairType: "admin-txt",
      targetPath: plan.targetPath,
      missingInTxt: plan.missingInTxt,
      missingAdmins: plan.missingAdmins,
      mergedTxtAdmins: plan.mergedTxtAdmins,
      reason
    }
  });

  logger.info("admins", "TXT admin repair job queued", {
    siteId: plan.siteId,
    siteCode: plan.siteCode,
    jobId: job._id.toString(),
    targetPath: plan.targetPath,
    missingInTxtCount: plan.missingInTxt.length
  });

  logger.info("jobs", "Admin TXT repair job created", {
    jobId: job._id.toString(),
    siteId: plan.siteId,
    type: "repair",
    operation: "admin-txt-repair"
  });

  const requiresApproval = Boolean(job.requiresApproval || job.status === "awaiting-approval");

  return {
    job,
    plan,
    requiresApproval,
    approvalStatus: requiresApproval ? "pending" : "not-required",
    message: requiresApproval
      ? "TXT admin repair job queued and requires approval because advanced approvals are enabled"
      : "TXT admin repair job queued in owner-direct mode"
  };
}

export async function executeAdminTxtRepair(params: {
  siteId: string;
  jobId: string;
  requestedBy?: string;
  targetPath?: string;
  missingInTxt?: string[];
  mergedTxtAdmins?: AdminIdentity[];
  reason?: string;
}) {
  const requestedBy = params.requestedBy || "system";
  logger.info("admins", "Executing approved TXT admin repair", {
    siteId: params.siteId,
    jobId: params.jobId,
    requestedBy,
    targetPath: params.targetPath
  });

  assertSharePointWriteAvailable();

  const site = await Site.findById(params.siteId);
  if (!site) throw new Error("site-not-found");

  const paths = buildPathsForSite(site);
  const targetPath = params.targetPath || paths.txtFiles.users;
  const missingInTxt = [...new Set(params.missingInTxt || [])];
  const mergedTxtAdmins = dedupeAdminsForRepair(params.mergedTxtAdmins || []);

  if (mergedTxtAdmins.length === 0) {
    logger.warn("admins", "TXT admin repair execution missing approved merged payload", {
      siteId: params.siteId,
      jobId: params.jobId
    });
    throw new Error("admin-txt-repair-plan-not-ready");
  }

  const text = JSON.stringify(mergedTxtAdmins, null, 2);
  await writeSharePointTextFile(paths, targetPath, text);

  const readLiveAdminSources = await getLiveAdminReader();
  const liveRead = await readLiveAdminSources(params.siteId, {
    persist: true,
    jobId: params.jobId,
    capturedBy: requestedBy
  });

  const sourceStatus = liveRead.sourceStatus as AdminSourceStatus[];
  const txtSource = sourceStatus.find((source) => source.source === "txt");
  const stillMissingApprovedKeys = missingInTxt.filter((key) => liveRead.adminDifferences.missingInTxt.includes(key));
  const sourceCounts = {
    txt: sourceCount(sourceStatus, "txt", liveRead.txtAdmins.length),
    siteCollection: sourceCount(sourceStatus, "siteCollection", liveRead.siteCollectionAdmins.length),
    ownersGroup: sourceCount(sourceStatus, "ownersGroup", liveRead.ownersGroupAdmins.length)
  };
  const evidence = {
    write: {
      targetPath,
      repairedMissingInTxtCount: missingInTxt.length,
      writtenAdminsCount: mergedTxtAdmins.length,
      sizeBytes: new TextEncoder().encode(text).length
    },
    liveRead: {
      capturedAt: liveRead.capturedAt,
      adminsCount: liveRead.adminsCount,
      sourceStatus,
      adminDifferences: liveRead.adminDifferences,
      sourceCounts
    },
    verification: {
      txtReadBackOk: txtSource?.ok === true,
      missingInTxtAfterRepair: liveRead.adminDifferences.missingInTxt,
      stillMissingApprovedKeys
    }
  };

  if (txtSource?.ok !== true || stillMissingApprovedKeys.length > 0) {
    logger.error("admins", "TXT admin repair verification failed", {
      siteId: params.siteId,
      jobId: params.jobId,
      txtReadBackOk: txtSource?.ok === true,
      stillMissingApprovedKeys
    });
    throw new Error("admin-txt-repair-verification-failed");
  }

  const result = {
    siteId: getSiteId(site),
    siteCode: site.siteCode,
    targetPath,
    repairedMissingInTxtCount: missingInTxt.length,
    adminsCount: liveRead.adminsCount,
    adminDifferences: liveRead.adminDifferences,
    sourceCounts,
    capturedAt: liveRead.capturedAt
  };

  logger.info("admins", "TXT admin repair executed and verified", {
    siteId: result.siteId,
    siteCode: result.siteCode,
    jobId: params.jobId,
    targetPath,
    repairedMissingInTxtCount: missingInTxt.length,
    adminsCount: liveRead.adminsCount
  });

  return { ...result, evidence };
}

export async function getSiteAdmins(siteId: string) {
  logger.debug("admins", "Loading site admins", { siteId });
  if (!Types.ObjectId.isValid(siteId)) throw new Error("site-not-found");
  const site = await Site.findById(siteId);
  if (!site) throw new Error("site-not-found");

  const latestSnapshot = await SiteAdminSnapshot.findOne({ siteId: site._id }).sort({ capturedAt: -1 });

  const txt = site.txtAdmins || [];
  const sc = site.siteCollectionAdmins || [];
  const og = site.ownersGroupAdmins || [];
  const diff = buildAdminDiff(txt, sc, og);

  const result = {
    siteId: site._id.toString(),
    adminsCount: site.adminsCount || 0,
    lastAdminSyncAt: site.lastAdminSyncAt,
    adminSyncStatus: site.adminSyncStatus,
    txtAdmins: txt,
    siteCollectionAdmins: sc,
    ownersGroupAdmins: og,
    adminDifferences: diff,
    latestSnapshot
  };
  logger.debug("admins", "Site admins loaded", {
    siteId: result.siteId,
    adminsCount: result.adminsCount,
    txtCount: txt.length,
    siteCollectionCount: sc.length,
    ownersGroupCount: og.length,
    diff: diff
  });
  return result;
}

export async function enqueueAdminSync(params: {
  siteId: string;
  createdBy: string;
  mode: "read-only" | "sync";
}) {
  logger.info("admins", "Queueing admin sync", {
    siteId: params.siteId,
    createdBy: params.createdBy,
    mode: params.mode
  });
  const site = await Site.findById(params.siteId);
  if (!site) throw new Error("site-not-found");

  const job = await createJob({
    type: "admin-sync",
    siteId: site._id.toString(),
    createdBy: params.createdBy,
    payload: { mode: params.mode }
  });

  if (params.mode === "sync") {
    await Site.findByIdAndUpdate(site._id, { adminSyncStatus: "running" });
  } else {
    logger.info("admins", "Read-only admin sync queued without mutating Site sync status", {
      siteId: site._id.toString(),
      siteCode: site.siteCode,
      jobId: job._id.toString()
    });
  }
  logger.info("admins", "Admin sync queued", {
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    jobId: job._id.toString()
  });
  return { job };
}

export async function addSiteAdmin(params: {
  siteId: string;
  admin: AdminIdentity & { source?: "txt" | "siteCollection" | "ownersGroup" };
}) {
  logger.info("admins", "Adding site admin", {
    siteId: params.siteId,
    source: params.admin.source,
    admin: logger.isPayloadLoggingEnabled() ? params.admin : {
      hasDisplayName: Boolean(params.admin.displayName),
      hasPersonalNumber: Boolean(params.admin.personalNumber),
      hasEmail: Boolean(params.admin.email),
      hasLoginName: Boolean(params.admin.loginName)
    }
  });
  const site = await Site.findById(params.siteId);
  if (!site) throw new Error("site-not-found");

  const source = (params.admin.source || "txt") as AdminSource;
  const normalized = {
    displayName: params.admin.displayName || "",
    personalNumber: params.admin.personalNumber || "",
    email: params.admin.email || "",
    loginName: params.admin.loginName || ""
  };

  if (sharePointAdminSources.has(source)) {
    assertSharePointWriteAvailable();
    const loginName = resolveSharePointLoginName(normalized);
    if (!loginName) throw new Error("sharepoint-admin-login-required");

    const paths = buildPathsForSite(site);
    const digest = await getRequestDigest(paths);
    const ensuredUser = await ensureSharePointUser(paths, loginName, digest);
    const expectedAdmin = {
      displayName: normalized.displayName || ensuredUser.displayName,
      personalNumber: normalized.personalNumber,
      email: normalized.email || ensuredUser.email,
      loginName: ensuredUser.loginName || normalized.loginName || loginName
    };

    logger.info("admins", `Adding admin to ${sourceLabel(source as SharePointAdminSource)} in SharePoint`, {
      siteId: site._id.toString(),
      siteCode: site.siteCode,
      source,
      userId: ensuredUser.id,
      hasLoginName: Boolean(expectedAdmin.loginName)
    });

    if (source === "siteCollection") {
      await setSharePointSiteCollectionAdmin(paths, ensuredUser, true, digest);
    } else {
      const group = await getAssociatedOwnerGroupId(paths);
      await addSharePointUserToGroup(paths, group.id, ensuredUser.loginName, digest);
    }

    const liveRead = await refreshLiveAdminsAfterSharePointWrite({
      siteId: site._id.toString(),
      source: source as SharePointAdminSource,
      expectedAdmin,
      operation: "add"
    });

    logger.info("admins", "SharePoint admin add verified and persisted to Hub snapshot", {
      siteId: site._id.toString(),
      siteCode: site.siteCode,
      source,
      adminsCount: liveRead.adminsCount
    });
    return await Site.findById(site._id) || site;
  }

  const key = normalizeAdminKey(normalized);
  const current = source === "txt" ? site.txtAdmins : source === "siteCollection" ? site.siteCollectionAdmins : site.ownersGroupAdmins;

  if (!current.find((item) => normalizeAdminKey(item) === key)) {
    current.push(normalized as any);
  }

  const txt = site.txtAdmins || [];
  const sc = site.siteCollectionAdmins || [];
  const og = site.ownersGroupAdmins || [];
  site.adminDifferences = buildAdminDiff(txt, sc, og) as any;

  const uniqueCount = new Set([...txt, ...sc, ...og].map((item) => normalizeAdminKey(item))).size;
  site.adminsCount = uniqueCount;

  await site.save();
  logger.info("admins", "Site admin added to Hub metadata only", {
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    source,
    adminsCount: site.adminsCount
  });
  return site;
}

export async function removeSiteAdmin(params: {
  siteId: string;
  adminId: string;
  source?: "txt" | "siteCollection" | "ownersGroup";
}) {
  logger.warn("admins", "Removing site admin", {
    siteId: params.siteId,
    adminId: params.adminId,
    source: params.source
  });
  const site = await Site.findById(params.siteId);
  if (!site) throw new Error("site-not-found");

  const source = params.source as AdminSource | undefined;
  if (source && sharePointAdminSources.has(source)) {
    assertSharePointWriteAvailable();
    const targetAdmin = resolveAdminForRemoval(site, source, params.adminId);
    const loginName = resolveSharePointLoginName(targetAdmin);
    if (!loginName) throw new Error("sharepoint-admin-login-required");

    const paths = buildPathsForSite(site);
    const digest = await getRequestDigest(paths);
    const expectedAdmin = {
      ...targetAdmin,
      loginName
    };

    logger.warn("admins", `Removing admin from ${sourceLabel(source as SharePointAdminSource)} in SharePoint`, {
      siteId: site._id.toString(),
      siteCode: site.siteCode,
      source,
      hasLoginName: Boolean(loginName)
    });

    if (source === "siteCollection") {
      await setSharePointSiteCollectionAdmin(paths, loginName, false, digest);
    } else {
      const group = await getAssociatedOwnerGroupId(paths);
      await removeSharePointUserFromGroup(paths, group.id, loginName, digest);
    }

    const liveRead = await refreshLiveAdminsAfterSharePointWrite({
      siteId: site._id.toString(),
      source: source as SharePointAdminSource,
      expectedAdmin,
      operation: "remove"
    });

    logger.info("admins", "SharePoint admin removal verified and persisted to Hub snapshot", {
      siteId: site._id.toString(),
      siteCode: site.siteCode,
      source,
      adminsCount: liveRead.adminsCount
    });
    return await Site.findById(site._id) || site;
  }

  const token = String(params.adminId || "").trim().toLowerCase();
  const byToken = (item: AdminIdentity) => {
    const variants = [
      normalizeAdminKey(item),
      String(item.personalNumber || "").trim().toLowerCase(),
      String(item.email || "").trim().toLowerCase(),
      String(item.loginName || "").trim().toLowerCase()
    ];
    return variants.some((value) => value === token || value.endsWith(token));
  };

  if (!source || source === "txt") site.txtAdmins = (site.txtAdmins || []).filter((item) => !byToken(item)) as any;
  if (!source || source === "siteCollection") site.siteCollectionAdmins = (site.siteCollectionAdmins || []).filter((item) => !byToken(item)) as any;
  if (!source || source === "ownersGroup") site.ownersGroupAdmins = (site.ownersGroupAdmins || []).filter((item) => !byToken(item)) as any;

  const txt = site.txtAdmins || [];
  const sc = site.siteCollectionAdmins || [];
  const og = site.ownersGroupAdmins || [];

  site.adminDifferences = buildAdminDiff(txt, sc, og) as any;
  site.adminsCount = new Set([...txt, ...sc, ...og].map((item) => normalizeAdminKey(item))).size;

  await site.save();
  logger.info("admins", "Site admin removed from Hub metadata only", {
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    source,
    adminsCount: site.adminsCount
  });
  return site;
}

export async function getAdminsDiff(siteId: string) {
  logger.debug("admins", "Loading admins diff", { siteId });
  const info = await getSiteAdmins(siteId);
  return info.adminDifferences;
}
