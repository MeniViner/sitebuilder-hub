import { useEffect, useMemo, useState } from "react";
import { ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Archive, ClipboardList, DatabaseBackup, Edit3, ExternalLink, Eye, FileClock, FolderInput, GitBranch, ListChecks, MessageSquareText, MoreHorizontal, RefreshCcw, Rocket, ShieldCheck, Users, Workflow } from "lucide-react";
import { Backup, BackupPlan, BuilderMongoHealthResult, DeploymentVerificationEvidence, Job, PermissionsSetupPlan, RuntimeConfigValidationResult, SharePointHealthEvidence, SharePointHealthResult, SiteBootstrapPlan, SiteDeployment, SiteOperationsSummary, SiteProvisionPlan, TxtToMongoMigrationResult, sitesApi } from "../api/sitesApi";
import { Site, SiteHealth } from "../types/site";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { AdminLiveReadMeta, AdminSourceLists, AdminSourceStatusTable, AdminSourceSummaryCards } from "../components/AdminSourceSummaryCards";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { DetailsDrawer } from "../components/DetailsDrawer";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { HealthBadge } from "../components/HealthBadge";
import { HealthChecklist } from "../components/HealthChecklist";
import { HelpLabel } from "../components/help/HelpLabel";
import { KpiCard } from "../components/KpiCard";
import { LinkRow } from "../components/LinkRow";
import { LoadingState } from "../components/LoadingState";
import { MetadataOnlyBadge } from "../components/MetadataOnlyBadge";
import { AdvancedDetails, GuidedFlow, ModeBoundary, OperationalSummary } from "../components/OperationalSummary";
import { PageHeader } from "../components/PageHeader";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { VersionBadge } from "../components/VersionBadge";
import type { HelpContentKey } from "../help/helpContent";
import { formatBytes, formatDateTime, formatMb, formatNumber, jobStatusLabel, jobTypeLabel } from "../utils/format";
import { runBrowserSharePointBackupOperation } from "../utils/sharepointBrowserOperationRunner";
import {
  buildBrowserSharePointBackupPlan,
  deployArtifactToSharePointBrowser,
  ensureSharePointFolderHierarchyBrowser
} from "../utils/sharepointBrowserConnector";
import {
  deriveRequiredFoldersFromArtifactFilePaths,
  latestCompatibleRelease,
  manifestFilesForPlan
} from "../utils/artifactCompatibility";
import { buildDeploymentMetadataFile, DEPLOYMENT_METADATA_FILE } from "../utils/deploymentMetadata";
import { resolveSiteBuilderPaths } from "../utils/sitebuilderPaths";
import {
  runBrowserAdminTxtRepairOperation,
  readBrowserTxtSnapshotForMongoMigration,
  runBrowserMongoRuntimeConfigUpload,
  runBrowserSharePointBootstrapOperation,
  runBrowserSharePointPermissionsOperation,
  runBrowserSharePointProvisionOperation
} from "../utils/sharepointBrowserSiteOperations";
import { useBrowserAdminsLiveRead } from "../hooks/useBrowserAdminsLiveRead";

type TabKey = "overview" | "paths" | "health" | "versions" | "backups" | "admins" | "jobs" | "audit" | "notes";

type SiteDetailsDrawerState =
  | { type: "deployment"; deployment: SiteDeployment }
  | { type: "backup"; backup: Backup }
  | { type: "job"; job: Job }
  | { type: "audit"; row: any }
  | null;

const tabs: Array<{ key: TabKey; label: string; icon: ReactNode }> = [
  { key: "overview", label: "סקירה", icon: <ClipboardList size={15} /> },
  { key: "paths", label: "נתיבי SharePoint", icon: <FolderInput size={15} /> },
  { key: "health", label: "תקינות", icon: <ShieldCheck size={15} /> },
  { key: "versions", label: "גרסאות", icon: <GitBranch size={15} /> },
  { key: "backups", label: "גיבויים", icon: <DatabaseBackup size={15} /> },
  { key: "admins", label: "מנהלים", icon: <Users size={15} /> },
  { key: "jobs", label: "פעולות", icon: <Workflow size={15} /> },
  { key: "audit", label: "יומן", icon: <FileClock size={15} /> },
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

const formatJson = (value: unknown) => {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value ?? "");
  }
};

const evidenceKey = (item: DeploymentVerificationEvidence, index: number) =>
  `${item.relativePath || item.targetPath || item.sourcePath || "evidence"}-${index}`;

const MobileMeta = ({ label, helpKey, children }: { label: string; helpKey?: HelpContentKey; children: ReactNode }) => (
  <div>
    <span className="field-label"><HelpLabel helpKey={helpKey}>{label}</HelpLabel></span>
    <div className="mt-1 text-sm">{children}</div>
  </div>
);

const JsonBlock = ({ value }: { value: unknown }) => (
  <AdvancedDetails title="Advanced JSON" description="Raw payload מלא לתחקור טכני">
    <pre className="num max-h-[420px] overflow-auto rounded-lg border p-3 text-xs" style={{ borderColor: "var(--border)", background: "var(--surface-muted)", color: "var(--text-strong)" }}>
      {formatJson(value)}
    </pre>
  </AdvancedDetails>
);

const deploymentEvidenceColumns: DataTableColumn<DeploymentVerificationEvidence>[] = [
  {
    key: "status",
    header: "סטטוס",
    helpKey: "deploy.evidence",
    render: (item) => (
      <div className="space-y-1">
        <span className={`badge ${item.status === "verified" ? "badge-success" : "badge-danger"}`}>{item.status}</span>
        {item.checkedAt ? <div className="num text-xs muted">{formatDateTime(item.checkedAt)}</div> : null}
      </div>
    )
  },
  {
    key: "file",
    header: "קובץ",
    helpKey: "artifact",
    render: (item) => (
      <div className="space-y-2">
        <p className="font-bold">{item.relativePath || "-"}</p>
        <code className="num block max-w-[260px] truncate text-xs muted" title={item.sourcePath}>{item.sourcePath || "-"}</code>
      </div>
    )
  },
    {
      key: "target",
      header: "נתיב יעד",
    helpKey: "deploy.targetMode",
    render: (item) => (
      <div className="space-y-2">
        <code className="num block max-w-[320px] truncate text-xs muted" title={item.targetPath}>{item.targetPath || "-"}</code>
        {item.contentType ? <span className="badge badge-neutral">{item.contentType}</span> : null}
        {item.lastModified ? <div className="num text-xs muted">{item.lastModified}</div> : null}
      </div>
    )
  },
  {
    key: "size",
    header: "Size",
    helpKey: "artifact.validation",
    render: (item) => (
      <div className="space-y-2">
        <span className={`badge ${matchBadgeClass(item.sizeMatches)}`}>size {matchLabel(item.sizeMatches)}</span>
        <div className="num text-xs muted">expected {formatOptionalBytes(item.expectedSizeBytes)}</div>
        <div className="num text-xs muted">actual {formatOptionalBytes(item.actualSizeBytes)}</div>
      </div>
    )
  },
  {
    key: "sha",
    header: "SHA",
    helpKey: "artifact.validation",
    render: (item) => (
      <div className="space-y-2">
        <span className={`badge ${matchBadgeClass(item.sha256Matches)}`}>sha {matchLabel(item.sha256Matches)}</span>
        {item.expectedSha256 ? <code className="num block max-w-[220px] truncate text-xs muted" title={item.expectedSha256}>expected {compactValue(item.expectedSha256, 12, 8)}</code> : null}
        {item.actualSha256 ? <code className="num block max-w-[220px] truncate text-xs muted" title={item.actualSha256}>actual {compactValue(item.actualSha256, 12, 8)}</code> : null}
      </div>
    )
  },
  {
    key: "http",
    header: "HTTP",
    helpKey: "sharepoint.read",
    render: (item) => (
      <div className="space-y-1">
        {item.httpStatus ? <span className="badge badge-neutral">HTTP {item.httpStatus}</span> : <span className="muted">-</span>}
        {item.httpStatusText ? <div className="text-xs muted">{item.httpStatusText}</div> : null}
        {item.etag ? <code className="num block max-w-[160px] truncate text-xs muted" title={item.etag}>etag {compactValue(item.etag, 10, 6)}</code> : null}
      </div>
    )
  },
  {
    key: "error",
    header: "שגיאה",
    helpKey: "diagnostics",
    render: (item) => item.error
      ? <code className="num block max-w-[260px] truncate text-xs" style={{ color: "var(--danger)" }} title={item.error}>{item.error}</code>
      : <span className="muted">-</span>
  }
];

const healthEvidenceColumns: DataTableColumn<SharePointHealthEvidence>[] = [
  {
    key: "check",
    header: "בדיקה",
    helpKey: "health.readOnly",
    render: (item) => (
      <div className="min-w-0">
        <p className="font-bold">{item.label || item.key || "health check"}</p>
        {item.key ? <p className="num text-xs muted">{item.key}</p> : null}
      </div>
    )
  },
  {
    key: "result",
    header: "תוצאה",
    helpKey: "health",
    render: (item) => (
      <div className="space-y-1">
        <span className={`badge ${healthEvidenceBadgeClass(item.ok, item.authBlocked)}`}>
          {healthEvidenceLabel(item.ok, item.authBlocked)} {item.status || ""}
        </span>
        {item.statusText ? <p className="text-xs muted">{item.statusText}</p> : null}
      </div>
    )
  },
  {
    key: "url",
    header: "URL",
    helpKey: "sharepoint.read",
    render: (item) => <code className="num block max-w-[480px] truncate text-xs muted" title={item.url}>{item.url}</code>
  },
  {
    key: "error",
    header: "שגיאה",
    helpKey: "diagnostics",
    render: (item) => item.error
      ? <code className="num block max-w-[260px] truncate text-xs" style={{ color: "var(--danger)" }} title={item.error}>{item.error}</code>
      : <span className="muted">-</span>
  }
];

function DeploymentEvidenceTable({ evidence }: { evidence: DeploymentVerificationEvidence[] }) {
  if (!evidence.length) {
    return <EmptyState title="אין evidence להצגה" description="לא נשמרו שורות read-back עבור deployment זה." />;
  }

  return (
    <DataTable
      columns={deploymentEvidenceColumns}
      rows={evidence}
      rowKey={evidenceKey}
      minWidth={1320}
      mobileCard={(item) => (
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{item.relativePath || item.sourcePath || "קובץ"}</p>
              <code className="num block max-w-full truncate text-xs muted" title={item.targetPath}>{item.targetPath || "-"}</code>
            </div>
            <span className={`badge shrink-0 ${item.status === "verified" ? "badge-success" : "badge-danger"}`}>{item.status}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <MobileMeta label="Size"><span className={`badge ${matchBadgeClass(item.sizeMatches)}`}>{matchLabel(item.sizeMatches)}</span></MobileMeta>
            <MobileMeta label="SHA"><span className={`badge ${matchBadgeClass(item.sha256Matches)}`}>{matchLabel(item.sha256Matches)}</span></MobileMeta>
            <MobileMeta label="HTTP">{item.httpStatus ? `HTTP ${item.httpStatus}` : "-"}</MobileMeta>
            <MobileMeta label="נבדק">{formatDateTime(item.checkedAt)}</MobileMeta>
          </div>
          {item.error ? <code className="num block max-w-full truncate text-xs" style={{ color: "var(--danger)" }} title={item.error}>{item.error}</code> : null}
        </div>
      )}
    />
  );
}

function HealthEvidenceTable({ evidence }: { evidence: SharePointHealthEvidence[] }) {
  if (!evidence.length) {
    return <EmptyState title="אין Evidence להצגה" description="לא נשמרו תוצאות מפורטות לבדיקה הזו." />;
  }

  return (
    <DataTable
      columns={healthEvidenceColumns}
      rows={evidence}
      rowKey={(item, index) => `${item.key || item.label || "health"}-${item.url || index}`}
      minWidth={840}
      mobileCard={(item) => (
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{item.label || item.key || "health check"}</p>
              <code className="num block max-w-full truncate text-xs muted" title={item.url}>{item.url}</code>
            </div>
            <span className={`badge shrink-0 ${healthEvidenceBadgeClass(item.ok, item.authBlocked)}`}>
              {healthEvidenceLabel(item.ok, item.authBlocked)}
            </span>
          </div>
          {item.status || item.statusText ? <p className="text-xs muted">{item.status ? `HTTP ${item.status}` : ""} {item.statusText || ""}</p> : null}
          {item.error ? <code className="num block max-w-full truncate text-xs" style={{ color: "var(--danger)" }} title={item.error}>{item.error}</code> : null}
        </div>
      )}
    />
  );
}

export function SiteDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [site, setSite] = useState<Site | null>(null);
  const [summary, setSummary] = useState<SiteOperationsSummary | null>(null);
  const [adminData, setAdminData] = useState<any>(null);
  const [auditRows, setAuditRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [healthDraft, setHealthDraft] = useState<SiteHealth>({});
  const [sharePointHealth, setSharePointHealth] = useState<SharePointHealthResult | null>(null);
  const [runtimeConfigResult, setRuntimeConfigResult] = useState<RuntimeConfigValidationResult | null>(null);
  const [mongoHealthResult, setMongoHealthResult] = useState<BuilderMongoHealthResult | null>(null);
  const [migrationResult, setMigrationResult] = useState<TxtToMongoMigrationResult | null>(null);
  const [backupPlan, setBackupPlan] = useState<BackupPlan | null>(null);
  const [bootstrapPlan, setBootstrapPlan] = useState<SiteBootstrapPlan | null>(null);
  const [provisionPlan, setProvisionPlan] = useState<SiteProvisionPlan | null>(null);
  const [permissionsPlan, setPermissionsPlan] = useState<PermissionsSetupPlan | null>(null);
  const [busyAction, setBusyAction] = useState("");
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [detailsDrawer, setDetailsDrawer] = useState<SiteDetailsDrawerState>(null);

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
  const requestedTab = searchParams.get("tab") as TabKey | null;
  const activeTab: TabKey = requestedTab && tabs.some((tab) => tab.key === requestedTab) ? requestedTab : "overview";
  const setActiveTab = (tab: TabKey) => {
    const next = new URLSearchParams(searchParams);
    if (tab === "overview") next.delete("tab");
    else next.set("tab", tab);
    setSearchParams(next, { replace: true });
  };
  const {
    liveData: adminLiveData,
    busy: adminsLiveReadBusy,
    runLiveRead: runAdminsLiveRead
  } = useBrowserAdminsLiveRead({
    site,
    adminData,
    auto: activeTab === "admins",
    onPersisted: (adminSummary) => {
      setAdminData(adminSummary);
      setSite((current) => current
        ? {
            ...current,
            adminsCount: adminSummary.adminsCount,
            lastAdminSyncAt: adminSummary.lastAdminSyncAt,
            lastAdminLiveReadAt: adminSummary.lastAdminLiveReadAt,
            lastAdminLiveReadSource: adminSummary.lastAdminLiveReadSource,
            adminSyncStatus: adminSummary.adminSyncStatus as Site["adminSyncStatus"],
            txtAdmins: adminSummary.txtAdmins,
            siteCollectionAdmins: adminSummary.siteCollectionAdmins,
            ownersGroupAdmins: adminSummary.ownersGroupAdmins,
            adminSourceStatus: adminSummary.sourceStatus,
            adminSourceCounts: adminSummary.sourceCounts
          }
        : current);
    },
    onMessage: setMessage,
    onError: setError
  });
  const paths = site?.resolvedPaths;
  const jobs = (summary?.recent.jobs || []) as Job[];
  const backups = summary?.recent.backups || [];
  const deployments: SiteDeployment[] = summary?.recent.deployments || [];
  const bootstrapStepsCount = bootstrapPlan?.summary?.totalSteps ?? bootstrapPlan?.steps?.length ?? 0;
  const bootstrapBlockers = bootstrapPlan?.blockers || [];
  const bootstrapBlockersCount = bootstrapBlockers.length;
  const bootstrapTargetUrl = bootstrapPlan?.targetWeb?.sharePointSiteUrl || site?.sharePointSiteUrl || "";
  const bootstrapReady = bootstrapPlan?.summary?.readyForBootstrapExecution ?? (bootstrapBlockersCount === 0);
  const adminsDisplayCount = adminLiveData?.adminsCount ?? adminData?.adminsCount ?? Number(site?.adminsCount || 0);
  const adminsSourceLabel = adminLiveData ? "נמשך מ־SharePoint דרך הדפדפן" : adminData ? "Snapshot" : "רשומת אתר";

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
      { label: "runtime config path", value: site.runtimeConfigPath || paths?.runtimeConfigPath },
      { label: "runtime config URL", value: site.runtimeConfigUrl || paths?.runtimeConfigUrl, isUrl: true },
      { label: "master config path", value: paths?.txtFiles?.masterConfig },
      { label: "users_data path", value: paths?.txtFiles?.users },
      { label: "widgets_data path", value: paths?.txtFiles?.widgets },
      { label: "backups root", value: paths?.backupsRoot },
      { label: "bootstrap setup URL", value: paths?.bootstrapUrl || site.bootstrapUrl, isUrl: true }
    ];
  }, [site, paths]);

  const deploymentColumns: DataTableColumn<SiteDeployment>[] = [
    {
      key: "kind",
      header: "סוג",
      helpKey: "deploy",
      render: (deployment) => <span className={`badge ${deploymentKindBadgeClass(deployment.deploymentKind)}`}>{deploymentKindLabel(deployment.deploymentKind)}</span>
    },
    { key: "from", header: "מגרסה", helpKey: "version.current", render: (deployment) => <span className="num">{deployment.fromVersion || "-"}</span> },
    { key: "to", header: "לגרסה", helpKey: "version.latest", render: (deployment) => <span className="num">{deployment.toVersion}</span> },
    {
      key: "status",
      header: "סטטוס",
      helpKey: "deploy.evidence",
      render: (deployment) => <span className={`badge ${deploymentStatusBadgeClass(deployment.status)}`}>{deploymentStatusLabel(deployment.status)}</span>
    },
    { key: "started", header: "התחיל", helpKey: "history", render: (deployment) => <span className="num text-xs">{formatDateTime(deployment.startedAt)}</span> },
    { key: "finished", header: "הסתיים", helpKey: "history", render: (deployment) => <span className="num text-xs">{formatDateTime(deployment.finishedAt)}</span> },
    {
      key: "job",
      header: "Job",
      helpKey: "job",
      render: (deployment) => deployment.jobId
        ? <code className="num block max-w-[150px] truncate text-xs muted" title={deployment.jobId}>job {compactValue(deployment.jobId)}</code>
        : <span className="muted">-</span>
    },
    {
      key: "verification",
      header: "אימות",
      helpKey: "artifact.validation",
      render: (deployment) => {
        const evidenceCount = deployment.verification?.evidence?.length || 0;
        const failedEvidenceCount = deployment.verification?.failedFilesCount
          ?? deployment.verification?.evidence?.filter((item) => item.status === "failed").length
          ?? 0;
        return (
          <div className="space-y-1">
            <span className={`badge ${verificationBadgeClass(deployment.verification?.status)}`}>{verificationStatusLabel(deployment.verification?.status)}</span>
            <span className={`badge ${failedEvidenceCount ? "badge-danger" : evidenceCount ? "badge-success" : "badge-neutral"}`}>
              {evidenceCount ? `${formatNumber(evidenceCount)} files` : "no evidence"}
            </span>
          </div>
        );
      }
    },
    {
      key: "error",
      header: "שגיאה",
      helpKey: "diagnostics",
      render: (deployment) => deployment.error
        ? <code className="num block max-w-[180px] truncate text-xs" style={{ color: "var(--danger)" }} title={deployment.error}>{deployment.error}</code>
        : <span className="muted">-</span>
    },
    {
      key: "actions",
      header: "פרטים",
      helpKey: "audit.evidence",
      render: (deployment) => (
        <button className="btn btn-secondary min-h-0 px-2 py-1 text-xs" onClick={() => setDetailsDrawer({ type: "deployment", deployment })} type="button">
          <Eye size={13} />פתח Evidence
        </button>
      )
    }
  ];

  const backupColumns: DataTableColumn<Backup>[] = [
    { key: "id", header: "Backup ID", helpKey: "backup", render: (backup) => <span className="num">{backup.backupId}</span> },
    { key: "status", header: "סטטוס", helpKey: "backup.verified", render: (backup) => <span className="badge badge-neutral">{backup.status}</span> },
    { key: "files", header: "קבצים", helpKey: "backup.inventory", render: (backup) => <span className="num">{formatNumber(backup.filesCount)}</span> },
    { key: "size", header: "גודל", helpKey: "storage", render: (backup) => <span className="num">{formatBytes(backup.sizeBytes)}</span> },
    { key: "created", header: "נוצר", helpKey: "history", render: (backup) => <span className="num text-xs">{formatDateTime(backup.createdAt)}</span> },
    {
      key: "verification",
      header: "אימות",
      helpKey: "backup.verified",
      render: (backup) => (
        <span className={`badge ${backup.verification?.status === "verified" ? "badge-success" : backup.verification?.status === "failed" ? "badge-danger" : "badge-neutral"}`}>
          {backup.verification?.status || "unverified"}{backup.verification?.evidence?.length ? ` · ${backup.verification.evidence.length}` : ""}
        </span>
      )
    },
    {
      key: "actions",
      header: "פרטים",
      helpKey: "audit.evidence",
      render: (backup) => (
        <button className="btn btn-secondary min-h-0 px-2 py-1 text-xs" onClick={() => setDetailsDrawer({ type: "backup", backup })} type="button">
          <Eye size={13} />פתח
        </button>
      )
    }
  ];

  const jobColumns: DataTableColumn<Job>[] = [
    { key: "type", header: "סוג", helpKey: "job", render: (job) => jobTypeLabel(job.type) },
    {
      key: "status",
      header: "סטטוס",
      helpKey: "job.status",
      render: (job) => <span className={`badge ${job.status === "failed" ? "badge-danger" : job.status === "succeeded" ? "badge-success" : "badge-info"}`}>{jobStatusLabel(job.status)}</span>
    },
    {
      key: "progress",
      header: "התקדמות",
      helpKey: "job.running",
      render: (job) => <div className="progress-track w-36"><div className="progress-fill" style={{ width: `${job.progressPercent || 0}%` }} /></div>
    },
    { key: "created", header: "נוצר", helpKey: "history", render: (job) => <span className="num text-xs">{formatDateTime(job.createdAt)}</span> },
    {
      key: "error",
      header: "שגיאה",
      helpKey: "job.failed",
      render: (job) => job.errorMessage
        ? <code className="num block max-w-[220px] truncate text-xs" style={{ color: "var(--danger)" }} title={job.errorMessage}>{job.errorMessage}</code>
        : <span className="muted">-</span>
    },
    {
      key: "actions",
      header: "פרטים",
      helpKey: "job.logs",
      render: (job) => (
        <button className="btn btn-secondary min-h-0 px-2 py-1 text-xs" onClick={() => setDetailsDrawer({ type: "job", job })} type="button">
          <Eye size={13} />לוגים
        </button>
      )
    }
  ];

  const auditColumns: DataTableColumn<any>[] = [
    { key: "action", header: "פעולה", helpKey: "audit", render: (row) => row.action },
    { key: "result", header: "תוצאה", helpKey: "job.status", render: (row) => <span className={`badge ${row.result === "failure" ? "badge-danger" : "badge-success"}`}>{row.result}</span> },
    { key: "actor", header: "מי ביצע", helpKey: "sharepoint.currentUser", render: (row) => row.actor?.userName || row.actor?.userId || "-" },
    { key: "created", header: "תאריך", helpKey: "history", render: (row) => <span className="num text-xs">{formatDateTime(row.createdAt)}</span> },
    { key: "request", header: "מזהה בקשה", helpKey: "audit.evidence", render: (row) => <span className="num text-xs muted">{row.requestId || "-"}</span> },
    {
      key: "actions",
      header: "פרטים",
      helpKey: "audit.evidence",
      render: (row) => (
        <button className="btn btn-secondary min-h-0 px-2 py-1 text-xs" onClick={() => setDetailsDrawer({ type: "audit", row })} type="button">
          <Eye size={13} />פתח
        </button>
      )
    }
  ];

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

  const requireCurrentSite = () => {
    if (!site) throw new Error("site-not-loaded");
    if (!site.sharePointSiteUrl && !site.resolvedPaths?.sharePointSiteUrl) throw new Error("sharepoint-site-url-missing");
    return site;
  };

  const resolveBrowserDeployPathsForSite = (currentSite: Site) => {
    const resolved = resolveSiteBuilderPaths({
      siteCode: currentSite.siteCode,
      sharePointHost: currentSite.sharePointHost,
      sharePointSiteUrl: currentSite.sharePointSiteUrl || currentSite.resolvedPaths?.sharePointSiteUrl,
      siteDbLibrary: currentSite.siteDbLibrary || currentSite.resolvedPaths?.siteDbLibrary,
      usersDbLibrary: currentSite.usersDbLibrary || currentSite.resolvedPaths?.usersDbLibrary,
      bootstrapLibrary: currentSite.bootstrapLibrary || currentSite.resolvedPaths?.bootstrapLibrary,
      bootstrapFolder: currentSite.bootstrapFolder || currentSite.resolvedPaths?.bootstrapFolder,
      widgetsDbTarget: currentSite.widgetsDbTarget || currentSite.resolvedPaths?.widgetsDbTarget,
      runtimeConfigPath: currentSite.runtimeConfigPath || currentSite.resolvedPaths?.runtimeConfigPath
    });
    if (!resolved) throw new Error("לא ניתן לחשב נתיבי SharePoint לפריסת Mongo.");
    return resolved;
  };

  const deployLatestMongoReleaseInBrowser = async (currentSite: Site) => {
    const releases = (await sitesApi.releases()).data;
    const release = latestCompatibleRelease(releases, "mongo");
    if (!release) {
      throw new Error("לא נמצא Release פעיל, מאומת ותואם Mongo. הנתונים עברו למונגו, אבל החלפת dist דורשת Release Mongo מוכן.");
    }

    const manifest = (await sitesApi.releaseArtifactManifest(release._id)).data;
    const compatibility = manifest.compatibility || {
      storageCompatibility: manifest.summary.storageCompatibility || [],
      artifactKind: manifest.summary.artifactKind || "unknown",
      requiresRuntimeConfig: Boolean(manifest.summary.requiresRuntimeConfig),
      preservesRuntimeConfig: manifest.summary.preservesRuntimeConfig !== false,
      requiredFolders: manifest.summary.requiredFolders || [],
      runtimeConfigFiles: manifest.summary.runtimeConfigFiles || [],
      compatibilitySource: manifest.summary.compatibilitySource || "unknown",
      compatibilityWarnings: []
    };
    if (!manifest.summary.readyForDeploy) throw new Error("ה־Release Mongo האחרון לא מוכן לפריסה.");
    if (!compatibility.storageCompatibility.includes("mongo")) throw new Error("ה־Release שנבחר לא מסומן כתואם Mongo.");
    if (compatibility.preservesRuntimeConfig === false) throw new Error("ה־Release שנבחר עלול למחוק runtime config ולכן נחסם.");

    const plan = (await sitesApi.deploySiteVersionPlan(currentSite._id, release._id, "local-dev-owner", "browser-sharepoint")).data;
    if (!plan.summary.readyForDeploy) throw new Error("ה־artifact חסר או לא תקין.");
    if (plan.summary.readyForDeployExecution === false && plan.missingRequirements?.length) {
      throw new Error(plan.missingRequirements.join("; "));
    }

    const resolvedPaths = resolveBrowserDeployPathsForSite(currentSite);
    const targetSiteUrl = plan.target?.sharePointSiteUrl || resolvedPaths.sharePointSiteUrl || currentSite.sharePointSiteUrl;
    const targetDistPath = plan.target?.targetDistPath || resolvedPaths.finalDistRoot;
    const finalAppUrl = plan.target?.finalAppUrl || resolvedPaths.finalAppUrl || currentSite.finalAppUrl;
    const deployFiles = manifestFilesForPlan(plan.files, manifest.files);
    const requiredFolders = deriveRequiredFoldersFromArtifactFilePaths(deployFiles.filter((file) => file.deployable).map((file) => file.relativePath));
    for (const folder of requiredFolders) {
      await ensureSharePointFolderHierarchyBrowser(resolvedPaths, `${targetDistPath.replace(/\/+$/g, "")}/${folder}`);
    }

    const deploymentMetadata = await buildDeploymentMetadataFile({
      releaseId: release._id,
      releaseVersion: plan.releaseVersion,
      operation: "deploy",
      site: currentSite,
      targetSiteUrl,
      targetDistPath,
      finalAppUrl
    });
    const browserDeploy = await deployArtifactToSharePointBrowser({
      releaseId: release._id,
      siteId: currentSite._id,
      siteCode: currentSite.siteCode,
      targetSiteUrl,
      targetDistPath,
      finalAppUrl,
      files: [...deployFiles, deploymentMetadata.file],
      loadArtifactFile: (relativePath) =>
        relativePath === DEPLOYMENT_METADATA_FILE
          ? Promise.resolve(deploymentMetadata.response)
          : sitesApi.releaseArtifactFile(release._id, relativePath)
    });

    const versionBefore = currentSite.currentVersion || currentSite.version || "";
    const finalAppUrlVerified = browserDeploy.finalAppUrlVerification ? browserDeploy.finalAppUrlVerification.ok === true : true;
    const finalAppUrlError = browserDeploy.finalAppUrlVerification && !browserDeploy.finalAppUrlVerification.ok
      ? browserDeploy.finalAppUrlVerification.error || "final-app-url-verification-failed"
      : "";
    const effectiveFinalStatus = browserDeploy.finalStatus === "success" && finalAppUrlVerified ? "success" as const : "failed" as const;
    const errors = finalAppUrlError
      ? [...browserDeploy.errors, { error: finalAppUrlError, status: browserDeploy.finalAppUrlVerification?.status }]
      : browserDeploy.errors;

    const evidenceResponse = await sitesApi.recordBrowserDeployEvidence(currentSite._id, {
      releaseId: release._id,
      deployMode: "local-dev-owner",
      connectorMode: "browser-sharepoint",
      targetSite: {
        siteId: currentSite._id,
        siteCode: currentSite.siteCode,
        sharePointSiteUrl: targetSiteUrl
      },
      targetPaths: {
        targetDistPath,
        finalAppUrl
      },
      uploadedFilesEvidence: browserDeploy.uploadedFilesEvidence,
      readBackEvidence: browserDeploy.readBackEvidence,
      finalAppUrlVerification: browserDeploy.finalAppUrlVerification,
      errors,
      startedAt: browserDeploy.startedAt,
      completedAt: browserDeploy.completedAt,
      finalStatus: effectiveFinalStatus,
      versionBefore,
      versionAfter: effectiveFinalStatus === "success" ? plan.releaseVersion : versionBefore
    });

    const indexVerified = browserDeploy.readBackEvidence.some((item) => item.relativePath === "index.html" && item.status === "verified" && item.sizeMatches && item.sha256Matches);
    const deploymentMetadataVerified = browserDeploy.readBackEvidence.some((item) => item.relativePath === DEPLOYMENT_METADATA_FILE && item.status === "verified" && item.sizeMatches && item.sha256Matches);
    if (browserDeploy.finalStatus !== "success" || !finalAppUrlVerified || !indexVerified || !deploymentMetadataVerified) {
      throw new Error(errors.map((item) => typeof item === "string" ? item : item.error).filter(Boolean).join("; ") || "פריסת dist Mongo דרך הדפדפן נכשלה.");
    }

    return {
      releaseVersion: plan.releaseVersion,
      filesCount: browserDeploy.readBackEvidence.length,
      deploymentId: evidenceResponse.data.deployment._id
    };
  };

  const runProvisionInBrowser = async () => {
    const currentSite = requireCurrentSite();
    const queued = await sitesApi.queueSiteProvision(currentSite._id);
    setProvisionPlan(queued.data.plan);
    const evidence = await runBrowserSharePointProvisionOperation(currentSite);
    await sitesApi.recordBrowserSiteProvisionEvidence(currentSite._id, {
      ...evidence,
      jobId: queued.data.job._id
    });
    setMessage(evidence.finalStatus === "success" ? "Provision הושלם דרך הדפדפן ונשמר Evidence" : "Provision נכשל דרך הדפדפן; Evidence נשמר");
    await load();
  };

  const runPermissionsInBrowser = async () => {
    const currentSite = requireCurrentSite();
    const queued = await sitesApi.queuePermissionsSetup(currentSite._id);
    setPermissionsPlan(queued.data.plan);
    const evidence = await runBrowserSharePointPermissionsOperation(currentSite);
    await sitesApi.recordBrowserPermissionsEvidence(currentSite._id, {
      ...evidence,
      jobId: queued.data.job._id
    });
    setMessage(evidence.finalStatus === "success" ? "הרשאות הוגדרו דרך הדפדפן ונשמר Evidence" : "הגדרת הרשאות נכשלה דרך הדפדפן; Evidence נשמר");
    await load();
  };

  const runBootstrapInBrowser = async () => {
    const currentSite = requireCurrentSite();
    const queued = await sitesApi.queueSiteBootstrap(currentSite._id, {
      runProvisioning: true,
      runPermissionsSetup: true,
      reason: "Bootstrap executed from site details through browser"
    });
    setBootstrapPlan(queued.data.plan);
    const evidence = await runBrowserSharePointBootstrapOperation(currentSite);
    await sitesApi.recordBrowserSiteBootstrapEvidence(currentSite._id, {
      ...evidence,
      jobId: queued.data.job._id
    });
    setMessage(evidence.finalStatus === "success" ? "Bootstrap הושלם דרך הדפדפן ונשמר Evidence" : "Bootstrap נכשל דרך הדפדפן; Evidence נשמר");
    await load();
  };

  const runAdminTxtRepairInBrowser = async () => {
    const currentSite = requireCurrentSite();
    const queued = await sitesApi.queueAdminTxtRepair(currentSite._id, "Admin TXT repair executed from site details through browser");
    const evidence = await runBrowserAdminTxtRepairOperation(currentSite, queued.data.plan, "Admin TXT repair from site details");
    await sitesApi.recordBrowserAdminTxtRepairEvidence(currentSite._id, {
      ...evidence,
      jobId: queued.data.job._id
    });
    setMessage(evidence.finalStatus === "success" ? "users_data.txt תוקן דרך הדפדפן ונשמר Evidence" : "תיקון users_data.txt נכשל דרך הדפדפן; Evidence נשמר");
    await load();
  };

  const runTxtToMongoMigrationInBrowser = async () => {
    const currentSite = requireCurrentSite();
    if (currentSite.storageBackend === "mongo") {
      throw new Error("האתר כבר מוגדר כ־Mongo.");
    }

    const snapshot = await readBrowserTxtSnapshotForMongoMigration(currentSite);
    const blockedFiles = snapshot.files.filter((file) => file.status !== "read" || file.parseStatus !== "json");
    if (blockedFiles.length) {
      setMigrationResult(null);
      throw new Error(`נכשל לקרוא TXT תקין לפני מיגרציה: ${blockedFiles.map((file) => file.fileName || file.key || file.sourcePath).join(", ")}`);
    }

    const migration = await sitesApi.migrateTxtToMongo(currentSite._id, snapshot);
    setMigrationResult(migration.data);
    if (migration.data.finalStatus === "failed") {
      throw new Error("ייבוא הנתונים ל־Mongo נכשל. פתחו Audit/Evidence לפרטים.");
    }

    const refreshed = (await sitesApi.getById(currentSite._id)).data;
    const runtimeConfig = await sitesApi.mongoRuntimeConfigContent(currentSite._id);
    const runtimeEvidence = await runBrowserMongoRuntimeConfigUpload(refreshed, runtimeConfig.data);
    await sitesApi.recordMongoCreateBrowserEvidence(currentSite._id, runtimeEvidence);
    if (!runtimeEvidence.runtimeConfig?.verified) {
      throw new Error("הנתונים עברו ל־Mongo, אבל runtime config לא אומת ב־SharePoint.");
    }

    const deployResult = await deployLatestMongoReleaseInBrowser(refreshed);
    setMessage(`מיגרציית TXT ל־Mongo הושלמה: ${migration.data.import.written.length} קבצי TXT הועברו, runtime config אומת, ו־dist עודכן לגרסת ${deployResult.releaseVersion}.`);
    setActiveTab("versions");
    await load();
  };

  if (loading) return <LoadingState label="טוען פרטי אתר..." />;
  if (error && !site) return <ErrorState message={error} onRetry={load} />;
  if (!site) return <EmptyState title="האתר לא נמצא" description="לא נמצאה רשומה מתאימה ב־Hub." />;

  const failedJobsCount = jobs.filter((job) => job.status === "failed").length;
  const latestDeployment = deployments[0];
  const latestBackup = backups[0];
  const siteAttention = site.status === "archived"
    ? "האתר בארכיון. פעולות שוטפות לא מומלצות לפני החזרה לניהול."
    : site.derivedHealthStatus === "failed"
      ? "בדיקת התקינות האחרונה נכשלה. פתחו תקינות וקראו Evidence."
      : failedJobsCount
        ? `${formatNumber(failedJobsCount)} פעולות אחרונות נכשלו. פתחו פעולות כדי לקרוא לוגים.`
        : site.versionStatus === "outdated"
          ? "האתר לא בגרסה האחרונה הידועה. פריסה אפשרית דרך מרכז הגרסאות."
          : !site.lastBackupAt
            ? "לא נמצא גיבוי אחרון. מומלץ ליצור תוכנית גיבוי."
            : "אין בעיה דחופה שמוצגת באתר הזה.";
  const siteAttentionTone = site.status === "archived" || site.derivedHealthStatus === "failed" || failedJobsCount
    ? "danger"
    : site.versionStatus === "outdated" || !site.lastBackupAt
      ? "warning"
      : "success";

  return (
    <div className="space-y-5">
      <PageHeader
        variant="entity"
        title={site.displayName}
        subtitle={`קוד אתר: ${site.siteCode}`}
        helpKey="sites.registry"
        actions={
          <>
            <a className="btn btn-primary" href={site.finalAppUrl || paths?.finalAppUrl || site.sharePointSiteUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} />פתח אתר</a>
            <Link className="btn btn-secondary" to={`/sites?edit=${site._id}`}><Edit3 size={16} />ערוך</Link>
            <button className="btn btn-secondary" type="button" onClick={() => setActionsOpen(true)}><MoreHorizontal size={16} />פעולות</button>
          </>
        }
      />

      <OperationalSummary
        title="מצב האתר ומה בטוח לעשות"
        purpose="זהו דף העבודה של אתר אחד: בריאות, גרסה, גיבויים, מנהלים, פעולות וראיות."
        state={`סטטוס: ${site.status} · תקינות: ${site.derivedHealthStatus || "unknown"} · גרסה: ${site.currentVersion || site.version || "-"} · גיבוי אחרון: ${formatDateTime(site.lastBackupAt)}`}
        attention={siteAttention}
        attentionTone={siteAttentionTone}
        nextAction={site.derivedHealthStatus === "failed"
          ? "עברו ללשונית תקינות והריצו בדיקה read-only."
          : failedJobsCount
            ? "עברו ללשונית פעולות, פתחו Job שנכשל וקראו את הלוגים."
            : site.versionStatus === "outdated"
              ? "פתחו פריסה דרך הדפדפן במרכז הגרסאות."
              : !site.lastBackupAt
                ? "עברו לגיבויים וצרו תוכנית גיבוי לפני שינוי גדול."
                : "אפשר לפתוח את האתר, לבדוק נתונים, או לעבור ללשונית המתאימה לפי הצורך."}
        blocked={!writeAvailable
          ? "SharePoint מתבצע דרך הדפדפן המחובר. השרת לא נדרש ולא אמור לכתוב ל־SharePoint."
          : undefined}
        tone={siteAttentionTone}
      />

      <GuidedFlow
        title="סדר עבודה מומלץ לאתר"
        steps={[
          { title: "הבן מצב", description: "קראו תקינות, גרסה וגיבוי אחרון לפני פעולה.", status: "done" },
          { title: "בדוק חסמים", description: "אם יש כשל, התחילו ב־Evidence ו־Jobs במקום לנחש.", status: siteAttentionTone === "danger" ? "active" : "pending" },
          { title: "בחר פעולה מוגנת", description: "פריסה, גיבוי, Bootstrap והרשאות עוברים דרך תוכנית או אישור.", status: "pending" },
          { title: "שמור ראיות", description: "אחרי פעולה, בדקו Evidence, Audit וגיבוי.", status: latestDeployment || latestBackup ? "done" : "pending" }
        ]}
      />

      <ModeBoundary
        title="גבולות פעולה באתר הזה"
        items={[
          { label: "פתח אתר", description: "פותח את האתר בדפדפן. לא משנה Hub או SharePoint.", tone: "success" },
          { label: "בדיקות וגיבוי דפדפן", description: "משתמשות בחיבור הדפדפן ל־SharePoint כשזה נתמך.", tone: "info" },
          { label: "Server SharePoint", description: "מושבת בכוונה. פעולות SharePoint נתמכות דרך הדפדפן המחובר בלבד.", tone: "neutral" },
          { label: "ארכיון", description: "מסמן רשומה ב־Hub בלבד ולא מוחק קבצים מ־SharePoint.", tone: "danger" }
        ]}
      />

      {message ? <div className="badge badge-success px-3 py-2">{message}</div> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}

      <div className="surface-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={site.status} />
            <HealthBadge status={site.derivedHealthStatus} />
            <VersionBadge status={site.versionStatus || "unknown"} />
            <span className="badge badge-success">SharePoint דרך הדפדפן</span>
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
            <KpiCard title="גרסה" value={site.currentVersion || site.version || "-"} icon={<GitBranch size={18} />} description={`יעד: ${site.targetVersion || site.latestKnownVersion || "-"}`} tone={site.versionStatus === "outdated" ? "warning" : "info"} helpKey="version.current" />
            <KpiCard title="נפח" value={formatMb(site.storageMb)} icon={<DatabaseBackup size={18} />} description={`${formatNumber(site.filesCount || 0)} קבצים רשומים`} tone="neutral" helpKey="storage" />
            <KpiCard title="מנהלים" value={formatNumber(adminsDisplayCount)} icon={<Users size={18} />} description={`${adminsSourceLabel} · סנכרון: ${site.adminSyncStatus || "לא ידוע"}`} tone="info" helpKey="site.admins" />
            <KpiCard title="גיבויים" value={formatNumber(site.backupCount || 0)} icon={<DatabaseBackup size={18} />} description={`אחרון: ${formatDateTime(site.lastBackupAt)}`} tone="neutral" helpKey="backup" />
          </div>

          {site.storageBackend !== "mongo" ? (
            <SectionCard title="מיגרציית TXT ל־Mongo" subtitle="ייבוא קבצי TXT דרך הדפדפן, כתיבה ל־Mongo, העלאת runtime config ופריסת dist תואם Mongo." helpKey="site.mongodb">
              <div className="flex flex-wrap items-center gap-2">
                <button className="btn btn-primary" disabled={busyAction === "txt-to-mongo"} onClick={() => runAction("txt-to-mongo", runTxtToMongoMigrationInBrowser)} type="button">
                  <Workflow size={15} />המר אתר TXT ל־Mongo ועדכן dist
                </button>
                <span className="badge badge-success">SharePoint בדפדפן</span>
                <span className="badge badge-info">Mongo דרך השרת</span>
              </div>
              {migrationResult ? (
                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  <KpiCard title="קבצים שיובאו" value={formatNumber(migrationResult.import.written.length)} icon={<ListChecks size={18} />} tone={migrationResult.import.status === "ok" ? "success" : "warning"} helpKey="site.mongodb" />
                  <KpiCard title="Registry" value={migrationResult.registry.status} icon={<ShieldCheck size={18} />} tone={migrationResult.registry.status === "ok" ? "success" : "danger"} helpKey="site.mongodb" />
                  <KpiCard title="Import" value={migrationResult.import.status} icon={<DatabaseBackup size={18} />} tone={migrationResult.import.status === "ok" ? "success" : "danger"} helpKey="site.mongodb" />
                  <KpiCard title="המשך" value="Auto Deploy" icon={<Rocket size={18} />} tone={migrationResult.finalStatus === "runtime-config-required" ? "info" : "warning"} helpKey="deploy" />
                </div>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="btn btn-secondary" type="button" onClick={() => setActiveTab("versions")}>
                  <Rocket size={15} />פתח היסטוריית גרסאות
                </button>
              </div>
            </SectionCard>
          ) : null}

          <div className="grid gap-5 xl:grid-cols-2">
            <SectionCard title="בעלות ותפעול" subtitle="פרטי אחריות ומעקב" helpKey="site.owner">
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

            <SectionCard title="Operations / Bootstrap" subtitle="כל פעולת SharePoint רצה דרך הדפדפן הפעיל; השרת שומר Job ו־Evidence בלבד" helpKey="site.bootstrap">
              <div className="mb-4 flex flex-wrap gap-2">
                <button className="btn btn-primary" disabled={busyAction === "bootstrap-plan"} onClick={() => runAction("bootstrap-plan", async () => {
                  const result = await sitesApi.siteBootstrapPlan(site._id);
                  setBootstrapPlan(result.data);
                  setMessage("תוכנית Bootstrap נבנתה");
                })} type="button"><ClipboardList size={15} />בנה תוכנית</button>
                <button className="btn btn-secondary" disabled={busyAction === "provision-plan"} onClick={() => runAction("provision-plan", async () => {
                  const result = await sitesApi.siteProvisionPlan(site._id);
                  setProvisionPlan(result.data);
                  setMessage("תוכנית Provision נבנתה");
                })} type="button"><ClipboardList size={15} />תכנן Provision</button>
                <button className="btn btn-secondary" disabled={busyAction === "permissions-plan"} onClick={() => runAction("permissions-plan", async () => {
                  const result = await sitesApi.permissionsSetupPlan(site._id);
                  setPermissionsPlan(result.data);
                  setMessage("תוכנית הרשאות נבנתה");
                })} type="button"><ClipboardList size={15} />תכנן הרשאות</button>
                <button className="btn btn-primary" disabled={busyAction === "site-provision"} onClick={() => runAction("site-provision", runProvisionInBrowser)} type="button"><Workflow size={15} />הרץ Provision</button>
                <button className="btn btn-secondary" disabled={busyAction === "permissions-setup"} onClick={() => runAction("permissions-setup", runPermissionsInBrowser)} type="button"><ShieldCheck size={15} />הרץ הרשאות</button>
                <button className="btn btn-secondary" disabled={busyAction === "site-bootstrap"} onClick={() => runAction("site-bootstrap", runBootstrapInBrowser)} type="button"><Rocket size={15} />הרץ Bootstrap</button>
                <span className="badge badge-success">Browser SharePoint</span>
              </div>

              {bootstrapPlan ? (
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    <KpiCard title="צעדים" value={formatNumber(bootstrapStepsCount)} icon={<ListChecks size={18} />} tone="info" helpKey="site.bootstrap" />
                    <KpiCard title="חסמים" value={formatNumber(bootstrapBlockersCount)} icon={<ShieldCheck size={18} />} tone={bootstrapReady ? "success" : "warning"} helpKey="deploy.blocker" />
                    <KpiCard title="הרצה" value="דפדפן" icon={<Workflow size={18} />} tone="success" helpKey="sharepoint.write" />
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
	                  {provisionPlan || permissionsPlan ? (
	                    <div className="grid gap-3 md:grid-cols-2">
	                      {provisionPlan ? (
	                        <div className="soft-panel p-3">
	                          <p className="text-sm font-bold">Provision</p>
	                          <p className="mt-1 text-xs muted">{formatNumber(provisionPlan.steps?.length || 0)} צעדים · {provisionPlan.notes?.[0] || "מוכן להרצה דרך הדפדפן"}</p>
	                        </div>
	                      ) : null}
	                      {permissionsPlan ? (
	                        <div className="soft-panel p-3">
	                          <p className="text-sm font-bold">Permissions</p>
	                          <p className="mt-1 text-xs muted">{formatNumber(permissionsPlan.steps?.length || 0)} צעדים · {permissionsPlan.notes?.[0] || "מוכן להרצה דרך הדפדפן"}</p>
	                        </div>
	                      ) : null}
	                    </div>
	                  ) : null}
	                </div>
	              ) : (
                <EmptyState title="אין תוכנית Bootstrap עדיין" description="בנה תוכנית כדי לראות יעד, חסמים ורשימת צעדים לפני הרצה." />
              )}
            </SectionCard>

            <SectionCard title="פעולות מומלצות" subtitle="נגזר ממצב הרשומה וה־operations summary" helpKey="operations">
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
        <SectionCard title="נתיבי SharePoint" subtitle="נתיבים נגזרים לפי ארכיטקטורת Site Builder האמיתית" helpKey="site.finalDistPath">
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
          <SectionCard title="תקינות נוכחית" subtitle="מצב אחרון שנשמר ב־Hub" helpKey="health">
            <HealthChecklist health={site.health} storageBackend={site.storageBackend || "unknown"} />
          </SectionCard>
          <SectionCard title="בדיקות" subtitle="בדיקה ידנית או קריאה בלבד מול SharePoint" helpKey="health.readOnly">
            <div className="mb-4 flex flex-wrap gap-2">
              <MetadataOnlyBadge mode="metadata" />
              <MetadataOnlyBadge mode="readonly" />
            </div>
            <HealthChecklist health={healthDraft} storageBackend={site.storageBackend || "unknown"} editable onChange={setHealthDraft} />
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
              <button className="btn btn-secondary" disabled={busyAction === "runtime-config"} onClick={() => runAction("runtime-config", async () => {
                const result = await sitesApi.validateRuntimeConfig(site._id);
                setRuntimeConfigResult(result.data);
                setMessage("בדיקת runtime config הסתיימה");
                await load();
              })} type="button">בדוק runtime config</button>
              <button className="btn btn-secondary" disabled={busyAction === "mongo-health" || site.storageBackend !== "mongo"} onClick={() => runAction("mongo-health", async () => {
                const result = await sitesApi.runMongoBackendHealth(site._id);
                setMongoHealthResult(result.data);
                setMessage("בדיקת Mongo backend הסתיימה");
                await load();
              })} type="button">בדוק Mongo backend</button>
            </div>
            <div className="mt-5 grid gap-3">
              <div className="soft-panel p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold">Runtime config</p>
                  <span className={`badge ${site.runtimeConfigStatus?.readStatus === "configured" || runtimeConfigResult?.readStatus === "configured" ? "badge-success" : "badge-neutral"}`}>
                    {runtimeConfigResult?.readStatus || site.runtimeConfigStatus?.readStatus || "unknown"}
                  </span>
                </div>
                <LinkRow label="Path" value={runtimeConfigResult?.runtimeConfigPath || site.runtimeConfigStatus?.path || site.runtimeConfigPath || paths?.runtimeConfigPath} />
                <LinkRow label="Backend URL" value={runtimeConfigResult?.backendApiUrlHost || site.runtimeConfigStatus?.backendApiUrlHost || ""} />
                <LinkRow label="Builder siteId" value={runtimeConfigResult?.builderSiteId || site.runtimeConfigStatus?.builderSiteId || site.builderSiteId || site.mongoSiteId || ""} />
                <LinkRow label="API key" value={runtimeConfigResult?.apiKeyStatus || site.runtimeConfigStatus?.apiKeyStatus || "unknown"} />
                {(runtimeConfigResult?.warnings || site.runtimeConfigStatus?.warnings || []).length ? (
                  <div className="mt-2 rounded-md border p-2 text-sm" style={{ borderColor: "var(--border)", background: "var(--warning-soft)", color: "var(--warning)" }}>
                    {(runtimeConfigResult?.warnings || site.runtimeConfigStatus?.warnings || []).join(" · ")}
                  </div>
                ) : null}
              </div>
              {site.storageBackend === "mongo" ? (
                <div className="soft-panel p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-bold">Mongo / Builder backend</p>
                    <span className={`badge ${mongoHealthResult?.seedStatus === "ok" || site.mongoBackendStatus?.seedStatus === "ok" ? "badge-success" : "badge-warning"}`}>
                      Seed: {mongoHealthResult?.seedStatus || site.mongoBackendStatus?.seedStatus || "unknown"}
                    </span>
                  </div>
                  <LinkRow label="Backend URL" value={mongoHealthResult?.backendApiUrlHost || site.mongoBackendStatus?.backendApiUrlHost || site.backendApiUrl || ""} />
                  <LinkRow label="Mongo siteId" value={mongoHealthResult?.builderSiteId || site.mongoBackendStatus?.siteId || site.mongoSiteId || site.builderSiteId || ""} />
                  <LinkRow label="safeCollectionName" value={mongoHealthResult?.safeCollectionName || site.mongoBackendStatus?.safeCollectionName || site.safeCollectionName || ""} />
                  <LinkRow label="Registry" value={mongoHealthResult?.registryStatus || site.mongoBackendStatus?.registryStatus || "unknown"} />
                  <LinkRow label="Collection" value={mongoHealthResult?.collectionStatus || site.mongoBackendStatus?.collectionStatus || "unknown"} />
                  <LinkRow label="Backups" value={mongoHealthResult?.backupsStatus || site.mongoBackendStatus?.backupsStatus || "unknown"} />
                  {(mongoHealthResult?.missingDocs || site.mongoBackendStatus?.missingDocs || []).length ? (
                    <div className="mt-2 rounded-md border p-2 text-sm" style={{ borderColor: "var(--border)", background: "var(--warning-soft)", color: "var(--warning)" }}>
                      חסרים seed docs: {(mongoHealthResult?.missingDocs || site.mongoBackendStatus?.missingDocs || []).join(", ")}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
            {sharePointHealth ? (
              <div className="mt-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="num text-xs muted">נבדק: {formatDateTime(sharePointHealth.checkedAt)}</span>
                  <HealthBadge status={sharePointHealth.derivedHealthStatus as any} />
                </div>
                {sharePointHealth.note ? <div className="mb-3 rounded-lg border p-3 text-sm" style={{ background: "var(--warning-soft)", color: "var(--warning)", borderColor: "var(--border)" }}>{sharePointHealth.note}</div> : null}
                <HealthEvidenceTable evidence={sharePointHealth.evidence} />
              </div>
            ) : null}
          </SectionCard>
        </div>
      ) : null}

      {activeTab === "versions" ? (
        <SectionCard title="גרסאות ופריסות" subtitle="פריסות אמיתיות דורשות SharePoint write capability ושומרות evidence קריאה חזרה לכל קובץ." helpKey="deploy">
          <div className="mb-4 flex flex-wrap gap-2">
            <VersionBadge status={site.versionStatus || "unknown"} />
            <span className="badge badge-info">Browser SharePoint deploy</span>
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => navigate(`/releases?targetSiteId=${encodeURIComponent(site._id)}`)}
            >
              <Rocket size={15} />פריסה דרך הדפדפן
            </button>
          </div>
          {deployments.length === 0 ? (
            <EmptyState title="אין פריסות רשומות" description="היסטוריית פריסה תופיע לאחר יצירת deployment job." />
          ) : (
            <DataTable
              columns={deploymentColumns}
              rows={deployments}
              rowKey={(deployment: SiteDeployment) => deployment._id}
              minWidth={1360}
              mobileCard={(deployment: SiteDeployment) => {
                const evidenceCount = deployment.verification?.evidence?.length || 0;
                const failedEvidenceCount = deployment.verification?.failedFilesCount
                  ?? deployment.verification?.evidence?.filter((item: DeploymentVerificationEvidence) => item.status === "failed").length
                  ?? 0;
                return (
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="num truncate text-sm font-bold">{deployment.fromVersion || "-"} -&gt; {deployment.toVersion}</p>
                        <p className="text-xs muted">{formatDateTime(deployment.startedAt || deployment.createdAt)}</p>
                      </div>
                      <span className={`badge shrink-0 ${deploymentStatusBadgeClass(deployment.status)}`}>{deploymentStatusLabel(deployment.status)}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className={`badge ${deploymentKindBadgeClass(deployment.deploymentKind)}`}>{deploymentKindLabel(deployment.deploymentKind)}</span>
                      <span className={`badge ${verificationBadgeClass(deployment.verification?.status)}`}>{verificationStatusLabel(deployment.verification?.status)}</span>
                      <span className={`badge ${failedEvidenceCount ? "badge-danger" : evidenceCount ? "badge-success" : "badge-neutral"}`}>{formatNumber(evidenceCount)} files</span>
                    </div>
                    {deployment.error ? <code className="num block max-w-full truncate text-xs" style={{ color: "var(--danger)" }} title={deployment.error}>{deployment.error}</code> : null}
                    <button className="btn btn-secondary w-full" onClick={() => setDetailsDrawer({ type: "deployment", deployment })} type="button"><Eye size={14} />פתח Evidence</button>
                  </div>
                );
              }}
            />
          )}
        </SectionCard>
      ) : null}

      {activeTab === "backups" ? (
        <SectionCard title="גיבויים" subtitle="גיבוי משתמש רץ דרך הדפדפן המחובר ל־SharePoint; השרת שומר תוכנית ו־evidence בלבד." helpKey="backup">
          <div className="mb-4 flex flex-wrap gap-2">
            <button className="btn btn-primary" disabled={busyAction === "backup-plan"} onClick={() => runAction("backup-plan", async () => {
              const plan = await buildBrowserSharePointBackupPlan(site);
              setBackupPlan(plan);
              setMessage("תוכנית גיבוי דרך הדפדפן נוצרה");
            })} type="button">צור תוכנית גיבוי</button>
            <button className="btn btn-secondary" disabled={busyAction === "run-backup"} onClick={() => runAction("run-backup", async () => {
              const queued = await sitesApi.runSiteBackup(site._id);
              if (!queued.data.browserOperationPlan) {
                throw new Error(queued.data.message || "גיבוי דרך הדפדפן עדיין לא מוכן לפעולה הזאת.");
              }
              const result = await runBrowserSharePointBackupOperation(site, { plan: queued.data.browserOperationPlan });
              const stored = await sitesApi.recordBrowserBackupEvidence(site._id, {
                connectorMode: "browser-sharepoint",
                jobId: queued.data.job._id,
                targetSiteUrl: result.targetSiteUrl,
                backupId: result.backupId,
                target: result.target,
                sourcePaths: result.sourcePaths,
                verificationEvidence: result.verificationEvidence,
                errors: result.errors,
                startedAt: result.startedAt,
                completedAt: result.completedAt,
                finalStatus: result.finalStatus
              });
              setMessage(result.finalStatus === "success"
                ? `גיבוי ${stored.data.backup.backupId} הושלם דרך הדפדפן`
                : `גיבוי ${result.backupId} נכשל דרך הדפדפן; evidence נשמר`);
              await load();
            })} type="button">הרץ גיבוי בדפדפן</button>
            {!writeAvailable ? <span className="badge badge-warning">אין SharePoint בשרת. הגיבוי משתמש בחיבור הדפדפן ולכן ניתן להמשיך.</span> : null}
          </div>
          {backupPlan ? (
            <div className="mb-5 space-y-3">
              <div className="grid gap-3 md:grid-cols-4">
                <KpiCard title="מקורות קיימים" value={`${backupPlan.summary.existingSources}/${backupPlan.summary.totalSources}`} icon={<ListChecks size={18} />} tone={backupPlan.summary.readyForBackup ? "success" : "warning"} helpKey="backup.inventory" />
                <KpiCard title="חסרים" value={backupPlan.summary.missingSources} icon={<ListChecks size={18} />} tone={backupPlan.summary.missingSources ? "warning" : "success"} helpKey="deploy.blocker" />
                <KpiCard title="Auth blocked" value={backupPlan.summary.authBlockedSources} icon={<ListChecks size={18} />} tone={backupPlan.summary.authBlockedSources ? "warning" : "success"} helpKey="health.401" />
                <KpiCard title="גודל ידוע" value={formatBytes(backupPlan.summary.knownSizeBytes)} icon={<DatabaseBackup size={18} />} tone="neutral" helpKey="storage" />
              </div>
              <LinkRow label="יעד גיבוי" value={backupPlan.target.backupFolder} />
            </div>
          ) : null}
          {backups.length === 0 ? (
            <EmptyState title="אין גיבויים רשומים" description="גיבויים יופיעו לאחר הרצת backup job." />
          ) : (
            <DataTable
              columns={backupColumns}
              rows={backups}
              rowKey={(backup) => backup._id}
              minWidth={980}
              mobileCard={(backup) => (
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="num truncate text-sm font-bold">{backup.backupId}</p>
                      <p className="text-xs muted">{formatDateTime(backup.createdAt)}</p>
                    </div>
                    <span className="badge badge-neutral shrink-0">{backup.status}</span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <MobileMeta label="קבצים" helpKey="backup.inventory">{formatNumber(backup.filesCount)}</MobileMeta>
                    <MobileMeta label="גודל" helpKey="storage">{formatBytes(backup.sizeBytes)}</MobileMeta>
                  </div>
                  <button className="btn btn-secondary w-full" onClick={() => setDetailsDrawer({ type: "backup", backup })} type="button"><Eye size={14} />פרטי גיבוי</button>
                </div>
              )}
            />
          )}
        </SectionCard>
      ) : null}

      {activeTab === "admins" ? (
        <SectionCard title="מנהלים" subtitle="מקורות: TXT, Site Collection Admins ו־Owners Group דרך חיבור הדפדפן" helpKey="site.admins">
          <div className="mb-4 flex flex-wrap gap-2">
            <MetadataOnlyBadge mode="metadata" />
            <MetadataOnlyBadge mode="readonly" />
	            <span className="badge badge-success">מופעל דרך הדפדפן</span>
	            <button className="btn btn-primary" disabled={adminsLiveReadBusy || busyAction === "admins-live-read"} onClick={() => runAction("admins-live-read", async () => {
	              await runAdminsLiveRead();
	            })} type="button"><RefreshCcw size={14} />רענן מנהלים עכשיו</button>
	            <button className="btn btn-secondary" disabled={site.storageBackend === "mongo" || busyAction === "admin-txt-repair"} onClick={() => runAction("admin-txt-repair", runAdminTxtRepairInBrowser)} type="button"><ShieldCheck size={14} />תקן TXT בדפדפן</button>
	            <Link className="btn btn-secondary" to="/admins">פתח את מסך המנהלים</Link>
	          </div>
          <div className="mb-4">
            <AdminSourceSummaryCards adminData={adminData} liveData={adminLiveData} siteLabel={adminsSourceLabel} variant="inline" />
          </div>
          <div className="mb-4">
            <AdminLiveReadMeta liveData={adminLiveData} adminData={adminData} />
          </div>
          <div className="mb-4">
            <AdminSourceStatusTable data={adminLiveData || adminData} />
          </div>
          <AdminSourceLists adminData={adminData} liveData={adminLiveData} limit={8} />
        </SectionCard>
      ) : null}

      {activeTab === "jobs" ? (
        <SectionCard title="Jobs של האתר" subtitle="פעולות אחרונות ושגיאות" helpKey="job">
          {jobs.length === 0 ? (
            <EmptyState title="אין Jobs" description="לא נמצאו פעולות אחרונות לאתר זה." />
          ) : (
            <DataTable
              columns={jobColumns}
              rows={jobs}
              rowKey={(job) => job._id}
              minWidth={940}
              mobileCard={(job) => (
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{jobTypeLabel(job.type)}</p>
                      <p className="num text-xs muted">{formatDateTime(job.createdAt)}</p>
                    </div>
                    <span className={`badge shrink-0 ${job.status === "failed" ? "badge-danger" : job.status === "succeeded" ? "badge-success" : "badge-info"}`}>{jobStatusLabel(job.status)}</span>
                  </div>
                  <div className="progress-track"><div className="progress-fill" style={{ width: `${job.progressPercent || 0}%` }} /></div>
                  {job.errorMessage ? <code className="num block max-w-full truncate text-xs" style={{ color: "var(--danger)" }} title={job.errorMessage}>{job.errorMessage}</code> : null}
                  <button className="btn btn-secondary w-full" onClick={() => setDetailsDrawer({ type: "job", job })} type="button"><Eye size={14} />לוגים</button>
                </div>
              )}
            />
          )}
        </SectionCard>
      ) : null}

      {activeTab === "audit" ? (
        <SectionCard title="Audit" subtitle="יומן פעולות עבור האתר" helpKey="audit">
          {auditRows.length === 0 ? <EmptyState title="אין רשומות Audit לאתר" description="יומן הפעולות המלא זמין בעמוד יומן פעולות." action={<Link className="btn btn-secondary" to="/audit">פתח יומן מלא</Link>} /> : (
            <DataTable
              columns={auditColumns}
              rows={auditRows}
              rowKey={(row) => row._id}
              minWidth={980}
              mobileCard={(row) => (
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{row.action}</p>
                      <p className="num text-xs muted">{formatDateTime(row.createdAt)}</p>
                    </div>
                    <span className={`badge shrink-0 ${row.result === "failure" ? "badge-danger" : "badge-success"}`}>{row.result}</span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <MobileMeta label="מי ביצע" helpKey="sharepoint.currentUser">{row.actor?.userName || row.actor?.userId || "-"}</MobileMeta>
                    <MobileMeta label="מזהה בקשה" helpKey="audit.evidence"><span className="num">{row.requestId || "-"}</span></MobileMeta>
                  </div>
                  <button className="btn btn-secondary w-full" onClick={() => setDetailsDrawer({ type: "audit", row })} type="button"><Eye size={14} />פרטים</button>
                </div>
              )}
            />
          )}
        </SectionCard>
      ) : null}

      {activeTab === "notes" ? (
        <SectionCard title="הערות" subtitle="מידע תפעולי חופשי ושגיאות אחרונות" helpKey="site.metadata">
          <div className="soft-panel p-4">
            <p className="whitespace-pre-wrap text-sm">{site.notes || "אין הערות כרגע."}</p>
          </div>
          {site.lastError ? <div className="mt-4 rounded-lg border p-3 text-sm" style={{ background: "var(--danger-soft)", color: "var(--danger)", borderColor: "var(--border)" }}>שגיאה אחרונה: {site.lastError}</div> : null}
        </SectionCard>
      ) : null}

      <DetailsDrawer open={actionsOpen} title="פעולות אתר" subtitle={site.displayName} onClose={() => setActionsOpen(false)}>
        <div className="space-y-4">
          <a className="btn btn-secondary w-full" href={site.sharePointSiteUrl || paths?.sharePointSiteUrl} target="_blank" rel="noreferrer">
            <FolderInput size={16} />פתח SharePoint
          </a>
          <button className="btn btn-secondary w-full" onClick={load} type="button"><RefreshCcw size={15} />רענן נתונים</button>
          <div className="rounded-lg border p-4" style={{ borderColor: "color-mix(in srgb, var(--danger) 35%, var(--border))", background: "var(--danger-soft)" }}>
            <p className="mb-2 font-bold" style={{ color: "var(--danger)" }}>פעולה רגישה</p>
            <p className="mb-3 text-sm muted">העברה לארכיון מסמנת את האתר ב־Hub בלבד ולא מוחקת קבצים מ־SharePoint.</p>
            <button className="btn btn-danger w-full" onClick={() => { setActionsOpen(false); setConfirmArchive(true); }} type="button"><Archive size={16} />העבר לארכיון</button>
          </div>
        </div>
      </DetailsDrawer>

      <DetailsDrawer
        open={Boolean(detailsDrawer)}
        title={
          detailsDrawer?.type === "deployment" ? "ראיות פריסה" :
          detailsDrawer?.type === "backup" ? "פרטי גיבוי" :
          detailsDrawer?.type === "job" ? "לוגי פעולה" :
          detailsDrawer?.type === "audit" ? "קבלת יומן" :
          "פרטים"
        }
        subtitle={site.displayName}
        onClose={() => setDetailsDrawer(null)}
      >
        {detailsDrawer?.type === "deployment" ? (() => {
          const deployment = detailsDrawer.deployment;
          const evidence = deployment.verification?.evidence || [];
          const finalApp = deployment.verification?.finalAppUrlVerification;
          const postHealth = deployment.verification?.postHealth;
          const postHealthEvidence = postHealth?.evidence || [];
          const finalAppUrl = finalApp?.url || finalApp?.finalAppUrl || "";
          const finalAppStatus = finalApp?.status ?? finalApp?.httpStatus;
          const finalAppStatusText = finalApp?.statusText || finalApp?.httpStatusText || "";
          const filesCount = deployment.verification?.filesCount ?? evidence.length;
          const verifiedCount = deployment.verification?.verifiedFilesCount ?? evidence.filter((item) => item.status === "verified").length;
          const failedCount = deployment.verification?.failedFilesCount ?? evidence.filter((item) => item.status === "failed").length;
          return (
            <div className="space-y-5">
              <div className="soft-panel p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold muted">סיכום פריסה</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className={`badge ${deploymentKindBadgeClass(deployment.deploymentKind)}`}>{deploymentKindLabel(deployment.deploymentKind)}</span>
                      <span className={`badge ${deploymentStatusBadgeClass(deployment.status)}`}>{deploymentStatusLabel(deployment.status)}</span>
                      <span className={`badge ${verificationBadgeClass(deployment.verification?.status)}`}>{verificationStatusLabel(deployment.verification?.status)}</span>
                    </div>
                  </div>
                  <span className="num text-xs muted">{formatDateTime(deployment.verification?.checkedAt || deployment.finishedAt || deployment.createdAt)}</span>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <MobileMeta label="גרסאות"><span className="num">{deployment.fromVersion || "-"} -&gt; {deployment.toVersion || "-"}</span></MobileMeta>
                  <MobileMeta label="Job ID">{deployment.jobId ? <code className="num block max-w-full truncate" title={deployment.jobId}>{deployment.jobId}</code> : "-"}</MobileMeta>
                  <MobileMeta label="קבצים">
                    <div className="flex flex-wrap gap-2">
                      <span className="badge badge-neutral">{formatNumber(filesCount)} files</span>
                      <span className="badge badge-success">{formatNumber(verifiedCount)} אומתו</span>
                      <span className={`badge ${failedCount ? "badge-danger" : "badge-neutral"}`}>{formatNumber(failedCount)} נכשלו</span>
                    </div>
                  </MobileMeta>
                  <MobileMeta label="נוצר">{formatDateTime(deployment.createdAt)}</MobileMeta>
                </div>
                {deployment.rollbackReason ? (
                  <div className="mt-4 rounded-lg border p-3 text-sm" style={{ background: "var(--warning-soft)", borderColor: "color-mix(in srgb, var(--warning) 35%, var(--border))", color: "var(--warning)" }}>
                    <span className="font-bold">סיבת Rollback: </span>{deployment.rollbackReason}
                  </div>
                ) : null}
                {deployment.error ? (
                  <div className="mt-4 rounded-lg border p-3 text-sm" style={{ background: "var(--danger-soft)", borderColor: "color-mix(in srgb, var(--danger) 38%, var(--border))", color: "var(--danger)" }}>
                    <span className="font-bold">שגיאת deployment: </span><code className="num">{deployment.error}</code>
                  </div>
                ) : null}
              </div>

              {finalApp ? (
                <div className="soft-panel p-4">
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                    <p className="text-sm font-bold muted">Final app URL verification</p>
                    <div className="flex flex-wrap gap-2">
                      <span className={`badge ${healthEvidenceBadgeClass(finalApp.ok, finalApp.authBlocked)}`}>{healthEvidenceLabel(finalApp.ok, finalApp.authBlocked)}</span>
                      {hasNumber(finalAppStatus) ? <span className="badge badge-neutral">HTTP {finalAppStatus}</span> : null}
                    </div>
                  </div>
                  {finalAppUrl ? <a className="num block max-w-full truncate text-xs" href={finalAppUrl} target="_blank" rel="noreferrer" title={finalAppUrl}>{finalAppUrl}</a> : <p className="muted">-</p>}
                  {finalAppStatusText ? <p className="mt-2 text-xs muted">{finalAppStatusText}</p> : null}
                  {finalApp.error ? <code className="num mt-3 block max-w-full truncate text-xs" style={{ color: "var(--danger)" }} title={finalApp.error}>{finalApp.error}</code> : null}
                </div>
              ) : null}

              {postHealth ? (
                <div className="soft-panel p-4">
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold muted">Post-deploy health</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {postHealth.derivedHealthStatus ? <HealthBadge status={postHealth.derivedHealthStatus as any} /> : null}
                        {postHealth.status ? <span className={`badge ${verificationBadgeClass(postHealth.status)}`}>{verificationStatusLabel(postHealth.status)}</span> : null}
                        <span className="badge badge-neutral">{formatNumber(postHealthEvidence.length)} checks</span>
                      </div>
                    </div>
                    <span className="num text-xs muted">{formatDateTime(postHealth.checkedAt)}</span>
                  </div>
                  {postHealth.note ? <div className="mb-3 rounded-lg border p-3 text-sm" style={{ background: "var(--warning-soft)", color: "var(--warning)", borderColor: "var(--border)" }}>{postHealth.note}</div> : null}
                  {postHealth.error ? <code className="num mb-3 block max-w-full truncate text-xs" style={{ color: "var(--danger)" }} title={postHealth.error}>{postHealth.error}</code> : null}
                  <HealthEvidenceTable evidence={postHealthEvidence} />
                </div>
              ) : null}

              <div className="space-y-3">
                <h3 className="text-sm font-bold muted">קבצי Evidence</h3>
                <DeploymentEvidenceTable evidence={evidence} />
              </div>
            </div>
          );
        })() : null}

        {detailsDrawer?.type === "backup" ? (() => {
          const backup = detailsDrawer.backup;
          const sourceRows = backup.sourcePaths || [];
          const verificationRows = backup.verification?.evidence || [];
          const restoreRows = backup.restoreEvidence || [];
          return (
            <div className="space-y-5">
              <div className="soft-panel p-4">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="num text-sm font-bold">{backup.backupId}</p>
                    <p className="text-xs muted">{formatDateTime(backup.createdAt)}</p>
                  </div>
                  <span className="badge badge-neutral">{backup.status}</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <MobileMeta label="קבצים">{formatNumber(backup.filesCount)}</MobileMeta>
                  <MobileMeta label="גודל">{formatBytes(backup.sizeBytes)}</MobileMeta>
                  <MobileMeta label="שחזור">{backup.restoreStatus || "never-restored"}</MobileMeta>
                  <MobileMeta label="נתיב">{backup.storagePath ? <code className="num block max-w-full truncate" title={backup.storagePath}>{backup.storagePath}</code> : "-"}</MobileMeta>
                </div>
                {backup.lastRestoreError ? <code className="num mt-3 block max-w-full truncate text-xs" style={{ color: "var(--danger)" }} title={backup.lastRestoreError}>{backup.lastRestoreError}</code> : null}
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-bold muted">Source paths</h3>
                {sourceRows.length ? (
                  <DataTable
                    columns={[
                      { key: "path", header: "Path", render: (row: any) => <code className="num block max-w-[420px] truncate text-xs muted" title={row.path}>{row.path}</code> },
                      { key: "exists", header: "מצב", render: (row: any) => <span className={`badge ${row.exists ? "badge-success" : "badge-danger"}`}>{row.exists ? "קיים" : "חסר"}</span> },
                      { key: "size", header: "גודל", render: (row: any) => <span className="num">{formatOptionalBytes(row.sourceSizeBytes)}</span> },
                      { key: "error", header: "שגיאה", render: (row: any) => row.error ? <code className="num block max-w-[220px] truncate text-xs" style={{ color: "var(--danger)" }} title={row.error}>{row.error}</code> : <span className="muted">-</span> }
                    ]}
                    rows={sourceRows}
                    rowKey={(row, index) => `${row.path || "source"}-${index}`}
                    minWidth={860}
                    mobileCard={(row) => (
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <code className="num block min-w-0 max-w-full truncate text-xs muted" title={row.path}>{row.path}</code>
                          <span className={`badge shrink-0 ${row.exists ? "badge-success" : "badge-danger"}`}>{row.exists ? "קיים" : "חסר"}</span>
                        </div>
                        {row.error ? <code className="num block max-w-full truncate text-xs" style={{ color: "var(--danger)" }} title={row.error}>{row.error}</code> : null}
                      </div>
                    )}
                  />
                ) : <EmptyState title="אין Source paths" description="לא נשמר פירוט מקור לגיבוי הזה." />}
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-bold muted">Verification evidence</h3>
                {verificationRows.length ? (
                  <DataTable
                    columns={[
                      { key: "status", header: "סטטוס", render: (row: any) => <span className={`badge ${row.status === "verified" ? "badge-success" : "badge-danger"}`}>{row.status}</span> },
                      { key: "source", header: "Source", render: (row: any) => <code className="num block max-w-[300px] truncate text-xs muted" title={row.sourcePath}>{row.sourcePath}</code> },
                      { key: "target", header: "Backup", render: (row: any) => <code className="num block max-w-[300px] truncate text-xs muted" title={row.targetPath}>{row.targetPath}</code> },
                      { key: "size", header: "Size", render: (row: any) => <span className={`badge ${matchBadgeClass(row.sizeMatches)}`}>{matchLabel(row.sizeMatches)}</span> },
                      { key: "sha", header: "SHA", render: (row: any) => <span className={`badge ${matchBadgeClass(row.sha256Matches)}`}>{matchLabel(row.sha256Matches)}</span> },
                      { key: "error", header: "שגיאה", render: (row: any) => row.error ? <code className="num block max-w-[220px] truncate text-xs" style={{ color: "var(--danger)" }} title={row.error}>{row.error}</code> : <span className="muted">-</span> }
                    ]}
                    rows={verificationRows}
                    rowKey={(row, index) => `${row.sourcePath || "verify"}-${index}`}
                    minWidth={1080}
                    mobileCard={(row) => (
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <code className="num block min-w-0 max-w-full truncate text-xs muted" title={row.targetPath}>{row.targetPath}</code>
                          <span className={`badge shrink-0 ${row.status === "verified" ? "badge-success" : "badge-danger"}`}>{row.status}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className={`badge ${matchBadgeClass(row.sizeMatches)}`}>size {matchLabel(row.sizeMatches)}</span>
                          <span className={`badge ${matchBadgeClass(row.sha256Matches)}`}>sha {matchLabel(row.sha256Matches)}</span>
                        </div>
                        {row.error ? <code className="num block max-w-full truncate text-xs" style={{ color: "var(--danger)" }} title={row.error}>{row.error}</code> : null}
                      </div>
                    )}
                  />
                ) : <EmptyState title="אין Verification evidence" description="לא נשמרו תוצאות אימות לגיבוי הזה." />}
              </div>

              {restoreRows.length ? (
                <div className="space-y-3">
                  <h3 className="text-sm font-bold muted">ראיות שחזור</h3>
                  <DataTable
                    columns={[
                      { key: "status", header: "סטטוס", render: (row: any) => <span className={`badge ${row.status === "verified" ? "badge-success" : "badge-danger"}`}>{row.status}</span> },
                      { key: "backup", header: "Backup", render: (row: any) => <code className="num block max-w-[280px] truncate text-xs muted" title={row.backupPath}>{row.backupPath}</code> },
                      { key: "target", header: "Target", render: (row: any) => <code className="num block max-w-[280px] truncate text-xs muted" title={row.targetPath}>{row.targetPath}</code> },
                      { key: "size", header: "Size", render: (row: any) => <span className={`badge ${matchBadgeClass(row.sizeMatches)}`}>{matchLabel(row.sizeMatches)}</span> },
                      { key: "sha", header: "SHA", render: (row: any) => <span className={`badge ${matchBadgeClass(row.sha256Matches)}`}>{matchLabel(row.sha256Matches)}</span> }
                    ]}
                    rows={restoreRows}
                    rowKey={(row, index) => `${row.backupPath || "restore"}-${index}`}
                    minWidth={960}
                    mobileCard={(row) => (
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <code className="num block min-w-0 max-w-full truncate text-xs muted" title={row.targetPath}>{row.targetPath}</code>
                          <span className={`badge shrink-0 ${row.status === "verified" ? "badge-success" : "badge-danger"}`}>{row.status}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className={`badge ${matchBadgeClass(row.sizeMatches)}`}>size {matchLabel(row.sizeMatches)}</span>
                          <span className={`badge ${matchBadgeClass(row.sha256Matches)}`}>sha {matchLabel(row.sha256Matches)}</span>
                        </div>
                      </div>
                    )}
                  />
                </div>
              ) : null}
            </div>
          );
        })() : null}

        {detailsDrawer?.type === "job" ? (
          <div className="space-y-5">
            <div className="soft-panel p-4">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold">{jobTypeLabel(detailsDrawer.job.type)}</p>
                  <p className="num text-xs muted">{detailsDrawer.job._id}</p>
                </div>
                <span className={`badge ${detailsDrawer.job.status === "failed" ? "badge-danger" : detailsDrawer.job.status === "succeeded" ? "badge-success" : "badge-info"}`}>{jobStatusLabel(detailsDrawer.job.status)}</span>
              </div>
              <div className="progress-track"><div className="progress-fill" style={{ width: `${detailsDrawer.job.progressPercent || 0}%` }} /></div>
              {detailsDrawer.job.errorMessage ? <code className="num mt-3 block max-w-full truncate text-xs" style={{ color: "var(--danger)" }} title={detailsDrawer.job.errorMessage}>{detailsDrawer.job.errorMessage}</code> : null}
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold muted">Logs</h3>
              {detailsDrawer.job.logs?.length ? detailsDrawer.job.logs.map((log, index) => (
                <div key={`${log.at}-${index}`} className="soft-panel p-3">
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                    <span className="badge badge-neutral">{log.level}</span>
                    <span className="num text-xs muted">{formatDateTime(log.at)}</span>
                  </div>
                  <p className="text-sm">{log.message}</p>
                </div>
              )) : <EmptyState title="אין Logs" description="לא נשמרו שורות לוג עבור ה־Job הזה." />}
            </div>
            <div className="space-y-3">
              <h3 className="text-sm font-bold muted">Evidence / Result</h3>
              <JsonBlock value={{ evidence: detailsDrawer.job.evidence, result: detailsDrawer.job.result, approval: detailsDrawer.job.approvalSnapshot }} />
            </div>
          </div>
        ) : null}

        {detailsDrawer?.type === "audit" ? (
          <div className="space-y-4">
            <div className="soft-panel p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold">{detailsDrawer.row.action}</p>
                  <p className="num text-xs muted">{detailsDrawer.row.requestId || "-"}</p>
                </div>
                <span className={`badge ${detailsDrawer.row.result === "failure" ? "badge-danger" : "badge-success"}`}>{detailsDrawer.row.result}</span>
              </div>
            </div>
            <JsonBlock value={detailsDrawer.row} />
          </div>
        ) : null}
      </DetailsDrawer>

      <ConfirmDialog
        open={confirmArchive}
        title="להעביר לארכיון?"
        description="הפעולה מסמנת את הרשומה כבארכיון ב־Hub בלבד. לא מתבצע שינוי ב־SharePoint."
        confirmLabel="העבר לארכיון"
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
