import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BellRing, CheckCircle2, RefreshCcw, ShieldAlert } from "lucide-react";
import { sitesApi, MonitoringSummary, OperationalAlert } from "../api/sitesApi";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { DetailsDrawer } from "../components/DetailsDrawer";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { FilterBar } from "../components/FilterBar";
import { HelpLabel } from "../components/help/HelpLabel";
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

const suggestedAlertAction = (alert: OperationalAlert) => {
  if (alert.category === "failed_job") return "פתח את ה-Job הרלוונטי במסך Jobs, בדוק error/evidence, ואז החלט אם rerun או escalation.";
  if (alert.category === "stale_backup") return "פתח Backups, צור plan read-only לאתר, אמת inventory ואז תזמן/בקש backup לאישור.";
  if (alert.category === "failed_health_check") return "פתח Health, הרץ read-only check לאתר, ובדוק evidence של dist/index/TXT לפני פעולה מתקנת.";
  return "בדוק את ה-entity וה-evidence המצורפים לפני שינוי סטטוס.";
};

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
  const alertColumns: DataTableColumn<OperationalAlert>[] = [
    {
      key: "severity",
      header: "Severity",
      helpKey: "alert.severity",
      render: (alert) => <span className={`badge ${severityClass[alert.severity] || "badge-neutral"}`}>{severityLabel[alert.severity] || alert.severity}</span>
    },
    {
      key: "category",
      header: "Category",
      helpKey: "monitoring.alert",
      render: (alert) => alert.category
    },
    {
      key: "status",
      header: "Status",
      helpKey: "alert.status",
      render: (alert) => <span className={`badge ${statusClass[alert.status] || "badge-neutral"}`}>{statusLabel[alert.status] || alert.status}</span>
    },
    {
      key: "message",
      header: "התראה",
      helpKey: "monitoring.alert",
      render: (alert) => (
        <div>
          <p className="font-bold" style={{ color: "var(--text-strong)" }}>{alert.message}</p>
          {alert.acknowledgedBy ? <p className="text-xs muted">בטיפול: {alert.acknowledgedBy}</p> : null}
        </div>
      )
    },
    {
      key: "entity",
      header: "Entity",
      helpKey: "audit.evidence",
      render: (alert) => {
        const siteRef = firstEntity(alert, "Site");
        const primaryRef = siteRef || firstEntity(alert);
        return (
          <div>
            <p className="text-sm">{primaryRef?.label || primaryRef?.type || "-"}</p>
            <p className="num text-xs muted">{primaryRef?.id || ""}</p>
          </div>
        );
      }
    },
    {
      key: "detected",
      header: "זוהתה",
      helpKey: "history",
      render: (alert) => <span className="num text-xs">{formatDateTime(alert.lastDetectedAt || alert.createdAt)}</span>
    },
    {
      key: "actions",
      header: "פעולות",
      helpKey: "operations",
      render: (alert) => (
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-secondary min-h-0 px-2 py-1 text-xs" type="button" onClick={() => setSelectedAlert(alert)}>פתח</button>
          {alert.status === "active" ? (
            <button className="btn btn-primary min-h-0 px-2 py-1 text-xs" type="button" onClick={() => acknowledge(alert)} disabled={busyAlertId === alert._id}>
              <CheckCircle2 size={13} />
              בטיפול
            </button>
          ) : null}
        </div>
      )
    }
  ];

  const alertMobileCard = (alert: OperationalAlert) => {
    const siteRef = firstEntity(alert, "Site");
    const primaryRef = siteRef || firstEntity(alert);
    return (
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-bold" style={{ color: "var(--text-strong)" }}>{alert.message}</p>
            <p className="mt-1 text-xs muted">{alert.category}</p>
          </div>
          <span className={`badge ${severityClass[alert.severity] || "badge-neutral"}`}>{severityLabel[alert.severity] || alert.severity}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={`badge ${statusClass[alert.status] || "badge-neutral"}`}>{statusLabel[alert.status] || alert.status}</span>
          <span className="badge badge-neutral">{primaryRef?.label || primaryRef?.type || "ללא entity"}</span>
        </div>
        <p className="num text-xs muted">{formatDateTime(alert.lastDetectedAt || alert.createdAt)}</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-secondary min-h-0 px-2 py-1 text-xs" type="button" onClick={() => setSelectedAlert(alert)}>פתח</button>
          {alert.status === "active" ? (
            <button className="btn btn-primary min-h-0 px-2 py-1 text-xs" type="button" onClick={() => acknowledge(alert)} disabled={busyAlertId === alert._id}>
              <CheckCircle2 size={13} />
              בטיפול
            </button>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="ניטור והתראות"
        subtitle="התראות תפעוליות על Jobs שנכשלו, גיבויים שהתיישנו ובדיקות תקינות שנכשלו."
        helpKey="monitoring.alert"
        actions={<MetadataOnlyBadge mode="readonly" />}
      />

      {message ? <div className="badge badge-success px-3 py-2">{message}</div> : null}
      {loading ? <LoadingState /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !error ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard variant="inline" title="פתוחות" value={formatNumber(summary?.counts.open)} icon={<BellRing size={18} />} description="דורשות טיפול" tone={summary?.counts.open ? "danger" : "success"} helpKey="monitoring.alert" />
            <KpiCard variant="inline" title="קריטיות" value={formatNumber(criticalAlerts)} icon={<ShieldAlert size={18} />} description="severity=critical" tone={criticalAlerts ? "danger" : "success"} helpKey="alert.severity" />
            <KpiCard variant="inline" title="גיבויים מיושנים" value={formatNumber(staleBackups)} icon={<AlertTriangle size={18} />} description="category=stale_backup" tone={staleBackups ? "warning" : "success"} helpKey="backup.schedule" />
            <KpiCard variant="inline" title="Jobs שנכשלו" value={formatNumber(failedJobs)} icon={<AlertTriangle size={18} />} description="category=failed_job" tone={failedJobs ? "danger" : "success"} helpKey="job.failed" />
          </div>

          <SectionCard
            title="התראות פעילות"
            subtitle={summary?.generatedAt ? `עודכן: ${formatDateTime(summary.generatedAt)}` : "רשימת התראות תפעוליות"}
            helpKey="monitoring.alert"
            actions={
              <button className="btn btn-primary" type="button" onClick={refreshAlerts} disabled={refreshing}>
                <RefreshCcw size={15} />
                {refreshing ? "מרענן..." : "סרוק עכשיו"}
              </button>
            }
          >
            <FilterBar>
              <label className="block">
                <span className="field-label"><HelpLabel helpKey="alert.status">Status</HelpLabel></span>
                <select className="control" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="open">פתוחות</option>
                  <option value="acknowledged">בטיפול</option>
                  <option value="resolved">סגורות</option>
                  <option value="all">הכל</option>
                </select>
              </label>
              <label className="block">
                <span className="field-label"><HelpLabel helpKey="alert.severity">Severity</HelpLabel></span>
                <select className="control" value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)}>
                  <option value="all">כל הרמות</option>
                  <option value="critical">קריטי</option>
                  <option value="warning">אזהרה</option>
                  <option value="info">מידע</option>
                </select>
              </label>
              <label className="block">
                <span className="field-label"><HelpLabel helpKey="filters">Category</HelpLabel></span>
                <select className="control" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                  <option value="all">כל הקטגוריות</option>
                  {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </label>
            </FilterBar>

            {alerts.length === 0 ? (
              <EmptyState title="אין התראות" description="לא נמצאו התראות לפי הסינון הנוכחי." />
            ) : (
              <DataTable columns={alertColumns} rows={alerts} rowKey={(alert) => alert._id} mobileCard={alertMobileCard} minWidth={1120} density="dense" />
            )}
          </SectionCard>
        </>
      ) : null}

      <DetailsDrawer open={Boolean(selectedAlert)} title={selectedAlert?.message || "התראה"} subtitle={selectedAlert?._id} onClose={() => setSelectedAlert(null)}>
        {selectedAlert ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="soft-panel p-3">
                <p className="field-label"><HelpLabel helpKey="alert.severity">Severity</HelpLabel></p>
                <span className={`badge ${severityClass[selectedAlert.severity] || "badge-neutral"}`}>{severityLabel[selectedAlert.severity] || selectedAlert.severity}</span>
              </div>
              <div className="soft-panel p-3">
                <p className="field-label"><HelpLabel helpKey="alert.status">Status</HelpLabel></p>
                <span className={`badge ${statusClass[selectedAlert.status] || "badge-neutral"}`}>{statusLabel[selectedAlert.status] || selectedAlert.status}</span>
              </div>
              <div className="soft-panel p-3">
                <p className="field-label"><HelpLabel helpKey="filters">Category</HelpLabel></p>
                <p>{selectedAlert.category}</p>
              </div>
              <div className="soft-panel p-3">
                <p className="field-label"><HelpLabel helpKey="history">Last detected</HelpLabel></p>
                <p className="num text-sm">{formatDateTime(selectedAlert.lastDetectedAt || selectedAlert.createdAt)}</p>
              </div>
            </div>
            <div className="rounded-lg border p-3" style={{ background: "var(--info-soft)", borderColor: "color-mix(in srgb, var(--info) 35%, var(--border))" }}>
              <p className="field-label" style={{ color: "var(--info)" }}><HelpLabel helpKey="diagnostics">פעולה מומלצת</HelpLabel></p>
              <p className="mt-1 text-sm" style={{ color: "var(--text-strong)" }}>{suggestedAlertAction(selectedAlert)}</p>
            </div>
            {selectedAlert.entityRefs?.length ? (
              <div className="soft-panel p-3">
                <p className="field-label"><HelpLabel helpKey="audit.evidence">Entities</HelpLabel></p>
                <div className="mt-2 space-y-2">
                  {selectedAlert.entityRefs.map((entity) => (
                    <div key={`${entity.type}-${entity.id}`} className="rounded-md border p-2" style={{ borderColor: "var(--border)" }}>
                      <p className="font-bold">{entity.label || entity.type}</p>
                      <p className="num text-xs muted">{entity.type} · {entity.id}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <details className="rounded-lg border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--border)" }}>
              <summary className="cursor-pointer text-sm font-bold" style={{ color: "var(--text-strong)" }}>Raw alert payload</summary>
              <pre className="mt-3 overflow-x-auto text-xs">{JSON.stringify(selectedAlert, null, 2)}</pre>
            </details>
          </div>
        ) : null}
      </DetailsDrawer>
    </div>
  );
}
