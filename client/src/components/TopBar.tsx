import { Activity, Database, KeyRound, LogOut, Server } from "lucide-react";
import { ReactNode } from "react";
import type { WhoAmIResult } from "../api/sitesApi";
import { ThemeToggle } from "./ThemeToggle";

type AuthUser = NonNullable<WhoAmIResult["user"]>;

const authSourceLabels: Record<NonNullable<AuthUser["source"]>, string> = {
  dev: "Dev",
  "api-key": "API key",
  hardcoded: "Hardcoded",
  bootstrap: "Bootstrap",
  "site-admin": "Site admin"
};

function StatusPill({ label, value, tone, icon }: { label: string; value: string; tone: "success" | "warning" | "danger" | "info"; icon: ReactNode }) {
  const toneClass = tone === "success" ? "badge-success" : tone === "warning" ? "badge-warning" : tone === "danger" ? "badge-danger" : "badge-info";
  return (
    <span className={`badge ${toneClass}`}>
      {icon}
      <span>{label}</span>
      <span className="num">{value}</span>
    </span>
  );
}

function formatPersonalNumber(value?: string) {
  if (!value) return "";
  return value.startsWith("s") ? value : `s${value}`;
}

function formatAuthValue(authUser?: AuthUser | null, authChecking = false) {
  if (authChecking) return "בודק";
  if (!authUser) return "לא מחובר";
  const source = authUser.source ? authSourceLabels[authUser.source] : authUser.role;
  const personalNumber = formatPersonalNumber(authUser.personalNumber);
  return personalNumber ? `${source} ${personalNumber}` : source;
}

export function TopBar({
  serverStatus,
  authUser,
  authChecking = false,
  onLogout
}: {
  serverStatus?: { mongo?: string; status?: string; serverTime?: string };
  authUser?: AuthUser | null;
  authChecking?: boolean;
  onLogout?: () => void;
}) {
  const apiOk = serverStatus?.status === "ok";
  const mongoOk = serverStatus?.mongo === "connected";
  const authTone = authUser ? (authUser.source === "dev" || authUser.source === "api-key" ? "warning" : "success") : authChecking ? "info" : "danger";

  return (
    <header className="sticky top-0 z-30 border-b backdrop-blur-xl" style={{ background: "color-mix(in srgb, var(--shell) 92%, transparent)", borderColor: "var(--border)" }}>
      <div className="mx-auto flex max-w-[1520px] flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-bold" style={{ color: "var(--text-strong)" }}>Site Builder Hub</h1>
            <span className="badge badge-neutral">Control Center</span>
          </div>
          <p className="mt-0.5 text-sm muted">ניהול מרכזי לאתרי Site Builder המאוחסנים ב־SharePoint</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <StatusPill label="API" value={apiOk ? "מחובר" : "לא זמין"} tone={apiOk ? "success" : "danger"} icon={<Server size={12} />} />
          <StatusPill label="MongoDB" value={mongoOk ? "מחובר" : "לא מחובר"} tone={mongoOk ? "success" : "warning"} icon={<Database size={12} />} />
          <StatusPill label="סביבה" value={import.meta.env.MODE || "development"} tone="info" icon={<Activity size={12} />} />
          <StatusPill label="Auth" value={formatAuthValue(authUser, authChecking)} tone={authTone} icon={<KeyRound size={12} />} />
          {authUser?.personalNumber && onLogout ? (
            <button className="icon-btn" type="button" onClick={onLogout} title="התנתק">
              <LogOut size={15} />
            </button>
          ) : null}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
