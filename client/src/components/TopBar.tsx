import { ChevronsLeft, ChevronsRight, LogOut, Menu } from "lucide-react";
import type { WhoAmIResult } from "../api/sitesApi";
import type { NavMode } from "./AppShell";
import { SystemStatusBar } from "./SystemStatusBar";
import { ThemeToggle } from "./ThemeToggle";

type AuthUser = NonNullable<WhoAmIResult["user"]>;

const navModes: Array<{ mode: NavMode; label: string; description: string; icon: typeof Menu }> = [
  { mode: "button", label: "כפתור", description: "ניווט נפתח רק מכפתור", icon: Menu },
  { mode: "rail", label: "אייקונים", description: "Rail אייקונים קבוע בצד", icon: ChevronsLeft },
  { mode: "open", label: "פתוח", description: "ניווט פתוח קבוע", icon: ChevronsRight }
];

const nextNavMode = (mode: NavMode): NavMode => {
  if (mode === "button") return "rail";
  if (mode === "rail") return "open";
  return "button";
};

const navModeMeta = (mode: NavMode) => navModes.find((item) => item.mode === mode) || navModes[0];

export function TopBar({
  serverStatus,
  authUser,
  authChecking = false,
  navMode = "button",
  onNavModeChange,
  onLogout,
  onOpenNav
}: {
  serverStatus?: { mongo?: string; status?: string; serverTime?: string };
  authUser?: AuthUser | null;
  authChecking?: boolean;
  navMode?: NavMode;
  onNavModeChange?: (mode: NavMode) => void;
  onLogout?: () => void;
  onOpenNav?: () => void;
}) {
  return (
    <header className="top-bar">
      <div className="hub-topbar-inner mx-auto flex max-w-[1520px] items-center justify-between gap-3 px-4 py-3 lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button className={`btn btn-secondary ${navMode === "button" ? "" : "lg:hidden"}`} type="button" onClick={onOpenNav} aria-label="פתח ניווט">
            <Menu size={18} />
            ניווט
          </button>
          <div className="hub-topbar-brand flex flex-wrap items-center gap-2">
            <h1 className="hub-topbar-title text-lg font-bold" style={{ color: "var(--text-strong)" }}>Site Builder Hub</h1>
            <span className="hub-topbar-badge badge badge-neutral">Control Center</span>
          </div>
          <p className="hub-topbar-subtitle hidden text-sm muted md:block">ניהול מרכזי לאתרי Site Builder ב־SharePoint</p>
        </div>
        <div className="hub-topbar-actions flex shrink-0 items-center gap-2 text-xs">
          <SystemStatusBar serverStatus={serverStatus} authUser={authUser} authChecking={authChecking} />
          {(() => {
            const current = navModeMeta(navMode);
            const next = navModeMeta(nextNavMode(navMode));
            const Icon = current.icon;
            return (
              <button
                className="nav-mode-cycle-button hidden lg:inline-flex"
                type="button"
                onClick={() => onNavModeChange?.(next.mode)}
                aria-label={`מצב ניווט: ${current.label}`}
                title={`מצב ניווט: ${current.label}. לחץ למצב ${next.label}`}
              >
                <Icon size={17} />
              </button>
            );
          })()}
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
