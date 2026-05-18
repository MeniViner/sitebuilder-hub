import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, DatabaseBackup, Eye, FolderSearch, Play, RefreshCcw, RotateCcw, ShieldAlert } from "lucide-react";
import {
  AllBackupPlans,
  Backup,
  BackupPlan,
  BackupRestoreEvidence,
  OperationCapabilities,
  SharePointBackupInventory,
  sitesApi
} from "../api/sitesApi";
import { Site } from "../types/site";
import { DataTable } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { KpiCard } from "../components/KpiCard";
import { LinkRow } from "../components/LinkRow";
import { LoadingState } from "../components/LoadingState";
import { MetadataOnlyBadge } from "../components/MetadataOnlyBadge";
import { PageHeader } from "../components/PageHeader";
import { SectionCard } from "../components/SectionCard";
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

export function BackupsPage() {
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
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleInterval, setScheduleInterval] = useState(24 * 60);

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

  return (
    <div className="space-y-5">
      <PageHeader
        title="גיבויים"
        subtitle="מרכז גיבוי לאתרי Site Builder. תכנון גיבוי הוא read-only; ביצוע אמיתי דורש כתיבה ל־SharePoint."
        actions={writeAvailable ? <span className="badge badge-success">SharePoint backup מחובר</span> : <MetadataOnlyBadge mode="notConnected" />}
      />

      {message ? <div className="badge badge-success px-3 py-2">{message}</div> : null}
      {loading ? <LoadingState /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !error ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard title="גיבויים רשומים" value={formatNumber(backups.length)} icon={<DatabaseBackup size={18} />} description="רשומות backup ב־Hub" tone="info" />
            <KpiCard title="גודל מצטבר" value={formatBytes(totalSize)} icon={<DatabaseBackup size={18} />} description="מבוסס על metadata" tone="neutral" />
            <KpiCard title="אומתו" value={formatNumber(verifiedBackups.length)} icon={<ClipboardCheck size={18} />} description="אימות read-back מול SharePoint" tone="success" />
            <KpiCard title="נכשלו" value={formatNumber(failedBackups.length)} icon={<ShieldAlert size={18} />} description="דורשים בדיקה" tone={failedBackups.length ? "danger" : "success"} />
          </div>

          <SectionCard title="תכנון והרצת גיבוי" subtitle="Backup plan בודק קבצי TXT/JSON בלי ליצור תיקיות או קבצים ב־SharePoint.">
            <div className="mb-4 flex flex-wrap gap-2">
              <MetadataOnlyBadge mode="readonly" />
              {!writeAvailable ? <MetadataOnlyBadge mode="notConnected" /> : null}
            </div>
            <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto] md:items-end">
              <label className="block">
                <span className="field-label">אתר</span>
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
                  <KpiCard title="מקורות קיימים" value={`${sitePlan.summary.existingSources}/${sitePlan.summary.totalSources}`} icon={<ClipboardCheck size={18} />} tone={sitePlan.summary.readyForBackup ? "success" : "warning"} />
                  <KpiCard title="חסרים" value={sitePlan.summary.missingSources} icon={<ShieldAlert size={18} />} tone={sitePlan.summary.missingSources ? "warning" : "success"} />
                  <KpiCard title="Auth blocked" value={sitePlan.summary.authBlockedSources} icon={<ShieldAlert size={18} />} tone={sitePlan.summary.authBlockedSources ? "warning" : "success"} />
                  <KpiCard title="גודל ידוע" value={formatBytes(sitePlan.summary.knownSizeBytes)} icon={<DatabaseBackup size={18} />} tone="neutral" />
                </div>
                <LinkRow label="Backups root" value={sitePlan.target.backupsRoot} />
                <LinkRow label="Backup folder preview" value={sitePlan.target.backupFolder} />
                <DataTable columns={["קובץ", "מצב", "גודל", "נתיב"]} minWidth={920}>
                  {sitePlan.sources.map((source) => (
                    <tr key={source.serverRelativePath}>
                      <td>{source.label}</td>
                      <td><span className={`badge ${source.exists ? "badge-success" : source.authBlocked ? "badge-warning" : "badge-danger"}`}>{source.exists ? "קיים" : source.authBlocked ? "Auth" : "חסר"} {source.status || ""}</span></td>
                      <td className="num">{formatBytes(source.sizeBytes)}</td>
                      <td><code className="num block max-w-[520px] truncate text-xs muted" title={source.serverRelativePath}>{source.serverRelativePath}</code></td>
                    </tr>
                  ))}
                </DataTable>
              </div>
            ) : null}

            {allPlans ? (
              <div className="mt-5 rounded-lg border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--border)" }}>
                <p className="font-bold" style={{ color: "var(--text-strong)" }}>סיכום תוכנית לכל האתרים</p>
                <p className="num mt-1 text-sm muted">{allPlans.readyCount}/{allPlans.count} מוכנים לגיבוי · {allPlans.failedCount} כשלו בבניית תוכנית</p>
              </div>
            ) : null}
          </SectionCard>

          <SectionCard title="תזמון גיבוי חוזר" subtitle="השרת ייצור backup jobs לפי המרווח שנשמר. כל Job עדיין ממתין לאישור Admin לפני כתיבה ל־SharePoint.">
            <div className="mb-4 flex flex-wrap gap-2">
              <span className="badge badge-warning">Approval required</span>
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
                <span className="field-label">מרווח בדקות</span>
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

          <SectionCard
            title="Inventory SharePoint קיים"
            subtitle="קריאת תיקיות וקבצי backup קיימים ישירות מ־SharePoint, בנפרד מרשומות Mongo וללא כתיבה."
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
                  <KpiCard title="Root" value={backupInventory.summary.rootExists ? "קיים" : "לא נקרא"} icon={<FolderSearch size={18} />} description={backupInventory.root.status ? `HTTP ${backupInventory.root.status}` : backupInventory.root.error || "סטטוס קריאה"} tone={backupInventory.summary.readOk ? "success" : backupInventory.summary.authBlocked ? "warning" : "danger"} />
                  <KpiCard title="תיקיות" value={formatNumber(backupInventory.summary.foldersCount)} icon={<DatabaseBackup size={18} />} description="תיקיות תחת Backups root" tone="info" />
                  <KpiCard title="קבצים" value={formatNumber(backupInventory.summary.filesCount)} icon={<ClipboardCheck size={18} />} description={backupInventory.includeFiles ? "metadata מקבצי הגיבוי" : "לא נטען בבקשה זו"} tone="neutral" />
                  <KpiCard title="גודל ידוע" value={formatBytes(backupInventory.summary.knownSizeBytes)} icon={<DatabaseBackup size={18} />} description="מבוסס Length מ־SharePoint" tone="neutral" />
                </div>
                <LinkRow label="Backups root" value={backupInventory.root.serverRelativePath} />
                {backupInventory.notes.length ? (
                  <div className="rounded-lg border p-3 text-sm muted" style={{ background: "var(--surface-muted)", borderColor: "var(--border)" }}>
                    {backupInventory.notes.join(" ")}
                  </div>
                ) : null}
                <DataTable columns={["תיקיית גיבוי", "קבצים", "גודל ידוע", "עודכן", "סטטוס קבצים", "נתיב"]} minWidth={1080}>
                  {backupInventory.folders.length === 0 ? (
                    <tr><td colSpan={6}><EmptyState title="אין תיקיות גיבוי" description="לא נמצאו תיקיות תחת Backups root או שהקריאה לא הצליחה." /></td></tr>
                  ) : backupInventory.folders.map((folder) => (
                    <tr key={folder.serverRelativeUrl}>
                      <td className="font-bold">{folder.name}</td>
                      <td className="num">{backupInventory.includeFiles ? formatNumber(folder.filesCount) : folder.itemCount !== undefined ? formatNumber(folder.itemCount) : "-"}</td>
                      <td className="num">{formatBytes(folder.knownSizeBytes)}</td>
                      <td className="num text-xs">{formatDateTime(folder.timeLastModified)}</td>
                      <td><span className={`badge ${!folder.filesStatus ? "badge-neutral" : folder.filesStatus.exists ? "badge-success" : folder.filesStatus.authBlocked ? "badge-warning" : "badge-danger"}`}>{folder.filesStatus ? folder.filesStatus.status || folder.filesStatus.error || "read" : "folders only"}</span></td>
                      <td><code className="num block max-w-[440px] truncate text-xs muted" title={folder.serverRelativeUrl}>{folder.serverRelativeUrl}</code></td>
                    </tr>
                  ))}
                </DataTable>

                {backupInventory.includeFiles ? (
                  <DataTable columns={["תיקייה", "קובץ", "גודל", "עודכן", "נתיב"]} minWidth={1080}>
                    {inventoryFiles.length === 0 ? (
                      <tr><td colSpan={5}><EmptyState title="אין קבצים להצגה" description="התיקיות נקראו, אך לא נמצאו קבצים או שקריאת הקבצים נחסמה." /></td></tr>
                    ) : inventoryFiles.map(({ folder, file }) => (
                      <tr key={file.serverRelativeUrl}>
                        <td>{folder.name}</td>
                        <td className="font-bold">{file.name}</td>
                        <td className="num">{formatBytes(file.sizeBytes)}</td>
                        <td className="num text-xs">{formatDateTime(file.timeLastModified)}</td>
                        <td><code className="num block max-w-[520px] truncate text-xs muted" title={file.serverRelativeUrl}>{file.serverRelativeUrl}</code></td>
                      </tr>
                    ))}
                  </DataTable>
                ) : null}
              </div>
            ) : null}
          </SectionCard>

          <SectionCard
            title="היסטוריית גיבויים"
            subtitle="Verify קורא את קבצי הגיבוי מ־SharePoint ומשווה sha256/size מול evidence שמור; Restore plan הוא תכנון בלבד, ו־Restore job ממתין לאישור לפני ביצוע."
            actions={<button className="btn btn-secondary" onClick={load} type="button"><RefreshCcw size={15} />רענן</button>}
          >
            <div className="mb-4 flex flex-wrap gap-2">
              <MetadataOnlyBadge mode="readonly" />
              <MetadataOnlyBadge mode="metadata" />
              {writeAvailable ? <span className="badge badge-warning">Restore דורש אישור</span> : null}
            </div>
            <DataTable columns={["Backup ID", "סטטוס", "קבצים", "גודל", "נוצר", "אימות", "שחזור", "Evidence", "פעולות"]} minWidth={1360}>
              {backups.length === 0 ? (
                <tr><td colSpan={9}><EmptyState title="אין גיבויים" description="היסטוריית גיבויים תופיע לאחר הרצת backup job." /></td></tr>
              ) : backups.map((backup) => {
                const evidenceCount = backup.verification?.evidence?.length || 0;
                const failedEvidenceCount = backup.verification?.evidence?.filter((item) => item.status === "failed").length || 0;
                const restoreAttempted = hasRestoreAttempt(backup);
                const restoreEvidenceCount = backup.restoreEvidence?.length || 0;
                const failedRestoreEvidenceCount = backup.restoreEvidence?.filter((item) => item.status === "failed").length || 0;
                return (
                  <tr key={backup._id}>
                    <td className="num font-bold">{backup.backupId}</td>
                    <td><span className={`badge ${backup.status === "failed" ? "badge-danger" : backup.status === "succeeded" || backup.status === "verified" ? "badge-success" : "badge-info"}`}>{backup.status}</span></td>
                    <td className="num">{formatNumber(backup.filesCount)}</td>
                    <td className="num">{formatBytes(backup.sizeBytes)}</td>
                    <td className="num text-xs">{formatDateTime(backup.createdAt)}</td>
                    <td><span className={`badge ${backup.verification?.status === "failed" ? "badge-danger" : backup.verification?.status === "verified" ? "badge-success" : "badge-neutral"}`}>{backup.verification?.status || "unverified"}</span></td>
                    <td>
                      <div className="space-y-1">
                        <span className={`badge ${restoreStatusBadgeClass(backup.restoreStatus)}`}>{restoreStatusLabel(backup.restoreStatus)}</span>
                        {backup.lastRestoreAt ? <div className="num text-xs muted">{formatDateTime(backup.lastRestoreAt)}</div> : null}
                        {backup.lastRestoreJobId ? <code className="num block max-w-[150px] truncate text-xs muted" title={backup.lastRestoreJobId}>job {compactId(backup.lastRestoreJobId)}</code> : null}
                        {backup.lastRestoreError ? <code className="num block max-w-[180px] truncate text-xs" style={{ color: "var(--danger)" }} title={backup.lastRestoreError}>{backup.lastRestoreError}</code> : null}
                      </div>
                    </td>
                    <td>
                      <div className="space-y-1">
                        <span className={`badge ${failedEvidenceCount ? "badge-danger" : evidenceCount ? "badge-success" : "badge-neutral"}`}>{evidenceCount ? `${evidenceCount} files` : "no evidence"}</span>
                        <span className={`badge ${failedRestoreEvidenceCount ? "badge-danger" : restoreEvidenceCount ? "badge-success" : "badge-neutral"}`}>{restoreEvidenceCount ? `${restoreEvidenceCount} restore files` : "no restore evidence"}</span>
                        {backup.backupSha256 ? <code className="num block max-w-[180px] truncate text-xs muted" title={backup.backupSha256}>{backup.backupSha256}</code> : null}
                      </div>
                    </td>
                    <td>
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
                        <button className="btn btn-danger min-h-0 px-2 py-1 text-xs" disabled={!writeAvailable || busyAction === `restore-queue-${backup._id}`} onClick={() => runAction(`restore-queue-${backup._id}`, async () => {
                          const notes = window.prompt("הערה ל־Restore job לאישור (אופציונלי)", `Restore backup ${backup.backupId}`);
                          if (notes === null) return;
                          const result = await sitesApi.queueRestoreBackup(backup._id, notes);
                          setMessage(`Restore job ${result.data.job._id} ממתין לאישור עבור ${backup.backupId}`);
                          await load();
                        })} type="button"><RotateCcw size={13} />Restore job לאישור</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </DataTable>

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

                <DataTable columns={["סטטוס", "Source", "Backup", "Target", "Size", "SHA", "שגיאה"]} minWidth={1320}>
                  {selectedRestoreEvidence.length === 0 ? (
                    <tr><td colSpan={7}><EmptyState title="אין restore evidence להצגה" description="לא נשמרו שורות evidence עבור ניסיון השחזור הזה." /></td></tr>
                  ) : selectedRestoreEvidence.map((item, index) => {
                    const backupSizeOk = backupSizeMatches(item);
                    const backupShaOk = backupShaMatches(item);
                    const backupFileOk = backupSizeOk === false || backupShaOk === false
                      ? false
                      : backupSizeOk === true && backupShaOk === true
                        ? true
                        : undefined;
                    return (
                      <tr key={`${item.sourcePath}-${item.backupPath}-${index}`}>
                        <td>
                          <div className="space-y-1">
                            <span className={`badge ${item.status === "verified" ? "badge-success" : "badge-danger"}`}>{item.status}</span>
                            {item.checkedAt ? <div className="num text-xs muted">{formatDateTime(item.checkedAt)}</div> : null}
                            {item.httpStatus ? <span className="badge badge-neutral">HTTP {item.httpStatus}</span> : null}
                          </div>
                        </td>
                        <td>
                          <div className="space-y-2">
                            <code className="num block max-w-[260px] truncate text-xs muted" title={item.sourcePath}>{item.sourcePath || "-"}</code>
                            <span className="badge badge-neutral">metadata שמור</span>
                            <span className="badge badge-neutral">expected {formatBytes(item.expectedBackupSizeBytes)}</span>
                            {item.expectedBackupSha256 ? <code className="num block max-w-[220px] truncate text-xs muted" title={item.expectedBackupSha256}>sha {item.expectedBackupSha256}</code> : null}
                          </div>
                        </td>
                        <td>
                          <div className="space-y-2">
                            <code className="num block max-w-[260px] truncate text-xs muted" title={item.backupPath}>{item.backupPath || "-"}</code>
                            <span className={`badge ${matchBadgeClass(backupFileOk)}`}>backup {matchLabel(backupFileOk)}</span>
                            <span className={`badge ${matchBadgeClass(backupSizeOk)}`}>size {matchLabel(backupSizeOk)}</span>
                            <span className={`badge ${matchBadgeClass(backupShaOk)}`}>sha {matchLabel(backupShaOk)}</span>
                            <div className="num text-xs muted">{formatBytes(item.backupSizeBytes)}</div>
                            {item.backupSha256 ? <code className="num block max-w-[220px] truncate text-xs muted" title={item.backupSha256}>sha {item.backupSha256}</code> : null}
                          </div>
                        </td>
                        <td>
                          <div className="space-y-2">
                            <code className="num block max-w-[260px] truncate text-xs muted" title={item.targetPath}>{item.targetPath || "-"}</code>
                            <span className={`badge ${item.status === "verified" ? "badge-success" : "badge-danger"}`}>target {item.status}</span>
                            <span className={`badge ${matchBadgeClass(item.sizeMatches)}`}>size {matchLabel(item.sizeMatches)}</span>
                            <span className={`badge ${matchBadgeClass(item.sha256Matches)}`}>sha {matchLabel(item.sha256Matches)}</span>
                            <div className="num text-xs muted">{formatBytes(item.restoredSizeBytes)}</div>
                            {item.restoredSha256 ? <code className="num block max-w-[220px] truncate text-xs muted" title={item.restoredSha256}>sha {item.restoredSha256}</code> : null}
                          </div>
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-2">
                            <span className={`badge ${matchBadgeClass(backupSizeOk)}`}>backup {matchLabel(backupSizeOk)}</span>
                            <span className={`badge ${matchBadgeClass(item.sizeMatches)}`}>target {matchLabel(item.sizeMatches)}</span>
                          </div>
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-2">
                            <span className={`badge ${matchBadgeClass(backupShaOk)}`}>backup {matchLabel(backupShaOk)}</span>
                            <span className={`badge ${matchBadgeClass(item.sha256Matches)}`}>target {matchLabel(item.sha256Matches)}</span>
                          </div>
                        </td>
                        <td>
                          {item.error ? <code className="num block max-w-[260px] truncate text-xs" style={{ color: "var(--danger)" }} title={item.error}>{item.error}</code> : <span className="muted">-</span>}
                        </td>
                      </tr>
                    );
                  })}
                </DataTable>
              </div>
            ) : null}
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}
