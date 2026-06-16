import { ReactNode } from "react";

export function FilterBar({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="filter-bar">
      <div className="filter-grid">{children}</div>
      {actions ? <div className="filter-actions">{actions}</div> : null}
    </div>
  );
}
