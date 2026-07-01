import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowUpRight, BellRing, CheckCircle2, RefreshCcw, ShieldAlert } from "lucide-react";
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
import { AdvancedDetails, ModeBoundary, OperationalSummary } from "../components/OperationalSummary";
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

const categoryLabel: Record<OperationalAlert["category"], string> = {
  failed_job: "פעולה שנכשלה",
  stale_backup: "גיבוי שהתיישן",
  failed_health_check: "בדיקת תקינות נכשלה"
};

const firstEntity = (alert: OperationalAlert, type?: string) =>
  alert.entityRefs?.find((item) => (type ? item.type === type : true));

const countFor = (record: Record<string, number> | undefined, key: string) => Number(record?.[key] || 0);

const alertDetectedAt = (alert: OperationalAlert) =>
  alert.firstDetectedAt || alert.lastDetectedAt || alert.createdAt || alert.updatedAt || "";

const incidentAgeLabel = (alert: OperationalAlert) => {
  const detectedAt = alertDetectedAt(alert);
  const detectedTime = detectedAt ? new Date(detectedAt).getTime() : Number.NaN;
  if (!Number.isFinite(detectedTime)) return "לא ידוע";
  const minutes = Math.max(0, Math.floor((Date.now() - detectedTime) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

const incidentSlaState = (alert: OperationalAlert) => {
  if (alert.status === "resolved") return { label: "נסגר", className: "badge-success" };
  const detectedAt = alertDetectedAt(alert);
  const detectedTime = detectedAt ? new Date(detectedAt).getTime() : Number.NaN;
  const ageHours = Number.isFinite(detectedTime) ? (Date.now() - detectedTime) / 3600000 : 0;
  if (alert.severity === "critical" && alert.status === "active" && ageHours >= 1) return { label: "סיכון SLA", className: "badge-danger" };
  if (alert.status === "acknowledged") return { label: "יש אחראי", className: "badge-warning" };
  return { label: "דורש מיון", className: alert.severity === "critical" ? "badge-danger" : "badge-warning" };
};

const incidentOwner = (alert: OperationalAlert) => {
  if (alert.acknowledgedBy) return alert.acknowledgedBy;
  if (alert.category === "failed_job") return "אחראי תפעול";
  if (alert.category === "stale_backup") return "אחראי שחזור";
  if (alert.category === "failed_health_check") return "אחראי תקינות";
  return "מנהל מערכת";
};

const incidentTarget = (alert: OperationalAlert) => {
  if (alert.category === "failed_job") return { href: "#/jobs", label: "פתח תור פעולות" };
  if (alert.category === "stale_backup") return { href: "#/backups?tab=plan", label: "פתח מרכז גיבוי ושחזור" };
  if (alert.category === "failed_health_check") return { href: "#/health", label: "פתח בדיקות תקינות" };
  return { href: "#/diagnostics", label: "פתח אבחון" };
};

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
  const activeAlerts = Number(summary?.counts.active || 0);
  const acknowledgedAlerts = Number(summary?.counts.acknowledged || 0);
  const alertColumns: DataTableColumn<OperationalAlert>[] = [
    {
      key: "impact",
      header: "חומרה",
      helpKey: "alert.severity",
      render: (alert) => (
        <div className="space-y-1">
          <span className={`badge ${severityClass[alert.severity] || "badge-neutral"}`}>{severityLabel[alert.severity] || alert.severity}</span>
          <span className="badge badge-neutral">{categoryLabel[alert.category] || alert.category}</span>
        </div>
      )
    },
    {
      key: "ownership",
      header: "אחראי / מצב",
      helpKey: "alert.status",
      render: (alert) => {
        const sla = incidentSlaState(alert);
        return (
          <div className="space-y-1">
            <span className={`badge ${statusClass[alert.status] || "badge-neutral"}`}>{statusLabel[alert.status] || alert.status}</span>
            <span className={`badge ${sla.className}`}>{sla.label}</span>
            <p className="text-xs muted">{incidentOwner(alert)}</p>
          </div>
        );
      }
    },
    {
      key: "message",
      header: "אירוע / צעד הבא",
      helpKey: "monitoring.alert",
      render: (alert) => {
        const target = incidentTarget(alert);
        return (
          <div className="max-w-xl">
            <p className="font-bold" style={{ color: "var(--text-strong)" }}>{alert.message}</p>
            <p className="mt-1 text-xs muted">{suggestedAlertAction(alert)}</p>
            <a className="mt-2 inline-flex items-center gap-1 text-xs font-bold" href={target.href} style={{ color: "var(--accent)" }}>
              {target.label}
              <ArrowUpRight size={12} />
            </a>
          </div>
        );
      }
    },
    {
      key: "entity",
      header: "על מה",
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
      key: "age",
      header: "גיל",
      helpKey: "history",
      render: (alert) => (
        <div className="space-y-1">
          <span className="num font-bold">{incidentAgeLabel(alert)}</span>
          <p className="num text-xs muted">{formatDateTime(alert.lastDetectedAt || alert.createdAt)}</p>
        </div>
      )
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
    const target = incidentTarget(alert);
    const sla = incidentSlaState(alert);
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
          <span className={`badge ${sla.className}`}>{sla.label}</span>
          <span className="badge badge-neutral">{primaryRef?.label || primaryRef?.type || "ללא entity"}</span>
        </div>
        <p className="text-xs muted">{suggestedAlertAction(alert)}</p>
        <p className="num text-xs muted">{formatDateTime(alert.lastDetectedAt || alert.createdAt)}</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-secondary min-h-0 px-2 py-1 text-xs" type="button" onClick={() => setSelectedAlert(alert)}>פתח</button>
          <a className="btn btn-secondary min-h-0 px-2 py-1 text-xs" href={target.href}><ArrowUpRight size={13} />פתח מסך</a>
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
        title="תיבת אירועים"
        subtitle="מה דורש טיפול עכשיו, מי אחראי, ומה המסך הבא לפתרון"
        helpKey="monitoring.alert"
        actions={<MetadataOnlyBadge mode="readonly" />}
      />

      <OperationalSummary
        title="מה צריך טיפול עכשיו"
        purpose="המסך מרכז התראות פתוחות מכשלי פעולות, גיבויים שהתיישנו ובדיקות תקינות שנכשלו. מכאן מסמנים בעלות ועוברים למסך התיקון."
        state={`${formatNumber(activeAlerts)} פתוחות · ${formatNumber(acknowledgedAlerts)} בטיפול · ${formatNumber(criticalAlerts)} קריטיות`}
        attention={criticalAlerts
          ? `${formatNumber(criticalAlerts)} אירועים קריטיים צריכים טיפול ראשון.`
          : activeAlerts
            ? `${formatNumber(activeAlerts)} אירועים פתוחים עדיין בלי סימון טיפול.`
            : "אין אירועים פתוחים שדורשים טיפול מידי."}
        attentionTone={criticalAlerts ? "danger" : activeAlerts ? "warning" : "success"}
        nextAction={failedJobs
          ? "פתחו תור פעולות ובדקו את הכשל הראשון."
          : staleBackups
            ? "פתחו מרכז גיבוי ושחזור ובדקו אילו גיבויים התיישנו."
            : activeAlerts
              ? "סמנו אירוע בטיפול, ואז עברו למסך שהמערכת ממליצה עליו."
              : "אפשר להריץ סריקה ידנית או להמשיך לעבוד כרגיל."}
        blocked={error ? "טעינת התראות נכשלה. רעננו או בדקו את חיבור ה־backend." : undefined}
        tone={criticalAlerts ? "danger" : activeAlerts ? "warning" : "success"}
      />

      <ModeBoundary
        title="מה קורה בלחיצה"
        items={[
          { label: "סרוק עכשיו", description: "מרענן התראות לפי נתוני המערכת. לא מתקן אתרים בעצמו.", tone: "info" },
          { label: "בטיפול", description: "מסמן ownership בלבד כדי שאחרים ידעו שמישהו מטפל.", tone: "success" },
          { label: "פתח מסך", description: "מעביר למסך שבו מתקנים: Jobs, Backups, Health או Diagnostics.", tone: "neutral" },
          { label: "סגירה", description: "תקרה אחרי שהסריקה מזהה שהבעיה נפתרה או עודכנה.", tone: "warning" }
        ]}
      />

      {message ? <div className="badge badge-success px-3 py-2">{message}</div> : null}
      {loading ? <LoadingState /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !error ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard variant="inline" title="חדשות ל־triage" value={formatNumber(activeAlerts)} icon={<BellRing size={18} />} description="עדיין ללא owner" tone={activeAlerts ? "danger" : "success"} helpKey="monitoring.alert" />
            <KpiCard variant="inline" title="בטיפול" value={formatNumber(acknowledgedAlerts)} icon={<CheckCircle2 size={18} />} description="acknowledged incidents" tone={acknowledgedAlerts ? "warning" : "neutral"} helpKey="alert.status" />
            <KpiCard variant="inline" title="קריטיות" value={formatNumber(criticalAlerts)} icon={<ShieldAlert size={18} />} description="severity=critical" tone={criticalAlerts ? "danger" : "success"} helpKey="alert.severity" />
            <KpiCard variant="inline" title="Jobs שנכשלו" value={formatNumber(failedJobs)} icon={<AlertTriangle size={18} />} description={`${formatNumber(staleBackups)} stale backups`} tone={failedJobs || staleBackups ? "warning" : "success"} helpKey="job.failed" />
          </div>

          <SectionCard title="סיכום טיפול" subtitle="החלטה מהירה לפני כניסה לפרטים" helpKey="monitoring.alert">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="soft-panel p-4">
                <p className="field-label">עדיפות</p>
                <p className="font-bold" style={{ color: criticalAlerts || activeAlerts ? "var(--danger)" : "var(--success)" }}>
                  {criticalAlerts ? "לטפל קודם בקריטיים" : activeAlerts ? "לסמן אחראי" : "אין טיפול מידי"}
                </p>
              </div>
              <div className="soft-panel p-4">
                <p className="field-label">פעולה מומלצת ראשונה</p>
                <p className="font-bold" style={{ color: "var(--text-strong)" }}>
                  {failedJobs ? "פתח תור פעולות" : staleBackups ? "פתח מרכז גיבוי ושחזור" : criticalAlerts ? "פתח בדיקות תקינות" : "סרוק או המשך מעקב"}
                </p>
              </div>
              <div className="soft-panel p-4">
                <p className="field-label">עודכן לאחרונה</p>
                <p className="num font-bold" style={{ color: "var(--text-strong)" }}>{formatDateTime(summary?.generatedAt)}</p>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="תור אירועים"
            subtitle={summary?.generatedAt ? `עודכן: ${formatDateTime(summary.generatedAt)} · ${formatNumber(summary.counts.open)} אירועים פתוחים` : "רשימת אירועים תפעוליים"}
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
              <EmptyState
                title={statusFilter === "open" ? "אין incidents פתוחים" : "אין incidents בסינון הנוכחי"}
                description={statusFilter === "open"
                  ? "אין כרגע כשלי Jobs, גיבויים שהתיישנו או health checks פתוחים. אפשר להריץ סריקה ידנית כדי לוודא שהמצב עדכני."
                  : "שנו סטטוס, severity או category כדי לראות incidents אחרים."}
              />
            ) : (
              <DataTable columns={alertColumns} rows={alerts} rowKey={(alert) => alert._id} mobileCard={alertMobileCard} minWidth={1120} density="dense" />
            )}
          </SectionCard>
        </>
      ) : null}

      <DetailsDrawer open={Boolean(selectedAlert)} title={selectedAlert?.message || "התראה"} subtitle={selectedAlert?._id} onClose={() => setSelectedAlert(null)}>
        {selectedAlert ? (
          <div className="space-y-4">
            {(() => {
              const target = incidentTarget(selectedAlert);
              const sla = incidentSlaState(selectedAlert);
              return (
                <div className="rounded-lg border p-4" style={{ background: "var(--surface-muted)", borderColor: "var(--border)" }}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="field-label">Incident response</p>
                      <p className="mt-1 font-bold" style={{ color: "var(--text-strong)" }}>{categoryLabel[selectedAlert.category] || selectedAlert.category}</p>
                    </div>
                    <span className={`badge ${sla.className}`}>{sla.label}</span>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div>
                      <span className="field-label">Owner</span>
                      <p className="font-bold" style={{ color: "var(--text-strong)" }}>{incidentOwner(selectedAlert)}</p>
                    </div>
                    <div>
                      <span className="field-label">Age</span>
                      <p className="num font-bold" style={{ color: "var(--text-strong)" }}>{incidentAgeLabel(selectedAlert)}</p>
                    </div>
                    <div className="sm:col-span-2">
                      <span className="field-label">Recommended workspace</span>
                      <a className="mt-1 inline-flex items-center gap-1 text-sm font-bold" href={target.href} style={{ color: "var(--accent)" }}>
                        {target.label}
                        <ArrowUpRight size={14} />
                      </a>
                    </div>
                  </div>
                </div>
              );
            })()}
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
            <AdvancedDetails title="Raw alert payload" description="JSON מלא לצוות טכני">
              <pre className="mt-3 overflow-x-auto text-xs">{JSON.stringify(selectedAlert, null, 2)}</pre>
            </AdvancedDetails>
          </div>
        ) : null}
      </DetailsDrawer>
    </div>
  );
}
