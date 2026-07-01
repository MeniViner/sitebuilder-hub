import { ArchiveRestore, Archive, Edit3, ExternalLink, Eye, FolderOpen, MoreHorizontal, Trash2 } from "lucide-react";
import { Site } from "../types/site";
import { formatDateTime, formatMb } from "../utils/format";
import { DataTable } from "./DataTable";
import { HealthBadge } from "./HealthBadge";
import { StatusBadge } from "./StatusBadge";
import { VersionBadge } from "./VersionBadge";

const storageLabel = (backend?: Site["storageBackend"]) =>
  backend === "mongo" ? "Backend Mongo" : backend === "txt" ? "קבצי SharePoint" : "לא זוהה";

const storageBadgeClass = (backend?: Site["storageBackend"]) =>
  backend === "mongo" ? "badge-info" : backend === "txt" ? "badge-success" : "badge-neutral";

const backendStatusLabel = (value?: string) => {
  const labels: Record<string, string> = {
    configured: "מוגדר",
    ok: "תקין",
    warning: "אזהרה",
    failed: "נכשל",
    missing: "חסר",
    partial: "חלקי",
    invalid: "לא תקין",
    mismatch: "לא תואם",
    "auth-blocked": "חסום הרשאות",
    error: "שגיאה",
    unknown: "לא נבדק"
  };
  return labels[value || "unknown"] || value || "לא נבדק";
};

const backendStatusTone = (value?: string) => {
  if (value === "configured" || value === "ok") return "site-backend-state-success";
  if (value === "failed" || value === "error") return "site-backend-state-danger";
  if (value === "missing" || value === "partial" || value === "invalid" || value === "mismatch" || value === "auth-blocked" || value === "warning") return "site-backend-state-warning";
  return "site-backend-state-neutral";
};

interface SitesTableProps {
  sites: Site[];
  onEdit: (site: Site) => void;
  onArchive: (site: Site) => void;
  onRestore?: (site: Site) => void;
  onPermanentDelete?: (site: Site) => void;
  onDetails: (id: string) => void;
}

export function SitesTable({ sites, onEdit, onArchive, onRestore, onPermanentDelete, onDetails }: SitesTableProps) {
  return (
    <DataTable
      minWidth={1320}
      density="dense"
      rows={sites}
      rowKey={(site) => site._id}
      columns={[
        {
          key: "site",
          header: "אתר",
          width: "24rem",
          render: (site: Site) => (
            <div className="site-name-cell">
              <button className="site-name-button" onClick={() => onDetails(site._id)} type="button">
                {site.displayName}
              </button>
              <div className="site-meta-row">
                <span className="num text-xs muted">{site.siteCode}</span>
                <span className="text-xs subtle">{site.unitName || "ללא יחידה"}</span>
              </div>
            </div>
          )
        },
        { key: "status", header: "סטטוס", helpKey: "job.status", width: "8rem", align: "center", render: (site: Site) => <StatusBadge status={site.status} /> },
        { key: "health", header: "תקינות", helpKey: "health", width: "8rem", align: "center", render: (site: Site) => <HealthBadge status={site.derivedHealthStatus || "unknown"} /> },
        {
          key: "backend",
          header: "מקור נתונים",
          width: "13rem",
          render: (site: Site) => (
            <div className="site-backend-cell">
              <span className={`badge ${storageBadgeClass(site.storageBackend)}`}>{storageLabel(site.storageBackend)}</span>
              <p>הגדרות: <span className={backendStatusTone(site.runtimeConfigStatus?.readStatus)}>{backendStatusLabel(site.runtimeConfigStatus?.readStatus)}</span></p>
              <p>נתונים: <span className={backendStatusTone(site.dataBackendStatus)}>{backendStatusLabel(site.dataBackendStatus)}</span></p>
              {site.storageBackend === "mongo" ? <p>נתוני התחלה: <span className={backendStatusTone(site.mongoBackendStatus?.seedStatus)}>{backendStatusLabel(site.mongoBackendStatus?.seedStatus)}</span></p> : null}
            </div>
          )
        },
        {
          key: "version",
          header: "גרסה",
          helpKey: "version.current",
          width: "8rem",
          align: "center",
          render: (site: Site) => (
            <div className="space-y-1">
              <span className="num text-sm font-bold">{site.currentVersion || site.version || "-"}</span>
              <VersionBadge status={site.versionStatus || "unknown"} />
            </div>
          )
        },
        {
          key: "owner",
          header: "בעלים",
          helpKey: "site.owner",
          width: "11rem",
          render: (site: Site) => (
            <div className="min-w-[170px]">
              <p className="text-sm">{site.ownerName || "-"}</p>
              <p className="num text-xs muted">{site.ownerPersonalNumber || site.ownerEmail || ""}</p>
            </div>
          )
        },
        { key: "updated", header: "עדכון אחרון", helpKey: "history", width: "9rem", render: (site: Site) => <span className="num text-xs">{formatDateTime(site.updatedAt || site.lastHealthCheckAt)}</span> },
        { key: "storage", header: "נפח", helpKey: "storage", width: "6rem", align: "center", render: (site: Site) => <span className="num">{formatMb(site.storageMb)}</span> },
        {
          key: "actions",
          header: "פעולות",
          helpKey: "operations",
          width: "14rem",
          align: "end",
          render: (site: Site) => (
            <div className="site-row-actions">
              <button className="btn btn-secondary site-row-primary-action" onClick={() => onDetails(site._id)} type="button"><Eye size={14} />פרטים</button>
              <a className="icon-btn" href={site.finalAppUrl || site.resolvedPaths?.finalAppUrl || site.sharePointSiteUrl} target="_blank" rel="noreferrer" title="פתח אתר סופי" aria-label="פתח אתר סופי">
                <ExternalLink size={15} />
              </a>
              <details className="site-row-action-menu">
                <summary className="icon-btn" title="פעולות נוספות" aria-label="פעולות נוספות">
                  <MoreHorizontal size={15} />
                </summary>
                <div className="site-row-action-menu-list">
                  <a href={site.sharePointSiteUrl || site.resolvedPaths?.sharePointSiteUrl} target="_blank" rel="noreferrer">
                    <FolderOpen size={14} />פתח SharePoint
                  </a>
                  <button onClick={() => onEdit(site)} type="button">
                    <Edit3 size={14} />עריכת metadata
                  </button>
                  {site.status === "archived" ? (
                    <>
                      {onRestore ? (
                        <button onClick={() => onRestore(site)} type="button">
                          <ArchiveRestore size={14} />שחזר מארכיון
                        </button>
                      ) : null}
                      {onPermanentDelete ? (
                        <button className="danger" onClick={() => onPermanentDelete(site)} type="button">
                          <Trash2 size={14} />מחיקה קבועה
                        </button>
                      ) : null}
                    </>
                  ) : (
                    <button onClick={() => onArchive(site)} type="button">
                      <Archive size={14} />העבר לארכיון
                    </button>
                  )}
                </div>
              </details>
            </div>
          )
        }
      ]}
      mobileCard={(site: Site) => (
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <button className="text-right text-base font-bold hover:underline" style={{ color: "var(--text-strong)" }} onClick={() => onDetails(site._id)} type="button">
                {site.displayName}
              </button>
              <p className="num mt-1 text-xs muted">{site.siteCode} · {site.unitName || "ללא יחידה"}</p>
            </div>
            <StatusBadge status={site.status} />
          </div>
          <div className="flex flex-wrap gap-2">
            <HealthBadge status={site.derivedHealthStatus || "unknown"} />
            <VersionBadge status={site.versionStatus || "unknown"} />
            <span className={`badge ${storageBadgeClass(site.storageBackend)}`}>{storageLabel(site.storageBackend)}</span>
            <span className="badge badge-neutral num">{site.currentVersion || site.version || "-"}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><span className="field-label">בעלים</span><p>{site.ownerName || "-"}</p></div>
            <div><span className="field-label">עודכן</span><p className="num">{formatDateTime(site.updatedAt || site.lastHealthCheckAt)}</p></div>
          </div>
          <div className="site-mobile-actions">
            <button className="btn btn-primary min-h-0 px-2 py-1 text-xs" onClick={() => onDetails(site._id)} type="button"><Eye size={13} />פרטים</button>
            <button className="btn btn-secondary min-h-0 px-2 py-1 text-xs" onClick={() => onEdit(site)} type="button"><Edit3 size={13} />עריכה</button>
            <a className="btn btn-secondary min-h-0 px-2 py-1 text-xs" href={site.finalAppUrl || site.resolvedPaths?.finalAppUrl || site.sharePointSiteUrl} target="_blank" rel="noreferrer"><ExternalLink size={13} />פתח</a>
            {site.status === "archived" && onRestore ? <button className="btn btn-secondary min-h-0 px-2 py-1 text-xs" onClick={() => onRestore(site)} type="button"><ArchiveRestore size={13} />שחזר</button> : null}
          </div>
        </div>
      )}
    >
    </DataTable>
  );
}
