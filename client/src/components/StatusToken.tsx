import { AlertTriangle, CheckCircle2, Clock3, Database, Eye, LockKeyhole, ShieldAlert, ShieldCheck, Share2, Workflow } from "lucide-react";
import { ReactNode } from "react";
import { type HelpContentKey } from "../help/helpContent";
import { HelpIcon } from "./help/HelpIcon";

export type StatusTokenKind =
  | "live"
  | "cached"
  | "metadata"
  | "readonly"
  | "blocked"
  | "writeEnabled"
  | "approval"
  | "destructive"
  | "running"
  | "success"
  | "warning"
  | "neutral";

const statusTokenConfig: Record<StatusTokenKind, { label: string; className: string; icon: ReactNode }> = {
  live: { label: "מידע חי", className: "status-token-success", icon: <CheckCircle2 size={13} /> },
  cached: { label: "מידע שמור", className: "status-token-neutral", icon: <Clock3 size={13} /> },
  metadata: { label: "מטא־דאטה", className: "status-token-warning", icon: <Database size={13} /> },
  readonly: { label: "קריאה בלבד", className: "status-token-info", icon: <Eye size={13} /> },
  blocked: { label: "חסום", className: "status-token-danger", icon: <Share2 size={13} /> },
  writeEnabled: { label: "כתיבה זמינה", className: "status-token-success", icon: <ShieldCheck size={13} /> },
  approval: { label: "אישור מתקדם", className: "status-token-warning", icon: <LockKeyhole size={13} /> },
  destructive: { label: "פעולה מסוכנת", className: "status-token-danger", icon: <ShieldAlert size={13} /> },
  running: { label: "בתהליך", className: "status-token-info", icon: <Workflow size={13} /> },
  success: { label: "תקין", className: "status-token-success", icon: <CheckCircle2 size={13} /> },
  warning: { label: "אזהרה", className: "status-token-warning", icon: <AlertTriangle size={13} /> },
  neutral: { label: "סטטוס", className: "status-token-neutral", icon: <Clock3 size={13} /> }
};

export function StatusToken({
  kind,
  label,
  icon,
  compact = false,
  helpKey
}: {
  kind: StatusTokenKind;
  label?: string;
  icon?: ReactNode;
  compact?: boolean;
  helpKey?: HelpContentKey | string;
}) {
  const config = statusTokenConfig[kind];
  return (
    <span className={`status-token ${config.className} ${compact ? "status-token-compact" : ""}`}>
      {icon ?? config.icon}
      <span>{label ?? config.label}</span>
      <HelpIcon helpKey={helpKey} className="help-icon-in-token" />
    </span>
  );
}
