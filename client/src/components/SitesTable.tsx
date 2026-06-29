import { ArchiveRestore, Archive, Edit3, ExternalLink, Eye, FolderOpen, Trash2 } from "lucide-react";
import { Site } from "../types/site";
import { formatDateTime, formatMb } from "../utils/format";
import { DataTable } from "./DataTable";
import { HealthBadge } from "./HealthBadge";
import { StatusBadge } from "./StatusBadge";
import { VersionBadge } from "./VersionBadge";

const storageLabel = (backend?: Site["storageBackend"]) =>
  backend === "mongo" ? "Mongo" : backend === "txt" ? "TXT" : "Unknown";

const storageBadgeClass = (backend?: Site["storageBackend"]) =>
  backend === "mongo" ? "badge-info" : backend === "txt" ? "badge-success" : "badge-neutral";

const compactStatus = (value?: string) => value || "unknown";

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
      minWidth={1080}
      density="dense"
      rows={sites}
      rowKey={(site) => site._id}
      columns={[
        {
          key: "site",
          header: "אתר",
          render: (site: Site) => (
            <div className="min-w-[220px]">
              <button className="text-right text-sm font-bold hover:underline" style={{ color: "var(--text-strong)" }} onClick={() => onDetails(site._id)} type="button">
                {site.displayName}
              </button>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="num text-xs muted">{site.siteCode}</span>
                <span className={`badge ${storageBadgeClass(site.storageBackend)}`}>{storageLabel(site.storageBackend)}</span>
                <span className="text-xs subtle">{site.unitName || "ללא יחידה"}</span>
              </div>
            </div>
          )
        },
        { key: "status", header: "סטטוס", helpKey: "job.status", render: (site: Site) => <StatusBadge status={site.status} /> },
        { key: "health", header: "תקינות", helpKey: "health", render: (site: Site) => <HealthBadge status={site.derivedHealthStatus || "unknown"} /> },
        {
          key: "backend",
          header: "אחסון",
          render: (site: Site) => (
            <div className="min-w-[160px] space-y-1 text-xs">
              <span className={`badge ${storageBadgeClass(site.storageBackend)}`}>{storageLabel(site.storageBackend)}</span>
              <p className="muted">Runtime: <span className="num">{compactStatus(site.runtimeConfigStatus?.readStatus)}</span></p>
              <p className="muted">Data: <span className="num">{compactStatus(site.dataBackendStatus)}</span></p>
              {site.storageBackend === "mongo" ? <p className="muted">Seed: <span className="num">{compactStatus(site.mongoBackendStatus?.seedStatus)}</span></p> : null}
            </div>
          )
        },
        {
          key: "version",
          header: "גרסה",
          helpKey: "version.current",
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
          render: (site: Site) => (
            <div className="min-w-[170px]">
              <p className="text-sm">{site.ownerName || "-"}</p>
              <p className="num text-xs muted">{site.ownerPersonalNumber || site.ownerEmail || ""}</p>
            </div>
          )
        },
        { key: "updated", header: "עדכון אחרון", helpKey: "history", render: (site: Site) => <span className="num text-xs">{formatDateTime(site.updatedAt || site.lastHealthCheckAt)}</span> },
        { key: "storage", header: "נפח", helpKey: "storage", render: (site: Site) => <span className="num">{formatMb(site.storageMb)}</span> },
        {
          key: "actions",
          header: "פעולות",
          helpKey: "operations",
          render: (site: Site) => (
            <div className="flex flex-wrap gap-1.5">
              <a className="icon-btn" href={site.finalAppUrl || site.resolvedPaths?.finalAppUrl || site.sharePointSiteUrl} target="_blank" rel="noreferrer" title="פתח אתר סופי" aria-label="פתח אתר סופי">
                <ExternalLink size={15} />
              </a>
              <a className="icon-btn" href={site.sharePointSiteUrl || site.resolvedPaths?.sharePointSiteUrl} target="_blank" rel="noreferrer" title="פתח SharePoint" aria-label="פתח SharePoint">
                <FolderOpen size={15} />
              </a>
              <button className="icon-btn" onClick={() => onDetails(site._id)} title="פרטים" aria-label="פרטים" type="button"><Eye size={15} /></button>
              <button className="icon-btn" onClick={() => onEdit(site)} title="עריכה" aria-label="עריכה" type="button"><Edit3 size={15} /></button>
              {site.status === "archived" ? (
                <>
                  {onRestore ? <button className="icon-btn" onClick={() => onRestore(site)} title="שחזר מארכיון" aria-label="שחזר מארכיון" type="button"><ArchiveRestore size={15} /></button> : null}
                  {onPermanentDelete ? <button className="icon-btn" onClick={() => onPermanentDelete(site)} title="מחיקה קבועה" aria-label="מחיקה קבועה" type="button"><Trash2 size={15} /></button> : null}
                </>
              ) : (
                <button className="icon-btn" onClick={() => onArchive(site)} title="העבר לארכיון" aria-label="העבר לארכיון" type="button"><Archive size={15} /></button>
              )}
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
          <div className="flex flex-wrap gap-1.5">
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
