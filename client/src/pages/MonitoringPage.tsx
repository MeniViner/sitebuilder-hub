import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BellRing, CheckCircle2, RefreshCcw, ShieldAlert } from "lucide-react";
import { sitesApi, MonitoringSummary, OperationalAlert } from "../api/sitesApi";
import { DataTable } from "../components/DataTable";
import { DetailsDrawer } from "../components/DetailsDrawer";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { FilterBar } from "../components/FilterBar";
import { KpiCard } from "../components/KpiCard";
import { LoadingState } from "../components/LoadingState";
import { MetadataOnlyBadge } from "../components/MetadataOnlyBadge";
import { PageHeader } from "../components/PageHeader";
import { SectionCard } from "../components/SectionCard";
import { formatDateTime, formatNumber } from "../utils/format";
import { clientLogger } from "../utils/logger";

const severityClass: Record<string, string> = {
  critical: "badge-danger",
  warning: "badge-warning",
  info: "badge-neutral"
};

const severityLabel: Record<string, string> = {
  critical: "קריטי",
  warning: "אזהרה",
  info: "מידע"
};

const statusLabel: Record<string, string> = {
  active: "פתוח",
  acknowledged: "בטיפול",
  resolved: "נסגר"
};

const statusClass: Record<string, string> = {
  active: "badge-danger",
  acknowledged: "badge-warning",
  resolved: "badge-success"
};

const firstEntity = (alert: OperationalAlert, type?: string) =>
  alert.entityRefs?.find((item) => (type ? item.type === type : true));

const countFor = (record: Record<string, number> | undefined, key: string) => Number(record?.[key] || 0);

export function MonitoringPage() {
  const [summary, setSummary] = useState<MonitoringSummary | null>(null);
  const [alerts, setAlerts] = useState<OperationalAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyAlertId, setBusyAlertId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [statusFilter, setStatusFilter] = useState("open");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedAlert, setSelectedAlert] = useState<OperationalAlert | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    clientLogger.info("monitoring", "Monitoring page load started", { statusFilter, severityFilter, categoryFilter });
    try {
      const [summaryRes, alertsRes] = await Promise.all([
        sitesApi.monitoringSummary(),
        sitesApi.monitoringAlerts({
          status: statusFilter,
          severity: severityFilter,
          category: categoryFilter,
          limit: 250
        })
      ]);
      setSummary(summaryRes.data);
      setAlerts(alertsRes.data);
      clientLogger.info("monitoring", "Monitoring page load completed", {
        alerts: alertsRes.data.length,
        open: summaryRes.data.counts.open,
        critical: summaryRes.data.counts.bySeverity.critical || 0
      });
    } catch (err) {
      clientLogger.error("monitoring", "Monitoring page load failed", { error: err });
      setError(err instanceof Error ? err.message : "שגיאה בטעינת ניטור והתראות");
    } finally {
      setLoading(false);
    }
  };

  const refreshAlerts = async () => {
    setRefreshing(true);
    setError("");
    setMessage("");
    clientLogger.info("monitoring", "Monitoring alert refresh requested");
    try {
      const res = await sitesApi.refreshMonitoringAlerts();
      setMessage(`סריקת התראות הסתיימה: ${res.data.detected} זוהו, ${res.data.resolved} נסגרו`);
      clientLogger.info("monitoring", "Monitoring alert refresh completed", {
        detected: res.data.detected,
        resolved: res.data.resolved
      });
      await load();
    } catch (err) {
      clientLogger.error("monitoring", "Monitoring alert refresh failed", { error: err });
      setError(err instanceof Error ? err.message : "שגיאה ברענון התראות");
    } finally {
      setRefreshing(false);
    }
  };

  const acknowledge = async (alert: OperationalAlert) => {
    setBusyAlertId(alert._id);
    setError("");
    setMessage("");
    clientLogger.warn("monitoring", "Monitoring alert acknowledgement requested", {
      alertId: alert._id,
      category: alert.category,
      severity: alert.severity
    });
    try {
      const res = await sitesApi.acknowledgeMonitoringAlert(alert._id);
      setAlerts((current) => current.map((item) => (item._id === alert._id ? res.data : item)));
      setSelectedAlert((current) => (current?._id === alert._id ? res.data : current));
      setMessage("ההתראה סומנה בטיפול");
      await load();
    } catch (err) {
      clientLogger.error("monitoring", "Monitoring alert acknowledgement failed", { alertId: alert._id, error: err });
      setError(err instanceof Error ? err.message : "שגיאה בסימון התראה");
    } finally {
      setBusyAlertId("");
    }
  };

  useEffect(() => {
    void load();
  }, [statusFilter, severityFilter, categoryFilter]);

  const categories = useMemo(() => {
    const fromSummary = Object.keys(summary?.counts.byCategory ?? {});
    const fromAlerts = alerts.map((item) => item.category).filter(Boolean);
    return [...new Set([...fromSummary, ...fromAlerts])];
  }, [alerts, summary]);

  const criticalAlerts = countFor(summary?.counts.bySeverity, "critical");
  const staleBackups = countFor(summary?.counts.byCategory, "stale_backup");
  const failedJobs = countFor(summary?.counts.byCategory, "failed_job");

  return (
    <div className="space-y-5">
      <PageHeader
        title="ניטור והתראות"
        subtitle="התראות תפעוליות על Jobs שנכשלו, גיבויים שהתיישנו ובדיקות תקינות שנכשלו."
        actions={<MetadataOnlyBadge mode="readonly" />}
      />

      {message ? <div className="badge badge-success px-3 py-2">{message}</div> : null}
      {loading ? <LoadingState /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !error ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard title="פתוחות" value={formatNumber(summary?.counts.open)} icon={<BellRing size={18} />} description="דורשות טיפול" tone={summary?.counts.open ? "danger" : "success"} />
            <KpiCard title="קריטיות" value={formatNumber(criticalAlerts)} icon={<ShieldAlert size={18} />} description="severity=critical" tone={criticalAlerts ? "danger" : "success"} />
            <KpiCard title="גיבויים מיושנים" value={formatNumber(staleBackups)} icon={<AlertTriangle size={18} />} description="category=stale_backup" tone={staleBackups ? "warning" : "success"} />
            <KpiCard title="Jobs שנכשלו" value={formatNumber(failedJobs)} icon={<AlertTriangle size={18} />} description="category=failed_job" tone={failedJobs ? "danger" : "success"} />
          </div>

          <SectionCard
            title="התראות פעילות"
            subtitle={summary?.generatedAt ? `עודכן: ${formatDateTime(summary.generatedAt)}` : "רשימת התראות תפעוליות"}
            actions={
              <button className="btn btn-primary" type="button" onClick={refreshAlerts} disabled={refreshing}>
                <RefreshCcw size={15} />
                {refreshing ? "מרענן..." : "סרוק עכשיו"}
              </button>
            }
          >
            <FilterBar>
              <label className="block">
                <span className="field-label">Status</span>
                <select className="control" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="open">פתוחות</option>
                  <option value="acknowledged">בטיפול</option>
                  <option value="resolved">סגורות</option>
                  <option value="all">הכל</option>
                </select>
              </label>
              <label className="block">
                <span className="field-label">Severity</span>
                <select className="control" value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)}>
                  <option value="all">כל הרמות</option>
                  <option value="critical">קריטי</option>
                  <option value="warning">אזהרה</option>
                  <option value="info">מידע</option>
                </select>
              </label>
              <label className="block">
                <span className="field-label">Category</span>
                <select className="control" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                  <option value="all">כל הקטגוריות</option>
                  {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </label>
            </FilterBar>

            <DataTable columns={["Severity", "Category", "Status", "התראה", "Entity", "זוהתה", "פעולות"]} minWidth={1120}>
              {alerts.length === 0 ? (
                <tr><td colSpan={7}><EmptyState title="אין התראות" description="לא נמצאו התראות לפי הסינון הנוכחי." /></td></tr>
              ) : alerts.map((alert) => {
                const siteRef = firstEntity(alert, "Site");
                const primaryRef = siteRef || firstEntity(alert);
                return (
                  <tr key={alert._id}>
                    <td><span className={`badge ${severityClass[alert.severity] || "badge-neutral"}`}>{severityLabel[alert.severity] || alert.severity}</span></td>
                    <td>{alert.category}</td>
                    <td><span className={`badge ${statusClass[alert.status] || "badge-neutral"}`}>{statusLabel[alert.status] || alert.status}</span></td>
                    <td>
                      <p className="font-bold" style={{ color: "var(--text-strong)" }}>{alert.message}</p>
                      {alert.acknowledgedBy ? <p className="text-xs muted">בטיפול: {alert.acknowledgedBy}</p> : null}
                    </td>
                    <td>
                      <p className="text-sm">{primaryRef?.label || primaryRef?.type || "-"}</p>
                      <p className="num text-xs muted">{primaryRef?.id || ""}</p>
                    </td>
                    <td className="num text-xs">{formatDateTime(alert.lastDetectedAt || alert.createdAt)}</td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <button className="btn btn-secondary min-h-0 px-2 py-1 text-xs" type="button" onClick={() => setSelectedAlert(alert)}>פתח</button>
                        {alert.status === "active" ? (
                          <button className="btn btn-primary min-h-0 px-2 py-1 text-xs" type="button" onClick={() => acknowledge(alert)} disabled={busyAlertId === alert._id}>
                            <CheckCircle2 size={13} />
                            בטיפול
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </DataTable>
          </SectionCard>
        </>
      ) : null}

      <DetailsDrawer open={Boolean(selectedAlert)} title={selectedAlert?.message || "התראה"} subtitle={selectedAlert?._id} onClose={() => setSelectedAlert(null)}>
        {selectedAlert ? (
          <pre className="overflow-x-auto rounded-lg border p-3 text-xs" style={{ background: "var(--surface-muted)", borderColor: "var(--border)" }}>
            {JSON.stringify(selectedAlert, null, 2)}
          </pre>
        ) : null}
      </DetailsDrawer>
    </div>
  );
}
