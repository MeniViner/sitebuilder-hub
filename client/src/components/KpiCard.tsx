import { ReactNode } from "react";

export function KpiCard({
  title,
  value,
  icon,
  description,
  tone = "neutral",
  footer
}: {
  title: string;
  value: string | number;
  icon: ReactNode;
  description?: string;
  tone?: "neutral" | "info" | "success" | "warning" | "danger";
  footer?: ReactNode;
}) {
  const toneMap = {
    neutral: "var(--surface-muted)",
    info: "var(--info-soft)",
    success: "var(--success-soft)",
    warning: "var(--warning-soft)",
    danger: "var(--danger-soft)"
  };

  return (
    <div className="surface-card p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold muted">{title}</p>
          <p className="num mt-2 text-3xl font-bold" style={{ color: "var(--text-strong)" }}>{value}</p>
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: toneMap[tone], color: "var(--accent)" }}>
          {icon}
        </span>
      </div>
      {description ? <p className="min-h-9 text-sm muted">{description}</p> : null}
      {footer ? <div className="mt-4 border-t divider pt-3 text-xs">{footer}</div> : null}
    </div>
  );
}
