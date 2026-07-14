import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  DatabaseBackup,
  Eye,
  FileClock,
  FolderSearch,
  History,
  PauseCircle,
  Play,
  RefreshCcw,
  RotateCcw,
  Save,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  type LucideIcon
} from "lucide-react";
import {
  Backup,
  BackupScheduleResult,
  BackupScheduleSettings,
  Job,
  RestoreReviewResult,
  SharePointBackupInventory,
  SharePointBackupInventoryFile,
  SharePointBackupInventoryFolder,
  sitesApi
} from "../api/sitesApi";
import { Site } from "../types/site";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { DetailsDrawer } from "../components/DetailsDrawer";
import { EmptyState } from "../components/EmptyState";
import { LoadingState } from "../components/LoadingState";
import { PageHeader } from "../components/PageHeader";
import { ProtectedActionDialog } from "../components/ProtectedActionDialog";
import { formatBytes, formatDateTime, formatNumber } from "../utils/format";
import { SAFE_READ_TTL_MS, useAutoSafeRead } from "../hooks/useAutoSafeRead";
import { useOperationalStatus } from "../components/OperationalStatusProvider";
import { listBrowserSharePointBackupInventory } from "../utils/sharepointBrowserConnector";
import { runBrowserSharePointBackupOperation } from "../utils/sharepointBrowserOperationRunner";
import { runBrowserSharePointRestoreOperation } from "../utils/sharepointBrowserSiteOperations";

type RecoveryTab = "overview" | "run" | "inventory" | "schedule" | "restore" | "history";
type ScopeMode = "site" | "all";
type DrawerState =
  | { title: string; subtitle?: string; payload: unknown }
  | null;
type NoticeTone = "success" | "warning" | "danger" | "neutral";
type RecoveryCommand = {
  key: string;
  title: string;
  description: string;
  mode: string;
  risk: string;
  status: string;
  statusTone?: string;
  actionLabel?: string;
  icon: LucideIcon;
  onAction?: () => void;
  disabled?: boolean;
  disabledReason?: string;
  variant?: "primary" | "secondary" | "danger";
};

const tabs: Array<{ key: RecoveryTab; label: string; icon: typeof ShieldCheck }> = [
  { key: "overview", label: "סקירה", icon: ShieldCheck },
  { key: "run", label: "הרצת גיבוי", icon: Play },
  { key: "inventory", label: "מלאי", icon: FolderSearch },
  { key: "schedule", label: "תזמון", icon: CalendarClock },
  { key: "restore", label: "שחזור", icon: RotateCcw },
  { key: "history", label: "היסטוריה", icon: History }
];

const weekdayOptions = [
  { value: 0, label: "א׳" },
  { value: 1, label: "ב׳" },
  { value: 2, label: "ג׳" },
  { value: 3, label: "ד׳" },
  { value: 4, label: "ה׳" },
  { value: 5, label: "ו׳" },
  { value: 6, label: "ש׳" }
];

const defaultSchedule: BackupScheduleSettings = {
  enabled: false,
  paused: false,
  frequency: "daily",
  daysOfWeek: [1],
  dayOfMonth: 1,
  timeOfDay: "02:00",
  timezone: "Asia/Jerusalem",
  intervalMinutes: 24 * 60,
  retention: {
    mode: "count",
    keepLast: 14,
    deleteOlderThanDays: 90
  }
};

const statusBadgeClass = (status?: string) => {
  if (["ready", "success", "verified", "succeeded"].includes(status || "")) return "badge-success";
  if (["partial", "warning", "queued", "running", "browser-required", "awaiting-approval"].includes(status || "")) return "badge-warning";
  if (["blocked", "failed", "error"].includes(status || "")) return "badge-danger";
  return "badge-neutral";
};

const storageLabel = (backend?: Site["storageBackend"]) => {
  if (backend === "txt") return "TXT";
  if (backend === "mongo") return "Mongo";
  return "Unknown";
};

const connectorLabel = (site?: Site, scope: ScopeMode = "site") => {
  if (scope === "all") return "Mixed";
  if (!site) return "לא נבחר אתר";
  const mode = site.recoveryState?.backupCapability?.connectorMode;
  if (mode === "browser-sharepoint") return "Browser SharePoint";
  if (mode === "builder-backend") return "Builder backend";
  if (mode === ["backend", "service", "auth", "required"].join("-")) return "נדרש מימוש Browser SharePoint לפעולה";
  if (site.storageBackend === "mongo") return "Builder backend";
  if (site.storageBackend === "txt") return "Browser SharePoint";
  return "לא ידוע";
};

const recoveryReadiness = (site?: Site) => {
  if (!site) return { label: "לא נבחר אתר", status: "unknown" };
  const restoreAudit = site.recoveryState?.restoreAudit;
  if (restoreAudit?.readinessStatus === "ready") return { label: "מוכן לבדיקה", status: "ready" };
  if (restoreAudit?.readinessStatus === "blocked") return { label: "חסום", status: "blocked" };
  if (site.storageBackend === "mongo") return { label: "דורש endpoint Restore", status: "blocked" };
  if (site.recoveryState?.backupCapability?.canRestore) return { label: "נדרש Review", status: "warning" };
  return { label: "לא נבדק", status: "unknown" };
};

const hasNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const countOrUnknown = (value?: number) => hasNumber(value) ? formatNumber(value) : "לא נבדק";
const bytesOrUnknown = (value?: number) => hasNumber(value) ? formatBytes(value) : "לא נבדק";

const backupVerified = (backup: Backup) =>
  backup.verification?.status === "verified" && ["verified", "succeeded"].includes(String(backup.status || ""));

const backupSourceType = (site?: Site) => site?.storageBackend === "mongo" ? "Mongo" : "TXT SharePoint";

const normalizeSchedule = (schedule?: Partial<BackupScheduleSettings>): BackupScheduleSettings => {
  const retention = {
    ...defaultSchedule.retention,
    ...(schedule?.retention || {})
  };
  return {
    ...defaultSchedule,
    ...(schedule || {}),
    retention: {
      mode: retention.mode || "count",
      keepLast: retention.keepLast || 14,
      deleteOlderThanDays: retention.deleteOlderThanDays || 90
    }
  };
};

const updateRetention = (
  form: BackupScheduleSettings,
  update: Partial<NonNullable<BackupScheduleSettings["retention"]>>
): BackupScheduleSettings => ({
  ...form,
  retention: {
    mode: form.retention?.mode || "count",
    keepLast: form.retention?.keepLast || 14,
    deleteOlderThanDays: form.retention?.deleteOlderThanDays || 90,
    ...update
  }
});

const jsonBlock = (payload: unknown) => (
  <pre className="max-h-[70vh] overflow-auto rounded-lg border p-3 text-xs leading-6" style={{ background: "var(--surface-muted)", borderColor: "var(--border)", color: "var(--text)" }}>
    {JSON.stringify(payload, null, 2)}
  </pre>
);

const summaryItem = (label: string, value: string, status?: string) => (
  <div className="min-w-0 rounded-lg border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
    <p className="text-xs muted">{label}</p>
    <p className="mt-1 flex min-w-0 items-center gap-2 text-sm font-bold" style={{ color: "var(--text-strong)" }}>
      <span className={`badge ${statusBadgeClass(status)} shrink-0`} />
      <span className="truncate">{value}</span>
    </p>
  </div>
);

const noticeIcon = (tone: NoticeTone) => {
  if (tone === "success") return CheckCircle2;
  if (tone === "danger" || tone === "warning") return AlertTriangle;
  return ShieldCheck;
};

function RecoveryNotice({
  tone,
  message,
  actionLabel,
  onAction
}: {
  tone: NoticeTone;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const Icon = noticeIcon(tone);
  return (
    <div className={`recovery-notice recovery-notice-${tone}`} role={tone === "danger" ? "alert" : "status"}>
      <div className="recovery-notice-copy">
        <Icon size={16} aria-hidden="true" />
        <span>{message}</span>
      </div>
      {actionLabel && onAction ? (
        <button className="btn btn-secondary recovery-notice-action" type="button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function RecoveryMetric({
  label,
  value,
  detail,
  status,
  icon: Icon
}: {
  label: string;
  value: string;
  detail?: string;
  status?: string;
  icon: LucideIcon;
}) {
  return (
    <div className="recovery-metric">
      <div className="recovery-metric-icon" aria-hidden="true">
        <Icon size={16} />
      </div>
      <div className="recovery-metric-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        {detail ? <small>{detail}</small> : null}
      </div>
      <span className={`badge ${statusBadgeClass(status)}`} aria-hidden="true" />
    </div>
  );
}

function RecoveryCommandPanel({
  title,
  subtitle,
  commands
}: {
  title: string;
  subtitle: string;
  commands: RecoveryCommand[];
}) {
  return (
    <div className="action-command-list action-command-list-compact recovery-command-list">
      <div className="action-command-group">
        <header>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </header>
        <div className="action-command-table" role="table" aria-label={title}>
          <div className="action-command-row action-command-head" role="row">
            <span>פעולה</span>
            <span>מה קורה בפועל</span>
            <span>מסלול</span>
            <span>סיכון</span>
            <span>מצב</span>
            <span>הרצה</span>
          </div>
          {commands.map((command) => {
            const Icon = command.icon;
            const buttonClass =
              command.variant === "danger"
                ? "btn btn-danger"
                : command.variant === "primary"
                  ? "btn btn-primary"
                  : "btn btn-secondary";
            return (
              <div className="action-command-row" role="row" key={command.key}>
                <div className="action-command-primary">
                  <strong><Icon size={14} aria-hidden="true" /> {command.title}</strong>
                  {command.disabledReason ? <small>{command.disabledReason}</small> : null}
                </div>
                <p>{command.description}</p>
                <span>{command.mode}</span>
                <span className={`risk-token ${command.variant === "danger" || command.risk.includes("כתיבה") ? "risk-token-write" : ""}`}>{command.risk}</span>
                <span className={`badge ${statusBadgeClass(command.statusTone || command.status)}`}>{command.status}</span>
                {command.actionLabel && command.onAction ? (
                  <button
                    className={`${buttonClass} action-command-button`}
                    type="button"
                    onClick={command.onAction}
                    disabled={command.disabled}
                    title={command.disabledReason}
                  >
                    {command.actionLabel}
                  </button>
                ) : <span className="muted text-xs">-</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function RecoveryTabShell({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="surface-card recovery-tab-shell" aria-labelledby={`recovery-tab-${title}`}>
      <header className="recovery-tab-heading">
        <div>
          <h2 id={`recovery-tab-${title}`}>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </header>
      <div className="recovery-tab-scroll">
        {children}
      </div>
    </section>
  );
}

function PathText({ value }: { value?: string }) {
  if (!value) return <span className="muted">-</span>;
  return <code className="recovery-path" title={value}>{value}</code>;
}

export function BackupsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab") as RecoveryTab | null;
  const [activeTab, setActiveTabState] = useState<RecoveryTab>(tabs.some((tab) => tab.key === requestedTab) ? requestedTab as RecoveryTab : "overview");
  const [scope, setScope] = useState<ScopeMode>((searchParams.get("scope") as ScopeMode) === "all" ? "all" : "site");
  const [sites, setSites] = useState<Site[]>([]);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState(searchParams.get("siteId") || "");
  const [siteSearch, setSiteSearch] = useState("");
  const [inventory, setInventory] = useState<SharePointBackupInventory | null>(null);
  const [scheduleResult, setScheduleResult] = useState<BackupScheduleResult | null>(null);
  const [scheduleForm, setScheduleForm] = useState<BackupScheduleSettings>(defaultSchedule);
  const [restoreBackupId, setRestoreBackupId] = useState("");
  const [restoreReason, setRestoreReason] = useState("");
  const [restoreReview, setRestoreReview] = useState<RestoreReviewResult | null>(null);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [backupProgress, setBackupProgress] = useState("");
  const operationalStatus = useOperationalStatus();

  const selectedSite = useMemo(() => sites.find((site) => site._id === selectedSiteId), [selectedSiteId, sites]);
  const filteredSites = useMemo(() => {
    const query = siteSearch.trim().toLowerCase();
    if (!query) return sites;
    return sites.filter((site) =>
      [site.displayName, site.siteCode, site.sharePointSiteUrl, site.storageBackend]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [siteSearch, sites]);
  const siteBackups = useMemo(
    () => scope === "site" && selectedSite ? backups.filter((backup) => String(backup.siteId) === selectedSite._id) : backups,
    [backups, scope, selectedSite]
  );
  const selectedSiteJobs = useMemo(
    () => scope === "site" && selectedSite ? jobs.filter((job) => String(job.siteId || "") === selectedSite._id) : jobs,
    [jobs, scope, selectedSite]
  );
  const latestInventory = selectedSite?.recoveryState?.latestInventoryRefresh;
  const latestBackup = selectedSite?.lastBackupAt || selectedSite?.recoveryState?.lastBackupEvidence?.recordedAt;
  const restoreState = recoveryReadiness(selectedSite);
  const verifiedBackups = siteBackups.filter(backupVerified);
  const failedBackups = siteBackups.filter((backup) => backup.status === "failed" || backup.verification?.status === "failed");
  const selectedRestoreBackup = useMemo(
    () => siteBackups.find((backup) => backup._id === restoreBackupId) || verifiedBackups[0] || siteBackups[0] || null,
    [restoreBackupId, siteBackups, verifiedBackups]
  );
  const inventoryFiles = useMemo(
    () => (inventory?.folders || []).flatMap((folder) => (folder.files || []).map((file) => ({ folder, file }))),
    [inventory]
  );

  const setActiveTab = (tab: RecoveryTab) => {
    setActiveTabState(tab);
    setError("");
    setMessage("");
    const next = new URLSearchParams(searchParams);
    if (tab === "overview") next.delete("tab");
    else next.set("tab", tab);
    setSearchParams(next, { replace: true });
  };

  const updateSelectedSite = (siteId: string) => {
    setSelectedSiteId(siteId);
    setRestoreReview(null);
    const next = new URLSearchParams(searchParams);
    if (siteId) next.set("siteId", siteId);
    else next.delete("siteId");
    setSearchParams(next, { replace: true });
  };

  const updateScope = (nextScope: ScopeMode) => {
    setScope(nextScope);
    const next = new URLSearchParams(searchParams);
    if (nextScope === "all") next.set("scope", "all");
    else next.delete("scope");
    setSearchParams(next, { replace: true });
  };

  const upsertSite = (site: Site) => setSites((current) => current.map((item) => item._id === site._id ? site : item));

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [sitesRes, backupsRes, jobsRes] = await Promise.all([
        sitesApi.list(),
        sitesApi.backups(),
        sitesApi.jobs()
      ]);
      setSites(sitesRes.data);
      setBackups(backupsRes.data);
      setJobs(jobsRes.data);
      const preferredSiteId = selectedSiteId || searchParams.get("siteId") || sitesRes.data[0]?._id || "";
      if (preferredSiteId && !selectedSiteId) setSelectedSiteId(preferredSiteId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בטעינת Recovery Center");
    } finally {
      setLoading(false);
    }
  };

  const loadSchedule = async (siteId: string) => {
    if (!siteId) return;
    try {
      const result = await sitesApi.getBackupSchedule(siteId);
      setScheduleResult(result.data);
      setScheduleForm(normalizeSchedule(result.data.schedule));
      upsertSite(result.data.site);
    } catch (err) {
      setScheduleResult(null);
      setScheduleForm(defaultSchedule);
      setMessage(err instanceof Error ? `Schedule לא נטען: ${err.message}` : "Schedule לא נטען");
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (tabs.some((tab) => tab.key === requestedTab) && requestedTab !== activeTab) {
      setActiveTabState(requestedTab as RecoveryTab);
    }
  }, [activeTab, requestedTab]);
  useEffect(() => { if (selectedSiteId) void loadSchedule(selectedSiteId); }, [selectedSiteId]);
  useEffect(() => {
    if (selectedRestoreBackup && selectedRestoreBackup._id !== restoreBackupId) setRestoreBackupId(selectedRestoreBackup._id);
  }, [restoreBackupId, selectedRestoreBackup]);

  const runAction = async (key: string, action: () => Promise<void>) => {
    setBusyAction(key);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "הפעולה נכשלה");
    } finally {
      setBusyAction("");
    }
  };

  const refreshCapability = async () => {
    if (!selectedSite) return;
    await runAction("capability", async () => {
      const result = await sitesApi.refreshBackupCapability(selectedSite._id);
      upsertSite(result.data.site);
      await operationalStatus.refreshStatus();
      setMessage(result.data.capability?.status === "ready" ? "יכולת הגיבוי עודכנה ונשמרה." : result.data.capability?.nextStep || "יכולת הגיבוי עודכנה.");
    });
  };

  const refreshInventory = async () => {
    if (!selectedSite) return;
    await runAction("inventory", async () => {
      if (selectedSite.storageBackend === "mongo") {
        const result = await sitesApi.refreshBackupCapability(selectedSite._id);
        upsertSite(result.data.site);
        setMessage("Mongo inventory נבדק מול Builder backend ונשמר ב-Hub.");
        return;
      }

      if (selectedSite.storageBackend !== "txt") {
        throw new Error("צריך לאמת מקור אחסון לפני Inventory.");
      }

      operationalStatus.setBrowserSharePointRefreshing(true);
      try {
        const browserInventory = await listBrowserSharePointBackupInventory(selectedSite, true);
        const saved = await sitesApi.recordBrowserBackupInventoryEvidence(selectedSite._id, {
          ...browserInventory,
          connectorMode: "browser-sharepoint",
          targetSiteUrl: selectedSite.resolvedPaths?.sharePointSiteUrl || selectedSite.sharePointSiteUrl
        });
        operationalStatus.recordBrowserSharePointStatus({
          status: browserInventory.summary.authBlocked ? "failed" : "connected",
          checkedAt: browserInventory.generatedAt,
          source: "Browser SharePoint",
          targetSharePointSiteUrl: selectedSite.resolvedPaths?.sharePointSiteUrl || selectedSite.sharePointSiteUrl,
          siteId: selectedSite._id,
          siteCode: selectedSite.siteCode,
          message: browserInventory.summary.authBlocked ? "חיבור SharePoint דרך הדפדפן נכשל בקריאת מלאי גיבויים" : "Browser SharePoint קרא מלאי גיבויים",
          nextStep: browserInventory.summary.authBlocked ? "פתחו את אתר SharePoint והתחברו מחדש" : "אפשר לרענן מלאי אם המידע ישן"
        });
        setInventory(browserInventory);
        upsertSite(saved.data.site);
        setMessage(browserInventory.summary.readOk ? "Inventory נקרא מהדפדפן ונשמר." : "Inventory נשמר עם מצב כשלון/חסימה. Snapshot מוצלח קודם לא נמחק.");
      } finally {
        operationalStatus.setBrowserSharePointRefreshing(false);
      }
    });
  };

  useAutoSafeRead({
    guardKey: selectedSite ? `backups:capability:${selectedSite._id}` : "",
    checkedAt: selectedSite?.recoveryState?.backupCapability?.checkedAt,
    ttlMs: SAFE_READ_TTL_MS.siteEvidence,
    enabled: Boolean(selectedSite && !loading && (activeTab === "overview" || activeTab === "run")),
    inFlight: Boolean(busyAction),
    run: refreshCapability,
    onError: setError
  });

  useAutoSafeRead({
    guardKey: selectedSite ? `backups:inventory:${selectedSite._id}` : "",
    checkedAt: selectedSite?.recoveryState?.latestInventoryRefresh?.checkedAt,
    ttlMs: SAFE_READ_TTL_MS.siteEvidence,
    enabled: Boolean(selectedSite && !loading && activeTab === "inventory" && !inventory),
    inFlight: Boolean(busyAction),
    run: refreshInventory,
    onError: setError
  });

  const runManualBackup = async () => {
    if (!selectedSite) return;
    await runAction("run-backup", async () => {
      if (selectedSite.storageBackend !== "txt") throw new Error("גיבוי Mongo דורש endpoint יצירה מאומת ב-Builder backend.");
      const queued = await sitesApi.runSiteBackup(selectedSite._id);
      if (queued.data.requiresApproval || queued.data.job.status === "awaiting-approval") {
        setMessage("נוצר Job שממתין לאישור מתקדם. לאחר האישור אפשר להריץ את פעולת הדפדפן.");
        await load();
        return;
      }
      if (!queued.data.browserOperationPlan) throw new Error("לא התקבלה תוכנית דפדפן לגיבוי.");
      const result = await runBrowserSharePointBackupOperation(selectedSite, {
        plan: queued.data.browserOperationPlan,
        onFileProgress: (event) => setBackupProgress(`${event.status}: ${event.sourcePath}`)
      });
      const saved = await sitesApi.recordBrowserBackupEvidence(selectedSite._id, {
        ...result,
        jobId: queued.data.job._id
      });
      upsertSite(saved.data.site);
      setBackupProgress("");
      setMessage(saved.data.summary?.finalStatus === "success" ? "הגיבוי הושלם, אומת ונשמר." : "הגיבוי נכשל ונשמר Evidence לכשלון.");
      await load();
    });
  };

  const saveSchedule = async () => {
    if (!selectedSite) return;
    await runAction("schedule", async () => {
      const result = await sitesApi.saveBackupSchedule(selectedSite._id, scheduleForm);
      setScheduleResult(result.data);
      setScheduleForm(normalizeSchedule(result.data.schedule));
      upsertSite(result.data.site);
      setMessage(result.data.execution.blocker || "Schedule נשמר.");
    });
  };

  const reviewRestore = async () => {
    if (!selectedRestoreBackup) return;
    await runAction("restore-review", async () => {
      const result = await sitesApi.restoreReview(selectedRestoreBackup._id, restoreReason);
      setRestoreReview(result.data);
      if (result.data.canExecute) setMessage("Restore review מוכן. עדיין נדרש אישור מוקלד לפני יצירת Job.");
      else setMessage(result.data.nextStep || "Restore חסום כרגע.");
      if (result.data.site.id) {
        const freshSite = sites.find((site) => site._id === result.data.site.id);
        if (freshSite) void load();
      }
    });
  };

  const executeRestore = async (note: string) => {
    if (!selectedSite || !selectedRestoreBackup) return;
    await runAction("restore-execute", async () => {
      const queued = await sitesApi.queueRestoreBackup(selectedRestoreBackup._id, note);
      if (queued.data.requiresApproval || queued.data.job.status === "awaiting-approval") {
        setMessage("נוצר Job שחזור שממתין לאישור מתקדם. לא בוצעה כתיבה בדפדפן.");
        setRestoreDialogOpen(false);
        await load();
        return;
      }
      if (!queued.data.browserOperationPlan) throw new Error("לא התקבלה תוכנית דפדפן לשחזור.");
      const result = await runBrowserSharePointRestoreOperation(selectedSite, queued.data.backup, queued.data.browserOperationPlan);
      const saved = await sitesApi.recordBrowserRestoreEvidence(selectedRestoreBackup._id, {
        ...result,
        jobId: queued.data.job._id
      });
      upsertSite(saved.data.site);
      setRestoreDialogOpen(false);
      setMessage(saved.data.summary?.finalStatus === "verified" ? "Restore בוצע ואומת בקריאה חוזרת." : "Restore נכשל ונשמר Evidence לכשלון.");
      await load();
    });
  };

  const siteById = (siteId: string) => sites.find((site) => site._id === siteId);
  const backupRows = siteBackups;
  const jobRows = selectedSiteJobs.filter((job) => ["backup", "restore"].includes(job.type)).slice(0, 100);

  const backupColumns: DataTableColumn<Backup>[] = [
    {
      header: "Backup",
      render: (backup) => (
        <div className="min-w-0">
          <p className="font-bold" style={{ color: "var(--text-strong)" }}>{backup.backupId}</p>
          <p className="text-xs muted">{siteById(String(backup.siteId))?.siteCode || String(backup.siteId)}</p>
        </div>
      )
    },
    { header: "סוג", render: (backup) => backupSourceType(siteById(String(backup.siteId))) },
    { header: "סטטוס", render: (backup) => <span className={`badge ${statusBadgeClass(backup.verification?.status || backup.status)}`}>{backup.verification?.status || backup.status}</span> },
    { header: "קבצים", align: "center", render: (backup) => countOrUnknown(backup.filesCount) },
    { header: "גודל", render: (backup) => bytesOrUnknown(backup.sizeBytes) },
    { header: "נוצר", render: (backup) => formatDateTime(backup.createdAt) },
    {
      header: "Evidence",
      render: (backup) => (
        <button className="btn btn-secondary min-h-0 px-2 py-1 text-xs" type="button" onClick={() => setDrawer({ title: "Backup evidence", subtitle: backup.backupId, payload: backup })}>
          <Eye size={14} /> פרטים
        </button>
      )
    }
  ];

  const inventoryFolderColumns: DataTableColumn<SharePointBackupInventoryFolder>[] = [
    { header: "תיקייה", render: (folder) => <span className="font-bold" style={{ color: "var(--text-strong)" }}>{folder.name || folder.serverRelativeUrl.split("/").pop()}</span> },
    { header: "נתיב", render: (folder) => <PathText value={folder.serverRelativeUrl} /> },
    { header: "קבצים", align: "center", render: (folder) => countOrUnknown(folder.filesCount) },
    { header: "גודל", render: (folder) => bytesOrUnknown(folder.knownSizeBytes) },
    { header: "עודכן", render: (folder) => formatDateTime(folder.timeLastModified) },
    { header: "אימות", render: (folder) => <span className={`badge ${statusBadgeClass(folder.filesStatus?.exists === false ? "failed" : "success")}`}>{folder.filesStatus?.exists === false ? "לא נקרא" : "נקרא"}</span> }
  ];

  const inventoryFileColumns: DataTableColumn<{ folder: SharePointBackupInventoryFolder; file: SharePointBackupInventoryFile }>[] = [
    { header: "קובץ", render: (row) => row.file.name },
    { header: "תיקיית גיבוי", render: (row) => row.folder.name || row.folder.serverRelativeUrl.split("/").pop() },
    { header: "גודל", render: (row) => bytesOrUnknown(row.file.sizeBytes) },
    { header: "עודכן", render: (row) => formatDateTime(row.file.timeLastModified) },
    { header: "נתיב", render: (row) => <PathText value={row.file.serverRelativeUrl} /> }
  ];

  const jobColumns: DataTableColumn<Job>[] = [
    { header: "Job", render: (job) => <span className="font-bold" style={{ color: "var(--text-strong)" }}>{job.type}</span> },
    { header: "סטטוס", render: (job) => <span className={`badge ${statusBadgeClass(job.status)}`}>{job.status}</span> },
    { header: "Connector", render: (job) => job.connectorMode || "-" },
    { header: "נוצר", render: (job) => formatDateTime(job.createdAt) },
    { header: "שגיאה", render: (job) => job.errorMessage || job.connectorBlocker || "-" },
    {
      header: "Evidence",
      render: (job) => (
        <button className="btn btn-secondary min-h-0 px-2 py-1 text-xs" type="button" onClick={() => setDrawer({ title: "Job evidence", subtitle: job._id, payload: job })}>
          <Eye size={14} /> פרטים
        </button>
      )
    }
  ];

  const restoreButtonDisabledReason = (() => {
    if (!selectedRestoreBackup) return "צריך לבחור Backup.";
    if (!restoreReview || restoreReview.backup._id !== selectedRestoreBackup._id) return "";
    if (!restoreReview.canExecute) return restoreReview.nextStep || "Restore חסום.";
    if (restoreReason.trim().length < 3) return "נדרש נימוק לפני Restore.";
    return "";
  })();

  const runBackupDisabledReason = (() => {
    if (scope !== "site") return "בחר scope של אתר יחיד כדי להריץ גיבוי.";
    if (!selectedSite) return "צריך לבחור אתר.";
    if (selectedSite.storageBackend === "mongo") return "יצירת גיבוי Mongo חסומה עד שיאושר endpoint כתיבה ב-Builder backend.";
    if (selectedSite.storageBackend !== "txt") return "מקור האחסון לא ידוע. רענן יכולת קודם.";
    if (!selectedSite.sharePointSiteUrl) return "חסר SharePoint URL.";
    return "";
  })();

  const openRestoreReviewOrApproval = () => {
    if (restoreReview?.canExecute && restoreReview.backup._id === selectedRestoreBackup?._id) setRestoreDialogOpen(true);
    else void reviewRestore();
  };
  const scheduleExecution = scheduleResult?.execution.blocker ? "חסום לשמירה אוטומטית" : scheduleForm.enabled && !scheduleForm.paused ? "פעיל" : "שמירה בלבד";
  const noticeTone: NoticeTone = error
    ? "danger"
    : message.includes("נכשל") || message.includes("חסום") || message.includes("דורש") || message.includes("לא נטען")
      ? "warning"
      : message
        ? "success"
        : "neutral";
  const overviewCommands: RecoveryCommand[] = [
    {
      key: "capability",
      title: "רענון יכולת",
      description: "קורא את מצב יכולת הגיבוי והשחזור ושומר Evidence עדכני ב-Hub.",
      mode: "קריאה בטוחה",
      risk: "ללא כתיבה",
      status: selectedSite?.recoveryState?.backupCapability?.status || "לא נבדק",
      icon: ClipboardCheck,
      actionLabel: busyAction === "capability" ? "בודק" : "רענן",
      onAction: () => void refreshCapability(),
      disabled: !selectedSite || busyAction === "capability",
      disabledReason: !selectedSite ? "בחר אתר יחיד כדי לבדוק יכולת." : undefined
    },
    {
      key: "inventory",
      title: "בדיקת מלאי",
      description: "מציג רשימת תיקיות/רשומות גיבוי לפי מקור האחסון בלי למחוק snapshot מוצלח קודם.",
      mode: connectorLabel(selectedSite, scope),
      risk: "ללא כתיבה",
      status: latestInventory?.status || selectedSite?.recoveryState?.mongoBackupInventory?.status || "לא נבדק",
      icon: FolderSearch,
      actionLabel: busyAction === "inventory" ? "בודק" : "בדוק",
      onAction: () => void refreshInventory(),
      disabled: !selectedSite || busyAction === "inventory",
      disabledReason: !selectedSite ? "בחר אתר יחיד כדי לקרוא מלאי." : undefined
    },
    {
      key: "restore-review",
      title: "בדיקת שחזור",
      description: "מייצר impact preview וחסמים לפני שהממשק בכלל מאפשר אישור שחזור.",
      mode: "Review בלבד",
      risk: "ללא כתיבה",
      status: restoreState.label,
      statusTone: restoreState.status,
      icon: ShieldAlert,
      actionLabel: busyAction === "restore-review" ? "בודק" : "בדוק",
      onAction: () => void reviewRestore(),
      disabled: !selectedRestoreBackup || busyAction === "restore-review",
      disabledReason: !selectedRestoreBackup ? "אין Backup זמין לבדיקה." : undefined
    }
  ];
  const runCommands: RecoveryCommand[] = [
    {
      key: "run-backup",
      title: "הרצת גיבוי ידני",
      description: "יוצר Job, מריץ Browser SharePoint, קורא בחזרה את הקבצים ושומר Evidence.",
      mode: connectorLabel(selectedSite, scope),
      risk: "כתיבת Backup",
      status: runBackupDisabledReason ? "חסום" : busyAction === "run-backup" ? "רץ" : "מוכן",
      statusTone: runBackupDisabledReason ? "blocked" : "ready",
      icon: Play,
      actionLabel: busyAction === "run-backup" ? "מריץ" : "הרץ",
      onAction: () => void runManualBackup(),
      disabled: Boolean(runBackupDisabledReason) || busyAction === "run-backup",
      disabledReason: runBackupDisabledReason || undefined,
      variant: "primary"
    },
    overviewCommands[0]
  ];
  const inventoryCommands: RecoveryCommand[] = [
    overviewCommands[1],
    overviewCommands[0]
  ];
  const scheduleCommands: RecoveryCommand[] = [
    {
      key: "save-schedule",
      title: "שמירת תזמון",
      description: "שומר את מדיניות התזמון וה-retention ב-Hub ומחזיר חסם ביצוע אם אין שירות מאומת.",
      mode: "Hub metadata",
      risk: "שמירת הגדרה",
      status: busyAction === "schedule" ? "שומר" : scheduleExecution,
      statusTone: scheduleResult?.execution.blocker ? "blocked" : scheduleForm.enabled ? "ready" : "unknown",
      icon: Save,
      actionLabel: busyAction === "schedule" ? "שומר" : "שמור",
      onAction: () => void saveSchedule(),
      disabled: !selectedSite || busyAction === "schedule",
      disabledReason: !selectedSite ? "בחר אתר כדי לשמור תזמון." : undefined,
      variant: "primary"
    },
    {
      key: "reload-schedule",
      title: "טעינת מצב שמור",
      description: "קורא שוב את schedule האחרון מהשרת כדי להשוות בין הטופס לבין מצב האמת.",
      mode: "קריאה בטוחה",
      risk: "ללא כתיבה",
      status: scheduleResult ? "נטען" : "לא נטען",
      icon: RefreshCcw,
      actionLabel: "טען",
      onAction: () => selectedSiteId && void loadSchedule(selectedSiteId),
      disabled: !selectedSiteId
    }
  ];
  const restoreCommands: RecoveryCommand[] = [
    {
      key: "restore-review",
      title: restoreReview?.canExecute && restoreReview.backup._id === selectedRestoreBackup?._id ? "פתיחת אישור שחזור" : "בדיקת שחזור",
      description: "בודק גיבוי מצב נוכחי, מציג קבצים שיידרסו ודורש אישור מוקלד לפני כתיבה.",
      mode: restoreReview?.canExecute ? "אישור מוגן" : "Review בלבד",
      risk: restoreReview?.canExecute ? "כתיבה מסוכנת" : "ללא כתיבה",
      status: restoreReview?.canExecute ? "מוכן לאישור" : restoreButtonDisabledReason || "נדרש Review",
      statusTone: restoreReview?.canExecute ? "ready" : restoreButtonDisabledReason ? "blocked" : "warning",
      icon: RotateCcw,
      actionLabel: restoreReview?.canExecute && restoreReview.backup._id === selectedRestoreBackup?._id ? "אישור" : busyAction === "restore-review" ? "בודק" : "בדוק",
      onAction: openRestoreReviewOrApproval,
      disabled: !selectedRestoreBackup || Boolean(restoreButtonDisabledReason && restoreReview?.backup._id === selectedRestoreBackup?._id) || busyAction === "restore-review",
      disabledReason: restoreButtonDisabledReason || undefined,
      variant: restoreReview?.canExecute ? "danger" : "primary"
    }
  ];
  const historyCommands: RecoveryCommand[] = [
    {
      key: "refresh-page",
      title: "רענון רשומות",
      description: "טוען מחדש Sites, Backups ו-Jobs בלי לשנות את השרת.",
      mode: "קריאה בטוחה",
      risk: "ללא כתיבה",
      status: loading ? "טוען" : "זמין",
      icon: RefreshCcw,
      actionLabel: "רענן",
      onAction: () => void load(),
      disabled: loading
    },
    {
      key: "advanced-details",
      title: "פרטי Recovery גולמיים",
      description: "פותח JSON טכני במגירה צדדית בלבד, כדי שהטבלה לא תתפוצץ באמצע הדף.",
      mode: "מגירת פרטים",
      risk: "ללא כתיבה",
      status: selectedSite ? "זמין" : "בחר אתר",
      statusTone: selectedSite ? "ready" : "unknown",
      icon: SlidersHorizontal,
      actionLabel: "פתח",
      onAction: () => selectedSite && setDrawer({ title: "Site recovery state", subtitle: selectedSite.displayName, payload: selectedSite.recoveryState || {} }),
      disabled: !selectedSite
    }
  ];

  if (loading && !sites.length) return <LoadingState label="טוען Recovery Center..." />;

  return (
    <div className="recovery-center-page space-y-4">
      <PageHeader
        eyebrow="Recovery Center"
        title="Backups / Restore"
        subtitle="קונסולת גיבוי, מלאי, תזמון ושחזור עם מסלול פעולה ברור ו-Evidence נשלט."
        variant="operational"
        helpKey="backup"
        actions={
          <button className="btn btn-secondary" type="button" onClick={load} disabled={loading}>
            <RefreshCcw size={16} /> רענן עמוד
          </button>
        }
      />

      {error || message ? (
        <RecoveryNotice
          tone={noticeTone}
          message={error || message}
          actionLabel={error ? "נסה שוב" : undefined}
          onAction={error ? load : undefined}
        />
      ) : null}

      <section className="surface-card recovery-workspace" aria-label="בחירת אתר ומצב Recovery">
        <div className="recovery-workspace-main">
          <div className="recovery-workspace-title">
            <p className="field-label">אתר עבודה</p>
            <h2>{scope === "all" ? "כל האתרים" : selectedSite?.displayName || "בחר אתר"}</h2>
            <div className="recovery-chip-row">
              <span className={`badge ${statusBadgeClass(selectedSite?.storageBackend || "unknown")}`}>{scope === "all" ? "Mixed" : storageLabel(selectedSite?.storageBackend)}</span>
              <span className="badge badge-info">{connectorLabel(selectedSite, scope)}</span>
              {selectedSite?.siteCode ? <span className="badge badge-neutral">{selectedSite.siteCode}</span> : null}
            </div>
          </div>
          <div className="recovery-operator-controls">
            <label className="block">
              <span className="field-label">חיפוש אתר</span>
              <div className="relative">
                <Search className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 muted" size={16} />
                <input className="control pr-10" value={siteSearch} onChange={(event) => setSiteSearch(event.target.value)} placeholder="שם, קוד, URL או backend" />
              </div>
            </label>
            <label className="block">
              <span className="field-label">טווח</span>
              <div className="segmented-control w-full recovery-scope-control">
                <button className={scope === "site" ? "active flex-1" : "flex-1"} type="button" onClick={() => updateScope("site")}>אתר</button>
                <button className={scope === "all" ? "active flex-1" : "flex-1"} type="button" onClick={() => updateScope("all")}>כל האתרים</button>
              </div>
            </label>
            <label className="block">
              <span className="field-label">אתר נבחר</span>
              <select className="control" value={selectedSiteId} onChange={(event) => updateSelectedSite(event.target.value)} disabled={!filteredSites.length}>
                {filteredSites.map((site) => (
                  <option key={site._id} value={site._id}>{site.displayName} · {site.siteCode}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="recovery-status-grid">
          <RecoveryMetric icon={DatabaseBackup} label="מקור נתונים" value={scope === "all" ? "Mixed" : storageLabel(selectedSite?.storageBackend)} detail="קובע את מסלול הגיבוי" status={selectedSite?.storageBackend || "unknown"} />
          <RecoveryMetric icon={ShieldCheck} label="יכולת" value={selectedSite?.recoveryState?.backupCapability?.status || "לא נבדק"} detail={connectorLabel(selectedSite, scope)} status={selectedSite?.recoveryState?.backupCapability?.status} />
          <RecoveryMetric icon={FolderSearch} label="מלאי אחרון" value={formatDateTime(latestInventory?.checkedAt)} detail={`${countOrUnknown(latestInventory?.foldersCount)} תיקיות · ${countOrUnknown(latestInventory?.filesCount)} קבצים`} status={latestInventory?.status} />
          <RecoveryMetric icon={FileClock} label="גיבוי אחרון" value={formatDateTime(latestBackup)} detail={`${countOrUnknown(siteBackups.length)} רשומות בטווח`} status={selectedSite?.backupStatus || (verifiedBackups.length ? "verified" : "unknown")} />
          <RecoveryMetric icon={RotateCcw} label="שחזור" value={restoreState.label} detail={selectedSite?.recoveryState?.restoreAudit?.blockers?.[0] || "נדרש Review לפני כתיבה"} status={restoreState.status} />
        </div>
      </section>

      <nav className="site-details-tabs recovery-tabs" aria-label="טאבי Recovery">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              className={`site-details-tab ${activeTab === tab.key ? "site-details-tab-active" : ""}`}
              type="button"
              data-recovery-tab={tab.key}
              aria-current={activeTab === tab.key ? "page" : undefined}
              onClick={() => setActiveTab(tab.key)}
            >
              <Icon size={15} /> {tab.label}
            </button>
          );
        })}
      </nav>

      {activeTab === "overview" ? (
        <RecoveryTabShell title="סקירה" subtitle="תמונת התאוששות לפי Evidence אחרון שנשמר ב-Hub.">
          <RecoveryCommandPanel title="פקודות Recovery" subtitle="כל פעולה מסומנת לפי מסלול, סיכון ומצב כדי למנוע לחיצות עיוורות." commands={overviewCommands} />
          {!selectedSite ? <EmptyState title="אין אתר נבחר" description="בחר אתר כדי לראות מצב Recovery." /> : (
            <div className="recovery-overview-grid">
              <div className="soft-panel recovery-insight-card">
                <p className="field-label">יכולת גיבוי</p>
                <p className="mt-2 text-lg font-bold" style={{ color: "var(--text-strong)" }}>{selectedSite.recoveryState?.backupCapability?.status || "unknown"}</p>
                <p className="mt-2 text-sm muted">{selectedSite.recoveryState?.backupCapability?.nextStep || "לא בוצעה בדיקת יכולת שמורה."}</p>
              </div>
              <div className="soft-panel recovery-insight-card">
                <p className="field-label">Inventory אחרון</p>
                <p className="mt-2 text-lg font-bold" style={{ color: "var(--text-strong)" }}>{latestInventory?.status || "unknown"}</p>
                <p className="mt-2 text-sm muted">תיקיות: {countOrUnknown(latestInventory?.foldersCount)} · קבצים: {countOrUnknown(latestInventory?.filesCount)} · גודל: {bytesOrUnknown(latestInventory?.knownSizeBytes)}</p>
              </div>
              <div className="soft-panel recovery-insight-card">
                <p className="field-label">Restore</p>
                <p className="mt-2 text-lg font-bold" style={{ color: "var(--text-strong)" }}>{restoreState.label}</p>
                <p className="mt-2 text-sm muted">{selectedSite.recoveryState?.restoreAudit?.blockers?.[0] || "Restore דורש Review, נימוק ואישור מוקלד לפני כתיבה."}</p>
              </div>
            </div>
          )}
          <div className="recovery-split-grid">
            <div className="soft-panel recovery-mini-list">
              <header>
                <p className="field-label">גיבויים אחרונים</p>
                <span>{countOrUnknown(siteBackups.length)} רשומות</span>
              </header>
              {siteBackups.slice(0, 3).map((backup) => (
                <button key={backup._id} type="button" onClick={() => setDrawer({ title: "Backup evidence", subtitle: backup.backupId, payload: backup })}>
                  <strong>{backup.backupId}</strong>
                  <span className={`badge ${statusBadgeClass(backup.verification?.status || backup.status)}`}>{backup.verification?.status || backup.status}</span>
                  <small>{formatDateTime(backup.createdAt)}</small>
                </button>
              ))}
              {!siteBackups.length ? <p className="muted text-sm">אין גיבויים להצגה בטווח הנוכחי.</p> : null}
            </div>
            <div className="soft-panel recovery-mini-list">
              <header>
                <p className="field-label">Jobs גיבוי/שחזור</p>
                <span>{countOrUnknown(jobRows.length)} רשומות</span>
              </header>
              {jobRows.slice(0, 3).map((job) => (
                <button key={job._id} type="button" onClick={() => setDrawer({ title: "Job evidence", subtitle: job._id, payload: job })}>
                  <strong>{job.type}</strong>
                  <span className={`badge ${statusBadgeClass(job.status)}`}>{job.status}</span>
                  <small>{job.connectorBlocker || formatDateTime(job.createdAt)}</small>
                </button>
              ))}
              {!jobRows.length ? <p className="muted text-sm">אין Jobs גיבוי/שחזור להצגה.</p> : null}
            </div>
          </div>
        </RecoveryTabShell>
      ) : null}

      {activeTab === "run" ? (
        <RecoveryTabShell title="הרצת גיבוי" subtitle="גיבוי TXT/SharePoint רץ מהדפדפן המחובר, עם read-back לפני שהוא נחשב הצלחה.">
          <RecoveryCommandPanel title="פקודות גיבוי" subtitle="הרצת כתיבה זמינה רק לאתר יחיד ובמסלול מאומת." commands={runCommands} />
          {runBackupDisabledReason ? (
            <div className="recovery-warning-panel">
              <p><ShieldAlert size={16} />{runBackupDisabledReason}</p>
              <span>{selectedSite?.storageBackend === "mongo" ? "אפשר לרענן Capability כדי לראות Inventory וחסמים מדויקים מול Builder backend." : "הפעולה לא תוצג כהצלחה עד שיישמר Evidence מאומת."}</span>
            </div>
          ) : (
            <div className="soft-panel recovery-run-plan">
              <ol>
                <li>יצירת Job ואישור מסלול Browser SharePoint.</li>
                <li>כתיבת קבצי TXT הקנוניים לתיקיית Backup חדשה.</li>
                <li>קריאה חוזרת, התאמת גודל/sha ושמירת Evidence ב-Hub Mongo.</li>
              </ol>
              {backupProgress ? <p className="mt-3 text-sm font-bold" style={{ color: "var(--accent)" }}>{backupProgress}</p> : null}
            </div>
          )}
        </RecoveryTabShell>
      ) : null}

      {activeTab === "inventory" ? (
        <RecoveryTabShell title="מלאי גיבויים" subtitle="מלאי אמיתי לפי מקור האחסון: Browser SharePoint ל-TXT, Builder backend לרשומות Mongo.">
          <RecoveryCommandPanel title="פקודות מלאי" subtitle="קריאה בטוחה בלבד. כשלון מלאי לא מוחק snapshot מוצלח קודם." commands={inventoryCommands} />
          {!selectedSite ? <EmptyState title="אין אתר נבחר" description="בחר אתר יחיד כדי לרענן Inventory." /> : selectedSite.storageBackend === "mongo" ? (
            <div className="space-y-4">
              <div className="recovery-summary-strip">
                {summaryItem("Mongo inventory", selectedSite.recoveryState?.mongoBackupInventory?.status || "unknown", selectedSite.recoveryState?.mongoBackupInventory?.status)}
                {summaryItem("Records", countOrUnknown(selectedSite.recoveryState?.mongoBackupInventory?.records?.length), selectedSite.recoveryState?.mongoBackupInventory?.status)}
                {summaryItem("Checked", formatDateTime(selectedSite.recoveryState?.mongoBackupInventory?.checkedAt), selectedSite.recoveryState?.mongoBackupInventory?.status)}
              </div>
              {selectedSite.recoveryState?.mongoBackupInventory?.records?.length ? (
                <div className="recovery-scroll-region">
                  <DataTable
                    columns={[
                      { header: "Backup", render: (row: any) => row.backupId || row.id },
                      { header: "סטטוס", render: (row: any) => <span className={`badge ${statusBadgeClass(row.status)}`}>{row.status || "unknown"}</span> },
                      { header: "נוצר", render: (row: any) => formatDateTime(row.createdAt) },
                      { header: "קבצים", render: (row: any) => countOrUnknown(row.filesCount) },
                      { header: "גודל", render: (row: any) => bytesOrUnknown(row.sizeBytes) }
                    ]}
                    rows={selectedSite.recoveryState.mongoBackupInventory.records}
                    rowKey={(row: any) => String(row.id || row.backupId)}
                    minWidth={780}
                    density="dense"
                  />
                </div>
              ) : <EmptyState title="אין רשומות Mongo שמורות" description="רענון Capability/Inventory יקרא רק endpoint מאומת של Builder backend. כשלון לא יוצג כאפס." />}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="recovery-summary-strip">
                {summaryItem("Root", inventory?.summary.rootExists ? "קיים" : latestInventory?.status || "לא נבדק", inventory?.summary.readOk ? "success" : latestInventory?.status)}
                {summaryItem("Folders", inventory ? countOrUnknown(inventory.summary.foldersCount) : countOrUnknown(latestInventory?.foldersCount), latestInventory?.status)}
                {summaryItem("Files", inventory ? countOrUnknown(inventory.summary.filesCount) : countOrUnknown(latestInventory?.filesCount), latestInventory?.status)}
                {summaryItem("Known size", inventory ? bytesOrUnknown(inventory.summary.knownSizeBytes) : bytesOrUnknown(latestInventory?.knownSizeBytes), latestInventory?.status)}
              </div>
              <div className="recovery-scroll-region">
                {inventory?.folders?.length ? (
                  <DataTable columns={inventoryFolderColumns} rows={inventory.folders} rowKey={(folder) => folder.serverRelativeUrl} minWidth={980} density="dense" />
                ) : <EmptyState title="אין Inventory מוצג" description="לחץ רענן Inventory כדי לקרוא את תיקיית הגיבויים מהדפדפן ולשמור Evidence." />}
                {inventoryFiles.length ? (
                  <DataTable columns={inventoryFileColumns} rows={inventoryFiles} rowKey={(row) => row.file.serverRelativeUrl} minWidth={980} density="dense" />
                ) : null}
              </div>
            </div>
          )}
        </RecoveryTabShell>
      ) : null}

      {activeTab === "schedule" ? (
        <RecoveryTabShell title="תזמון" subtitle="שמירת תזמון אמיתית עם מצב הפעלה ברור וחסם ביצוע גלוי כשאין שירות מאומת.">
          <RecoveryCommandPanel title="פקודות תזמון" subtitle="הגדרות נשמרות ב-Hub; ביצוע unattended מוצג כחסום אם אין מסלול מאומת." commands={scheduleCommands} />
          {!selectedSite ? <EmptyState title="אין אתר נבחר" description="בחר אתר כדי לערוך Schedule." /> : (
            <div className="recovery-form-sections">
              <section className="recovery-form-card">
                <header>
                  <h3>מצב הפעלה</h3>
                  <span className={`badge ${statusBadgeClass(scheduleResult?.execution.blocker ? "blocked" : scheduleForm.enabled ? "ready" : "unknown")}`}>{scheduleExecution}</span>
                </header>
                <div className="recovery-form-grid">
                  <label className="soft-panel recovery-toggle-row">
                    <span>
                      <span className="block text-sm font-bold" style={{ color: "var(--text-strong)" }}>מופעל</span>
                      <span className="text-xs muted">שמירת התזמון פעילה</span>
                    </span>
                    <input type="checkbox" checked={scheduleForm.enabled} onChange={(event) => setScheduleForm((form) => ({ ...form, enabled: event.target.checked }))} />
                  </label>
                  <label className="soft-panel recovery-toggle-row">
                    <span>
                      <span className="block text-sm font-bold" style={{ color: "var(--text-strong)" }}>מושהה</span>
                      <span className="text-xs muted">התזמון שמור אך לא רץ</span>
                    </span>
                    <input type="checkbox" checked={Boolean(scheduleForm.paused)} onChange={(event) => setScheduleForm((form) => ({ ...form, paused: event.target.checked }))} />
                  </label>
                  {summaryItem("הרצה הבאה", formatDateTime(scheduleResult?.schedule.nextRunAt), scheduleResult?.schedule.enabled && !scheduleResult?.schedule.paused ? "warning" : "unknown")}
                  {summaryItem("הרצה אחרונה", `${scheduleResult?.schedule.lastRunStatus || "unknown"} · ${formatDateTime(scheduleResult?.schedule.lastRunAt)}`, scheduleResult?.schedule.lastRunStatus)}
                </div>
              </section>

              <section className="recovery-form-card">
                <header><h3>חלון זמן</h3></header>
                <div className="recovery-form-grid">
                  <label className="block">
                    <span className="field-label">תדירות</span>
                    <select className="control" value={scheduleForm.frequency} onChange={(event) => setScheduleForm((form) => ({ ...form, frequency: event.target.value as BackupScheduleSettings["frequency"] }))}>
                      <option value="daily">יומי</option>
                      <option value="weekly">שבועי</option>
                      <option value="monthly">חודשי</option>
                      <option value="custom">מרווח מותאם</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="field-label">שעה</span>
                    <input className="control" type="time" value={scheduleForm.timeOfDay} onChange={(event) => setScheduleForm((form) => ({ ...form, timeOfDay: event.target.value }))} />
                  </label>
                  <label className="block">
                    <span className="field-label">אזור זמן</span>
                    <input className="control" value={scheduleForm.timezone} onChange={(event) => setScheduleForm((form) => ({ ...form, timezone: event.target.value }))} />
                  </label>
                  <label className="block">
                    <span className="field-label">מרווח בדקות</span>
                    <input className="control" type="number" min={5} value={scheduleForm.intervalMinutes || 1440} onChange={(event) => setScheduleForm((form) => ({ ...form, intervalMinutes: Number(event.target.value) }))} disabled={scheduleForm.frequency !== "custom"} />
                  </label>
                </div>
              {scheduleForm.frequency === "weekly" ? (
                <div className="soft-panel recovery-days-panel">
                  <p className="field-label">ימי שבוע</p>
                  <div>
                    {weekdayOptions.map((day) => (
                      <label key={day.value} className="badge badge-neutral cursor-pointer gap-2">
                        <input
                          type="checkbox"
                          checked={(scheduleForm.daysOfWeek || []).includes(day.value)}
                          onChange={(event) => setScheduleForm((form) => {
                            const current = new Set(form.daysOfWeek || []);
                            if (event.target.checked) current.add(day.value);
                            else current.delete(day.value);
                            return { ...form, daysOfWeek: Array.from(current).sort((a, b) => a - b) };
                          })}
                        />
                        {day.label}
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
              {scheduleForm.frequency === "monthly" ? (
                <label className="block max-w-xs">
                  <span className="field-label">יום בחודש</span>
                  <input className="control" type="number" min={1} max={31} value={scheduleForm.dayOfMonth || 1} onChange={(event) => setScheduleForm((form) => ({ ...form, dayOfMonth: Number(event.target.value) }))} />
                </label>
              ) : null}
              </section>

              <section className="recovery-form-card">
                <header><h3>Retention</h3></header>
                <div className="recovery-form-grid recovery-form-grid-3">
                  <label className="block">
                    <span className="field-label">מדיניות</span>
                    <select className="control" value={scheduleForm.retention?.mode || "count"} onChange={(event) => setScheduleForm((form) => updateRetention(form, { mode: event.target.value as NonNullable<BackupScheduleSettings["retention"]>["mode"] }))}>
                      <option value="none">ללא מחיקה</option>
                      <option value="count">שמור N אחרונים</option>
                      <option value="days">מחק לפי ימים</option>
                      <option value="count-and-days">גם כמות וגם ימים</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="field-label">שמור אחרונים</span>
                    <input className="control" type="number" min={1} value={scheduleForm.retention?.keepLast || 14} onChange={(event) => setScheduleForm((form) => updateRetention(form, { keepLast: Number(event.target.value) }))} />
                  </label>
                  <label className="block">
                    <span className="field-label">מחק ישנים מימים</span>
                    <input className="control" type="number" min={1} value={scheduleForm.retention?.deleteOlderThanDays || 90} onChange={(event) => setScheduleForm((form) => updateRetention(form, { deleteOlderThanDays: Number(event.target.value) }))} />
                  </label>
                </div>
              </section>

              {scheduleResult?.execution.blocker ? (
                <div className="recovery-warning-panel">
                  <p><PauseCircle size={16} /> {scheduleResult.execution.blocker}</p>
                  <span>ההגדרה נשמרת, אבל הרצה אוטומטית לא מוצגת כהצלחה עד שיש מסלול SharePoint מאומת.</span>
                </div>
              ) : null}
            </div>
          )}
        </RecoveryTabShell>
      ) : null}

      {activeTab === "restore" ? (
        <RecoveryTabShell title="שחזור" subtitle="פעולה מסוכנת שמתחילה ב-Review, ממשיכה ל-impact preview ורק אז נפתחת לאישור מוקלד.">
          <RecoveryCommandPanel title="פקודות שחזור" subtitle="הכפתור המסוכן נשאר חסום עד שהשרת מחזיר canExecute והמשתמש מקליד אישור." commands={restoreCommands} />
          <div className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(16rem,1fr)_minmax(16rem,1fr)]">
              <label className="block">
                <span className="field-label">Backup לשחזור</span>
                <select className="control" value={selectedRestoreBackup?._id || ""} onChange={(event) => { setRestoreBackupId(event.target.value); setRestoreReview(null); }}>
                  {siteBackups.map((backup) => (
                    <option key={backup._id} value={backup._id}>{backup.backupId} · {backup.verification?.status || backup.status} · {formatDateTime(backup.createdAt)}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="field-label">נימוק</span>
                <input className="control" value={restoreReason} onChange={(event) => setRestoreReason(event.target.value)} placeholder="למה משחזרים ומה אושר" />
              </label>
            </div>

            {!selectedRestoreBackup ? (
              <EmptyState title="אין Backup לשחזור" description="אין רשומות Backup בטווח הנוכחי." />
            ) : restoreReview ? (
              <div className="space-y-3">
                <div className="recovery-summary-strip">
                  {summaryItem("Source type", restoreReview.sourceType === "mongo" ? "Mongo" : "TXT SharePoint", restoreReview.canExecute ? "success" : "blocked")}
                  {summaryItem("Overwrite", countOrUnknown(restoreReview.impactPreview.willOverwriteCount), restoreReview.canExecute ? "warning" : "blocked")}
                  {summaryItem("Current-state backup", restoreReview.preRestoreBackupSafety ? "קיים" : "נדרש", restoreReview.preRestoreBackupSafety ? "success" : "blocked")}
                  {summaryItem("Execution", restoreReview.canExecute ? "מוכן לאישור" : "חסום", restoreReview.canExecute ? "ready" : "blocked")}
                </div>
                {restoreReview.blockers.length ? (
                  <div className="rounded-lg border p-3" style={{ background: "var(--danger-soft)", borderColor: "color-mix(in srgb, var(--danger) 38%, var(--border))" }}>
                    <p className="field-label" style={{ color: "var(--danger)" }}>חסמים</p>
                    <ul className="mt-2 list-inside list-disc space-y-1 text-sm" style={{ color: "var(--text-strong)" }}>
                      {restoreReview.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
                    </ul>
                  </div>
                ) : null}
                <div className="soft-panel recovery-impact-panel">
                  <p className="field-label">מה יידרס</p>
                  <div className="recovery-path-list">
                    {restoreReview.impactPreview.willOverwrite.slice(0, 10).map((path) => (
                      <PathText key={path} value={path} />
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="soft-panel p-4 text-sm muted">לחץ בדוק Restore כדי לקבל Impact preview וחסמים עדכניים.</div>
            )}
          </div>
        </RecoveryTabShell>
      ) : null}

      {activeTab === "history" ? (
        <RecoveryTabShell title="היסטוריה ו-Evidence" subtitle="רשומות Backup ו-Jobs נשארות בטבלאות סריקות; JSON טכני נפתח במגירה.">
          <RecoveryCommandPanel title="פקודות היסטוריה" subtitle="רענון רשומות ופתיחת נתונים גולמיים בלי לדחוף JSON לתוך הטבלה." commands={historyCommands} />
          <div className="space-y-5">
            <div className="recovery-summary-strip">
              {summaryItem("Backups", countOrUnknown(backupRows.length), "success")}
              {summaryItem("Verified", countOrUnknown(verifiedBackups.length), "success")}
              {summaryItem("Failed", countOrUnknown(failedBackups.length), failedBackups.length ? "failed" : "success")}
              {summaryItem("Jobs", countOrUnknown(jobRows.length), "warning")}
            </div>
            <div className="recovery-scroll-region recovery-history-region">
              {backupRows.length ? (
                <DataTable
                  columns={backupColumns}
                  rows={backupRows}
                  rowKey={(backup) => backup._id}
                  minWidth={1120}
                  density="dense"
                  mobileCard={(backup) => (
                    <div className="space-y-2">
                      <p className="font-bold" style={{ color: "var(--text-strong)" }}>{backup.backupId}</p>
                      <p className="text-sm muted">{backup.verification?.status || backup.status} · {formatDateTime(backup.createdAt)}</p>
                      <button className="btn btn-secondary w-full" type="button" onClick={() => setDrawer({ title: "Backup evidence", subtitle: backup.backupId, payload: backup })}><Eye size={14} />פרטים</button>
                    </div>
                  )}
                />
              ) : <EmptyState title="אין גיבויים" description="אין Backup records עבור הטווח הנוכחי." />}
              {jobRows.length ? (
                <DataTable
                  columns={jobColumns}
                  rows={jobRows}
                  rowKey={(job) => job._id}
                  minWidth={1040}
                  density="dense"
                />
              ) : null}
            </div>
          </div>
        </RecoveryTabShell>
      ) : null}

      <ProtectedActionDialog
        open={restoreDialogOpen}
        title="אישור Restore"
        description="הפעולה תכתוב קבצים חיים מתוך הגיבוי הנבחר. ודא שקיים גיבוי מצב נוכחי ונימוק ברור."
        confirmWord="שחזר"
        noteLabel="נימוק Restore"
        notePlaceholder="תאר מי אישר, למה משחזרים ומה נבדק לפני הפעולה"
        risks={restoreReview?.impactPreview.risks || []}
        confirmLabel="צור Job Restore"
        confirmDisabledReason={restoreReview?.canExecute ? "" : restoreReview?.nextStep || "Restore review לא מוכן"}
        initialNote={restoreReason}
        busy={busyAction === "restore-execute"}
        onClose={() => setRestoreDialogOpen(false)}
        onConfirm={executeRestore}
      />

      <DetailsDrawer open={Boolean(drawer)} title={drawer?.title || "Advanced details"} subtitle={drawer?.subtitle} onClose={() => setDrawer(null)}>
        {jsonBlock(drawer?.payload)}
      </DetailsDrawer>
    </div>
  );
}
