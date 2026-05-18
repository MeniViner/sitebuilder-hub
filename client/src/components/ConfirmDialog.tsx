import { AlertTriangle } from "lucide-react";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "אישור",
  cancelLabel = "ביטול",
  onConfirm,
  onClose,
  danger = false
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
  danger?: boolean;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
      <div className="surface-card w-full max-w-md p-5">
        <div className="mb-3 flex items-start gap-3">
          <span className="mt-1" style={{ color: danger ? "var(--danger)" : "var(--warning)" }}>
            <AlertTriangle size={20} />
          </span>
          <div>
            <h2 className="text-lg font-bold" style={{ color: "var(--text-strong)" }}>{title}</h2>
            <p className="mt-1 text-sm muted">{description}</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn btn-secondary" onClick={onClose} type="button">{cancelLabel}</button>
          <button className={`btn ${danger ? "btn-danger" : "btn-primary"}`} onClick={onConfirm} type="button">{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
