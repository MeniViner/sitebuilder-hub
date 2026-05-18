import { Database, Eye, LockKeyhole, Share2 } from "lucide-react";

export function MetadataOnlyBadge({ mode = "metadata" }: { mode?: "metadata" | "readonly" | "soon" | "notConnected" }) {
  const config = {
    metadata: { label: "מטא־דאטה בלבד", tone: "badge-warning", icon: <Database size={12} /> },
    readonly: { label: "קריאה בלבד", tone: "badge-info", icon: <Eye size={12} /> },
    soon: { label: "בקרוב", tone: "badge-neutral", icon: <LockKeyhole size={12} /> },
    notConnected: { label: "לא מחובר ל־SharePoint", tone: "badge-danger", icon: <Share2 size={12} /> }
  }[mode];

  return <span className={`badge ${config.tone}`}>{config.icon}{config.label}</span>;
}
