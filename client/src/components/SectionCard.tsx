import { ReactNode } from "react";

export function SectionCard({
  title,
  subtitle,
  actions,
  children,
  compact = false
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <section className="surface-card overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b divider px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-base font-bold" style={{ color: "var(--text-strong)" }}>{title}</h2>
          {subtitle ? <p className="mt-1 text-sm muted">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      <div className={compact ? "p-3" : "p-5"}>{children}</div>
    </section>
  );
}
