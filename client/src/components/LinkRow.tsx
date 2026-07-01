import { ExternalLink } from "lucide-react";
import { CopyButton } from "./CopyButton";

export function LinkRow({
  label,
  value,
  isUrl = false,
  description,
  showCopy = true
}: {
  label: string;
  value?: string;
  isUrl?: boolean;
  description?: string;
  showCopy?: boolean;
}) {
  const hasActions = showCopy || (isUrl && Boolean(value));

  return (
    <div className={`grid gap-3 border-b divider py-3 last:border-b-0 ${hasActions ? "md:grid-cols-[210px_1fr_auto]" : "md:grid-cols-[210px_1fr]"} md:items-center`}>
      <div>
        <p className="text-sm font-bold" style={{ color: "var(--text-strong)" }}>{label}</p>
        {description ? <p className="mt-0.5 text-xs muted">{description}</p> : null}
      </div>
      <div className="min-w-0">
        {value ? (
          <code className="tabular block overflow-hidden text-ellipsis whitespace-nowrap rounded-md px-2 py-1 text-xs" style={{ background: "var(--surface-muted)", color: "var(--text)" }} title={value}>
            {value}
          </code>
        ) : (
          <span className="text-sm subtle">לא מוגדר</span>
        )}
      </div>
      {hasActions ? (
        <div className="flex flex-wrap items-center gap-2">
          {showCopy ? <CopyButton value={value} /> : null}
          {isUrl && value ? (
            <a className="btn btn-secondary min-h-0 px-2 py-1 text-xs" href={value} target="_blank" rel="noreferrer">
              <ExternalLink size={13} />
              פתח
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
