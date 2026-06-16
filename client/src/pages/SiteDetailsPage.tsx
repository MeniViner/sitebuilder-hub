import { useEffect, useMemo, useState } from "react";
import { ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Archive, ClipboardList, DatabaseBackup, Edit3, ExternalLink, Eye, FileClock, FolderInput, GitBranch, ListChecks, MessageSquareText, MoreHorizontal, RefreshCcw, Rocket, ShieldCheck, Users, Workflow } from "lucide-react";
import { Backup, BackupPlan, DeploymentVerificationEvidence, Job, PermissionsSetupPlan, SharePointHealthEvidence, SharePointHealthResult, SiteBootstrapPlan, SiteDeployment, SiteOperationsSummary, SiteProvisionPlan, sitesApi } from "../api/sitesApi";
import { Site, SiteHealth } from "../types/site";
import { ConfirmDialog } from "../components/ConfirmDialog";
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
import { PageHeader } from "../components/PageHeader";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { VersionBadge } from "../components/VersionBadge";
import type { HelpContentKey } from "../help/helpContent";
import { formatBytes, formatDateTime, formatMb, formatNumber, jobStatusLabel, jobTypeLabel } from "../utils/format";

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
  <pre className="num max-h-[420px] overflow-auto rounded-lg border p-3 text-xs" style={{ borderColor: "var(--border)", background: "var(--surface-muted)", color: "var(--text-strong)" }}>
    {formatJson(value)}
  </pre>
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
    header: "Target path",
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
  const paths = site?.resolvedPaths;
  const jobs = (summary?.recent.jobs || []) as Job[];
  const backups = summary?.recent.backups || [];
  const deployments: SiteDeployment[] = summary?.recent.deployments || [];
  const bootstrapStepsCount = bootstrapPlan?.summary?.totalSteps ?? bootstrapPlan?.steps?.length ?? 0;
  const bootstrapBlockers = bootstrapPlan?.blockers || [];
  const bootstrapBlockersCount = bootstrapBlockers.length;
  const bootstrapTargetUrl = bootstrapPlan?.targetWeb?.sharePointSiteUrl || site?.sharePointSiteUrl || "";
  const bootstrapReady = bootstrapPlan?.summary?.readyForBootstrapExecution ?? (bootstrapBlockersCount === 0);
  const adminSources = useMemo(() => [
    { label: "TXT admins", rows: adminData?.txtAdmins || [] },
    { label: "Site Collection Admins", rows: adminData?.siteCollectionAdmins || [] },
    { label: "Owners Group", rows: adminData?.ownersGroupAdmins || [] }
  ], [adminData]);
  const calculatedAdminsCount = useMemo(() => {
    const keys = new Set<string>();
    adminSources.forEach((source) => {
      source.rows.forEach((admin: any) => {
        const key = String(admin.personalNumber || admin.email || admin.loginName || admin.displayName || "").trim().toLowerCase();
        if (key) keys.add(key);
      });
    });
    return keys.size;
  }, [adminSources]);
  const adminsDisplayCount = adminData
    ? Math.max(Number(adminData.adminsCount || 0), calculatedAdminsCount)
    : Number(site?.adminsCount || 0);
  const adminsSourceLabel = adminData ? "Snapshot מנהלים" : "רשומת אתר";

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
    { key: "actor", header: "Actor", helpKey: "sharepoint.currentUser", render: (row) => row.actor?.userName || row.actor?.userId || "-" },
    { key: "created", header: "תאריך", helpKey: "history", render: (row) => <span className="num text-xs">{formatDateTime(row.createdAt)}</span> },
    { key: "request", header: "Request ID", helpKey: "audit.evidence", render: (row) => <span className="num text-xs muted">{row.requestId || "-"}</span> },
    {
      key: "actions",
      header: "Payload",
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

  if (loading) return <LoadingState label="טוען פרטי אתר..." />;
  if (error && !site) return <ErrorState message={error} onRetry={load} />;
  if (!site) return <EmptyState title="האתר לא נמצא" description="לא נמצאה רשומה מתאימה ב־Hub." />;

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
            <KpiCard title="גרסה" value={site.currentVersion || site.version || "-"} icon={<GitBranch size={18} />} description={`יעד: ${site.targetVersion || site.latestKnownVersion || "-"}`} tone={site.versionStatus === "outdated" ? "warning" : "info"} helpKey="version.current" />
            <KpiCard title="נפח" value={formatMb(site.storageMb)} icon={<DatabaseBackup size={18} />} description={`${formatNumber(site.filesCount || 0)} קבצים רשומים`} tone="neutral" helpKey="storage" />
            <KpiCard title="מנהלים" value={formatNumber(adminsDisplayCount)} icon={<Users size={18} />} description={`${adminsSourceLabel} · סנכרון: ${site.adminSyncStatus || "לא ידוע"}`} tone="info" helpKey="site.admins" />
            <KpiCard title="גיבויים" value={formatNumber(site.backupCount || 0)} icon={<DatabaseBackup size={18} />} description={`אחרון: ${formatDateTime(site.lastBackupAt)}`} tone="neutral" helpKey="backup" />
          </div>

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

            <SectionCard title="Operations / Bootstrap" subtitle="תכנון read-only והרצת Bootstrap לאתר SharePoint" helpKey="site.bootstrap">
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
                    <KpiCard title="צעדים" value={formatNumber(bootstrapStepsCount)} icon={<ListChecks size={18} />} tone="info" helpKey="site.bootstrap" />
                    <KpiCard title="חסמים" value={formatNumber(bootstrapBlockersCount)} icon={<ShieldCheck size={18} />} tone={bootstrapReady ? "success" : "warning"} helpKey="deploy.blocker" />
                    <KpiCard title="כתיבה" value={writeAvailable ? "זמין" : "לא זמין"} icon={<Workflow size={18} />} tone={writeAvailable ? "success" : "warning"} helpKey="sharepoint.write" />
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
            <HealthChecklist health={site.health} />
          </SectionCard>
          <SectionCard title="בדיקות" subtitle="בדיקה ידנית או קריאה בלבד מול SharePoint" helpKey="health.readOnly">
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
            {writeAvailable ? <span className="badge badge-success">deploy מחובר ל־SharePoint</span> : <span className="badge badge-info">Browser SharePoint deploy</span>}
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
        <SectionCard title="גיבויים" subtitle="תכנון גיבוי הוא read-only; ביצוע גיבוי דורש כתיבה מוגדרת" helpKey="backup">
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
        <SectionCard title="מנהלים" subtitle="מקורות: TXT, Site Collection Admins ו־Owners Group" helpKey="site.admins">
          <div className="mb-4 flex flex-wrap gap-2">
            <MetadataOnlyBadge mode="metadata" />
            <MetadataOnlyBadge mode="readonly" />
            <Link className="btn btn-secondary" to="/admins">פתח את מסך המנהלים</Link>
          </div>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard title="מנהלים ייחודיים" value={formatNumber(adminsDisplayCount)} icon={<Users size={18} />} description={adminsSourceLabel} tone="info" variant="inline" helpKey="site.admins" />
            <KpiCard title="TXT admins" value={formatNumber(adminSources[0].rows.length)} icon={<Users size={18} />} description="users_data.txt / Snapshot" tone="neutral" variant="inline" helpKey="site.txtAdmins" />
            <KpiCard title="Site Collection" value={formatNumber(adminSources[1].rows.length)} icon={<Users size={18} />} description="SharePoint siteusers" tone="neutral" variant="inline" helpKey="site.siteCollectionAdmins" />
            <KpiCard title="Owners Group" value={formatNumber(adminSources[2].rows.length)} icon={<Users size={18} />} description="Associated owners group" tone="neutral" variant="inline" helpKey="site.ownersGroup" />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {adminSources.map(({ label, rows }) => (
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
                    <MobileMeta label="Actor" helpKey="sharepoint.currentUser">{row.actor?.userName || row.actor?.userId || "-"}</MobileMeta>
                    <MobileMeta label="Request ID" helpKey="audit.evidence"><span className="num">{row.requestId || "-"}</span></MobileMeta>
                  </div>
                  <button className="btn btn-secondary w-full" onClick={() => setDetailsDrawer({ type: "audit", row })} type="button"><Eye size={14} />Payload</button>
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
            <p className="mb-2 font-bold" style={{ color: "var(--danger)" }}>Danger zone</p>
            <p className="mb-3 text-sm muted">העברה לארכיון מסמנת את האתר ב־Hub בלבד ולא מוחקת קבצים מ־SharePoint.</p>
            <button className="btn btn-danger w-full" onClick={() => { setActionsOpen(false); setConfirmArchive(true); }} type="button"><Archive size={16} />העבר לארכיון</button>
          </div>
        </div>
      </DetailsDrawer>

      <DetailsDrawer
        open={Boolean(detailsDrawer)}
        title={
          detailsDrawer?.type === "deployment" ? "Deployment evidence" :
          detailsDrawer?.type === "backup" ? "פרטי גיבוי" :
          detailsDrawer?.type === "job" ? "Job logs" :
          detailsDrawer?.type === "audit" ? "Audit payload" :
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
                  <MobileMeta label="Restore">{backup.restoreStatus || "never-restored"}</MobileMeta>
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
                  <h3 className="text-sm font-bold muted">Restore evidence</h3>
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
