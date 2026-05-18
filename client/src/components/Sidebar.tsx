import { BellRing, DatabaseBackup, FileClock, FolderKanban, Gauge, GitBranchPlus, HeartPulse, Settings, ShieldCheck, Users, Workflow } from "lucide-react";
import { NavLink } from "react-router-dom";
import { MetadataOnlyBadge } from "./MetadataOnlyBadge";

const navItems = [
  { key: "dashboard", label: "דשבורד", icon: Gauge, to: "/" },
  { key: "sites", label: "רשימת אתרים", icon: FolderKanban, to: "/sites" },
  { key: "releases", label: "גרסאות ופריסות", icon: GitBranchPlus, to: "/releases" },
  { key: "backup", label: "גיבויים", icon: DatabaseBackup, to: "/backups" },
  { key: "admins", label: "מנהלים", icon: Users, to: "/admins" },
  { key: "jobs", label: "תורים ו-Jobs", icon: Workflow, to: "/jobs" },
  { key: "monitoring", label: "ניטור והתראות", icon: BellRing, to: "/monitoring" },
  { key: "audit", label: "יומן פעולות", icon: FileClock, to: "/audit" },
  { key: "health", label: "בדיקות תקינות", icon: HeartPulse, to: "/health" },
  { key: "settings", label: "הגדרות", icon: Settings, to: "/settings" }
];

export function Sidebar() {
  return (
    <aside className="surface-card w-full shrink-0 lg:sticky lg:top-24 lg:h-fit lg:w-72">
      <div className="border-b divider p-4">
        <p className="text-sm font-bold" style={{ color: "var(--text-strong)" }}>מרכז שליטה</p>
        <p className="mt-1 text-xs muted">Registry, גרסאות, גיבויים ותפעול</p>
      </div>
      <nav className="space-y-1 p-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.key}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-sm font-semibold transition ${
                  isActive ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-transparent text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-strong)]"
                }`
              }
            >
              <span className="flex min-w-0 items-center gap-2">
                <Icon size={16} />
                <span>{item.label}</span>
              </span>
            </NavLink>
          );
        })}
      </nav>
      <div className="border-t divider p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-bold" style={{ color: "var(--text-strong)" }}>
          <ShieldCheck size={16} />
          מצב פעולות
        </div>
        <div className="flex flex-wrap gap-2">
          <MetadataOnlyBadge mode="readonly" />
          <MetadataOnlyBadge mode="notConnected" />
        </div>
        <p className="mt-2 text-xs muted">פעולות כתיבה ל־SharePoint מוצגות רק כאשר השרת מדווח שהיכולת מוגדרת.</p>
      </div>
    </aside>
  );
}
