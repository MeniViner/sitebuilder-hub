import { Check, Copy } from "lucide-react";
import { useState } from "react";

export function CopyButton({
  value,
  label = "העתק",
  iconOnly = false
}: {
  value?: string;
  label?: string;
  iconOnly?: boolean;
}) {
  const [done, setDone] = useState(false);

  const copy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      window.setTimeout(() => setDone(false), 1200);
    } catch {
      setDone(false);
    }
  };

  const buttonLabel = done ? "הועתק" : label;

  if (iconOnly) {
    return (
      <button
        aria-label={label}
        className="copy-icon-button"
        disabled={!value}
        onClick={copy}
        title={buttonLabel}
        type="button"
      >
        {done ? <Check size={13} /> : <Copy size={13} />}
      </button>
    );
  }

  return (
    <button className="btn btn-secondary min-h-0 px-2 py-1 text-xs" onClick={copy} type="button" disabled={!value}>
      {done ? <Check size={13} /> : <Copy size={13} />}
      {buttonLabel}
    </button>
  );
}
