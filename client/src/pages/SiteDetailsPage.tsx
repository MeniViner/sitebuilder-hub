import { useEffect, useMemo, useState } from "react";
import { ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Archive, ClipboardList, DatabaseBackup, Edit3, ExternalLink, Eye, FileClock, FolderInput, GitBranch, ListChecks, MessageSquareText, RefreshCcw, Rocket, ShieldCheck, Users, Workflow } from "lucide-react";
import { BackupPlan, DeploymentVerificationEvidence, Job, PermissionsSetupPlan, SharePointHealthResult, SiteBootstrapPlan, SiteDeployment, SiteOperationsSummary, SiteProvisionPlan, sitesApi } from "../api/sitesApi";
import { Site, SiteHealth } from "../types/site";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DataTable } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { HealthBadge } from "../components/HealthBadge";
import { HealthChecklist } from "../components/HealthChecklist";
import { KpiCard } from "../components/KpiCard";
import { LinkRow } from "../components/LinkRow";
import { LoadingState } from "../components/LoadingState";
import { MetadataOnlyBadge } from "../components/MetadataOnlyBadge";
import { PageHeader } from "../components/PageHeader";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { VersionBadge } from "../components/VersionBadge";
import { formatBytes, formatDateTime, formatMb, formatNumber, jobStatusLabel, jobTypeLabel } from "../utils/format";

type TabKey = "overview" | "paths" | "health" | "versions" | "backups" | "admins" | "jobs" | "audit" | "notes";

const tabs: Array<{ key: TabKey; label: string; icon: ReactNode }> = [
  { key: "overview", label: "סקירה", icon: <ClipboardList size={15} /> },
  { key: "paths", label: "נתיבי SharePoint", icon: <FolderInput size={15} /> },
  { key: "health", label: "תקינות", icon: <ShieldCheck size={15} /> },
  { key: "versions", label: "גרסאות", icon: <GitBranch size={15} /> },
  { key: "backups", label: "גיבויים", icon: <DatabaseBackup size={15} /> },
  { key: "admins", label: "מנהלים", icon: <Users size={15} /> },
  { key: "jobs", label: "Jobs", icon: <Workflow size={15} /> },
  { key: "audit", label: "Audit", icon: <FileClock size={15} /> },
  { key: "notes", label: "הערות", icon: <MessageSquareText size={15} /> }
];

const deploymentKindLabel = (kind?: SiteDeployment["deploymentKind"]) => {
  if (kind === "rollback") return "Rollback";
  return "פריסה";
};

const deploymentKindBadgeClass = (kind?: SiteDeployment["deploymentKind"]) =>
  kind === "rollback" ? "badge-warning" : "badge-info";

const deploymentStatusLabel = (status?: string) => {
  const labels: Record<string, string> = {
    queued: "בתור",
    running: "רץ",
    succeeded: "הצליח",
    failed: "נכשל",
    cancelled: "בוטל"
  };
  return labels[status || ""] || status || "-";
};

const deploymentStatusBadgeClass = (status?: string) => {
  if (status === "succeeded") return "badge-success";
  if (status === "failed" || status === "cancelled") return "badge-danger";
  if (status === "running" || status === "queued") return "badge-info";
  return "badge-neutral";
};

const verificationStatusLabel = (status?: string) => {
  const labels: Record<string, string> = {
    verified: "אומת",
    failed: "נכשל",
    unverified: "לא אומת"
  };
  return labels[status || ""] || status || "לא אומת";
};

const verificationBadgeClass = (status?: string) => {
  if (status === "verified") return "badge-success";
  if (status === "failed") return "badge-danger";
  return "badge-neutral";
};

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

const healthEvidenceBadgeClass = (ok?: boolean, authBlocked?: boolean) => {
  if (ok === true) return "badge-success";
  if (authBlocked) return "badge-warning";
  if (ok === false) return "badge-danger";
  return "badge-neutral";
};

const healthEvidenceLabel = (ok?: boolean, authBlocked?: boolean) => {
  if (ok === true) return "OK";
  if (authBlocked) return "AUTH";
  if (ok === false) return "FAIL";
  return "לא ידוע";
};

const hasNumber = (value?: number | null): value is number =>
  typeof value === "number" && Number.isFinite(value);

const formatOptionalBytes = (value?: number | null) => hasNumber(value) ? formatBytes(value) : "-";

const compactValue = (value?: string, start = 8, end = 6) => {
  if (!value) return "";
  return value.length > start + end + 3 ? `${value.slice(0, start)}...${value.slice(-end)}` : value;
};

const evidenceKey = (item: DeploymentVerificationEvidence, index: number) =>
  `${item.relativePath || item.targetPath || item.sourcePath || "evidence"}-${index}`;

export function SiteDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [site, setSite] = useState<Site | null>(null);
  const [summary, setSummary] = useState<SiteOperationsSummary | null>(null);
  const [adminData, setAdminData] = useState<any>(null);
  const [auditRows, setAuditRows] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [healthDraft, setHealthDraft] = useState<SiteHealth>({});
  const [sharePointHealth, setSharePointHealth] = useState<SharePointHealthResult | null>(null);
  const [backupPlan, setBackupPlan] = useState<BackupPlan | null>(null);
  const [bootstrapPlan, setBootstrapPlan] = useState<SiteBootstrapPlan | null>(null);
  const [provisionPlan, setProvisionPlan] = useState<SiteProvisionPlan | null>(null);
  const [permissionsPlan, setPermissionsPlan] = useState<PermissionsSetupPlan | null>(null);
  const [busyAction, setBusyAction] = useState("");
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [selectedDeploymentId, setSelectedDeploymentId] = useState("");

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const siteRes = await sitesApi.getById(id);
      setSite(siteRes.data);
      setHealthDraft(siteRes.data.health || {});

      const [summaryRes, adminsRes, auditRes] = await Promise.allSettled([
        sitesApi.siteOperationsSummary(id),
        sitesApi.siteAdmins(id),
        sitesApi.audit()
      ]);
      setSummary(summaryRes.status === "fulfilled" ? summaryRes.value.data : null);
      setAdminData(adminsRes.status === "fulfilled" ? adminsRes.value.data : null);
      setAuditRows(auditRes.status === "fulfilled" ? auditRes.value.data.filter((row: any) => row.entityId === id) : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בטעינת פרטי אתר");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const writeAvailable = Boolean(summary?.capabilities.sharePoint.writeAvailable);
  const paths = site?.resolvedPaths;
  const jobs = (summary?.recent.jobs || []) as Job[];
  const backups = summary?.recent.backups || [];
  const deployments: SiteDeployment[] = summary?.recent.deployments || [];
  const selectedDeployment = useMemo(
    () => deployments.find((deployment) => deployment._id === selectedDeploymentId) || deployments[0] || null,
    [deployments, selectedDeploymentId]
  );
  const selectedDeploymentEvidence = selectedDeployment?.verification?.evidence || [];
  const selectedFinalAppUrlVerification = selectedDeployment?.verification?.finalAppUrlVerification;
  const selectedFinalAppUrl = selectedFinalAppUrlVerification?.url || selectedFinalAppUrlVerification?.finalAppUrl || "";
  const selectedFinalAppUrlStatus = selectedFinalAppUrlVerification?.status ?? selectedFinalAppUrlVerification?.httpStatus;
  const selectedFinalAppUrlStatusText = selectedFinalAppUrlVerification?.statusText || selectedFinalAppUrlVerification?.httpStatusText || "";
  const selectedPostHealth = selectedDeployment?.verification?.postHealth;
  const selectedPostHealthEvidence = selectedPostHealth?.evidence || [];
  const selectedDeploymentJob = selectedDeployment?.jobId
    ? jobs.find((job) => job._id === selectedDeployment.jobId)
    : undefined;
  const selectedDeploymentTargetPaths = selectedDeploymentEvidence.length
    ? selectedDeploymentEvidence.map((item) => item.targetPath).filter(Boolean)
    : selectedDeploymentJob?.targetPaths || [];
  const selectedDeploymentFilesCount = selectedDeployment?.verification?.filesCount ?? selectedDeploymentEvidence.length;
  const selectedDeploymentVerifiedCount = selectedDeployment?.verification?.verifiedFilesCount
    ?? selectedDeploymentEvidence.filter((item) => item.status === "verified").length;
  const selectedDeploymentFailedCount = selectedDeployment?.verification?.failedFilesCount
    ?? selectedDeploymentEvidence.filter((item) => item.status === "failed").length;
  const bootstrapStepsCount = bootstrapPlan?.summary?.totalSteps ?? bootstrapPlan?.steps?.length ?? 0;
  const bootstrapBlockers = bootstrapPlan?.blockers || [];
  const bootstrapBlockersCount = bootstrapBlockers.length;
  const bootstrapTargetUrl = bootstrapPlan?.targetWeb?.sharePointSiteUrl || site?.sharePointSiteUrl || "";
  const bootstrapReady = bootstrapPlan?.summary?.readyForBootstrapExecution ?? (bootstrapBlockersCount === 0);

  const pathRows = useMemo(() => {
    if (!site) return [];
    return [
      { label: "Final app URL", value: paths?.finalAppUrl || site.finalAppUrl, isUrl: true, description: "כתובת ההפעלה הסופית מתוך siteDB/dist/index.html" },
      { label: "SharePoint site URL", value: paths?.sharePointSiteUrl || site.sharePointSiteUrl, isUrl: true, description: "שורש אתר SharePoint המארח" },
      { label: "site root", value: paths?.siteRoot },
      { label: "siteDB root", value: paths?.siteDbRoot || site.siteDbLibrary, description: "Document Library ראשית" },
      { label: "siteUsersDb root", value: paths?.usersDbRoot || site.usersDbLibrary, description: "Document Library לנתוני משתמשים/widgets" },
      { label: "siteAssets root", value: paths?.siteAssetsRoot },
      { label: "dist root", value: paths?.finalDistRoot },
      { label: "master config path", value: paths?.txtFiles?.masterConfig },
      { label: "users_data path", value: paths?.txtFiles?.users },
      { label: "widgets_data path", value: paths?.txtFiles?.widgets },
      { label: "backups root", value: paths?.backupsRoot },
      { label: "bootstrap setup URL", value: paths?.bootstrapUrl || site.bootstrapUrl, isUrl: true }
    ];
  }, [site, paths]);

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

  if (loading) return <LoadingState label="טוען פרטי אתר..." />;
  if (error && !site) return <ErrorState message={error} onRetry={load} />;
  if (!site) return <EmptyState title="האתר לא נמצא" description="לא נמצאה רשומה מתאימה ב־Hub." />;

  return (
    <div className="space-y-5">
      <PageHeader
        title={site.displayName}
        subtitle={`קוד אתר: ${site.siteCode}`}
        actions={
          <>
            <a className="btn btn-primary" href={site.finalAppUrl || paths?.finalAppUrl || site.sharePointSiteUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} />פתח אתר</a>
            <a className="btn btn-secondary" href={site.sharePointSiteUrl || paths?.sharePointSiteUrl} target="_blank" rel="noreferrer"><FolderInput size={16} />פתח SharePoint</a>
            <Link className="btn btn-secondary" to={`/sites?edit=${site._id}`}><Edit3 size={16} />ערוך</Link>
            <button className="btn btn-danger" onClick={() => setConfirmArchive(true)} type="button"><Archive size={16} />ארכב</button>
          </>
        }
      />

      {message ? <div className="badge badge-success px-3 py-2">{message}</div> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}

      <div className="surface-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={site.status} />
            <HealthBadge status={site.derivedHealthStatus} />
            <VersionBadge status={site.versionStatus || "unknown"} />
            {writeAvailable ? <span className="badge badge-success">SharePoint write זמין</span> : <MetadataOnlyBadge mode="notConnected" />}
          </div>
          <button className="btn btn-secondary" onClick={load} type="button"><RefreshCcw size={15} />רענן</button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto border-b divider pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`btn ${activeTab === tab.key ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setActiveTab(tab.key)}
            type="button"
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" ? (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard title="גרסה" value={site.currentVersion || site.version || "-"} icon={<GitBranch size={18} />} description={`יעד: ${site.targetVersion || site.latestKnownVersion || "-"}`} tone={site.versionStatus === "outdated" ? "warning" : "info"} />
            <KpiCard title="נפח" value={formatMb(site.storageMb)} icon={<DatabaseBackup size={18} />} description={`${formatNumber(site.filesCount || 0)} קבצים רשומים`} tone="neutral" />
            <KpiCard title="מנהלים" value={formatNumber(site.adminsCount || 0)} icon={<Users size={18} />} description={`סנכרון: ${site.adminSyncStatus || "לא ידוע"}`} tone="info" />
            <KpiCard title="גיבויים" value={formatNumber(site.backupCount || 0)} icon={<DatabaseBackup size={18} />} description={`אחרון: ${formatDateTime(site.lastBackupAt)}`} tone="neutral" />
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <SectionCard title="בעלות ותפעול" subtitle="פרטי אחריות ומעקב">
              <div className="grid gap-3 md:grid-cols-2">
                {[
                  ["בעל האתר", site.ownerName || "-"],
                  ["מספר אישי", site.ownerPersonalNumber || "-"],
                  ["מייל", site.ownerEmail || "-"],
                  ["טלפון", site.ownerPhone || "-"],
                  ["יחידה", site.unitName || "-"],
                  ["עודכן", formatDateTime(site.updatedAt)]
                ].map(([label, value]) => (
                  <div key={label} className="soft-panel p-3">
                    <p className="text-xs font-bold muted">{label}</p>
                    <p className="mt-1 break-words text-sm" style={{ color: "var(--text-strong)" }}>{value}</p>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Operations / Bootstrap" subtitle="תכנון read-only והרצת Bootstrap לאתר SharePoint">
              <div className="mb-4 flex flex-wrap gap-2">
                <button className="btn btn-primary" disabled={busyAction === "bootstrap-plan"} onClick={() => runAction("bootstrap-plan", async () => {
                  const result = await sitesApi.siteBootstrapPlan(site._id);
                  setBootstrapPlan(result.data);
                  setMessage("תוכנית Bootstrap נבנתה");
                })} type="button"><ClipboardList size={15} />בנה תוכנית</button>
                <button className="btn btn-secondary" disabled={!writeAvailable || busyAction === "site-bootstrap"} onClick={() => runAction("site-bootstrap", async () => {
                  const result = await sitesApi.queueSiteBootstrap(site._id, {
                    runProvisioning: true,
                    runPermissionsSetup: true,
                    reason: "Bootstrap queued from site details"
                  });
                  setBootstrapPlan(result.data.plan);
                  setMessage(result.data.message || `נוצר Job ל־Bootstrap: ${result.data.job._id}`);
                  await load();
                })} type="button"><Rocket size={15} />הרץ Bootstrap</button>
                {!writeAvailable ? <MetadataOnlyBadge mode="notConnected" /> : null}
              </div>

              {bootstrapPlan ? (
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    <KpiCard title="צעדים" value={formatNumber(bootstrapStepsCount)} icon={<ListChecks size={18} />} tone="info" />
                    <KpiCard title="חסמים" value={formatNumber(bootstrapBlockersCount)} icon={<ShieldCheck size={18} />} tone={bootstrapReady ? "success" : "warning"} />
                    <KpiCard title="כתיבה" value={writeAvailable ? "זמין" : "לא זמין"} icon={<Workflow size={18} />} tone={writeAvailable ? "success" : "warning"} />
                  </div>
                  <LinkRow label="Target URL" value={bootstrapTargetUrl} isUrl />
                  {bootstrapBlockers.length ? (
                    <div className="rounded-lg border p-3 text-sm" style={{ background: "var(--warning-soft)", color: "var(--warning)", borderColor: "var(--border)" }}>
                      <p className="mb-2 font-bold">חסמים לפני Bootstrap</p>
                      <ul className="list-inside list-disc space-y-1">
                        {bootstrapBlockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
                      </ul>
                    </div>
                  ) : null}
                  {bootstrapPlan.steps?.length ? (
                    <div className="space-y-2">
                      {bootstrapPlan.steps.slice(0, 5).map((step) => (
                        <div key={step.key} className="soft-panel flex items-center justify-between gap-3 p-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold">{step.label || step.key}</p>
                            {step.target ? <code className="num block max-w-full truncate text-xs muted" title={step.target}>{step.target}</code> : null}
                          </div>
                          <span className="badge badge-neutral shrink-0">{step.status || step.phase || "planned"}</span>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-sm muted">עדיין לא נבנתה רשימת צעדים.</p>}
                </div>
              ) : (
                <EmptyState title="אין תוכנית Bootstrap עדיין" description="בנה תוכנית כדי לראות יעד, חסמים ורשימת צעדים לפני הרצה." />
              )}
            </SectionCard>

            <SectionCard title="פעולות מומלצות" subtitle="נגזר ממצב הרשומה וה־operations summary">
              {summary?.recommendedActions.length ? (
                <div className="space-y-2">
                  {summary.recommendedActions.map((action) => (
                    <div key={action} className="soft-panel flex items-center justify-between gap-3 p-3">
                      <span className="text-sm">{action}</span>
                      <MetadataOnlyBadge mode={action.includes("readonly") || action.includes("backup-plan") ? "readonly" : "metadata"} />
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="אין המלצות פתוחות" description="לא נמצאו פעולות דחופות לפי הנתונים הקיימים." />
              )}
            </SectionCard>
          </div>
        </div>
      ) : null}

      {activeTab === "paths" ? (
        <SectionCard title="נתיבי SharePoint" subtitle="נתיבים נגזרים לפי ארכיטקטורת Site Builder האמיתית">
          <div className="mb-4 flex flex-wrap gap-2">
            <MetadataOnlyBadge mode="readonly" />
            <span className="badge badge-info">HashRouter תחת index.html</span>
          </div>
          <div className="rounded-lg border divider px-4" style={{ borderColor: "var(--border)" }}>
            {pathRows.map((row) => <LinkRow key={row.label} {...row} />)}
          </div>
        </SectionCard>
      ) : null}

      {activeTab === "health" ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <SectionCard title="תקינות נוכחית" subtitle="מצב אחרון שנשמר ב־Hub">
            <HealthChecklist health={site.health} />
          </SectionCard>
          <SectionCard title="בדיקות" subtitle="בדיקה ידנית או קריאה בלבד מול SharePoint">
            <div className="mb-4 flex flex-wrap gap-2">
              <MetadataOnlyBadge mode="metadata" />
              <MetadataOnlyBadge mode="readonly" />
            </div>
            <HealthChecklist health={healthDraft} editable onChange={setHealthDraft} />
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="btn btn-secondary" disabled={busyAction === "manual-health"} onClick={() => runAction("manual-health", async () => {
                await sitesApi.updateManualHealth(site._id, healthDraft);
                setMessage("בדיקת התקינות הידנית נשמרה ב־Hub");
                await load();
              })} type="button">שמור ידנית</button>
              <button className="btn btn-primary" disabled={busyAction === "sp-health"} onClick={() => runAction("sp-health", async () => {
                const result = await sitesApi.runSharePointReadOnlyHealth(site._id);
                setSharePointHealth(result.data);
                setMessage("בדיקת SharePoint read-only הסתיימה");
                await load();
              })} type="button">הרץ SharePoint read-only</button>
            </div>
            {sharePointHealth ? (
              <div className="mt-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="num text-xs muted">נבדק: {formatDateTime(sharePointHealth.checkedAt)}</span>
                  <HealthBadge status={sharePointHealth.derivedHealthStatus as any} />
                </div>
                {sharePointHealth.note ? <div className="mb-3 rounded-lg border p-3 text-sm" style={{ background: "var(--warning-soft)", color: "var(--warning)", borderColor: "var(--border)" }}>{sharePointHealth.note}</div> : null}
                <DataTable columns={["בדיקה", "תוצאה", "URL"]} minWidth={760}>
                  {sharePointHealth.evidence.map((item) => (
                    <tr key={`${item.label}-${item.url}`}>
                      <td>{item.label}</td>
                      <td><span className={`badge ${item.ok ? "badge-success" : item.authBlocked ? "badge-warning" : "badge-danger"}`}>{item.ok ? "OK" : item.authBlocked ? "AUTH" : "FAIL"} {item.status || ""}</span></td>
                      <td><code className="num block max-w-[420px] truncate text-xs muted" title={item.url}>{item.url}</code></td>
                    </tr>
                  ))}
                </DataTable>
              </div>
            ) : null}
          </SectionCard>
        </div>
      ) : null}

      {activeTab === "versions" ? (
        <SectionCard title="גרסאות ופריסות" subtitle="פריסות אמיתיות דורשות SharePoint write capability ושומרות evidence קריאה חזרה לכל קובץ.">
          <div className="mb-4 flex flex-wrap gap-2">
            <VersionBadge status={site.versionStatus || "unknown"} />
            {writeAvailable ? <span className="badge badge-success">deploy מחובר ל־SharePoint</span> : <MetadataOnlyBadge mode="notConnected" />}
          </div>
          <DataTable columns={["סוג", "מגרסה", "לגרסה", "סטטוס", "התחיל", "הסתיים", "Job", "אימות", "שגיאה", "פעולות"]} minWidth={1360}>
            {deployments.length === 0 ? (
              <tr><td colSpan={10}><EmptyState title="אין פריסות רשומות" description="היסטוריית פריסה תופיע לאחר יצירת deployment job." /></td></tr>
            ) : deployments.map((deployment) => {
              const evidenceCount = deployment.verification?.evidence?.length || 0;
              const failedEvidenceCount = deployment.verification?.failedFilesCount
                ?? deployment.verification?.evidence?.filter((item) => item.status === "failed").length
                ?? 0;
              return (
                <tr key={deployment._id}>
                  <td><span className={`badge ${deploymentKindBadgeClass(deployment.deploymentKind)}`}>{deploymentKindLabel(deployment.deploymentKind)}</span></td>
                  <td className="num">{deployment.fromVersion || "-"}</td>
                  <td className="num">{deployment.toVersion}</td>
                  <td><span className={`badge ${deploymentStatusBadgeClass(deployment.status)}`}>{deploymentStatusLabel(deployment.status)}</span></td>
                  <td className="num text-xs">{formatDateTime(deployment.startedAt)}</td>
                  <td className="num text-xs">{formatDateTime(deployment.finishedAt)}</td>
                  <td>
                    {deployment.jobId ? (
                      <code className="num block max-w-[150px] truncate text-xs muted" title={deployment.jobId}>job {compactValue(deployment.jobId)}</code>
                    ) : <span className="muted">-</span>}
                  </td>
                  <td>
                    <div className="space-y-1">
                      <span className={`badge ${verificationBadgeClass(deployment.verification?.status)}`}>{verificationStatusLabel(deployment.verification?.status)}</span>
                      <span className={`badge ${failedEvidenceCount ? "badge-danger" : evidenceCount ? "badge-success" : "badge-neutral"}`}>
                        {evidenceCount ? `${formatNumber(evidenceCount)} files` : "no evidence"}
                      </span>
                    </div>
                  </td>
                  <td>
                    {deployment.error ? (
                      <code className="num block max-w-[180px] truncate text-xs" style={{ color: "var(--danger)" }} title={deployment.error}>{deployment.error}</code>
                    ) : <span className="muted">-</span>}
                  </td>
                  <td>
                    <button
                      className={`btn ${selectedDeployment?._id === deployment._id ? "btn-primary" : "btn-secondary"} min-h-0 px-2 py-1 text-xs`}
                      onClick={() => setSelectedDeploymentId(deployment._id)}
                      type="button"
                    >
                      <Eye size={13} />Evidence
                    </button>
                  </td>
                </tr>
              );
            })}
          </DataTable>

          {selectedDeployment ? (
            <div className="mt-5 space-y-4">
              <div className="soft-panel p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold muted">Deployment evidence</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className={`badge ${deploymentKindBadgeClass(selectedDeployment.deploymentKind)}`}>{deploymentKindLabel(selectedDeployment.deploymentKind)}</span>
                      <span className={`badge ${deploymentStatusBadgeClass(selectedDeployment.status)}`}>{deploymentStatusLabel(selectedDeployment.status)}</span>
                      <span className={`badge ${verificationBadgeClass(selectedDeployment.verification?.status)}`}>{verificationStatusLabel(selectedDeployment.verification?.status)}</span>
                    </div>
                  </div>
                  <div className="num text-xs muted">{formatDateTime(selectedDeployment.verification?.checkedAt || selectedDeployment.finishedAt || selectedDeployment.createdAt)}</div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <span className="field-label">גרסאות</span>
                    <p className="num text-sm">{selectedDeployment.fromVersion || "-"} -&gt; {selectedDeployment.toVersion || "-"}</p>
                  </div>
                  <div>
                    <span className="field-label">Job ID</span>
                    {selectedDeployment.jobId ? (
                      <code className="num block max-w-[240px] truncate text-sm" title={selectedDeployment.jobId}>{selectedDeployment.jobId}</code>
                    ) : <p className="muted">-</p>}
                  </div>
                  <div>
                    <span className="field-label">קבצי אימות</span>
                    <div className="flex flex-wrap gap-2">
                      <span className="badge badge-neutral">{formatNumber(selectedDeploymentFilesCount)} files</span>
                      <span className="badge badge-success">{formatNumber(selectedDeploymentVerifiedCount)} אומתו</span>
                      <span className={`badge ${selectedDeploymentFailedCount ? "badge-danger" : "badge-neutral"}`}>{formatNumber(selectedDeploymentFailedCount)} נכשלו</span>
                    </div>
                  </div>
                  <div>
                    <span className="field-label">Target paths</span>
                    <p className="num text-sm">{formatNumber(selectedDeploymentTargetPaths.length)}</p>
                  </div>
                </div>

                {selectedDeployment.rollbackReason ? (
                  <div className="mt-4 rounded-lg border p-3 text-sm" style={{ background: "var(--warning-soft)", borderColor: "color-mix(in srgb, var(--warning) 35%, var(--border))", color: "var(--warning)" }}>
                    <span className="font-bold">סיבת Rollback: </span>
                    {selectedDeployment.rollbackReason}
                  </div>
                ) : null}
                {selectedDeployment.error ? (
                  <div className="mt-4 rounded-lg border p-3 text-sm" style={{ background: "var(--danger-soft)", borderColor: "color-mix(in srgb, var(--danger) 38%, var(--border))", color: "var(--danger)" }}>
                    <span className="font-bold">שגיאת deployment: </span>
                    <code className="num">{selectedDeployment.error}</code>
                  </div>
                ) : null}
              </div>

              {selectedFinalAppUrlVerification || selectedPostHealth ? (
                <div className="grid gap-4 xl:grid-cols-2">
                  {selectedFinalAppUrlVerification ? (
                    <div className="soft-panel p-4">
                      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-bold muted">Final app URL verification</p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className={`badge ${healthEvidenceBadgeClass(selectedFinalAppUrlVerification.ok, selectedFinalAppUrlVerification.authBlocked)}`}>
                              {healthEvidenceLabel(selectedFinalAppUrlVerification.ok, selectedFinalAppUrlVerification.authBlocked)}
                            </span>
                            {hasNumber(selectedFinalAppUrlStatus) ? <span className="badge badge-neutral">HTTP {selectedFinalAppUrlStatus}</span> : null}
                          </div>
                        </div>
                        <span className="num text-xs muted">{formatDateTime(selectedFinalAppUrlVerification.checkedAt)}</span>
                      </div>
                      {selectedFinalAppUrl ? (
                        <a className="num block max-w-full truncate text-xs" href={selectedFinalAppUrl} target="_blank" rel="noreferrer" title={selectedFinalAppUrl}>
                          {selectedFinalAppUrl}
                        </a>
                      ) : <p className="muted">-</p>}
                      {selectedFinalAppUrlStatusText ? <p className="mt-2 text-xs muted">{selectedFinalAppUrlStatusText}</p> : null}
                      {selectedFinalAppUrlVerification.error ? (
                        <code className="num mt-3 block max-w-full truncate text-xs" style={{ color: "var(--danger)" }} title={selectedFinalAppUrlVerification.error}>
                          {selectedFinalAppUrlVerification.error}
                        </code>
                      ) : null}
                    </div>
                  ) : null}

                  {selectedPostHealth ? (
                    <div className="soft-panel p-4">
                      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-bold muted">Post-deploy health</p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {selectedPostHealth.derivedHealthStatus ? <HealthBadge status={selectedPostHealth.derivedHealthStatus as any} /> : null}
                            {selectedPostHealth.status ? <span className={`badge ${verificationBadgeClass(selectedPostHealth.status)}`}>{verificationStatusLabel(selectedPostHealth.status)}</span> : null}
                            <span className="badge badge-neutral">{formatNumber(selectedPostHealthEvidence.length)} checks</span>
                          </div>
                        </div>
                        <span className="num text-xs muted">{formatDateTime(selectedPostHealth.checkedAt)}</span>
                      </div>
                      {selectedPostHealth.note ? (
                        <div className="mb-3 rounded-lg border p-3 text-sm" style={{ background: "var(--warning-soft)", color: "var(--warning)", borderColor: "var(--border)" }}>
                          {selectedPostHealth.note}
                        </div>
                      ) : null}
                      {selectedPostHealth.error ? (
                        <code className="num mb-3 block max-w-full truncate text-xs" style={{ color: "var(--danger)" }} title={selectedPostHealth.error}>
                          {selectedPostHealth.error}
                        </code>
                      ) : null}
                      {selectedPostHealthEvidence.length ? (
                        <div className="space-y-2">
                          {selectedPostHealthEvidence.map((item) => (
                            <div key={`${item.key || item.label}-${item.url}`} className="flex items-center justify-between gap-3 border-b divider pb-2 last:border-b-0">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-bold">{item.label || item.key || "health check"}</p>
                                <code className="num block max-w-full truncate text-xs muted" title={item.url}>{item.url}</code>
                              </div>
                              <span className={`badge shrink-0 ${healthEvidenceBadgeClass(item.ok, item.authBlocked)}`}>
                                {healthEvidenceLabel(item.ok, item.authBlocked)} {item.status || ""}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : <p className="text-sm muted">אין שורות health evidence להצגה.</p>}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <DataTable columns={["סטטוס", "קובץ", "Target path", "Size", "SHA", "HTTP", "שגיאה"]} minWidth={1320}>
                {selectedDeploymentEvidence.length === 0 ? (
                  <tr><td colSpan={7}><EmptyState title="אין evidence להצגה" description="לא נשמרו שורות read-back עבור deployment זה." /></td></tr>
                ) : selectedDeploymentEvidence.map((item, index) => (
                  <tr key={evidenceKey(item, index)}>
                    <td>
                      <div className="space-y-1">
                        <span className={`badge ${item.status === "verified" ? "badge-success" : "badge-danger"}`}>{item.status}</span>
                        {item.checkedAt ? <div className="num text-xs muted">{formatDateTime(item.checkedAt)}</div> : null}
                      </div>
                    </td>
                    <td>
                      <div className="space-y-2">
                        <p className="font-bold">{item.relativePath || "-"}</p>
                        <code className="num block max-w-[260px] truncate text-xs muted" title={item.sourcePath}>{item.sourcePath || "-"}</code>
                      </div>
                    </td>
                    <td>
                      <div className="space-y-2">
                        <code className="num block max-w-[320px] truncate text-xs muted" title={item.targetPath}>{item.targetPath || "-"}</code>
                        {item.contentType ? <span className="badge badge-neutral">{item.contentType}</span> : null}
                        {item.lastModified ? <div className="num text-xs muted">{item.lastModified}</div> : null}
                      </div>
                    </td>
                    <td>
                      <div className="space-y-2">
                        <span className={`badge ${matchBadgeClass(item.sizeMatches)}`}>size {matchLabel(item.sizeMatches)}</span>
                        <div className="num text-xs muted">expected {formatOptionalBytes(item.expectedSizeBytes)}</div>
                        <div className="num text-xs muted">actual {formatOptionalBytes(item.actualSizeBytes)}</div>
                      </div>
                    </td>
                    <td>
                      <div className="space-y-2">
                        <span className={`badge ${matchBadgeClass(item.sha256Matches)}`}>sha {matchLabel(item.sha256Matches)}</span>
                        {item.expectedSha256 ? <code className="num block max-w-[220px] truncate text-xs muted" title={item.expectedSha256}>expected {compactValue(item.expectedSha256, 12, 8)}</code> : null}
                        {item.actualSha256 ? <code className="num block max-w-[220px] truncate text-xs muted" title={item.actualSha256}>actual {compactValue(item.actualSha256, 12, 8)}</code> : null}
                      </div>
                    </td>
                    <td>
                      <div className="space-y-1">
                        {item.httpStatus ? <span className="badge badge-neutral">HTTP {item.httpStatus}</span> : <span className="muted">-</span>}
                        {item.httpStatusText ? <div className="text-xs muted">{item.httpStatusText}</div> : null}
                        {item.etag ? <code className="num block max-w-[160px] truncate text-xs muted" title={item.etag}>etag {compactValue(item.etag, 10, 6)}</code> : null}
                      </div>
                    </td>
                    <td>
                      {item.error ? <code className="num block max-w-[260px] truncate text-xs" style={{ color: "var(--danger)" }} title={item.error}>{item.error}</code> : <span className="muted">-</span>}
                    </td>
                  </tr>
                ))}
              </DataTable>
            </div>
          ) : null}
        </SectionCard>
      ) : null}

      {activeTab === "backups" ? (
        <SectionCard title="גיבויים" subtitle="תכנון גיבוי הוא read-only; ביצוע גיבוי דורש כתיבה מוגדרת">
          <div className="mb-4 flex flex-wrap gap-2">
            <button className="btn btn-primary" disabled={busyAction === "backup-plan"} onClick={() => runAction("backup-plan", async () => {
              const result = await sitesApi.siteBackupPlan(site._id);
              setBackupPlan(result.data);
              setMessage("תוכנית גיבוי read-only נוצרה");
            })} type="button">צור תוכנית גיבוי</button>
            <button className="btn btn-secondary" disabled={!writeAvailable || busyAction === "run-backup"} onClick={() => runAction("run-backup", async () => {
              const result = await sitesApi.runSiteBackup(site._id);
              setMessage(`נוצר Job לגיבוי: ${result.data.job._id}`);
              await load();
            })} type="button">הרץ גיבוי אמיתי</button>
            {!writeAvailable ? <MetadataOnlyBadge mode="notConnected" /> : null}
          </div>
          {backupPlan ? (
            <div className="mb-5 space-y-3">
              <div className="grid gap-3 md:grid-cols-4">
                <KpiCard title="מקורות קיימים" value={`${backupPlan.summary.existingSources}/${backupPlan.summary.totalSources}`} icon={<ListChecks size={18} />} tone={backupPlan.summary.readyForBackup ? "success" : "warning"} />
                <KpiCard title="חסרים" value={backupPlan.summary.missingSources} icon={<ListChecks size={18} />} tone={backupPlan.summary.missingSources ? "warning" : "success"} />
                <KpiCard title="Auth blocked" value={backupPlan.summary.authBlockedSources} icon={<ListChecks size={18} />} tone={backupPlan.summary.authBlockedSources ? "warning" : "success"} />
                <KpiCard title="גודל ידוע" value={formatBytes(backupPlan.summary.knownSizeBytes)} icon={<DatabaseBackup size={18} />} tone="neutral" />
              </div>
              <LinkRow label="יעד גיבוי" value={backupPlan.target.backupFolder} />
            </div>
          ) : null}
          <DataTable columns={["Backup ID", "סטטוס", "קבצים", "גודל", "נוצר", "אימות"]} minWidth={860}>
            {backups.length === 0 ? (
              <tr><td colSpan={6}><EmptyState title="אין גיבויים רשומים" description="גיבויים יופיעו לאחר הרצת backup job." /></td></tr>
            ) : backups.map((backup: any) => (
              <tr key={backup._id}>
                <td className="num">{backup.backupId}</td>
                <td><span className="badge badge-neutral">{backup.status}</span></td>
                <td className="num">{formatNumber(backup.filesCount)}</td>
                <td className="num">{formatBytes(backup.sizeBytes)}</td>
                <td className="num text-xs">{formatDateTime(backup.createdAt)}</td>
                <td><span className={`badge ${backup.verification?.status === "verified" ? "badge-success" : backup.verification?.status === "failed" ? "badge-danger" : "badge-neutral"}`}>{backup.verification?.status || "unverified"}{backup.verification?.evidence?.length ? ` · ${backup.verification.evidence.length}` : ""}</span></td>
              </tr>
            ))}
          </DataTable>
        </SectionCard>
      ) : null}

      {activeTab === "admins" ? (
        <SectionCard title="מנהלים" subtitle="מקורות: TXT, Site Collection Admins ו־Owners Group">
          <div className="mb-4 flex flex-wrap gap-2">
            <MetadataOnlyBadge mode="metadata" />
            <MetadataOnlyBadge mode="readonly" />
            <Link className="btn btn-secondary" to="/admins">פתח ניהול מנהלים מלא</Link>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              ["TXT admins", adminData?.txtAdmins || []],
              ["Site Collection Admins", adminData?.siteCollectionAdmins || []],
              ["Owners Group", adminData?.ownersGroupAdmins || []]
            ].map(([label, rows]: any) => (
              <div key={label} className="soft-panel p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="font-bold" style={{ color: "var(--text-strong)" }}>{label}</h3>
                  <span className="num badge badge-neutral">{rows.length}</span>
                </div>
                <div className="space-y-2">
                  {rows.length === 0 ? <p className="text-sm muted">אין רשומות</p> : rows.slice(0, 8).map((admin: any, index: number) => (
                    <div key={`${label}-${index}`} className="border-b divider pb-2 last:border-b-0">
                      <p className="text-sm font-bold">{admin.displayName || "-"}</p>
                      <p className="num text-xs muted">{admin.personalNumber || admin.email || admin.loginName || "-"}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}

      {activeTab === "jobs" ? (
        <SectionCard title="Jobs של האתר" subtitle="פעולות אחרונות ושגיאות">
          <DataTable columns={["סוג", "סטטוס", "התקדמות", "נוצר", "שגיאה"]} minWidth={860}>
            {jobs.length === 0 ? (
              <tr><td colSpan={5}><EmptyState title="אין Jobs" description="לא נמצאו פעולות אחרונות לאתר זה." /></td></tr>
            ) : jobs.map((job) => (
              <tr key={job._id}>
                <td>{jobTypeLabel(job.type)}</td>
                <td><span className={`badge ${job.status === "failed" ? "badge-danger" : job.status === "succeeded" ? "badge-success" : "badge-info"}`}>{jobStatusLabel(job.status)}</span></td>
                <td><div className="progress-track w-36"><div className="progress-fill" style={{ width: `${job.progressPercent || 0}%` }} /></div></td>
                <td className="num text-xs">{formatDateTime(job.createdAt)}</td>
                <td style={{ color: "var(--danger)" }}>{job.errorMessage || "-"}</td>
              </tr>
            ))}
          </DataTable>
        </SectionCard>
      ) : null}

      {activeTab === "audit" ? (
        <SectionCard title="Audit" subtitle="יומן פעולות עבור האתר">
          {auditRows.length === 0 ? <EmptyState title="אין רשומות Audit לאתר" description="יומן הפעולות המלא זמין בעמוד יומן פעולות." action={<Link className="btn btn-secondary" to="/audit">פתח יומן מלא</Link>} /> : (
            <DataTable columns={["פעולה", "תוצאה", "Actor", "תאריך", "Request ID"]} minWidth={880}>
              {auditRows.map((row) => (
                <tr key={row._id}>
                  <td>{row.action}</td>
                  <td><span className={`badge ${row.result === "failure" ? "badge-danger" : "badge-success"}`}>{row.result}</span></td>
                  <td>{row.actor?.userName || row.actor?.userId || "-"}</td>
                  <td className="num text-xs">{formatDateTime(row.createdAt)}</td>
                  <td className="num text-xs muted">{row.requestId || "-"}</td>
                </tr>
              ))}
            </DataTable>
          )}
        </SectionCard>
      ) : null}

      {activeTab === "notes" ? (
        <SectionCard title="הערות" subtitle="מידע תפעולי חופשי ושגיאות אחרונות">
          <div className="soft-panel p-4">
            <p className="whitespace-pre-wrap text-sm">{site.notes || "אין הערות כרגע."}</p>
          </div>
          {site.lastError ? <div className="mt-4 rounded-lg border p-3 text-sm" style={{ background: "var(--danger-soft)", color: "var(--danger)", borderColor: "var(--border)" }}>שגיאה אחרונה: {site.lastError}</div> : null}
        </SectionCard>
      ) : null}

      <ConfirmDialog
        open={confirmArchive}
        title="לארכב אתר?"
        description="הפעולה מסמנת את הרשומה כבארכיון ב־Hub בלבד. לא מתבצע שינוי ב־SharePoint."
        confirmLabel="ארכב ב־Hub"
        danger
        onClose={() => setConfirmArchive(false)}
        onConfirm={async () => {
          await sitesApi.archive(site._id);
          setConfirmArchive(false);
          navigate("/sites");
        }}
      />
    </div>
  );
}
