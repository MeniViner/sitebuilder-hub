import { ReactNode } from "react";
import { type HelpContentKey } from "../help/helpContent";
import { HelpLabel } from "./help/HelpLabel";

export function KpiCard({
  title,
  value,
  icon,
  description,
  tone = "neutral",
  footer,
  variant = "compact",
  helpKey
}: {
  title: string;
  value: string | number;
  icon: ReactNode;
  description?: string;
  tone?: "neutral" | "info" | "success" | "warning" | "danger";
  footer?: ReactNode;
  variant?: "hero" | "compact" | "inline";
  helpKey?: HelpContentKey | string;
}) {
  const toneMap = {
    neutral: { bg: "var(--surface-muted)", color: "var(--text-muted)" },
    info: { bg: "var(--info-soft)", color: "var(--info)" },
    success: { bg: "var(--success-soft)", color: "var(--success)" },
    warning: { bg: "var(--warning-soft)", color: "var(--warning)" },
    danger: { bg: "var(--danger-soft)", color: "var(--danger)" }
  };

  return (
    <div className={`kpi-card kpi-card-${variant}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="kpi-title"><HelpLabel helpKey={helpKey}>{title}</HelpLabel></p>
          <p className="kpi-value">{value}</p>
        </div>
        <span className="kpi-icon" style={{ background: toneMap[tone].bg, color: toneMap[tone].color }}>
          {icon}
        </span>
      </div>
      {description ? <p className="kpi-description">{description}</p> : null}
      {footer ? <div className="mt-4 border-t divider pt-3 text-xs">{footer}</div> : null}
    </div>
  );
}
