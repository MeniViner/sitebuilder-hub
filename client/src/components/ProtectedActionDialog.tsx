import { AlertTriangle, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useDialogFocus } from "../hooks/useDialogFocus";
import { ModalPortal } from "./ModalPortal";

export function ProtectedActionDialog({
  open,
  title,
  description,
  confirmWord,
  noteLabel = "סיבת פעולה",
  notePlaceholder,
  noteHint = "נדרש נימוק של לפחות 3 תווים. הטקסט יישמר עם ה־Job/approval.",
  initialNote = "",
  risks = [],
  confirmLabel = "אישור פעולה",
  confirmDisabledReason = "",
  busy = false,
  onClose,
  onConfirm
}: {
  open: boolean;
  title: string;
  description: string;
  confirmWord: string;
  noteLabel?: string;
  notePlaceholder?: string;
  noteHint?: string;
  initialNote?: string;
  risks?: string[];
  confirmLabel?: string;
  confirmDisabledReason?: string;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (note: string) => void | Promise<void>;
}) {
  const [note, setNote] = useState(initialNote);
  const [confirmation, setConfirmation] = useState("");
  const titleId = useId();
  const descriptionId = useId();
  const noteHintId = useId();
  const confirmationHintId = useId();
  const disabledReasonId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const safeClose = useCallback(() => { if (!busy) onClose(); }, [busy, onClose]);
  useDialogFocus(open, panelRef, safeClose, noteRef);

  useEffect(() => {
    if (!open) return;
    setNote(initialNote);
    setConfirmation("");
  }, [initialNote, open]);

  if (!open) return null;

  const canConfirm =
    !confirmDisabledReason &&
    note.trim().length >= 3 &&
    confirmation.trim().toLocaleLowerCase() === confirmWord.toLocaleLowerCase() &&
    !busy;

  return (
    <ModalPortal>
    <div className="dialog-layer">
      <div ref={panelRef} className="dialog-panel dialog-panel-protected" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} tabIndex={-1}>
        <header className="dialog-header dialog-header-split">
          <div className="dialog-title-group">
            <span className="dialog-status-icon" style={{ color: "var(--danger)" }}>
              <AlertTriangle size={20} />
            </span>
            <div>
              <h2 id={titleId}>{title}</h2>
              <p id={descriptionId}>{description}</p>
            </div>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="סגור" disabled={busy}><X size={16} /></button>
        </header>

        <div className="dialog-body">
          {risks.length ? (
            <div className="mb-4 rounded-lg border p-3" style={{ background: "var(--danger-soft)", borderColor: "color-mix(in srgb, var(--danger) 38%, var(--border))" }}>
              <p className="field-label" style={{ color: "var(--danger)" }}>סיכונים לפני אישור</p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-sm" style={{ color: "var(--text-strong)" }}>
                {risks.map((risk) => <li key={risk}>{risk}</li>)}
              </ul>
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-[1fr_12rem]">
            <label className="block">
              <span className="field-label">{noteLabel}</span>
              <textarea
                ref={noteRef}
                className="control min-h-28"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={notePlaceholder}
                aria-describedby={noteHintId}
                aria-invalid={Boolean(note) && note.trim().length < 3}
              />
              <span className="mt-1 block text-xs muted" id={noteHintId}>{noteHint}</span>
            </label>
            <label className="block">
              <span className="field-label">הקלד {confirmWord}</span>
              <input className="control" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} aria-describedby={confirmationHintId} aria-invalid={Boolean(confirmation) && confirmation.trim().toLocaleLowerCase() !== confirmWord.toLocaleLowerCase()} />
              <span className="mt-1 block text-xs muted" id={confirmationHintId}>מונע הרצה בטעות של פעולה בעלת סיכון.</span>
            </label>
          </div>
        </div>

        <footer className="dialog-footer dialog-footer-split">
          <div className="min-w-0">
            <button className="btn btn-secondary" type="button" onClick={onClose} disabled={busy}>ביטול</button>
            {confirmDisabledReason ? (
              <p className="mt-2 max-w-md text-xs" id={disabledReasonId} style={{ color: "var(--danger)" }}>{confirmDisabledReason}</p>
            ) : null}
          </div>
          <button className="btn btn-danger" type="button" onClick={() => onConfirm(note.trim())} disabled={!canConfirm} aria-describedby={confirmDisabledReason ? disabledReasonId : undefined}>
            {busy ? "שולח..." : confirmLabel}
          </button>
        </footer>
      </div>
    </div>
    </ModalPortal>
  );
}
