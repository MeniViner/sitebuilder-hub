import { ReactNode } from "react";

export function FilterBar({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-lg border p-3 md:flex-row md:items-end md:justify-between" style={{ background: "var(--surface-muted)", borderColor: "var(--border)" }}>
      <div className="grid flex-1 gap-3 md:grid-cols-4">{children}</div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
