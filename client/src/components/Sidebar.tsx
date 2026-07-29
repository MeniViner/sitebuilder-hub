import { FolderKanban, Gauge, LogOut, PanelRightClose, PanelRightOpen, Settings, Workflow, X } from "lucide-react";
import { useId, useRef, useState, type RefObject } from "react";
import { NavLink } from "react-router-dom";
import { PRIMARY_ROUTES } from "../config/routeManifest";
import type { HubAuthUser } from "../domain/hubDomain";
import { presentVisibleRole } from "../domain/presentation";
import { useDialogFocus } from "../hooks/useDialogFocus";
import { useOperationalStatus } from "./OperationalStatusProvider";

const icons = {
  dashboard: Gauge,
  sites: FolderKanban,
  operations: Workflow,
  settings: Settings
};

function SidebarContent({
  mobile = false,
  collapsed = false,
  onNavigate,
  onToggleCollapsed,
  authUser,
  onLogout,
  titleId,
  closeRef
}: {
  mobile?: boolean;
  collapsed?: boolean;
  onNavigate?: () => void;
  onToggleCollapsed?: () => void;
  authUser?: HubAuthUser | null;
  onLogout?: () => void;
  titleId?: string;
  closeRef?: RefObject<HTMLButtonElement>;
}) {
  const { status, refreshing } = useOperationalStatus();
  const available = status.hubApi.status === "connected" && status.hubMongo.status !== "failed";
  const visibleRole = presentVisibleRole(authUser?.role);
  const displayName = authUser?.name || "משתמש מחובר";

  return (
    <>
      <div className="sidebar-brand">
        <div className="sidebar-brand-mark" aria-hidden="true">SB</div>
        <div className="sidebar-brand-copy">
          <p className="sidebar-brand-title" id={titleId}>Site Builder Hub</p>
          <p className="sidebar-brand-subtitle">ניהול אתרים</p>
        </div>
        {mobile ? <button ref={closeRef} className="icon-btn sidebar-mobile-close" type="button" onClick={onNavigate} aria-label="סגירת ניווט"><X size={18} /></button> : null}
        {!mobile ? (
          <button
            className="icon-btn sidebar-collapse-button"
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "הרחבת סרגל הניווט" : "צמצום סרגל הניווט"}
            title={collapsed ? "הרחבת ניווט" : "צמצום ניווט"}
          >
            <span className="sidebar-collapse-icon" aria-hidden="true">
              {collapsed ? <PanelRightOpen size={17} /> : <PanelRightClose size={17} />}
            </span>
          </button>
        ) : null}
      </div>
      <nav className="sidebar-nav" aria-label="ניווט ראשי">
        {PRIMARY_ROUTES.map((item) => {
          const Icon = icons[item.id as keyof typeof icons];
          return (
            <NavLink
              key={item.id}
              to={item.path}
              end={item.path === "/"}
              onClick={onNavigate}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) => `sidebar-nav-link ${isActive ? "sidebar-nav-link-active" : ""}`}
            >
              <span className="sidebar-nav-icon" aria-hidden="true"><Icon size={19} /></span>
              <span className="sidebar-nav-text">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
      <div className="sidebar-footer">
        <span className={`sidebar-availability-dot ${available ? "is-available" : "is-attention"}`} aria-hidden="true" />
        <div><strong>{refreshing ? "בודק מערכת" : available ? "המערכת זמינה" : "נדרשת בדיקה"}</strong><span>פרטים זמינים בהגדרות</span></div>
      </div>
      {mobile && authUser && onLogout ? (
        <button
          className="sidebar-mobile-account"
          type="button"
          onClick={() => {
            onNavigate?.();
            onLogout();
          }}
        >
          <span className="sidebar-mobile-account-avatar" aria-hidden="true">{displayName.trim().slice(0, 1) || "מ"}</span>
          <span className="sidebar-mobile-account-copy">
            <strong>{displayName}</strong>
            <small>{visibleRole === "admin" ? "הרשאת ניהול" : "הרשאת צפייה"}</small>
          </span>
          <span className="sidebar-mobile-account-action"><LogOut size={17} aria-hidden="true" />יציאה</span>
        </button>
      ) : null}
    </>
  );
}

export function Sidebar({
  mobileOpen = false,
  onMobileClose,
  authUser,
  onLogout
}: {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  authUser?: HubAuthUser | null;
  onLogout?: () => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [collapsed, setCollapsed] = useState(() => window.localStorage.getItem("sitebuilder-hub-sidebar") === "collapsed");
  useDialogFocus(mobileOpen, panelRef, onMobileClose || (() => undefined), closeRef);

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem("sitebuilder-hub-sidebar", next ? "collapsed" : "expanded");
      return next;
    });
  };

  if (onMobileClose) {
    if (!mobileOpen) return null;
    return (
      <div className="mobile-nav-layer mobile-nav-layer-open">
        <button className="mobile-nav-backdrop" type="button" aria-label="סגירת ניווט" onClick={onMobileClose} />
        <aside ref={panelRef} className="mobile-nav-panel" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}><SidebarContent mobile onNavigate={onMobileClose} authUser={authUser} onLogout={onLogout} titleId={titleId} closeRef={closeRef} /></aside>
      </div>
    );
  }
  return (
    <aside className={`sidebar-shell sidebar-shell-desktop hidden ${collapsed ? "sidebar-shell-collapsed" : ""}`}>
      <SidebarContent collapsed={collapsed} onToggleCollapsed={toggleCollapsed} authUser={authUser} onLogout={onLogout} />
    </aside>
  );
}
