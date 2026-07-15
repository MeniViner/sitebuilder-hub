import { LogOut, Menu } from "lucide-react";
import type { HubAuthUser } from "../domain/hubDomain";
import { SystemStatusBar } from "./SystemStatusBar";
import { ThemeToggle } from "./ThemeToggle";

export function TopBar({
  serverStatus,
  authUser,
  authChecking = false,
  onLogout,
  onOpenNav
}: {
  serverStatus?: { mongo?: string; status?: string; serverTime?: string };
  authUser?: HubAuthUser | null;
  authChecking?: boolean;
  onLogout?: () => void;
  onOpenNav?: () => void;
}) {
  return (
    <header className="top-bar">
      <div className="hub-topbar-inner mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-4 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <a className="skip-link" href="#main-content">דילוג לתוכן</a>
          <button className="icon-btn lg:hidden" type="button" onClick={onOpenNav} aria-label="פתיחת ניווט"><Menu size={20} /></button>
          <div className="hub-topbar-brand">
            <strong className="hub-topbar-title">Site Builder Hub</strong>
            <span className="hub-topbar-subtitle">ניהול אתרים</span>
          </div>
        </div>
        <div className="hub-topbar-actions">
          <SystemStatusBar serverStatus={serverStatus} authChecking={authChecking} />
          <ThemeToggle />
          {authUser?.personalNumber && onLogout ? <button className="icon-btn" type="button" onClick={onLogout} title="יציאה" aria-label="יציאה"><LogOut size={17} /></button> : null}
        </div>
      </div>
    </header>
  );
}
