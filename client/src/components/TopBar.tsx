import { LogOut, Menu } from "lucide-react";
import type { WhoAmIResult } from "../api/sitesApi";
import { ThemeToggle } from "./ThemeToggle";

type AuthUser = NonNullable<WhoAmIResult["user"]>;

export function TopBar({
  authUser,
  onLogout,
  onOpenNav
}: {
  authUser?: AuthUser | null;
  authChecking?: boolean;
  onLogout?: () => void;
  onOpenNav?: () => void;
}) {
  return (
    <header className="top-bar">
      <div className="mx-auto flex max-w-[1520px] items-center justify-between gap-3 px-4 py-3 lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button className="icon-btn lg:hidden" type="button" onClick={onOpenNav} aria-label="פתח ניווט">
            <Menu size={18} />
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-bold" style={{ color: "var(--text-strong)" }}>Site Builder Hub</h1>
            <span className="badge badge-neutral">Control Center</span>
          </div>
          <p className="hidden text-sm muted md:block">ניהול מרכזי לאתרי Site Builder ב־SharePoint</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs">
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
