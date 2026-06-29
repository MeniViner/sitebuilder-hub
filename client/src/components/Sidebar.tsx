import { BarChart3, BellRing, Cable, ChevronsLeft, ChevronsRight, DatabaseBackup, FileClock, FolderKanban, Gauge, GitBranchPlus, HeartPulse, HelpCircle, Settings, ShieldCheck, Users, Workflow, X } from "lucide-react";
import { NavLink } from "react-router-dom";
import { MetadataOnlyBadge } from "./MetadataOnlyBadge";

const navItems = [
  { key: "command", label: "מרכז פיקוד", icon: Gauge, to: "/" },
  { key: "sites", label: "אתרים מנוהלים", icon: FolderKanban, to: "/sites" },
  { key: "admins", label: "הרשאות וגישה", icon: Users, to: "/admins" },
  { key: "releases", label: "גרסאות ופריסה", icon: GitBranchPlus, to: "/releases" },
  { key: "backup", label: "גיבוי ושחזור", icon: DatabaseBackup, to: "/backups" },
  { key: "jobs", label: "תור פעולות", icon: Workflow, to: "/jobs" },
  { key: "monitoring", label: "התראות", icon: BellRing, to: "/monitoring" },
  { key: "health", label: "תקינות", icon: HeartPulse, to: "/health" },
  { key: "audit", label: "בקרה ו-Audit", icon: FileClock, to: "/audit" },
  { key: "analytics", label: "תובנות", icon: BarChart3, to: "/analytics" },
  { key: "diagnostics", label: "אבחון חיבורים", icon: Cable, to: "/diagnostics" },
  { key: "help", label: "Playbooks והסברים", icon: HelpCircle, to: "/help" },
  { key: "settings", label: "הגדרות מערכת", icon: Settings, to: "/settings" }
];

const navSections = [
  { key: "command", label: "פיקוד ומשימות", items: navItems.slice(0, 1) },
  { key: "sites", label: "אתרים וגישה", items: navItems.slice(1, 3) },
  { key: "deploy", label: "פריסה ושחזור", items: navItems.slice(3, 5) },
  { key: "ops", label: "תפעול ובקרה", items: navItems.slice(5, 10) },
  { key: "system", label: "מערכת וידע", items: navItems.slice(10) }
];

function SidebarContent({
  collapsed = false,
  mobile = false,
  onNavigate,
  onToggleCollapsed
}: {
  collapsed?: boolean;
  mobile?: boolean;
  onNavigate?: () => void;
  onToggleCollapsed?: () => void;
}) {
  return (
    <>
      <div className={`sidebar-brand ${collapsed ? "sidebar-brand-collapsed" : ""}`}>
        <div className="sidebar-brand-mark" aria-hidden="true">SB</div>
        {!collapsed ? (
          <div className="min-w-0">
            <p className="sidebar-brand-title">מרכז שליטה</p>
            <p className="sidebar-brand-subtitle">פיקוד, פריסה, שחזור ובקרה</p>
          </div>
        ) : null}
        {!mobile && onToggleCollapsed ? (
          <button
            className="icon-btn sidebar-collapse-btn"
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "הרחב ניווט" : "צמצם ניווט"}
            title={collapsed ? "הרחב ניווט" : "צמצם ניווט"}
          >
            {collapsed ? <ChevronsLeft size={16} /> : <ChevronsRight size={16} />}
          </button>
        ) : null}
      </div>
      <nav className={`sidebar-nav ${collapsed ? "sidebar-nav-collapsed" : ""}`} aria-label="ניווט ראשי">
        {navSections.map((section) => (
          <div className="sidebar-nav-section" key={section.key}>
            {!collapsed ? <p className="sidebar-section-label">{section.label}</p> : null}
            <div className="sidebar-nav-links">
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.key}
                    to={item.to}
                    end={item.to === "/"}
                    onClick={onNavigate}
                    title={collapsed ? item.label : undefined}
                    aria-label={item.label}
                    className={({ isActive }) =>
                      `sidebar-nav-link ${isActive ? "sidebar-nav-link-active" : ""} ${collapsed ? "sidebar-nav-link-collapsed" : ""}`
                    }
                  >
                    <span className="sidebar-nav-icon" aria-hidden="true"><Icon size={18} /></span>
                    {!collapsed ? <span className="sidebar-nav-text">{item.label}</span> : null}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className={`sidebar-footer ${collapsed ? "sidebar-footer-collapsed" : ""}`}>
        <div className="sidebar-footer-title" title="מצב פעולות">
          <ShieldCheck size={17} />
          {!collapsed ? <span>מצב פעולות</span> : null}
        </div>
        {!collapsed ? (
          <>
            <div className="flex flex-wrap gap-2">
              <MetadataOnlyBadge mode="readonly" />
              <MetadataOnlyBadge mode="notConnected" />
            </div>
            <p className="mt-2 text-xs muted">פעולות כתיבה ל־SharePoint מוצגות רק כאשר השרת מדווח שהיכולת מוגדרת.</p>
          </>
        ) : (
          <div className="sidebar-status-dots" aria-hidden="true">
            <span className="sidebar-status-dot sidebar-status-dot-readonly" />
            <span className="sidebar-status-dot sidebar-status-dot-blocked" />
          </div>
        )}
      </div>
    </>
  );
}

export function Sidebar({
  collapsed = false,
  mobileOpen = false,
  onMobileClose,
  onToggleCollapsed
}: {
  collapsed?: boolean;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  onToggleCollapsed?: () => void;
}) {
  if (onMobileClose) {
    return (
      <div className={`mobile-nav-layer ${mobileOpen ? "mobile-nav-layer-open" : ""}`}>
        <button className="mobile-nav-backdrop" type="button" aria-label="סגור ניווט" onClick={onMobileClose} />
        <aside className="mobile-nav-panel">
          <div className="flex items-center justify-between border-b divider p-3">
            <span className="font-bold" style={{ color: "var(--text-strong)" }}>ניווט</span>
            <button className="icon-btn" type="button" onClick={onMobileClose} aria-label="סגור ניווט"><X size={16} /></button>
          </div>
          <SidebarContent mobile onNavigate={onMobileClose} />
        </aside>
      </div>
    );
  }

  return (
    <aside
      className={`sidebar-shell sidebar-shell-desktop hidden shrink-0 lg:sticky lg:top-24 lg:block ${collapsed ? "sidebar-shell-collapsed" : ""}`}
    >
      <SidebarContent collapsed={collapsed} onToggleCollapsed={onToggleCollapsed} />
    </aside>
  );
}
