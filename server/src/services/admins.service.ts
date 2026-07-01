import { Types } from "mongoose";
import { Site } from "../models/Site";
import { SiteAdminSnapshot } from "../models/SiteAdminSnapshot";
import { createJob, setJobEvidence, setJobFailed, setJobResult, setJobStatus, setJobSucceeded, setJobTargetPaths } from "./jobs.service";
import { logger } from "../utils/logger";
import { resolveSiteBuilderPaths } from "../utils/sitebuilderPaths";
import { getBrowserRequiredJobMessage, getSharePointOperationPolicy } from "./sharepointOperationPolicy.service";

export type AdminIdentity = {
  displayName?: string;
  personalNumber?: string;
  email?: string;
  loginName?: string;
};

type AdminSourceStatus = {
  source: "txt" | "mongo" | "siteCollection" | "ownersGroup";
  ok?: boolean;
  count?: number;
  status?: "success" | "failed" | "skipped";
  rawCount?: number;
  normalizedCount?: number;
  httpStatus?: number;
  httpStatusText?: string;
  sourceUrl?: string;
  readAt?: string;
  errorCode?: string;
  errorMessage?: string;
  error?: string;
  warnings?: string[];
};

type AdminSource = AdminSourceStatus["source"];
type SharePointAdminSource = Exclude<AdminSource, "txt" | "mongo">;

type AdminDifferences = {
  missingInTxt: string[];
  missingInSiteCollection: string[];
  missingInOwnersGroup: string[];
};

type AdminTxtRepairOptions = {
  capturedBy?: string;
  reason?: string;
};

type BrowserAdminEvidenceInput = {
  connectorMode: "browser-sharepoint";
  targetSiteUrl?: string;
  generatedAt?: string;
  readAt?: string;
  capturedAt?: string;
  txtAdmins?: AdminIdentity[];
  siteCollectionAdmins?: AdminIdentity[];
  ownersGroupAdmins?: AdminIdentity[];
  uniqueAdmins?: AdminIdentity[];
  adminsCount?: number;
  rawCounts?: Record<string, number>;
  normalizedCounts?: Record<string, number>;
  adminDifferences?: AdminDifferences;
  sourceStatus: AdminSourceStatus[];
  warnings?: string[];
  evidence?: Record<string, unknown>;
};

type BrowserAdminTxtRepairEvidenceInput = {
  connectorMode: "browser-sharepoint";
  jobId?: string;
  targetSiteUrl?: string;
  targetPath: string;
  mergedTxtAdmins: AdminIdentity[];
  repairEvidence?: Record<string, any>;
  errors?: unknown[];
  startedAt?: string;
  completedAt?: string;
  finalStatus: "success" | "failed";
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

const browserAdminSources = ["txt", "siteCollection", "ownersGroup"] as const;
type BrowserAdminSource = typeof browserAdminSources[number];

const dateFromEvidence = (...values: Array<string | undefined>) => {
  for (const value of values) {
    if (!value) continue;
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return new Date();
};

const sourceRowsFromEvidence = (input: BrowserAdminEvidenceInput, source: BrowserAdminSource) => {
  if (source === "txt") return input.txtAdmins || [];
  if (source === "siteCollection") return input.siteCollectionAdmins || [];
  return input.ownersGroupAdmins || [];
};

const normalizeBrowserSourceStatus = (input: BrowserAdminEvidenceInput, source: BrowserAdminSource, rows: AdminIdentity[], capturedAt: Date): AdminSourceStatus => {
  const rawStatus = input.sourceStatus.find((item) => item.source === source);
  const status = rawStatus?.status || (rawStatus?.ok === true ? "success" : rawStatus?.ok === false ? "failed" : "skipped");
  const ok = status === "success" || rawStatus?.ok === true;
  const message = rawStatus?.errorMessage || rawStatus?.error || "";
  const normalizedCount = ok ? rows.length : undefined;
  const rawCount = ok ? rawStatus?.rawCount ?? input.rawCounts?.[source] ?? rows.length : rawStatus?.rawCount ?? input.rawCounts?.[source];

  return {
    source,
    status,
    ok,
    count: ok ? rawStatus?.count ?? normalizedCount : undefined,
    rawCount,
    normalizedCount: ok ? rawStatus?.normalizedCount ?? input.normalizedCounts?.[source] ?? normalizedCount : rawStatus?.normalizedCount ?? input.normalizedCounts?.[source],
    httpStatus: rawStatus?.httpStatus,
    httpStatusText: rawStatus?.httpStatusText || "",
    sourceUrl: rawStatus?.sourceUrl || "",
    readAt: rawStatus?.readAt || capturedAt.toISOString(),
    errorCode: rawStatus?.errorCode || "",
    errorMessage: message,
    error: message,
    warnings: rawStatus?.warnings || []
  };
};

const buildUniqueAdmins = (...sources: AdminIdentity[][]) => {
  const seen = new Set<string>();
  const result: AdminIdentity[] = [];
  for (const admin of sources.flat().map(normalizeRepairAdmin).filter(isMeaningfulAdmin)) {
    const key = normalizeAdminKey(admin);
    if (!key || key === "name:" || seen.has(key)) continue;
    seen.add(key);
    result.push(admin);
  }
  return result;
};

const toSourceCountMap = (sourceStatus: AdminSourceStatus[]) =>
  sourceStatus.reduce<Record<string, number | null>>((acc, source) => {
    acc[source.source] = source.ok ? source.count ?? source.normalizedCount ?? 0 : null;
    return acc;
  }, {});

const mapMissingAdminTokens = (admins: AdminIdentity[], tokens: string[]) => {
  const tokenSet = new Set(tokens);
  return admins.map(normalizeRepairAdmin).filter((admin) => adminMatchesAnyToken(admin, tokenSet));
};

const buildTxtRepairPlanFromSite = (site: any, options: AdminTxtRepairOptions = {}): AdminTxtRepairPlan => {
  const paths = buildPathsForSite(site);
  const txtAdmins = dedupeAdminsForRepair(site.txtAdmins || []);
  const siteCollectionAdmins = dedupeAdminsForRepair(site.siteCollectionAdmins || []);
  const ownersGroupAdmins = dedupeAdminsForRepair(site.ownersGroupAdmins || []);
  const diff = buildAdminDiff(txtAdmins, siteCollectionAdmins, ownersGroupAdmins);
  const hostingAdmins = buildUniqueAdmins(siteCollectionAdmins, ownersGroupAdmins);
  const missingAdmins = mapMissingAdminTokens(hostingAdmins, diff.missingInTxt);
  const mergedTxtAdmins = buildUniqueAdmins(txtAdmins, missingAdmins);
  const additions = mergedTxtAdmins.filter((admin) => !adminMatchesAnyToken(admin, new Set(txtAdmins.flatMap(adminIdentityTokens))));
  const unchanged = mergedTxtAdmins.filter((admin) => adminMatchesAnyToken(admin, new Set(txtAdmins.flatMap(adminIdentityTokens))));
  const sourceStatus = (site.adminSourceStatus || []) as AdminSourceStatus[];
  const capturedAt = dateFromEvidence(site.lastAdminLiveReadAt?.toISOString?.(), site.lastAdminSyncAt?.toISOString?.());

  return {
    operation: "admin-txt-repair",
    generatedAt: new Date().toISOString(),
    siteId: getSiteId(site),
    siteCode: site.siteCode,
    siteDisplayName: site.displayName,
    targetPath: paths.txtFiles.users,
    sourceStatus,
    sourceCounts: {
      txt: txtAdmins.length,
      siteCollection: siteCollectionAdmins.length,
      ownersGroup: ownersGroupAdmins.length
    },
    missingInTxt: diff.missingInTxt,
    missingAdmins,
    mergedTxtAdmins,
    additions,
    toAdd: additions,
    unchanged,
    diff: {
      additions,
      missingInTxt: missingAdmins,
      removals: [],
      unchanged
    },
    summary: {
      readyForRepair: missingAdmins.length > 0,
      targetPath: paths.txtFiles.users,
      currentTxtAdminsCount: txtAdmins.length,
      targetTxtAdminsCount: mergedTxtAdmins.length,
      missingInTxtCount: diff.missingInTxt.length,
      additionsCount: additions.length,
      removalsCount: 0,
      unchangedCount: unchanged.length
    },
    liveRead: {
      capturedAt: capturedAt.toISOString(),
      adminsCount: buildUniqueAdmins(txtAdmins, siteCollectionAdmins, ownersGroupAdmins).length,
      sourceStatus,
      adminDifferences: diff
    },
    notes: [
      "תוכנית זו נבנתה מ־browser live-read שנשמר ב־Mongo.",
      "הכתיבה עצמה ל־users_data.txt תתבצע בדפדפן בלבד.",
      options.reason ? `Reason: ${options.reason}` : ""
    ].filter(Boolean)
  };
};

export async function recordBrowserAdminLiveReadEvidence(params: {
  siteId: string;
  actor?: string;
  input: BrowserAdminEvidenceInput;
}) {
  const actor = params.actor || "system";
  const input = params.input;
  if (input.connectorMode !== "browser-sharepoint") throw new Error("browser-admin-evidence-connector-mode-required");
  if (!input.sourceStatus.length) throw new Error("browser-admin-evidence-source-status-required");

  logger.info("admins", "Persisting browser admin live-read evidence", {
    siteId: params.siteId,
    actor,
    targetSiteUrl: input.targetSiteUrl,
    sourceStatus: input.sourceStatus.map((source) => ({
      source: source.source,
      status: source.status,
      ok: source.ok,
      httpStatus: source.httpStatus
    }))
  });

  const site = await Site.findById(params.siteId);
  if (!site) throw new Error("site-not-found");

  const capturedAt = dateFromEvidence(input.capturedAt, input.readAt, input.generatedAt);
  const normalizedRows = {
    txt: dedupeAdminsForRepair(input.txtAdmins || []),
    siteCollection: dedupeAdminsForRepair(input.siteCollectionAdmins || []),
    ownersGroup: dedupeAdminsForRepair(input.ownersGroupAdmins || [])
  };
  const sourceStatus = browserAdminSources.map((source) =>
    normalizeBrowserSourceStatus(input, source, normalizedRows[source], capturedAt)
  );
  const failedSources = sourceStatus.filter((source) => !source.ok);
  const sourceOk = (source: AdminSource) => sourceStatus.find((item) => item.source === source)?.ok === true;

  const snapshotTxtAdmins = sourceOk("txt") ? normalizedRows.txt : [];
  const snapshotSiteCollectionAdmins = sourceOk("siteCollection") ? normalizedRows.siteCollection : [];
  const snapshotOwnersGroupAdmins = sourceOk("ownersGroup") ? normalizedRows.ownersGroup : [];
  const snapshotUniqueAdmins = buildUniqueAdmins(snapshotTxtAdmins, snapshotSiteCollectionAdmins, snapshotOwnersGroupAdmins);
  const snapshotDiff = buildAdminDiff(snapshotTxtAdmins, snapshotSiteCollectionAdmins, snapshotOwnersGroupAdmins);

  const nextTxtAdmins = sourceOk("txt") ? normalizedRows.txt : site.txtAdmins || [];
  const nextSiteCollectionAdmins = sourceOk("siteCollection") ? normalizedRows.siteCollection : site.siteCollectionAdmins || [];
  const nextOwnersGroupAdmins = sourceOk("ownersGroup") ? normalizedRows.ownersGroup : site.ownersGroupAdmins || [];
  const nextUniqueAdmins = buildUniqueAdmins(nextTxtAdmins, nextSiteCollectionAdmins, nextOwnersGroupAdmins);
  const nextDiff = buildAdminDiff(nextTxtAdmins, nextSiteCollectionAdmins, nextOwnersGroupAdmins);
  const syncStatus = failedSources.length ? "failed" : "succeeded";
  const syncError = failedSources.map((source) => `${source.source}: ${source.errorMessage || source.error || source.status || "failed"}`).join("; ");
  const rawCounts = {
    txt: sourceStatus.find((source) => source.source === "txt")?.rawCount,
    siteCollection: sourceStatus.find((source) => source.source === "siteCollection")?.rawCount,
    ownersGroup: sourceStatus.find((source) => source.source === "ownersGroup")?.rawCount,
    ...(input.rawCounts || {})
  };
  const normalizedCounts = {
    txt: sourceStatus.find((source) => source.source === "txt")?.normalizedCount,
    siteCollection: sourceStatus.find((source) => source.source === "siteCollection")?.normalizedCount,
    ownersGroup: sourceStatus.find((source) => source.source === "ownersGroup")?.normalizedCount,
    ...(input.normalizedCounts || {})
  };

  site.txtAdmins = nextTxtAdmins as any;
  site.siteCollectionAdmins = nextSiteCollectionAdmins as any;
  site.ownersGroupAdmins = nextOwnersGroupAdmins as any;
  site.adminDifferences = nextDiff as any;
  site.adminsCount = nextUniqueAdmins.length;
  site.lastAdminSyncAt = capturedAt;
  (site as any).lastAdminLiveReadAt = capturedAt;
  (site as any).lastAdminLiveReadSource = "browser-sharepoint";
  site.adminSyncStatus = syncStatus;
  site.lastError = syncError;
  (site as any).adminSourceStatus = sourceStatus;
  (site as any).adminSourceCounts = toSourceCountMap(sourceStatus);
  await site.save();

  const snapshot = await SiteAdminSnapshot.create({
    siteId: site._id,
    capturedBy: actor,
    capturedAt,
    connectorMode: "browser-sharepoint",
    targetSiteUrl: input.targetSiteUrl || site.sharePointSiteUrl,
    txtAdmins: snapshotTxtAdmins,
    siteCollectionAdmins: snapshotSiteCollectionAdmins,
    ownersGroupAdmins: snapshotOwnersGroupAdmins,
    uniqueAdmins: snapshotUniqueAdmins,
    syncStatus,
    syncError,
    adminDifferences: snapshotDiff,
    sourceStatus,
    rawCounts,
    normalizedCounts,
    warnings: input.warnings || [],
    evidence: {
      ...(input.evidence || {}),
      connectorMode: "browser-sharepoint",
      targetSiteUrl: input.targetSiteUrl || site.sharePointSiteUrl,
      receivedAt: new Date().toISOString(),
      suppliedAdminsCount: input.adminsCount,
      suppliedUniqueAdminsCount: input.uniqueAdmins?.length
    }
  });

  const liveRead = {
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    capturedAt: capturedAt.toISOString(),
    connectorMode: "browser-sharepoint" as const,
    targetSiteUrl: input.targetSiteUrl || site.sharePointSiteUrl,
    txtAdmins: snapshotTxtAdmins,
    siteCollectionAdmins: snapshotSiteCollectionAdmins,
    ownersGroupAdmins: snapshotOwnersGroupAdmins,
    uniqueAdmins: snapshotUniqueAdmins,
    adminDifferences: snapshotDiff,
    adminsCount: snapshotUniqueAdmins.length,
    sourceStatus,
    rawCounts,
    normalizedCounts,
    warnings: input.warnings || []
  };
  const summary = {
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    adminsCount: site.adminsCount || 0,
    lastAdminSyncAt: site.lastAdminSyncAt,
    lastAdminLiveReadAt: (site as any).lastAdminLiveReadAt,
    lastAdminLiveReadSource: (site as any).lastAdminLiveReadSource,
    adminSyncStatus: site.adminSyncStatus,
    txtAdmins: nextTxtAdmins,
    siteCollectionAdmins: nextSiteCollectionAdmins,
    ownersGroupAdmins: nextOwnersGroupAdmins,
    adminDifferences: nextDiff,
    sourceStatus,
    sourceCounts: toSourceCountMap(sourceStatus),
    latestSnapshot: snapshot
  };

  logger.info("admins", "Browser admin live-read evidence persisted", {
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    snapshotId: snapshot._id.toString(),
    syncStatus,
    adminsCount: site.adminsCount,
    failedSources: failedSources.map((source) => source.source)
  });

  return {
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    connectorMode: "browser-sharepoint" as const,
    targetSiteUrl: input.targetSiteUrl || site.sharePointSiteUrl,
    capturedAt: capturedAt.toISOString(),
    liveRead,
    summary,
    snapshot
  };
}

export async function buildAdminTxtRepairPlan(siteId: string, options: AdminTxtRepairOptions = {}): Promise<AdminTxtRepairPlan> {
  logger.info("admins", "Planning TXT admin repair", {
    siteId,
    capturedBy: options.capturedBy,
    reason: options.reason
  });

  if (!Types.ObjectId.isValid(siteId) && !String(siteId || "").trim()) throw new Error("site-not-found");
  const site = await Site.findById(siteId);
  if (!site) throw new Error("site-not-found");
  if (site.storageBackend === "mongo") {
    throw new Error("mongo-admin-txt-repair-not-applicable");
  }

  const plan = buildTxtRepairPlanFromSite(site, options);
  logger.info("admins", "TXT admin repair plan built for browser execution", {
    siteId: getSiteId(site),
    siteCode: site.siteCode,
    missingInTxtCount: plan.summary.missingInTxtCount,
    targetTxtAdminsCount: plan.summary.targetTxtAdminsCount
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

  const site = await Site.findById(params.siteId);
  if (!site) throw new Error("site-not-found");
  if (site.storageBackend === "mongo") throw new Error("mongo-admin-txt-repair-not-applicable");
  const plan = buildTxtRepairPlanFromSite(site, { capturedBy: requestedBy, reason });
  const policy = getSharePointOperationPolicy("admin-txt-repair");
  const job = await createJob({
    type: "repair",
    siteId: site._id.toString(),
    createdBy: requestedBy,
    executionMode: "browser-required",
    connectorMode: "browser-sharepoint",
    operationPolicy: policy.operation,
    connectorStatusLabel: policy.statusLabelHe,
    connectorBlocker: policy.blockerHe || getBrowserRequiredJobMessage("admin-txt-repair"),
    payload: {
      repairType: "admin-txt",
      reason,
      connectorMode: "browser-sharepoint",
      executionMode: "browser-required",
      browserOperationPlan: plan
    }
  });

  logger.info("admins", "TXT admin repair job queued for browser execution", {
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    jobId: job._id.toString(),
    targetPath: plan.targetPath
  });
  return {
    job,
    plan,
    requiresApproval: job.requiresApproval,
    approvalStatus: job.requiresApproval ? "pending" : "browser-required",
    message: "תיקון users_data.txt ממתין להרצה דרך הדפדפן."
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
}): Promise<any> {
  const requestedBy = params.requestedBy || "system";
  logger.info("admins", "Executing approved TXT admin repair", {
    siteId: params.siteId,
    jobId: params.jobId,
    requestedBy,
    targetPath: params.targetPath
  });

  const site = await Site.findById(params.siteId);
  if (!site) throw new Error("site-not-found");
  throw new Error("browser-sharepoint-required");
}

export async function recordBrowserAdminTxtRepairEvidence(params: {
  siteId: string;
  actor?: string;
  input: BrowserAdminTxtRepairEvidenceInput;
}) {
  const actor = params.actor || "browser-sharepoint";
  const input = params.input;
  if (input.connectorMode !== "browser-sharepoint") throw new Error("browser-admin-txt-repair-connector-mode-required");
  const site = await Site.findById(params.siteId);
  if (!site) throw new Error("site-not-found");
  if (site.storageBackend === "mongo") throw new Error("mongo-admin-txt-repair-not-applicable");

  const paths = buildPathsForSite(site);
  if (input.targetPath !== paths.txtFiles.users) throw new Error("browser-admin-txt-repair-target-mismatch");

  const checkedAt = dateFromEvidence(input.completedAt);
  const mergedTxtAdmins = dedupeAdminsForRepair(input.mergedTxtAdmins || []);
  const success = input.finalStatus === "success" && input.repairEvidence?.status !== "failed";
  const errorMessage = success
    ? ""
    : Array.isArray(input.errors)
      ? input.errors.map((item) => typeof item === "string" ? item : String((item as any)?.error || "")).filter(Boolean).join("; ").slice(0, 1000)
      : input.repairEvidence?.error || "browser-admin-txt-repair-failed";

  if (success) {
    site.txtAdmins = mergedTxtAdmins as any;
  }
  const txtAdmins = success ? mergedTxtAdmins : dedupeAdminsForRepair(site.txtAdmins || []);
  const siteCollectionAdmins = dedupeAdminsForRepair(site.siteCollectionAdmins || []);
  const ownersGroupAdmins = dedupeAdminsForRepair(site.ownersGroupAdmins || []);
  const uniqueAdmins = buildUniqueAdmins(txtAdmins, siteCollectionAdmins, ownersGroupAdmins);
  const diff = buildAdminDiff(txtAdmins, siteCollectionAdmins, ownersGroupAdmins);
  const sourceStatus: AdminSourceStatus[] = [
    {
      source: "txt",
      status: success ? "success" : "failed",
      ok: success,
      count: success ? txtAdmins.length : undefined,
      rawCount: txtAdmins.length,
      normalizedCount: txtAdmins.length,
      sourceUrl: input.targetPath,
      readAt: checkedAt.toISOString(),
      errorMessage
    },
    ...(((site as any).adminSourceStatus || []) as AdminSourceStatus[]).filter((source) => source.source !== "txt")
  ];

  site.adminDifferences = diff as any;
  site.adminsCount = uniqueAdmins.length;
  site.lastAdminSyncAt = checkedAt;
  site.adminSyncStatus = success ? "succeeded" : "failed";
  site.lastError = errorMessage;
  (site as any).adminSourceStatus = sourceStatus;
  (site as any).adminSourceCounts = toSourceCountMap(sourceStatus);
  await site.save();

  const snapshot = await SiteAdminSnapshot.create({
    siteId: site._id,
    jobId: input.jobId && Types.ObjectId.isValid(input.jobId) ? new Types.ObjectId(input.jobId) : undefined,
    capturedBy: actor,
    capturedAt: checkedAt,
    connectorMode: "browser-sharepoint",
    targetSiteUrl: input.targetSiteUrl || site.sharePointSiteUrl,
    txtAdmins,
    siteCollectionAdmins,
    ownersGroupAdmins,
    uniqueAdmins,
    syncStatus: success ? "succeeded" : "failed",
    syncError: errorMessage,
    adminDifferences: diff,
    sourceStatus,
    rawCounts: { txt: txtAdmins.length, siteCollection: siteCollectionAdmins.length, ownersGroup: ownersGroupAdmins.length },
    normalizedCounts: { txt: txtAdmins.length, siteCollection: siteCollectionAdmins.length, ownersGroup: ownersGroupAdmins.length },
    warnings: [],
    evidence: {
      connectorMode: "browser-sharepoint",
      operation: "admin-txt-repair",
      targetPath: input.targetPath,
      repairEvidence: input.repairEvidence || {},
      reason: input.reason || ""
    }
  });

  const jobId = String(input.jobId || "").trim();
  if (jobId) {
    await setJobStatus(jobId, "browser-in-progress", { progressPercent: 80, message: "Browser admin TXT repair evidence received" });
    await setJobTargetPaths(jobId, [input.targetPath], "Browser admin TXT repair target path recorded");
    await setJobEvidence(jobId, input.repairEvidence || {}, "Browser admin TXT repair evidence recorded");
    await setJobResult(jobId, {
      connectorMode: "browser-sharepoint",
      targetPath: input.targetPath,
      status: success ? "succeeded" : "failed",
      txtAdminsCount: txtAdmins.length,
      snapshotId: snapshot._id.toString()
    }, "Browser admin TXT repair result recorded");
    if (success) await setJobSucceeded(jobId, "Browser admin TXT repair completed and verified");
    else await setJobFailed(jobId, errorMessage);
  }

  logger[success ? "info" : "warn"]("admins", "Browser admin TXT repair evidence recorded", {
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    targetPath: input.targetPath,
    success,
    txtAdminsCount: txtAdmins.length
  });

  return {
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    connectorMode: "browser-sharepoint" as const,
    targetPath: input.targetPath,
    summary: {
      status: success ? "succeeded" : "failed",
      txtAdminsCount: txtAdmins.length,
      adminsCount: uniqueAdmins.length,
      adminDifferences: diff,
      snapshotId: snapshot._id.toString()
    },
    snapshot
  };
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
    storageBackend: site.storageBackend || "unknown",
    authoritativeAdminSource: site.authoritativeAdminSource || (site.storageBackend === "mongo" ? "mongo" : site.storageBackend === "txt" ? "txt" : "unknown"),
    mongoAdminsStatus: site.mongoBackendStatus?.adminsStatus || "unknown",
    mongoSiteId: site.mongoSiteId || site.builderSiteId || "",
    safeCollectionName: site.safeCollectionName || site.mongoBackendStatus?.safeCollectionName || "",
    adminSourceExplanationHe: site.storageBackend === "mongo"
      ? "באתר Mongo מקור האמת של מנהלי האפליקציה הוא Mongo/Builder backend. Site Collection ו־Owners Group הם הרשאות אירוח SharePoint."
      : "באתר TXT מקור האמת ההיסטורי הוא users_data.txt, לצד מידע SharePoint על Site Collection ו־Owners Group.",
    adminsCount: site.adminsCount || 0,
    lastAdminSyncAt: site.lastAdminSyncAt,
    lastAdminLiveReadAt: (site as any).lastAdminLiveReadAt,
    lastAdminLiveReadSource: (site as any).lastAdminLiveReadSource,
    adminSyncStatus: site.adminSyncStatus,
    txtAdmins: txt,
    siteCollectionAdmins: sc,
    ownersGroupAdmins: og,
    adminDifferences: diff,
    sourceStatus: (site as any).adminSourceStatus || latestSnapshot?.sourceStatus || [],
    sourceCounts: (site as any).adminSourceCounts || {},
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
  const policy = getSharePointOperationPolicy("admin-sync");
  const job = await createJob({
    type: "admin-sync",
    siteId: site._id.toString(),
    createdBy: params.createdBy,
    executionMode: "browser-required",
    connectorMode: "browser-sharepoint",
    operationPolicy: policy.operation,
    connectorStatusLabel: policy.statusLabelHe,
    connectorBlocker: policy.blockerHe || getBrowserRequiredJobMessage("admin-sync"),
    payload: {
      mode: params.mode,
      connectorMode: "browser-sharepoint",
      executionMode: "browser-required",
      browserOperationPlan: {
        operation: "admin-live-read",
        siteId: site._id.toString(),
        siteCode: site.siteCode,
        targetSiteUrl: site.sharePointSiteUrl,
        message: "קריאת מנהלים חיה מתבצעת דרך הדפדפן; השרת שומר Evidence בלבד."
      }
    }
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
    throw new Error("browser-sharepoint-required");
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
    throw new Error("browser-sharepoint-required");
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
