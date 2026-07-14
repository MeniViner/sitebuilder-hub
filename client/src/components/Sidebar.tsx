import { BarChart3, BellRing, Cable, ChevronsLeft, ChevronsRight, DatabaseBackup, FileClock, FlaskConical, FolderKanban, Gauge, GitBranchPlus, HeartPulse, HelpCircle, Settings, ShieldCheck, Users, Workflow, X } from "lucide-react";
import { NavLink } from "react-router-dom";
import type { OperationalStatusSnapshot } from "../api/sitesApi";
import { formatDateTime } from "../utils/format";
import { useOperationalStatus } from "./OperationalStatusProvider";

const navItems = [
  { key: "command", label: "מרכז שליטה", icon: Gauge, to: "/" },
  { key: "dashboard-lab", label: "מעבדת דשבורד", icon: FlaskConical, to: "/dashboard-lab" },
  { key: "sites", label: "אתרים", icon: FolderKanban, to: "/sites" },
  { key: "admins", label: "ניהול והרשאות", icon: Users, to: "/admins" },
  { key: "releases", label: "פריסות", icon: GitBranchPlus, to: "/releases" },
  { key: "backup", label: "שחזור וגיבויים", icon: DatabaseBackup, to: "/backups" },
  { key: "jobs", label: "תפעול", icon: Workflow, to: "/jobs" },
  { key: "monitoring", label: "התראות", icon: BellRing, to: "/monitoring" },
  { key: "health", label: "תקינות", icon: HeartPulse, to: "/health" },
  { key: "audit", label: "בקרה ו-Audit", icon: FileClock, to: "/audit" },
  { key: "analytics", label: "תובנות", icon: BarChart3, to: "/analytics" },
  { key: "diagnostics", label: "אבחון חיבורים", icon: Cable, to: "/diagnostics" },
  { key: "help", label: "Playbooks והסברים", icon: HelpCircle, to: "/help" },
  { key: "settings", label: "הגדרות מערכת", icon: Settings, to: "/settings" }
];

const navSections = [
  { key: "command", label: "מרכז שליטה", items: navItems.filter((item) => item.key === "command") },
  { key: "sites", label: "אתרים", items: navItems.filter((item) => item.key === "sites") },
  { key: "deploy", label: "פריסות", items: navItems.filter((item) => item.key === "releases") },
  { key: "recovery", label: "שחזור וגיבויים", items: navItems.filter((item) => item.key === "backup") },
  { key: "ops", label: "תפעול", items: navItems.filter((item) => ["jobs", "monitoring", "health", "analytics"].includes(item.key)) },
  { key: "governance", label: "ניהול והרשאות", items: navItems.filter((item) => ["admins", "audit"].includes(item.key)) },
  { key: "system", label: "מערכת", items: navItems.filter((item) => ["diagnostics", "help", "settings", "dashboard-lab"].includes(item.key)) }
];

type StatusTone = "success" | "warning" | "danger" | "neutral" | "info";

const statusDotClass = (tone: StatusTone) => {
  const classes = {
    success: "badge-success",
    warning: "badge-warning",
    danger: "badge-danger",
    neutral: "badge-neutral",
    info: "badge-info"
  };
  return classes[tone];
};

const browserSharePointLabel = (status: OperationalStatusSnapshot["browserSharePoint"]) => {
  if (status.status === "connected") return "Browser SharePoint מחובר";
  if (status.status === "failed") return "חיבור SharePoint דרך הדפדפן נכשל";
  if (status.status === "refreshing") return "מרענן Browser SharePoint";
  return "SharePoint דרך הדפדפן עדיין לא נבדק";
};

const browserSharePointTone = (status: OperationalStatusSnapshot["browserSharePoint"]["status"]): StatusTone =>
  status === "connected" ? "success" : status === "failed" ? "danger" : status === "refreshing" ? "info" : "neutral";

const builderBackendLabel = (status: OperationalStatusSnapshot["builderBackend"]) => {
  if (status.status === "reachable") return "Builder backend נגיש";
  if (status.status === "configured") return "Builder backend מוגדר";
  if (status.status === "failed") return "Builder backend נכשל";
  if (status.status === "not_relevant") return "Builder backend לא רלוונטי";
  return "Builder backend לא מוגדר";
};

const builderBackendTone = (status: OperationalStatusSnapshot["builderBackend"]["status"]): StatusTone =>
  status === "reachable" ? "success" : status === "configured" ? "info" : status === "failed" ? "danger" : "neutral";

function SidebarStatusRows({ collapsed }: { collapsed?: boolean }) {
  const { status, refreshing } = useOperationalStatus();
  const rows = [
    {
      key: "api",
      label: status.hubApi.status === "connected" ? "Hub API מחובר" : "Hub API נכשל",
      tone: status.hubApi.status === "connected" ? "success" as const : "danger" as const,
      detail: formatDateTime(status.hubApi.checkedAt)
    },
    {
      key: "mongo",
      label: status.hubMongo.status === "connected" ? "Hub Mongo מחובר" : status.hubMongo.status === "failed" ? "Hub Mongo נכשל" : "Hub Mongo לא ידוע",
      tone: status.hubMongo.status === "connected" ? "success" as const : status.hubMongo.status === "failed" ? "danger" as const : "neutral" as const,
      detail: formatDateTime(status.hubMongo.checkedAt)
    },
    {
      key: "browser-sp",
      label: browserSharePointLabel(status.browserSharePoint),
      tone: browserSharePointTone(status.browserSharePoint.status),
      detail: status.browserSharePoint.checkedAt ? formatDateTime(status.browserSharePoint.checkedAt) : status.browserSharePoint.nextStep
    },
    {
      key: "builder",
      label: builderBackendLabel(status.builderBackend),
      tone: builderBackendTone(status.builderBackend.status),
      detail: status.builderBackend.checkedAt ? formatDateTime(status.builderBackend.checkedAt) : status.builderBackend.nextStep
    },
    {
      key: "identity",
      label: status.currentIdentity.label,
      tone: status.currentIdentity.mode === "sharepoint-user" || status.currentIdentity.mode === "explicit-owner" ? "success" as const : status.currentIdentity.mode === "local-dev-fallback" ? "warning" as const : "neutral" as const,
      detail: status.currentIdentity.mode
    }
  ];

  if (collapsed) {
    return (
      <div className="sidebar-status-dots" aria-hidden="true">
        {rows.slice(0, 4).map((row) => <span key={row.key} className={`sidebar-status-dot ${statusDotClass(row.tone)}`} />)}
      </div>
    );
  }

  return (
    <div className="sidebar-status-compact">
      <div className="sidebar-status-summary">
        {rows.slice(0, 4).map((row) => (
          <span key={row.key} className={`sidebar-status-summary-dot ${statusDotClass(row.tone)}`} title={`${row.label}: ${row.detail}`} />
        ))}
        <span>{refreshing ? "מרענן סטטוס..." : status.operationMode.browserSharePointWritesAvailable || status.operationMode.builderBackendMongoOperationsAvailable ? "כתיבה זמינה" : "בדיקה ללא שינוי"}</span>
      </div>
      <p>{status.currentIdentity.label}</p>
    </div>
  );
}

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
          <SidebarStatusRows />
        ) : (
          <SidebarStatusRows collapsed />
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
