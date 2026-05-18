import { Check, Copy } from "lucide-react";
import { useState } from "react";

export function CopyButton({ value, label = "העתק" }: { value?: string; label?: string }) {
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

  return (
    <button className="btn btn-secondary min-h-0 px-2 py-1 text-xs" onClick={copy} type="button" disabled={!value}>
      {done ? <Check size={13} /> : <Copy size={13} />}
      {done ? "הועתק" : label}
    </button>
  );
}
