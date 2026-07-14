import { useCallback, useEffect, useMemo, useState } from "react";
import type { Job, OperationalStatusSnapshot } from "../../api/sitesApi";
import { sitesApi } from "../../api/sitesApi";
import { useOperationalStatus } from "../OperationalStatusProvider";
import type { Site, SitesStats } from "../../types/site";
import { formatDateTime, formatMb, formatNumber, healthStatusLabel, jobStatusLabel, jobTypeLabel } from "../../utils/format";
import type {
  DashboardLabData,
  DashboardLabLoadState,
  DashboardLabRawData,
  LabActivityItem,
  LabCapability,
  LabChartRow,
  LabDomain,
  LabMetric,
  LabRiskItem,
  LabTone,
  LabWatchlistItem
} from "./dashboardLabTypes";
import { compactList, freshnessBucket, mostSevere, pct, severityWeight, toneFromSeverity } from "./dashboardLabUtils";

const defaultStats: SitesStats = {
  total: 0,
  active: 0,
  warning: 0,
  failed: 0,
  archived: 0,
  totalStorageMb: 0,
  health: { healthy: 0, warning: 0, failed: 0, unknown: 0 }
};

const activeJobStatuses = new Set<Job["status"]>([
  "awaiting-approval",
  "queued",
  "browser-required",
  "browser-in-progress",
  "preflight",
  "running",
  "verifying",
  "retrying"
]);

const chartColors = {
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
  info: "var(--info)",
  neutral: "var(--text-subtle)",
  accent: "var(--accent)"
};

function buildStats(sites: Site[]): SitesStats {
  const health = { healthy: 0, warning: 0, failed: 0, unknown: 0 };
  for (const site of sites) {
    health[site.derivedHealthStatus || "unknown"] += 1;
  }
  return {
    total: sites.length,
    active: sites.filter((site) => site.status === "active").length,
    warning: sites.filter((site) => site.status === "warning").length,
    failed: sites.filter((site) => site.status === "failed").length,
    archived: sites.filter((site) => site.status === "archived").length,
    totalStorageMb: sites.reduce((sum, site) => sum + Number(site.storageMb || 0), 0),
    health
  };
}

function groupRows(values: string[], labelMap: Record<string, string>, toneMap: Record<string, LabTone> = {}): LabChartRow[] {
  const counts = values.reduce<Record<string, number>>((acc, value) => {
    const key = value || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts)
    .map(([key, value]) => ({
      key,
      label: labelMap[key] || key,
      value,
      formattedValue: formatNumber(value),
      tone: toneMap[key] || "neutral",
      color: chartColors[toneMap[key] || "neutral"]
    }))
    .sort((a, b) => b.value - a.value);
}

function browserSharePointCapability(status: OperationalStatusSnapshot["browserSharePoint"]): LabCapability {
  if (status.status === "connected") {
    return { key: "browser", label: "Browser SharePoint", detail: status.message, mode: "live", tone: "success", to: "/diagnostics" };
  }
  if (status.status === "failed") {
    return { key: "browser", label: "Browser SharePoint", detail: status.nextStep || status.message, mode: "blocked", tone: "danger", to: "/diagnostics" };
  }
  if (status.status === "refreshing") {
    return { key: "browser", label: "Browser SharePoint", detail: "בדיקה מתעדכנת", mode: "cached", tone: "info", to: "/diagnostics" };
  }
  return {
    key: "browser",
    label: "Browser SharePoint",
    detail: status.source === "cached evidence" ? "מוצגת ראיה שמורה" : status.nextStep,
    mode: status.source === "cached evidence" ? "cached" : "metadata",
    tone: status.source === "cached evidence" ? "info" : "neutral",
    to: "/diagnostics"
  };
}

function builderCapability(status: OperationalStatusSnapshot["builderBackend"]): LabCapability {
  if (status.status === "reachable") return { key: "builder", label: "Builder backend", detail: status.message, mode: "live", tone: "success", to: "/settings" };
  if (status.status === "configured") return { key: "builder", label: "Builder backend", detail: status.nextStep, mode: "metadata", tone: "info", to: "/settings" };
  if (status.status === "failed") return { key: "builder", label: "Builder backend", detail: status.message, mode: "blocked", tone: "danger", to: "/diagnostics" };
  if (status.status === "not_relevant") return { key: "builder", label: "Builder backend", detail: status.message, mode: "metadata", tone: "neutral", to: "/settings" };
  return { key: "builder", label: "Builder backend", detail: status.nextStep, mode: "blocked", tone: "warning", to: "/settings" };
}

function metric(key: string, label: string, value: string, detail: string, tone: LabTone, to?: string): LabMetric {
  return { key, label, value, detail, tone, to };
}

function createDashboardLabData(raw: DashboardLabRawData, operationalStatus: OperationalStatusSnapshot): DashboardLabData {
  const sites = raw.sites;
  const jobs = raw.jobs;
  const stats = raw.stats || buildStats(sites);
  const activeSites = sites.filter((site) => site.status !== "archived");
  const failedJobs = jobs.filter((job) => job.status === "failed");
  const activeJobs = jobs.filter((job) => activeJobStatuses.has(job.status));
  const awaitingJobs = jobs.filter((job) => job.status === "awaiting-approval" || job.status === "browser-required");
  const failedHealthSites = activeSites.filter((site) => site.status === "failed" || site.derivedHealthStatus === "failed");
  const warningHealthSites = activeSites.filter((site) => site.status === "warning" || site.derivedHealthStatus === "warning");
  const backupFailureSites = activeSites.filter((site) => site.backupStatus === "failed");
  const backupMissingSites = activeSites.filter((site) => !site.lastBackupAt);
  const staleBackupSites = activeSites.filter((site) => {
    if (!site.lastBackupAt) return false;
    return freshnessBucket(site.lastBackupAt) === "ישן";
  });
  const backupRiskSites = [...new Set([...backupFailureSites, ...backupMissingSites, ...staleBackupSites])];
  const adminRiskSites = activeSites.filter((site) =>
    site.adminSyncStatus === "failed" || site.adminSourceStatus?.some((source) => source.status === "failed" || source.ok === false)
  );
  const mongoSeedRiskSites = activeSites.filter((site) =>
    site.storageBackend === "mongo" && site.mongoBackendStatus?.seedStatus && site.mongoBackendStatus.seedStatus !== "ok"
  );

  const versionRows = Array.isArray(raw.versionStatus?.sites) ? raw.versionStatus.sites : [];
  const outdatedCount = Number(
    raw.versionStatus?.outdatedSites ||
    versionRows.filter((row: any) => row.status === "outdated").length ||
    activeSites.filter((site) => site.versionStatus === "outdated").length ||
    0
  );
  const latestVersion = raw.versionStatus?.latestVersion || "לא ידוע";
  const versionTotal = Math.max(Number(raw.versionStatus?.totalSites || versionRows.length || stats.total || activeSites.length || 0), outdatedCount);
  const releaseAdoptionPercent = versionTotal ? ((versionTotal - outdatedCount) / versionTotal) * 100 : 0;
  const healthScorePercent = pct(stats.health.healthy, Math.max(stats.total, activeSites.length, 1));
  const backupReliabilityPercent = pct(activeSites.length - backupRiskSites.length, Math.max(activeSites.length, 1));

  const hubApiOk = operationalStatus.hubApi.status === "connected";
  const hubMongoOk = operationalStatus.hubMongo.status === "connected";
  const browserReady = operationalStatus.browserSharePoint.status === "connected";
  const sharePointWriteReady = Boolean(raw.capabilities?.sharePoint.writeAvailable || browserReady);

  const riskQueue: LabRiskItem[] = [];
  const pushRisk = (item: LabRiskItem) => riskQueue.push(item);

  if (!hubApiOk) {
    pushRisk({
      key: "hub-api",
      title: "Hub API לא זמין",
      description: "אי אפשר לסמוך על תמונת המצב עד שה־API חוזר לענות.",
      to: "/diagnostics",
      actionLabel: "פתח אבחון",
      severity: "critical",
      tone: "danger",
      category: "connectivity",
      meta: operationalStatus.hubApi.message
    });
  }

  if (failedJobs.length) {
    pushRisk({
      key: "failed-jobs",
      title: `${formatNumber(failedJobs.length)} פעולות נכשלו`,
      description: "בדקו לוגים ואישורים לפני הרצה חוזרת, פריסה או שחזור.",
      to: "/jobs",
      actionLabel: "פתח תור",
      severity: "critical",
      tone: "danger",
      category: "jobs",
      meta: compactList(failedJobs.map((job) => jobTypeLabel(job.type)))
    });
  }

  if (failedHealthSites.length) {
    pushRisk({
      key: "failed-health",
      title: `${formatNumber(failedHealthSites.length)} אתרים בכשל`,
      description: "Health failed חוסם פעולות רוחב עד בדיקה ממוקדת.",
      to: `/sites/${failedHealthSites[0]._id}`,
      actionLabel: "פתח אתר",
      severity: "critical",
      tone: "danger",
      category: "health",
      meta: compactList(failedHealthSites.map((site) => site.siteCode))
    });
  }

  if (!sharePointWriteReady) {
    pushRisk({
      key: "write-path",
      title: "מסלול כתיבה לא מאומת",
      description: "קריאה ותכנון זמינים, אבל Execute דורש Browser SharePoint או יכולת כתיבה מאומתת.",
      to: "/diagnostics",
      actionLabel: "בדוק חיבור",
      severity: "high",
      tone: "warning",
      category: "connectivity",
      meta: raw.capabilities?.sharePoint.reason || operationalStatus.browserSharePoint.nextStep
    });
  }

  if (backupFailureSites.length) {
    pushRisk({
      key: "backup-failure",
      title: `${formatNumber(backupFailureSites.length)} גיבויים נכשלו`,
      description: "Recovery readiness צריך בדיקה לפני פעולות כתיבה רחבות.",
      to: "/backups",
      actionLabel: "בדוק גיבויים",
      severity: "high",
      tone: "warning",
      category: "backup",
      meta: compactList(backupFailureSites.map((site) => site.siteCode))
    });
  }

  if (mongoSeedRiskSites.length) {
    pushRisk({
      key: "mongo-seed",
      title: `${formatNumber(mongoSeedRiskSites.length)} אתרי Mongo עם Seed לא תקין`,
      description: "Mongo-backed sites צריכים seed/runtime תקינים לפני בדיקות עומק וגיבויים.",
      to: "/health",
      actionLabel: "פתח תקינות",
      severity: "high",
      tone: "warning",
      category: "data",
      meta: "Mongo seed"
    });
  }

  if (outdatedCount) {
    pushRisk({
      key: "outdated",
      title: `${formatNumber(outdatedCount)} אתרים מאחורי latest`,
      description: "דורש תכנון פריסה, Dry-run ובדיקת blast radius.",
      to: "/releases",
      actionLabel: "תכנן פריסה",
      severity: "medium",
      tone: "warning",
      category: "release",
      meta: `Latest ${latestVersion}`
    });
  }

  if (warningHealthSites.length) {
    pushRisk({
      key: "warning-health",
      title: `${formatNumber(warningHealthSites.length)} אתרים באזהרה`,
      description: "לא בהכרח חוסם, אבל כדאי לבדוק לפני rollout רחב.",
      to: `/sites/${warningHealthSites[0]._id}`,
      actionLabel: "בדוק Health",
      severity: "medium",
      tone: "warning",
      category: "health",
      meta: compactList(warningHealthSites.map((site) => site.siteCode))
    });
  }

  if (backupMissingSites.length || staleBackupSites.length) {
    pushRisk({
      key: "backup-freshness",
      title: `${formatNumber(backupMissingSites.length + staleBackupSites.length)} אתרים בלי ראיית גיבוי טרייה`,
      description: "הדשבורד מציג Freshness בלבד; פרטי Evidence נשארים במסך הגיבויים.",
      to: "/backups",
      actionLabel: "פתח Recovery",
      severity: "medium",
      tone: "warning",
      category: "backup",
      meta: `${formatNumber(backupMissingSites.length)} ללא ראיה`
    });
  }

  if (adminRiskSites.length) {
    pushRisk({
      key: "admin-risk",
      title: `${formatNumber(adminRiskSites.length)} אתרים עם פערי הרשאות`,
      description: "בדקו מקור אמת וראיות לפני שינוי admin חי.",
      to: "/admins",
      actionLabel: "פתח הרשאות",
      severity: "medium",
      tone: "info",
      category: "access",
      meta: compactList(adminRiskSites.map((site) => site.siteCode))
    });
  }

  if (!riskQueue.length) {
    pushRisk({
      key: "all-clear",
      title: "אין משימות דחופות",
      description: "לא זוהו כשלים, גיבויים שנכשלו, או פער גרסאות שמחייב פעולה עכשיו.",
      to: "/sites",
      actionLabel: "פתח Registry",
      severity: "clear",
      tone: "success",
      category: "health",
      meta: "Operationally clear"
    });
  }

  riskQueue.sort((a, b) => severityWeight[b.severity] - severityWeight[a.severity]);
  const overallSeverity = mostSevere(riskQueue);
  const overallTone = toneFromSeverity(overallSeverity);
  const attentionItems = riskQueue.filter((item) => item.severity !== "clear").length;
  const primaryAction = riskQueue[0];

  const counts = {
    totalSites: stats.total,
    activeSites: activeSites.length,
    archivedSites: stats.archived,
    attentionItems,
    failedJobs: failedJobs.length,
    activeJobs: activeJobs.length,
    failedHealthSites: failedHealthSites.length,
    warningHealthSites: warningHealthSites.length,
    backupRiskSites: backupRiskSites.length,
    backupFailureSites: backupFailureSites.length,
    adminRiskSites: adminRiskSites.length,
    outdatedSites: outdatedCount,
    mongoSites: activeSites.filter((site) => site.storageBackend === "mongo").length,
    txtSites: activeSites.filter((site) => site.storageBackend === "txt").length,
    unknownStorageSites: activeSites.filter((site) => !site.storageBackend || site.storageBackend === "unknown").length,
    totalAdmins: activeSites.reduce((sum, site) => sum + Number(site.adminsCount || 0), 0),
    totalBackups: activeSites.reduce((sum, site) => sum + Number(site.backupCount || 0), 0),
    totalStorageMb: activeSites.reduce((sum, site) => sum + Number(site.storageMb || 0), 0)
  };

  const topMetrics = [
    metric("sites", "אתרים פעילים", formatNumber(counts.activeSites), `${formatNumber(counts.archivedSites)} בארכיון`, "info", "/sites"),
    metric("attention", "דורש טיפול", formatNumber(counts.attentionItems), "סעיפים בתור העדיפויות", counts.attentionItems ? "warning" : "success", "/monitoring"),
    metric("release", "אימוץ גרסה", `${Math.round(releaseAdoptionPercent)}%`, `${formatNumber(counts.outdatedSites)} מאחורי latest`, counts.outdatedSites ? "warning" : "success", "/releases"),
    metric("backup", "אמינות גיבוי", `${Math.round(backupReliabilityPercent)}%`, `${formatNumber(counts.backupRiskSites)} אתרים בסיכון`, counts.backupRiskSites ? "warning" : "success", "/backups")
  ];

  const executiveMetrics = [
    metric("fleet", "Fleet snapshot", formatNumber(counts.totalSites), `${formatNumber(counts.activeSites)} פעילים`, "info", "/sites"),
    metric("health-score", "Health score", `${Math.round(healthScorePercent)}%`, `${formatNumber(counts.failedHealthSites)} בכשל`, counts.failedHealthSites ? "danger" : counts.warningHealthSites ? "warning" : "success", "/health"),
    metric("release-ready", "Release readiness", `${Math.round(releaseAdoptionPercent)}%`, `Latest ${latestVersion}`, counts.outdatedSites ? "warning" : "success", "/releases"),
    metric("recovery", "Backup reliability", `${Math.round(backupReliabilityPercent)}%`, `${formatNumber(counts.totalBackups)} גיבויים רשומים`, counts.backupRiskSites ? "warning" : "success", "/backups")
  ];

  const capabilityStrip: LabCapability[] = [
    {
      key: "api",
      label: "Hub API",
      detail: operationalStatus.hubApi.message,
      mode: hubApiOk ? "live" : "blocked",
      tone: hubApiOk ? "success" : "danger",
      to: "/diagnostics"
    },
    {
      key: "mongo",
      label: "Hub Mongo",
      detail: operationalStatus.hubMongo.message,
      mode: hubMongoOk ? "live" : operationalStatus.hubMongo.status === "unknown" ? "unknown" : "blocked",
      tone: hubMongoOk ? "success" : operationalStatus.hubMongo.status === "unknown" ? "neutral" : "danger",
      to: "/diagnostics"
    },
    browserSharePointCapability(operationalStatus.browserSharePoint),
    builderCapability(operationalStatus.builderBackend),
    {
      key: "write",
      label: "SharePoint write",
      detail: sharePointWriteReady ? "מסלול Execute זמין" : raw.capabilities?.sharePoint.reason || "נדרשת בדיקת חיבור",
      mode: sharePointWriteReady ? "live" : raw.capabilities ? "blocked" : "metadata",
      tone: sharePointWriteReady ? "success" : "warning",
      to: "/diagnostics"
    },
    {
      key: "identity",
      label: "Identity",
      detail: operationalStatus.currentIdentity.label,
      mode: operationalStatus.currentIdentity.mode === "unknown" ? "unknown" : "metadata",
      tone: operationalStatus.currentIdentity.mode === "unknown" ? "warning" : "info",
      to: "/settings"
    }
  ];

  const healthDistribution: LabChartRow[] = [
    { key: "healthy", label: "תקין", value: stats.health.healthy, formattedValue: formatNumber(stats.health.healthy), tone: "success", color: chartColors.success, to: "/health" },
    { key: "warning", label: "אזהרה", value: stats.health.warning, formattedValue: formatNumber(stats.health.warning), tone: "warning", color: chartColors.warning, to: "/health" },
    { key: "failed", label: "נכשל", value: stats.health.failed, formattedValue: formatNumber(stats.health.failed), tone: "danger", color: chartColors.danger, to: "/health" },
    { key: "unknown", label: "לא נבדק", value: stats.health.unknown, formattedValue: formatNumber(stats.health.unknown), tone: "neutral", color: chartColors.neutral, to: "/health" }
  ];

  const storageDistribution = groupRows(
    activeSites.map((site) => site.storageBackend || "unknown"),
    { txt: "TXT", mongo: "Mongo", unknown: "Unknown" },
    { txt: "info", mongo: "success", unknown: "warning" }
  );

  const environmentDistribution = groupRows(
    activeSites.map((site) => site.environment || "unknown"),
    { production: "Production", staging: "Staging", test: "Test", dev: "Dev", local: "Local", unknown: "Unknown" },
    { production: "warning", staging: "info", test: "neutral", dev: "neutral", local: "neutral", unknown: "neutral" }
  );

  const jobsDistribution = groupRows(
    jobs.map((job) => job.status),
    jobs.reduce<Record<string, string>>((acc, job) => ({ ...acc, [job.status]: jobStatusLabel(job.status) }), {}),
    { failed: "danger", succeeded: "success", running: "info", queued: "info", "awaiting-approval": "warning", "browser-required": "warning" }
  );

  const backupFreshness = groupRows(
    activeSites.map((site) => site.backupStatus === "failed" ? "נכשל" : freshnessBucket(site.lastBackupAt)),
    { "24 שעות": "24 שעות", "עד שבוע": "עד שבוע", "עד חודש": "עד חודש", "עד רבעון": "עד רבעון", "ישן": "ישן", "אין ראיה": "אין ראיה", "נכשל": "נכשל" },
    { "24 שעות": "success", "עד שבוע": "success", "עד חודש": "info", "עד רבעון": "warning", "ישן": "warning", "אין ראיה": "warning", "נכשל": "danger" }
  );

  const riskCategoryCounts = riskQueue
    .filter((item) => item.severity !== "clear")
    .reduce<Record<string, { label: string; value: number; tone: LabTone }>>((acc, item) => {
      const labels = {
        connectivity: "חיבורים",
        health: "Health",
        release: "גרסאות",
        backup: "גיבוי",
        access: "הרשאות",
        jobs: "Jobs",
        data: "Data"
      };
      const current = acc[item.category] || { label: labels[item.category], value: 0, tone: item.tone };
      current.value += 1;
      if (severityWeight[item.severity] > severityWeight[(current.tone === "danger" ? "critical" : current.tone === "warning" ? "high" : "clear")]) {
        current.tone = item.tone;
      }
      acc[item.category] = current;
      return acc;
    }, {});

  const riskCategories = Object.entries(riskCategoryCounts)
    .map(([key, row]) => ({ key, label: row.label, value: row.value, formattedValue: formatNumber(row.value), tone: row.tone, color: chartColors[row.tone] }))
    .sort((a, b) => b.value - a.value);

  const watchlist = activeSites
    .map<LabWatchlistItem | null>((site) => {
      const issues: Array<{ title: string; detail: string; tone: LabTone; score: number }> = [];
      if (site.status === "failed" || site.derivedHealthStatus === "failed") issues.push({ title: "Health failed", detail: healthStatusLabel(site.derivedHealthStatus), tone: "danger", score: 9 });
      if (site.status === "warning" || site.derivedHealthStatus === "warning") issues.push({ title: "Health warning", detail: healthStatusLabel(site.derivedHealthStatus), tone: "warning", score: 6 });
      if (site.backupStatus === "failed") issues.push({ title: "Backup failed", detail: "גיבוי אחרון נכשל", tone: "warning", score: 7 });
      if (!site.lastBackupAt) issues.push({ title: "No backup evidence", detail: "אין ראיית גיבוי", tone: "warning", score: 4 });
      if (site.versionStatus === "outdated") issues.push({ title: "Outdated version", detail: `גרסה ${site.currentVersion || site.version || "-"}`, tone: "warning", score: 5 });
      if (site.adminSyncStatus === "failed") issues.push({ title: "Admin source failed", detail: "סנכרון הרשאות נכשל", tone: "info", score: 3 });
      if (site.storageBackend === "mongo" && site.mongoBackendStatus?.seedStatus && site.mongoBackendStatus.seedStatus !== "ok") issues.push({ title: "Mongo seed risk", detail: site.mongoBackendStatus.seedStatus, tone: "warning", score: 6 });
      if (!issues.length) return null;
      const top = issues.sort((a, b) => b.score - a.score)[0];
      return { site, title: top.title, detail: top.detail, tone: top.tone, score: issues.reduce((sum, issue) => sum + issue.score, 0), to: `/sites/${site._id}` };
    })
    .filter((item): item is LabWatchlistItem => Boolean(item))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  const siteActivity: LabActivityItem[] = sites.flatMap((site) => {
    const rows: LabActivityItem[] = [
      { key: `${site._id}-updated`, label: `עודכנה רשומת אתר: ${site.displayName}`, at: site.updatedAt, type: "site", tone: "neutral", to: `/sites/${site._id}` }
    ];
    if (site.lastHealthCheckAt) {
      rows.push({ key: `${site._id}-health`, label: `בדיקת תקינות: ${site.displayName}`, at: site.lastHealthCheckAt, type: "health", tone: site.derivedHealthStatus === "failed" ? "danger" : site.derivedHealthStatus === "warning" ? "warning" : "success", to: `/sites/${site._id}` });
    }
    if (site.lastBackupAt) {
      rows.push({ key: `${site._id}-backup`, label: `גיבוי אחרון: ${site.displayName}`, at: site.lastBackupAt, type: "backup", tone: site.backupStatus === "failed" ? "danger" : "success", to: `/sites/${site._id}` });
    }
    if (site.lastDeployAt) {
      rows.push({ key: `${site._id}-deploy`, label: `פריסה אחרונה: ${site.displayName}`, at: site.lastDeployAt, type: "deploy", tone: "info", to: `/sites/${site._id}` });
    }
    return rows;
  });

  const jobActivity: LabActivityItem[] = jobs.slice(0, 12).map((job) => ({
      key: `${job._id}-job`,
      label: `${jobTypeLabel(job.type)}: ${jobStatusLabel(job.status)}`,
      at: job.finishedAt || job.startedAt || job.createdAt,
      type: "job",
      tone: job.status === "failed" ? "danger" : activeJobStatuses.has(job.status) ? "info" : "success",
      to: "/jobs"
    }));

  const recentActivity: LabActivityItem[] = [...siteActivity, ...jobActivity]
    .sort((a, b) => +new Date(b.at) - +new Date(a.at))
    .slice(0, 7);

  const deployRisks = riskQueue.filter((item) => item.category === "release" || item.category === "jobs");
  const recoveryRisks = riskQueue.filter((item) => item.category === "backup");
  const accessRisks = riskQueue.filter((item) => item.category === "access");
  const healthRisks = riskQueue.filter((item) => item.category === "health" || item.category === "connectivity" || item.category === "data");

  const domain = (
    key: LabDomain["key"],
    title: string,
    subtitle: string,
    status: string,
    tone: LabTone,
    to: string,
    actionLabel: string,
    metrics: LabMetric[],
    risks: LabRiskItem[],
    capabilities: LabCapability[]
  ): LabDomain => ({ key, title, subtitle, status, tone, to, actionLabel, metrics, risks, capabilities });

  const domains = [
    domain(
      "deploy",
      "Deploy",
      "גרסאות, אימוץ ותור פריסה",
      counts.outdatedSites || failedJobs.length ? "דורש בדיקה" : "מוכן לתכנון",
      counts.outdatedSites || failedJobs.length ? "warning" : "success",
      "/releases",
      "פתח גרסאות",
      [
        metric("adoption", "אימוץ", `${Math.round(releaseAdoptionPercent)}%`, `Latest ${latestVersion}`, counts.outdatedSites ? "warning" : "success"),
        metric("outdated", "מיושנים", formatNumber(counts.outdatedSites), "אתרים מאחורי latest", counts.outdatedSites ? "warning" : "success"),
        metric("deploy-jobs", "Jobs פעילים", formatNumber(activeJobs.filter((job) => job.type.includes("deploy") || job.type.includes("version")).length), "פריסה/גרסה", "info")
      ],
      deployRisks,
      capabilityStrip.filter((capability) => ["api", "browser", "write"].includes(capability.key))
    ),
    domain(
      "recovery",
      "Recovery",
      "גיבוי, טריות ויכולת שחזור",
      counts.backupRiskSites ? "סיכון גיבוי" : "נראה יציב",
      counts.backupRiskSites ? "warning" : "success",
      "/backups",
      "פתח גיבויים",
      [
        metric("reliability", "אמינות", `${Math.round(backupReliabilityPercent)}%`, "לפי ראיית snapshot", counts.backupRiskSites ? "warning" : "success"),
        metric("failed", "נכשלו", formatNumber(counts.backupFailureSites), "גיבויים אחרונים", counts.backupFailureSites ? "danger" : "success"),
        metric("records", "רשומות", formatNumber(counts.totalBackups), "גיבויים ב־Hub", "info")
      ],
      recoveryRisks,
      capabilityStrip.filter((capability) => ["api", "browser", "builder"].includes(capability.key))
    ),
    domain(
      "access",
      "Access",
      "מנהלים ומקורות הרשאה",
      counts.adminRiskSites ? "פערי הרשאות" : "אין פער בולט",
      counts.adminRiskSites ? "warning" : "success",
      "/admins",
      "פתח הרשאות",
      [
        metric("admins", "Admins", formatNumber(counts.totalAdmins), "מנהלים רשומים", "info"),
        metric("drift", "פערים", formatNumber(counts.adminRiskSites), "מקורות שנכשלו", counts.adminRiskSites ? "warning" : "success"),
        metric("awaiting", "ממתין", formatNumber(awaitingJobs.length), "אישורים/דפדפן", awaitingJobs.length ? "warning" : "success")
      ],
      accessRisks,
      capabilityStrip.filter((capability) => ["identity", "browser", "write"].includes(capability.key))
    ),
    domain(
      "health",
      "Health",
      "חיבורים, תקינות ו־Data",
      counts.failedHealthSites ? "כשל פתוח" : counts.warningHealthSites ? "אזהרות פתוחות" : "תקין",
      counts.failedHealthSites ? "danger" : counts.warningHealthSites ? "warning" : "success",
      "/health",
      "פתח תקינות",
      [
        metric("healthy", "תקינים", formatNumber(stats.health.healthy), `${Math.round(healthScorePercent)}% מהצי`, "success"),
        metric("failed", "כשל", formatNumber(counts.failedHealthSites), "אתרים", counts.failedHealthSites ? "danger" : "success"),
        metric("storage", "אחסון", formatMb(Math.round(counts.totalStorageMb)), "רשום ב־Hub", "info")
      ],
      healthRisks,
      capabilityStrip.filter((capability) => ["api", "mongo", "builder"].includes(capability.key))
    )
  ];

  const domainDistribution = domains.map((item) => ({
    key: item.key,
    label: item.title,
    value: item.risks.filter((risk) => risk.severity !== "clear").length,
    formattedValue: formatNumber(item.risks.filter((risk) => risk.severity !== "clear").length),
    tone: item.tone,
    color: chartColors[item.tone],
    to: item.to
  }));

  const overallTitle = overallSeverity === "critical"
    ? "יש חסימה שדורשת טיפול עכשיו"
    : overallSeverity === "high" || overallSeverity === "medium"
      ? "המערכת עובדת, אבל יש מוקדי תשומת לב"
      : "הצי נראה יציב כרגע";

  const overallSubtitle = overallSeverity === "clear"
    ? "אין כרגע כשל מרכזי, פער גיבוי או פער גרסה שמחייב פעולה מיידית."
    : "הסיכום מתעדף את הדברים שכדאי לפתוח לפני פריסה, שחזור או שינוי הרשאות.";

  return {
    ...raw,
    stats,
    generatedAt: operationalStatus.generatedAt,
    operationalStatus,
    activeSites,
    empty: sites.length === 0 && jobs.length === 0,
    counts,
    latestVersion,
    releaseAdoptionPercent,
    healthScorePercent,
    backupReliabilityPercent,
    overallSeverity,
    overallTone,
    overallTitle,
    overallSubtitle,
    primaryAction,
    topMetrics,
    executiveMetrics,
    riskQueue: riskQueue.slice(0, 7),
    capabilityStrip,
    domains,
    watchlist,
    recentActivity,
    distributions: {
      health: healthDistribution,
      storage: storageDistribution,
      environment: environmentDistribution,
      jobs: jobsDistribution,
      backupFreshness,
      riskCategories,
      domains: domainDistribution
    }
  };
}

export function useDashboardLabData(): DashboardLabLoadState {
  const { status } = useOperationalStatus();
  const [raw, setRaw] = useState<DashboardLabRawData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [sitesRes, jobsRes, versionRes, capsRes] = await Promise.all([
        sitesApi.list(),
        sitesApi.jobs(),
        sitesApi.versionStatus(),
        sitesApi.operationCapabilities()
      ]);
      setRaw({
        sites: sitesRes.data,
        jobs: jobsRes.data,
        stats: sitesRes.meta?.stats ?? buildStats(sitesRes.data),
        versionStatus: versionRes.data,
        capabilities: capsRes.data
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בטעינת מעבדת הדשבורד");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const data = useMemo(() => raw ? createDashboardLabData(raw, status) : null, [raw, status]);

  return {
    data,
    loading,
    error,
    refresh
  };
}

export { formatDateTime, formatNumber };
