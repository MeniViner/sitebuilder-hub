import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Clock3, Database, FolderKanban, GitBranch, ListChecks, ShieldAlert, Workflow, XCircle } from "lucide-react";
import { Job, OperationCapabilities, sitesApi } from "../api/sitesApi";
import { Site, SitesStats } from "../types/site";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { HealthBadge } from "../components/HealthBadge";
import { KpiCard } from "../components/KpiCard";
import { LoadingState } from "../components/LoadingState";
import { MetadataOnlyBadge } from "../components/MetadataOnlyBadge";
import { PageHeader } from "../components/PageHeader";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { VersionBadge } from "../components/VersionBadge";
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
  const needsAttention = useMemo(
    () =>
      sites
        .filter((site) => site.status === "warning" || site.status === "failed" || site.derivedHealthStatus === "warning" || site.derivedHealthStatus === "failed" || site.versionStatus === "outdated")
        .slice(0, 7),
    [sites]
  );
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

  const verifiedCount = stats.health.healthy + stats.health.warning + stats.health.failed;
  const writeAvailable = Boolean(capabilities?.sharePoint.writeAvailable);

  if (loading) return <LoadingState label="טוען דשבורד..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="דשבורד"
        subtitle="תמונת מצב תפעולית לכל אתרי Site Builder הרשומים ב־Hub, עם הפרדה ברורה בין מידע מאומת לבין מטא־דאטה."
        actions={<Link className="btn btn-primary" to="/sites"><FolderKanban size={16} />רשימת אתרים</Link>}
      />

      <div className="surface-card p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold muted">Mongo Registry</span>
            <MetadataOnlyBadge mode="metadata" />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold muted">SharePoint Read</span>
            <MetadataOnlyBadge mode="readonly" />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold muted">SharePoint Write</span>
            {writeAvailable ? <span className="badge badge-success">מחובר לכתיבה</span> : <MetadataOnlyBadge mode="notConnected" />}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold muted">Auth</span>
            <span className="badge badge-warning">Dev/API key</span>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard title="סה״כ אתרים" value={formatNumber(stats.total)} icon={<FolderKanban size={18} />} description="אתרים רשומים ב־Hub" tone="info" footer={<span className="muted">כולל טיוטות, ללא פריסת SharePoint מכאן</span>} />
        <KpiCard title="דורשים טיפול" value={formatNumber(needsAttention.length)} icon={<AlertTriangle size={18} />} description="סטטוס warning/failed, תקינות בעייתית או גרסה מיושנת" tone={needsAttention.length ? "warning" : "success"} />
        <KpiCard title="אתרים מיושנים" value={formatNumber(versionStatus?.outdatedSites || 0)} icon={<GitBranch size={18} />} description="לפי השוואת גרסאות ב־Mongo/release registry" tone={(versionStatus?.outdatedSites || 0) ? "warning" : "success"} />
        <KpiCard title="Jobs שנכשלו" value={formatNumber(failedJobs.length)} icon={<XCircle size={18} />} description="פעולות תפעוליות שדורשות בדיקה" tone={failedJobs.length ? "danger" : "success"} />
        <KpiCard title="תקינות נכשלה" value={formatNumber(stats.health.failed || 0)} icon={<ShieldAlert size={18} />} description="אתרים עם health failed" tone={stats.health.failed ? "danger" : "success"} />
        <KpiCard title="נבדקו בפועל" value={`${stats.total ? Math.round((verifiedCount / stats.total) * 100) : 0}%`} icon={<ListChecks size={18} />} description="אתרים עם תוצאת health שאינה unknown" tone="info" />
        <KpiCard title="פעילים" value={formatNumber(stats.active)} icon={<CheckCircle2 size={18} />} description="אתרים במצב פעיל" tone="success" />
        <KpiCard title="לא נבדקו" value={formatNumber(stats.health.unknown || 0)} icon={<Clock3 size={18} />} description="דורשים בדיקת SharePoint read-only או health ידני" tone="neutral" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <SectionCard title="דורשים טיפול" subtitle="אתרים עם תקלה, אזהרה או גרסה מיושנת">
          {needsAttention.length === 0 ? (
            <EmptyState title="אין אתרים דחופים" description="לא נמצאו אתרים עם סטטוס בעייתי או גרסה מיושנת." />
          ) : (
            <div className="space-y-2">
              {needsAttention.map((site) => (
                <Link key={site._id} className="soft-panel flex flex-wrap items-center justify-between gap-3 p-3 transition hover:border-[var(--border-strong)]" to={`/sites/${site._id}`}>
                  <div>
                    <p className="font-bold" style={{ color: "var(--text-strong)" }}>{site.displayName}</p>
                    <p className="num mt-1 text-xs muted">{site.siteCode}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge status={site.status} />
                    <HealthBadge status={site.derivedHealthStatus} />
                    <VersionBadge status={site.versionStatus} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="התפלגות תקינות" subtitle="Health status לפי הרשומות האחרונות">
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

      <div className="grid gap-5 xl:grid-cols-3">
        <SectionCard title="פעילות אחרונה" subtitle="אתרים, health, גיבויים ו־Jobs">
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

        <SectionCard title="Jobs אחרונים" subtitle="סטטוס תורים ופעולות">
          {jobs.length === 0 ? <EmptyState title="אין Jobs" description="פעולות תפעוליות יופיעו כאן לאחר הרצה." /> : (
            <div className="space-y-2">
              {jobs.slice(0, 7).map((job) => (
                <Link key={job._id} className="soft-panel block p-3" to="/jobs">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold" style={{ color: "var(--text-strong)" }}>{jobTypeLabel(job.type)}</p>
                    <span className={`badge ${job.status === "failed" ? "badge-danger" : job.status === "succeeded" ? "badge-success" : "badge-info"}`}>{jobStatusLabel(job.status)}</span>
                  </div>
                  <div className="mt-2 progress-track"><div className="progress-fill" style={{ width: `${job.progressPercent || 0}%` }} /></div>
                  <p className="num mt-2 text-xs muted">{formatDateTime(job.createdAt)}</p>
                </Link>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="אתרים מיושנים" subtitle="פער בין currentVersion ל־latest release">
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

      <SectionCard title="מה מאומת ומה מטא־דאטה" subtitle="הבהרה תפעולית חשובה">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="soft-panel p-4">
            <Database className="mb-2" size={18} style={{ color: "var(--accent)" }} />
            <p className="font-bold" style={{ color: "var(--text-strong)" }}>רשומות Hub</p>
            <p className="mt-1 text-sm muted">אתרים, גרסאות, Jobs, גיבויים ומנהלים נשמרים ב־Mongo אלא אם מצוין אחרת.</p>
          </div>
          <div className="soft-panel p-4">
            <ListChecks className="mb-2" size={18} style={{ color: "var(--accent)" }} />
            <p className="font-bold" style={{ color: "var(--text-strong)" }}>קריאות SharePoint</p>
            <p className="mt-1 text-sm muted">Health, backup plan ו־live admin read מבצעים קריאה בלבד כאשר SharePoint מאפשר זאת.</p>
          </div>
          <div className="soft-panel p-4">
            <Workflow className="mb-2" size={18} style={{ color: writeAvailable ? "var(--success)" : "var(--warning)" }} />
            <p className="font-bold" style={{ color: "var(--text-strong)" }}>כתיבות SharePoint</p>
            <p className="mt-1 text-sm muted">{writeAvailable ? "השרת מדווח שכתיבה זמינה ומוגדרת." : "כתיבה אינה זמינה כרגע; פעולות deploy/backup/provision מוצגות כלא מחוברות."}</p>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
