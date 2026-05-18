import { ShieldAlert, ShieldCheck, ShieldQuestion, ShieldX } from "lucide-react";
import { ReactNode } from "react";
import { DerivedHealthStatus } from "../types/site";
import { healthStatusLabel } from "../utils/format";

export function HealthBadge({ status }: { status?: DerivedHealthStatus | string }) {
  const map: Record<string, { tone: string; icon: ReactNode }> = {
    healthy: { tone: "badge-success", icon: <ShieldCheck size={12} /> },
    warning: { tone: "badge-warning", icon: <ShieldAlert size={12} /> },
    failed: { tone: "badge-danger", icon: <ShieldX size={12} /> },
    unknown: { tone: "badge-neutral", icon: <ShieldQuestion size={12} /> }
  };

  const item = map[status || ""] ?? map.unknown;
  return <span className={`badge ${item.tone}`}>{item.icon}{healthStatusLabel(status)}</span>;
}
