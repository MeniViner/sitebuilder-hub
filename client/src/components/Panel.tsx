import { ReactNode } from "react";
import { type HelpContentKey } from "../help/helpContent";
import { HelpIcon } from "./help/HelpIcon";

type PanelTone = "default" | "muted" | "danger" | "warning" | "success";

const toneClass: Record<PanelTone, string> = {
  default: "",
  muted: "panel-muted",
  danger: "panel-danger",
  warning: "panel-warning",
  success: "panel-success"
};

export function Panel({
  title,
  subtitle,
  actions,
  children,
  tone = "default",
  compact = false,
  className = "",
  helpKey
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  tone?: PanelTone;
  compact?: boolean;
  className?: string;
  helpKey?: HelpContentKey | string;
}) {
  return (
    <section className={`panel ${toneClass[tone]} ${className}`}>
      {title || subtitle || actions ? (
        <header className={`panel-header ${compact ? "panel-header-compact" : ""}`}>
          <div className="min-w-0">
            {title ? <h2 className="panel-title panel-title-with-help">{title}<HelpIcon helpKey={helpKey} /></h2> : null}
            {subtitle ? <p className="panel-subtitle">{subtitle}</p> : null}
          </div>
          {actions ? <div className="panel-actions">{actions}</div> : null}
        </header>
      ) : null}
      <div className={compact ? "panel-body panel-body-compact" : "panel-body"}>{children}</div>
    </section>
  );
}

export function SectionBand({
  children,
  className = ""
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`section-band ${className}`}>{children}</section>;
}

export function DangerZone({
  title = "פעולה מסוכנת",
  subtitle,
  children
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <Panel title={title} subtitle={subtitle} tone="danger">
      {children}
    </Panel>
  );
}

export function Toolbar({
  children,
  actions
}: {
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="toolbar">
      <div className="toolbar-main">{children}</div>
      {actions ? <div className="toolbar-actions">{actions}</div> : null}
    </div>
  );
}
