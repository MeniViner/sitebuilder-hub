import { AlertTriangle, Archive, BadgeCheck, CircleEllipsis, XCircle } from "lucide-react";
import { ReactNode } from "react";
import { siteStatusLabel } from "../utils/format";
import { HelpIcon } from "./help/HelpIcon";

export function StatusBadge({ status }: { status?: string }) {
  const map: Record<string, { tone: string; icon: ReactNode }> = {
    active: { tone: "badge-success", icon: <BadgeCheck size={12} /> },
    warning: { tone: "badge-warning", icon: <AlertTriangle size={12} /> },
    failed: { tone: "badge-danger", icon: <XCircle size={12} /> },
    draft: { tone: "badge-neutral", icon: <CircleEllipsis size={12} /> },
    archived: { tone: "badge-info", icon: <Archive size={12} /> }
  };

  const item = map[status || ""] ?? map.draft;
  const helpKey = status === "archived" ? "site.archived" : status === "active" ? "site.active" : "job.status";
  return <span className={`badge ${item.tone}`}>{item.icon}{siteStatusLabel(status)}<HelpIcon helpKey={helpKey} className="help-icon-in-token" /></span>;
}
