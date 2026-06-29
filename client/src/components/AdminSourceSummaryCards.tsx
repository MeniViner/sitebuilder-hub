import { Users } from "lucide-react";
import { LiveAdminSourcesResult } from "../api/sitesApi";
import { formatDateTime, formatNumber } from "../utils/format";
import { DataTable } from "./DataTable";
import { KpiCard } from "./KpiCard";

export type AdminSource = "txt" | "siteCollection" | "ownersGroup";

type AdminSourceStatus = LiveAdminSourcesResult["sourceStatus"][number];

const sourceLabels: Record<AdminSource, string> = {
  txt: "TXT admins",
  siteCollection: "Site Collection",
  ownersGroup: "Owners Group"
};

const sourceHelpKeys: Record<AdminSource, string> = {
  txt: "site.txtAdmins",
  siteCollection: "site.siteCollectionAdmins",
  ownersGroup: "site.ownersGroup"
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

const isFailed = (status?: AdminSourceStatus) => status?.ok === false || status?.status === "failed";
const isSucceeded = (status?: AdminSourceStatus) => status?.ok === true || status?.status === "success";

const sourceDescription = (liveData?: LiveAdminSourcesResult | null, data?: any) => {
  if (liveData) return "נמשך מ־SharePoint דרך הדפדפן";
  if (data?.latestSnapshot || data?.lastAdminSyncAt || data?.lastAdminLiveReadAt) return "Snapshot · נשמר ב־Mongo";
  return "לא נקרא עדיין";
};

const statusLabel = (status?: AdminSourceStatus) => {
  if (!status) return "לא נקרא עדיין";
  if (isSucceeded(status)) return "הצליח";
  if (isFailed(status)) return "הקריאה נכשלה";
  return "לא נקרא עדיין";
};

const statusBadge = (status?: AdminSourceStatus) => {
  if (isSucceeded(status)) return "badge-success";
  if (isFailed(status)) return "badge-danger";
  return "badge-neutral";
};

export function AdminSourceSummaryCards({
  adminData,
  liveData,
  siteLabel,
  variant = "compact"
}: {
  adminData?: any;
  liveData?: LiveAdminSourcesResult | null;
  siteLabel?: string;
  variant?: "compact" | "inline";
}) {
  const data = liveData || adminData;
  const origin = sourceDescription(liveData, adminData);
  const uniqueCount = liveData?.adminsCount ?? adminData?.adminsCount ?? 0;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        title="מנהלים ייחודיים"
        value={formatNumber(uniqueCount)}
        icon={<Users size={18} />}
        description={liveData ? "נמשך מ־SharePoint דרך הדפדפן" : siteLabel || origin}
        tone="info"
        variant={variant}
        helpKey="site.admins"
      />
      {sources.map((source) => {
        const status = sourceStatus(data, source);
        const failed = isFailed(status);
        const rows = sourceRows(data, source);
        const value = failed
          ? "הקריאה נכשלה"
          : isSucceeded(status)
            ? formatNumber(status?.count ?? rows.length)
            : rows.length
              ? formatNumber(rows.length)
              : "לא נקרא עדיין";
        return (
          <KpiCard
            key={source}
            title={sourceLabels[source]}
            value={value}
            icon={<Users size={18} />}
            description={failed ? status?.errorMessage || status?.error || origin : origin}
            tone={failed ? "danger" : isSucceeded(status) ? "success" : "neutral"}
            variant={variant}
            helpKey={sourceHelpKeys[source]}
          />
        );
      })}
    </div>
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
      { header: "HTTP", helpKey: "sharepoint.read" },
      { header: "URL", helpKey: "sharepoint.read" },
      { header: "שגיאה", helpKey: "diagnostics" }
    ]} minWidth={980}>
      {statuses.map((status: AdminSourceStatus) => (
        <tr key={status.source}>
          <td>{sourceLabels[status.source]}</td>
          <td><span className={`badge ${statusBadge(status)}`}>{statusLabel(status)}</span></td>
          <td className="num">{isSucceeded(status) ? formatNumber(status.count ?? status.normalizedCount ?? 0) : "-"}</td>
          <td className="num">{status.httpStatus ? `${status.httpStatus} ${status.httpStatusText || ""}` : "-"}</td>
          <td><code className="num block max-w-[280px] truncate text-xs muted" title={status.sourceUrl}>{status.sourceUrl || "-"}</code></td>
          <td className="text-xs muted">{status.errorMessage || status.error || "-"}</td>
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
                {isFailed(status) ? "הקריאה נכשלה" : isSucceeded(status) ? formatNumber(status?.count ?? rows.length) : rows.length ? formatNumber(rows.length) : "לא נקרא עדיין"}
              </span>
            </div>
            <div className="space-y-2">
              {isFailed(status) ? (
                <p className="text-sm muted">{status?.errorMessage || status?.error || "הקריאה נכשלה"}</p>
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
