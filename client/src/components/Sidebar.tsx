import { FolderKanban, Gauge, Settings, Workflow, X } from "lucide-react";
import { useId, useRef, type RefObject } from "react";
import { NavLink } from "react-router-dom";
import { PRIMARY_ROUTES } from "../config/routeManifest";
import { useDialogFocus } from "../hooks/useDialogFocus";
import { useOperationalStatus } from "./OperationalStatusProvider";

const icons = {
  dashboard: Gauge,
  sites: FolderKanban,
  operations: Workflow,
  settings: Settings
};

function SidebarContent({ mobile = false, onNavigate, titleId, closeRef }: { mobile?: boolean; onNavigate?: () => void; titleId?: string; closeRef?: RefObject<HTMLButtonElement> }) {
  const { status, refreshing } = useOperationalStatus();
  const available = status.hubApi.status === "connected" && status.hubMongo.status !== "failed";

  return (
    <>
      <div className="sidebar-brand">
        <div className="sidebar-brand-mark" aria-hidden="true">SB</div>
        <div className="min-w-0">
          <p className="sidebar-brand-title" id={titleId}>Site Builder Hub</p>
          <p className="sidebar-brand-subtitle">ניהול אתרים</p>
        </div>
        {mobile ? <button ref={closeRef} className="icon-btn sidebar-mobile-close" type="button" onClick={onNavigate} aria-label="סגירת ניווט"><X size={18} /></button> : null}
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
    </>
  );
}

export function Sidebar({ mobileOpen = false, onMobileClose }: { mobileOpen?: boolean; onMobileClose?: () => void }) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  useDialogFocus(mobileOpen, panelRef, onMobileClose || (() => undefined), closeRef);

  if (onMobileClose) {
    if (!mobileOpen) return null;
    return (
      <div className="mobile-nav-layer mobile-nav-layer-open">
        <button className="mobile-nav-backdrop" type="button" aria-label="סגירת ניווט" onClick={onMobileClose} />
        <aside ref={panelRef} className="mobile-nav-panel" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}><SidebarContent mobile onNavigate={onMobileClose} titleId={titleId} closeRef={closeRef} /></aside>
      </div>
    );
  }
  return <aside className="sidebar-shell sidebar-shell-desktop hidden shrink-0 lg:sticky lg:top-24 lg:block"><SidebarContent /></aside>;
}
