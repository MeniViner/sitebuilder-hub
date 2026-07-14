import { LiveAdminSourcesResult } from "../api/sitesApi";
import type { StorageBackend } from "../types/site";
import { formatDateTime, formatNumber } from "../utils/format";
import { DataTable } from "./DataTable";

export type AdminSource = "txt" | "siteCollection" | "ownersGroup";

type AdminSourceStatus = LiveAdminSourcesResult["sourceStatus"][number];

const sourceLabels: Record<AdminSource, string> = {
  txt: "מנהלי TXT",
  siteCollection: "מנהלי Site Collection",
  ownersGroup: "קבוצת Owners"
};

const sources: AdminSource[] = ["txt", "siteCollection", "ownersGroup"];

const sourceRows = (data: any, source: AdminSource) => {
  if (!data) return [];
  if (source === "txt") return data.txtAdmins || [];
  if (source === "siteCollection") return data.siteCollectionAdmins || [];
  return data.ownersGroupAdmins || [];
};

const sourceStatus = (data: any, source: AdminSource): AdminSourceStatus | undefined =>
  (data?.sourceStatus || data?.adminSourceStatus || data?.latestSnapshot?.sourceStatus || []).find((item: AdminSourceStatus) => item.source === source);

const isSkipped = (status?: AdminSourceStatus) => status?.status === "skipped";
const isFailed = (status?: AdminSourceStatus) => !isSkipped(status) && (status?.ok === false || status?.status === "failed");
const isSucceeded = (status?: AdminSourceStatus) => status?.ok === true || status?.status === "success";

const sourceDescription = (liveData?: LiveAdminSourcesResult | null, data?: any) => {
  if (liveData) return "נמשך מ־SharePoint דרך הדפדפן";
  if (data?.latestSnapshot || data?.lastAdminSyncAt || data?.lastAdminLiveReadAt) return "Snapshot · נשמר ב־Mongo";
  return "לא נקרא עדיין";
};

const statusLabel = (status?: AdminSourceStatus) => {
  if (!status) return "לא נקרא עדיין";
  if (isSkipped(status)) return "לא רלוונטי";
  if (isSucceeded(status)) return "הצליח";
  if (isFailed(status)) return "הקריאה נכשלה";
  return "לא נקרא עדיין";
};

const statusBadge = (status?: AdminSourceStatus) => {
  if (isSucceeded(status)) return "badge-success";
  if (isFailed(status)) return "badge-danger";
  return "badge-neutral";
};

const skippedDescription = (_status?: AdminSourceStatus) =>
  "המקור הזה לא רלוונטי לסוג האחסון של האתר.";

const sourceTypeLabel = (source: AdminSource | "unique") => {
  if (source === "unique") return "מקור מאוחד";
  if (source === "txt") return "מקור TXT";
  if (source === "siteCollection") return "גישה לאירוח SharePoint";
  return "גישה לאירוח SharePoint";
};

const authorityLabel = (source: AdminSource | "unique", storageBackend?: StorageBackend) => {
  if (source === "unique") {
    if (storageBackend === "mongo") return "מקור אמת לאפליקציה כאשר Builder/Mongo מסונכרן";
    if (storageBackend === "txt") return "מקור מנהלי אפליקציה מאוחד";
    return "דורש זיהוי מקור נתונים";
  }
  if (source === "txt") {
    if (storageBackend === "mongo") return "לא רלוונטי לאתר Mongo";
    if (storageBackend === "txt") return "מקור אמת לאפליקציה";
    return "דורש זיהוי מקור נתונים";
  }
  return "גישה לאירוח בלבד";
};

const relevanceLabel = (source: AdminSource | "unique", storageBackend?: StorageBackend, status?: AdminSourceStatus) => {
  if (isSkipped(status)) return "לא רלוונטי";
  if (source === "txt" && storageBackend === "mongo") return "לא רלוונטי לאתר Mongo";
  if (storageBackend === "unknown") return "תלוי בזיהוי מקור";
  return "רלוונטי";
};

export function AdminSourceSummaryCards({
  adminData,
  liveData,
  siteLabel,
  storageBackend = "unknown"
}: {
  adminData?: any;
  liveData?: LiveAdminSourcesResult | null;
  siteLabel?: string;
  variant?: "compact" | "inline";
  storageBackend?: StorageBackend;
}) {
  const data = liveData || adminData;
  const origin = sourceDescription(liveData, adminData);
  const uniqueCount = liveData?.adminsCount ?? adminData?.adminsCount ?? 0;
  const capturedAt = liveData?.capturedAt || adminData?.lastAdminLiveReadAt || adminData?.lastAdminSyncAt || adminData?.latestSnapshot?.capturedAt;
  const rows = [
    {
      key: "unique",
      source: "מנהלים ייחודיים",
      sourceType: sourceTypeLabel("unique"),
      authority: authorityLabel("unique", storageBackend),
      status: uniqueCount ? "תקין" : data ? "לא נמצאו רשומות" : "לא נקרא",
      badge: uniqueCount ? "badge-success" : data ? "badge-neutral" : "badge-warning",
      count: uniqueCount,
      updatedAt: capturedAt,
      relevant: relevanceLabel("unique", storageBackend),
      detail: siteLabel || origin
    },
    ...sources.map((source) => {
      const status = sourceStatus(data, source);
      const failed = isFailed(status);
      const skipped = isSkipped(status);
      const rows = sourceRows(data, source);
      const count = isSucceeded(status) ? status?.count ?? status?.normalizedCount ?? rows.length : rows.length;
      return {
        key: source,
        source: sourceLabels[source],
        sourceType: sourceTypeLabel(source),
        authority: authorityLabel(source, storageBackend),
        status: statusLabel(status),
        badge: statusBadge(status),
        count: failed || skipped ? undefined : count,
        updatedAt: (status as any)?.checkedAt || (status as any)?.capturedAt || capturedAt,
        relevant: relevanceLabel(source, storageBackend, status),
        detail: failed
          ? status?.errorMessage || status?.error || "הקריאה נכשלה"
          : skipped
            ? skippedDescription(status)
            : origin,
        url: status?.sourceUrl
      };
    })
  ];

  return (
    <DataTable
      columns={[
        { key: "source", header: "מקור", helpKey: "site.admins", render: (row) => <span className="font-bold">{row.source}</span> },
        { key: "sourceType", header: "סוג מקור", helpKey: "site.admins" },
        { key: "authority", header: "סמכות", helpKey: "site.admins", render: (row) => <span className="block max-w-[220px] truncate" title={row.authority}>{row.authority}</span> },
        { key: "status", header: "סטטוס קריאה", helpKey: "sharepoint.read", render: (row) => <span className={`badge ${row.badge}`}>{row.status}</span> },
        { key: "count", header: "כמות", helpKey: "site.admins", render: (row) => <span className="num">{typeof row.count === "number" ? formatNumber(row.count) : "-"}</span> },
        { key: "updatedAt", header: "עודכן לאחרונה", helpKey: "history", render: (row) => <span className="num text-xs">{formatDateTime(row.updatedAt)}</span> },
        { key: "relevant", header: "רלוונטיות", helpKey: "site.admins", render: (row) => <span className="block max-w-[190px] truncate" title={row.relevant}>{row.relevant}</span> },
        {
          key: "action",
          header: "פרטים",
          helpKey: "diagnostics",
          render: (row) => (
            <details className="admin-source-row-details">
              <summary>פרטים</summary>
              <div>
                <p>{row.detail || "אין פרטים נוספים"}</p>
                {row.url ? <code className="num" title={row.url}>{row.url}</code> : null}
              </div>
            </details>
          )
        }
      ]}
      rows={rows}
      rowKey={(row) => row.key}
      minWidth={1120}
      density="dense"
    />
  );
}

export function AdminSourceStatusTable({ data }: { data?: LiveAdminSourcesResult | any | null }) {
  const statuses = data?.sourceStatus || data?.adminSourceStatus || data?.latestSnapshot?.sourceStatus || [];
  if (!statuses.length) return null;

  return (
    <DataTable columns={[
      { header: "מקור", helpKey: "site.admins" },
      { header: "סטטוס", helpKey: "sharepoint.read" },
      { header: "כמות", helpKey: "site.admins" },
      { header: "עודכן", helpKey: "history" },
      { header: "רלוונטיות", helpKey: "site.admins" },
      { header: "פרטים", helpKey: "diagnostics" }
    ]} minWidth={860} density="dense">
      {statuses.map((status: AdminSourceStatus) => (
        <tr key={status.source}>
          <td>{sourceLabels[status.source]}</td>
          <td><span className={`badge ${statusBadge(status)}`}>{statusLabel(status)}</span></td>
          <td className="num">{isSucceeded(status) ? formatNumber(status.count ?? status.normalizedCount ?? 0) : "-"}</td>
          <td className="num text-xs">{formatDateTime((status as any).checkedAt || (status as any).capturedAt || data?.capturedAt || data?.latestSnapshot?.capturedAt)}</td>
          <td>{isSkipped(status) ? "לא רלוונטי" : "רלוונטי לקריאה"}</td>
          <td>
            <details className="admin-source-row-details">
              <summary>פרטים</summary>
              <div>
                {status.httpStatus ? <p className="num">HTTP {status.httpStatus} {status.httpStatusText || ""}</p> : null}
                {status.sourceUrl ? <code className="num" title={status.sourceUrl}>{status.sourceUrl}</code> : null}
                <p>{isSkipped(status) ? skippedDescription(status) : status.errorMessage || status.error || "אין פרטים חריגים"}</p>
              </div>
            </details>
          </td>
        </tr>
      ))}
    </DataTable>
  );
}

export function AdminSourceLists({
  adminData,
  liveData,
  onRemove,
  limit
}: {
  adminData?: any;
  liveData?: LiveAdminSourcesResult | null;
  onRemove?: (row: any, source: AdminSource) => void;
  limit?: number;
}) {
  const data = liveData || adminData;
  return (
    <div className="grid gap-5 xl:grid-cols-3">
      {sources.map((source) => {
        const status = sourceStatus(data, source);
        const rows = sourceRows(data, source);
        const displayedRows = typeof limit === "number" ? rows.slice(0, limit) : rows;
        return (
          <div key={source} className="soft-panel p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="font-bold" style={{ color: "var(--text-strong)" }}>{sourceLabels[source]}</h3>
              <span className={`badge ${statusBadge(status)}`}>
                {isFailed(status) ? "הקריאה נכשלה" : isSkipped(status) ? "לא רלוונטי" : isSucceeded(status) ? formatNumber(status?.count ?? rows.length) : rows.length ? formatNumber(rows.length) : "לא נקרא עדיין"}
              </span>
            </div>
            <div className="space-y-2">
              {isFailed(status) ? (
                <details className="admin-source-row-details">
                  <summary>הקריאה נכשלה · פרטים</summary>
                  <p>{status?.errorMessage || status?.error || "הקריאה נכשלה"}</p>
                </details>
              ) : isSkipped(status) ? (
                <p className="text-sm muted">{skippedDescription(status)}</p>
              ) : rows.length === 0 ? (
                <p className="text-sm muted">אין רשומות</p>
              ) : displayedRows.map((row: any, index: number) => (
                <div key={`${source}-${index}-${row.loginName || row.email || row.personalNumber}`} className="rounded-md border p-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                  <p className="font-bold" style={{ color: "var(--text-strong)" }}>{row.displayName || "-"}</p>
                  <p className="num mt-1 text-xs muted">{row.personalNumber || row.email || row.loginName || "-"}</p>
                  {onRemove ? <button className="btn btn-danger mt-2 min-h-0 px-2 py-1 text-xs" onClick={() => onRemove(row, source)} type="button">בקשת הסרה</button> : null}
                </div>
              ))}
              {limit && rows.length > limit ? <p className="text-xs muted">מוצגות {formatNumber(limit)} מתוך {formatNumber(rows.length)}</p> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function AdminLiveReadMeta({ liveData, adminData }: { liveData?: LiveAdminSourcesResult | null; adminData?: any }) {
  const capturedAt = liveData?.capturedAt || adminData?.lastAdminLiveReadAt || adminData?.lastAdminSyncAt || adminData?.latestSnapshot?.capturedAt;
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <div className="soft-panel p-3">
        <p className="text-xs font-bold muted">מקור</p>
        <p className="text-sm">{liveData ? "נמשך מ־SharePoint דרך הדפדפן" : "Snapshot"}</p>
      </div>
      <div className="soft-panel p-3">
        <p className="text-xs font-bold muted">שמירה</p>
        <p className="text-sm">נשמר ב־Mongo</p>
      </div>
      <div className="soft-panel p-3">
        <p className="text-xs font-bold muted">נלכד</p>
        <p className="num text-sm">{formatDateTime(capturedAt)}</p>
      </div>
    </div>
  );
}
