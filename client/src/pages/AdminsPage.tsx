import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clipboard,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Filter,
  Layers,
  ListChecks,
  Lock,
  MoreVertical,
  RefreshCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  UserPlus,
  Users,
  XCircle
} from "lucide-react";
import {
  AccessChangeAction,
  AccessChangePlan,
  AccessDirectory,
  AccessDirectorySite,
  AccessDirectoryUser,
  AccessRoleType,
  AccessSourceType,
  AccessUserStatus,
  sitesApi
} from "../api/sitesApi";
import { AdminLiveReadMeta, AdminSourceStatusTable } from "../components/AdminSourceSummaryCards";
import { DataTable } from "../components/DataTable";
import { DetailsDrawer } from "../components/DetailsDrawer";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { MetadataOnlyBadge } from "../components/MetadataOnlyBadge";
import { PageHeader } from "../components/PageHeader";
import { SectionCard } from "../components/SectionCard";
import { useBrowserAdminsLiveRead } from "../hooks/useBrowserAdminsLiveRead";
import { Site } from "../types/site";
import { defaultAccessFilters, filterAccessUsers, AccessQuickView, AccessSortKey, AccessUserFilters } from "../utils/accessDirectory";
import { formatDateTime, formatNumber } from "../utils/format";

type TabKey = "overview" | "users" | "sources" | "drift" | "history";
type ActionWizardState = { action: AccessChangeAction; user: AccessDirectoryUser } | null;

const tabs: Array<{ key: TabKey; label: string; icon: JSX.Element }> = [
  { key: "overview", label: "תמונת מצב", icon: <ShieldCheck size={15} /> },
  { key: "users", label: "כל המשתמשים", icon: <Users size={15} /> },
  { key: "sources", label: "מקורות הרשאה", icon: <Layers size={15} /> },
  { key: "drift", label: "פערים וסנכרון", icon: <AlertTriangle size={15} /> },
  { key: "history", label: "היסטוריית פעולות", icon: <FileText size={15} /> }
];

const quickViews: Array<{ key: AccessQuickView; label: string }> = [
  { key: "all", label: "כל המשתמשים" },
  { key: "admins", label: "מנהלים בלבד" },
  { key: "drift", label: "פערי הרשאה" },
  { key: "failed-sources", label: "מקורות שנכשלו" },
  { key: "production", label: "משתמשים בייצור" },
  { key: "not-verified", label: "לא אומתו" }
];

const roleOptions: Array<{ value: AccessRoleType; label: string }> = [
  { value: "regular-user", label: "משתמש רגיל" },
  { value: "app-admin", label: "מנהל אפליקציה" },
  { value: "site-owner", label: "בעל אתר" },
  { value: "hub-metadata-owner", label: "בעלים ב־HUB metadata" },
  { value: "hub-metadata-admin", label: "מנהל ב־HUB metadata" },
  { value: "sharepoint-owners-group", label: "SharePoint Owners Group" },
  { value: "sharepoint-site-collection-admin", label: "SharePoint Site Collection Admin" },
  { value: "unknown", label: "לא ידוע" }
];

const sourceOptions: Array<{ value: AccessSourceType; label: string }> = [
  { value: "mongo-users-data", label: "מקור אמת: Mongo / Builder backend" },
  { value: "builder-backend-users", label: "Builder backend users" },
  { value: "txt-users-data", label: "TXT users_data.txt" },
  { value: "txt-admins", label: "TXT admins" },
  { value: "hub-metadata-owner", label: "HUB metadata owner" },
  { value: "hub-metadata-admin", label: "HUB metadata admin" },
  { value: "sharepoint-owners-group", label: "SharePoint Owners Group" },
  { value: "sharepoint-site-collection-admin", label: "SharePoint Site Collection" },
  { value: "unknown", label: "לא ידוע" }
];

const statusOptions: Array<{ value: AccessUserStatus; label: string }> = [
  { value: "healthy", label: "תקין" },
  { value: "conflict", label: "דורש בדיקה" },
  { value: "stale", label: "לא אומת" },
  { value: "source-failed", label: "נכשל" },
  { value: "missing-email", label: "חסר מייל" },
  { value: "duplicate-identity", label: "זהות כפולה" },
  { value: "not-verified", label: "לא אומת" }
];

const sortOptions: Array<{ value: AccessSortKey; label: string }> = [
  { value: "displayName", label: "שם תצוגה" },
  { value: "personalNumber", label: "מספר אישי" },
  { value: "email", label: "מייל" },
  { value: "sitesCount", label: "מספר אתרים" },
  { value: "highestAccess", label: "רמת גישה גבוהה" },
  { value: "lastVerifiedAt", label: "אימות אחרון" }
];

const roleLabel = (value: string) => roleOptions.find((item) => item.value === value)?.label || value || "לא ידוע";
const sourceLabel = (value: string) => sourceOptions.find((item) => item.value === value)?.label || value || "לא ידוע";
const statusLabel = (value: string) => statusOptions.find((item) => item.value === value)?.label || value || "לא ידוע";

const statusClass = (value: string) => {
  if (value === "healthy" || value === "success") return "badge-success";
  if (value === "conflict" || value === "stale" || value === "skipped" || value === "not-verified") return "badge-warning";
  if (value === "source-failed" || value === "failed" || value === "duplicate-identity") return "badge-danger";
  return "badge-neutral";
};

const readStatusLabel = (value: string) => {
  if (value === "success") return "תקין";
  if (value === "failed") return "הקריאה נכשלה";
  if (value === "stale") return "לא אומת";
  if (value === "skipped") return "לא נקרא";
  return "לא ידוע";
};

const authorityLabel = (value: string) => {
  if (value === "authoritative") return "מקור אמת";
  if (value === "hosting") return "הרשאת אירוח";
  if (value === "metadata") return "HUB metadata";
  if (value === "supporting") return "מקור תומך";
  return "לא ידוע";
};

const executionModeLabel = (value?: string) => {
  if (value === "browser-sharepoint") return "Browser SharePoint";
  if (value === "mongo-backend") return "Mongo Backend";
  if (value === "server-local") return "server-local";
  if (value === "backend-service-auth-required") return "נדרשת הרשאת שרת";
  if (value === "metadata-only") return "metadata-only";
  if (value === "manual") return "ידני";
  return "לא ידוע";
};

const unique = <T,>(values: T[]) => Array.from(new Set(values.filter(Boolean)));
const userPrimaryEmail = (user: AccessDirectoryUser) => user.emails[0] || "";

function useDialogFocus(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = ref.current;
    const selector = "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])";
    const focusable = Array.from(panel?.querySelectorAll<HTMLElement>(selector) || []).filter((node) => !node.hasAttribute("disabled"));
    (focusable[0] || panel)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const nodes = Array.from(panel.querySelectorAll<HTMLElement>(selector)).filter((node) => !node.hasAttribute("disabled"));
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocusRef.current?.focus?.();
    };
  }, [onClose, open]);

  return ref;
}

function StatusBadges({ statuses }: { statuses: string[] }) {
  return (
    <div className="mini-filter-row mini-filter-row-tight">
      {statuses.map((status) => (
        <span key={status} className={`badge ${statusClass(status)}`}>{statusLabel(status)}</span>
      ))}
    </div>
  );
}

function SourceBadges({ sources, limit = 3 }: { sources: string[]; limit?: number }) {
  const visible = sources.slice(0, limit);
  return (
    <div className="mini-filter-row mini-filter-row-tight">
      {visible.map((source) => <span key={source} className="badge badge-neutral">{sourceLabel(source)}</span>)}
      {sources.length > visible.length ? <span className="badge badge-info">+{formatNumber(sources.length - visible.length)}</span> : null}
    </div>
  );
}

function AccessMetric({ label, value, detail, tone = "neutral" }: { label: string; value: string | number; detail?: string; tone?: "neutral" | "success" | "warning" | "danger" | "info" }) {
  return (
    <div className={`access-metric access-metric-${tone}`}>
      <span className="access-metric-label">{label}</span>
      <strong className="access-metric-value">{value}</strong>
      {detail ? <span className="access-metric-detail">{detail}</span> : null}
    </div>
  );
}

function ActiveFilterChips({ filters, sites, onChange }: { filters: AccessUserFilters; sites: AccessDirectorySite[]; onChange: (filters: AccessUserFilters) => void }) {
  const chips = [
    filters.search ? { key: "search", label: `חיפוש: ${filters.search}`, clear: () => onChange({ ...filters, search: "" }) } : null,
    filters.siteId ? { key: "site", label: `אתר: ${sites.find((site) => site.siteId === filters.siteId)?.displayName || filters.siteId}`, clear: () => onChange({ ...filters, siteId: "" }) } : null,
    filters.environment ? { key: "environment", label: `סביבה: ${filters.environment}`, clear: () => onChange({ ...filters, environment: "" }) } : null,
    filters.storageBackend ? { key: "storage", label: `Backend: ${filters.storageBackend}`, clear: () => onChange({ ...filters, storageBackend: "" }) } : null,
    filters.role ? { key: "role", label: `תפקיד: ${roleLabel(filters.role)}`, clear: () => onChange({ ...filters, role: "" }) } : null,
    filters.source ? { key: "source", label: `מקור: ${sourceLabel(filters.source)}`, clear: () => onChange({ ...filters, source: "" }) } : null,
    filters.status ? { key: "status", label: `סטטוס: ${statusLabel(filters.status)}`, clear: () => onChange({ ...filters, status: "" }) } : null
  ].filter(Boolean) as Array<{ key: string; label: string; clear: () => void }>;

  if (!chips.length) return null;
  return (
    <div className="active-filter-row">
      {chips.map((chip) => (
        <button key={chip.key} className="filter-chip" type="button" onClick={chip.clear} aria-label={`הסר ${chip.label}`}>
          {chip.label}
          <XCircle size={13} />
        </button>
      ))}
      <button className="btn btn-ghost" type="button" onClick={() => onChange({ ...defaultAccessFilters })}>נקה הכל</button>
    </div>
  );
}

function ActionMenu({
  user,
  open,
  onToggle,
  onClose,
  onProfile,
  onWizard,
  onEvidence,
  onCopy,
  onExport
}: {
  user: AccessDirectoryUser;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onProfile: () => void;
  onWizard: (action: AccessChangeAction) => void;
  onEvidence: () => void;
  onCopy: () => void;
  onExport: () => void;
}) {
  const menuId = useId();
  const firstSite = user.sites[0];

  const openUserSites = () => {
    if (firstSite?.siteId) window.location.hash = `#/sites/${firstSite.siteId}`;
    onClose();
  };

  const item = (label: string, onClick: () => void, icon: JSX.Element) => (
    <button className="access-action-menu-item" role="menuitem" type="button" onClick={() => { onClick(); onClose(); }}>
      {icon}
      {label}
    </button>
  );

  return (
    <div className="access-action-menu-wrap">
      <button
        className="icon-btn"
        type="button"
        aria-label="פעולות נוספות"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={onToggle}
      >
        <MoreVertical size={16} />
      </button>
      {open ? (
        <div id={menuId} className="access-action-menu" role="menu" onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}>
          {item("צפה בפרופיל", onProfile, <Eye size={14} />)}
          {item("הוסף לאתר אחר", () => onWizard("add-to-site"), <UserPlus size={14} />)}
          {item("הסר מאתר", () => onWizard("remove-from-site"), <Lock size={14} />)}
          {item("שנה הרשאה", () => onWizard("change-access"), <SlidersHorizontal size={14} />)}
          {item("הצג מקורות וראיות", onEvidence, <ListChecks size={14} />)}
          {item("פתח אתרי המשתמש", openUserSites, <ExternalLink size={14} />)}
          {item("העתק פרטים", onCopy, <Clipboard size={14} />)}
          {item("ייצא שורה", onExport, <Download size={14} />)}
        </div>
      ) : null}
    </div>
  );
}

function UsersTable({
  users,
  openMenuId,
  setOpenMenuId,
  onProfile,
  onWizard,
  onEvidence,
  onCopy,
  onExport
}: {
  users: AccessDirectoryUser[];
  openMenuId: string;
  setOpenMenuId: (id: string) => void;
  onProfile: (user: AccessDirectoryUser) => void;
  onWizard: (state: ActionWizardState) => void;
  onEvidence: (user: AccessDirectoryUser) => void;
  onCopy: (user: AccessDirectoryUser) => void;
  onExport: (user: AccessDirectoryUser) => void;
}) {
  if (!users.length) {
    return <EmptyState title="לא נמצאו משתמשים" description="אין משתמשים שתואמים למסננים הנוכחיים. אפשר להרחיב חיפוש או לנקות מסננים." />;
  }

  const mobileCard = (user: AccessDirectoryUser) => (
    <div className="access-mobile-user-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold" style={{ color: "var(--text-strong)" }}>{user.displayName}</p>
          <p className="num truncate text-xs muted">{userPrimaryEmail(user) || user.normalizedPersonalNumber || "זהות חלקית"}</p>
        </div>
        <ActionMenu
          user={user}
          open={openMenuId === user.principalId}
          onToggle={() => setOpenMenuId(openMenuId === user.principalId ? "" : user.principalId)}
          onClose={() => setOpenMenuId("")}
          onProfile={() => onProfile(user)}
          onWizard={(action) => onWizard({ action, user })}
          onEvidence={() => onEvidence(user)}
          onCopy={() => onCopy(user)}
          onExport={() => onExport(user)}
        />
      </div>
      <div className="mt-3 grid gap-2 text-sm">
        <span><strong>{formatNumber(user.sites.length)}</strong> אתרים</span>
        <SourceBadges sources={user.sources} />
        <StatusBadges statuses={user.status} />
      </div>
    </div>
  );

  return (
    <div className="access-users-table-shell">
      <div className="access-table-desktop">
        <table className="data-table access-users-table">
          <thead>
            <tr>
              <th>משתמש</th>
              <th>מספר אישי</th>
              <th>יחידה / בעלים</th>
              <th>אתרים</th>
              <th>סיכום גישה</th>
              <th>מקורות</th>
              <th>סביבות</th>
              <th>סטטוס</th>
              <th>אומת לאחרונה</th>
              <th className="access-sticky-actions">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.principalId}>
                <td>
                  <div className="min-w-0">
                    <button className="access-link-button" type="button" onClick={() => onProfile(user)}>{user.displayName}</button>
                    <p className="num truncate text-xs muted">{userPrimaryEmail(user) || "חסר מייל"}</p>
                  </div>
                </td>
                <td className="num">{user.normalizedPersonalNumber || "-"}</td>
                <td>{user.unitName || "-"}</td>
                <td className="num">{formatNumber(user.sites.length)}</td>
                <td>
                  <div className="mini-filter-row mini-filter-row-tight">
                    {user.roles.slice(0, 3).map((role) => <span key={role} className="badge badge-info">{roleLabel(role)}</span>)}
                    {user.roles.length > 3 ? <span className="badge badge-neutral">+{formatNumber(user.roles.length - 3)}</span> : null}
                  </div>
                </td>
                <td><SourceBadges sources={user.sources} /></td>
                <td>{unique(user.sites.map((site) => site.environment)).join(", ") || "-"}</td>
                <td><StatusBadges statuses={user.status} /></td>
                <td className="num text-xs">{formatDateTime(user.lastVerifiedAt)}</td>
                <td className="access-sticky-actions">
                  <ActionMenu
                    user={user}
                    open={openMenuId === user.principalId}
                    onToggle={() => setOpenMenuId(openMenuId === user.principalId ? "" : user.principalId)}
                    onClose={() => setOpenMenuId("")}
                    onProfile={() => onProfile(user)}
                    onWizard={(action) => onWizard({ action, user })}
                    onEvidence={() => onEvidence(user)}
                    onCopy={() => onCopy(user)}
                    onExport={() => onExport(user)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mobile-row-list access-users-mobile">
        {users.map((user) => <div key={user.principalId} className="mobile-row-card">{mobileCard(user)}</div>)}
      </div>
    </div>
  );
}

function UserProfileDrawer({ user, open, onClose }: { user: AccessDirectoryUser | null; open: boolean; onClose: () => void }) {
  return (
    <DetailsDrawer
      open={open && Boolean(user)}
      title={user?.displayName || "פרופיל משתמש"}
      subtitle="זהות, אתרים, מקורות הרשאה וראיות"
      onClose={onClose}
    >
      {user ? (
        <div className="space-y-5">
          <section className="access-drawer-section">
            <h3>סיכום זהות</h3>
            <div className="access-detail-grid">
              <div><span>שם</span><strong>{user.displayName}</strong></div>
              <div><span>מספר אישי</span><strong className="num">{user.normalizedPersonalNumber || "-"}</strong></div>
              <div><span>מייל</span><strong className="num">{userPrimaryEmail(user) || "-"}</strong></div>
              <div><span>יחידה</span><strong>{user.unitName || "-"}</strong></div>
            </div>
            <div className="mt-3">
              <p className="field-label">Aliases</p>
              <div className="mini-filter-row">
                {user.aliases.length ? user.aliases.map((alias) => <span key={alias} className="badge badge-neutral num">{alias}</span>) : <span className="muted">אין aliases</span>}
              </div>
            </div>
          </section>

          <section className="access-drawer-section">
            <h3>גישה אפקטיבית</h3>
            <div className="mini-filter-row">
              {user.roles.map((role) => <span key={role} className="badge badge-info">{roleLabel(role)}</span>)}
            </div>
            <div className="mt-3"><StatusBadges statuses={user.status} /></div>
          </section>

          <section className="access-drawer-section">
            <h3>אתרי המשתמש</h3>
            <DataTable columns={[
              { header: "אתר" },
              { header: "תפקיד" },
              { header: "מקור" },
              { header: "סטטוס קריאה" },
              { header: "אומת" }
            ]} minWidth={760} density="dense">
              {user.sites.map((site) => (
                <tr key={`${site.siteId}-${site.sourceType}-${site.roleType}`}>
                  <td>
                    <strong>{site.displayName}</strong>
                    <p className="num text-xs muted">{site.siteCode} · {site.environment} · {site.storageBackend}</p>
                  </td>
                  <td>{roleLabel(site.roleType)}</td>
                  <td>
                    <span className="badge badge-neutral">{sourceLabel(site.sourceType)}</span>
                    <p className="mt-1 text-xs muted">{authorityLabel(site.sourceAuthority)}</p>
                  </td>
                  <td><span className={`badge ${statusClass(site.readStatus)}`}>{readStatusLabel(site.readStatus)}</span></td>
                  <td className="num text-xs">{formatDateTime(site.lastReadAt)}</td>
                </tr>
              ))}
            </DataTable>
          </section>

          <section className="access-drawer-section">
            <h3>פערים והמלצה</h3>
            {user.conflicts.length ? (
              <ul className="access-clean-list">
                {user.conflicts.map((conflict) => <li key={conflict}>{conflict}</li>)}
              </ul>
            ) : <p className="muted">לא זוהו פערים מפורשים עבור המשתמש במקורות שנקראו.</p>}
            <p className="mt-3 rounded-lg border p-3 text-sm" style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}>
              {user.status.includes("source-failed") || user.status.includes("stale")
                ? "מומלץ לרענן את מקור ההרשאה שנכשל לפני פעולה."
                : user.status.includes("conflict")
                  ? "מומלץ לבדוק את מקור האמת של האתר ולהכין תוכנית שינוי לפני ביצוע."
                  : "אין פעולה דחופה. כל שינוי הרשאה עדיין צריך לעבור דרך תוכנית ואישור."}
            </p>
          </section>

          <details className="access-technical-details">
            <summary>פרטים טכניים</summary>
            <div className="mt-3 space-y-3">
              {user.sites.map((site) => (
                <div key={`${site.siteId}-${site.sourceType}-${site.effectiveAccess}`} className="soft-panel p-3">
                  <p className="font-bold" style={{ color: "var(--text-strong)" }}>{site.displayName} · {sourceLabel(site.sourceType)}</p>
                  <p className="num mt-1 text-xs muted">{site.evidence.sourceUrl || site.evidence.errorCode || "אין evidence URL"}</p>
                  {site.evidence.httpStatus ? <p className="num mt-1 text-xs muted">HTTP {site.evidence.httpStatus} {site.evidence.httpStatusText || ""}</p> : null}
                  {site.evidence.errorMessage ? <p className="mt-1 text-xs" style={{ color: "var(--danger)" }}>{site.evidence.errorMessage}</p> : null}
                  {[...site.warnings, ...site.blockers].length ? (
                    <ul className="access-clean-list mt-2 text-xs">
                      {[...site.warnings, ...site.blockers].map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
          </details>
        </div>
      ) : null}
    </DetailsDrawer>
  );
}

function EvidenceDrawer({ user, open, onClose }: { user: AccessDirectoryUser | null; open: boolean; onClose: () => void }) {
  return (
    <DetailsDrawer open={open && Boolean(user)} title="מקורות וראיות" subtitle={user?.displayName} onClose={onClose}>
      {user ? (
        <div className="space-y-4">
          {user.sites.map((site) => (
            <section key={`${site.siteId}-${site.sourceType}-${site.roleType}`} className="access-drawer-section">
              <h3>{site.displayName}</h3>
              <div className="access-detail-grid">
                <div><span>מקור</span><strong>{sourceLabel(site.sourceType)}</strong></div>
                <div><span>סמכות</span><strong>{authorityLabel(site.sourceAuthority)}</strong></div>
                <div><span>סטטוס</span><strong>{readStatusLabel(site.readStatus)}</strong></div>
                <div><span>אומת</span><strong className="num">{formatDateTime(site.lastReadAt)}</strong></div>
              </div>
              <div className="mt-3 rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}>
                <p className="field-label">פרטים טכניים</p>
                <p className="num break-all text-xs muted">{site.evidence.sourceUrl || site.evidence.errorCode || "אין מקור evidence מפורש"}</p>
                {site.evidence.errorMessage ? <p className="mt-2 text-sm" style={{ color: "var(--danger)" }}>{site.evidence.errorMessage}</p> : null}
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </DetailsDrawer>
  );
}

function PlanWizard({
  state,
  directory,
  onClose,
  onPlanned
}: {
  state: ActionWizardState;
  directory: AccessDirectory | null;
  onClose: () => void;
  onPlanned: (message: string) => void;
}) {
  const open = Boolean(state && directory);
  const dialogTitleId = useId();
  const [step, setStep] = useState(1);
  const [siteQuery, setSiteQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [targetSiteIds, setTargetSiteIds] = useState<string[]>([]);
  const [targetSource, setTargetSource] = useState<AccessSourceType>("mongo-users-data");
  const [targetRole, setTargetRole] = useState<AccessRoleType>("regular-user");
  const [reason, setReason] = useState("");
  const [plan, setPlan] = useState<AccessChangePlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useDialogFocus(open, onClose);

  useEffect(() => {
    if (!open || !state) return;
    setStep(1);
    setSiteQuery("");
    setShowArchived(false);
    setTargetSiteIds([]);
    setTargetSource(state.action === "remove-from-site" ? state.user.sources[0] || "txt-users-data" : "mongo-users-data");
    setTargetRole(state.action === "remove-from-site" ? state.user.roles[0] || "regular-user" : "regular-user");
    setReason("");
    setPlan(null);
    setError("");
  }, [open, state]);

  const sites = directory?.sites || [];
  const filteredSites = sites.filter((site) => {
    if (!showArchived && site.archived) return false;
    const query = siteQuery.trim().toLowerCase();
    if (!query) return true;
    return [site.displayName, site.siteCode, site.environment, site.storageBackend].join(" ").toLowerCase().includes(query);
  });

  const selectedUser = state?.user;
  const selectedSites = sites.filter((site) => targetSiteIds.includes(site.siteId));
  const actionLabel = state?.action === "remove-from-site" ? "הסרת גישה" : state?.action === "change-access" ? "שינוי הרשאה" : "הוספה לאתר";
  const canContinue =
    step === 1 ? Boolean(selectedUser) :
    step === 2 ? targetSiteIds.length > 0 :
    step === 3 ? Boolean(targetSource && targetRole) :
    true;

  const buildPlan = async () => {
    if (!state) return;
    setBusy(true);
    setError("");
    try {
      const response = await sitesApi.planAccessChange({
        action: state.action,
        principalId: state.user.principalId,
        targetSiteIds,
        sourceType: targetSource,
        roleType: targetRole,
        reason
      });
      setPlan(response.data);
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בבניית תוכנית");
    } finally {
      setBusy(false);
    }
  };

  const next = () => {
    if (step === 3) void buildPlan();
    else setStep((current) => Math.min(5, current + 1));
  };

  const closeWithPlanOnly = () => {
    onPlanned(plan?.blockers.length ? "נבנתה תוכנית בלבד. הפעולה חסומה ולא בוצעה כתיבה." : "נבנתה תוכנית פעולה. לא בוצעה כתיבה.");
    onClose();
  };

  if (!open || !state || !selectedUser || !directory) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div ref={dialogRef} className="surface-card access-plan-dialog" role="dialog" aria-modal="true" aria-labelledby={dialogTitleId} tabIndex={-1}>
        <header className="access-plan-header">
          <div>
            <p className="subtle text-xs font-bold">Access Governance</p>
            <h2 id={dialogTitleId}>{actionLabel}</h2>
            <p className="muted text-sm">כל שינוי מתחיל בתוכנית, לפני פעולה חיה ולפני אישור.</p>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="סגור"><XCircle size={16} /></button>
        </header>

        <div className="operation-stepper px-5 pt-4">
          {["זהות", "אתרים", "מקור", "תוכנית", "אישור"].map((label, index) => (
            <div key={label} className={`operation-step ${step === index + 1 ? "operation-step-active" : step > index + 1 ? "operation-step-done" : ""}`}>
              <span className="operation-step-number">{index + 1}</span>
              <p className="operation-step-title">{label}</p>
            </div>
          ))}
        </div>

        <div className="access-plan-body">
          {error ? <ErrorState message={error} /> : null}

          {step === 1 ? (
            <div className="space-y-4">
              <div className="access-identity-confirm">
                <div>
                  <p className="font-bold" style={{ color: "var(--text-strong)" }}>{selectedUser.displayName}</p>
                  <p className="num text-sm muted">{selectedUser.normalizedPersonalNumber || userPrimaryEmail(selectedUser) || selectedUser.principalId}</p>
                </div>
                <StatusBadges statuses={selectedUser.status} />
              </div>
              {(selectedUser.status.includes("missing-email") || selectedUser.status.includes("duplicate-identity")) ? (
                <div className="rounded-lg border p-3 text-sm" style={{ background: "var(--warning-soft)", borderColor: "color-mix(in srgb, var(--warning) 35%, var(--border))" }}>
                  זהות המשתמש חלקית או כפולה. אפשר לבנות תוכנית, אבל אין לבצע שינוי חי לפני אימות מייל/מספר אישי.
                </div>
              ) : null}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <label>
                  <span className="field-label">חיפוש אתר</span>
                  <input className="control" value={siteQuery} onChange={(event) => setSiteQuery(event.target.value)} placeholder="שם אתר, קוד, סביבה או backend" />
                </label>
                <label className="flex items-end gap-2 pb-2 text-sm">
                  <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
                  הצג אתרים בארכיון
                </label>
              </div>
              <div className="access-site-picker">
                {filteredSites.map((site) => {
                  const checked = targetSiteIds.includes(site.siteId);
                  return (
                    <label key={site.siteId} className="access-site-option">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => setTargetSiteIds((current) => event.target.checked ? unique([...current, site.siteId]) : current.filter((id) => id !== site.siteId))}
                      />
                      <span className="min-w-0">
                        <strong>{site.displayName}</strong>
                        <span className="num muted">{site.siteCode} · {site.environment} · {site.storageBackend}</span>
                      </span>
                      <span className={`badge ${statusClass(site.sourceHealth)}`}>{readStatusLabel(site.sourceHealth)}</span>
                      <span className="badge badge-warning">תוכנית בלבד</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <label>
                  <span className="field-label">מקור יעד</span>
                  <select className="control" value={targetSource} onChange={(event) => setTargetSource(event.target.value as AccessSourceType)}>
                    {sourceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label>
                  <span className="field-label">סוג גישה</span>
                  <select className="control" value={targetRole} onChange={(event) => setTargetRole(event.target.value as AccessRoleType)}>
                    {roleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
              </div>
              <div className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}>
                <p className="font-bold" style={{ color: "var(--text-strong)" }}>בחירה מקורית ומודעת מקור</p>
                <p className="mt-1 muted">Mongo/TXT מייצגים מקורות אפליקטיביים. SharePoint Owners ו־Site Collection הם מקורות אירוח ולא הוכחת מנהל אפליקציה באתרי Mongo.</p>
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-4">
              {busy ? <LoadingState label="בונה תוכנית..." /> : null}
              {plan ? (
                <>
                  <div className="access-plan-summary">
                    <AccessMetric label="מצב ביצוע" value={plan.canExecute ? "כתיבה פעילה" : plan.blockers.length ? "פעולה חסומה" : "תוכנית בלבד"} tone={plan.canExecute ? "success" : plan.blockers.length ? "danger" : "warning"} />
                    <AccessMetric label="Execution mode" value={executionModeLabel(plan.executionMode)} tone="info" />
                    <AccessMetric label="אתרים מושפעים" value={formatNumber(plan.affectedSites.length)} />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="field-label">מה ישתנה</p>
                      <ul className="access-clean-list">{plan.willChange.map((item) => <li key={item}>{item}</li>)}</ul>
                    </div>
                    <div>
                      <p className="field-label">מה לא ישתנה</p>
                      <ul className="access-clean-list">{plan.willNotChange.map((item) => <li key={item}>{item}</li>)}</ul>
                    </div>
                  </div>
                  <DataTable columns={[{ header: "אתר" }, { header: "לפני" }, { header: "אחרי" }, { header: "יכולת" }]} minWidth={760} density="dense">
                    {plan.affectedSites.map((site) => (
                      <tr key={site.siteId}>
                        <td>{site.displayName}<p className="num text-xs muted">{site.siteCode} · {site.environment}</p></td>
                        <td>{site.before}</td>
                        <td>{site.after}</td>
                        <td><span className="badge badge-warning">{site.writeCapability === "plan-only" ? "תוכנית בלבד" : site.writeCapability}</span></td>
                      </tr>
                    ))}
                  </DataTable>
                  {plan.blockers.length ? (
                    <div className="rounded-lg border p-3 text-sm" style={{ background: "var(--danger-soft)", borderColor: "color-mix(in srgb, var(--danger) 38%, var(--border))" }}>
                      <p className="field-label" style={{ color: "var(--danger)" }}>חסמים</p>
                      <ul className="access-clean-list">{plan.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
                    </div>
                  ) : null}
                  {plan.warnings.length ? (
                    <div className="rounded-lg border p-3 text-sm" style={{ background: "var(--warning-soft)", borderColor: "color-mix(in srgb, var(--warning) 35%, var(--border))" }}>
                      <p className="field-label" style={{ color: "var(--warning)" }}>אזהרות</p>
                      <ul className="access-clean-list">{plan.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
                    </div>
                  ) : null}
                </>
              ) : (
                <button className="btn btn-primary" type="button" onClick={buildPlan} disabled={busy}>בנה תוכנית</button>
              )}
            </div>
          ) : null}

          {step === 5 ? (
            <div className="space-y-4">
              <label>
                <span className="field-label">נימוק לשינוי הרשאה</span>
                <textarea className="control min-h-28" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="נדרש נימוק לכל שינוי הרשאה" />
              </label>
              {plan?.blockers.length ? (
                <div className="rounded-lg border p-3" style={{ background: "var(--danger-soft)", borderColor: "color-mix(in srgb, var(--danger) 38%, var(--border))" }}>
                  <p className="font-bold" style={{ color: "var(--danger)" }}>הפעולה חסומה</p>
                  <p className="mt-1 text-sm muted">אין כפתור ביצוע כי write path מאומת אינו ממומש למקור הזה. אפשר לשמור את התוכנית כהנחיית עבודה ידנית.</p>
                </div>
              ) : (
                <div className="rounded-lg border p-3" style={{ background: "var(--warning-soft)", borderColor: "color-mix(in srgb, var(--warning) 35%, var(--border))" }}>
                  <p className="font-bold" style={{ color: "var(--warning)" }}>תוכנית בלבד</p>
                  <p className="mt-1 text-sm muted">ה־Hub לא יבצע כתיבה חיה בלי evidence ומימוש כתיבה מפורש.</p>
                </div>
              )}
            </div>
          ) : null}
        </div>

        <footer className="access-plan-footer">
          <button className="btn btn-secondary" type="button" onClick={onClose}>ביטול</button>
          <div className="flex flex-wrap gap-2">
            {step > 1 ? <button className="btn btn-secondary" type="button" onClick={() => setStep((current) => Math.max(1, current - 1))}>חזרה</button> : null}
            {step < 5 ? (
              <button className="btn btn-primary" type="button" onClick={next} disabled={!canContinue || busy}>
                {step === 3 ? "בנה תוכנית" : "המשך"}
              </button>
            ) : (
              <button className="btn btn-primary" type="button" onClick={closeWithPlanOnly} disabled={!reason.trim()}>
                {plan?.blockers.length ? "סגור כתוכנית חסומה" : "סגור כתוכנית בלבד"}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

export function AdminsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [directory, setDirectory] = useState<AccessDirectory | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [adminData, setAdminData] = useState<any>(null);
  const [filters, setFilters] = useState<AccessUserFilters>({ ...defaultAccessFilters });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [profileUser, setProfileUser] = useState<AccessDirectoryUser | null>(null);
  const [evidenceUser, setEvidenceUser] = useState<AccessDirectoryUser | null>(null);
  const [wizardState, setWizardState] = useState<ActionWizardState>(null);
  const [openMenuId, setOpenMenuId] = useState("");

  const selectedSite = useMemo(() => sites.find((site) => site._id === selectedSiteId) || null, [selectedSiteId, sites]);
  const directorySites = directory?.sites || [];
  const environments = useMemo(() => unique(directorySites.map((site) => site.environment)).sort(), [directorySites]);
  const storageBackends = useMemo(() => unique(directorySites.map((site) => site.storageBackend)).sort(), [directorySites]);
  const filteredUsers = useMemo(() => filterAccessUsers(directory?.users || [], filters), [directory?.users, filters]);
  const failedSources = useMemo(() => (directory?.sourceMatrix || []).filter((source) => source.status === "failed" || source.status === "stale"), [directory]);
  const driftUsers = useMemo(() => (directory?.users || []).filter((user) => user.status.includes("conflict") || user.status.includes("source-failed") || user.status.includes("stale")), [directory]);
  const sourceRowsForSelectedSite = useMemo(() => (directory?.sourceMatrix || []).filter((source) => !selectedSiteId || source.siteId === selectedSiteId), [directory, selectedSiteId]);

  const load = useCallback(async (siteId?: string) => {
    setLoading(true);
    setError("");
    try {
      const [directoryRes, sitesRes] = await Promise.all([sitesApi.accessDirectory(), sitesApi.list()]);
      setDirectory(directoryRes.data);
      setSites(sitesRes.data);
      const nextSiteId = siteId || selectedSiteId || sitesRes.data[0]?._id || "";
      setSelectedSiteId(nextSiteId);
      if (nextSiteId) {
        try {
          const adminRes = await sitesApi.siteAdmins(nextSiteId);
          setAdminData(adminRes.data);
        } catch {
          setAdminData(null);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בטעינת Access Governance");
    } finally {
      setLoading(false);
    }
  }, [selectedSiteId]);

  useEffect(() => { void load(); }, [load]);

  const {
    liveData,
    setLiveData,
    busy: adminsLiveReadBusy,
    runLiveRead
  } = useBrowserAdminsLiveRead({
    site: selectedSite,
    adminData,
    auto: false,
    onPersisted: (summary) => {
      setAdminData(summary);
      void load(selectedSiteId);
    },
    onMessage: setMessage,
    onError: setError
  });

  const runAction = async (key: string, action: () => Promise<void>) => {
    setBusyAction(key);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בביצוע פעולה");
    } finally {
      setBusyAction("");
    }
  };

  const copyUser = async (user: AccessDirectoryUser) => {
    const text = [
      user.displayName,
      user.normalizedPersonalNumber,
      userPrimaryEmail(user),
      `${user.sites.length} אתרים`,
      user.roles.map(roleLabel).join(", ")
    ].filter(Boolean).join(" | ");
    await navigator.clipboard?.writeText(text);
    setMessage("פרטי המשתמש הועתקו");
  };

  const exportUser = (user: AccessDirectoryUser) => {
    const blob = new Blob([JSON.stringify(user, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${user.principalId.replace(/[^a-z0-9_-]+/gi, "_")}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const renderOverview = () => (
    <div className="space-y-5">
      <SectionCard title="תמונת מצב" subtitle="סיכום קצר של משתמשים, מקורות וסיכונים">
        <div className="access-metric-strip">
          <AccessMetric label="משתמשים ייחודיים" value={formatNumber(directory?.summary.totalUsers || 0)} tone="info" />
          <AccessMetric label="מנהלי אפליקציה" value={formatNumber(directory?.summary.totalAppAdmins || 0)} />
          <AccessMetric label="בעלי אתר" value={formatNumber(directory?.summary.totalSiteOwners || 0)} />
          <AccessMetric label="פערי הרשאה" value={formatNumber(directory?.summary.usersWithConflicts || 0)} tone={(directory?.summary.usersWithConflicts || 0) ? "warning" : "success"} />
          <AccessMetric label="מקורות שנכשלו/התיישנו" value={formatNumber(directory?.summary.failedOrStaleSources || 0)} tone={(directory?.summary.failedOrStaleSources || 0) ? "danger" : "success"} />
          <AccessMetric label="קריאה חיה אחרונה" value={formatDateTime(directory?.summary.lastSuccessfulLiveRead)} detail={directory?.summary.connectorModeLabelHe} />
        </div>
      </SectionCard>

      <SectionCard title="סדר עדיפויות" subtitle="הצעדים הבאים לפי מצב הראיות והמקורות">
        {directory?.issues.length ? (
          <div className="access-issue-list">
            {directory.issues.map((issue) => (
              <div key={issue.titleHe} className={`access-issue access-issue-${issue.severity}`}>
                <strong>{issue.titleHe}</strong>
                <span>{issue.detailHe}</span>
                <button className="btn btn-secondary" type="button" onClick={() => setActiveTab(issue.severity === "danger" ? "sources" : "drift")}>{issue.actionHe}</button>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border p-4" style={{ background: "var(--success-soft)", borderColor: "color-mix(in srgb, var(--success) 30%, var(--border))" }}>
            <p className="font-bold" style={{ color: "var(--success)" }}>אין פערים דחופים במקורות שנקראו</p>
            <p className="mt-1 text-sm muted">פעולות הרשאה עדיין יישארו plan-first עם נימוק ואישור.</p>
          </div>
        )}
      </SectionCard>
    </div>
  );

  const renderUsers = () => (
    <div className="space-y-4">
      <SectionCard title="כל המשתמשים" subtitle="אינדקס מאוחד של משתמשים מכל האתרים והמקורות שנקראו">
        <div className="access-users-toolbar">
          <div className="analytics-command-main">
            <label className="analytics-search">
              <Search size={16} />
              <input
                value={filters.search}
                onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                placeholder="חיפוש לפי שם, מייל, מספר אישי, שם אתר או קוד אתר"
              />
            </label>
            <div className="analytics-command-actions">
              <span className="badge badge-info"><Filter size={13} />{formatNumber(filteredUsers.length)} מתוך {formatNumber(directory?.users.length || 0)}</span>
            </div>
          </div>
          <div className="analytics-quick-strip">
            <span className="analytics-strip-label">תצוגות שמורות</span>
            <div className="quick-view-row">
              {quickViews.map((view) => (
                <button
                  key={view.key}
                  className={`quick-view-btn ${filters.quickView === view.key ? "quick-view-btn-active" : ""}`}
                  type="button"
                  onClick={() => setFilters((current) => ({ ...current, quickView: view.key }))}
                >
                  {view.label}
                </button>
              ))}
            </div>
          </div>
          <div className="filter-grid mt-3">
            <label><span className="field-label">אתר</span><select className="control" value={filters.siteId} onChange={(event) => setFilters((current) => ({ ...current, siteId: event.target.value }))}><option value="">כל האתרים</option>{directorySites.map((site) => <option key={site.siteId} value={site.siteId}>{site.displayName} ({site.siteCode})</option>)}</select></label>
            <label><span className="field-label">סביבה</span><select className="control" value={filters.environment} onChange={(event) => setFilters((current) => ({ ...current, environment: event.target.value }))}><option value="">כל הסביבות</option>{environments.map((env) => <option key={env} value={env}>{env}</option>)}</select></label>
            <label><span className="field-label">Storage backend</span><select className="control" value={filters.storageBackend} onChange={(event) => setFilters((current) => ({ ...current, storageBackend: event.target.value }))}><option value="">הכל</option>{storageBackends.map((backend) => <option key={backend} value={backend}>{backend}</option>)}</select></label>
            <label><span className="field-label">תפקיד / גישה</span><select className="control" value={filters.role} onChange={(event) => setFilters((current) => ({ ...current, role: event.target.value as AccessRoleType | "" }))}><option value="">כל התפקידים</option>{roleOptions.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></label>
            <label><span className="field-label">מקור</span><select className="control" value={filters.source} onChange={(event) => setFilters((current) => ({ ...current, source: event.target.value as AccessSourceType | "" }))}><option value="">כל המקורות</option>{sourceOptions.map((source) => <option key={source.value} value={source.value}>{source.label}</option>)}</select></label>
            <label><span className="field-label">סטטוס</span><select className="control" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as AccessUserStatus | "" }))}><option value="">כל הסטטוסים</option>{statusOptions.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
            <label><span className="field-label">מיון</span><select className="control" value={filters.sort} onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value as AccessSortKey }))}>{sortOptions.map((sort) => <option key={sort.value} value={sort.value}>{sort.label}</option>)}</select></label>
          </div>
          <ActiveFilterChips filters={filters} sites={directorySites} onChange={setFilters} />
        </div>

        <UsersTable
          users={filteredUsers}
          openMenuId={openMenuId}
          setOpenMenuId={setOpenMenuId}
          onProfile={setProfileUser}
          onWizard={setWizardState}
          onEvidence={setEvidenceUser}
          onCopy={(user) => void copyUser(user)}
          onExport={exportUser}
        />
      </SectionCard>
    </div>
  );

  const renderSources = () => (
    <div className="space-y-5">
      <SectionCard title="מקורות הרשאה" subtitle="מטריצת מקורות לפי אתר, סטטוס, ספירה, connector וחסם">
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
          <label>
            <span className="field-label">אתר</span>
            <select className="control" value={selectedSiteId} onChange={(event) => { setLiveData(null); void load(event.target.value); }}>
              {sites.map((site) => <option key={site._id} value={site._id}>{site.displayName} ({site.siteCode})</option>)}
            </select>
          </label>
          <button className="btn btn-secondary" type="button" onClick={() => void load(selectedSiteId)}><RefreshCcw size={15} />רענן Hub</button>
          <button className="btn btn-primary" type="button" disabled={!selectedSite || adminsLiveReadBusy || busyAction === "live-read"} onClick={() => runAction("live-read", async () => { await runLiveRead(); })}>
            <Search size={15} />רענן דרך הדפדפן
          </button>
        </div>
        <DataTable columns={[
          { header: "מקור" },
          { header: "סטטוס" },
          { header: "כמות" },
          { header: "קריאה אחרונה" },
          { header: "Connector" },
          { header: "Error / Blocker" }
        ]} minWidth={980} density="dense">
          {sourceRowsForSelectedSite.map((source) => (
            <tr key={source.id}>
              <td>
                <strong>{sourceLabel(source.sourceType)}</strong>
                <p className="text-xs muted">{authorityLabel(source.authority)} · {source.coverage === "full-users" ? "כיסוי משתמשים מלא" : source.coverage === "admin-only" ? "Admin only" : source.coverage === "metadata-only" ? "Metadata" : "לא זמין"}</p>
              </td>
              <td><span className={`badge ${statusClass(source.status)}`}>{readStatusLabel(source.status)}</span></td>
              <td className="num">{source.count === undefined ? "-" : formatNumber(source.count)}</td>
              <td className="num text-xs">{formatDateTime(source.lastReadAt)}</td>
              <td>{executionModeLabel(source.connector)}</td>
              <td>
                {source.error || source.blocker ? (
                  <span className="text-sm" style={{ color: source.status === "failed" ? "var(--danger)" : "var(--text-muted)" }}>{source.error || source.blocker}</span>
                ) : <span className="muted">-</span>}
                {source.httpStatus ? <p className="num text-xs muted">HTTP {source.httpStatus}</p> : null}
              </td>
            </tr>
          ))}
        </DataTable>
      </SectionCard>

      {(liveData || adminData) ? (
        <SectionCard title="ראיות קריאת Admin חיה" subtitle="קריאה דרך הדפדפן עם credentials: include. כשל Backend 401 אינו הוכחה שהדפדפן חסום.">
          <AdminLiveReadMeta liveData={liveData} adminData={adminData} />
          <div className="mt-4">
            <AdminSourceStatusTable data={liveData || adminData} />
          </div>
        </SectionCard>
      ) : null}
    </div>
  );

  const renderDrift = () => (
    <div className="space-y-5">
      <SectionCard title="פערים וסנכרון" subtitle="משתמשים ומקורות שמחייבים בדיקה לפני פעולה">
        {driftUsers.length ? (
          <DataTable columns={[
            { header: "משתמש" },
            { header: "סטטוס" },
            { header: "אתרים" },
            { header: "מקורות" },
            { header: "פעולה מומלצת" }
          ]} minWidth={900} density="dense">
            {driftUsers.map((user) => (
              <tr key={user.principalId}>
                <td><button className="access-link-button" type="button" onClick={() => setProfileUser(user)}>{user.displayName}</button><p className="num text-xs muted">{user.normalizedPersonalNumber || userPrimaryEmail(user)}</p></td>
                <td><StatusBadges statuses={user.status} /></td>
                <td>{user.sites.map((site) => site.siteCode).join(", ")}</td>
                <td><SourceBadges sources={user.sources} /></td>
                <td>{user.status.includes("source-failed") ? "רענון מקור שנכשל" : user.status.includes("conflict") ? "בדיקת מקור אמת והכנת תוכנית" : "אימות מחדש"}</td>
              </tr>
            ))}
          </DataTable>
        ) : <EmptyState title="אין פערים להצגה" description="לא זוהו פערים או מקורות כושלים במידע הנוכחי." />}
      </SectionCard>

      <SectionCard title="מקורות שנכשלו" subtitle="כשל מקור מוצג ככשל, לא כספירת אפס">
        {failedSources.length ? (
          <DataTable columns={[{ header: "אתר" }, { header: "מקור" }, { header: "סטטוס" }, { header: "שגיאה" }, { header: "ניסיון אחרון" }]} minWidth={860} density="dense">
            {failedSources.map((source) => (
              <tr key={source.id}>
                <td>{source.siteName}<p className="num text-xs muted">{source.siteCode}</p></td>
                <td>{sourceLabel(source.sourceType)}</td>
                <td><span className={`badge ${statusClass(source.status)}`}>{readStatusLabel(source.status)}</span></td>
                <td>{source.error || source.blocker || "-"}</td>
                <td className="num text-xs">{formatDateTime(source.lastReadAt)}</td>
              </tr>
            ))}
          </DataTable>
        ) : <EmptyState title="אין מקורות שנכשלו" description="כל המקורות שנקראו כעת תקינים או לא נקראו עדיין." />}
      </SectionCard>
    </div>
  );

  const renderHistory = () => (
    <SectionCard title="היסטוריית פעולות" subtitle="פעולות הרשאה חיות צריכות להופיע ב־Audit עם נימוק ו־evidence">
      <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}>
        <p className="font-bold" style={{ color: "var(--text-strong)" }}>אין endpoint ייעודי להיסטוריית Access Governance</p>
        <p className="mt-1 text-sm muted">המסך לא מציג הצלחות כתיבה מדומות. בשלב זה תוכניות שינוי נשארות plan-only או חסומות, ופעולות קיימות מתועדות דרך Audit.</p>
        <button className="btn btn-secondary mt-3" type="button" onClick={() => { window.location.hash = "#/audit"; }}>
          <FileText size={15} />פתח Audit
        </button>
      </div>
    </SectionCard>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="הרשאות וגישה"
        subtitle="ניהול משתמשים, מנהלים ומקורות הרשאה בכל האתרים"
        helpKey="site.admins"
        actions={<><MetadataOnlyBadge mode="readonly" /><span className="badge badge-info">{directory?.summary.connectorModeLabelHe || "טוען"}</span></>}
      />

      {message ? <div className="badge badge-success px-3 py-2">{message}</div> : null}
      {error ? <ErrorState message={error} onRetry={() => load(selectedSiteId)} /> : null}
      {loading ? <LoadingState /> : null}

      {!loading && directory ? (
        <>
          <div className="queue-tabs access-tabs" role="tablist" aria-label="הרשאות וגישה">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                className={`queue-tab ${activeTab === tab.key ? "queue-tab-active" : ""}`}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.key}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === "overview" ? renderOverview() : null}
          {activeTab === "users" ? renderUsers() : null}
          {activeTab === "sources" ? renderSources() : null}
          {activeTab === "drift" ? renderDrift() : null}
          {activeTab === "history" ? renderHistory() : null}
        </>
      ) : null}

      <UserProfileDrawer user={profileUser} open={Boolean(profileUser)} onClose={() => setProfileUser(null)} />
      <EvidenceDrawer user={evidenceUser} open={Boolean(evidenceUser)} onClose={() => setEvidenceUser(null)} />
      <PlanWizard state={wizardState} directory={directory} onClose={() => setWizardState(null)} onPlanned={setMessage} />
    </div>
  );
}
