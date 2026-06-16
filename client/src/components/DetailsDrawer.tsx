import { X } from "lucide-react";
import { ReactNode } from "react";

export function DetailsDrawer({
  open,
  title,
  subtitle,
  children,
  onClose
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="drawer-layer">
      <aside className="drawer-panel">
        <header className="drawer-header">
          <div>
            <h2 className="text-lg font-bold" style={{ color: "var(--text-strong)" }}>{title}</h2>
            {subtitle ? <p className="mt-1 text-sm muted">{subtitle}</p> : null}
          </div>
          <button className="icon-btn" onClick={onClose} type="button" aria-label="סגור">
            <X size={17} />
          </button>
        </header>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>
  );
}
