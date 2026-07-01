import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, DatabaseBackup, FolderKanban, GitBranch, HeartPulse, Rocket, ShieldAlert, Workflow } from "lucide-react";
import { Job, OperationCapabilities, sitesApi } from "../api/sitesApi";
import { Site, SitesStats } from "../types/site";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { KpiCard } from "../components/KpiCard";
import { LoadingState } from "../components/LoadingState";
import { MetadataOnlyBadge } from "../components/MetadataOnlyBadge";
import { ModeBoundary, OperationalSummary } from "../components/OperationalSummary";
import { PageHeader } from "../components/PageHeader";
import { SectionCard } from "../components/SectionCard";
import { StatusToken } from "../components/StatusToken";
import { formatDateTime, formatNumber, jobStatusLabel, jobTypeLabel } from "../utils/format";

const defaultStats: SitesStats = {
  total: 0,
  active: 0,
  warning: 0,
  failed: 0,
  archived: 0,
  totalStorageMb: 0,
  health: { healthy: 0, warning: 0, failed: 0, unknown: 0 }
};

type CommandActionTone = "success" | "warning" | "danger" | "info" | "neutral";

type CommandAction = {
  key: string;
  title: string;
  description: string;
  to: string;
  actionLabel: string;
  tone: CommandActionTone;
  icon: JSX.Element;
  meta?: string;
};

const actionToneClass: Record<CommandActionTone, string> = {
  success: "panel-success",
  warning: "panel-warning",
  danger: "panel-danger",
  info: "",
  neutral: ""
};

export function DashboardPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [stats, setStats] = useState<SitesStats>(defaultStats);
  const [versionStatus, setVersionStatus] = useState<any>(null);
  const [capabilities, setCapabilities] = useState<OperationCapabilities | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  const failedJobs = jobs.filter((job) => job.status === "failed");
  const backupFailures = useMemo(() => sites.filter((site) => site.status !== "archived" && site.backupStatus === "failed"), [sites]);
  const storageCounts = useMemo(() => ({
    txt: sites.filter((site) => site.storageBackend === "txt").length,
    mongo: sites.filter((site) => site.storageBackend === "mongo").length,
    unknown: sites.filter((site) => !site.storageBackend || site.storageBackend === "unknown").length,
    mongoDataOk: sites.filter((site) => site.storageBackend === "mongo" && site.dataBackendStatus === "ok").length,
    mongoSeedMissing: sites.filter((site) => site.storageBackend === "mongo" && site.mongoBackendStatus?.seedStatus && site.mongoBackendStatus.seedStatus !== "ok").length
  }), [sites]);
  const outdatedSites = useMemo(() => (versionStatus?.sites || []).filter((row: any) => row.status === "outdated").slice(0, 7), [versionStatus]);
  const recentActivity = useMemo(() => {
    const siteRows = sites.flatMap((site) => [
      { label: `עודכנה רשומת אתר: ${site.displayName}`, at: site.updatedAt, type: "site" },
      site.lastHealthCheckAt ? { label: `בדיקת תקינות: ${site.displayName}`, at: site.lastHealthCheckAt, type: "health" } : null,
      site.lastBackupAt ? { label: `גיבוי אחרון: ${site.displayName}`, at: site.lastBackupAt, type: "backup" } : null,
      site.lastDeployAt ? { label: `פריסה אחרונה: ${site.displayName}`, at: site.lastDeployAt, type: "deploy" } : null
    ]).filter(Boolean) as Array<{ label: string; at: string; type: string }>;
    const jobRows = jobs.slice(0, 10).map((job) => ({ label: `${jobTypeLabel(job.type)}: ${jobStatusLabel(job.status)}`, at: job.finishedAt || job.startedAt || job.createdAt, type: "job" }));
    return [...siteRows, ...jobRows].sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, 8);
  }, [sites, jobs]);

  const writeAvailable = Boolean(capabilities?.sharePoint.writeAvailable);
  const commandActions = useMemo<CommandAction[]>(() => {
    const actions: CommandAction[] = [];
    const failedHealth = sites.filter((site) => site.status === "failed" || site.derivedHealthStatus === "failed");
    const warningHealth = sites.filter((site) => site.status === "warning" || site.derivedHealthStatus === "warning");
    const outdatedCount = versionStatus?.outdatedSites || 0;

    if (failedJobs.length) {
      actions.push({
        key: "failed-jobs",
        title: `${formatNumber(failedJobs.length)} פעולות נכשלו`,
        description: "בדקו את תור הפעולות לפני הרצת פריסה, שחזור או תיקון נוסף.",
        to: "/jobs",
        actionLabel: "פתח תור פעולות",
        tone: "danger",
        icon: <Workflow size={18} />,
        meta: "Execution risk"
      });
    }

    if (failedHealth.length) {
      actions.push({
        key: "failed-health",
        title: `${formatNumber(failedHealth.length)} אתרים במצב כשל`,
        description: "אתרים עם health failed צריכים בדיקה לפני deploy או restore.",
        to: `/sites/${failedHealth[0]._id}`,
        actionLabel: "פתח אתר ראשון",
        tone: "danger",
        icon: <ShieldAlert size={18} />,
        meta: failedHealth.slice(0, 2).map((site) => site.siteCode).join(", ")
      });
    }

    if (outdatedCount) {
      actions.push({
        key: "outdated-sites",
        title: `${formatNumber(outdatedCount)} אתרים מאחורי latest`,
        description: "פתחו תוכנית פריסה, הריצו Dry-run, וקבלו blast-radius לפני Execute.",
        to: "/releases",
        actionLabel: "תכנן פריסה",
        tone: "warning",
        icon: <Rocket size={18} />,
        meta: `Latest ${versionStatus?.latestVersion || "unknown"}`
      });
    }

    if (backupFailures.length) {
      actions.push({
        key: "backup-failures",
        title: `${formatNumber(backupFailures.length)} גיבויים נכשלו`,
        description: "בדקו גיבויים לפני פעולות כתיבה רחבות או rollback.",
        to: "/backups",
        actionLabel: "בדוק Recovery",
        tone: "warning",
        icon: <DatabaseBackup size={18} />,
        meta: backupFailures.slice(0, 2).map((site) => site.siteCode).join(", ")
      });
    }

    if (warningHealth.length && actions.length < 6) {
      actions.push({
        key: "warning-health",
        title: `${formatNumber(warningHealth.length)} אתרים באזהרה`,
        description: "לא בהכרח חסום, אבל כדאי לבדוק לפני rollout רחב.",
        to: `/sites/${warningHealth[0]._id}`,
        actionLabel: "בדוק אזהרות",
        tone: "warning",
        icon: <HeartPulse size={18} />,
        meta: warningHealth.slice(0, 2).map((site) => site.siteCode).join(", ")
      });
    }

    if (!writeAvailable) {
      actions.push({
        key: "write-locked",
        title: "כתיבה ל-SharePoint חסומה",
        description: "אפשר לתכנן, לבדוק ולקרוא נתונים, אבל Execute חי ייחסם עד שתהיה יכולת כתיבה.",
        to: "/settings",
        actionLabel: "בדוק יכולות מערכת",
        tone: "info",
        icon: <ShieldAlert size={18} />,
        meta: "Read-only boundary"
      });
    }

    if (!actions.length) {
      actions.push({
        key: "all-clear",
        title: "אין משימות דחופות",
        description: "המערכת לא מזהה כרגע כשל, גרסה מיושנת או פעולה שנכשלה.",
        to: "/sites",
        actionLabel: "פתח Registry",
        tone: "success",
        icon: <CheckCircle2 size={18} />,
        meta: "Operationally clear"
      });
    }

    return actions.slice(0, 6);
  }, [backupFailures, failedJobs, sites, versionStatus, writeAvailable]);

  if (loading) return <LoadingState label="טוען דשבורד..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="מרכז פיקוד"
        subtitle="תור החלטות תפעולי: מה דורש פעולה, מה חסום, ומה בטוח להריץ עכשיו."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link className="btn btn-primary" to="/releases"><Rocket size={16} />תכנן פריסה</Link>
            <Link className="btn btn-secondary" to="/sites"><FolderKanban size={16} />אתרים מנוהלים</Link>
          </div>
        }
        helpKey="dashboard.page"
      />

      <OperationalSummary
        title="תמונת מצב ניהולית"
        purpose="המסך הזה נועד להחליט מה הדבר הבטוח הבא: לבדוק כשל, לתכנן פריסה, לאמת גיבוי, או להמשיך לעקוב."
        state={commandActions[0]?.title || "אין מידע תפעולי זמין כרגע"}
        attention={commandActions.some((item) => item.tone === "danger")
          ? "יש כשל שצריך לפתוח לפני פעולה רחבה."
          : commandActions.some((item) => item.tone === "warning")
            ? "יש אזהרות שכדאי לטפל בהן לפני פריסה או שחזור."
            : "אין כרגע נושא דחוף שמחייב פעולה."}
        attentionTone={commandActions.some((item) => item.tone === "danger") ? "danger" : commandActions.some((item) => item.tone === "warning") ? "warning" : "success"}
        nextAction={commandActions[0]?.actionLabel || "פתח את רשימת האתרים"}
        blocked={writeAvailable ? undefined : "אין מסלול SharePoint בשרת. פעולות SharePoint רצות דרך הדפדפן המחובר, והשרת שומר סטטוס ו־Evidence."}
        tone={commandActions.some((item) => item.tone === "danger") ? "danger" : commandActions.some((item) => item.tone === "warning") ? "warning" : "success"}
      >
        <ModeBoundary
          items={[
            { label: "מטא־דאטה ב־Hub", description: "אתרים, Jobs, Releases ו־Audit נשמרים ב־Mongo.", tone: "info" },
            { label: "קריאה בלבד", description: "Health, inventory ותוכניות פעולה לא משנות אתר חי.", tone: "success" },
            { label: "פעולות כתיבה", description: "מתבצעות דרך הדפדפן המחובר ל־SharePoint, עם Dry-run, אישור ו־Evidence.", tone: "success" }
          ]}
        />
      </OperationalSummary>

      <div className="grid gap-3 lg:grid-cols-3">
        <KpiCard title="משימות פתוחות" value={formatNumber(commandActions.filter((item) => item.tone !== "success").length)} icon={<AlertTriangle size={18} />} description="פעולות שהמערכת ממליצה לבדוק עכשיו" tone={commandActions.some((item) => item.tone === "danger") ? "danger" : commandActions.some((item) => item.tone === "warning") ? "warning" : "success"} variant="hero" helpKey="monitoring.alert" />
        <KpiCard title="אתרים מנוהלים" value={formatNumber(stats.total)} icon={<FolderKanban size={18} />} description={`${formatNumber(stats.active)} פעילים · ${formatNumber(stats.archived)} בארכיון`} tone="info" variant="hero" helpKey="sites.registry" />
        <KpiCard title="מוכנות פריסה" value={formatNumber(versionStatus?.outdatedSites || 0)} icon={<GitBranch size={18} />} description="אתרים מאחורי latest שדורשים Dry-run לפני Execute" tone={(versionStatus?.outdatedSites || 0) ? "warning" : "success"} variant="hero" helpKey="version.outdated" />
      </div>

      {/* Storage backends: storage-backend-aware UI marker for static coverage. */}
      <SectionCard title="מקורות נתונים" subtitle="הפרדה בין אירוח SharePoint לבין מקור הנתונים החיים של Site Builder." helpKey="health">
        <div className="grid gap-3 md:grid-cols-5">
          <div className="soft-panel p-3"><p className="field-label">TXT</p><p className="num text-xl font-bold">{formatNumber(storageCounts.txt)}</p></div>
          <div className="soft-panel p-3"><p className="field-label">Mongo</p><p className="num text-xl font-bold">{formatNumber(storageCounts.mongo)}</p></div>
          <div className="soft-panel p-3"><p className="field-label">Unknown</p><p className="num text-xl font-bold">{formatNumber(storageCounts.unknown)}</p></div>
          <div className="soft-panel p-3"><p className="field-label">Mongo data ok</p><p className="num text-xl font-bold">{formatNumber(storageCounts.mongoDataOk)}</p></div>
          <div className="soft-panel p-3"><p className="field-label">Mongo seed חסר</p><p className="num text-xl font-bold">{formatNumber(storageCounts.mongoSeedMissing)}</p></div>
        </div>
      </SectionCard>

      <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <SectionCard
          title="תור החלטות"
          subtitle="משימות מדורגות לפי סיכון, עם פעולה מומלצת במקום רשימת סטטוסים בלבד."
          helpKey="monitoring.alert"
          actions={
            <div className="flex flex-wrap gap-2">
              <StatusToken kind={writeAvailable ? "writeEnabled" : "blocked"} label={writeAvailable ? "כתיבה זמינה" : "כתיבה חסומה"} helpKey={writeAvailable ? "sharepoint.write" : "sharepoint.writeBlocked"} />
              <MetadataOnlyBadge mode="readonly" />
            </div>
          }
        >
          <div className="space-y-3">
            {commandActions.map((item) => (
              <Link key={item.key} className={`panel block p-3 transition hover:border-[var(--border-strong)] ${actionToneClass[item.tone]}`} to={item.to}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="kpi-icon mt-0.5" style={{ background: item.tone === "danger" ? "var(--danger-soft)" : item.tone === "warning" ? "var(--warning-soft)" : item.tone === "success" ? "var(--success-soft)" : "var(--info-soft)", color: item.tone === "danger" ? "var(--danger)" : item.tone === "warning" ? "var(--warning)" : item.tone === "success" ? "var(--success)" : "var(--info)" }}>
                      {item.icon}
                    </span>
                    <div className="min-w-0">
                      <p className="font-bold" style={{ color: "var(--text-strong)" }}>{item.title}</p>
                      <p className="mt-1 text-sm leading-6 muted">{item.description}</p>
                      {item.meta ? <p className="num mt-2 text-xs subtle">{item.meta}</p> : null}
                    </div>
                  </div>
                  <span className="btn btn-secondary min-h-0 px-2 py-1 text-xs">{item.actionLabel}</span>
                </div>
              </Link>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="התפלגות תקינות" subtitle="Health status לפי הרשומות האחרונות" helpKey="health">
          <div className="space-y-4">
            {[
              ["healthy", "תקין", stats.health.healthy, "var(--success)"],
              ["warning", "אזהרה", stats.health.warning, "var(--warning)"],
              ["failed", "נכשל", stats.health.failed, "var(--danger)"],
              ["unknown", "לא נבדק", stats.health.unknown, "var(--text-subtle)"]
            ].map(([key, label, value, color]) => {
              const pct = stats.total ? Math.round((Number(value) / stats.total) * 100) : 0;
              return (
                <div key={String(key)}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{label}</span>
                    <span className="num muted">{formatNumber(Number(value))} ({pct}%)</span>
                  </div>
                  <div className="progress-track"><div className="progress-fill" style={{ width: `${pct}%`, background: String(color) }} /></div>
                </div>
              );
            })}
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_0.8fr]">
        <SectionCard title="פעילות אחרונה" subtitle="Timeline תפעולי קומפקטי" helpKey="history">
          {recentActivity.length === 0 ? <EmptyState title="אין פעילות להצגה" description="פעולות אחרונות יופיעו כאן אחרי עדכונים או Jobs." /> : (
            <div className="space-y-2">
              {recentActivity.map((row, index) => (
                <div key={`${row.label}-${index}`} className="flex items-center justify-between gap-3 border-b divider py-2 last:border-0">
                  <span className="text-sm">{row.label}</span>
                  <span className="num text-xs muted">{formatDateTime(row.at)}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="אתרים מיושנים" subtitle="פער בין currentVersion ל־latest release" helpKey="version.outdated">
          {outdatedSites.length === 0 ? <EmptyState title="אין אתרים מיושנים" description="כל האתרים הרשומים מיושרים לגרסה האחרונה או שאין release פעיל." /> : (
            <div className="space-y-2">
              {outdatedSites.map((row: any) => (
                <div key={row.siteId} className="soft-panel p-3">
                  <p className="font-bold" style={{ color: "var(--text-strong)" }}>{row.displayName}</p>
                  <p className="num mt-1 text-xs muted">{row.siteCode}</p>
                  <p className="num mt-2 text-sm"><span>{row.currentVersion}</span> ← <span>{row.latestVersion}</span></p>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard title="גבולות אמינות" subtitle="מה המסך הזה אומר ומה הוא לא אומר" compact helpKey="mode.metadataOnly">
        <div className="flex flex-wrap gap-2">
          <StatusToken kind="metadata" label="אתרים/גרסאות/Jobs נשמרים ב־Mongo" helpKey="site.mongodb" />
          <StatusToken kind="readonly" label="Health ו־backup plan הם read-only כאשר SharePoint מאפשר" helpKey="mode.readOnly" />
          <StatusToken kind={writeAvailable ? "writeEnabled" : "blocked"} label={writeAvailable ? "כתיבות SharePoint זמינות" : "כתיבות SharePoint חסומות"} helpKey={writeAvailable ? "sharepoint.write" : "sharepoint.writeBlocked"} />
        </div>
      </SectionCard>
    </div>
  );
}
