import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { useHubViewMode } from "../HubViewMode";

export function ProductPage({
  title,
  description,
  action,
  children,
  eyebrow,
  icon: Icon
}: {
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
  eyebrow?: string;
  icon?: LucideIcon;
}) {
  const { mode } = useHubViewMode();

  if (mode === "legacy") {
    return (
      <div className="normal-page">
        <header className="normal-page-header">
          <div>
            {eyebrow ? <p className="normal-eyebrow">{eyebrow}</p> : null}
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
          {action ? <div className="normal-page-action">{action}</div> : null}
        </header>
        {children}
      </div>
    );
  }

  return (
    <div className="normal-page">
      <header className="normal-page-header">
        <div className="normal-page-heading">
          {Icon ? <span className="normal-page-icon" aria-hidden="true"><Icon size={21} /></span> : null}
          <div className="normal-page-copy">
            {eyebrow ? <p className="normal-eyebrow">{eyebrow}</p> : null}
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
        </div>
        {action ? <div className="normal-page-action">{action}</div> : null}
      </header>
      {children}
    </div>
  );
}
export function ProductSection({
  title,
  description,
  action,
  children,
  className = ""
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`normal-section ${className}`}>
      <div className="normal-section-heading">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
