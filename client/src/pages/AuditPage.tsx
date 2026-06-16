import { useEffect, useMemo, useState } from "react";
import { Download, Eye, FileClock, RefreshCcw, Search, SlidersHorizontal } from "lucide-react";
import { AuditLogRow, AuditQuery, AuditReport, sitesApi } from "../api/sitesApi";
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

type AuditFilters = {
  action: string;
  result: "all" | "success" | "failure";
  entityType: string;
  entityId: string;
  actor: string;
  search: string;
  from: string;
  to: string;
  limit: number;
};

const defaultFilters: AuditFilters = {
  action: "",
  result: "all",
  entityType: "",
  entityId: "",
  actor: "",
  search: "",
  from: "",
  to: "",
  limit: 500
};

function buildQuery(filters: AuditFilters): AuditQuery {
  return {
    action: filters.action.trim(),
    result: filters.result,
    entityType: filters.entityType.trim(),
    entityId: filters.entityId.trim(),
    actor: filters.actor.trim(),
    search: filters.search.trim(),
    from: filters.from,
    to: filters.to,
    limit: filters.limit
  };
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

const countByKey = (items: Array<{ key: string; count: number }> | undefined, key: string) =>
  Number(items?.find((item) => item.key === key)?.count || 0);

export function AuditPage() {
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [report, setReport] = useState<AuditReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [filters, setFilters] = useState<AuditFilters>(defaultFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<AuditLogRow | null>(null);

  const query = useMemo(() => buildQuery(filters), [filters]);

  const load = async () => {
    setLoading(true);
    setError("");
    clientLogger.info("audit", "Audit report load started", query as Record<string, unknown>);
    try {
      const [rowsRes, reportRes] = await Promise.all([
        sitesApi.audit(query),
        sitesApi.auditReport(query)
      ]);
      setRows(rowsRes.data);
      setReport(reportRes.data);
      clientLogger.info("audit", "Audit report load completed", {
        rows: rowsRes.data.length,
        totalRows: reportRes.data.totalMatchingRows,
        failures: countByKey(reportRes.data.summary.byResult, "failure")
      });
    } catch (err) {
      clientLogger.error("audit", "Audit report load failed", { error: err });
      setError(err instanceof Error ? err.message : "שגיאה בטעינת יומן פעולות");
    } finally {
      setLoading(false);
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    setError("");
    setMessage("");
    clientLogger.info("audit", "Audit CSV export started", query as Record<string, unknown>);
    try {
      const result = await sitesApi.auditExport({ ...query, format: "csv" });
      downloadBlob(result.blob, result.filename);
      setMessage("קובץ Audit CSV נוצר בהצלחה");
      clientLogger.info("audit", "Audit CSV export completed", {
        filename: result.filename,
        contentType: result.contentType
      });
    } catch (err) {
      clientLogger.error("audit", "Audit CSV export failed", { error: err });
      setError(err instanceof Error ? err.message : "שגיאה בייצוא Audit");
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const totalRows = report?.totalMatchingRows ?? rows.length;
  const successRows = countByKey(report?.summary.byResult, "success") || rows.filter((row) => row.result === "success").length;
  const failureRows = countByKey(report?.summary.byResult, "failure") || rows.filter((row) => row.result === "failure").length;
  const actionTypes = report?.summary.byAction.length ?? new Set(rows.map((row) => row.action).filter(Boolean)).size;
  const recentFailures = rows.filter((row) => row.result === "failure").slice(0, 5);
  const activeFilterCount = [
    filters.action,
    filters.result !== "all" ? filters.result : "",
    filters.entityType,
    filters.entityId,
    filters.actor,
    filters.search,
    filters.from,
    filters.to,
    filters.limit !== defaultFilters.limit ? String(filters.limit) : ""
  ].filter(Boolean).length;
  const auditColumns: DataTableColumn<AuditLogRow>[] = [
    {
      key: "action",
      header: "Action",
      helpKey: "audit",
      render: (row) => row.action
    },
    {
      key: "entity",
      header: "Entity",
      helpKey: "audit.evidence",
      render: (row) => (
        <div>
          {row.entityType}
          <span className="num block text-xs muted">{row.entityId || ""}</span>
        </div>
      )
    },
    {
      key: "result",
      header: "Result",
      helpKey: "job.status",
      render: (row) => <span className={`badge ${row.result === "failure" ? "badge-danger" : "badge-success"}`}>{row.result === "failure" ? "כשלון" : "הצלחה"}</span>
    },
    {
      key: "actor",
      header: "Actor",
      helpKey: "sharepoint.currentUser",
      render: (row) => row.actor?.userName || row.actor?.userId || "system"
    },
    {
      key: "date",
      header: "Date",
      helpKey: "history",
      render: (row) => <span className="num text-xs">{formatDateTime(row.createdAt)}</span>
    },
    {
      key: "request",
      header: "Request ID",
      helpKey: "audit.evidence",
      render: (row) => <span className="num text-xs muted">{row.requestId || "-"}</span>
    },
    {
      key: "details",
      header: "פרטים",
      helpKey: "audit.evidence",
      render: (row) => <button className="btn btn-secondary min-h-0 px-2 py-1 text-xs" onClick={() => setSelectedRow(row)} type="button"><Eye size={13} />פתח</button>
    }
  ];

  const auditMobileCard = (row: AuditLogRow) => (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-bold" style={{ color: "var(--text-strong)" }}>{row.action}</p>
          <p className="text-xs muted">{row.entityType}<span className="num"> {row.entityId || ""}</span></p>
        </div>
        <span className={`badge ${row.result === "failure" ? "badge-danger" : "badge-success"}`}>{row.result === "failure" ? "כשלון" : "הצלחה"}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <span className="muted">Actor: {row.actor?.userName || row.actor?.userId || "system"}</span>
        <span className="num muted">{formatDateTime(row.createdAt)}</span>
      </div>
      <button className="btn btn-secondary min-h-0 px-2 py-1 text-xs" onClick={() => setSelectedRow(row)} type="button"><Eye size={13} />פתח פרטים</button>
    </div>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="יומן פעולות"
        subtitle="Audit log מסונן, דוח מסכם וייצוא CSV לפעולות Hub."
        helpKey="audit"
        actions={<MetadataOnlyBadge mode="metadata" />}
      />

      {message ? <div className="badge badge-success px-3 py-2">{message}</div> : null}
      {loading ? <LoadingState /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !error ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard variant="inline" title="רשומות" value={formatNumber(totalRows)} icon={<FileClock size={18} />} description="לפי הסינון הנוכחי" tone="info" helpKey="audit" />
            <KpiCard variant="inline" title="הצלחות" value={formatNumber(successRows)} icon={<FileClock size={18} />} description="result=success" tone="success" helpKey="audit" />
            <KpiCard variant="inline" title="כשלונות" value={formatNumber(failureRows)} icon={<FileClock size={18} />} description="result=failure" tone={failureRows ? "danger" : "success"} helpKey="diagnostics" />
            <KpiCard variant="inline" title="פעולות שונות" value={formatNumber(actionTypes)} icon={<FileClock size={18} />} description="action types" tone="neutral" helpKey="operations" />
          </div>

          <SectionCard
            title="דוח וסינון Audit"
            subtitle={report?.generatedAt ? `דוח נוצר: ${formatDateTime(report.generatedAt)}` : "סינון שרת וייצוא"}
            helpKey="audit"
            actions={
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-secondary" onClick={load} type="button"><RefreshCcw size={15} />רענן</button>
                <button className="btn btn-primary" onClick={exportCsv} type="button" disabled={exporting}><Download size={15} />{exporting ? "מייצא..." : "ייצוא CSV"}</button>
              </div>
            }
          >
            <div className="toolbar">
              <div className="toolbar-main md:grid-cols-[minmax(0,1fr)_12rem]">
                <label className="block">
                  <span className="field-label"><HelpLabel helpKey="search">Search</HelpLabel></span>
                  <input className="control" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="חיפוש חופשי ביומן" />
                </label>
                <label className="block">
                  <span className="field-label"><HelpLabel helpKey="filters">Result</HelpLabel></span>
                  <select className="control" value={filters.result} onChange={(event) => setFilters((current) => ({ ...current, result: event.target.value as AuditFilters["result"] }))}>
                    <option value="all">כל התוצאות</option>
                    <option value="success">הצלחה</option>
                    <option value="failure">כשלון</option>
                  </select>
                </label>
              </div>
              <div className="toolbar-actions">
                <button className="btn btn-primary" type="button" onClick={load}><Search size={15} />חפש</button>
                <button className="btn btn-secondary" type="button" onClick={() => setFiltersOpen(true)}>
                  <SlidersHorizontal size={15} />
                  מסננים{activeFilterCount ? ` (${activeFilterCount})` : ""}
                </button>
                <button className="btn btn-secondary" type="button" onClick={() => setFilters(defaultFilters)}>איפוס</button>
              </div>
            </div>

            {report ? (
              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                <div className="soft-panel p-4">
                  <p className="field-label"><HelpLabel helpKey="operations">Top actions</HelpLabel></p>
                  <div className="mt-2 space-y-2">
                    {report.summary.byAction.slice(0, 5).map((item) => (
                      <div key={item.key} className="flex items-center justify-between gap-3 text-sm">
                        <span className="truncate">{item.key}</span>
                        <span className="num font-bold">{formatNumber(item.count)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="soft-panel p-4">
                  <p className="field-label"><HelpLabel helpKey="audit.evidence">Top entities</HelpLabel></p>
                  <div className="mt-2 space-y-2">
                    {report.summary.byEntityType.slice(0, 5).map((item) => (
                      <div key={item.key} className="flex items-center justify-between gap-3 text-sm">
                        <span className="truncate">{item.key}</span>
                        <span className="num font-bold">{formatNumber(item.count)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="soft-panel p-4">
                  <p className="field-label"><HelpLabel helpKey="diagnostics">Recent failures</HelpLabel></p>
                  <div className="mt-2 space-y-2">
                    {recentFailures.map((item) => (
                      <button key={item._id} className="block w-full rounded-md p-2 text-right text-sm hover:bg-[var(--surface-muted)]" type="button" onClick={() => setSelectedRow(item)}>
                        <span className="block truncate font-semibold" style={{ color: "var(--text-strong)" }}>{item.action}</span>
                        <span className="num block text-xs muted">{formatDateTime(item.createdAt)}</span>
                      </button>
                    ))}
                    {recentFailures.length === 0 ? <p className="text-sm muted">אין כשלונות בדוח הנוכחי</p> : null}
                  </div>
                </div>
              </div>
            ) : null}
          </SectionCard>

          <SectionCard title="Audit log" subtitle="רשומות אחרונות לפי הסינון" helpKey="audit">
            {rows.length === 0 ? (
              <EmptyState title="אין רשומות Audit" description="לא נמצאו רשומות לפי הסינון הנוכחי." />
            ) : (
              <DataTable columns={auditColumns} rows={rows} rowKey={(row) => row._id} mobileCard={auditMobileCard} minWidth={1060} density="dense" />
            )}
          </SectionCard>
        </>
      ) : null}

      <DetailsDrawer open={filtersOpen} title="מסנני Audit" subtitle="חיפוש מתקדם לפי פעולה, entity, actor וטווח תאריכים" onClose={() => setFiltersOpen(false)}>
        <FilterBar
          actions={
            <>
              <button className="btn btn-primary" type="button" onClick={() => { setFiltersOpen(false); void load(); }}><Search size={15} />החל מסננים</button>
              <button className="btn btn-secondary" type="button" onClick={() => setFilters(defaultFilters)}>איפוס</button>
            </>
          }
        >
          <label className="block">
            <span className="field-label"><HelpLabel helpKey="operations">Action</HelpLabel></span>
            <input className="control" value={filters.action} onChange={(event) => setFilters((current) => ({ ...current, action: event.target.value }))} placeholder="jobs.failed" />
          </label>
          <label className="block">
            <span className="field-label"><HelpLabel helpKey="audit.evidence">Entity type</HelpLabel></span>
            <input className="control" value={filters.entityType} onChange={(event) => setFilters((current) => ({ ...current, entityType: event.target.value }))} placeholder="Job / Site / Backup" />
          </label>
          <label className="block">
            <span className="field-label"><HelpLabel helpKey="audit.evidence">Entity id</HelpLabel></span>
            <input className="control num" value={filters.entityId} onChange={(event) => setFilters((current) => ({ ...current, entityId: event.target.value }))} />
          </label>
          <label className="block">
            <span className="field-label"><HelpLabel helpKey="sharepoint.currentUser">Actor</HelpLabel></span>
            <input className="control" value={filters.actor} onChange={(event) => setFilters((current) => ({ ...current, actor: event.target.value }))} />
          </label>
          <label className="block">
            <span className="field-label"><HelpLabel helpKey="filters">From</HelpLabel></span>
            <input className="control" type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} />
          </label>
          <label className="block">
            <span className="field-label"><HelpLabel helpKey="filters">To</HelpLabel></span>
            <input className="control" type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} />
          </label>
          <label className="block">
            <span className="field-label"><HelpLabel helpKey="filters">Limit</HelpLabel></span>
            <input className="control num" type="number" min={50} max={500} value={filters.limit} onChange={(event) => setFilters((current) => ({ ...current, limit: Number(event.target.value) || 500 }))} />
          </label>
        </FilterBar>
      </DetailsDrawer>

      <DetailsDrawer open={Boolean(selectedRow)} title={selectedRow?.action || "Audit"} subtitle={selectedRow?._id} onClose={() => setSelectedRow(null)}>
        {selectedRow ? (
          <pre className="overflow-x-auto rounded-lg border p-3 text-xs" style={{ background: "var(--surface-muted)", borderColor: "var(--border)" }}>
            {JSON.stringify(selectedRow, null, 2)}
          </pre>
        ) : null}
      </DetailsDrawer>
    </div>
  );
}
