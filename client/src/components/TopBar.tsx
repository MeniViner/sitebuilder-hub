import { LogOut, Menu } from "lucide-react";
import type { HubAuthUser } from "../domain/hubDomain";
import { presentVisibleRole } from "../domain/presentation";
import { HubViewToggle } from "./HubViewToggle";
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
  const visibleRole = presentVisibleRole(authUser?.role);
  const displayName = authUser?.name || "משתמש מחובר";
  const initial = displayName.trim().slice(0, 1) || "מ";

  return (
    <header className="top-bar">
      <div className="hub-topbar-inner">
        <div className="hub-topbar-leading">
          <a className="skip-link" href="#main-content">דילוג לתוכן</a>
          <button className="icon-btn hub-mobile-menu" type="button" onClick={onOpenNav} aria-label="פתיחת ניווט"><Menu size={20} /></button>
          <div className="hub-topbar-brand">
            <strong className="hub-topbar-title">Site Builder Hub</strong>
            <span className="hub-topbar-subtitle">מרכז ניהול האתרים</span>
          </div>
        </div>
        <div className="hub-topbar-actions">
          <SystemStatusBar serverStatus={serverStatus} authChecking={authChecking} />
          <HubViewToggle placement="desktop" />
          <ThemeToggle />
          {authUser ? (
            <div className="hub-account-chip" title={`${displayName}, ${visibleRole === "admin" ? "מנהל" : "צופה"}`}>
              <span className="hub-account-avatar" aria-hidden="true">{initial}</span>
              <span className="hub-account-copy">
                <strong>{displayName}</strong>
                <small>{visibleRole === "admin" ? "הרשאת ניהול" : "הרשאת צפייה"}</small>
              </span>
            </div>
          ) : null}
          {authUser?.personalNumber && onLogout ? <button className="icon-btn hub-logout-button" type="button" onClick={onLogout} title="יציאה" aria-label="יציאה"><LogOut size={17} /></button> : null}
        </div>
      </div>
    </header>
  );
}
