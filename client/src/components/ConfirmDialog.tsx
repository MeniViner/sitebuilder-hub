import { AlertTriangle } from "lucide-react";
import { useId, useRef } from "react";
import { useDialogFocus } from "../hooks/useDialogFocus";

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
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useDialogFocus(open, panelRef, onClose, cancelRef);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm" role="presentation">
      <div ref={panelRef} className="surface-card w-full max-w-md p-5" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} tabIndex={-1}>
        <div className="mb-3 flex items-start gap-3">
          <span className="mt-1" style={{ color: danger ? "var(--danger)" : "var(--warning)" }}>
            <AlertTriangle size={20} />
          </span>
          <div>
            <h2 id={titleId} className="text-lg font-bold" style={{ color: "var(--text-strong)" }}>{title}</h2>
            <p id={descriptionId} className="mt-1 text-sm muted">{description}</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button ref={cancelRef} className="btn btn-secondary" onClick={onClose} type="button">{cancelLabel}</button>
          <button className={`btn ${danger ? "btn-danger" : "btn-primary"}`} onClick={onConfirm} type="button">{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
