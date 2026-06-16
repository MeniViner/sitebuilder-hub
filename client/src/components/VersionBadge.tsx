import { CheckCircle2, Clock3, GitBranch, RotateCw, XCircle } from "lucide-react";
import { ReactNode } from "react";
import { versionStatusLabel } from "../utils/format";
import { HelpIcon } from "./help/HelpIcon";

export function VersionBadge({ status }: { status?: string }) {
  const map: Record<string, { tone: string; icon: ReactNode }> = {
    up_to_date: { tone: "badge-success", icon: <CheckCircle2 size={12} /> },
    outdated: { tone: "badge-warning", icon: <GitBranch size={12} /> },
    updating: { tone: "badge-info", icon: <RotateCw size={12} /> },
    failed: { tone: "badge-danger", icon: <XCircle size={12} /> },
    unknown: { tone: "badge-neutral", icon: <Clock3 size={12} /> }
  };

  const item = map[status || ""] ?? map.unknown;
  const helpKey = status === "outdated" ? "version.outdated" : "version.status";
  return <span className={`badge ${item.tone}`}>{item.icon}{versionStatusLabel(status)}<HelpIcon helpKey={helpKey} className="help-icon-in-token" /></span>;
}
