export function LoadingState({ label = "טוען נתונים..." }: { label?: string }) {
  return (
    <div className="surface-card-muted p-8 text-center text-sm muted">
      <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2" style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
      {label}
    </div>
  );
}
