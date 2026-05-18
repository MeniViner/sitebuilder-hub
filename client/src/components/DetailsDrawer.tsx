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
    <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm">
      <aside className="surface-card fixed inset-y-0 left-0 w-full max-w-xl overflow-y-auto rounded-none border-y-0 border-l-0 p-0 shadow-2xl">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b divider px-5 py-4" style={{ background: "var(--surface)" }}>
          <div>
            <h2 className="text-lg font-bold" style={{ color: "var(--text-strong)" }}>{title}</h2>
            {subtitle ? <p className="mt-1 text-sm muted">{subtitle}</p> : null}
          </div>
          <button className="icon-btn" onClick={onClose} type="button" aria-label="סגור">
            <X size={17} />
          </button>
        </header>
        <div className="p-5">{children}</div>
      </aside>
    </div>
  );
}
