import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ClipboardCheck, DatabaseBackup, Eye, FolderSearch, Play, RefreshCcw, RotateCcw, ShieldAlert } from "lucide-react";
import {
  AllBackupPlans,
  Backup,
  BackupPlan,
  BackupPlanSource,
  BackupRestoreEvidence,
  OperationCapabilities,
  SharePointBackupInventory,
  SharePointBackupInventoryFile,
  SharePointBackupInventoryFolder,
  sitesApi
} from "../api/sitesApi";
import { Site } from "../types/site";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { KpiCard } from "../components/KpiCard";
import { LinkRow } from "../components/LinkRow";
import { LoadingState } from "../components/LoadingState";
import { MetadataOnlyBadge } from "../components/MetadataOnlyBadge";
import { PageHeader } from "../components/PageHeader";
import { ProtectedActionDialog } from "../components/ProtectedActionDialog";
import { SectionCard } from "../components/SectionCard";
import { HelpLabel } from "../components/help/HelpLabel";
import { formatBytes, formatDateTime, formatNumber } from "../utils/format";

const restoreStatusLabel = (status?: Backup["restoreStatus"]) => {
  const labels: Record<string, string> = {
    "never-restored": "לא שוחזר",
    running: "רץ",
    succeeded: "הצליח",
    verified: "אומת",
    failed: "נכשל"
  };
  return labels[status || "never-restored"] || status || "לא שוחזר";
};

const restoreStatusBadgeClass = (status?: Backup["restoreStatus"]) => {
  if (status === "failed") return "badge-danger";
  if (status === "succeeded" || status === "verified") return "badge-success";
  if (status === "running") return "badge-info";
  return "badge-neutral";
};

const hasRestoreAttempt = (backup: Backup) =>
  Boolean(
    (backup.restoreStatus && backup.restoreStatus !== "never-restored") ||
      backup.lastRestoreAt ||
      backup.lastRestoreJobId ||
      backup.lastRestoreError ||
      backup.restoreEvidence?.length
  );

const matchBadgeClass = (value?: boolean) => {
  if (value === true) return "badge-success";
  if (value === false) return "badge-danger";
  return "badge-neutral";
};

const matchLabel = (value?: boolean) => {
  if (value === true) return "תואם";
  if (value === false) return "לא תואם";
  return "לא ידוע";
};

const hasNumber = (value?: number | null): value is number =>
  typeof value === "number" && Number.isFinite(value);

const compareSize = (expected?: number, actual?: number) =>
  hasNumber(expected) && hasNumber(actual) ? expected === actual : undefined;

const compareSha = (expected?: string, actual?: string) => {
  const expectedValue = String(expected || "").trim().toLowerCase();
  const actualValue = String(actual || "").trim().toLowerCase();
  if (!expectedValue || !actualValue) return undefined;
  return expectedValue === actualValue;
};

const compactId = (value?: string) => {
  if (!value) return "";
  return value.length > 14 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
};

const backupSizeMatches = (item: BackupRestoreEvidence) =>
  compareSize(item.expectedBackupSizeBytes, item.backupSizeBytes);

const backupShaMatches = (item: BackupRestoreEvidence) =>
  compareSha(item.expectedBackupSha256, item.backupSha256);

type BackupTab = "overview" | "plan" | "schedule" | "inventory" | "restore" | "history";

const backupTabs: Array<{ key: BackupTab; label: string }> = [
  { key: "overview", label: "סקירה" },
  { key: "plan", label: "תכנון" },
  { key: "schedule", label: "תזמון" },
  { key: "inventory", label: "Inventory" },
  { key: "restore", label: "Restore" },
  { key: "history", label: "היסטוריה" }
];

export function BackupsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [backups, setBackups] = useState<Backup[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [selectedRestoreBackupId, setSelectedRestoreBackupId] = useState("");
  const [capabilities, setCapabilities] = useState<OperationCapabilities | null>(null);
  const [sitePlan, setSitePlan] = useState<BackupPlan | null>(null);
  const [allPlans, setAllPlans] = useState<AllBackupPlans | null>(null);
  const [backupInventory, setBackupInventory] = useState<SharePointBackupInventory | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [restoreRequestBackup, setRestoreRequestBackup] = useState<Backup | null>(null);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleInterval, setScheduleInterval] = useState(24 * 60);
  const requestedBackupTab = searchParams.get("tab") as BackupTab | null;
  const backupTab = backupTabs.some((tab) => tab.key === requestedBackupTab) ? requestedBackupTab as BackupTab : "overview";
  const setBackupTab = (tab: BackupTab) => {
    const next = new URLSearchParams(searchParams);
    if (tab === "overview") next.delete("tab");
    else next.set("tab", tab);
    setSearchParams(next);
  };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [backupsRes, sitesRes, capsRes] = await Promise.all([
        sitesApi.backups(),
        sitesApi.list(),
        sitesApi.operationCapabilities()
      ]);
      setBackups(backupsRes.data);
      setSites(sitesRes.data);
      setCapabilities(capsRes.data);
      if (!selectedSiteId && sitesRes.data[0]) setSelectedSiteId(sitesRes.data[0]._id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בטעינת גיבויים");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const writeAvailable = Boolean(capabilities?.sharePoint.writeAvailable);
  const selectedSite = useMemo(() => sites.find((site) => site._id === selectedSiteId), [selectedSiteId, sites]);
  const totalSize = useMemo(() => backups.reduce((sum, backup) => sum + (backup.sizeBytes || 0), 0), [backups]);
  const failedBackups = backups.filter((backup) => backup.status === "failed");
  const verifiedBackups = backups.filter((backup) => backup.verification?.status === "verified" || backup.status === "verified");
  const inventoryFiles = useMemo(() => (backupInventory?.folders || []).flatMap((folder) =>
    (folder.files || []).map((file) => ({ folder, file }))
  ), [backupInventory]);
  const restoreAttemptBackups = useMemo(() => backups.filter(hasRestoreAttempt), [backups]);
  const selectedRestoreBackup = useMemo(
    () => restoreAttemptBackups.find((backup) => backup._id === selectedRestoreBackupId) || restoreAttemptBackups[0] || null,
    [restoreAttemptBackups, selectedRestoreBackupId]
  );
  const selectedRestoreEvidence = selectedRestoreBackup?.restoreEvidence || [];
  const selectedRestoreFailedCount = selectedRestoreEvidence.filter((item) => item.status === "failed").length;
  const selectedRestoreVerifiedCount = selectedRestoreEvidence.filter((item) => item.status === "verified").length;

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

  useEffect(() => {
    const schedule = selectedSite?.maintenanceSchedule?.backup;
    setScheduleEnabled(Boolean(schedule?.enabled));
    setScheduleInterval(schedule?.intervalMinutes || 24 * 60);
  }, [selectedSite?._id, selectedSite?.maintenanceSchedule?.backup?.enabled, selectedSite?.maintenanceSchedule?.backup?.intervalMinutes]);

  const saveBackupSchedule = async () => {
    if (!selectedSiteId) return;
    await runAction("backup-schedule", async () => {
      const intervalMinutes = Math.max(5, Math.round(Number(scheduleInterval) || 24 * 60));
      await sitesApi.update(selectedSiteId, {
        maintenanceSchedule: {
          ...(selectedSite?.maintenanceSchedule || {}),
          backup: {
            ...(selectedSite?.maintenanceSchedule?.backup || {}),
            enabled: scheduleEnabled,
            intervalMinutes,
            nextRunAt: scheduleEnabled ? new Date().toISOString() : undefined,
            lastError: ""
          }
        }
      });
      setMessage(scheduleEnabled ? "תזמון גיבוי נשמר וייצור Job לאישור במחזור הסריקה הבא" : "תזמון גיבוי כובה");
      await load();
    });
  };

  const backupHistoryColumns: DataTableColumn<Backup>[] = [
    { key: "backupId", header: "Backup ID", helpKey: "backup", render: (backup) => <span className="num font-bold">{backup.backupId}</span> },
    {
      key: "status",
      header: "סטטוס",
      helpKey: "job.status",
      render: (backup) => <span className={`badge ${backup.status === "failed" ? "badge-danger" : backup.status === "succeeded" || backup.status === "verified" ? "badge-success" : "badge-info"}`}>{backup.status}</span>
    },
    { key: "files", header: "קבצים", helpKey: "backup", render: (backup) => <span className="num">{formatNumber(backup.filesCount)}</span> },
    { key: "size", header: "גודל", helpKey: "storage", render: (backup) => <span className="num">{formatBytes(backup.sizeBytes)}</span> },
    { key: "created", header: "נוצר", helpKey: "history", render: (backup) => <span className="num text-xs">{formatDateTime(backup.createdAt)}</span> },
    {
      key: "verification",
      header: "אימות",
      helpKey: "backup.verified",
      render: (backup) => <span className={`badge ${backup.verification?.status === "failed" ? "badge-danger" : backup.verification?.status === "verified" ? "badge-success" : "badge-neutral"}`}>{backup.verification?.status || "unverified"}</span>
    },
    {
      key: "restore",
      header: "שחזור",
      helpKey: "backup.restore",
      render: (backup) => (
        <div className="space-y-1">
          <span className={`badge ${restoreStatusBadgeClass(backup.restoreStatus)}`}>{restoreStatusLabel(backup.restoreStatus)}</span>
          {backup.lastRestoreAt ? <div className="num text-xs muted">{formatDateTime(backup.lastRestoreAt)}</div> : null}
          {backup.lastRestoreJobId ? <code className="num block max-w-[150px] truncate text-xs muted" title={backup.lastRestoreJobId}>job {compactId(backup.lastRestoreJobId)}</code> : null}
          {backup.lastRestoreError ? <code className="num block max-w-[180px] truncate text-xs" style={{ color: "var(--danger)" }} title={backup.lastRestoreError}>{backup.lastRestoreError}</code> : null}
        </div>
      )
    },
    {
      key: "evidence",
      header: "Evidence",
      helpKey: "deploy.evidence",
      render: (backup) => {
        const evidenceCount = backup.verification?.evidence?.length || 0;
        const failedEvidenceCount = backup.verification?.evidence?.filter((item) => item.status === "failed").length || 0;
        const restoreEvidenceCount = backup.restoreEvidence?.length || 0;
        const failedRestoreEvidenceCount = backup.restoreEvidence?.filter((item) => item.status === "failed").length || 0;
        return (
          <div className="space-y-1">
            <span className={`badge ${failedEvidenceCount ? "badge-danger" : evidenceCount ? "badge-success" : "badge-neutral"}`}>{evidenceCount ? `${evidenceCount} files` : "no evidence"}</span>
            <span className={`badge ${failedRestoreEvidenceCount ? "badge-danger" : restoreEvidenceCount ? "badge-success" : "badge-neutral"}`}>{restoreEvidenceCount ? `${restoreEvidenceCount} restore files` : "no restore evidence"}</span>
            {backup.backupSha256 ? <code className="num block max-w-[180px] truncate text-xs muted" title={backup.backupSha256}>{backup.backupSha256}</code> : null}
          </div>
        );
      }
    },
    {
      key: "actions",
      header: "פעולות",
      helpKey: "operations",
      render: (backup) => {
        const restoreAttempted = hasRestoreAttempt(backup);
        return (
          <div className="flex flex-wrap gap-2">
            <button className={`btn ${selectedRestoreBackup?._id === backup._id ? "btn-primary" : "btn-secondary"} min-h-0 px-2 py-1 text-xs`} disabled={!restoreAttempted} onClick={() => setSelectedRestoreBackupId(backup._id)} type="button"><Eye size={13} />Evidence שחזור</button>
            <button className="btn btn-secondary min-h-0 px-2 py-1 text-xs" onClick={() => runAction(`verify-${backup._id}`, async () => {
              const result = await sitesApi.verifyBackup(backup._id, "Manual read-only SharePoint verification");
              setMessage(result.data.verification?.status === "verified"
                ? `Backup ${backup.backupId} אומת מול SharePoint`
                : `Backup ${backup.backupId} נכשל באימות; evidence נשמר`);
              await load();
            })} type="button">אמת מול SharePoint</button>
            <button className="btn btn-secondary min-h-0 px-2 py-1 text-xs" disabled={busyAction === `restore-plan-${backup._id}`} onClick={() => runAction(`restore-plan-${backup._id}`, async () => {
              await sitesApi.restorePlan(backup._id, "Auto-generated restore planning note");
              setMessage(`נוצר restore plan מטא־דאטה עבור ${backup.backupId}`);
            })} type="button">Restore plan בלבד</button>
            <button className="btn btn-danger min-h-0 px-2 py-1 text-xs" disabled={!writeAvailable || busyAction === `restore-queue-${backup._id}`} onClick={() => setRestoreRequestBackup(backup)} type="button"><RotateCcw size={13} />Restore job לאישור</button>
          </div>
        );
      }
    }
  ];

  const backupHistoryMobileCard = (backup: Backup) => {
    const evidenceCount = backup.verification?.evidence?.length || 0;
    const failedEvidenceCount = backup.verification?.evidence?.filter((item) => item.status === "failed").length || 0;
    const restoreAttempted = hasRestoreAttempt(backup);
    return (
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="num truncate font-bold" style={{ color: "var(--text-strong)" }}>{backup.backupId}</p>
            <p className="num text-xs muted">{formatDateTime(backup.createdAt)}</p>
          </div>
          <span className={`badge ${backup.status === "failed" ? "badge-danger" : backup.status === "succeeded" || backup.status === "verified" ? "badge-success" : "badge-info"}`}>{backup.status}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <span className="muted">קבצים: <span className="num">{formatNumber(backup.filesCount)}</span></span>
          <span className="muted">גודל: <span className="num">{formatBytes(backup.sizeBytes)}</span></span>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={`badge ${backup.verification?.status === "failed" ? "badge-danger" : backup.verification?.status === "verified" ? "badge-success" : "badge-neutral"}`}>{backup.verification?.status || "unverified"}</span>
          <span className={`badge ${restoreStatusBadgeClass(backup.restoreStatus)}`}>{restoreStatusLabel(backup.restoreStatus)}</span>
          <span className={`badge ${failedEvidenceCount ? "badge-danger" : evidenceCount ? "badge-success" : "badge-neutral"}`}>{evidenceCount ? `${evidenceCount} evidence` : "no evidence"}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={`btn ${selectedRestoreBackup?._id === backup._id ? "btn-primary" : "btn-secondary"} min-h-0 px-2 py-1 text-xs`} disabled={!restoreAttempted} onClick={() => setSelectedRestoreBackupId(backup._id)} type="button"><Eye size={13} />Evidence</button>
          <button className="btn btn-secondary min-h-0 px-2 py-1 text-xs" onClick={() => runAction(`verify-${backup._id}`, async () => {
            const result = await sitesApi.verifyBackup(backup._id, "Manual read-only SharePoint verification");
            setMessage(result.data.verification?.status === "verified" ? `Backup ${backup.backupId} אומת מול SharePoint` : `Backup ${backup.backupId} נכשל באימות; evidence נשמר`);
            await load();
          })} type="button">אמת</button>
          <button className="btn btn-danger min-h-0 px-2 py-1 text-xs" disabled={!writeAvailable || busyAction === `restore-queue-${backup._id}`} onClick={() => setRestoreRequestBackup(backup)} type="button"><RotateCcw size={13} />Restore</button>
        </div>
      </div>
    );
  };

  const backupPlanSourceColumns: DataTableColumn<BackupPlanSource>[] = [
    { key: "label", header: "קובץ", helpKey: "backup", render: (source) => <span className="font-bold">{source.label}</span> },
    {
      key: "status",
      header: "מצב",
      helpKey: "health",
      render: (source) => <span className={`badge ${source.exists ? "badge-success" : source.authBlocked ? "badge-warning" : "badge-danger"}`}>{source.exists ? "קיים" : source.authBlocked ? "Auth" : "חסר"} {source.status || ""}</span>
    },
    { key: "size", header: "גודל", helpKey: "storage", render: (source) => <span className="num">{formatBytes(source.sizeBytes)}</span> },
    { key: "path", header: "נתיב", helpKey: "health.pathFailure", render: (source) => <code className="num block max-w-[520px] truncate text-xs muted" title={source.serverRelativePath}>{source.serverRelativePath}</code> }
  ];

  const inventoryFolderColumns: DataTableColumn<SharePointBackupInventoryFolder>[] = [
    { key: "name", header: "תיקיית גיבוי", helpKey: "backup.inventory", render: (folder) => <span className="font-bold">{folder.name}</span> },
    { key: "files", header: "קבצים", helpKey: "backup.inventory", render: (folder) => <span className="num">{backupInventory?.includeFiles ? formatNumber(folder.filesCount) : folder.itemCount !== undefined ? formatNumber(folder.itemCount) : "-"}</span> },
    { key: "size", header: "גודל ידוע", helpKey: "storage", render: (folder) => <span className="num">{formatBytes(folder.knownSizeBytes)}</span> },
    { key: "updated", header: "עודכן", helpKey: "history", render: (folder) => <span className="num text-xs">{formatDateTime(folder.timeLastModified)}</span> },
    {
      key: "status",
      header: "סטטוס קבצים",
      helpKey: "health",
      render: (folder) => <span className={`badge ${!folder.filesStatus ? "badge-neutral" : folder.filesStatus.exists ? "badge-success" : folder.filesStatus.authBlocked ? "badge-warning" : "badge-danger"}`}>{folder.filesStatus ? folder.filesStatus.status || folder.filesStatus.error || "read" : "folders only"}</span>
    },
    { key: "path", header: "נתיב", helpKey: "health.pathFailure", render: (folder) => <code className="num block max-w-[440px] truncate text-xs muted" title={folder.serverRelativeUrl}>{folder.serverRelativeUrl}</code> }
  ];

  type InventoryFileRow = { folder: SharePointBackupInventoryFolder; file: SharePointBackupInventoryFile };
  const inventoryFileColumns: DataTableColumn<InventoryFileRow>[] = [
    { key: "folder", header: "תיקייה", helpKey: "backup.inventory", render: ({ folder }) => folder.name },
    { key: "file", header: "קובץ", helpKey: "backup.inventory", render: ({ file }) => <span className="font-bold">{file.name}</span> },
    { key: "size", header: "גודל", helpKey: "storage", render: ({ file }) => <span className="num">{formatBytes(file.sizeBytes)}</span> },
    { key: "updated", header: "עודכן", helpKey: "history", render: ({ file }) => <span className="num text-xs">{formatDateTime(file.timeLastModified)}</span> },
    { key: "path", header: "נתיב", helpKey: "health.pathFailure", render: ({ file }) => <code className="num block max-w-[520px] truncate text-xs muted" title={file.serverRelativeUrl}>{file.serverRelativeUrl}</code> }
  ];

  const restoreEvidenceColumns: DataTableColumn<BackupRestoreEvidence>[] = [
    {
      key: "status",
      header: "סטטוס",
      helpKey: "job.status",
      render: (item) => (
        <div className="space-y-1">
          <span className={`badge ${item.status === "verified" ? "badge-success" : "badge-danger"}`}>{item.status}</span>
          {item.checkedAt ? <div className="num text-xs muted">{formatDateTime(item.checkedAt)}</div> : null}
          {item.httpStatus ? <span className="badge badge-neutral">HTTP {item.httpStatus}</span> : null}
        </div>
      )
    },
    {
      key: "source",
      header: "Source",
      helpKey: "backup.restore",
      render: (item) => (
        <div className="space-y-2">
          <code className="num block max-w-[260px] truncate text-xs muted" title={item.sourcePath}>{item.sourcePath || "-"}</code>
          <span className="badge badge-neutral">metadata שמור</span>
          <span className="badge badge-neutral">expected {formatBytes(item.expectedBackupSizeBytes)}</span>
          {item.expectedBackupSha256 ? <code className="num block max-w-[220px] truncate text-xs muted" title={item.expectedBackupSha256}>sha {item.expectedBackupSha256}</code> : null}
        </div>
      )
    },
    {
      key: "backup",
      header: "Backup",
      helpKey: "backup",
      render: (item) => {
        const backupSizeOk = backupSizeMatches(item);
        const backupShaOk = backupShaMatches(item);
        const backupFileOk = backupSizeOk === false || backupShaOk === false
          ? false
          : backupSizeOk === true && backupShaOk === true
            ? true
            : undefined;
        return (
          <div className="space-y-2">
            <code className="num block max-w-[260px] truncate text-xs muted" title={item.backupPath}>{item.backupPath || "-"}</code>
            <span className={`badge ${matchBadgeClass(backupFileOk)}`}>backup {matchLabel(backupFileOk)}</span>
            <span className={`badge ${matchBadgeClass(backupSizeOk)}`}>size {matchLabel(backupSizeOk)}</span>
            <span className={`badge ${matchBadgeClass(backupShaOk)}`}>sha {matchLabel(backupShaOk)}</span>
            <div className="num text-xs muted">{formatBytes(item.backupSizeBytes)}</div>
          </div>
        );
      }
    },
    {
      key: "target",
      header: "Target",
      helpKey: "backup.restore",
      render: (item) => (
        <div className="space-y-2">
          <code className="num block max-w-[260px] truncate text-xs muted" title={item.targetPath}>{item.targetPath || "-"}</code>
          <span className={`badge ${matchBadgeClass(item.sizeMatches)}`}>size {matchLabel(item.sizeMatches)}</span>
          <span className={`badge ${matchBadgeClass(item.sha256Matches)}`}>sha {matchLabel(item.sha256Matches)}</span>
          <div className="num text-xs muted">{formatBytes(item.restoredSizeBytes)}</div>
        </div>
      )
    },
    { key: "error", header: "שגיאה", helpKey: "job.failed", render: (item) => item.error ? <code className="num block max-w-[260px] truncate text-xs" style={{ color: "var(--danger)" }} title={item.error}>{item.error}</code> : <span className="muted">-</span> }
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="גיבויים"
        subtitle="מרכז גיבוי לאתרי Site Builder. תכנון גיבוי הוא read-only; ביצוע אמיתי דורש כתיבה ל־SharePoint."
        actions={writeAvailable ? <span className="badge badge-success">SharePoint backup מחובר</span> : <MetadataOnlyBadge mode="notConnected" />}
        helpKey="backup"
      />

      {message ? <div className="badge badge-success px-3 py-2">{message}</div> : null}
      {loading ? <LoadingState /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !error ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard title="גיבויים רשומים" value={formatNumber(backups.length)} icon={<DatabaseBackup size={18} />} description="רשומות backup ב־Hub" tone="info" helpKey="backup" />
            <KpiCard title="גודל מצטבר" value={formatBytes(totalSize)} icon={<DatabaseBackup size={18} />} description="מבוסס על metadata" tone="neutral" helpKey="storage" />
            <KpiCard title="אומתו" value={formatNumber(verifiedBackups.length)} icon={<ClipboardCheck size={18} />} description="אימות read-back מול SharePoint" tone="success" helpKey="backup.verified" />
            <KpiCard title="נכשלו" value={formatNumber(failedBackups.length)} icon={<ShieldAlert size={18} />} description="דורשים בדיקה" tone={failedBackups.length ? "danger" : "success"} helpKey="job.failed" />
          </div>

          <div className="flex flex-wrap gap-2 border-b divider pb-2">
            {backupTabs.map(({ key, label }) => (
              <button key={key} className={`btn ${backupTab === key ? "btn-primary" : "btn-secondary"}`} type="button" onClick={() => setBackupTab(key)}>
                {label}
              </button>
            ))}
          </div>

          {backupTab === "overview" ? (
            <SectionCard title="סקירת גיבויים" subtitle="מצב כללי והפעולות הבאות" helpKey="backup">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="soft-panel p-4">
                  <p className="field-label">פעולה מומלצת</p>
                  <p className="font-bold" style={{ color: "var(--text-strong)" }}>{failedBackups.length ? "בדוק גיבויים שנכשלו" : backups.length ? "אמת גיבויים קיימים לפי צורך" : "צור תוכנית גיבוי ראשונה"}</p>
                </div>
                <div className="soft-panel p-4">
                  <p className="field-label">כתיבה ל־SharePoint</p>
                  <p className="font-bold" style={{ color: writeAvailable ? "var(--success)" : "var(--warning)" }}>{writeAvailable ? "זמינה" : "חסומה"}</p>
                </div>
                <div className="soft-panel p-4">
                  <p className="field-label">שחזור</p>
                  <p className="font-bold" style={{ color: "var(--warning)" }}>פעולה מוגנת ודורשת אישור</p>
                </div>
              </div>
            </SectionCard>
          ) : null}

          {backupTab === "overview" || backupTab === "plan" ? (
          <SectionCard title="תכנון והרצת גיבוי" subtitle="Backup plan בודק קבצי TXT/JSON בלי ליצור תיקיות או קבצים ב־SharePoint." helpKey="backup">
            <div className="mb-4 flex flex-wrap gap-2">
              <MetadataOnlyBadge mode="readonly" />
              {!writeAvailable ? <MetadataOnlyBadge mode="notConnected" /> : null}
            </div>
            <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto] md:items-end">
              <label className="block">
                <span className="field-label"><HelpLabel helpKey="sites.registry">אתר</HelpLabel></span>
                <select className="control" value={selectedSiteId} onChange={(e) => { setSelectedSiteId(e.target.value); setSitePlan(null); setBackupInventory(null); }}>
                  {sites.map((site) => <option key={site._id} value={site._id}>{site.displayName} ({site.siteCode})</option>)}
                </select>
              </label>
              <button className="btn btn-primary" disabled={!selectedSiteId || busyAction === "site-plan"} onClick={() => runAction("site-plan", async () => {
                const result = await sitesApi.siteBackupPlan(selectedSiteId);
                setSitePlan(result.data);
                setMessage("תוכנית גיבוי לאתר נוצרה");
              })} type="button"><ClipboardCheck size={15} />תוכנית לאתר</button>
              <button className="btn btn-secondary" disabled={busyAction === "all-plan"} onClick={() => runAction("all-plan", async () => {
                const result = await sitesApi.allBackupPlans();
                setAllPlans(result.data);
                setMessage("תוכנית גיבוי לכל האתרים נוצרה");
              })} type="button">תוכנית לכל האתרים</button>
              <button className="btn btn-secondary" disabled={!writeAvailable || busyAction === "run-all"} onClick={() => runAction("run-all", async () => {
                const result = await sitesApi.runAllBackups();
                setMessage(`נוצרו ${result.data.queued} jobs לגיבוי`);
                await load();
              })} type="button"><Play size={15} />הרץ גיבוי לכל האתרים</button>
            </div>

            {sitePlan ? (
              <div className="mt-5 space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <KpiCard title="מקורות קיימים" value={`${sitePlan.summary.existingSources}/${sitePlan.summary.totalSources}`} icon={<ClipboardCheck size={18} />} tone={sitePlan.summary.readyForBackup ? "success" : "warning"} helpKey="backup" />
                  <KpiCard title="חסרים" value={sitePlan.summary.missingSources} icon={<ShieldAlert size={18} />} tone={sitePlan.summary.missingSources ? "warning" : "success"} helpKey="deploy.blocker" />
                  <KpiCard title="Auth blocked" value={sitePlan.summary.authBlockedSources} icon={<ShieldAlert size={18} />} tone={sitePlan.summary.authBlockedSources ? "warning" : "success"} helpKey="health.401" />
                  <KpiCard title="גודל ידוע" value={formatBytes(sitePlan.summary.knownSizeBytes)} icon={<DatabaseBackup size={18} />} tone="neutral" helpKey="storage" />
                </div>
                <LinkRow label="Backups root" value={sitePlan.target.backupsRoot} />
                <LinkRow label="Backup folder preview" value={sitePlan.target.backupFolder} />
                <DataTable
                  columns={backupPlanSourceColumns}
                  rows={sitePlan.sources}
                  rowKey={(source) => source.serverRelativePath}
                  minWidth={920}
                  mobileCard={(source) => (
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-bold">{source.label}</p>
                        <span className={`badge shrink-0 ${source.exists ? "badge-success" : source.authBlocked ? "badge-warning" : "badge-danger"}`}>{source.exists ? "קיים" : source.authBlocked ? "Auth" : "חסר"}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className="badge badge-neutral">{formatBytes(source.sizeBytes)}</span>
                        {source.status ? <span className="badge badge-neutral">HTTP {source.status}</span> : null}
                      </div>
                      <code className="num block max-w-full truncate text-xs muted" title={source.serverRelativePath}>{source.serverRelativePath}</code>
                    </div>
                  )}
                />
              </div>
            ) : null}

            {allPlans ? (
              <div className="mt-5 rounded-lg border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--border)" }}>
                <p className="font-bold" style={{ color: "var(--text-strong)" }}>סיכום תוכנית לכל האתרים</p>
                <p className="num mt-1 text-sm muted">{allPlans.readyCount}/{allPlans.count} מוכנים לגיבוי · {allPlans.failedCount} כשלו בבניית תוכנית</p>
              </div>
            ) : null}
          </SectionCard>
          ) : null}

          {backupTab === "schedule" ? (
          <SectionCard title="תזמון גיבוי חוזר" subtitle="השרת ייצור backup jobs לפי המרווח שנשמר. במצב בעלים jobs נשלחים לתור ללא אישור נוסף." helpKey="backup.schedule">
            <div className="mb-4 flex flex-wrap gap-2">
              <span className="badge badge-success">Owner direct</span>
              {!writeAvailable ? <MetadataOnlyBadge mode="notConnected" /> : null}
            </div>
            <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto] md:items-end">
              <label className="block">
                <span className="field-label">אתר</span>
                <select className="control" value={selectedSiteId} onChange={(e) => { setSelectedSiteId(e.target.value); setSitePlan(null); setBackupInventory(null); }}>
                  {sites.map((site) => <option key={site._id} value={site._id}>{site.displayName} ({site.siteCode})</option>)}
                </select>
              </label>
              <label className="block">
                <span className="field-label"><HelpLabel helpKey="backup.schedule">מרווח בדקות</HelpLabel></span>
                <input className="control num" min={5} type="number" value={scheduleInterval} onChange={(e) => setScheduleInterval(Number(e.target.value))} />
              </label>
              <label className="flex min-h-[44px] items-center gap-2">
                <input checked={scheduleEnabled} onChange={(e) => setScheduleEnabled(e.target.checked)} type="checkbox" />
                <span className="font-bold">פעיל</span>
              </label>
              <button className="btn btn-primary" disabled={!selectedSiteId || busyAction === "backup-schedule"} onClick={saveBackupSchedule} type="button">שמור תזמון</button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="badge badge-neutral">Next: {formatDateTime(selectedSite?.maintenanceSchedule?.backup?.nextRunAt)}</span>
              <span className="badge badge-neutral">Last job: {selectedSite?.maintenanceSchedule?.backup?.lastJobId || "-"}</span>
              {selectedSite?.maintenanceSchedule?.backup?.lastError ? <span className="badge badge-danger">{selectedSite.maintenanceSchedule.backup.lastError}</span> : null}
            </div>
          </SectionCard>
          ) : null}

          {backupTab === "inventory" ? (
          <SectionCard
            title="Inventory SharePoint קיים"
            subtitle="קריאת תיקיות וקבצי backup קיימים ישירות מ־SharePoint, בנפרד מרשומות Mongo וללא כתיבה."
            helpKey="backup.inventory"
          >
            <div className="mb-4 flex flex-wrap gap-2">
              <MetadataOnlyBadge mode="readonly" />
              <span className="badge badge-neutral">REST GET only</span>
            </div>
            <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
              <label className="block">
                <span className="field-label">אתר</span>
                <select className="control" value={selectedSiteId} onChange={(e) => { setSelectedSiteId(e.target.value); setSitePlan(null); setBackupInventory(null); }}>
                  {sites.map((site) => <option key={site._id} value={site._id}>{site.displayName} ({site.siteCode})</option>)}
                </select>
              </label>
              <button className="btn btn-secondary" disabled={!selectedSiteId || busyAction === "inventory-folders"} onClick={() => runAction("inventory-folders", async () => {
                const result = await sitesApi.siteBackupInventory(selectedSiteId, false);
                setBackupInventory(result.data);
                setMessage(`נקראו ${result.data.summary.foldersCount} תיקיות גיבוי מ־SharePoint`);
              })} type="button"><FolderSearch size={15} />תיקיות בלבד</button>
              <button className="btn btn-primary" disabled={!selectedSiteId || busyAction === "inventory-files"} onClick={() => runAction("inventory-files", async () => {
                const result = await sitesApi.siteBackupInventory(selectedSiteId, true);
                setBackupInventory(result.data);
                setMessage(`נקראו ${result.data.summary.foldersCount} תיקיות ו־${result.data.summary.filesCount} קבצים מ־SharePoint`);
              })} type="button"><FolderSearch size={15} />תיקיות וקבצים</button>
            </div>

            {backupInventory ? (
              <div className="mt-5 space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <KpiCard title="Root" value={backupInventory.summary.rootExists ? "קיים" : "לא נקרא"} icon={<FolderSearch size={18} />} description={backupInventory.root.status ? `HTTP ${backupInventory.root.status}` : backupInventory.root.error || "סטטוס קריאה"} tone={backupInventory.summary.readOk ? "success" : backupInventory.summary.authBlocked ? "warning" : "danger"} helpKey="backup.inventory" />
                  <KpiCard title="תיקיות" value={formatNumber(backupInventory.summary.foldersCount)} icon={<DatabaseBackup size={18} />} description="תיקיות תחת Backups root" tone="info" helpKey="backup.inventory" />
                  <KpiCard title="קבצים" value={formatNumber(backupInventory.summary.filesCount)} icon={<ClipboardCheck size={18} />} description={backupInventory.includeFiles ? "metadata מקבצי הגיבוי" : "לא נטען בבקשה זו"} tone="neutral" helpKey="backup.inventory" />
                  <KpiCard title="גודל ידוע" value={formatBytes(backupInventory.summary.knownSizeBytes)} icon={<DatabaseBackup size={18} />} description="מבוסס Length מ־SharePoint" tone="neutral" helpKey="storage" />
                </div>
                <LinkRow label="Backups root" value={backupInventory.root.serverRelativePath} />
                {backupInventory.notes.length ? (
                  <div className="rounded-lg border p-3 text-sm muted" style={{ background: "var(--surface-muted)", borderColor: "var(--border)" }}>
                    {backupInventory.notes.join(" ")}
                  </div>
                ) : null}
                {backupInventory.folders.length === 0 ? (
                  <EmptyState title="אין תיקיות גיבוי" description="לא נמצאו תיקיות תחת Backups root או שהקריאה לא הצליחה." />
                ) : (
                  <DataTable
                    columns={inventoryFolderColumns}
                    rows={backupInventory.folders}
                    rowKey={(folder) => folder.serverRelativeUrl}
                    minWidth={1080}
                    mobileCard={(folder) => (
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <p className="truncate font-bold">{folder.name}</p>
                          <span className={`badge shrink-0 ${!folder.filesStatus ? "badge-neutral" : folder.filesStatus.exists ? "badge-success" : folder.filesStatus.authBlocked ? "badge-warning" : "badge-danger"}`}>{folder.filesStatus ? folder.filesStatus.status || folder.filesStatus.error || "read" : "folders only"}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <span className="muted">קבצים: <span className="num">{backupInventory.includeFiles ? formatNumber(folder.filesCount) : folder.itemCount !== undefined ? formatNumber(folder.itemCount) : "-"}</span></span>
                          <span className="muted">גודל: <span className="num">{formatBytes(folder.knownSizeBytes)}</span></span>
                        </div>
                        <code className="num block max-w-full truncate text-xs muted" title={folder.serverRelativeUrl}>{folder.serverRelativeUrl}</code>
                      </div>
                    )}
                  />
                )}

                {backupInventory.includeFiles ? (
                  inventoryFiles.length === 0 ? (
                    <EmptyState title="אין קבצים להצגה" description="התיקיות נקראו, אך לא נמצאו קבצים או שקריאת הקבצים נחסמה." />
                  ) : (
                    <DataTable
                      columns={inventoryFileColumns}
                      rows={inventoryFiles}
                      rowKey={({ file }) => file.serverRelativeUrl}
                      minWidth={1080}
                      mobileCard={({ folder, file }) => (
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-bold">{file.name}</p>
                              <p className="text-xs muted">{folder.name}</p>
                            </div>
                            <span className="num badge badge-neutral shrink-0">{formatBytes(file.sizeBytes)}</span>
                          </div>
                          <p className="num text-xs muted">{formatDateTime(file.timeLastModified)}</p>
                          <code className="num block max-w-full truncate text-xs muted" title={file.serverRelativeUrl}>{file.serverRelativeUrl}</code>
                        </div>
                      )}
                    />
                  )
                ) : null}
              </div>
            ) : null}
          </SectionCard>
          ) : null}

          {backupTab === "history" || backupTab === "restore" ? (
          <SectionCard
            title="היסטוריית גיבויים"
            subtitle="Verify קורא את קבצי הגיבוי מ־SharePoint ומשווה sha256/size מול evidence שמור; Restore plan הוא תכנון בלבד, ו־Restore job נשלח לתור במצב בעלים."
            helpKey="history"
            actions={<button className="btn btn-secondary" onClick={load} type="button"><RefreshCcw size={15} />רענן</button>}
          >
            <div className="mb-4 flex flex-wrap gap-2">
              <MetadataOnlyBadge mode="readonly" />
              <MetadataOnlyBadge mode="metadata" />
              {writeAvailable ? <span className="badge badge-success">Restore במצב בעלים</span> : null}
            </div>
            {backups.length === 0 ? (
              <EmptyState title="אין גיבויים" description="היסטוריית גיבויים תופיע לאחר הרצת backup job." />
            ) : (
              <DataTable columns={backupHistoryColumns} rows={backups} rowKey={(backup) => backup._id} mobileCard={backupHistoryMobileCard} minWidth={1360} density="dense" />
            )}

            {selectedRestoreBackup ? (
              <div className="mt-5 space-y-4">
                <div className="soft-panel p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold muted">Restore evidence</p>
                      <p className="num mt-1 font-bold" style={{ color: "var(--text-strong)" }}>{selectedRestoreBackup.backupId}</p>
                    </div>
                    <span className={`badge ${restoreStatusBadgeClass(selectedRestoreBackup.restoreStatus)}`}>{restoreStatusLabel(selectedRestoreBackup.restoreStatus)}</span>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div>
                      <span className="field-label">מועד שחזור אחרון</span>
                      <p className="num text-sm">{formatDateTime(selectedRestoreBackup.lastRestoreAt)}</p>
                    </div>
                    <div>
                      <span className="field-label">Restore job</span>
                      {selectedRestoreBackup.lastRestoreJobId ? (
                        <code className="num block max-w-[220px] truncate text-sm" title={selectedRestoreBackup.lastRestoreJobId}>{selectedRestoreBackup.lastRestoreJobId}</code>
                      ) : <p className="muted">-</p>}
                    </div>
                    <div>
                      <span className="field-label">קבצי evidence</span>
                      <p className="num text-sm">{formatNumber(selectedRestoreEvidence.length)} קבצים</p>
                    </div>
                    <div>
                      <span className="field-label">תוצאות קבצים</span>
                      <div className="flex flex-wrap gap-2">
                        <span className="badge badge-success">{formatNumber(selectedRestoreVerifiedCount)} אומתו</span>
                        <span className={`badge ${selectedRestoreFailedCount ? "badge-danger" : "badge-neutral"}`}>{formatNumber(selectedRestoreFailedCount)} נכשלו</span>
                      </div>
                    </div>
                  </div>
                  {selectedRestoreBackup.lastRestoreError ? (
                    <div className="mt-4 rounded-lg border p-3 text-sm" style={{ background: "var(--danger-soft)", borderColor: "color-mix(in srgb, var(--danger) 38%, var(--border))", color: "var(--danger)" }}>
                      <span className="font-bold">שגיאת שחזור אחרונה: </span>
                      <code className="num">{selectedRestoreBackup.lastRestoreError}</code>
                    </div>
                  ) : null}
                </div>

                {selectedRestoreEvidence.length === 0 ? (
                  <EmptyState title="אין restore evidence להצגה" description="לא נשמרו שורות evidence עבור ניסיון השחזור הזה." />
                ) : (
                  <DataTable
                    columns={restoreEvidenceColumns}
                    rows={selectedRestoreEvidence}
                    rowKey={(item, index) => `${item.sourcePath}-${item.backupPath}-${index}`}
                    minWidth={1180}
                    mobileCard={(item) => {
                      const backupSizeOk = backupSizeMatches(item);
                      const backupShaOk = backupShaMatches(item);
                      return (
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold">{item.targetPath || item.backupPath || "restore item"}</p>
                              <p className="num text-xs muted">{formatDateTime(item.checkedAt)}</p>
                            </div>
                            <span className={`badge shrink-0 ${item.status === "verified" ? "badge-success" : "badge-danger"}`}>{item.status}</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <span className={`badge ${matchBadgeClass(backupSizeOk)}`}>backup size {matchLabel(backupSizeOk)}</span>
                            <span className={`badge ${matchBadgeClass(backupShaOk)}`}>backup sha {matchLabel(backupShaOk)}</span>
                            <span className={`badge ${matchBadgeClass(item.sizeMatches)}`}>target size {matchLabel(item.sizeMatches)}</span>
                            <span className={`badge ${matchBadgeClass(item.sha256Matches)}`}>target sha {matchLabel(item.sha256Matches)}</span>
                          </div>
                          {item.error ? <code className="num block max-w-full truncate text-xs" style={{ color: "var(--danger)" }} title={item.error}>{item.error}</code> : null}
                        </div>
                      );
                    }}
                  />
                )}
              </div>
            ) : null}
          </SectionCard>
          ) : null}
        </>
      ) : null}

      <ProtectedActionDialog
        open={Boolean(restoreRequestBackup)}
        title="הרצת Restore"
        description={`יצירת Restore job עבור ${restoreRequestBackup?.backupId || "backup"}. במצב בעלים הפעולה נשלחת לתור ללא אישור נוסף.`}
        confirmWord="שחזר"
        noteLabel="סיבת Restore"
        notePlaceholder="לדוגמה: שחזור לאחר תקלה, אושר מול בעל האתר ונבדק backup עדכני"
        initialNote={restoreRequestBackup ? `Restore backup ${restoreRequestBackup.backupId}` : ""}
        confirmLabel="צור Restore job"
        busy={Boolean(restoreRequestBackup && busyAction === `restore-queue-${restoreRequestBackup._id}`)}
        risks={[
          "Restore מחליף קבצים ביעד SharePoint מתוך backup שנבחר.",
          "מומלץ לוודא evidence/backup עדכני לפני ההרצה.",
          "אם backup אינו תואם לגרסה הרצויה, האתר עלול לחזור למצב לא צפוי."
        ]}
        onClose={() => setRestoreRequestBackup(null)}
        onConfirm={(notes) => {
          const backup = restoreRequestBackup;
          if (!backup) return;
          void runAction(`restore-queue-${backup._id}`, async () => {
            const result = await sitesApi.queueRestoreBackup(backup._id, notes);
            setMessage(`Restore job ${result.data.job._id} נשלח לתור עבור ${backup.backupId}`);
            setRestoreRequestBackup(null);
            await load();
          });
        }}
      />
    </div>
  );
}
