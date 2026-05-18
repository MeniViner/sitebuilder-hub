import { AlertTriangle, CheckCircle2, Clock3 } from "lucide-react";
import { SiteHealth } from "../types/site";

const checks: Array<{ key: keyof SiteHealth; label: string; help?: string }> = [
  { key: "siteDbExists", label: "siteDB קיים", help: "ספריית הנתונים הראשית קיימת" },
  { key: "usersDbExists", label: "siteUsersDb קיים", help: "ספריית נתוני המשתמשים קיימת" },
  { key: "distExists", label: "dist קיים", help: "תיקיית build סופית קיימת" },
  { key: "indexExists", label: "index.html קיים", help: "קובץ הכניסה לאתר קיים" },
  { key: "assetsExists", label: "assets קיימים", help: "קבצי JS/CSS קיימים" },
  { key: "txtFilesExist", label: "קבצי TXT קיימים", help: "קבצי JSON/TXT בסיסיים קיימים" },
  { key: "adminsSyncOk", label: "מנהלים מסונכרנים" },
  { key: "permissionsOk", label: "הרשאות תקינות" }
];

export function HealthChecklist({
  health,
  editable = false,
  onChange
}: {
  health?: SiteHealth;
  editable?: boolean;
  onChange?: (next: SiteHealth) => void;
}) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {checks.map((item) => {
        const value = health?.[item.key];
        const tone = value === true ? "var(--success)" : value === false ? "var(--danger)" : "var(--text-subtle)";
        const icon = value === true ? <CheckCircle2 size={15} /> : value === false ? <AlertTriangle size={15} /> : <Clock3 size={15} />;
        return (
          <label key={item.key} className="soft-panel flex min-h-[74px] items-center justify-between gap-3 p-3 text-sm">
            <div className="min-w-0">
              <div className="flex items-center gap-2 font-bold" style={{ color: "var(--text-strong)" }}>
                <span style={{ color: tone }}>{icon}</span>
                {item.label}
              </div>
              {item.help ? <p className="mt-1 text-xs muted">{item.help}</p> : null}
            </div>
            {editable ? (
              <input
                type="checkbox"
                checked={Boolean(value)}
                onChange={(e) => onChange?.({ ...(health || {}), [item.key]: e.target.checked })}
              />
            ) : (
              <span className="badge badge-neutral">{value === undefined ? "לא ידוע" : value ? "כן" : "לא"}</span>
            )}
          </label>
        );
      })}
    </div>
  );
}
