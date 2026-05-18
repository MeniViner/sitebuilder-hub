import { AlertTriangle } from "lucide-react";

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border p-4" style={{ background: "var(--danger-soft)", borderColor: "color-mix(in srgb, var(--danger) 38%, var(--border))", color: "var(--danger)" }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-bold"><AlertTriangle size={16} />{message}</p>
        {onRetry ? (
          <button className="btn btn-secondary" onClick={onRetry} type="button">
            נסה שוב
          </button>
        ) : null}
      </div>
    </div>
  );
}
