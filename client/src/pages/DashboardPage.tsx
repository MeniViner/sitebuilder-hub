import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BellRing,
  Cable,
  CheckCircle2,
  Clock3,
  Database,
  DatabaseBackup,
  FileClock,
  FolderKanban,
  GitBranch,
  HardDrive,
  HeartPulse,
  Rocket,
  ShieldAlert,
  ShieldCheck,
  Users,
  Workflow
} from "lucide-react";
import { Job, OperationCapabilities, sitesApi } from "../api/sitesApi";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { useOperationalStatus } from "../components/OperationalStatusProvider";
import { PageHeader } from "../components/PageHeader";
import { StatusToken } from "../components/StatusToken";
import { Site, SitesStats } from "../types/site";
import { formatDateTime, formatMb, formatNumber, jobStatusLabel, jobTypeLabel } from "../utils/format";

const defaultStats: SitesStats = {
  total: 0,
  active: 0,
  warning: 0,
  failed: 0,
  archived: 0,
  totalStorageMb: 0,
  health: { healthy: 0, warning: 0, failed: 0, unknown: 0 }
};

type DashboardSeverity = "critical" | "high" | "medium" | "clear";
type DashboardTone = "success" | "warning" | "danger" | "info" | "neutral";

type DecisionQueueItem = {
  key: string;
  title: string;
  description: string;
  to: string;
  actionLabel: string;
  severity: DashboardSeverity;
  tone: DashboardTone;
  icon: JSX.Element;
  meta?: string;
};

type FleetMetric = {
  key: string;
  label: string;
  value: string | number;
  detail: string;
  tone: DashboardTone;
  icon: JSX.Element;
  to: string;
};

type DashboardModulePreview = {
  key: string;
  title: string;
  description: string;
  to: string;
  primary: string | number;
  secondary: string;
  tone: DashboardTone;
  icon: JSX.Element;
};

const severityWeight: Record<DashboardSeverity, number> = {
  critical: 3,
  high: 2,
  medium: 1,
  clear: 0
};

const dashboardToneClass: Record<DashboardTone, string> = {
  success: "dashboard-tone-success",
  warning: "dashboard-tone-warning",
  danger: "dashboard-tone-danger",
  info: "dashboard-tone-info",
  neutral: "dashboard-tone-neutral"
};

const severityLabel: Record<DashboardSeverity, string> = {
  critical: "קריטי",
  high: "גבוה",
  medium: "בינוני",
  clear: "תקין"
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

const formatPercent = (value: number) => `${formatNumber(Math.max(0, Math.min(100, Math.round(value))))}%`;

function pct(value: number, total: number) {
  return total ? Math.round((value / total) * 100) : 0;
}

function severityFromQueue(items: DecisionQueueItem[]): DashboardSeverity {
  return items.reduce<DashboardSeverity>((current, item) =>
    severityWeight[item.severity] > severityWeight[current] ? item.severity : current, "clear");
}

function statusToneFromSeverity(severity: DashboardSeverity): DashboardTone {
  if (severity === "critical") return "danger";
  if (severity === "high" || severity === "medium") return "warning";
  return "success";
}

function browserSharePointCopy(status: ReturnType<typeof useOperationalStatus>["status"]["browserSharePoint"]["status"]) {
  if (status === "connected") return { label: "Browser SharePoint מחובר", detail: "קריאה ופעולות דפדפן זמינות", tone: "success" as const };
  if (status === "failed") return { label: "חיבור דפדפן נכשל", detail: "פתח אבחון לפני פעולת כתיבה", tone: "danger" as const };
  if (status === "refreshing") return { label: "מרענן Browser SharePoint", detail: "ממתין לתוצאת בדיקה", tone: "info" as const };
  return { label: "Browser SharePoint לא נבדק", detail: "בדיקה נדרשת לפני Execute חי", tone: "warning" as const };
}

function builderBackendCopy(status: ReturnType<typeof useOperationalStatus>["status"]["builderBackend"]["status"]) {
  if (status === "reachable") return { label: "Builder backend נגיש", detail: "Mongo operations זמינות", tone: "success" as const };
  if (status === "configured") return { label: "Builder backend מוגדר", detail: "נדרשת בדיקת reachability", tone: "info" as const };
  if (status === "failed") return { label: "Builder backend נכשל", detail: "בדוק Mongo sites ו־runtime", tone: "danger" as const };
  if (status === "not_relevant") return { label: "Builder backend לא רלוונטי", detail: "אין תלות ל־TXT בלבד", tone: "neutral" as const };
  return { label: "Builder backend לא מוגדר", detail: "Mongo creation/backup עשויים להיות חסומים", tone: "warning" as const };
}

export function DashboardPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [stats, setStats] = useState<SitesStats>(defaultStats);
  const [versionStatus, setVersionStatus] = useState<any>(null);
  const [capabilities, setCapabilities] = useState<OperationCapabilities | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const operationalStatus = useOperationalStatus();

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [sitesRes, jobsRes, versionRes, capsRes] = await Promise.all([
        sitesApi.list(),
        sitesApi.jobs(),
        sitesApi.versionStatus(),
        sitesApi.operationCapabilities()
      ]);
      setSites(sitesRes.data);
      setStats(sitesRes.meta?.stats ?? defaultStats);
      setJobs(jobsRes.data);
      setVersionStatus(versionRes.data);
      setCapabilities(capsRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בטעינת הדשבורד");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const activeSites = useMemo(() => sites.filter((site) => site.status !== "archived"), [sites]);
  const failedJobs = useMemo(() => jobs.filter((job) => job.status === "failed"), [jobs]);
  const activeJobs = useMemo(() => jobs.filter((job) => activeJobStatuses.has(job.status)), [jobs]);
  const failedHealthSites = useMemo(() => activeSites.filter((site) => site.status === "failed" || site.derivedHealthStatus === "failed"), [activeSites]);
  const warningHealthSites = useMemo(() => activeSites.filter((site) => site.status === "warning" || site.derivedHealthStatus === "warning"), [activeSites]);
  const backupFailureSites = useMemo(() => activeSites.filter((site) => site.backupStatus === "failed"), [activeSites]);
  const backupRiskSites = useMemo(() => activeSites.filter((site) => site.backupStatus === "failed" || !site.lastBackupAt), [activeSites]);
  const adminDriftSites = useMemo(() => activeSites.filter((site) =>
    site.adminSyncStatus === "failed" || site.adminSourceStatus?.some((source) => source.status === "failed" || source.ok === false)
  ), [activeSites]);

  const versionRows = useMemo(() => Array.isArray(versionStatus?.sites) ? versionStatus.sites : [], [versionStatus]);
  const outdatedCount = Number(versionStatus?.outdatedSites || versionRows.filter((row: any) => row.status === "outdated").length || 0);
  const outdatedSiteIds = useMemo(() => new Set(versionRows.filter((row: any) => row.status === "outdated").map((row: any) => row.siteId)), [versionRows]);
  const outdatedSites = useMemo(() => versionRows.filter((row: any) => row.status === "outdated").slice(0, 5), [versionRows]);
  const latestVersion = versionStatus?.latestVersion || "לא ידוע";
  const versionTotal = Math.max(Number(versionStatus?.totalSites || versionRows.length || stats.total || 0), outdatedCount);
  const versionAdoption = versionTotal ? ((versionTotal - outdatedCount) / versionTotal) * 100 : 0;

  const storageCounts = useMemo(() => ({
    txt: activeSites.filter((site) => site.storageBackend === "txt").length,
    mongo: activeSites.filter((site) => site.storageBackend === "mongo").length,
    unknown: activeSites.filter((site) => !site.storageBackend || site.storageBackend === "unknown").length,
    mongoDataOk: activeSites.filter((site) => site.storageBackend === "mongo" && site.dataBackendStatus === "ok").length,
    mongoSeedMissing: activeSites.filter((site) => site.storageBackend === "mongo" && site.mongoBackendStatus?.seedStatus && site.mongoBackendStatus.seedStatus !== "ok").length
  }), [activeSites]);

  const totalAdmins = useMemo(() => activeSites.reduce((sum, site) => sum + Number(site.adminsCount || 0), 0), [activeSites]);
  const totalBackups = useMemo(() => activeSites.reduce((sum, site) => sum + Number(site.backupCount || 0), 0), [activeSites]);
  const totalStorage = useMemo(() => activeSites.reduce((sum, site) => sum + Number(site.storageMb || 0), 0), [activeSites]);

  const browserMeta = browserSharePointCopy(operationalStatus.status.browserSharePoint.status);
  const builderMeta = builderBackendCopy(operationalStatus.status.builderBackend.status);
  const hubApiOk = operationalStatus.status.hubApi.status === "connected";
  const hubMongoOk = operationalStatus.status.hubMongo.status === "connected";
  const browserSharePointReady = operationalStatus.status.browserSharePoint.status === "connected";
  const sharePointCapabilityReady = Boolean(capabilities?.sharePoint.writeAvailable);
  const writePathReady = sharePointCapabilityReady || browserSharePointReady;

  const decisionQueue = useMemo<DecisionQueueItem[]>(() => {
    const items: DecisionQueueItem[] = [];

    if (!hubApiOk) {
      items.push({
        key: "hub-api",
        title: "Hub API לא זמין",
        description: "הדשבורד לא יכול להיחשב אמין עד שה־API חוזר לענות.",
        to: "/diagnostics",
        actionLabel: "פתח אבחון",
        severity: "critical",
        tone: "danger",
        icon: <ShieldAlert size={18} />,
        meta: operationalStatus.status.hubApi.message
      });
    }

    if (failedJobs.length) {
      items.push({
        key: "failed-jobs",
        title: `${formatNumber(failedJobs.length)} פעולות נכשלו`,
        description: "בדקו לוגים ו־Evidence לפני הרצה חוזרת, פריסה או שחזור.",
        to: "/jobs",
        actionLabel: "פתח תור פעולות",
        severity: "critical",
        tone: "danger",
        icon: <Workflow size={18} />,
        meta: failedJobs.slice(0, 2).map((job) => jobTypeLabel(job.type)).join(", ")
      });
    }

    if (failedHealthSites.length) {
      items.push({
        key: "failed-health",
        title: `${formatNumber(failedHealthSites.length)} אתרים במצב כשל`,
        description: "אתרים עם Health failed צריכים בדיקה לפני rollout, restore או שינוי הרשאות.",
        to: `/sites/${failedHealthSites[0]._id}`,
        actionLabel: "פתח אתר ראשון",
        severity: "critical",
        tone: "danger",
        icon: <HeartPulse size={18} />,
        meta: failedHealthSites.slice(0, 3).map((site) => site.siteCode).join(", ")
      });
    }

    if (!writePathReady) {
      items.push({
        key: "write-path",
        title: "כתיבה חיה לא מאומתת",
        description: "אפשר לקרוא ולתכנן, אבל לפני Execute צריך דפדפן SharePoint מחובר או יכולת כתיבה מאומתת.",
        to: "/diagnostics",
        actionLabel: "בדוק חיבור",
        severity: "high",
        tone: "warning",
        icon: <ShieldCheck size={18} />,
        meta: capabilities?.sharePoint.reason || browserMeta.detail
      });
    }

    if (backupFailureSites.length) {
      items.push({
        key: "backup-failures",
        title: `${formatNumber(backupFailureSites.length)} גיבויים נכשלו`,
        description: "בדקו Recovery לפני פעולת כתיבה רחבה או Rollback.",
        to: "/backups",
        actionLabel: "בדוק Recovery",
        severity: "high",
        tone: "warning",
        icon: <DatabaseBackup size={18} />,
        meta: backupFailureSites.slice(0, 3).map((site) => site.siteCode).join(", ")
      });
    }

    if (storageCounts.mongoSeedMissing) {
      items.push({
        key: "mongo-seed",
        title: `${formatNumber(storageCounts.mongoSeedMissing)} אתרי Mongo עם Seed חסר`,
        description: "Mongo-backed sites צריכים seed/runtime תקינים לפני בדיקות עומק וגיבויים.",
        to: "/health",
        actionLabel: "בדוק Mongo",
        severity: "high",
        tone: "warning",
        icon: <Database size={18} />,
        meta: "Mongo seed"
      });
    }

    if (outdatedCount) {
      items.push({
        key: "outdated",
        title: `${formatNumber(outdatedCount)} אתרים מאחורי latest`,
        description: "פתחו תוכנית פריסה, הריצו Dry-run, ובדקו blast-radius לפני Execute.",
        to: "/releases",
        actionLabel: "תכנן פריסה",
        severity: "medium",
        tone: "warning",
        icon: <Rocket size={18} />,
        meta: `Latest ${latestVersion}`
      });
    }

    if (warningHealthSites.length) {
      items.push({
        key: "warning-health",
        title: `${formatNumber(warningHealthSites.length)} אתרים באזהרה`,
        description: "לא בהכרח חסום, אבל כדאי לפתוח לפני rollout רחב.",
        to: `/sites/${warningHealthSites[0]._id}`,
        actionLabel: "בדוק אזהרות",
        severity: "medium",
        tone: "warning",
        icon: <AlertTriangle size={18} />,
        meta: warningHealthSites.slice(0, 3).map((site) => site.siteCode).join(", ")
      });
    }

    if (adminDriftSites.length) {
      items.push({
        key: "admin-drift",
        title: `${formatNumber(adminDriftSites.length)} אתרים עם פערי הרשאות`,
        description: "בדקו מקור אמת וראיות לפני שינוי admin חי.",
        to: "/admins",
        actionLabel: "פתח הרשאות",
        severity: "medium",
        tone: "info",
        icon: <Users size={18} />,
        meta: adminDriftSites.slice(0, 3).map((site) => site.siteCode).join(", ")
      });
    }

    if (!items.length) {
      items.push({
        key: "all-clear",
        title: "אין משימות דחופות",
        description: "אין כרגע פעולות דחופות. אפשר לבדוק אתרים, גרסאות או גיבויים.",
        to: "/sites",
        actionLabel: "פתח Registry",
        severity: "clear",
        tone: "success",
        icon: <CheckCircle2 size={18} />,
        meta: "Operationally clear"
      });
    }

    return items.sort((a, b) => severityWeight[b.severity] - severityWeight[a.severity]).slice(0, 5);
  }, [
    adminDriftSites,
    backupFailureSites,
    browserMeta.detail,
    capabilities?.sharePoint.reason,
    failedHealthSites,
    failedJobs,
    hubApiOk,
    latestVersion,
    operationalStatus.status.hubApi.message,
    outdatedCount,
    storageCounts.mongoSeedMissing,
    warningHealthSites,
    writePathReady
  ]);

  const dashboardSeverity = severityFromQueue(decisionQueue);
  const dashboardTone = statusToneFromSeverity(dashboardSeverity);
  const mainAction = decisionQueue[0];
  const attentionCount = decisionQueue.filter((item) => item.severity !== "clear").length;
  const unknownStorageCount = storageCounts.unknown;

  const heroTitle = dashboardSeverity === "critical"
    ? "דורש טיפול מיידי"
    : !writePathReady
      ? "פעולות כתיבה לא מאומתות"
      : dashboardSeverity === "high" || dashboardSeverity === "medium"
        ? "דורש תשומת לב"
        : "המערכת נראית יציבה";

  const heroSubtitle = dashboardSeverity === "clear"
    ? "אין כרגע כשל מרכזי, פער גרסה או גיבוי שנכשל. אפשר להמשיך לעקוב או לפתוח את Registry."
    : "הדף מסכם את מה שצריך לבדוק לפני פעולה רחבה: פריסה, שחזור, Bootstrap או שינוי הרשאות.";

  const fleetMetrics: FleetMetric[] = [
    {
      key: "txt",
      label: "TXT",
      value: formatNumber(storageCounts.txt),
      detail: "תוכן/קונפיג דרך קבצי SharePoint",
      tone: "info",
      icon: <HardDrive size={17} />,
      to: "/sites?storageBackend=txt"
    },
    {
      key: "mongo",
      label: "Mongo",
      value: formatNumber(storageCounts.mongo),
      detail: `${formatNumber(storageCounts.mongoDataOk)} עם data backend תקין`,
      tone: storageCounts.mongo && storageCounts.mongoDataOk < storageCounts.mongo ? "warning" : "success",
      icon: <Database size={17} />,
      to: "/sites?storageBackend=mongo"
    },
    {
      key: "unknown",
      label: "Unknown",
      value: formatNumber(storageCounts.unknown),
      detail: "דורש השלמת מקור נתונים",
      tone: storageCounts.unknown ? "warning" : "neutral",
      icon: <AlertTriangle size={17} />,
      to: "/sites?storageBackend=unknown"
    },
    {
      key: "seed",
      label: "Mongo seed חסר",
      value: formatNumber(storageCounts.mongoSeedMissing),
      detail: "Seed/runtime data לא תקינים",
      tone: storageCounts.mongoSeedMissing ? "warning" : "success",
      icon: <ShieldAlert size={17} />,
      to: "/sites?storageBackend=mongo"
    }
  ];

  const healthRows = [
    { key: "healthy", label: "תקין", value: stats.health.healthy, color: "var(--success)" },
    { key: "warning", label: "אזהרה", value: stats.health.warning, color: "var(--warning)" },
    { key: "failed", label: "נכשל", value: stats.health.failed, color: "var(--danger)" },
    { key: "unknown", label: "לא נבדק", value: stats.health.unknown, color: "var(--text-subtle)" }
  ];

  const watchlist = useMemo(() => activeSites
    .map((site) => {
      const issues: Array<{ label: string; tone: DashboardTone; weight: number }> = [];
      if (site.status === "failed" || site.derivedHealthStatus === "failed") issues.push({ label: "Health failed", tone: "danger", weight: 8 });
      if (site.status === "warning" || site.derivedHealthStatus === "warning") issues.push({ label: "Health warning", tone: "warning", weight: 5 });
      if (site.backupStatus === "failed") issues.push({ label: "Backup failed", tone: "warning", weight: 6 });
      if (!site.lastBackupAt) issues.push({ label: "No backup evidence", tone: "warning", weight: 3 });
      if (outdatedSiteIds.has(site._id)) issues.push({ label: "Outdated version", tone: "warning", weight: 4 });
      if (site.storageBackend === "mongo" && site.mongoBackendStatus?.seedStatus && site.mongoBackendStatus.seedStatus !== "ok") issues.push({ label: "Mongo seed", tone: "warning", weight: 5 });
      if (site.adminSyncStatus === "failed" || site.adminSourceStatus?.some((source) => source.status === "failed" || source.ok === false)) issues.push({ label: "Admin source", tone: "info", weight: 2 });
      const topIssue = issues.sort((a, b) => b.weight - a.weight)[0];
      return topIssue ? { site, issue: topIssue, score: issues.reduce((sum, issue) => sum + issue.weight, 0) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (b?.score || 0) - (a?.score || 0))
    .slice(0, 5) as Array<{ site: Site; issue: { label: string; tone: DashboardTone }; score: number }>, [activeSites, outdatedSiteIds]);

  const recentActivity = useMemo(() => {
    const siteRows = sites.flatMap((site) => [
      { label: `עודכנה רשומת אתר: ${site.displayName}`, at: site.updatedAt, type: "site" },
      site.lastHealthCheckAt ? { label: `בדיקת תקינות: ${site.displayName}`, at: site.lastHealthCheckAt, type: "health" } : null,
      site.lastBackupAt ? { label: `גיבוי אחרון: ${site.displayName}`, at: site.lastBackupAt, type: "backup" } : null,
      site.lastDeployAt ? { label: `פריסה אחרונה: ${site.displayName}`, at: site.lastDeployAt, type: "deploy" } : null
    ]).filter(Boolean) as Array<{ label: string; at: string; type: string }>;
    const jobRows = jobs.slice(0, 10).map((job) => ({ label: `${jobTypeLabel(job.type)}: ${jobStatusLabel(job.status)}`, at: job.finishedAt || job.startedAt || job.createdAt, type: "job" }));
    return [...siteRows, ...jobRows].sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, 7);
  }, [jobs, sites]);

  const modulePreviews: DashboardModulePreview[] = [
    {
      key: "releases",
      title: "גרסאות ופריסה",
      description: "Latest, adoption ו־Dry-run לפני Execute",
      to: "/releases",
      primary: latestVersion,
      secondary: `${formatNumber(outdatedCount)} אתרים מאחור`,
      tone: outdatedCount ? "warning" : "success",
      icon: <GitBranch size={18} />
    },
    {
      key: "backups",
      title: "גיבוי ושחזור",
      description: "Recovery readiness וראיות גיבוי",
      to: "/backups",
      primary: formatNumber(backupRiskSites.length),
      secondary: `${formatNumber(totalBackups)} גיבויים רשומים`,
      tone: backupRiskSites.length ? "warning" : "success",
      icon: <DatabaseBackup size={18} />
    },
    {
      key: "admins",
      title: "הרשאות וגישה",
      description: "משתמשים, מקורות הרשאה ופערים",
      to: "/admins",
      primary: formatNumber(adminDriftSites.length),
      secondary: `${formatNumber(totalAdmins)} admins רשומים`,
      tone: adminDriftSites.length ? "warning" : "success",
      icon: <Users size={18} />
    },
    {
      key: "jobs",
      title: "תור פעולות",
      description: "מה רץ, מה נכשל ומה ממתין לדפדפן",
      to: "/jobs",
      primary: formatNumber(activeJobs.length),
      secondary: `${formatNumber(failedJobs.length)} נכשלו`,
      tone: failedJobs.length ? "danger" : activeJobs.length ? "info" : "success",
      icon: <Workflow size={18} />
    },
    {
      key: "monitoring",
      title: "התראות",
      description: "תור אירועים ותיעדוף טיפול",
      to: "/monitoring",
      primary: formatNumber(attentionCount),
      secondary: attentionCount ? "דורש triage" : "אין עומס דחוף",
      tone: attentionCount ? "warning" : "success",
      icon: <BellRing size={18} />
    },
    {
      key: "audit",
      title: "בקרה ו־Audit",
      description: "קבלות פעולה ומי עשה מה",
      to: "/audit",
      primary: formatNumber(recentActivity.length),
      secondary: "פעולות אחרונות במסך",
      tone: "neutral",
      icon: <FileClock size={18} />
    },
    {
      key: "diagnostics",
      title: "אבחון חיבורים",
      description: "Browser SharePoint, API, Mongo ו־Builder",
      to: "/diagnostics",
      primary: browserMeta.label,
      secondary: builderMeta.label,
      tone: browserMeta.tone === "danger" || builderMeta.tone === "danger" ? "danger" : browserMeta.tone === "warning" || builderMeta.tone === "warning" ? "warning" : "info",
      icon: <Cable size={18} />
    },
    {
      key: "analytics",
      title: "תובנות",
      description: "חתכים לפי סביבה, גרסה, גיבוי ואחסון",
      to: "/analytics",
      primary: formatMb(Math.round(totalStorage)),
      secondary: `${formatNumber(stats.total)} רשומות לניתוח`,
      tone: "info",
      icon: <BarChart3 size={18} />
    }
  ];

  if (loading) return <LoadingState label="טוען דשבורד..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="dashboard-command-center">
      <PageHeader
        title="מרכז פיקוד"
        subtitle="תמונת מצב תפעולית: מה דורש טיפול, מה בטוח לעשות עכשיו, ולאן ממשיכים."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link className="btn btn-secondary" to="/releases"><Rocket size={16} />תכנן פריסה</Link>
            <Link className="btn btn-secondary" to="/diagnostics"><Cable size={16} />בדוק חיבורים</Link>
          </div>
        }
        helpKey="dashboard.page"
      />

      <section className={`dashboard-hero dashboard-severity-${dashboardSeverity}`}>
        <div className="dashboard-hero-main">
          <div className="dashboard-hero-kicker">
            <span className={`dashboard-severity-pill ${dashboardToneClass[dashboardTone]}`}>{severityLabel[dashboardSeverity]}</span>
            <span className="num subtle">עודכן: {formatDateTime(operationalStatus.status.generatedAt)}</span>
          </div>
          <h2>{heroTitle}</h2>
          <p>{heroSubtitle}</p>
          <div className="dashboard-hero-summary" aria-label="סיכום פיקוד מרכזי">
            <span>
              <b className="num">{formatNumber(attentionCount)}</b>
              <small>דברים דורשים טיפול</small>
            </span>
            <span>
              <b className="num">{formatNumber(stats.active)}</b>
              <small>אתרים פעילים</small>
            </span>
            <span>
              <b className="num">{formatNumber(unknownStorageCount)}</b>
              <small>לא מזוהים / דורשים בדיקה</small>
            </span>
            <span>
              <b className="num">{latestVersion}</b>
              <small>{outdatedCount ? `${formatNumber(outdatedCount)} מאחורי latest` : "latest מיושר"}</small>
            </span>
          </div>
          <div className="dashboard-hero-actions">
            <Link className="btn btn-primary" to={mainAction.to}>{mainAction.icon}{mainAction.actionLabel}</Link>
            <Link className="btn btn-secondary" to="/sites"><FolderKanban size={16} />אתרים מנוהלים</Link>
          </div>
        </div>

        <div className="dashboard-status-grid" aria-label="סטטוס מערכות מרכזי">
          {[
            {
              key: "api",
              label: hubApiOk ? "Hub API מחובר" : "Hub API נכשל",
              detail: operationalStatus.status.hubApi.message,
              tone: hubApiOk ? "success" as const : "danger" as const,
              icon: <Activity size={17} />
            },
            {
              key: "mongo",
              label: hubMongoOk ? "Hub Mongo מחובר" : "Hub Mongo לא תקין",
              detail: operationalStatus.status.hubMongo.message,
              tone: hubMongoOk ? "success" as const : "warning" as const,
              icon: <Database size={17} />
            },
            {
              key: "browser",
              label: browserMeta.label,
              detail: browserMeta.detail,
              tone: browserMeta.tone,
              icon: <Cable size={17} />
            },
            {
              key: "builder",
              label: builderMeta.label,
              detail: builderMeta.detail,
              tone: builderMeta.tone,
              icon: <Workflow size={17} />
            }
          ].map((item) => (
            <Link key={item.key} className={`dashboard-status-card ${dashboardToneClass[item.tone]}`} to={item.key === "builder" ? "/settings" : "/diagnostics"}>
              <span className="dashboard-status-icon" aria-hidden="true">{item.icon}</span>
              <span className="dashboard-status-copy">
                <strong>{item.label}</strong>
                <small>{item.detail}</small>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="dashboard-kpi-strip" aria-label="מדדי פיקוד מרכזיים">
          {[
            { label: "אתרים מנוהלים", value: formatNumber(stats.total), detail: `${formatNumber(stats.active)} פעילים · ${formatNumber(stats.archived)} בארכיון`, tone: "info" as const, icon: <FolderKanban size={18} /> },
            { label: "דורשים טיפול", value: formatNumber(attentionCount), detail: "סעיפים בתור ההחלטות", tone: attentionCount ? "warning" as const : "success" as const, icon: <AlertTriangle size={18} /> },
            { label: "גרסאות מיושנות", value: formatNumber(outdatedCount), detail: `Latest ${latestVersion}`, tone: outdatedCount ? "warning" as const : "success" as const, icon: <GitBranch size={18} /> },
            { label: "סיכון גיבוי", value: formatNumber(backupRiskSites.length), detail: `${formatNumber(backupFailureSites.length)} נכשלו · ${formatNumber(activeJobs.length)} Jobs פעילים`, tone: backupRiskSites.length || failedJobs.length ? "warning" as const : "success" as const, icon: <DatabaseBackup size={18} /> }
        ].map((item) => (
          <div key={item.label} className={`dashboard-kpi ${dashboardToneClass[item.tone]}`}>
            <span className="dashboard-kpi-icon" aria-hidden="true">{item.icon}</span>
            <span className="field-label">{item.label}</span>
            <strong className="num">{item.value}</strong>
            <small>{item.detail}</small>
          </div>
        ))}
      </section>

      <div className="dashboard-primary-grid">
        <section className="dashboard-panel dashboard-decision-panel">
          <div className="dashboard-panel-header">
            <div>
              <p className="dashboard-eyebrow">Attention Queue</p>
              <h2>דורש טיפול עכשיו</h2>
              <p>3-5 פריטים מדורגים לפי חומרה, עם הסיבה והפעולה הבאה.</p>
            </div>
            <StatusToken kind={writePathReady ? "writeEnabled" : "blocked"} label={writePathReady ? "כתיבה זמינה" : "כתיבה חסומה"} helpKey={writePathReady ? "sharepoint.write" : "sharepoint.writeBlocked"} />
          </div>

          <div className="dashboard-decision-list">
            {decisionQueue.map((item) => (
              <Link key={item.key} className={`dashboard-decision-item ${dashboardToneClass[item.tone]}`} to={item.to}>
                <span className="dashboard-decision-icon" aria-hidden="true">{item.icon}</span>
                <span className="dashboard-decision-copy">
                  <span className="dashboard-decision-meta">
                    <span>{severityLabel[item.severity]}</span>
                    {item.meta ? <span className="num">{item.meta}</span> : null}
                  </span>
                  <strong>{item.title}</strong>
                  <small>{item.description}</small>
                </span>
                <span className="dashboard-link-label">{item.actionLabel}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="dashboard-panel">
          <div className="dashboard-panel-header">
            <div>
              <p className="dashboard-eyebrow">Fleet Snapshot</p>
              <h2>תמונת האתרים</h2>
              <p>Storage backends, Health ו־Version adoption במקום רעש טכני.</p>
            </div>
            <Link className="btn btn-secondary" to="/analytics"><BarChart3 size={16} />פתח תובנות</Link>
          </div>

          {/* Storage backends: TXT / Mongo fleet summary for static coverage. */}
          <div className="dashboard-fleet-metrics">
            {fleetMetrics.map((metric) => (
              <Link key={metric.key} className={`dashboard-fleet-metric ${dashboardToneClass[metric.tone]}`} to={metric.to}>
                <span className="dashboard-fleet-icon" aria-hidden="true">{metric.icon}</span>
                <span>
                  <small>{metric.label}</small>
                  <strong className="num">{metric.value}</strong>
                  <em>{metric.detail}</em>
                </span>
              </Link>
            ))}
          </div>

          <div className="dashboard-chart-grid">
            <div className="dashboard-mini-chart">
              <div className="dashboard-mini-chart-header">
                <strong>Health distribution</strong>
                <span className="num muted">{formatNumber(stats.total)} אתרים</span>
              </div>
              <div className="dashboard-stacked-bar" aria-hidden="true">
                {healthRows.map((row) => (
                  <span key={row.key} style={{ width: `${pct(row.value, Math.max(stats.total, 1))}%`, background: row.color }} />
                ))}
              </div>
              <div className="dashboard-chart-legend">
                {healthRows.map((row) => (
                  <span key={row.key}>
                    <i style={{ background: row.color }} />
                    {row.label}
                    <b className="num">{formatNumber(row.value)}</b>
                  </span>
                ))}
              </div>
            </div>

            <div className="dashboard-mini-chart">
              <div className="dashboard-mini-chart-header">
                <strong>Version adoption</strong>
                <span className="num muted">{formatPercent(versionAdoption)}</span>
              </div>
              <div className="dashboard-version-meter">
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${Math.max(4, versionAdoption)}%`, background: outdatedCount ? "var(--warning)" : "var(--success)" }} />
                </div>
                <div className="dashboard-version-meter-copy">
                  <span>Latest {latestVersion}</span>
                  <span>{formatNumber(outdatedCount)} מיושנים</span>
                </div>
              </div>
              {outdatedSites.length ? (
                <div className="dashboard-outdated-list">
                  {outdatedSites.map((row: any) => (
                    <Link key={row.siteId} to={`/sites/${row.siteId}`}>
                      <span>{row.displayName}</span>
                      <small className="num">{row.currentVersion || "-"} → {row.latestVersion || latestVersion}</small>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="dashboard-quiet-copy">אין אתרים מיושנים לפי הרשומות האחרונות.</p>
              )}
            </div>
          </div>

          <div className="dashboard-watchlist">
            <div className="dashboard-watchlist-header">
              <strong>Watchlist</strong>
              <span className="muted">אתרים שכדאי לפתוח קודם</span>
            </div>
            {watchlist.length ? (
              <div className="dashboard-watchlist-list">
                {watchlist.map(({ site, issue }) => (
                  <Link key={site._id} className="dashboard-watchlist-row" to={`/sites/${site._id}`}>
                    <span>
                      <strong>{site.displayName}</strong>
                      <small className="num">{site.siteCode}</small>
                    </span>
                    <span className={`dashboard-mini-pill ${dashboardToneClass[issue.tone]}`}>{issue.label}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState title="אין Watchlist פתוח" description="לא נמצאו אתרים עם כשל, פער גרסה, גיבוי חסר או פער הרשאות." />
            )}
          </div>
        </section>
      </div>

      <section className="dashboard-panel">
        <div className="dashboard-panel-header">
          <div>
            <p className="dashboard-eyebrow">Module previews</p>
            <h2>כניסה מהירה לשאר המערכת</h2>
            <p>קצת מכל אזור, בלי להפוך את הדף הראשי למסך עבודה עמוק.</p>
          </div>
        </div>
        <div className="dashboard-module-grid">
          {modulePreviews.map((module) => (
            <Link key={module.key} className={`dashboard-module-card ${dashboardToneClass[module.tone]}`} to={module.to}>
              <span className="dashboard-module-icon" aria-hidden="true">{module.icon}</span>
              <span className="dashboard-module-copy">
                <strong>{module.title}</strong>
                <small>{module.description}</small>
              </span>
              <span className="dashboard-module-metric">
                <b className="num">{module.primary}</b>
                <small>{module.secondary}</small>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="dashboard-secondary-grid">
        <div className="dashboard-panel">
          <div className="dashboard-panel-header">
            <div>
              <p className="dashboard-eyebrow">Recent activity</p>
              <h2>פעילות אחרונה</h2>
              <p>Timeline שקט של פעולות ועדכונים אחרונים.</p>
            </div>
            <Link className="btn btn-secondary" to="/audit"><FileClock size={16} />יומן מלא</Link>
          </div>
          {recentActivity.length === 0 ? <EmptyState title="אין פעילות להצגה" description="פעולות אחרונות יופיעו כאן אחרי עדכונים או Jobs." /> : (
            <div className="dashboard-activity-list">
              {recentActivity.map((row, index) => (
                <div key={`${row.label}-${index}`} className="dashboard-activity-row">
                  <span className="dashboard-activity-dot" aria-hidden="true" />
                  <span>{row.label}</span>
                  <time className="num">{formatDateTime(row.at)}</time>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="dashboard-panel dashboard-boundary-panel">
          <div className="dashboard-panel-header">
            <div>
              <p className="dashboard-eyebrow">Reliability boundaries</p>
              <h2>מה המסך אומר</h2>
              <p>סיכום, לא Evidence טכני. לפרטים נכנסים לדפים הייעודיים.</p>
            </div>
          </div>
          <div className="dashboard-boundary-list">
            <StatusToken kind="metadata" label="Hub metadata: Registry, Releases, Jobs ו־Audit נשמרים ב־Mongo" helpKey="site.mongodb" />
            <StatusToken kind="cached" label="Last checked evidence: Health, inventory ו־plans הם ראיות אחרונות" helpKey="history" />
            <StatusToken kind="readonly" label="Browser SharePoint read: בדיקות ללא שינוי עד Execute" helpKey="mode.readOnly" />
            <StatusToken kind={builderMeta.tone === "success" ? "live" : builderMeta.tone === "danger" ? "blocked" : "warning"} label={`Mongo backend status: ${builderMeta.label}`} helpKey="create.backendApiUrl" />
            <StatusToken kind="neutral" label="Unknown/not checked מוצג כלא נבדק, לא כאמת חיה" helpKey="health" />
            <StatusToken kind={writePathReady ? "writeEnabled" : "blocked"} label={writePathReady ? "כתיבה זמינה" : "כתיבה חסומה"} helpKey={writePathReady ? "sharepoint.write" : "sharepoint.writeBlocked"} />
          </div>
        </div>
      </section>
    </div>
  );
}
