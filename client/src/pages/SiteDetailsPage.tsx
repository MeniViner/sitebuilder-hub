import { useCallback, useEffect, useMemo, useState } from "react";
import { ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Archive, ClipboardList, DatabaseBackup, ExternalLink, Eye, FolderInput, GitBranch, ListChecks, MessageSquareText, RefreshCcw, Rocket, ShieldCheck, Users, Workflow } from "lucide-react";
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
import { AdvancedDetails } from "../components/OperationalSummary";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { VersionBadge } from "../components/VersionBadge";
import type { HelpContentKey } from "../help/helpContent";
import { formatBytes, formatDateTime, formatNumber, jobStatusLabel, jobTypeLabel } from "../utils/format";
import { runBrowserSharePointBackupOperation } from "../utils/sharepointBrowserOperationRunner";
import {
  buildBrowserSharePointBackupPlan,
  deployArtifactToSharePointBrowser,
  ensureSharePointFolderHierarchyBrowser,
  runBrowserSharePointHealthCheck
} from "../utils/sharepointBrowserConnector";
import {
  deriveRequiredFoldersFromArtifactFilePaths,
  latestCompatibleRelease,
  manifestFilesForPlan
} from "../utils/artifactCompatibility";
import { buildDeploymentMetadataFile, DEPLOYMENT_METADATA_FILE, RUNTIME_CONFIG_FILE } from "../utils/deploymentMetadata";
import { resolveSiteBuilderPaths } from "../utils/sitebuilderPaths";
import {
  assertSiteDetailsActionEnabled,
  getSiteDetailsActionPolicy,
  getSiteDetailsStorageCopy,
  siteDetailsConnectorLabel,
  siteDetailsRiskLabel,
  type SiteDetailsActionPolicy
} from "../utils/siteDetailsActionPolicy";
import {
  runBrowserAdminTxtRepairOperation,
  readBrowserRuntimeConfig,
  readBrowserTxtSnapshotForMongoMigration,
  runBrowserMongoRuntimeConfigUpload,
  runBrowserSharePointBootstrapOperation,
  runBrowserSharePointPermissionsOperation,
  runBrowserSharePointProvisionOperation
} from "../utils/sharepointBrowserSiteOperations";
import { useBrowserAdminsLiveRead } from "../hooks/useBrowserAdminsLiveRead";
import { SAFE_READ_TTL_MS, useAutoSafeRead } from "../hooks/useAutoSafeRead";
import { useOperationalStatus } from "../components/OperationalStatusProvider";

type TabKey = "overview" | "deployment" | "recovery" | "access" | "health" | "hosting" | "activity" | "advanced";

type SiteDetailsDrawerState =
  | { type: "deployment"; deployment: SiteDeployment }
  | { type: "backup"; backup: Backup }
  | { type: "job"; job: Job }
  | { type: "audit"; row: any }
  | null;

const tabs: Array<{ key: TabKey; label: string; icon: ReactNode }> = [
  { key: "overview", label: "סקירה", icon: <ClipboardList size={15} /> },
  { key: "deployment", label: "פריסה וגרסאות", icon: <GitBranch size={15} /> },
  { key: "recovery", label: "גיבויים ושחזור", icon: <DatabaseBackup size={15} /> },
  { key: "access", label: "גישה ומנהלים", icon: <Users size={15} /> },
  { key: "health", label: "תקינות וחיבורים", icon: <ShieldCheck size={15} /> },
  { key: "hosting", label: "אירוח ונתיבים", icon: <FolderInput size={15} /> },
  { key: "activity", label: "פעילות ויומן", icon: <Workflow size={15} /> },
  { key: "advanced", label: "הגדרות מתקדמות", icon: <MessageSquareText size={15} /> }
];

const legacyTabMap: Record<string, TabKey> = {
  paths: "hosting",
  versions: "deployment",
  backups: "recovery",
  admins: "access",
  jobs: "activity",
  audit: "activity",
  notes: "advanced"
};

const deploymentKindLabel = (kind?: SiteDeployment["deploymentKind"]) => {
  if (kind === "rollback") return "חזרה לגרסה קודמת";
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

const auditResultLabel = (result?: string) => {
  const labels: Record<string, string> = {
    success: "הצליח",
    failure: "נכשל"
  };
  return labels[result || ""] || result || "-";
};

const backupCapabilityStatusLabel = (status?: string) => {
  const labels: Record<string, string> = {
    ready: "מוכן",
    blocked: "חסום",
    error: "שגיאה",
    missing: "חסר",
    succeeded: "הצליח",
    failed: "נכשל",
    running: "רץ",
    queued: "בתור",
    idle: "לא פעיל",
    unknown: "לא ידוע"
  };
  return labels[status || ""] || status || "לא ידוע";
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

type SiteDetailsRow = {
  label: string;
  value?: string;
  isUrl?: boolean;
  description?: string;
};

function SiteInfoRow({ label, value, isUrl, description }: SiteDetailsRow) {
  return <LinkRow label={label} value={value} isUrl={isUrl} description={description} showCopy={false} />;
}

function SiteDetailsScrollRegion({
  label,
  variant = "default",
  children
}: {
  label: string;
  variant?: "default" | "compact" | "tall";
  children: ReactNode;
}) {
  return (
    <div className={`site-details-scroll-region site-details-scroll-region-${variant}`} aria-label={label} tabIndex={0}>
      {children}
    </div>
  );
}

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
    header: "גודל",
    helpKey: "artifact.validation",
    render: (item) => (
      <div className="space-y-2">
        <span className={`badge ${matchBadgeClass(item.sizeMatches)}`}>גודל {matchLabel(item.sizeMatches)}</span>
        <div className="num text-xs muted">צפוי {formatOptionalBytes(item.expectedSizeBytes)}</div>
        <div className="num text-xs muted">בפועל {formatOptionalBytes(item.actualSizeBytes)}</div>
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
        {item.expectedSha256 ? <code className="num block max-w-[220px] truncate text-xs muted" title={item.expectedSha256}>צפוי {compactValue(item.expectedSha256, 12, 8)}</code> : null}
        {item.actualSha256 ? <code className="num block max-w-[220px] truncate text-xs muted" title={item.actualSha256}>בפועל {compactValue(item.actualSha256, 12, 8)}</code> : null}
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
    return <EmptyState title="אין ראיות להצגה" description="לא נשמרו שורות אימות עבור הפריסה הזאת." />;
  }

  return (
    <SiteDetailsScrollRegion label="ראיות אימות פריסה" variant="compact">
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
              <MobileMeta label="גודל"><span className={`badge ${matchBadgeClass(item.sizeMatches)}`}>{matchLabel(item.sizeMatches)}</span></MobileMeta>
              <MobileMeta label="SHA"><span className={`badge ${matchBadgeClass(item.sha256Matches)}`}>{matchLabel(item.sha256Matches)}</span></MobileMeta>
              <MobileMeta label="HTTP">{item.httpStatus ? `HTTP ${item.httpStatus}` : "-"}</MobileMeta>
              <MobileMeta label="נבדק">{formatDateTime(item.checkedAt)}</MobileMeta>
            </div>
            {item.error ? <code className="num block max-w-full truncate text-xs" style={{ color: "var(--danger)" }} title={item.error}>{item.error}</code> : null}
          </div>
        )}
      />
    </SiteDetailsScrollRegion>
  );
}

function HealthEvidenceTable({ evidence }: { evidence: SharePointHealthEvidence[] }) {
  if (!evidence.length) {
    return <EmptyState title="אין ראיות אימות להצגה" description="לא נשמרו תוצאות מפורטות לבדיקה הזו." />;
  }

  return (
    <SiteDetailsScrollRegion label="ראיות בדיקות תקינות" variant="compact">
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
    </SiteDetailsScrollRegion>
  );
}

type WorkspaceTone = "success" | "warning" | "danger" | "info" | "neutral";

type WorkspaceAction = {
  key: string;
  label: string;
  description: string;
  connector: string;
  risk: string;
  enabled: boolean;
  disabledReason?: string;
  lastRun?: string;
  onClick?: () => void;
};

type WorkspaceActionGroup = {
  title: string;
  description: string;
  actions: WorkspaceAction[];
};

type ReadinessItem = {
  key: string;
  label: string;
  status: string;
  tone: WorkspaceTone;
  lastChecked?: string;
  connector?: string;
  detail?: string;
};

const toneBadgeClass = (tone: WorkspaceTone) => {
  if (tone === "success") return "badge-success";
  if (tone === "warning") return "badge-warning";
  if (tone === "danger") return "badge-danger";
  if (tone === "info") return "badge-info";
  return "badge-neutral";
};

const panelToneStyle = (tone: WorkspaceTone) => ({
  background: tone === "danger"
    ? "var(--danger-soft)"
    : tone === "warning"
      ? "var(--warning-soft)"
      : "var(--surface-muted)",
  borderColor: "var(--border)"
});

function ConnectorRiskToken({ connector, risk, enabled = true }: { connector: string; risk: string; enabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      <span className={`badge ${enabled ? "badge-info" : "badge-neutral"}`}>{connector}</span>
      <span className={`badge ${risk.includes("משנה") || risk.includes("רגישה") ? "badge-warning" : "badge-neutral"}`}>{risk}</span>
    </div>
  );
}

function StorageAwareStatusToken({ label, tone }: { label: string; tone: WorkspaceTone }) {
  return <span className={`badge ${toneBadgeClass(tone)}`}>{label}</span>;
}

function SiteWorkspaceHeader({
  site,
  paths,
  storageLabel,
  storageDescription,
  sourceTone,
  nextAction,
  secondaryActions,
  onRefresh
}: {
  site: Site;
  paths?: Site["resolvedPaths"];
  storageLabel: string;
  storageDescription: string;
  sourceTone: WorkspaceTone;
  nextAction: WorkspaceAction;
  secondaryActions: WorkspaceActionGroup[];
  onRefresh: () => void;
}) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const finalUrl = site.finalAppUrl || paths?.finalAppUrl || site.sharePointSiteUrl;
  const sharePointUrl = paths?.sharePointSiteUrl || site.sharePointSiteUrl;
  return (
    <section className="site-details-header surface-card">
      <div className="site-details-header-main">
        <div className="site-details-identity">
          <p className="site-details-eyebrow">סביבת עבודה לאתר</p>
          <div className="site-details-title-row">
            <h1>{site.displayName}</h1>
            <div className="site-details-header-actions">
              {finalUrl ? <a className="btn btn-secondary" href={finalUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} />פתח אתר פעיל</a> : null}
              <button className="btn btn-secondary" onClick={onRefresh} type="button"><RefreshCcw size={15} />רענן</button>
            </div>
          </div>
          <div className="site-details-meta-strip">
            <span>קוד אתר: <b>{site.siteCode}</b></span>
            <span>סביבה: <b>{site.environment || "לא ידוע"}</b></span>
            <span>בעלים: <b>{site.ownerName || "-"}</b></span>
            <span>יחידה: <b>{site.unitName || "-"}</b></span>
            <StatusBadge status={site.status} />
            <HealthBadge status={site.derivedHealthStatus} />
          </div>
          <SourceOfTruthBanner label={storageLabel} description={storageDescription} tone={sourceTone} />
          <div className="site-details-link-strip">
            {finalUrl ? <a href={finalUrl} target="_blank" rel="noreferrer">כתובת האתר הפעיל</a> : null}
            {sharePointUrl ? <a href={sharePointUrl} target="_blank" rel="noreferrer">אתר SharePoint מארח</a> : null}
          </div>
        </div>

        <div className="site-details-command-panel">
          <SiteNextActionPanel action={nextAction} />
          <div className={`secondary-actions-panel ${actionsOpen ? "secondary-actions-panel-open" : ""}`}>
            <button
              aria-expanded={actionsOpen}
              className="secondary-actions-trigger"
              onClick={() => setActionsOpen((current) => !current)}
              type="button"
            >
              <span>
                <strong>פעולות משניות</strong>
                <small>מקובצות לפי סיכון ומקור הרצה</small>
              </span>
              <span className="badge badge-neutral">{secondaryActions.reduce((total, group) => total + group.actions.length, 0)}</span>
            </button>
            {actionsOpen ? (
              <ActionCommandList groups={secondaryActions} density="compact" />
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function SourceOfTruthBanner({ label, description, tone }: { label: string; description: string; tone: WorkspaceTone }) {
  return (
    <div className={`source-of-truth-banner source-of-truth-banner-${tone}`}>
      <div className="min-w-0">
        <p>{label}</p>
        <span>{description}</span>
      </div>
      <StorageAwareStatusToken label={tone === "warning" ? "דורש זיהוי" : "מזוהה"} tone={tone} />
    </div>
  );
}

function ActionStatusBadge({ action }: { action: WorkspaceAction }) {
  if (action.disabledReason) return <span className="badge badge-warning">חסום</span>;
  if (!action.enabled) return <span className="badge badge-neutral">לא זמין</span>;
  return <span className="badge badge-success">זמין</span>;
}

function ActionCommandList({
  groups,
  density = "normal"
}: {
  groups: WorkspaceActionGroup[];
  density?: "normal" | "compact";
}) {
  return (
    <div className={`action-command-list action-command-list-${density}`}>
      {groups.map((group) => (
        <section className="action-command-group" key={group.title}>
          <header>
            <h3>{group.title}</h3>
            <p>{group.description}</p>
          </header>
          <div className="action-command-table" role="table" aria-label={group.title}>
            <div className="action-command-row action-command-head" role="row">
              <span>פעולה</span>
              <span>מה הפעולה עושה</span>
              <span>אופן הרצה</span>
              <span>סיכון</span>
              <span>מצב</span>
              <span>פעולה</span>
            </div>
            {group.actions.map((action) => (
              <div className="action-command-row" key={action.key} role="row">
                <div className="action-command-primary">
                  <strong>{action.label}</strong>
                  {action.lastRun ? <small className="num">ריצה אחרונה: {action.lastRun}</small> : null}
                </div>
                <p title={action.description}>{action.description}</p>
                <span>{action.connector}</span>
                <span className={`risk-token ${action.risk.includes("משנה") || action.risk.includes("רגישה") ? "risk-token-write" : ""}`}>{action.risk}</span>
                <div>
                  <ActionStatusBadge action={action} />
                  {action.disabledReason ? <small title={action.disabledReason}>{action.disabledReason}</small> : null}
                </div>
                <button className="btn btn-secondary action-command-button" disabled={!action.enabled} onClick={action.onClick} type="button">
                  {action.enabled ? "בצע" : "חסום"}
                </button>
              </div>
            ))}
            </div>
        </section>
      ))}
    </div>
  );
}

function SiteReadinessStrip({ items }: { items: ReadinessItem[] }) {
  return (
    <section className="site-readiness-strip surface-card">
      <div className="site-readiness-header">
        <div>
          <h2>מוכנות האתר</h2>
          <p>סטטוסים קצרים לפי תלות, מקור נתונים ואופן בדיקה.</p>
        </div>
      </div>
      <div className="site-readiness-grid">
        {items.map((item) => (
          <div key={item.key} className="site-readiness-item">
            <div>
              <p>{item.label}</p>
              <span className={`badge shrink-0 ${toneBadgeClass(item.tone)}`}>{item.status}</span>
            </div>
            {item.lastChecked ? <small className="num">נבדק: {item.lastChecked}</small> : <small>לא נבדק לאחרונה</small>}
            {item.connector ? <small>{item.connector}</small> : null}
            {item.detail ? <strong title={item.detail}>{item.detail}</strong> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function SiteNextActionPanel({ action }: { action: WorkspaceAction }) {
  return (
    <div className="rounded-lg border p-4" style={panelToneStyle(action.enabled ? "info" : "warning")}>
      <p className="text-xs font-bold muted">הפעולה הבטוחה הבאה</p>
      <h2 className="mt-1 text-lg font-bold" style={{ color: "var(--text-strong)", textWrap: "balance" }}>{action.label}</h2>
      <p className="mt-2 text-sm muted">{action.description}</p>
      <div className="mt-3">
        <ConnectorRiskToken connector={action.connector} risk={action.risk} enabled={action.enabled} />
      </div>
      <button className="btn btn-primary mt-4 w-full" disabled={!action.enabled} title={action.disabledReason || action.description} onClick={action.onClick} type="button">
        {action.label}
      </button>
      {action.disabledReason ? <p className="mt-2 text-xs muted">{action.disabledReason}</p> : null}
    </div>
  );
}

function SiteActionCenter({ groups }: { groups: WorkspaceActionGroup[] }) {
  return (
    <SectionCard title="מרכז פעולות לאתר" subtitle="פעולות זמינות לפי סוג סיכון ומקור נתונים" helpKey="operations">
      <ActionCommandList groups={groups} />
    </SectionCard>
  );
}

function SiteDependencyCard({
  title,
  status,
  tone,
  connector,
  lastChecked,
  nextAction,
  children
}: {
  title: string;
  status: string;
  tone: WorkspaceTone;
  connector: string;
  lastChecked?: string;
  nextAction: string;
  children: ReactNode;
}) {
  return (
    <div className="surface-card p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold" style={{ color: "var(--text-strong)" }}>{title}</h3>
          <p className="mt-1 text-xs muted">{connector}</p>
          {lastChecked ? <p className="num mt-1 text-xs muted">נבדק: {lastChecked}</p> : null}
        </div>
        <span className={`badge ${toneBadgeClass(tone)}`}>{status}</span>
      </div>
      <div className="space-y-2">{children}</div>
      <p className="mt-3 rounded-md border p-2 text-xs muted" style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}>פעולה בטוחה הבאה: {nextAction}</p>
    </div>
  );
}

function PathGroup({ title, description, rows }: { title: string; description: string; rows: SiteDetailsRow[] }) {
  const visibleRows = rows.filter((row) => row.value);
  if (!visibleRows.length) return null;
  return (
    <SectionCard title={title} subtitle={description} helpKey="site.finalDistPath">
      <div className="site-path-list">
        {visibleRows.map((row) => <LinkRow key={row.label} {...row} copyMode="icon" />)}
      </div>
    </SectionCard>
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
  const operationalStatus = useOperationalStatus();

  const load = useCallback(async () => {
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
  }, [id]);

  useEffect(() => { load(); }, [id]);

  const requestedTab = searchParams.get("tab");
  const normalizedRequestedTab = requestedTab && (legacyTabMap[requestedTab] || requestedTab);
  const activeTab: TabKey = normalizedRequestedTab && tabs.some((tab) => tab.key === normalizedRequestedTab) ? normalizedRequestedTab as TabKey : "overview";
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
    auto: activeTab === "access",
    onPersisted: (adminSummary) => {
      if (!adminSummary) return;
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
  const adminsDisplayCount = adminLiveData?.adminsCount ?? adminData?.adminsCount ?? Number(site?.adminsCount || 0);
  const adminsSourceLabel = adminLiveData ? "נמשך מ־SharePoint דרך הדפדפן" : adminData ? "Snapshot" : "רשומת אתר";

  const pathRows = useMemo(() => {
    if (!site) return [];
    const copy = getSiteDetailsStorageCopy(site.storageBackend);
    return [
      { label: "כתובת האתר הפעיל", value: paths?.finalAppUrl || site.finalAppUrl, isUrl: true, description: "כתובת ההפעלה הסופית מתוך siteDB/dist/index.html" },
      { label: "אתר SharePoint מארח", value: paths?.sharePointSiteUrl || site.sharePointSiteUrl, isUrl: true, description: "שורש אתר SharePoint המארח" },
      { label: "שורש אתר", value: paths?.siteRoot },
      { label: "ספריית siteDB", value: paths?.siteDbRoot || site.siteDbLibrary, description: "Document Library ראשית לאירוח וקבצי אתר" },
      { label: "ספריית משתמשים", value: paths?.usersDbRoot || site.usersDbLibrary, description: "Document Library לנתוני משתמשים/widgets או תאימות לפי סוג האתר" },
      { label: "ספריית נכסים", value: paths?.siteAssetsRoot },
      { label: "תיקיית dist", value: paths?.finalDistRoot },
      { label: "נתיב קובץ הגדרות טעינה", value: site.runtimeConfigPath || paths?.runtimeConfigPath },
      { label: "כתובת קובץ הגדרות טעינה", value: site.runtimeConfigUrl || paths?.runtimeConfigUrl, isUrl: true },
      { label: "נתיב master config TXT", value: paths?.txtFiles?.masterConfig, description: copy.txtPathDescription },
      { label: "נתיב users_data TXT", value: paths?.txtFiles?.users, description: copy.txtPathDescription },
      { label: "נתיב widgets_data TXT", value: paths?.txtFiles?.widgets, description: copy.txtPathDescription },
      { label: "שורש גיבויים", value: paths?.backupsRoot },
      { label: "כתובת הקמה", value: paths?.bootstrapUrl || site.bootstrapUrl, isUrl: true }
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
      header: "מזהה פעולה",
      helpKey: "job",
      render: (deployment) => deployment.jobId
        ? <code className="num block max-w-[150px] truncate text-xs muted" title={deployment.jobId}>פעולה {compactValue(deployment.jobId)}</code>
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
              {evidenceCount ? `${formatNumber(evidenceCount)} קבצים` : "אין ראיות"}
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
          <Eye size={13} />פתח ראיות אימות
        </button>
      )
    }
  ];

  const backupColumns: DataTableColumn<Backup>[] = [
    { key: "id", header: "מזהה גיבוי", helpKey: "backup", render: (backup) => <span className="num">{backup.backupId}</span> },
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
    { key: "result", header: "תוצאה", helpKey: "job.status", render: (row) => <span className={`badge ${row.result === "failure" ? "badge-danger" : "badge-success"}`}>{auditResultLabel(row.result)}</span> },
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

  const runBrowserHealthRead = useCallback(async () => {
    const currentSite = requireCurrentSite();
    operationalStatus.setBrowserSharePointRefreshing(true);
    try {
      const browserResult = await runBrowserSharePointHealthCheck(currentSite);
      setSharePointHealth(browserResult);
      await sitesApi.recordBrowserSharePointHealth(currentSite._id, browserResult);
      operationalStatus.recordBrowserSharePointHealth(browserResult);
      setMessage("בדיקת SharePoint דרך הדפדפן ללא שינוי הסתיימה ונשמרה");
      await load();
    } finally {
      operationalStatus.setBrowserSharePointRefreshing(false);
    }
  }, [load, operationalStatus, site]);

  const runBrowserRuntimeConfigRead = useCallback(async () => {
    const currentSite = requireCurrentSite();
    operationalStatus.setBrowserSharePointRefreshing(true);
    try {
      const browserEvidence = await readBrowserRuntimeConfig(currentSite);
      const result = await sitesApi.recordBrowserRuntimeConfigEvidence(currentSite._id, browserEvidence);
      setRuntimeConfigResult(result.data);
      operationalStatus.recordRuntimeConfigEvidence(result.data);
      setMessage(result.data.preservedLastGoodEvidence
        ? "קובץ הגדרות טעינה נשאר על הראיה הטובה האחרונה; הרענון הנוכחי נכשל ונשמר בנפרד"
        : "בדיקת קובץ הגדרות טעינה דרך הדפדפן הסתיימה");
      await load();
    } finally {
      operationalStatus.setBrowserSharePointRefreshing(false);
    }
  }, [load, operationalStatus, site]);

  const runBuilderMongoHealthRead = useCallback(async () => {
    const currentSite = requireCurrentSite();
    const result = await sitesApi.runMongoBackendHealth(currentSite._id);
    setMongoHealthResult(result.data);
    operationalStatus.recordBuilderMongoHealth(result.data);
    setMessage("בדיקת מקור נתונים Mongo דרך שרת Builder הסתיימה");
    await load();
  }, [load, operationalStatus, site]);

  const buildBackupPlanForCurrentSite = useCallback(async () => {
    const currentSite = requireCurrentSite();
    const plan = currentSite.storageBackend === "mongo"
      ? (await sitesApi.siteBackupPlan(currentSite._id)).data
      : await buildBrowserSharePointBackupPlan(currentSite);
    setBackupPlan(plan);
    setMessage(currentSite.storageBackend === "mongo"
      ? "תוכנית גיבוי Mongo נבנתה דרך שרת Builder"
      : "תוכנית גיבוי TXT דרך הדפדפן המחובר ל־SharePoint נוצרה");
  }, [site]);

  useAutoSafeRead({
    guardKey: site ? `site-details:browser-health:${site._id}` : "",
    checkedAt: site?.lastSharePointHostingVerificationAt || site?.lastHealthCheckAt,
    ttlMs: SAFE_READ_TTL_MS.siteEvidence,
    enabled: Boolean(site && (activeTab === "overview" || activeTab === "health")),
    inFlight: Boolean(busyAction),
    run: runBrowserHealthRead,
    onError: setError
  });

  useAutoSafeRead({
    guardKey: site ? `site-details:runtime-config:${site._id}` : "",
    checkedAt: site?.runtimeConfigStatus?.checkedAt || site?.lastRuntimeConfigCheckAt,
    ttlMs: SAFE_READ_TTL_MS.siteEvidence,
    enabled: Boolean(site && (activeTab === "overview" || activeTab === "health")),
    inFlight: Boolean(busyAction),
    run: runBrowserRuntimeConfigRead,
    onError: setError
  });

  useAutoSafeRead({
    guardKey: site ? `site-details:mongo-health:${site._id}` : "",
    checkedAt: site?.mongoBackendStatus?.checkedAt || site?.lastMongoHealthCheckAt,
    ttlMs: SAFE_READ_TTL_MS.builderMongoHealth,
    enabled: Boolean(site?.storageBackend === "mongo" && (activeTab === "overview" || activeTab === "health")),
    inFlight: Boolean(busyAction),
    run: runBuilderMongoHealthRead,
    onError: setError
  });

  useAutoSafeRead({
    guardKey: site ? `site-details:backup-plan:${site._id}` : "",
    checkedAt: site?.lastBackupAt,
    ttlMs: SAFE_READ_TTL_MS.siteEvidence,
    enabled: Boolean(site && activeTab === "recovery"),
    inFlight: Boolean(busyAction || backupPlan),
    run: buildBackupPlanForCurrentSite,
    onError: setError
  });

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
      finalAppUrl,
      storageBackend: plan.target?.storageBackend === "mongo" ? "mongo" : "txt",
      storageBackendSource: plan.target?.storageBackendSource || "safe-production-default",
      storageSiteId: plan.target?.storageSiteId || currentSite.siteCode,
      backendApiUrl: plan.target?.backendApiUrl || ""
    });
    const browserDeploy = await deployArtifactToSharePointBrowser({
      releaseId: release._id,
      siteId: currentSite._id,
      siteCode: currentSite.siteCode,
      targetSiteUrl,
      targetDistPath,
      finalAppUrl,
      files: [...deployFiles, ...deploymentMetadata.files],
      loadArtifactFile: (relativePath) => deploymentMetadata.responses[relativePath]
        ? Promise.resolve(deploymentMetadata.responses[relativePath])
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
      versionAfter: effectiveFinalStatus === "success" ? plan.releaseVersion : versionBefore,
      deploymentConfig: deploymentMetadata.snapshot
    });

    const indexVerified = browserDeploy.readBackEvidence.some((item) => item.relativePath === "index.html" && item.status === "verified" && item.sizeMatches && item.sha256Matches);
    const deploymentMetadataVerified = browserDeploy.readBackEvidence.some((item) => item.relativePath === DEPLOYMENT_METADATA_FILE && item.status === "verified" && item.sizeMatches && item.sha256Matches);
    const runtimeConfigVerified = browserDeploy.readBackEvidence.some((item) => item.relativePath === RUNTIME_CONFIG_FILE && item.status === "verified" && item.sizeMatches && item.sha256Matches);
    if (browserDeploy.finalStatus !== "success" || !finalAppUrlVerified || !indexVerified || !deploymentMetadataVerified || !runtimeConfigVerified) {
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
    assertSiteDetailsActionEnabled(currentSite.storageBackend, "site-provision-run");
    const queued = await sitesApi.queueSiteProvision(currentSite._id);
    setProvisionPlan(queued.data.plan);
    const evidence = await runBrowserSharePointProvisionOperation(currentSite);
    await sitesApi.recordBrowserSiteProvisionEvidence(currentSite._id, {
      ...evidence,
      jobId: queued.data.job._id
    });
    setMessage(evidence.finalStatus === "success" ? "הקמת תשתית אירוח הושלמה דרך הדפדפן ונשמרו ראיות אימות" : "הקמת תשתית אירוח נכשלה דרך הדפדפן; ראיות אימות נשמרו");
    await load();
  };

  const runPermissionsInBrowser = async () => {
    const currentSite = requireCurrentSite();
    assertSiteDetailsActionEnabled(currentSite.storageBackend, "permissions-setup-run");
    const queued = await sitesApi.queuePermissionsSetup(currentSite._id);
    setPermissionsPlan(queued.data.plan);
    const evidence = await runBrowserSharePointPermissionsOperation(currentSite);
    await sitesApi.recordBrowserPermissionsEvidence(currentSite._id, {
      ...evidence,
      jobId: queued.data.job._id
    });
    setMessage(evidence.finalStatus === "success" ? "שינוי הרשאות SharePoint הושלם דרך הדפדפן ונשמרו ראיות אימות" : "שינוי הרשאות SharePoint נכשל דרך הדפדפן; ראיות אימות נשמרו");
    await load();
  };

  const runBootstrapInBrowser = async () => {
    const currentSite = requireCurrentSite();
    assertSiteDetailsActionEnabled(currentSite.storageBackend, "site-bootstrap-run");
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
    setMessage(evidence.finalStatus === "success" ? "הקמת אירוח והרשאות הושלמה דרך הדפדפן ונשמרו ראיות אימות" : "הקמת אירוח והרשאות נכשלה דרך הדפדפן; ראיות אימות נשמרו");
    await load();
  };

  const runAdminTxtRepairInBrowser = async () => {
    const currentSite = requireCurrentSite();
    assertSiteDetailsActionEnabled(currentSite.storageBackend, "txt-admin-repair");
    const queued = await sitesApi.queueAdminTxtRepair(currentSite._id, "Admin TXT repair executed from site details through browser");
    const evidence = await runBrowserAdminTxtRepairOperation(currentSite, queued.data.plan, "Admin TXT repair from site details");
    await sitesApi.recordBrowserAdminTxtRepairEvidence(currentSite._id, {
      ...evidence,
      jobId: queued.data.job._id
    });
    setMessage(evidence.finalStatus === "success" ? "users_data.txt תוקן דרך הדפדפן ונשמרו ראיות אימות" : "תיקון users_data.txt נכשל דרך הדפדפן; ראיות אימות נשמרו");
    await load();
  };

  const runTxtToMongoMigrationInBrowser = async () => {
    const currentSite = requireCurrentSite();
    assertSiteDetailsActionEnabled(currentSite.storageBackend, "txt-to-mongo-migration");

    const snapshot = await readBrowserTxtSnapshotForMongoMigration(currentSite);
    const blockedFiles = snapshot.files.filter((file) => file.status !== "read" || file.parseStatus !== "json");
    if (blockedFiles.length) {
      setMigrationResult(null);
      throw new Error(`נכשל לקרוא TXT תקין לפני מיגרציה: ${blockedFiles.map((file) => file.fileName || file.key || file.sourcePath).join(", ")}`);
    }

    const migration = await sitesApi.migrateTxtToMongo(currentSite._id, snapshot);
    setMigrationResult(migration.data);
    if (migration.data.finalStatus === "failed") {
      throw new Error("ייבוא הנתונים ל־Mongo נכשל. פתחו יומן/ראיות אימות לפרטים.");
    }

    setMessage(`ייבוא TXT ל־Mongo הושלם עבור ${migration.data.import.written.length} קבצים. האתר נשאר על TXT; הפעלת Mongo היא פעולת סביבה ופריסה נפרדת.`);
    setActiveTab("deployment");
    await load();
  };

  if (loading) return <LoadingState label="טוען פרטי אתר..." />;
  if (error && !site) return <ErrorState message={error} onRetry={load} />;
  if (!site) return <EmptyState title="האתר לא נמצא" description="לא נמצאה רשומה מתאימה ב־Hub." />;

  const failedJobsCount = jobs.filter((job) => job.status === "failed").length;
  const latestDeployment = deployments[0];
  const latestBackup = backups[0];
  const storageCopy = getSiteDetailsStorageCopy(site.storageBackend);
  const actionPolicy = (key: SiteDetailsActionPolicy["key"]) => getSiteDetailsActionPolicy(site.storageBackend, key);
  const txtMigrationPolicy = actionPolicy("txt-to-mongo-migration");
  const txtRepairPolicy = actionPolicy("txt-admin-repair");
  const browserTxtBackupPolicy = actionPolicy("browser-txt-backup");
  const backupPlanPolicy = actionPolicy("backup-plan");
  const bootstrapPlanPolicy = actionPolicy("bootstrap-plan");
  const provisionPlanPolicy = actionPolicy("provision-plan");
  const permissionsPlanPolicy = actionPolicy("permissions-plan");
  const siteProvisionPolicy = actionPolicy("site-provision-run");
  const permissionsSetupPolicy = actionPolicy("permissions-setup-run");
  const siteBootstrapPolicy = actionPolicy("site-bootstrap-run");
  const identifySourcePolicy = actionPolicy("identify-source");
  const hostingCheckPolicy = actionPolicy("browser-hosting-check");
  const runtimeConfigReadPolicy = actionPolicy("runtime-config-read");
  const mongoHealthReadPolicy = actionPolicy("mongo-health-read");
  const adminLiveReadPolicy = actionPolicy("admin-live-read");
  const deployCenterPolicy = actionPolicy("deploy-center-open");
  const mongoBackupExecutionPolicy = actionPolicy("mongo-backup-execution");
  const restoreReviewPolicy = actionPolicy("restore-review");
  const rollbackOpenPolicy = actionPolicy("rollback-open");
  const siteAttention = storageCopy.overviewAttention || (site.status === "archived"
    ? "האתר בארכיון. פעולות שוטפות לא מומלצות לפני החזרה לניהול."
    : site.derivedHealthStatus === "failed"
      ? "בדיקת התקינות האחרונה נכשלה. פתחו תקינות וקראו ראיות אימות."
      : failedJobsCount
        ? `${formatNumber(failedJobsCount)} פעולות אחרונות נכשלו. פתחו פעולות כדי לקרוא לוגים.`
        : site.versionStatus === "outdated"
          ? "האתר לא בגרסה האחרונה הידועה. פריסה אפשרית דרך מרכז הגרסאות."
          : !site.lastBackupAt
            ? "לא נמצא גיבוי אחרון. מומלץ ליצור תוכנית גיבוי."
            : "אין בעיה דחופה שמוצגת באתר הזה.");
  const finalAppUrl = site.finalAppUrl || paths?.finalAppUrl || site.sharePointSiteUrl;
  const runtimeReadStatus = runtimeConfigResult?.readStatus || site.runtimeConfigStatus?.readStatus || "unknown";
  const runtimeConfigured = runtimeReadStatus === "configured";
  const mongoSeedStatus = mongoHealthResult?.seedStatus || site.mongoBackendStatus?.seedStatus || "unknown";
  const mongoBackendOk = Boolean(mongoHealthResult?.backendReachable ?? site.mongoBackendStatus?.backendReachable);
  const txtFilesKnown = site.health?.txtFilesExist;
  const backupCapabilityStatus = site.recoveryState?.backupCapability?.status || site.mongoBackendStatus?.backupsStatus || site.backupStatus || "unknown";
  const backupCapabilityDisplay = backupCapabilityStatusLabel(backupCapabilityStatus);
  const adminAccessOk = site.adminSyncStatus === "succeeded" || Boolean(adminLiveData || adminData);
  const storageTone: WorkspaceTone = storageCopy.storageBackend === "unknown" ? "warning" : "success";
  const readinessItems: ReadinessItem[] = [
    {
      key: "hosting",
      label: "אירוח SharePoint",
      status: sharePointHealth?.derivedHealthStatus === "healthy" || site.health?.indexExists ? "תקין" : sharePointHealth || site.lastSharePointHostingVerificationAt ? "דורש בדיקה" : "לא נבדק",
      tone: sharePointHealth?.derivedHealthStatus === "failed" ? "danger" : sharePointHealth?.derivedHealthStatus === "healthy" || site.health?.indexExists ? "success" : "warning",
      lastChecked: formatDateTime(sharePointHealth?.checkedAt || site.lastSharePointHostingVerificationAt || site.lastHealthCheckAt),
      connector: "בדיקה ללא שינוי דרך הדפדפן",
      detail: site.sharePointSiteUrl || paths?.sharePointSiteUrl
    },
    {
      key: "runtime",
      label: "קובץ הגדרות טעינה",
      status: runtimeConfigured ? "תקין" : runtimeReadStatus === "missing" || runtimeReadStatus === "invalid" ? "חסום" : "דורש בדיקה",
      tone: runtimeConfigured ? "success" : storageCopy.storageBackend === "mongo" ? "warning" : "neutral",
      lastChecked: formatDateTime(runtimeConfigResult?.checkedAt || site.runtimeConfigStatus?.checkedAt || site.lastRuntimeConfigCheckAt),
      connector: "בדיקה ללא שינוי דרך הדפדפן",
      detail: storageCopy.storageBackend === "mongo" ? "סימן מוכנות מרכזי לאתר Mongo" : "קובץ טעינה/תאימות"
    },
    {
      key: "data",
      label: "מקור נתונים",
      status: storageCopy.storageBackend === "unknown" ? "לא זוהה" : storageCopy.storageBackend === "mongo" ? mongoBackendOk || mongoSeedStatus === "ok" ? "תקין" : "דורש בדיקה" : txtFilesKnown === false ? "חסום" : txtFilesKnown === true ? "תקין" : "דורש בדיקה",
      tone: storageCopy.storageBackend === "unknown" ? "warning" : storageCopy.storageBackend === "mongo" ? mongoBackendOk || mongoSeedStatus === "ok" ? "success" : "warning" : txtFilesKnown === false ? "danger" : txtFilesKnown === true ? "success" : "warning",
      lastChecked: formatDateTime(site.lastMongoHealthCheckAt || site.lastHealthCheckAt),
      connector: storageCopy.storageBackend === "mongo" ? "בדיקה מול שרת Builder" : storageCopy.storageBackend === "txt" ? "בדיקה דרך הדפדפן המחובר ל־SharePoint" : "זיהוי בקריאה בלבד",
      detail: storageCopy.sourceBadge
    },
    {
      key: "deployment",
      label: "גרסה/פריסה",
      status: site.versionStatus === "outdated" ? "דורש בדיקה" : site.versionStatus === "failed" ? "חסום" : site.versionStatus === "up_to_date" ? "תקין" : "לא נבדק",
      tone: site.versionStatus === "outdated" ? "warning" : site.versionStatus === "failed" ? "danger" : site.versionStatus === "up_to_date" ? "success" : "neutral",
      lastChecked: formatDateTime(site.lastDeployAt || site.lastVersionCheckAt),
      connector: "פריסה דרך הדפדפן המחובר ל־SharePoint",
      detail: `${site.currentVersion || site.version || "-"}`
    },
    {
      key: "backup",
      label: "גיבוי",
      status: site.lastBackupAt ? "תקין" : storageCopy.storageBackend === "mongo" && backupCapabilityStatus !== "ready" ? "חסום" : "דורש בדיקה",
      tone: site.lastBackupAt ? "success" : storageCopy.storageBackend === "mongo" && backupCapabilityStatus !== "ready" ? "warning" : "warning",
      lastChecked: formatDateTime(site.lastBackupAt || site.recoveryState?.backupCapability?.checkedAt),
      connector: storageCopy.storageBackend === "mongo" ? "בדיקה מול שרת Builder" : "הרצה דרך הדפדפן המחובר ל־SharePoint",
      detail: storageCopy.storageBackend === "mongo" ? `יכולת: ${backupCapabilityDisplay}` : "גיבוי קבצי TXT"
    },
    {
      key: "access",
      label: "מנהלים/גישה",
      status: adminAccessOk ? "תקין" : "דורש בדיקה",
      tone: adminAccessOk ? "success" : "warning",
      lastChecked: formatDateTime(site.lastAdminLiveReadAt || site.lastAdminSyncAt),
      connector: "בדיקה ללא שינוי דרך הדפדפן",
      detail: storageCopy.storageBackend === "mongo" ? "SharePoint הוא גישת אירוח" : "מקורות מנהלים וגישה"
    }
  ];
  const actionFromPolicy = (
    policy: SiteDetailsActionPolicy,
    busyKey: string,
    onClick?: () => void,
    lastRun?: string
  ): WorkspaceAction => ({
    key: policy.key,
    label: policy.label,
    description: policy.helperText,
    connector: siteDetailsConnectorLabel(policy.connectorMode),
    risk: siteDetailsRiskLabel(policy.riskClass),
    enabled: policy.enabled && busyAction !== busyKey,
    disabledReason: policy.enabled ? undefined : policy.disabledReason,
    lastRun,
    onClick
  });
  const openFinalSite = () => window.open(finalAppUrl, "_blank", "noreferrer");
  const primaryNextAction: WorkspaceAction = storageCopy.storageBackend === "unknown"
    ? actionFromPolicy(identifySourcePolicy, "sp-health", () => setActiveTab("health"))
    : storageCopy.storageBackend === "mongo" && !runtimeConfigured
      ? actionFromPolicy(runtimeConfigReadPolicy, "runtime-config", () => runAction("runtime-config", runBrowserRuntimeConfigRead), formatDateTime(site.lastRuntimeConfigCheckAt))
      : storageCopy.storageBackend === "mongo" && !mongoBackendOk
        ? actionFromPolicy(mongoHealthReadPolicy, "mongo-health", () => runAction("mongo-health", runBuilderMongoHealthRead), formatDateTime(site.lastMongoHealthCheckAt))
        : site.versionStatus === "outdated"
          ? actionFromPolicy(deployCenterPolicy, "deploy-open", () => setActiveTab("deployment"), formatDateTime(site.lastDeployAt))
          : storageCopy.storageBackend === "txt" && !site.lastBackupAt
            ? actionFromPolicy(browserTxtBackupPolicy, "recovery-open", () => setActiveTab("recovery"), formatDateTime(site.lastBackupAt))
            : {
                key: "open-final-site",
                label: "פתח אתר פעיל",
                description: "האתר נראה מוכן לפי הנתונים הידועים. פתיחה אינה משנה נתונים.",
                connector: "פעולה ידנית",
                risk: "ללא שינוי",
                enabled: true,
                onClick: openFinalSite
              };
  const actionGroups: WorkspaceActionGroup[] = [
    {
      title: "בדיקות ללא שינוי",
      description: "קריאות שלא משנות SharePoint, Mongo או נתוני אתר.",
      actions: [
        actionFromPolicy(identifySourcePolicy, "identify", () => setActiveTab("health")),
        actionFromPolicy(hostingCheckPolicy, "sp-health", () => runAction("sp-health", runBrowserHealthRead), formatDateTime(site.lastSharePointHostingVerificationAt || site.lastHealthCheckAt)),
        actionFromPolicy(runtimeConfigReadPolicy, "runtime-config", () => runAction("runtime-config", runBrowserRuntimeConfigRead), formatDateTime(site.lastRuntimeConfigCheckAt)),
        actionFromPolicy(mongoHealthReadPolicy, "mongo-health", () => runAction("mongo-health", runBuilderMongoHealthRead), formatDateTime(site.lastMongoHealthCheckAt)),
        actionFromPolicy(adminLiveReadPolicy, "admins-live-read", () => runAction("admins-live-read", async () => { await runAdminsLiveRead(); }), formatDateTime(site.lastAdminLiveReadAt || site.lastAdminSyncAt))
      ].filter((action) => getSiteDetailsActionPolicy(site.storageBackend, action.key as SiteDetailsActionPolicy["key"])?.visible !== false)
    },
    {
      title: "פעולות ניהול ב-Hub",
      description: "תוכניות ומידע ניהולי שנבנים לפני הרצה חיה.",
      actions: [
        actionFromPolicy(backupPlanPolicy, "backup-plan", () => runAction("backup-plan", buildBackupPlanForCurrentSite), formatDateTime(site.lastBackupAt)),
        actionFromPolicy(bootstrapPlanPolicy, "bootstrap-plan", () => runAction("bootstrap-plan", async () => {
          const result = await sitesApi.siteBootstrapPlan(site._id);
          setBootstrapPlan(result.data);
          setMessage("תוכנית הקמה נבנתה");
        })),
        actionFromPolicy(provisionPlanPolicy, "provision-plan", () => runAction("provision-plan", async () => {
          const result = await sitesApi.siteProvisionPlan(site._id);
          setProvisionPlan(result.data);
          setMessage("תוכנית תשתית אירוח נבנתה");
        })),
        actionFromPolicy(permissionsPlanPolicy, "permissions-plan", () => runAction("permissions-plan", async () => {
          const result = await sitesApi.permissionsSetupPlan(site._id);
          setPermissionsPlan(result.data);
          setMessage("תוכנית הרשאות נבנתה");
        })),
        actionFromPolicy(restoreReviewPolicy, "restore-review", () => setActiveTab("recovery"))
      ].filter((action) => getSiteDetailsActionPolicy(site.storageBackend, action.key as SiteDetailsActionPolicy["key"])?.visible !== false)
    },
    {
      title: "פעולות SharePoint",
      description: "פעולות שמשפיעות על קבצי אירוח, הרשאות או תהליך פריסה ב־SharePoint.",
      actions: [
        actionFromPolicy(deployCenterPolicy, "deploy-open", () => setActiveTab("deployment"), formatDateTime(site.lastDeployAt)),
        actionFromPolicy(siteProvisionPolicy, "site-provision", () => runAction("site-provision", runProvisionInBrowser)),
        actionFromPolicy(siteBootstrapPolicy, "site-bootstrap", () => runAction("site-bootstrap", runBootstrapInBrowser)),
        actionFromPolicy(permissionsSetupPolicy, "permissions-setup", () => runAction("permissions-setup", runPermissionsInBrowser)),
        actionFromPolicy(browserTxtBackupPolicy, "run-backup", () => runAction("run-backup", async () => {
          assertSiteDetailsActionEnabled(site.storageBackend, "browser-txt-backup");
          const queued = await sitesApi.runSiteBackup(site._id);
          if (!queued.data.browserOperationPlan) throw new Error(queued.data.message || "גיבוי דרך הדפדפן עדיין לא מוכן לפעולה הזאת.");
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
          setMessage(result.finalStatus === "success" ? `גיבוי ${stored.data.backup.backupId} הושלם דרך הדפדפן` : `גיבוי ${result.backupId} נכשל דרך הדפדפן; ראיות אימות נשמרו`);
          await load();
        }), formatDateTime(site.lastBackupAt)),
        actionFromPolicy(txtRepairPolicy, "admin-txt-repair", () => runAction("admin-txt-repair", runAdminTxtRepairInBrowser))
      ].filter((action) => getSiteDetailsActionPolicy(site.storageBackend, action.key as SiteDetailsActionPolicy["key"])?.visible !== false)
    },
    {
      title: "פעולות Mongo",
      description: "פעולות שמסבירות או מפעילות יכולות מול מקור נתונים Mongo.",
      actions: [
        actionFromPolicy(mongoBackupExecutionPolicy, "mongo-backup")
      ].filter((action) => getSiteDetailsActionPolicy(site.storageBackend, action.key as SiteDetailsActionPolicy["key"])?.visible !== false)
    },
    {
      title: "פעולות רגישות",
      description: "פעולות שמשנות מקור נתונים, הרשאות או גרסה פעילה.",
      actions: [
        actionFromPolicy(txtMigrationPolicy, "txt-to-mongo", () => runAction("txt-to-mongo", runTxtToMongoMigrationInBrowser)),
        actionFromPolicy(rollbackOpenPolicy, "rollback-open", () => setActiveTab("deployment")),
        actionFromPolicy(restoreReviewPolicy, "restore-review-sensitive", () => setActiveTab("recovery"))
      ].filter((action) => getSiteDetailsActionPolicy(site.storageBackend, action.key as SiteDetailsActionPolicy["key"])?.visible !== false)
    },
    {
      title: "פרטים טכניים",
      description: "פעולות שאינן זמינות ככפתור עצמאי במסך הראשי.",
      actions: [
        {
          key: "runtime-upload-blocked",
          label: "העלאת קובץ הגדרות טעינה",
          description: "פעולה עצמאית להעלאת קובץ ההגדרות עדיין לא ממומשת במסך הזה.",
          connector: "לא ממומש עדיין",
          risk: "משנה קבצים",
          enabled: false,
          disabledReason: "זמין כרגע רק כחלק מתהליך יצירת/העברת Mongo."
        }
      ]
    }
  ];
  const secondaryHeaderActions = actionGroups.filter((group) => group.actions.length);
  const actionByKey = (key: string) => actionGroups.flatMap((group) => group.actions).find((action) => action.key === key);
  const compactActionGroup = (title: string, description: string, keys: string[]): WorkspaceActionGroup => ({
    title,
    description,
    actions: keys.map(actionByKey).filter(Boolean) as WorkspaceAction[]
  });
  const healthActionGroups = [
    compactActionGroup("בדיקות ללא שינוי", "הרצות בדיקה שמופיעות מעל המידע הטכני.", [
      "browser-hosting-check",
      "runtime-config-read",
      "identify-source",
      "mongo-health-read",
      "backup-plan",
      "admin-live-read"
    ])
  ].filter((group) => group.actions.length);
  const recoveryActionGroups = [
    compactActionGroup("פעולות גיבוי ושחזור", "פעולות גיבוי ושחזור לפי מקור הנתונים והחסמים הידועים.", [
      "backup-plan",
      "browser-txt-backup",
      "mongo-backup-execution",
      "restore-review"
    ])
  ].filter((group) => group.actions.length);
  const accessActionGroups = [
    compactActionGroup("פעולות גישה ומנהלים", "קריאת מנהלים, תיקון TXT והרשאות SharePoint לפי מקור הנתונים.", [
      "admin-live-read",
      "txt-admin-repair",
      "permissions-plan",
      "permissions-setup-run"
    ]),
    {
      title: "ניווט",
      description: "מעבר למסך המנהלים המלא אינו משנה נתונים.",
      actions: [{
        key: "open-admins-screen",
        label: "פתח את מסך המנהלים המלא",
        description: "מעבר למסך ניהול הרשאות וגישה עם טבלאות משתמשים מלאות.",
        connector: "פעולה ידנית",
        risk: "ללא שינוי",
        enabled: true,
        onClick: () => navigate("/admins")
      }]
    }
  ].filter((group) => group.actions.length);
  const hostingPrimaryRows = [
    { label: "כתובת האתר הפעיל", value: paths?.finalAppUrl || site.finalAppUrl, isUrl: true, description: "כתובת שהמשתמשים פותחים" },
    { label: "אתר SharePoint מארח", value: paths?.sharePointSiteUrl || site.sharePointSiteUrl, isUrl: true, description: "אתר SharePoint שמארח את קבצי האתר" },
    { label: "תיקיית dist", value: paths?.finalDistRoot, description: "מיקום קבצי הפרונטאנד המפורסמים" },
    { label: "נתיב קובץ הגדרות טעינה", value: site.runtimeConfigPath || paths?.runtimeConfigPath, description: "קובץ שמכוון את האתר למקור הנתונים" },
    { label: "כתובת קובץ הגדרות טעינה", value: site.runtimeConfigUrl || paths?.runtimeConfigUrl, isUrl: true }
  ];
  const txtSourceRows = [
    { label: "master config", value: paths?.txtFiles?.masterConfig, description: storageCopy.txtPathDescription },
    { label: "users_data", value: paths?.txtFiles?.users, description: storageCopy.txtPathDescription },
    { label: "widgets_data", value: paths?.txtFiles?.widgets, description: storageCopy.txtPathDescription },
    { label: "events_data", value: paths?.txtFiles?.events, description: storageCopy.txtPathDescription },
    { label: "navigation", value: paths?.txtFiles?.navigation, description: storageCopy.txtPathDescription },
    { label: "site_content", value: paths?.txtFiles?.siteContent, description: storageCopy.txtPathDescription }
  ];
  const hostingSecondaryRows = [
    { label: "ספריית siteDB", value: paths?.siteDbRoot || site.siteDbLibrary, description: "ספריית אירוח/נתונים לפי סוג האתר" },
    { label: "ספריית משתמשים", value: paths?.usersDbRoot || site.usersDbLibrary, description: "ספריית משתמשים או תאימות" },
    { label: "ספריית נכסים", value: paths?.siteAssetsRoot },
    { label: "שורש גיבויים", value: paths?.backupsRoot },
    { label: "כתובת הקמה", value: paths?.bootstrapUrl || site.bootstrapUrl, isUrl: true }
  ];

  return (
    <div className="space-y-5">
      <SiteWorkspaceHeader
        site={site}
        paths={paths}
        storageLabel={storageCopy.sourceBadge}
        storageDescription={storageCopy.sourceDescription}
        sourceTone={storageTone}
        nextAction={primaryNextAction}
        secondaryActions={secondaryHeaderActions}
        onRefresh={load}
      />

      <SiteReadinessStrip items={readinessItems} />

      {message ? <div className="badge badge-success px-3 py-2">{message}</div> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}

      <div className="site-details-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`site-details-tab ${activeTab === tab.key ? "site-details-tab-active" : ""}`}
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
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
            <SectionCard title="סקירת אתר" subtitle="מקור אמת, חסמים ומצב אחרון בלי פרטים טכניים מיותרים" helpKey="sites.registry">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="soft-panel p-3">
                  <p className="text-xs font-bold muted">מקור נתונים</p>
                  <p className="mt-1 text-sm font-bold" style={{ color: "var(--text-strong)" }}>{storageCopy.sourceBadge}</p>
                  <p className="mt-1 text-xs muted">{storageCopy.sourceDescription}</p>
                </div>
                <div className="soft-panel p-3">
                  <p className="text-xs font-bold muted">מה האתר משתמש בו</p>
                  <p className="mt-1 text-sm" style={{ color: "var(--text-strong)" }}>
                    {storageCopy.storageBackend === "mongo"
                      ? "אירוח SharePoint, קובץ הגדרות טעינה ושרת Builder/Mongo."
                      : storageCopy.storageBackend === "txt"
                        ? "אירוח SharePoint וקבצי TXT כמקור נתונים פעיל."
                        : "מידע ניהולי ב־Hub ובדיקות קריאה בלבד עד לזיהוי."}
                  </p>
                </div>
                <div className="soft-panel p-3">
                  <p className="text-xs font-bold muted">חסם מרכזי</p>
                  <p className="mt-1 text-sm" style={{ color: "var(--text-strong)" }}>{siteAttention}</p>
                </div>
                <div className="soft-panel p-3">
                  <p className="text-xs font-bold muted">פעולה מומלצת</p>
                  <p className="mt-1 text-sm font-bold" style={{ color: "var(--text-strong)" }}>{primaryNextAction.label}</p>
                  <p className="mt-1 text-xs muted">{primaryNextAction.description}</p>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="אחריות ומצב אחרון" subtitle="מי אחראי ומה קרה לאחרונה" helpKey="site.owner">
              <div className="space-y-3">
                <SiteInfoRow label="בעל האתר" value={site.ownerName || "-"} />
                <SiteInfoRow label="יחידה" value={site.unitName || "-"} />
                <SiteInfoRow label="גרסה נוכחית" value={site.currentVersion || site.version || "-"} />
                <SiteInfoRow label="פעולה מוצלחת אחרונה" value={latestDeployment ? `${deploymentStatusLabel(latestDeployment.status)} · ${formatDateTime(latestDeployment.finishedAt || latestDeployment.createdAt)}` : latestBackup ? `גיבוי · ${formatDateTime(latestBackup.createdAt)}` : "לא נמצאה"} />
                <SiteInfoRow label="כשל אחרון" value={site.lastError || (failedJobsCount ? `${formatNumber(failedJobsCount)} פעולות נכשלו` : "לא ידוע על כשל פתוח")} />
              </div>
            </SectionCard>
          </div>

          <SiteActionCenter groups={actionGroups} />
        </div>
      ) : null}

      {activeTab === "hosting" ? (
        <div className="space-y-5">
          <SectionCard title="אירוח ונתיבים" subtitle={storageCopy.pathsSubtitle} helpKey="site.finalDistPath">
            <div className="flex flex-wrap gap-2">
              <MetadataOnlyBadge mode="readonly" />
              <span className={`badge ${storageCopy.storageBackend === "unknown" ? "badge-warning" : "badge-info"}`}>{storageCopy.sourceBadge}</span>
              {storageCopy.storageBackend === "mongo" ? <span className="badge badge-warning">נתיבי TXT הם תאימות/מורשת בלבד</span> : null}
              {storageCopy.storageBackend === "unknown" ? <span className="badge badge-warning">נתיבים אפשריים, לא מקור אמת מאושר</span> : null}
            </div>
          </SectionCard>
          <PathGroup title="נתיבי אירוח ראשיים" description="כתובות וקבצים שהאתר צריך כדי להיטען למשתמשים." rows={hostingPrimaryRows} />
          <PathGroup
            title={storageCopy.storageBackend === "txt" ? "קבצי TXT כמקור נתונים" : storageCopy.storageBackend === "mongo" ? "קבצי TXT לתאימות/מורשת" : "קבצי TXT אפשריים"}
            description={storageCopy.storageBackend === "txt" ? "קבצים אלה הם מקור הנתונים הפעיל של האתר." : storageCopy.storageBackend === "mongo" ? "מוצגים לצורך תאימות בלבד; אינם מקור הנתונים החי." : "מוצגים כנתיבים אפשריים עד לזיהוי מקור הנתונים."}
            rows={txtSourceRows}
          />
          <PathGroup title="נתיבים משניים ופרטים טכניים" description="ספריות, גיבויים ונתיבי עזר שאינם צריכים להיות מקור ההחלטה הראשון." rows={hostingSecondaryRows} />
          <AdvancedDetails title="פרטים טכניים" description="ניתוב פנימי, נתיבים גולמיים ומידע לתחקור">
            <div className="rounded-lg border divider px-4" style={{ borderColor: "var(--border)" }}>
              {pathRows.map((row) => <LinkRow key={row.label} {...row} copyMode="icon" />)}
            </div>
          </AdvancedDetails>
        </div>
      ) : null}

      {activeTab === "health" ? (
        <div className="space-y-5">
          <SectionCard title="פעולות בדיקה" subtitle="מה אפשר להריץ עכשיו בלי לשנות נתונים" helpKey="health">
            <ActionCommandList groups={healthActionGroups} density="compact" />
          </SectionCard>

          <div className="grid gap-5 xl:grid-cols-2">
            <SiteDependencyCard
              title="אירוח SharePoint"
              status={readinessItems[0].status}
              tone={readinessItems[0].tone}
              connector="בדיקה ללא שינוי דרך הדפדפן המחובר ל־SharePoint"
              lastChecked={readinessItems[0].lastChecked}
              nextAction="הרץ בדיקת אירוח SharePoint"
            >
              <SiteInfoRow label="אתר SharePoint מארח" value={site.sharePointSiteUrl || paths?.sharePointSiteUrl} isUrl />
              <SiteInfoRow label="כתובת האתר הפעיל" value={finalAppUrl} isUrl />
            </SiteDependencyCard>

            <SiteDependencyCard
              title="קובץ הגדרות טעינה"
              status={readinessItems[1].status}
              tone={readinessItems[1].tone}
              connector="בדיקה ללא שינוי דרך הדפדפן המחובר ל־SharePoint"
              lastChecked={readinessItems[1].lastChecked}
              nextAction="בדוק שהקובץ קיים ושייך לאתר הזה"
            >
              <SiteInfoRow label="נתיב" value={runtimeConfigResult?.runtimeConfigPath || site.runtimeConfigStatus?.path || site.runtimeConfigPath || paths?.runtimeConfigPath} />
              <SiteInfoRow label="שרת נתונים" value={runtimeConfigResult?.backendApiUrlHost || site.runtimeConfigStatus?.backendApiUrlHost || ""} />
              <SiteInfoRow label="מזהה אתר Builder" value={runtimeConfigResult?.builderSiteId || site.runtimeConfigStatus?.builderSiteId || site.builderSiteId || site.mongoSiteId || ""} />
            </SiteDependencyCard>

            <SiteDependencyCard
              title="מקור הנתונים"
              status={readinessItems[2].status}
              tone={readinessItems[2].tone}
              connector={readinessItems[2].connector || ""}
              lastChecked={readinessItems[2].lastChecked}
              nextAction={storageCopy.storageBackend === "mongo" ? "בדוק מקור נתונים Mongo" : storageCopy.storageBackend === "txt" ? "בדוק קבצי TXT דרך SharePoint" : "זהה אם האתר Mongo או TXT"}
            >
              {storageCopy.storageBackend === "mongo" ? (
                <>
                  <SiteInfoRow label="שרת Builder" value={mongoHealthResult?.backendApiUrlHost || site.mongoBackendStatus?.backendApiUrlHost || site.backendApiUrl || ""} />
                  <SiteInfoRow label="מזהה אתר Mongo" value={mongoHealthResult?.builderSiteId || site.mongoBackendStatus?.siteId || site.mongoSiteId || site.builderSiteId || ""} />
                  <SiteInfoRow label="סטטוס נתוני בסיס" value={mongoSeedStatus} />
                </>
              ) : storageCopy.storageBackend === "txt" ? (
                <>
                  <p className="text-sm muted">קבצי TXT ב־SharePoint הם מקור הנתונים הפעיל של האתר.</p>
                  <SiteInfoRow label="users_data" value={paths?.txtFiles?.users} />
                  <SiteInfoRow label="widgets_data" value={paths?.txtFiles?.widgets} />
                </>
              ) : (
                <>
                  <p className="text-sm muted">לפני פעולות כתיבה צריך לזהות את מקור הנתונים.</p>
                </>
              )}
            </SiteDependencyCard>

            <SiteDependencyCard
              title="גיבוי ושחזור"
              status={readinessItems[4].status}
              tone={readinessItems[4].tone}
              connector={readinessItems[4].connector || ""}
              lastChecked={readinessItems[4].lastChecked}
              nextAction="פתח גיבויים ושחזור"
            >
              <p className="text-sm muted">{storageCopy.backupsSubtitle}</p>
              <SiteInfoRow label="גיבוי אחרון" value={formatDateTime(site.lastBackupAt)} />
            </SiteDependencyCard>

            <SiteDependencyCard
              title="גישה והרשאות"
              status={readinessItems[5].status}
              tone={readinessItems[5].tone}
              connector="בדיקה ללא שינוי דרך הדפדפן"
              lastChecked={readinessItems[5].lastChecked}
              nextAction="רענן מקורות מנהלים"
            >
              <p className="text-sm muted">{storageCopy.adminsSubtitle}</p>
              <SiteInfoRow label="מנהלים ידועים" value={formatNumber(adminsDisplayCount)} />
            </SiteDependencyCard>

            <SectionCard title="מידע ניהולי ב־Hub" subtitle="סטטוס ידני שנשמר ב־Hub בלבד; אינו הוכחה חיה מול SharePoint או Mongo." helpKey="health">
              <div className="mb-4 flex flex-wrap gap-2">
                <MetadataOnlyBadge mode="metadata" />
                <MetadataOnlyBadge mode="readonly" />
              </div>
              <HealthChecklist health={healthDraft} storageBackend={site.storageBackend || "unknown"} editable onChange={setHealthDraft} />
              <button className="btn btn-secondary mt-4" disabled={busyAction === "manual-health"} onClick={() => runAction("manual-health", async () => {
                await sitesApi.updateManualHealth(site._id, healthDraft);
                setMessage("בדיקת התקינות הידנית נשמרה ב־Hub");
                await load();
              })} type="button">שמור מידע ניהולי ב־Hub</button>
            </SectionCard>
          </div>
          {sharePointHealth ? (
            <AdvancedDetails title="ראיות אימות SharePoint" description="תוצאות מפורטות של בדיקת הקריאה האחרונה">
              <HealthEvidenceTable evidence={sharePointHealth.evidence} />
            </AdvancedDetails>
          ) : null}
        </div>
      ) : null}

      {activeTab === "deployment" ? (
        <div className="space-y-5">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <SectionCard title="מצב גרסה" subtitle="מה ידוע על הגרסה החיה ועל יעד הפריסה הבא" helpKey="deploy">
              <div className="grid gap-3 md:grid-cols-2">
                <KpiCard title="גרסה חיה ידועה" value={site.currentVersion || site.version || "-"} icon={<GitBranch size={18} />} description={`יעד: ${site.targetVersion || site.latestKnownVersion || "-"}`} tone={site.versionStatus === "outdated" ? "warning" : "info"} helpKey="version.current" />
                <KpiCard title="סטטוס פריסה" value={site.versionStatus || "לא ידוע"} icon={<Rocket size={18} />} description={`פריסה אחרונה: ${formatDateTime(site.lastDeployAt)}`} tone={site.versionStatus === "failed" ? "danger" : site.versionStatus === "outdated" ? "warning" : "success"} helpKey="deploy" />
              </div>
              <div className="mt-4 rounded-lg border p-3 text-sm" style={{ background: storageCopy.storageBackend === "unknown" ? "var(--warning-soft)" : "var(--surface-muted)", borderColor: "var(--border)" }}>
                {storageCopy.storageBackend === "mongo"
                  ? "פריסה מעדכנת את קבצי הפרונטאנד ב־SharePoint; נתוני האתר החיים נשארים ב־Mongo דרך שרת Builder."
                  : storageCopy.storageBackend === "txt"
                    ? "פריסה מעדכנת את קבצי הפרונטאנד ב־SharePoint והאתר ממשיך לקרוא קבצי TXT כמקור נתונים."
                    : "מקור הנתונים לא זוהה. מומלץ לזהות Mongo/TXT לפני פריסה כדי לוודא תאימות."}
              </div>
            </SectionCard>

            <SectionCard title="פעולת פריסה בטוחה" subtitle="המשך הפריסה נעשה במרכז הפריסה עם תכנון, חסמים וראיות אימות" helpKey="deploy">
              <div className="space-y-3">
                <ConnectorRiskToken connector="הרצה דרך הדפדפן המחובר ל־SharePoint" risk="משנה קבצים" enabled={storageCopy.storageBackend !== "unknown"} />
                {storageCopy.storageBackend === "unknown" ? <p className="text-sm" style={{ color: "var(--warning)" }}>מקור הנתונים לא זוהה; פריסה צריכה להיות חסומה או באישור חריג במרכז הפריסה.</p> : null}
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => navigate(`/releases?targetSiteId=${encodeURIComponent(site._id)}`)}
                >
                  <Rocket size={15} />פתח מרכז פריסה לאתר הזה
                </button>
              </div>
            </SectionCard>
          </div>

          <SectionCard title="היסטוריית פריסות" subtitle="תוצאות אחרונות; ראיות מפורטות נמצאות במגירה" helpKey="deploy">
            {deployments.length === 0 ? (
              <EmptyState title="אין פריסות רשומות" description="היסטוריית פריסה תופיע לאחר יצירת פעולת פריסה." />
            ) : (
              <SiteDetailsScrollRegion label="היסטוריית פריסות" variant="tall">
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
                          <span className={`badge ${failedEvidenceCount ? "badge-danger" : evidenceCount ? "badge-success" : "badge-neutral"}`}>{formatNumber(evidenceCount)} בדיקות</span>
                        </div>
                        {deployment.error ? <code className="num block max-w-full truncate text-xs" style={{ color: "var(--danger)" }} title={deployment.error}>{deployment.error}</code> : null}
                        <button className="btn btn-secondary w-full" onClick={() => setDetailsDrawer({ type: "deployment", deployment })} type="button"><Eye size={14} />פתח ראיות אימות</button>
                      </div>
                    );
                  }}
                />
              </SiteDetailsScrollRegion>
            )}
          </SectionCard>
        </div>
      ) : null}

      {activeTab === "recovery" ? (
        <div className="space-y-5">
          <div className="grid gap-5 xl:grid-cols-2">
            <SectionCard title="מה מגובה" subtitle={storageCopy.backupsSubtitle} helpKey="backup">
              <div className="space-y-3">
                <div className="rounded-lg border p-3 text-sm" style={{ background: storageCopy.storageBackend === "mongo" || storageCopy.storageBackend === "unknown" ? "var(--warning-soft)" : "var(--surface-muted)", borderColor: "var(--border)", color: "var(--text-strong)" }}>
                  {storageCopy.storageBackend === "mongo"
                    ? "נתוני האתר החיים נמצאים ב־Mongo דרך שרת Builder. גיבוי TXT אינו מגבה את נתוני Mongo החיים."
                    : storageCopy.storageBackend === "txt"
                      ? "גיבוי TXT מכסה את קבצי המקור ב־SharePoint: הגדרות, משתמשים, תוכן ו־widgets."
                      : "צריך לזהות את מקור הנתונים לפני הרצת גיבוי."}
                </div>
                {storageCopy.storageBackend === "txt" ? (
                  <div className="grid gap-2 md:grid-cols-2">
                    {txtSourceRows.slice(0, 6).map((row) => <div className="soft-panel p-2 text-sm" key={row.label}>{row.label}</div>)}
                  </div>
                ) : null}
              </div>
            </SectionCard>

            <SectionCard title="מצב גיבוי אחרון" subtitle="המידע האחרון שנשמר ב־Hub" helpKey="backup">
              <div className="grid gap-3 md:grid-cols-2">
                <KpiCard title="מספר גיבויים" value={formatNumber(site.backupCount || 0)} icon={<DatabaseBackup size={18} />} description={`אחרון: ${formatDateTime(site.lastBackupAt)}`} tone={site.lastBackupAt ? "success" : "warning"} helpKey="backup" />
                <KpiCard title="יכולת גיבוי" value={backupCapabilityDisplay} icon={<ListChecks size={18} />} description={storageCopy.storageBackend === "mongo" ? "בדיקה מול שרת Builder" : "בדפדפן המחובר ל־SharePoint"} tone={backupCapabilityStatus === "ready" || site.lastBackupAt ? "success" : "warning"} helpKey="backup.inventory" />
              </div>
            </SectionCard>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <SectionCard title="מוכנות שחזור" subtitle="שחזור הוא פעולה רגישה ולכן מוצג כאן כמצב וחסמים, לא ככפתור אקראי" helpKey="backup.restore">
              <div className="space-y-3">
                <ConnectorRiskToken connector="פעולה ידנית" risk="פעולה רגישה" enabled={false} />
                <p className="text-sm muted">{site.recoveryState?.restoreAudit?.readinessStatus === "ready" ? "קיימת מוכנות שחזור לפי הבדיקה האחרונה." : "מוכנות שחזור לא אושרה או חסומה. יש לבדוק תוכנית שחזור לפני פעולה."}</p>
                {(site.recoveryState?.restoreAudit?.blockers || []).map((blocker) => <p className="badge badge-warning px-3 py-2" key={blocker}>{blocker}</p>)}
              </div>
            </SectionCard>

            <SectionCard title="פעולות זמינות" subtitle="פעולות הגיבוי משתמשות במדיניות storage-aware" helpKey="backup">
              <ActionCommandList groups={recoveryActionGroups} density="compact" />
            </SectionCard>
          </div>

          {backupPlan ? (
            <SectionCard title="פרטי תוכנית גיבוי" subtitle="תוכנית לפני הרצה, ללא שינוי נתונים" helpKey="backup.inventory">
              <div className="grid gap-3 md:grid-cols-4">
                <KpiCard title="מקורות קיימים" value={`${backupPlan.summary?.existingSources ?? 0}/${backupPlan.summary?.totalSources ?? 0}`} icon={<ListChecks size={18} />} tone={backupPlan.summary?.readyForBackup ? "success" : "warning"} helpKey="backup.inventory" />
                <KpiCard title="חסרים" value={backupPlan.summary?.missingSources ?? 0} icon={<ListChecks size={18} />} tone={backupPlan.summary?.missingSources ? "warning" : "success"} helpKey="deploy.blocker" />
                <KpiCard title="חסימות הרשאה" value={backupPlan.summary?.authBlockedSources ?? 0} icon={<ListChecks size={18} />} tone={backupPlan.summary?.authBlockedSources ? "warning" : "success"} helpKey="health.401" />
                <KpiCard title="גודל ידוע" value={formatBytes(backupPlan.summary?.knownSizeBytes ?? 0)} icon={<DatabaseBackup size={18} />} tone="neutral" helpKey="storage" />
              </div>
              <SiteInfoRow label="יעד גיבוי" value={backupPlan.target?.backupFolder} />
            </SectionCard>
          ) : null}

          <SectionCard title="היסטוריה" subtitle="גיבויים שנשמרו עבור האתר" helpKey="backup">
            {backups.length === 0 ? (
              <EmptyState title="אין גיבויים רשומים" description="גיבויים יופיעו לאחר הרצת פעולת גיבוי." />
            ) : (
              <SiteDetailsScrollRegion label="היסטוריית גיבויים" variant="tall">
                <DataTable columns={backupColumns} rows={backups} rowKey={(backup) => backup._id} minWidth={980} mobileCard={(backup) => (
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
                )} />
              </SiteDetailsScrollRegion>
            )}
          </SectionCard>

          <AdvancedDetails title="פרטים טכניים" description="מצב שחזור גולמי ויכולת גיבוי כפי שנשמרו ב־Hub">
            <JsonBlock value={site.recoveryState || {}} />
          </AdvancedDetails>
        </div>
      ) : null}

      {activeTab === "access" ? (
        <div className="space-y-5">
          <SectionCard title="השוואת מקורות מנהלים וגישה" subtitle={storageCopy.adminsSubtitle} helpKey="site.admins">
            <div className="mb-4 flex flex-wrap gap-2">
              <MetadataOnlyBadge mode="metadata" />
              <MetadataOnlyBadge mode="readonly" />
              <span className="badge badge-info">{storageCopy.sourceBadge}</span>
            </div>
            <AdminSourceSummaryCards adminData={adminData} liveData={adminLiveData} siteLabel={adminsSourceLabel} storageBackend={storageCopy.storageBackend} variant="inline" />
          </SectionCard>

          <SectionCard title="מקורות שנקראו" subtitle="תוצאות קריאה ללא שינוי ממקורות מנהלים וגישה" helpKey="site.admins">
            <div className="mb-4 flex flex-wrap gap-2">
              <MetadataOnlyBadge mode="metadata" />
              <MetadataOnlyBadge mode="readonly" />
              <span className="badge badge-success">בדיקה דרך הדפדפן המחובר ל־SharePoint</span>
            </div>
            <AdminLiveReadMeta liveData={adminLiveData} adminData={adminData} />
            <div className="mt-4">
              <AdminSourceStatusTable data={adminLiveData || adminData} />
            </div>
          </SectionCard>

          <SectionCard title="פערים לטיפול" subtitle="פערי מקורות או קריאות שלא הצליחו" helpKey="site.admins">
            <AdminSourceLists adminData={adminData} liveData={adminLiveData} limit={8} />
          </SectionCard>

          <SectionCard title="פעולות זמינות" subtitle="קריאה, תיקון TXT והרשאות לפי מקור הנתונים" helpKey="site.admins">
            <ActionCommandList groups={accessActionGroups} density="compact" />
          </SectionCard>

          <AdvancedDetails title="ראיות אימות" description="מקורות, סטטוסים ופרטים טכניים של קריאת מנהלים">
            <JsonBlock value={{ adminData, adminLiveData }} />
          </AdvancedDetails>
        </div>
      ) : null}

      {activeTab === "activity" ? (
        <div className="space-y-5">
          <SectionCard title="פעולות והרצות" subtitle="היסטוריית פעולות, סטטוס ומה לעשות אם משהו נכשל" helpKey="job">
            {jobs.length === 0 ? (
              <EmptyState title="אין פעולות רשומות" description="לא נמצאו פעולות אחרונות לאתר זה." />
            ) : (
              <SiteDetailsScrollRegion label="פעולות והרצות" variant="tall">
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
                      <button className="btn btn-secondary w-full" onClick={() => setDetailsDrawer({ type: "job", job })} type="button"><Eye size={14} />פרטי פעולה</button>
                    </div>
                  )}
                />
              </SiteDetailsScrollRegion>
            )}
          </SectionCard>

          <SectionCard title="יומן פעולות" subtitle="אירועים שנרשמו על האתר, עם פרטים טכניים במגירה בלבד" helpKey="audit">
            {auditRows.length === 0 ? <EmptyState title="אין רשומות יומן לאתר" description="יומן הפעולות המלא זמין בעמוד יומן פעולות." action={<Link className="btn btn-secondary" to="/audit">פתח יומן מלא</Link>} /> : (
              <SiteDetailsScrollRegion label="יומן פעולות" variant="tall">
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
                        <span className={`badge shrink-0 ${row.result === "failure" ? "badge-danger" : "badge-success"}`}>{auditResultLabel(row.result)}</span>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <MobileMeta label="מי ביצע" helpKey="sharepoint.currentUser">{row.actor?.userName || row.actor?.userId || "-"}</MobileMeta>
                        <MobileMeta label="מזהה בקשה" helpKey="audit.evidence"><span className="num">{row.requestId || "-"}</span></MobileMeta>
                      </div>
                      <button className="btn btn-secondary w-full" onClick={() => setDetailsDrawer({ type: "audit", row })} type="button"><Eye size={14} />פרטים</button>
                    </div>
                  )}
                />
              </SiteDetailsScrollRegion>
            )}
          </SectionCard>
        </div>
      ) : null}

      {activeTab === "advanced" ? (
        <div className="space-y-5">
          <SectionCard title="הגדרות מתקדמות" subtitle="מידע ניהולי ב־Hub, הערות, שגיאות אחרונות ופרטים טכניים" helpKey="site.metadata">
            <div className="soft-panel p-4">
              <p className="whitespace-pre-wrap text-sm">{site.notes || "אין הערות כרגע."}</p>
            </div>
            {site.lastError ? <div className="mt-4 rounded-lg border p-3 text-sm" style={{ background: "var(--danger-soft)", color: "var(--danger)", borderColor: "var(--border)" }}>שגיאה אחרונה: {site.lastError}</div> : null}
          </SectionCard>

          <SectionCard title="מזהים טכניים" subtitle="מזהים ונתונים שמשמשים תחקור ותמיכה" helpKey="site.metadata">
            <div className="grid gap-3 md:grid-cols-2">
              <LinkRow label="מזהה אתר ב־Hub" value={site._id} copyMode="icon" />
              <LinkRow label="קוד אתר" value={site.siteCode} copyMode="icon" />
              <LinkRow label="מזהה Builder" value={site.builderSiteId || site.mongoSiteId || ""} copyMode="icon" />
              <LinkRow label="סוג אחסון" value={site.storageBackend || "unknown"} copyMode="icon" />
              <LinkRow label="עודכן" value={formatDateTime(site.updatedAt)} copyMode="icon" />
              <LinkRow label="בדיקת בריאות אחרונה" value={formatDateTime(site.lastHealthCheckAt)} copyMode="icon" />
            </div>
          </SectionCard>

          <AdvancedDetails title="נתוני אתר גולמיים" description="JSON טכני לתחקור בלבד">
            <JsonBlock value={site} />
          </AdvancedDetails>

          {bootstrapPlan || provisionPlan || permissionsPlan || migrationResult ? (
            <AdvancedDetails title="תוצאות פעולות ותוכניות מהסשן" description="מידע טכני שנוצר בלחיצה האחרונה על פעולות תכנון או מיגרציה במסך הזה">
              <JsonBlock value={{
                bootstrapPlan,
                provisionPlan,
                permissionsPlan,
                migrationResult
              }} />
            </AdvancedDetails>
          ) : null}
        </div>
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
          detailsDrawer?.type === "audit" ? "פרטי יומן פעולה" :
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
                      <span className="badge badge-neutral">{formatNumber(filesCount)} קבצים</span>
                      <span className="badge badge-success">{formatNumber(verifiedCount)} אומתו</span>
                      <span className={`badge ${failedCount ? "badge-danger" : "badge-neutral"}`}>{formatNumber(failedCount)} נכשלו</span>
                    </div>
                  </MobileMeta>
                  <MobileMeta label="נוצר">{formatDateTime(deployment.createdAt)}</MobileMeta>
                </div>
                {deployment.rollbackReason ? (
                  <div className="mt-4 rounded-lg border p-3 text-sm" style={{ background: "var(--warning-soft)", borderColor: "color-mix(in srgb, var(--warning) 35%, var(--border))", color: "var(--warning)" }}>
                    <span className="font-bold">סיבת חזרה לגרסה קודמת: </span>{deployment.rollbackReason}
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
                      <p className="text-sm font-bold muted">תקינות אחרי פריסה</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {postHealth.derivedHealthStatus ? <HealthBadge status={postHealth.derivedHealthStatus as any} /> : null}
                        {postHealth.status ? <span className={`badge ${verificationBadgeClass(postHealth.status)}`}>{verificationStatusLabel(postHealth.status)}</span> : null}
                        <span className="badge badge-neutral">{formatNumber(postHealthEvidence.length)} בדיקות</span>
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
                  <h3 className="text-sm font-bold muted">ראיות קבצים</h3>
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
                <h3 className="text-sm font-bold muted">נתיבי מקור</h3>
                {sourceRows.length ? (
                  <DataTable
                    columns={[
                      { key: "path", header: "נתיב", render: (row: any) => <code className="num block max-w-[420px] truncate text-xs muted" title={row.path}>{row.path}</code> },
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
                ) : <EmptyState title="אין נתיבי מקור" description="לא נשמר פירוט מקור לגיבוי הזה." />}
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-bold muted">ראיות אימות</h3>
                {verificationRows.length ? (
                  <DataTable
                    columns={[
                      { key: "status", header: "סטטוס", render: (row: any) => <span className={`badge ${row.status === "verified" ? "badge-success" : "badge-danger"}`}>{verificationStatusLabel(row.status)}</span> },
                      { key: "source", header: "מקור", render: (row: any) => <code className="num block max-w-[300px] truncate text-xs muted" title={row.sourcePath}>{row.sourcePath}</code> },
                      { key: "target", header: "גיבוי", render: (row: any) => <code className="num block max-w-[300px] truncate text-xs muted" title={row.targetPath}>{row.targetPath}</code> },
                      { key: "size", header: "גודל", render: (row: any) => <span className={`badge ${matchBadgeClass(row.sizeMatches)}`}>{matchLabel(row.sizeMatches)}</span> },
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
                          <span className={`badge shrink-0 ${row.status === "verified" ? "badge-success" : "badge-danger"}`}>{verificationStatusLabel(row.status)}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className={`badge ${matchBadgeClass(row.sizeMatches)}`}>גודל {matchLabel(row.sizeMatches)}</span>
                          <span className={`badge ${matchBadgeClass(row.sha256Matches)}`}>sha {matchLabel(row.sha256Matches)}</span>
                        </div>
                        {row.error ? <code className="num block max-w-full truncate text-xs" style={{ color: "var(--danger)" }} title={row.error}>{row.error}</code> : null}
                      </div>
                    )}
                  />
                ) : <EmptyState title="אין ראיות אימות" description="לא נשמרו תוצאות אימות לגיבוי הזה." />}
              </div>

              {restoreRows.length ? (
                <div className="space-y-3">
                  <h3 className="text-sm font-bold muted">ראיות שחזור</h3>
                  <DataTable
                    columns={[
                      { key: "status", header: "סטטוס", render: (row: any) => <span className={`badge ${row.status === "verified" ? "badge-success" : "badge-danger"}`}>{verificationStatusLabel(row.status)}</span> },
                      { key: "backup", header: "גיבוי", render: (row: any) => <code className="num block max-w-[280px] truncate text-xs muted" title={row.backupPath}>{row.backupPath}</code> },
                      { key: "target", header: "יעד", render: (row: any) => <code className="num block max-w-[280px] truncate text-xs muted" title={row.targetPath}>{row.targetPath}</code> },
                      { key: "size", header: "גודל", render: (row: any) => <span className={`badge ${matchBadgeClass(row.sizeMatches)}`}>{matchLabel(row.sizeMatches)}</span> },
                      { key: "sha", header: "SHA", render: (row: any) => <span className={`badge ${matchBadgeClass(row.sha256Matches)}`}>{matchLabel(row.sha256Matches)}</span> }
                    ]}
                    rows={restoreRows}
                    rowKey={(row, index) => `${row.backupPath || "restore"}-${index}`}
                    minWidth={960}
                    mobileCard={(row) => (
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <code className="num block min-w-0 max-w-full truncate text-xs muted" title={row.targetPath}>{row.targetPath}</code>
                          <span className={`badge shrink-0 ${row.status === "verified" ? "badge-success" : "badge-danger"}`}>{verificationStatusLabel(row.status)}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className={`badge ${matchBadgeClass(row.sizeMatches)}`}>גודל {matchLabel(row.sizeMatches)}</span>
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
              <h3 className="text-sm font-bold muted">לוגים</h3>
              {detailsDrawer.job.logs?.length ? detailsDrawer.job.logs.map((log, index) => (
                <div key={`${log.at}-${index}`} className="soft-panel p-3">
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                    <span className="badge badge-neutral">{log.level}</span>
                    <span className="num text-xs muted">{formatDateTime(log.at)}</span>
                  </div>
                  <p className="text-sm">{log.message}</p>
                </div>
              )) : <EmptyState title="אין לוגים" description="לא נשמרו שורות לוג עבור הפעולה הזאת." />}
            </div>
            <div className="space-y-3">
              <h3 className="text-sm font-bold muted">ראיות ותוצאה</h3>
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
                <span className={`badge ${detailsDrawer.row.result === "failure" ? "badge-danger" : "badge-success"}`}>{auditResultLabel(detailsDrawer.row.result)}</span>
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
