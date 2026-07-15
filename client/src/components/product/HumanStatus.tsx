import { AlertCircle, Check, Clock3, Circle, XCircle } from "lucide-react";
import type { HumanOperationState, HumanSiteCondition } from "../../domain/presentation";

type Status = HumanOperationState | HumanSiteCondition;

const icons = {
  ready: Check,
  "in-progress": Clock3,
  succeeded: Check,
  failed: XCircle,
  "needs-attention": AlertCircle,
  unavailable: XCircle
} satisfies Record<Status, typeof Circle>;

export function HumanStatus({ state, label, compact = false }: { state: Status; label: string; compact?: boolean }) {
  const Icon = icons[state];
  return (
    <span className={`normal-status normal-status-${state} ${compact ? "normal-status-compact" : ""}`}>
      <Icon size={compact ? 14 : 16} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
