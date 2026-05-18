import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { HeartPulse, RefreshCcw, ShieldCheck } from "lucide-react";
import { SharePointHealthResult, sitesApi } from "../api/sitesApi";
import { Site } from "../types/site";
import { DataTable } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { HealthBadge } from "../components/HealthBadge";
import { KpiCard } from "../components/KpiCard";
import { LoadingState } from "../components/LoadingState";
import { MetadataOnlyBadge } from "../components/MetadataOnlyBadge";
import { PageHeader } from "../components/PageHeader";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { formatDateTime, formatNumber } from "../utils/format";

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

  const runReadOnly = async () => {
    if (!selectedSiteId) return;
    setBusyAction("readonly");
    setError("");
    setMessage("");
    try {
      const result = await sitesApi.runSharePointReadOnlyHealth(selectedSiteId);
      setHealthResult(result.data);
      setMessage("בדיקת SharePoint read-only הסתיימה");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בהרצת בדיקת SharePoint");
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

  return (
    <div className="space-y-5">
      <PageHeader
        title="בדיקות תקינות"
        subtitle="תצוגה רוחבית של health לכל האתרים והרצת בדיקת SharePoint read-only לאתר נבחר."
        actions={<MetadataOnlyBadge mode="readonly" />}
      />

      {message ? <div className="badge badge-success px-3 py-2">{message}</div> : null}
      {loading ? <LoadingState /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !error ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard title="תקינים" value={formatNumber(counts.healthy)} icon={<ShieldCheck size={18} />} description="Health healthy" tone="success" />
            <KpiCard title="אזהרה" value={formatNumber(counts.warning)} icon={<HeartPulse size={18} />} description="דורשים בדיקה" tone={counts.warning ? "warning" : "success"} />
            <KpiCard title="נכשלו" value={formatNumber(counts.failed)} icon={<HeartPulse size={18} />} description="Health failed" tone={counts.failed ? "danger" : "success"} />
            <KpiCard title="לא נבדקו" value={formatNumber(counts.unknown)} icon={<HeartPulse size={18} />} description="אין health אחרון" tone="neutral" />
          </div>

          <SectionCard title="הרצת בדיקה Read-only" subtitle="בודקת ספריות, dist, index, assets וקבצי TXT ללא כתיבה ל־SharePoint.">
            <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
              <label className="block">
                <span className="field-label">אתר</span>
                <select className="control" value={selectedSiteId} onChange={(e) => { setSelectedSiteId(e.target.value); setHealthResult(null); }}>
                  {sites.map((site) => <option key={site._id} value={site._id}>{site.displayName} ({site.siteCode})</option>)}
                </select>
              </label>
              <button className="btn btn-primary" disabled={!selectedSiteId || busyAction === "readonly"} onClick={runReadOnly} type="button">הרץ בדיקה</button>
              <button className="btn btn-secondary" onClick={load} type="button"><RefreshCcw size={15} />רענן</button>
            </div>
            {healthResult ? (
              <div className="mt-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <HealthBadge status={healthResult.derivedHealthStatus as any} />
                  <span className="num text-xs muted">{formatDateTime(healthResult.checkedAt)}</span>
                </div>
                <DataTable columns={["בדיקה", "תוצאה", "URL"]} minWidth={820}>
                  {healthResult.evidence.map((item) => (
                    <tr key={`${item.label}-${item.url}`}>
                      <td>{item.label}</td>
                      <td><span className={`badge ${item.ok ? "badge-success" : item.authBlocked ? "badge-warning" : "badge-danger"}`}>{item.ok ? "OK" : item.authBlocked ? "AUTH" : "FAIL"} {item.status || ""}</span></td>
                      <td><code className="num block max-w-[520px] truncate text-xs muted" title={item.url}>{item.url}</code></td>
                    </tr>
                  ))}
                </DataTable>
              </div>
            ) : null}
          </SectionCard>

          <SectionCard title="תזמון בדיקות חוזרות" subtitle="השרת ייצור health-check jobs לקריאה בלבד לפי המרווח שנשמר לאתר.">
            <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto] md:items-end">
              <label className="block">
                <span className="field-label">אתר</span>
                <select className="control" value={selectedSiteId} onChange={(e) => { setSelectedSiteId(e.target.value); setHealthResult(null); }}>
                  {sites.map((site) => <option key={site._id} value={site._id}>{site.displayName} ({site.siteCode})</option>)}
                </select>
              </label>
              <label className="block">
                <span className="field-label">מרווח בדקות</span>
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

          <SectionCard title="מצב תקינות לכל האתרים" subtitle="פתח אתר לפרטים וראיות מלאות">
            <DataTable columns={["אתר", "סטטוס", "תקינות", "בדיקה אחרונה", "siteDB", "dist", "TXT", "פעולה"]} minWidth={1060}>
              {sites.length === 0 ? (
                <tr><td colSpan={8}><EmptyState title="אין אתרים" description="לא נמצאו אתרים ברשימת ה־Hub." /></td></tr>
              ) : sites.map((site) => (
                <tr key={site._id}>
                  <td>
                    <p className="font-bold" style={{ color: "var(--text-strong)" }}>{site.displayName}</p>
                    <p className="num text-xs muted">{site.siteCode}</p>
                  </td>
                  <td><StatusBadge status={site.status} /></td>
                  <td><HealthBadge status={site.derivedHealthStatus} /></td>
                  <td className="num text-xs">{formatDateTime(site.lastHealthCheckAt)}</td>
                  <td><span className={`badge ${site.health?.siteDbExists ? "badge-success" : "badge-neutral"}`}>{site.health?.siteDbExists ? "כן" : "לא/לא ידוע"}</span></td>
                  <td><span className={`badge ${site.health?.distExists && site.health?.indexExists ? "badge-success" : "badge-neutral"}`}>{site.health?.distExists && site.health?.indexExists ? "כן" : "לא/לא ידוע"}</span></td>
                  <td><span className={`badge ${site.health?.txtFilesExist ? "badge-success" : "badge-neutral"}`}>{site.health?.txtFilesExist ? "כן" : "לא/לא ידוע"}</span></td>
                  <td><Link className="btn btn-secondary min-h-0 px-2 py-1 text-xs" to={`/sites/${site._id}`}>פרטים</Link></td>
                </tr>
              ))}
            </DataTable>
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}
