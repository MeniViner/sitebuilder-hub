import { Archive, Edit3, ExternalLink, Eye, FolderOpen } from "lucide-react";
import { Site } from "../types/site";
import { formatDateTime, formatMb } from "../utils/format";
import { DataTable } from "./DataTable";
import { HealthBadge } from "./HealthBadge";
import { StatusBadge } from "./StatusBadge";
import { VersionBadge } from "./VersionBadge";

interface SitesTableProps {
  sites: Site[];
  onEdit: (site: Site) => void;
  onArchive: (site: Site) => void;
  onDetails: (id: string) => void;
}

export function SitesTable({ sites, onEdit, onArchive, onDetails }: SitesTableProps) {
  return (
    <DataTable
      minWidth={1240}
      columns={["אתר", "סטטוס", "תקינות", "גרסה", "בעלים", "עדכון אחרון", "נפח", "פעולות"]}
    >
      {sites.map((site) => (
        <tr key={site._id}>
          <td>
            <div className="min-w-[220px]">
              <button className="text-right text-sm font-bold hover:underline" style={{ color: "var(--text-strong)" }} onClick={() => onDetails(site._id)} type="button">
                {site.displayName}
              </button>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="num text-xs muted">{site.siteCode}</span>
                <span className="text-xs subtle">{site.unitName || "ללא יחידה"}</span>
              </div>
            </div>
          </td>
          <td><StatusBadge status={site.status} /></td>
          <td><HealthBadge status={site.derivedHealthStatus || "unknown"} /></td>
          <td>
            <div className="space-y-1">
              <span className="num text-sm font-bold">{site.currentVersion || site.version || "-"}</span>
              <VersionBadge status={site.versionStatus || "unknown"} />
            </div>
          </td>
          <td>
            <div className="min-w-[170px]">
              <p className="text-sm">{site.ownerName || "-"}</p>
              <p className="num text-xs muted">{site.ownerPersonalNumber || site.ownerEmail || ""}</p>
            </div>
          </td>
          <td><span className="num text-xs">{formatDateTime(site.updatedAt || site.lastHealthCheckAt)}</span></td>
          <td><span className="num">{formatMb(site.storageMb)}</span></td>
          <td>
            <div className="flex flex-wrap gap-1.5">
              <a className="icon-btn" href={site.finalAppUrl || site.resolvedPaths?.finalAppUrl || site.sharePointSiteUrl} target="_blank" rel="noreferrer" title="פתח אתר סופי" aria-label="פתח אתר סופי">
                <ExternalLink size={15} />
              </a>
              <a className="icon-btn" href={site.sharePointSiteUrl || site.resolvedPaths?.sharePointSiteUrl} target="_blank" rel="noreferrer" title="פתח SharePoint" aria-label="פתח SharePoint">
                <FolderOpen size={15} />
              </a>
              <button className="icon-btn" onClick={() => onDetails(site._id)} title="פרטים" aria-label="פרטים" type="button"><Eye size={15} /></button>
              <button className="icon-btn" onClick={() => onEdit(site)} title="עריכה" aria-label="עריכה" type="button"><Edit3 size={15} /></button>
              <button className="icon-btn" onClick={() => onArchive(site)} title="ארכוב" aria-label="ארכוב" type="button"><Archive size={15} /></button>
            </div>
          </td>
        </tr>
      ))}
    </DataTable>
  );
}
