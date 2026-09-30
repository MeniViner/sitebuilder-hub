import { AlertTriangle } from "lucide-react";
import { useId, useRef } from "react";
import { useDialogFocus } from "../hooks/useDialogFocus";
import { ModalPortal } from "./ModalPortal";

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
    <ModalPortal>
    <div className="dialog-layer" role="presentation">
      <div ref={panelRef} className="dialog-panel dialog-panel-confirm" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} tabIndex={-1}>
        <div className="dialog-header">
          <span className="dialog-status-icon" style={{ color: danger ? "var(--danger)" : "var(--warning)" }}>
            <AlertTriangle size={20} />
          </span>
          <div>
            <h2 id={titleId}>{title}</h2>
            <p id={descriptionId}>{description}</p>
          </div>
        </div>
        <div className="dialog-footer">
          <button ref={cancelRef} className="btn btn-secondary" onClick={onClose} type="button">{cancelLabel}</button>
          <button className={`btn ${danger ? "btn-danger" : "btn-primary"}`} onClick={onConfirm} type="button">{confirmLabel}</button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
