import { Types } from "mongoose";
import { env } from "../config/env";
import { Job } from "../models/Job";
import { Site } from "../models/Site";
import { logger } from "../utils/logger";
import { enqueueSiteBackup } from "./backups.service";
import { createJob } from "./jobs.service";
import { getBrowserRequiredJobMessage, getSharePointOperationPolicy } from "./sharepointOperationPolicy.service";

type ScheduleKind = "backup" | "healthCheck";
type SchedulerSiteId = Types.ObjectId | string;

type SchedulerTickResult = {
  checkedAt: string;
  dueSites: number;
  queuedBackups: number;
  queuedHealthChecks: number;
  skipped: number;
  failed: number;
};

let timer: NodeJS.Timeout | null = null;
let running = false;

const ACTIVE_JOB_STATUSES = ["awaiting-approval", "queued", "browser-required", "browser-in-progress", "preflight", "running", "verifying", "retrying"];
const SCHEDULER_ACTOR = "scheduler";

const clampIntervalMinutes = (value: unknown, fallback: number) => {
  const parsed = Number(value || fallback);
  return Number.isFinite(parsed) && parsed >= 5 ? parsed : fallback;
};

const nextRunFrom = (now: Date, intervalMinutes: number) =>
  new Date(now.getTime() + intervalMinutes * 60_000);

const isDue = (task: any, now: Date) => {
  if (!task?.enabled) return false;
  if (!task.nextRunAt) return true;
  return new Date(task.nextRunAt).getTime() <= now.getTime();
};

const siteIdOf = (site: any): SchedulerSiteId => {
  if (site?._id instanceof Types.ObjectId) return site._id;
  const value = site?._id?.toString?.() || site?._id;
  if (!value) throw new Error("scheduled-site-missing-id");
  return String(value);
};

const setScheduleState = async (
  siteId: SchedulerSiteId,
  kind: ScheduleKind,
  update: Record<string, unknown>
) => {
  const prefix = `maintenanceSchedule.${kind}`;
  await Site.findByIdAndUpdate(
    siteId,
    {
      $set: Object.fromEntries(Object.entries(update).map(([key, value]) => [`${prefix}.${key}`, value]))
    }
  );
};

const hasActiveJob = async (siteId: SchedulerSiteId, type: "backup" | "health-check") =>
  Boolean(await Job.findOne({ siteId, type, status: { $in: ACTIVE_JOB_STATUSES } }).select({ _id: 1 }).lean());

const dueSitesQuery = (now: Date) => ({
  status: { $ne: "archived" },
  $or: [
    {
      "maintenanceSchedule.backup.enabled": true,
      $or: [
        { "maintenanceSchedule.backup.nextRunAt": { $exists: false } },
        { "maintenanceSchedule.backup.nextRunAt": null },
        { "maintenanceSchedule.backup.nextRunAt": { $lte: now } }
      ]
    },
    {
      "maintenanceSchedule.healthCheck.enabled": true,
      $or: [
        { "maintenanceSchedule.healthCheck.nextRunAt": { $exists: false } },
        { "maintenanceSchedule.healthCheck.nextRunAt": null },
        { "maintenanceSchedule.healthCheck.nextRunAt": { $lte: now } }
      ]
    }
  ]
});

async function queueScheduledBackup(site: any, now: Date, result: SchedulerTickResult) {
  const siteId = siteIdOf(site);
  const schedule = site.maintenanceSchedule?.backup || {};
  const intervalMinutes = clampIntervalMinutes(schedule.intervalMinutes, 24 * 60);
  const nextRunAt = nextRunFrom(now, intervalMinutes);

  if (await hasActiveJob(siteId, "backup")) {
    result.skipped += 1;
    await setScheduleState(siteId, "backup", {
      nextRunAt,
      lastError: "scheduled-backup-skipped-active-job"
    });
    logger.warn("backups", "Scheduled backup skipped because an active backup job already exists", {
      siteId: siteId.toString(),
      siteCode: site.siteCode,
      nextRunAt
    });
    return;
  }

  try {
    const queued = await enqueueSiteBackup({
      siteId: siteId.toString(),
      createdBy: SCHEDULER_ACTOR,
      executionContext: "scheduled"
    });
    result.queuedBackups += 1;
    await setScheduleState(siteId, "backup", {
      intervalMinutes,
      nextRunAt,
      lastQueuedAt: now,
      lastJobId: queued.job._id.toString(),
      lastError: ""
    });
    logger.info("backups", "Scheduled backup queued", {
      siteId: siteId.toString(),
      siteCode: site.siteCode,
      jobId: queued.job._id.toString(),
      nextRunAt,
      requiresApproval: queued.requiresApproval
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    result.failed += 1;
    await setScheduleState(siteId, "backup", {
      intervalMinutes,
      nextRunAt,
      lastError: message,
      failureCount: Number(schedule.failureCount || 0) + 1
    });
    logger.error("backups", "Scheduled backup queue failed", {
      siteId: siteId.toString(),
      siteCode: site.siteCode,
      nextRunAt,
      error
    });
  }
}

async function queueScheduledHealthCheck(site: any, now: Date, result: SchedulerTickResult) {
  const siteId = siteIdOf(site);
  const schedule = site.maintenanceSchedule?.healthCheck || {};
  const intervalMinutes = clampIntervalMinutes(schedule.intervalMinutes, 60);
  const nextRunAt = nextRunFrom(now, intervalMinutes);

  if (await hasActiveJob(siteId, "health-check")) {
    result.skipped += 1;
    await setScheduleState(siteId, "healthCheck", {
      nextRunAt,
      lastError: "scheduled-health-check-skipped-active-job"
    });
    logger.warn("sites", "Scheduled health check skipped because an active health-check job already exists", {
      siteId: siteId.toString(),
      siteCode: site.siteCode,
      nextRunAt
    });
    return;
  }

  try {
    const policy = getSharePointOperationPolicy("scheduled-health-check");
    const job = await createJob({
      type: "health-check",
      siteId: siteId.toString(),
      createdBy: SCHEDULER_ACTOR,
      executionMode: "browser-required",
      connectorMode: "browser-sharepoint",
      operationPolicy: policy.operation,
      connectorStatusLabel: policy.statusLabelHe,
      connectorBlocker: policy.blockerHe || "",
      payload: {
        scheduled: true,
        kind: "health-check",
        intervalMinutes,
        connectorMode: "browser-sharepoint",
        executionMode: "browser-required",
        browserOperationPlan: {
          operation: "health-check",
          connectorMode: "browser-sharepoint",
          executionMode: "browser-required",
          siteId: siteId.toString(),
          siteCode: site.siteCode,
          message: getBrowserRequiredJobMessage("scheduled-health-check")
        }
      }
    });
    result.queuedHealthChecks += 1;
    await setScheduleState(siteId, "healthCheck", {
      intervalMinutes,
      nextRunAt,
      lastQueuedAt: now,
      lastJobId: job._id.toString(),
      lastError: ""
    });
    logger.info("sites", "Scheduled health-check job queued", {
      siteId: siteId.toString(),
      siteCode: site.siteCode,
      jobId: job._id.toString(),
      nextRunAt
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    result.failed += 1;
    await setScheduleState(siteId, "healthCheck", {
      intervalMinutes,
      nextRunAt,
      lastError: message,
      failureCount: Number(schedule.failureCount || 0) + 1
    });
    logger.error("sites", "Scheduled health-check queue failed", {
      siteId: siteId.toString(),
      siteCode: site.siteCode,
      nextRunAt,
      error
    });
  }
}

export async function runMaintenanceSchedulerTick(now = new Date()): Promise<SchedulerTickResult> {
  const result: SchedulerTickResult = {
    checkedAt: now.toISOString(),
    dueSites: 0,
    queuedBackups: 0,
    queuedHealthChecks: 0,
    skipped: 0,
    failed: 0
  };

  logger.debug("jobs", "Maintenance scheduler tick started", { now: now.toISOString() });
  const sites = await Site.find(dueSitesQuery(now)).limit(env.MAINTENANCE_SCHEDULER_MAX_SITES_PER_TICK);
  result.dueSites = sites.length;

  for (const site of sites) {
    if (isDue((site as any).maintenanceSchedule?.backup, now)) {
      await queueScheduledBackup(site, now, result);
    }
    if (isDue((site as any).maintenanceSchedule?.healthCheck, now)) {
      await queueScheduledHealthCheck(site, now, result);
    }
  }

  logger.info("jobs", "Maintenance scheduler tick completed", result);
  return result;
}

async function tick() {
  if (running) {
    logger.debug("jobs", "Maintenance scheduler tick skipped because another tick is running");
    return;
  }
  running = true;
  try {
    await runMaintenanceSchedulerTick();
  } finally {
    running = false;
  }
}

export function startMaintenanceScheduler() {
  if (!env.MAINTENANCE_SCHEDULER_ENABLED) {
    logger.warn("jobs", "Maintenance scheduler not started because it is disabled");
    return;
  }
  if (timer) {
    logger.debug("jobs", "Maintenance scheduler start skipped because timer already exists");
    return;
  }

  timer = setInterval(() => {
    tick().catch((error) => logger.error("jobs", "Maintenance scheduler tick failed", { error }));
  }, env.MAINTENANCE_SCHEDULER_POLL_MS);

  logger.info("jobs", "Maintenance scheduler started", {
    pollMs: env.MAINTENANCE_SCHEDULER_POLL_MS,
    maxSitesPerTick: env.MAINTENANCE_SCHEDULER_MAX_SITES_PER_TICK
  });
}

export function stopMaintenanceScheduler() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
  logger.info("jobs", "Maintenance scheduler stopped");
}
