import { Inbox } from "lucide-react";
import { ReactNode } from "react";

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="soft-panel p-8 text-center">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
        <Inbox size={19} />
      </div>
      <h3 className="text-base font-bold" style={{ color: "var(--text-strong)" }}>{title}</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm muted">{description}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
