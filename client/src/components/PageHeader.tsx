import { ReactNode } from "react";
import { type HelpContentKey } from "../help/helpContent";
import { HelpIcon } from "./help/HelpIcon";

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
  variant = "simple",
  helpKey
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  actions?: ReactNode;
  variant?: "simple" | "entity" | "operational";
  helpKey?: HelpContentKey | string;
}) {
  return (
    <div className={`page-header page-header-${variant}`}>
      <div className="min-w-0">
        {eyebrow ? <p className="mb-1 text-xs font-bold uppercase tracking-normal subtle">{eyebrow}</p> : null}
        <h1 className="page-title page-title-with-help">{title}<HelpIcon helpKey={helpKey} /></h1>
        {subtitle ? <p className="mt-1 max-w-3xl text-sm muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-header-actions">{actions}</div> : null}
    </div>
  );
}
