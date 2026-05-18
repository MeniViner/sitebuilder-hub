import { Types } from "mongoose";
import { env } from "../config/env";
import { Job } from "../models/Job";
import { MonitoringAlert } from "../models/MonitoringAlert";
import { Site } from "../models/Site";
import { deriveHealthStatus } from "../utils/health";
import { logger } from "../utils/logger";

export type MonitoringAlertCategory = "failed_job" | "stale_backup" | "failed_health_check";
export type MonitoringAlertSeverity = "info" | "warning" | "critical";
export type MonitoringAlertStatus = "open" | "active" | "acknowledged" | "resolved";

type EntityRef = {
  type: string;
  id: string;
  label?: string;
  metadata?: Record<string, unknown>;
};

export type DerivedMonitoringAlert = {
  fingerprint: string;
  severity: MonitoringAlertSeverity;
  category: MonitoringAlertCategory;
  message: string;
  entityRefs: EntityRef[];
  evidence: Record<string, unknown>;
  details?: Record<string, unknown>;
};

const alertCategories: MonitoringAlertCategory[] = ["failed_job", "stale_backup", "failed_health_check"];

const objectIdToString = (value: unknown) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value instanceof Types.ObjectId) return value.toString();
  if (typeof value === "object" && "toString" in value) return String(value.toString());
  return String(value);
};

const staleBackupAgeMs = () => {
  const hours = Number(env.MONITORING_STALE_BACKUP_HOURS || 26);
  const normalizedHours = Number.isFinite(hours) && hours > 0 ? hours : 26;
  return normalizedHours * 60 * 60 * 1000;
};

const dateToIso = (value: unknown) => {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

export async function deriveMonitoringAlerts(now = new Date()): Promise<DerivedMonitoringAlert[]> {
  const staleBefore = new Date(now.getTime() - staleBackupAgeMs());
  logger.info("monitoring", "Deriving monitoring alerts", {
    now: now.toISOString(),
    staleBackupHours: env.MONITORING_STALE_BACKUP_HOURS,
    staleBefore: staleBefore.toISOString()
  });

  const [failedJobs, sites] = await Promise.all([
    Job.find({ status: "failed" }).sort({ finishedAt: -1, updatedAt: -1 }).limit(500).lean(),
    Site.find({ status: { $ne: "archived" } }).sort({ updatedAt: -1 }).limit(1000).lean()
  ]);

  const alerts: DerivedMonitoringAlert[] = [];

  for (const job of failedJobs) {
    const jobId = objectIdToString(job._id);
    const siteId = objectIdToString(job.siteId);
    alerts.push({
      fingerprint: `job:failed:${jobId}`,
      severity: "critical",
      category: "failed_job",
      message: `${job.type} job failed${siteId ? ` for site ${siteId}` : ""}`,
      entityRefs: [
        { type: "Job", id: jobId, label: String(job.type), metadata: { status: job.status } },
        ...(siteId ? [{ type: "Site", id: siteId }] : [])
      ],
      evidence: {
        jobId,
        siteId: siteId || undefined,
        jobType: job.type,
        status: job.status,
        attempt: job.attempt,
        maxAttempts: job.maxAttempts,
        errorCode: job.errorCode,
        errorMessage: job.errorMessage,
        errorDetails: job.errorDetails,
        startedAt: dateToIso(job.startedAt),
        finishedAt: dateToIso(job.finishedAt),
        updatedAt: dateToIso(job.updatedAt)
      },
      details: {
        createdBy: job.createdBy,
        progressPercent: job.progressPercent,
        recentLogs: Array.isArray(job.logs) ? job.logs.slice(-5) : []
      }
    });
  }

  for (const site of sites) {
    const siteId = objectIdToString(site._id);
    const lastBackupAt = site.lastBackupAt ? new Date(site.lastBackupAt) : undefined;
    const hasStaleBackup = !lastBackupAt || lastBackupAt.getTime() < staleBefore.getTime();
    if (hasStaleBackup) {
      const neverBackedUp = !lastBackupAt;
      alerts.push({
        fingerprint: `site:backup-stale:${siteId}`,
        severity: neverBackedUp || site.backupStatus === "failed" ? "critical" : "warning",
        category: "stale_backup",
        message: neverBackedUp
          ? `${site.displayName} has no recorded successful backup`
          : `${site.displayName} backup is stale`,
        entityRefs: [
          {
            type: "Site",
            id: siteId,
            label: site.siteCode,
            metadata: { displayName: site.displayName }
          }
        ],
        evidence: {
          siteId,
          siteCode: site.siteCode,
          displayName: site.displayName,
          backupStatus: site.backupStatus,
          lastBackupAt: dateToIso(lastBackupAt),
          lastBackupId: site.lastBackupId,
          backupCount: site.backupCount,
          staleBefore: staleBefore.toISOString(),
          thresholdHours: env.MONITORING_STALE_BACKUP_HOURS
        },
        details: {
          maintenanceSchedule: site.maintenanceSchedule?.backup,
          lastError: site.lastError
        }
      });
    }

    const derivedHealthStatus = deriveHealthStatus(site.health, site.lastHealthCheckAt);
    if (derivedHealthStatus === "failed") {
      const failedChecks = Object.entries(site.health || {})
        .filter(([, value]) => value === false)
        .map(([key]) => key);
      alerts.push({
        fingerprint: `site:health-failed:${siteId}`,
        severity: "critical",
        category: "failed_health_check",
        message: `${site.displayName} health check failed`,
        entityRefs: [
          {
            type: "Site",
            id: siteId,
            label: site.siteCode,
            metadata: { displayName: site.displayName }
          }
        ],
        evidence: {
          siteId,
          siteCode: site.siteCode,
          displayName: site.displayName,
          derivedHealthStatus,
          failedChecks,
          lastHealthCheckAt: dateToIso(site.lastHealthCheckAt),
          health: site.health
        },
        details: {
          sharePointStatus: site.sharePointStatus,
          resolvedPaths: site.resolvedPaths,
          lastError: site.lastError
        }
      });
    }
  }

  logger.info("monitoring", "Monitoring alerts derived", {
    total: alerts.length,
    failedJobs: failedJobs.length,
    sites: sites.length
  });

  const criticalCount = alerts.filter((alert) => alert.severity === "critical").length;
  if (criticalCount > 0) {
    logger.warn("monitoring", "Critical monitoring alerts detected", {
      criticalCount,
      categories: Array.from(new Set(alerts.filter((alert) => alert.severity === "critical").map((alert) => alert.category)))
    });
  }

  return alerts;
}

export async function refreshMonitoringAlerts(now = new Date()) {
  const detectedAlerts = await deriveMonitoringAlerts(now);
  const fingerprints = detectedAlerts.map((alert) => alert.fingerprint);

  await Promise.all(
    detectedAlerts.map(async (alert) => {
      const existingAlert = await MonitoringAlert.findOne({ fingerprint: alert.fingerprint }).select("status").lean();
      const isReopened = existingAlert?.status === "resolved";
      const statusUpdate = isReopened ? { status: "active" } : {};

      return MonitoringAlert.findOneAndUpdate(
        { fingerprint: alert.fingerprint },
        {
          $set: {
            ...statusUpdate,
            severity: alert.severity,
            category: alert.category,
            message: alert.message,
            entityRefs: alert.entityRefs,
            lastDetectedAt: now,
            evidence: alert.evidence,
            details: alert.details
          },
          $setOnInsert: {
            fingerprint: alert.fingerprint,
            firstDetectedAt: now,
            status: "active"
          },
          $unset: {
            resolvedAt: "",
            ...(isReopened
              ? {
                  acknowledgedAt: "",
                  acknowledgedBy: "",
                  acknowledgementNote: ""
                }
              : {})
          }
        },
        { upsert: true, new: true }
      );
    })
  );

  const resolved = await MonitoringAlert.updateMany(
    {
      category: { $in: alertCategories },
      status: { $in: ["active", "acknowledged"] },
      ...(fingerprints.length > 0 ? { fingerprint: { $nin: fingerprints } } : {})
    },
    {
      $set: {
        status: "resolved",
        resolvedAt: now
      }
    }
  );

  logger.info("monitoring", "Monitoring alerts refreshed", {
    detected: detectedAlerts.length,
    resolved: resolved.modifiedCount
  });

  return {
    refreshedAt: now.toISOString(),
    detected: detectedAlerts.length,
    resolved: resolved.modifiedCount,
    fingerprints
  };
}

export function listMonitoringAlerts(filters: {
  status?: MonitoringAlertStatus;
  category?: MonitoringAlertCategory;
  severity?: MonitoringAlertSeverity;
  includeResolved?: boolean;
}) {
  const query: Record<string, unknown> = {};
  if (filters.status === "open") {
    query.status = { $in: ["active", "acknowledged"] };
  } else if (filters.status) {
    query.status = filters.status;
  } else if (!filters.includeResolved) {
    query.status = { $ne: "resolved" };
  }
  if (filters.category) query.category = filters.category;
  if (filters.severity) query.severity = filters.severity;

  logger.debug("monitoring", "Listing monitoring alerts", { filters, query });
  return MonitoringAlert.find(query).sort({ severity: 1, lastDetectedAt: -1 }).limit(500);
}

export async function getMonitoringSummary() {
  logger.info("monitoring", "Building monitoring summary");
  const [byStatus, bySeverity, byCategory, latestOpen] = await Promise.all([
    MonitoringAlert.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    MonitoringAlert.aggregate([
      { $match: { status: { $ne: "resolved" } } },
      { $group: { _id: "$severity", count: { $sum: 1 } } }
    ]),
    MonitoringAlert.aggregate([
      { $match: { status: { $ne: "resolved" } } },
      { $group: { _id: "$category", count: { $sum: 1 } } }
    ]),
    MonitoringAlert.find({ status: { $ne: "resolved" } })
      .sort({ severity: 1, lastDetectedAt: -1 })
      .limit(5)
      .lean()
  ]);

  const statusCounts = Object.fromEntries(byStatus.map((item) => [item._id || "unknown", item.count]));
  const severityCounts = Object.fromEntries(bySeverity.map((item) => [item._id || "unknown", item.count]));
  const categoryCounts = Object.fromEntries(byCategory.map((item) => [item._id || "unknown", item.count]));
  const summary = {
    generatedAt: new Date().toISOString(),
    counts: {
      open: Number(statusCounts.active || 0) + Number(statusCounts.acknowledged || 0),
      active: Number(statusCounts.active || 0),
      acknowledged: Number(statusCounts.acknowledged || 0),
      resolved: Number(statusCounts.resolved || 0),
      bySeverity: severityCounts,
      byCategory: categoryCounts
    },
    latestOpen
  };

  logger.info("monitoring", "Monitoring summary built", {
    open: summary.counts.open,
    active: summary.counts.active,
    acknowledged: summary.counts.acknowledged,
    resolved: summary.counts.resolved
  });
  return summary;
}

export async function acknowledgeMonitoringAlert(alertId: string, acknowledgedBy: string, note?: string) {
  const actor = String(acknowledgedBy || "").trim() || "system";
  const now = new Date();
  logger.info("monitoring", "Acknowledging monitoring alert", {
    alertId,
    acknowledgedBy: actor,
    note: note || ""
  });

  const alert = await MonitoringAlert.findOneAndUpdate(
    { _id: alertId, status: { $ne: "resolved" } },
    {
      $set: {
        status: "acknowledged",
        acknowledgedAt: now,
        acknowledgedBy: actor,
        acknowledgementNote: String(note || "").trim()
      }
    },
    { new: true }
  );

  if (!alert) {
    logger.error("monitoring", "Monitoring alert acknowledge target not found", { alertId });
    throw new Error("monitoring-alert-not-found");
  }
  return alert;
}
