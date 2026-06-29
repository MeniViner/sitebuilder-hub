import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { HeartPulse, RefreshCcw, ShieldCheck } from "lucide-react";
import { SharePointHealthEvidence, SharePointHealthResult, sitesApi } from "../api/sitesApi";
import { Site } from "../types/site";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { DetailsDrawer } from "../components/DetailsDrawer";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { HealthBadge } from "../components/HealthBadge";
import { HelpLabel } from "../components/help/HelpLabel";
import { KpiCard } from "../components/KpiCard";
import { LoadingState } from "../components/LoadingState";
import { MetadataOnlyBadge } from "../components/MetadataOnlyBadge";
import { PageHeader } from "../components/PageHeader";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { formatDateTime, formatNumber } from "../utils/format";
import { runBrowserSharePointHealthCheck } from "../utils/sharepointBrowserConnector";

export function HealthPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [healthResult, setHealthResult] = useState<SharePointHealthResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleInterval, setScheduleInterval] = useState(60);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await sitesApi.list();
      setSites(res.data);
      if (!selectedSiteId && res.data[0]) setSelectedSiteId(res.data[0]._id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בטעינת בדיקות תקינות");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const counts = useMemo(() => ({
    healthy: sites.filter((site) => site.derivedHealthStatus === "healthy").length,
    warning: sites.filter((site) => site.derivedHealthStatus === "warning").length,
    failed: sites.filter((site) => site.derivedHealthStatus === "failed").length,
    unknown: sites.filter((site) => site.derivedHealthStatus === "unknown").length
  }), [sites]);
  const selectedSite = useMemo(() => sites.find((site) => site._id === selectedSiteId), [selectedSiteId, sites]);

  useEffect(() => {
    const schedule = selectedSite?.maintenanceSchedule?.healthCheck;
    setScheduleEnabled(Boolean(schedule?.enabled));
    setScheduleInterval(schedule?.intervalMinutes || 60);
  }, [selectedSite?._id, selectedSite?.maintenanceSchedule?.healthCheck?.enabled, selectedSite?.maintenanceSchedule?.healthCheck?.intervalMinutes]);

  const runReadOnlyFor = async (siteId = selectedSiteId) => {
    if (!siteId) return;
    setSelectedSiteId(siteId);
    setBusyAction(`readonly-${siteId}`);
    setError("");
    setMessage("");
    try {
      const site = sites.find((row) => row._id === siteId);
      if (!site) throw new Error("האתר לא נמצא ברשימת ה־Hub");
      const browserResult = await runBrowserSharePointHealthCheck(site);
      setHealthResult(browserResult);
      await sitesApi.recordBrowserSharePointHealth(siteId, browserResult);
      setMessage("בדיקת Browser SharePoint read-only הסתיימה ונשמרה");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בהרצת בדיקת SharePoint");
    } finally {
      setBusyAction("");
    }
  };

  const runReadOnly = async () => runReadOnlyFor(selectedSiteId);

  const runRuntimeConfigFor = async (siteId = selectedSiteId) => {
    if (!siteId) return;
    setSelectedSiteId(siteId);
    setBusyAction(`runtime-${siteId}`);
    setError("");
    setMessage("");
    try {
      await sitesApi.validateRuntimeConfig(siteId);
      setMessage("בדיקת runtime config הסתיימה ונשמרה");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בבדיקת runtime config");
    } finally {
      setBusyAction("");
    }
  };

  const runMongoHealthFor = async (siteId = selectedSiteId) => {
    if (!siteId) return;
    setSelectedSiteId(siteId);
    setBusyAction(`mongo-${siteId}`);
    setError("");
    setMessage("");
    try {
      await sitesApi.runMongoBackendHealth(siteId);
      setMessage("בדיקת Mongo backend הסתיימה ונשמרה");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בבדיקת Mongo backend");
    } finally {
      setBusyAction("");
    }
  };

  const saveSchedule = async () => {
    if (!selectedSiteId) return;
    setBusyAction("health-schedule");
    setError("");
    setMessage("");
    try {
      const intervalMinutes = Math.max(5, Math.round(Number(scheduleInterval) || 60));
      await sitesApi.update(selectedSiteId, {
        maintenanceSchedule: {
          ...(selectedSite?.maintenanceSchedule || {}),
          healthCheck: {
            ...(selectedSite?.maintenanceSchedule?.healthCheck || {}),
            enabled: scheduleEnabled,
            intervalMinutes,
            nextRunAt: scheduleEnabled ? new Date().toISOString() : undefined,
            lastError: ""
          }
        }
      });
      setMessage(scheduleEnabled ? "תזמון בדיקות health נשמר וייכנס לתור במחזור הסריקה הבא" : "תזמון בדיקות health כובה");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בשמירת תזמון health");
    } finally {
      setBusyAction("");
    }
  };

  const siteHealthColumns: DataTableColumn<Site>[] = [
    {
      key: "site",
      header: "אתר",
      helpKey: "sites.registry",
      render: (site) => (
        <div>
          <p className="font-bold" style={{ color: "var(--text-strong)" }}>{site.displayName}</p>
          <p className="num text-xs muted">{site.siteCode}</p>
        </div>
      )
    },
    {
      key: "status",
      header: "סטטוס",
      helpKey: "job.status",
      render: (site) => <StatusBadge status={site.status} />
    },
    {
      key: "health",
      header: "תקינות",
      helpKey: "health",
      render: (site) => <HealthBadge status={site.derivedHealthStatus} />
    },
    {
      key: "storage",
      header: "Storage",
      render: (site) => (
        <div className="space-y-1 text-xs">
          <span className={`badge ${site.storageBackend === "mongo" ? "badge-info" : site.storageBackend === "txt" ? "badge-success" : "badge-neutral"}`}>
            {site.storageBackend === "mongo" ? "Mongo" : site.storageBackend === "txt" ? "TXT" : "Unknown"}
          </span>
          <p className="muted">Runtime: <span className="num">{site.runtimeConfigStatus?.readStatus || "unknown"}</span></p>
          <p className="muted">Data: <span className="num">{site.dataBackendStatus || "unknown"}</span></p>
        </div>
      )
    },
    {
      key: "checked",
      header: "בדיקה אחרונה",
      helpKey: "health.readOnly",
      render: (site) => <span className="num text-xs">{formatDateTime(site.lastHealthCheckAt)}</span>
    },
    {
      key: "siteDb",
      header: "siteDB",
      helpKey: "site.mongodb",
      render: (site) => <span className={`badge ${site.health?.siteDbExists ? "badge-success" : "badge-neutral"}`}>{site.health?.siteDbExists ? "כן" : "לא/לא ידוע"}</span>
    },
    {
      key: "dist",
      header: "dist",
      helpKey: "site.finalDistPath",
      render: (site) => <span className={`badge ${site.health?.distExists && site.health?.indexExists ? "badge-success" : "badge-neutral"}`}>{site.health?.distExists && site.health?.indexExists ? "כן" : "לא/לא ידוע"}</span>
    },
    {
      key: "txt",
      header: "TXT / Seed",
      helpKey: "site.txtAdmins",
      render: (site) => site.storageBackend === "mongo"
        ? <span className={`badge ${site.mongoBackendStatus?.seedStatus === "ok" ? "badge-success" : "badge-warning"}`}>Seed {site.mongoBackendStatus?.seedStatus || "unknown"}</span>
        : <span className={`badge ${site.health?.txtFilesExist ? "badge-success" : "badge-neutral"}`}>{site.health?.txtFilesExist ? "כן" : "לא/לא ידוע"}</span>
    },
    {
      key: "actions",
      header: "פעולה",
      helpKey: "operations",
      render: (site) => (
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary min-h-0 px-2 py-1 text-xs" disabled={busyAction === `readonly-${site._id}`} onClick={() => void runReadOnlyFor(site._id)} type="button">בדוק</button>
          <button className="btn btn-secondary min-h-0 px-2 py-1 text-xs" disabled={busyAction === `runtime-${site._id}`} onClick={() => void runRuntimeConfigFor(site._id)} type="button">Runtime</button>
          {site.storageBackend === "mongo" ? <button className="btn btn-secondary min-h-0 px-2 py-1 text-xs" disabled={busyAction === `mongo-${site._id}`} onClick={() => void runMongoHealthFor(site._id)} type="button">Mongo</button> : null}
          <Link className="btn btn-secondary min-h-0 px-2 py-1 text-xs" to={`/sites/${site._id}`}>פרטים</Link>
        </div>
      )
    }
  ];

  const siteHealthMobileCard = (site: Site) => (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-bold" style={{ color: "var(--text-strong)" }}>{site.displayName}</p>
          <p className="num text-xs muted">{site.siteCode}</p>
        </div>
        <HealthBadge status={site.derivedHealthStatus} />
      </div>
      <div className="flex flex-wrap gap-2">
        <StatusBadge status={site.status} />
        <span className={`badge ${site.storageBackend === "mongo" ? "badge-info" : site.storageBackend === "txt" ? "badge-success" : "badge-neutral"}`}>{site.storageBackend || "unknown"}</span>
        <span className="badge badge-neutral">Last: {formatDateTime(site.lastHealthCheckAt)}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <span className={`badge ${site.health?.siteDbExists ? "badge-success" : "badge-neutral"}`}>siteDB</span>
        <span className={`badge ${site.health?.distExists && site.health?.indexExists ? "badge-success" : "badge-neutral"}`}>dist</span>
        <span className={`badge ${site.storageBackend === "mongo" ? site.mongoBackendStatus?.seedStatus === "ok" ? "badge-success" : "badge-warning" : site.health?.txtFilesExist ? "badge-success" : "badge-neutral"}`}>{site.storageBackend === "mongo" ? "Seed" : "TXT"}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary min-h-0 px-2 py-1 text-xs" disabled={busyAction === `readonly-${site._id}`} onClick={() => void runReadOnlyFor(site._id)} type="button">בדוק</button>
        <button className="btn btn-secondary min-h-0 px-2 py-1 text-xs" disabled={busyAction === `runtime-${site._id}`} onClick={() => void runRuntimeConfigFor(site._id)} type="button">Runtime</button>
        {site.storageBackend === "mongo" ? <button className="btn btn-secondary min-h-0 px-2 py-1 text-xs" disabled={busyAction === `mongo-${site._id}`} onClick={() => void runMongoHealthFor(site._id)} type="button">Mongo</button> : null}
        <Link className="btn btn-secondary min-h-0 px-2 py-1 text-xs" to={`/sites/${site._id}`}>פרטים</Link>
      </div>
    </div>
  );

  const healthEvidenceColumns: DataTableColumn<SharePointHealthEvidence>[] = [
    {
      key: "check",
      header: "בדיקה",
      helpKey: "health.readOnly",
      render: (item) => (
        <div>
          <p className="font-bold">{item.label || item.key}</p>
          {item.key ? <p className="num text-xs muted">{item.key}</p> : null}
        </div>
      )
    },
    {
      key: "result",
      header: "תוצאה",
      helpKey: "health",
      render: (item) => <span className={`badge ${item.ok ? "badge-success" : item.authBlocked ? "badge-warning" : "badge-danger"}`}>{item.ok ? "OK" : item.authBlocked ? "AUTH" : "FAIL"} {item.status || ""}</span>
    },
    { key: "url", header: "URL", helpKey: "sharepoint.read", render: (item) => <code className="num block max-w-[520px] truncate text-xs muted" title={item.url}>{item.url}</code> },
    { key: "error", header: "שגיאה", helpKey: "diagnostics", render: (item) => item.error ? <code className="num block max-w-[240px] truncate text-xs" style={{ color: "var(--danger)" }} title={item.error}>{item.error}</code> : <span className="muted">-</span> }
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="בדיקות תקינות"
        subtitle="תצוגה רוחבית של health לכל האתרים והרצת בדיקת Browser SharePoint read-only לאתר נבחר."
        helpKey="health"
        actions={<MetadataOnlyBadge mode="readonly" />}
      />

      {message ? <div className="badge badge-success px-3 py-2">{message}</div> : null}
      {loading ? <LoadingState /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !error ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard variant="inline" title="תקינים" value={formatNumber(counts.healthy)} icon={<ShieldCheck size={18} />} description="Health healthy" tone="success" helpKey="health" />
            <KpiCard variant="inline" title="אזהרה" value={formatNumber(counts.warning)} icon={<HeartPulse size={18} />} description="דורשים בדיקה" tone={counts.warning ? "warning" : "success"} helpKey="health" />
            <KpiCard variant="inline" title="נכשלו" value={formatNumber(counts.failed)} icon={<HeartPulse size={18} />} description="Health failed" tone={counts.failed ? "danger" : "success"} helpKey="health.pathFailure" />
            <KpiCard variant="inline" title="לא נבדקו" value={formatNumber(counts.unknown)} icon={<HeartPulse size={18} />} description="אין health אחרון" tone="neutral" helpKey="health.readOnly" />
          </div>

          <SectionCard title="הרצת בדיקה Read-only" subtitle="בודקת דרך הדפדפן אירוח SharePoint; Runtime/Mongo נבדקים בפעולות נפרדות." helpKey="health.readOnly">
            <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
              <label className="block">
                <span className="field-label"><HelpLabel helpKey="sites.registry">אתר</HelpLabel></span>
                <select className="control" value={selectedSiteId} onChange={(e) => { setSelectedSiteId(e.target.value); setHealthResult(null); }}>
                  {sites.map((site) => <option key={site._id} value={site._id}>{site.displayName} ({site.siteCode})</option>)}
                </select>
              </label>
              <button className="btn btn-primary" disabled={!selectedSiteId || busyAction === `readonly-${selectedSiteId}`} onClick={() => void runReadOnly()} type="button">הרץ בדיקה</button>
              <button className="btn btn-secondary" onClick={load} type="button"><RefreshCcw size={15} />רענן</button>
            </div>
          </SectionCard>

          <SectionCard title="תזמון בדיקות חוזרות" subtitle="השרת ייצור health-check jobs לקריאה בלבד לפי המרווח שנשמר לאתר." helpKey="backup.schedule">
            <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto] md:items-end">
              <label className="block">
                <span className="field-label"><HelpLabel helpKey="sites.registry">אתר</HelpLabel></span>
                <select className="control" value={selectedSiteId} onChange={(e) => { setSelectedSiteId(e.target.value); setHealthResult(null); }}>
                  {sites.map((site) => <option key={site._id} value={site._id}>{site.displayName} ({site.siteCode})</option>)}
                </select>
              </label>
              <label className="block">
                <span className="field-label"><HelpLabel helpKey="backup.schedule">מרווח בדקות</HelpLabel></span>
                <input className="control num" min={5} type="number" value={scheduleInterval} onChange={(e) => setScheduleInterval(Number(e.target.value))} />
              </label>
              <label className="flex min-h-[44px] items-center gap-2">
                <input checked={scheduleEnabled} onChange={(e) => setScheduleEnabled(e.target.checked)} type="checkbox" />
                <span className="font-bold">פעיל</span>
              </label>
              <button className="btn btn-primary" disabled={!selectedSiteId || busyAction === "health-schedule"} onClick={saveSchedule} type="button">שמור תזמון</button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="badge badge-neutral">Next: {formatDateTime(selectedSite?.maintenanceSchedule?.healthCheck?.nextRunAt)}</span>
              <span className="badge badge-neutral">Last job: {selectedSite?.maintenanceSchedule?.healthCheck?.lastJobId || "-"}</span>
              {selectedSite?.maintenanceSchedule?.healthCheck?.lastError ? <span className="badge badge-danger">{selectedSite.maintenanceSchedule.healthCheck.lastError}</span> : null}
            </div>
          </SectionCard>

          <SectionCard title="מצב תקינות לכל האתרים" subtitle="פתח אתר לפרטים וראיות מלאות" helpKey="health">
            {sites.length === 0 ? (
              <EmptyState title="אין אתרים" description="לא נמצאו אתרים ברשימת ה־Hub." />
            ) : (
              <DataTable columns={siteHealthColumns} rows={sites} rowKey={(site) => site._id} mobileCard={siteHealthMobileCard} minWidth={1060} density="dense" />
            )}
          </SectionCard>
        </>
      ) : null}

      <DetailsDrawer open={Boolean(healthResult)} title="תוצאות בדיקת Health" subtitle={healthResult ? `${healthResult.siteCode} · ${healthResult.source || healthResult.connectorMode || "Backend SharePoint"} · ${formatDateTime(healthResult.checkedAt)}` : ""} onClose={() => setHealthResult(null)}>
        {healthResult ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <HealthBadge status={healthResult.derivedHealthStatus as any} />
              <span className="badge badge-info">{healthResult.source || "Backend SharePoint"}</span>
              <span className="num text-xs muted">{formatDateTime(healthResult.checkedAt)}</span>
            </div>
            {healthResult.evidence.length === 0 ? (
              <EmptyState title="אין Evidence להצגה" description="הבדיקה הסתיימה בלי שורות פירוט." />
            ) : (
              <DataTable
                columns={healthEvidenceColumns}
                rows={healthResult.evidence}
                rowKey={(item) => `${item.key || item.label}-${item.url}`}
                minWidth={820}
                density="dense"
                mobileCard={(item) => (
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-bold">{item.label || item.key}</p>
                        <code className="num block max-w-full truncate text-xs muted" title={item.url}>{item.url}</code>
                      </div>
                      <span className={`badge shrink-0 ${item.ok ? "badge-success" : item.authBlocked ? "badge-warning" : "badge-danger"}`}>{item.ok ? "OK" : item.authBlocked ? "AUTH" : "FAIL"}</span>
                    </div>
                    {item.status || item.statusText ? <p className="text-xs muted">{item.status ? `HTTP ${item.status}` : ""} {item.statusText || ""}</p> : null}
                    {item.error ? <code className="num block max-w-full truncate text-xs" style={{ color: "var(--danger)" }} title={item.error}>{item.error}</code> : null}
                  </div>
                )}
              />
            )}
          </div>
        ) : null}
      </DetailsDrawer>
    </div>
  );
}
