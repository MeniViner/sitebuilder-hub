import { ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ChevronLeft,
  CircleDashed,
  ClipboardList,
  Filter,
  GitBranch,
  History,
  Info,
  ListChecks,
  PackageCheck,
  Pencil,
  Plus,
  RefreshCw,
  Rocket,
  RotateCcw,
  Search,
  ShieldCheck,
  X
} from "lucide-react";
import {
  BatchDeployPlan,
  BatchDeployPlanRow,
  BatchDeployRequest,
  BatchDeployTargetMode,
  BrowserDeployEvidencePayload,
  DeployMode,
  DeploymentVerificationEvidence,
  Job,
  OperationCapabilities,
  Release,
  ReleaseArtifactValidation,
  RollbackPlan,
  SiteDeployment,
  sitesApi
} from "../api/sitesApi";
import { Site } from "../types/site";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { KpiCard } from "../components/KpiCard";
import { LinkRow } from "../components/LinkRow";
import { LoadingState } from "../components/LoadingState";
import { GuidedFlow, ModeBoundary, OperationalSummary } from "../components/OperationalSummary";
import { ProtectedActionDialog } from "../components/ProtectedActionDialog";
import { SectionCard } from "../components/SectionCard";
import { HelpIcon } from "../components/help/HelpIcon";
import { HelpLabel } from "../components/help/HelpLabel";
import { formatBytes, formatDateTime, formatNumber, releaseTypeLabel, siteStatusLabel } from "../utils/format";
import { releaseDisplayLabel, releaseOptionLabel } from "../utils/releaseLabels";
import {
  deployArtifactToSharePointBrowser,
  requestBrowserDigest,
  type BrowserSharePointDeployResult
} from "../utils/sharepointBrowserConnector";
import { buildDeploymentMetadataFile, DEPLOYMENT_METADATA_FILE } from "../utils/deploymentMetadata";

type ReleaseType = Release["releaseType"];
type ParsedVersion = { major: number; minor: number; patch: number };
type ReleaseTab = "releases" | "deploy" | "rollback" | "history";
type DeployStep = 1 | 2 | 3 | 4;
type TargetFilter = "all" | "behind" | "current" | "missing" | "blocked";
type ReleaseVisualStatus = "draft" | "artifact-missing" | "validated" | "active" | "deprecated";

type RollbackPlanRow = {
  site: Site;
  plan?: RollbackPlan;
  ready: boolean;
  blockers: string[];
  warnings: string[];
  status: "planned" | "blocked" | "queued" | "running" | "succeeded" | "failed";
  jobId?: string;
};

type BrowserDeploySiteResult = {
  siteId: string;
  siteCode: string;
  displayName: string;
  status: "pending" | "running" | "success" | "failed";
  message: string;
  filesCount: number;
  verifiedFilesCount: number;
  failedFilesCount: number;
  deploymentId?: string;
  error?: string;
};

type DeployExecutionResult =
  { connectorMode: "browser-sharepoint"; results: BrowserDeploySiteResult[]; message?: string };

const parseVersion = (version?: string): ParsedVersion | null => {
  const match = String(version || "").trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
};

const versionToString = (version: ParsedVersion) => `${version.major}.${version.minor}.${version.patch}`;

const compareSemver = (left?: string, right?: string) => {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return 0;
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
};

const suggestVersion = (baseVersion: string | undefined, releaseType: ReleaseType) => {
  const base = parseVersion(baseVersion) || { major: 0, minor: 1, patch: 0 };
  if (releaseType === "major") return versionToString({ major: base.major + 1, minor: 0, patch: 0 });
  if (releaseType === "minor") return versionToString({ major: base.major, minor: base.minor + 1, patch: 0 });
  return versionToString({ ...base, patch: base.patch + 1 });
};

const inferReleaseType = (baseVersion: string | undefined, nextVersion: string, currentType: ReleaseType): ReleaseType | null => {
  const base = parseVersion(baseVersion);
  const next = parseVersion(nextVersion);
  if (!base || !next) return null;
  const patchBump = next.major === base.major && next.minor === base.minor && next.patch === base.patch + 1;
  if (currentType === "hotfix" && patchBump) return "hotfix";
  if (next.major === base.major + 1 && next.minor === 0 && next.patch === 0) return "major";
  if (next.major === base.major && next.minor === base.minor + 1 && next.patch === 0) return "minor";
  if (patchBump || (next.major === base.major && next.minor === base.minor && next.patch > base.patch)) return "patch";
  return null;
};

const releaseStatus = (release: Release, latestVersion?: string): ReleaseVisualStatus => {
  if (release.status === "deprecated") return "deprecated";
  if (!String(release.artifactRef || "").trim()) return "artifact-missing";
  if (release.version === latestVersion) return "active";
  if (release.artifactValidation?.readyForDeploy) return "validated";
  return "draft";
};

const releaseStatusLabel = (status: ReleaseVisualStatus) => {
  const labels: Record<ReleaseVisualStatus, string> = {
    draft: "טיוטה",
    "artifact-missing": "חסר Artifact",
    validated: "מאומת",
    active: "פעיל",
    deprecated: "Deprecated"
  };
  return labels[status];
};

const releaseStatusTone = (status: ReleaseVisualStatus) => {
  const tones: Record<ReleaseVisualStatus, StatusTone> = {
    draft: "neutral",
    "artifact-missing": "warning",
    validated: "success",
    active: "info",
    deprecated: "danger"
  };
  return tones[status];
};

const hasArtifactRef = (release?: Release | null) => Boolean(String(release?.artifactRef || "").trim());

const isDeployableRelease = (release?: Release | null) =>
  Boolean(release && release.status !== "deprecated" && hasArtifactRef(release) && release.artifactValidation?.readyForDeploy);

const sortReleasesByVersionDesc = (items: Release[]) =>
  [...items].sort((left, right) => compareSemver(right.version, left.version) || +new Date(right.createdAt) - +new Date(left.createdAt));

const selectDefaultDeployRelease = (items: Release[], latestVersion = "") => {
  const sorted = sortReleasesByVersionDesc(items.filter((release) => release.status !== "deprecated"));
  return (
    sorted.find((release) => release.version === latestVersion && isDeployableRelease(release)) ||
    sorted.find(isDeployableRelease) ||
    sorted.find((release) => release.version === latestVersion && hasArtifactRef(release)) ||
    sorted.find(hasArtifactRef) ||
    sorted[0] ||
    items[0] ||
    null
  );
};

const releaseReadiness = (release: Release | null, latestVersion = "") => {
  const artifactRef = hasArtifactRef(release);
  const artifactReady = Boolean(release?.artifactValidation?.readyForDeploy);
  const deprecated = release?.status === "deprecated";
  const olderThanLatest = Boolean(release?.version && latestVersion && compareSemver(release.version, latestVersion) < 0);
  const newerThanLatest = Boolean(release?.version && latestVersion && compareSemver(release.version, latestVersion) > 0);
  return {
    artifactRef,
    artifactReady,
    deprecated,
    olderThanLatest,
    newerThanLatest,
    canPlan: Boolean(release && artifactRef && !deprecated),
    canExecuteAfterDryRun: Boolean(release && artifactRef && !deprecated),
    label: !release
      ? "לא נבחרה גרסה"
      : deprecated
        ? "גרסה Deprecated"
        : !artifactRef
          ? "חסר Artifact"
          : artifactReady
            ? "מוכנה ל-Dry-run"
            : "Artifact דורש Validation"
  };
};

const sameStringSet = (left: string[], right: string[]) => {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((item) => rightSet.has(item));
};

const isPlanForCurrentSelection = ({
  plan,
  releaseId,
  deployMode,
  targetMode,
  targetSiteIds,
  allowDeployWithoutBackup
}: {
  plan: BatchDeployPlan | null;
  releaseId: string;
  deployMode: DeployMode;
  targetMode: BatchDeployTargetMode;
  targetSiteIds: string[];
  allowDeployWithoutBackup: boolean;
}) => {
  if (!plan || !releaseId) return false;
  const normalizedTargetIds = targetMode === "all" ? [] : targetSiteIds;
  return (
    plan.releaseId === releaseId &&
    plan.deployMode === deployMode &&
    plan.targetMode === targetMode &&
    Boolean(plan.allowDeployWithoutBackup) === Boolean(allowDeployWithoutBackup) &&
    sameStringSet(plan.targetSiteIds || [], normalizedTargetIds)
  );
};

const groupPlanRows = (rows: BatchDeployPlanRow[]) => ({
  ready: rows.filter((row) => row.status === "ready"),
  warning: rows.filter((row) => row.status === "warning"),
  blocked: rows.filter((row) => row.status === "blocked"),
  upToDate: rows.filter((row) => row.status === "up_to_date")
});

const remediationForDeployMessage = (message: string) => {
  const raw = String(message || "");
  const normalized = raw.toLowerCase();
  if (!normalized) return "";
  if (isBackupRequiredMessage(raw)) return "פתח גיבוי ושחזור, הרץ Backup לאתר החסום, ודא שהגיבוי במצב Verified, ואז חזור לכאן והריץ Run Dry-run מחדש.";
  if (isBackupStaleMessage(raw)) return "פתח גיבוי ושחזור והריץ Backup חדש, כי הגיבוי הקיים ישן מדי למדיניות Deploy.";
  if (isBackupOverrideMessage(raw)) return "Override פעיל: אין צורך לתקן גיבוי עבור ה-Dry-run הזה, אבל האחריות היא על מי שמאשר Execute.";
  if (normalized.includes("artifact") || normalized.includes("release-artifact")) return "חברו Artifact תקין לגרסה והריצו Validate לפני Dry-run נוסף.";
  if (normalized.includes("newer") || normalized.includes("rollback") || normalized.includes("גרסה חדשה")) return "האתר נמצא קדימה מגרסת היעד. עברו ל-Rollback מתוכנן או בחרו גרסה חדשה יותר.";
  if (normalized.includes("write") || normalized.includes("sharepoint")) return "בדקו Settings/Diagnostics כדי לוודא שיכולת כתיבה או Browser Digest זמינים לפני Execute.";
  if (normalized.includes("backup")) return "הריצו או אמתו backup עדכני לפני פריסה במצב production-safe.";
  if (normalized.includes("no target") || normalized.includes("אין אתרי יעד") || normalized.includes("אין אתרים מוכנים")) return "שנו scope, בחרו release אחר, או תקנו blockers עד שלפחות אתר אחד מוכן.";
  if (normalized.includes("stale")) return "בדקו קבצים ישנים ביעד. המדיניות הנוכחית שומרת קבצים שאינם ב-Artifact.";
  return "";
};

const buildBlockerRemediations = (plan: BatchDeployPlan) => {
  const messages = [
    ...plan.blockers,
    ...plan.warnings,
    ...plan.results.flatMap((row) => [...row.blockers, ...row.warnings])
  ];
  const remediations = messages.map(remediationForDeployMessage).filter(Boolean);
  return Array.from(new Set(remediations));
};

type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

function StatusChip({ tone = "neutral", icon, children, helpKey }: { tone?: StatusTone; icon?: ReactNode; children: ReactNode; helpKey?: string }) {
  return <span className={`badge badge-${tone}`}>{icon}{children}<HelpIcon helpKey={helpKey} className="help-icon-in-token" /></span>;
}

function SafetyGate({ ok, label, detail, helpKey }: { ok: boolean; label: string; detail: string; helpKey?: string }) {
  return (
    <div className={`soft-panel flex min-h-[4.75rem] items-start gap-3 p-3 ${ok ? "" : "panel-warning"}`}>
      <span className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${ok ? "badge-success" : "badge-warning"}`}>
        {ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
      </span>
      <div className="min-w-0">
        <p className="font-bold" style={{ color: "var(--text-strong)" }}><HelpLabel helpKey={helpKey}>{label}</HelpLabel></p>
        <p className="mt-1 text-sm muted">{detail}</p>
      </div>
    </div>
  );
}

const siteVersion = (site: Site) => site.currentVersion || site.version || "";

const siteTargetState = (site: Site, targetVersion?: string): TargetFilter => {
  const current = siteVersion(site);
  if (!current) return "missing";
  if (site.status === "failed" || (targetVersion && compareSemver(current, targetVersion) > 0)) return "blocked";
  if (targetVersion && compareSemver(current, targetVersion) === 0) return "current";
  if (targetVersion && compareSemver(current, targetVersion) < 0) return "behind";
  return "all";
};

const planRowTone = (row?: BatchDeployPlanRow): StatusTone => {
  if (!row) return "neutral";
  if (row.status === "ready") return "success";
  if (row.status === "warning" || row.status === "up_to_date") return "warning";
  return "danger";
};

const planRowLabel = (row?: BatchDeployPlanRow) => {
  if (!row) return "לא נבדק";
  if (row.status === "ready") return "מוכן";
  if (row.status === "warning") return "מוכן עם אזהרות";
  if (row.status === "up_to_date") return "כבר עדכני";
  return "חסום";
};

const isBackupRequiredMessage = (message: string) => String(message || "").includes("dangerous-write-backup-required:");
const isBackupStaleMessage = (message: string) => String(message || "").includes("dangerous-write-backup-stale:");
const isBackupOverrideMessage = (message: string) => String(message || "").includes("backup-override-accepted:");

const humanizeDeployMessage = (message: string) => {
  const normalized = String(message || "").trim();
  if (!normalized) return "";
  if (isBackupRequiredMessage(normalized)) {
    return "חסר גיבוי מאומת: לפני Deploy צריך להריץ Backup לאתר היעד ולוודא שהוא Verified. אחרי הגיבוי הרץ Dry-run מחדש.";
  }
  if (isBackupStaleMessage(normalized)) {
    return "הגיבוי המאומת ישן מדי: צריך להריץ Backup חדש או לאמת גיבוי עדכני, ואז להריץ Dry-run מחדש.";
  }
  if (isBackupOverrideMessage(normalized)) {
    return "נבחר Override מסוכן: הפריסה תמשיך בלי גיבוי מאומת.";
  }
  if (normalized === "Browser deploy requires browser Digest and per-file upload verification at execution time.") {
    return "מידע: בזמן Execute הדפדפן יבקש Digest, יעלה קבצים, ויאמת read-back לכל קובץ.";
  }
  const blockedMatch = normalized.match(/^(\d+) target site\(s\) are blocked\.$/);
  if (blockedMatch) return `${blockedMatch[1]} אתרים חסומים בתוכנית.`;
  const warningMatch = normalized.match(/^(\d+) target site\(s\) have warnings\.$/);
  if (warningMatch) return `${warningMatch[1]} אתרים מוכנים עם אזהרות.`;
  const upToDateMatch = normalized.match(/^(\d+) target site\(s\) are already up to date and will be skipped\.$/);
  if (upToDateMatch) return `${upToDateMatch[1]} אתרים כבר נמצאים בגרסה הזו וידולגו.`;
  const translations: Record<string, string> = {
    "No target sites are ready for deploy execution.": "אין אתרי יעד מוכנים להרצת Deploy.",
    "Deploy cannot run because the release artifact is missing.": "הפריסה חסומה כי חסר Artifact לגרסה הזו.",
    "Deploy cannot run because SharePoint write is not configured.": "הפריסה צריכה לרוץ דרך הדפדפן המחובר ל-SharePoint.",
    "Digest דרך הדפדפן עשוי להיות תקין, אבל העלאה דרך הדפדפן עדיין לא יושמה.": "Digest דרך הדפדפן עשוי להיות תקין, אבל העלאה דרך הדפדפן עדיין לא יושמה.",
    "Dry-run did not pass all execution gates.": "Dry-run לא עבר את כל שערי הבטיחות."
  };
  return translations[normalized] || normalized;
};

const joinMessages = (messages: string[]) => messages.map(humanizeDeployMessage).filter(Boolean).join(" | ");

function ReleaseHeader({
  capabilities,
  health,
  loading,
  onCreate,
  onNewPlan
}: {
  capabilities: OperationCapabilities | null;
  health: { status: string; mongo: string } | null;
  loading: boolean;
  onCreate: () => void;
  onNewPlan: () => void;
}) {
  const envLabel = import.meta.env.MODE === "production" ? "production-safe" : "local";

  return (
    <section className="surface-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <StatusChip tone="info" icon={<PackageCheck size={14} />} helpKey="release">Release & Deployment Control Center</StatusChip>
            <StatusChip tone={loading ? "neutral" : "success"} icon={<CircleDashed size={14} />}>{loading ? "טוען" : "פעיל"}</StatusChip>
          </div>
          <h1 className="page-title">מרכז פריסה וגרסאות</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 muted">
            יוצרים גרסה, מחברים Artifact, מאמתים, בוחרים יעד, מריצים Dry-run, ורק אז מאשרים פריסה דרך הדפדפן.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" type="button" onClick={onCreate}><Plus size={16} />צור Release</button>
          <button className="btn btn-secondary" type="button" onClick={onNewPlan}><ClipboardList size={16} />תוכנית פריסה חדשה</button>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <StatusChip tone="success" icon={<CheckCircle2 size={14} />}>API מחובר</StatusChip>
        <StatusChip tone={health?.mongo === "connected" ? "success" : "warning"} icon={<ShieldCheck size={14} />}>
          MongoDB {health?.mongo || "unknown"}
        </StatusChip>
        <StatusChip tone="success" icon={<Rocket size={14} />} helpKey="sharepoint.write">
          SharePoint דרך הדפדפן
        </StatusChip>
        <StatusChip tone="info" icon={<Info size={14} />} helpKey={envLabel === "production-safe" ? "mode.productionSafe" : "mode.localDevOwner"}>סביבה: {envLabel}</StatusChip>
      </div>
    </section>
  );
}

function ReleaseStats({
  releases,
  sites,
  versionStatus,
  latestRelease,
  latestVersion,
  lastPlan
}: {
  releases: Release[];
  sites: Site[];
  versionStatus: any;
  latestRelease: Release | null;
  latestVersion: string;
  lastPlan: BatchDeployPlan | null;
}) {
  const validReleases = releases.filter((release) => release.artifactValidation?.readyForDeploy).length;
  const missingArtifact = releases.filter((release) => !String(release.artifactRef || "").trim()).length;
  const activeSites = sites.filter((site) => site.status !== "archived").length;
  const lastPlanStatus = lastPlan
    ? lastPlan.summary.executionReady
      ? "מוכן"
      : lastPlan.summary.blockedSites
        ? "חסום"
        : "ללא יעדים"
    : "טרם";

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <KpiCard title="Latest release" value={latestVersion || latestRelease?.version || "-"} icon={<PackageCheck size={18} />} description="הגרסה האחרונה ב-registry" tone="info" helpKey="version.latest" />
      <KpiCard title="Releases מאומתים" value={formatNumber(validReleases)} icon={<CheckCircle2 size={18} />} description="Artifact תקין לפריסה" tone="success" helpKey="artifact.validation" />
      <KpiCard title="חסרי Artifact" value={formatNumber(missingArtifact)} icon={<AlertTriangle size={18} />} description="לא ניתן לפריסה עד חיבור Artifact" tone={missingArtifact ? "warning" : "success"} helpKey="artifact" />
      <KpiCard title="אתרים מחוברים" value={formatNumber(activeSites)} icon={<ShieldCheck size={18} />} description="אתרים מנוהלים שאינם בארכיון" tone="neutral" helpKey="sites.registry" />
      <KpiCard title="מאחורי latest" value={formatNumber(versionStatus?.outdatedSites || 0)} icon={<GitBranch size={18} />} description="דורשים תכנון Deploy" tone={(versionStatus?.outdatedSites || 0) ? "warning" : "success"} helpKey="version.outdated" />
      <KpiCard title="Dry-run אחרון" value={lastPlanStatus} icon={<ListChecks size={18} />} description={lastPlan ? `${formatNumber(lastPlan.summary.readySites)} מוכנים / ${formatNumber(lastPlan.summary.blockedSites)} חסומים` : "עדיין אין תוכנית"} tone={lastPlan?.summary.executionReady ? "success" : lastPlan ? "warning" : "neutral"} helpKey="deploy.dryRun" />
    </div>
  );
}

function ReleaseRegistry({
  releases,
  selectedReleaseId,
  latestVersion,
  siteUsage,
  onSelect,
  onEdit,
  onValidate,
  onDeploy
}: {
  releases: Release[];
  selectedReleaseId: string;
  latestVersion: string;
  siteUsage: Map<string, number>;
  onSelect: (releaseId: string) => void;
  onEdit: (release: Release) => void;
  onValidate: (releaseId: string) => void;
  onDeploy: (releaseId: string) => void;
}) {
  const columns: DataTableColumn<Release>[] = [
    {
      key: "version",
      header: "Release",
      helpKey: "release",
      render: (release) => (
        <button className="min-w-[180px] text-right" type="button" onClick={() => onSelect(release._id)}>
          <span className="block font-bold" style={{ color: selectedReleaseId === release._id ? "var(--accent)" : "var(--text-strong)" }}>{release.name || `Release ${release.version}`}</span>
          <span className="num mt-1 block text-xs muted">{release.version} · {releaseTypeLabel(release.releaseType)}</span>
          {!release.name ? <span className="mt-1 block text-xs" style={{ color: "var(--warning)" }}>שם חסר - אפשר לתקן</span> : null}
        </button>
      )
    },
    {
      key: "status",
      header: "סטטוס",
      helpKey: "job.status",
      render: (release) => {
        const status = releaseStatus(release, latestVersion);
        return <StatusChip tone={releaseStatusTone(status)} helpKey="release">{releaseStatusLabel(status)}</StatusChip>;
      }
    },
    {
      key: "artifact",
      header: "Artifact",
      helpKey: "artifact",
      width: 320,
      render: (release) => (
        <div className="release-inline-evidence">
          <StatusChip tone={release.artifactValidation?.readyForDeploy ? "success" : release.artifactRef ? "warning" : "danger"} helpKey="artifact.validation">
            {release.artifactValidation?.readyForDeploy ? "מאומת" : release.artifactRef ? "לא אומת" : "חסר"}
          </StatusChip>
          <code className="num truncate text-xs muted" title={release.artifactRef || ""}>{release.artifactRef || "-"}</code>
        </div>
      )
    },
    { key: "created", header: "נוצר", helpKey: "history", render: (release) => <span className="num whitespace-nowrap text-xs" dir="ltr">{formatDateTime(release.createdAt)}</span> },
    { key: "sites", header: "אתרים", helpKey: "sites.registry", render: (release) => <span className="num font-bold">{formatNumber(siteUsage.get(release.version) || 0)}</span> },
    { key: "notes", header: "הערות", helpKey: "changelog", width: 170, render: (release) => <span className="block max-w-[170px] truncate text-sm muted" title={release.notes || ""}>{release.notes || "-"}</span> },
    {
      key: "actions",
      header: "פעולות",
      helpKey: "deploy",
      width: 390,
      render: (release) => {
        const readiness = releaseReadiness(release, latestVersion);
        return (
          <div className="release-action-cluster">
            <button
              className="btn btn-primary min-h-0 px-2 py-1 text-xs"
              type="button"
              onClick={() => onDeploy(release._id)}
              disabled={!readiness.canPlan}
              title={readiness.canPlan ? "פתח Deploy Center" : readiness.label}
            >
              Deploy plan
            </button>
            <button className="btn btn-secondary min-h-0 px-2 py-1 text-xs" type="button" onClick={() => onValidate(release._id)}>Validate</button>
            <button className="btn btn-ghost min-h-0 px-2 py-1 text-xs" type="button" onClick={() => onEdit(release)}><Pencil size={13} />ערוך</button>
            <button className="btn btn-ghost min-h-0 px-2 py-1 text-xs" type="button" onClick={() => onSelect(release._id)}>פרטים</button>
          </div>
        );
      }
    }
  ];

  if (!releases.length) {
    return <EmptyState title="אין Releases" description="צור Release ראשון כדי להתחיל לנהל גרסאות ופריסות." />;
  }

  return (
    <DataTable
      columns={columns}
      rows={releases}
      rowKey={(release) => release._id}
      minWidth={1380}
      mobileCard={(release) => {
        const status = releaseStatus(release, latestVersion);
        const readiness = releaseReadiness(release, latestVersion);
        return (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <button className="min-w-0 text-right" type="button" onClick={() => onSelect(release._id)}>
                <p className="truncate font-bold" style={{ color: selectedReleaseId === release._id ? "var(--accent)" : "var(--text-strong)" }}>{release.name || `Release ${release.version}`}</p>
                <p className="num text-xs muted">{release.version} · {releaseTypeLabel(release.releaseType)} · {formatDateTime(release.createdAt)}</p>
                {!release.name ? <p className="text-xs" style={{ color: "var(--warning)" }}>שם חסר - אפשר לתקן</p> : null}
              </button>
              <StatusChip tone={releaseStatusTone(status)} helpKey="release">{releaseStatusLabel(status)}</StatusChip>
            </div>
            <code className="num block max-w-full truncate text-xs muted" title={release.artifactRef || ""}>{release.artifactRef || "-"}</code>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary flex-1" type="button" onClick={() => onDeploy(release._id)} disabled={!readiness.canPlan} title={readiness.canPlan ? "פתח Deploy Center" : readiness.label}>Deploy plan</button>
              <button className="btn btn-secondary flex-1" type="button" onClick={() => onValidate(release._id)}>Validate</button>
              <button className="btn btn-ghost flex-1" type="button" onClick={() => onEdit(release)}><Pencil size={14} />ערוך</button>
            </div>
          </div>
        );
      }}
    />
  );
}

function ReleaseDetailsPanel({
  release,
  latestVersion,
  sites,
  validation,
  validating,
  onValidate,
  onEdit,
  onDeploy,
  shell = true
}: {
  release: Release | null;
  latestVersion: string;
  sites: Site[];
  validation: ReleaseArtifactValidation | null;
  validating: boolean;
  onValidate: () => void;
  onEdit: (release: Release) => void;
  onDeploy: () => void;
  shell?: boolean;
}) {
  if (!release) {
    const emptyState = (
      <EmptyState title="אין Release נבחר" description="בחר Release לפי שם או גרסה כדי לראות Artifact, תאימות ואתרים מושפעים." />
    );
    return shell ? (
      <SectionCard title="פרטי Release" subtitle="בחר Release מהרשימה" helpKey="release">
        {emptyState}
      </SectionCard>
    ) : emptyState;
  }

  const status = releaseStatus(release, latestVersion);
  const sitesOnRelease = sites.filter((site) => siteVersion(site) === release.version);
  const behind = sites.filter((site) => site.status !== "archived" && compareSemver(siteVersion(site), release.version) < 0);
  const ahead = sites.filter((site) => site.status !== "archived" && compareSemver(siteVersion(site), release.version) > 0);
  const artifactReady = validation?.summary.readyForDeploy ?? release.artifactValidation?.readyForDeploy ?? false;
  const readiness = releaseReadiness(release, latestVersion);

  const content = (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-2xl font-bold" style={{ color: "var(--text-strong)" }}>{release.name || `Release ${release.version}`}</p>
          <p className="num mt-1 text-sm muted">{release.version} · {releaseTypeLabel(release.releaseType)} · נוצר {formatDateTime(release.createdAt)}</p>
          {!release.name ? <p className="mt-1 text-sm" style={{ color: "var(--warning)" }}>שם מזהה לא שמור ל-Release הזה. אפשר לתקן בלי לשנות Artifact או גרסה.</p> : null}
        </div>
        <button className="btn btn-secondary" type="button" onClick={() => onEdit(release)}><Pencil size={15} />ערוך Release</button>
      </div>
      <div className="grid gap-2">
        <LinkRow label="שם מזהה" value={release.name || "לא הוגדר"} />
        <LinkRow label="מספר גרסה" value={release.version} />
        <LinkRow label="Artifact reference" value={release.artifactRef || "חסר Artifact"} />
        <LinkRow label="Validation" value={artifactReady ? "Artifact מוכן לפריסה" : "Artifact לא מאומת או חסר"} />
        <LinkRow label="Created by" value={release.createdBy || "system"} />
      </div>
      {release.notes ? (
        <div className="rounded-md border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}>
          <p className="field-label">Changelog / Notes</p>
          <p className="text-sm leading-6">{release.notes}</p>
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard title="בגרסה הזו" value={formatNumber(sitesOnRelease.length)} icon={<CheckCircle2 size={16} />} tone="success" variant="inline" />
        <KpiCard title="מאחור" value={formatNumber(behind.length)} icon={<GitBranch size={16} />} tone={behind.length ? "warning" : "success"} variant="inline" />
        <KpiCard title="קדימה" value={formatNumber(ahead.length)} icon={<AlertTriangle size={16} />} tone={ahead.length ? "warning" : "neutral"} variant="inline" />
      </div>
      <div className="grid gap-2">
        <SafetyGate ok={Boolean(release.artifactRef)} label="Artifact מחובר" detail={release.artifactRef ? "יש Reference ל-dist/manifest של הגרסה." : "הפריסה חסומה כי חסר Artifact לגרסה הזו."} helpKey="artifact" />
        <SafetyGate ok={artifactReady} label="Validation" detail={artifactReady ? "Artifact עבר בדיקת קבצים ו-index.html." : "הרץ Validate לפני תכנון פריסה."} helpKey="artifact.validation" />
        {readiness.olderThanLatest ? (
          <SafetyGate ok={false} label="גרסה ישנה מה-Latest" detail="בחירה בגרסה הזו עשויה להיות Rollback ולא Deploy רגיל. אם זו הכוונה, השתמשו בלשונית Rollback." helpKey="rollback" />
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-secondary" type="button" onClick={onValidate} disabled={validating}>
          <RefreshCw size={15} />{validating ? "בודק..." : "Validate"}
        </button>
        <button className="btn btn-primary" type="button" onClick={onDeploy} disabled={!readiness.canPlan} title={readiness.canPlan ? "פתח Deploy Center" : readiness.label}><Rocket size={15} />Create Deploy Plan</button>
      </div>
    </div>
  );

  return shell ? (
    <SectionCard
      title="פרטי Release"
      subtitle="הקשר, Artifact ותאימות לפני שימוש ב-Deploy Center"
      helpKey="release"
      actions={<StatusChip tone={releaseStatusTone(status)} helpKey="release">{releaseStatusLabel(status)}</StatusChip>}
    >
      {content}
    </SectionCard>
  ) : content;
}

function TargetSiteSelector({
  sites,
  selectedRelease,
  targetMode,
  selectedSiteIds,
  search,
  filter,
  plan,
  onModeChange,
  onSelectedSiteIdsChange,
  onSearchChange,
  onFilterChange
}: {
  sites: Site[];
  selectedRelease: Release | null;
  targetMode: BatchDeployTargetMode;
  selectedSiteIds: string[];
  search: string;
  filter: TargetFilter;
  plan: BatchDeployPlan | null;
  onModeChange: (mode: BatchDeployTargetMode) => void;
  onSelectedSiteIdsChange: (siteIds: string[]) => void;
  onSearchChange: (value: string) => void;
  onFilterChange: (filter: TargetFilter) => void;
}) {
  const activeSites = sites.filter((site) => site.status !== "archived");
  const planRows = new Map((plan?.results || []).map((row) => [row.siteId, row]));
  const normalizedSearch = search.trim().toLowerCase();
  const targetVersion = selectedRelease?.version || "";
  const rows = activeSites.filter((site) => {
    const haystack = `${site.displayName} ${site.siteCode} ${site._id} ${site.environment || ""}`.toLowerCase();
    if (normalizedSearch && !haystack.includes(normalizedSearch)) return false;
    if (filter !== "all" && siteTargetState(site, targetVersion) !== filter) {
      const row = planRows.get(site._id);
      if (!(filter === "blocked" && row?.status === "blocked")) return false;
    }
    return true;
  });

  const visibleIds = rows.map((site) => site._id);
  const selectedSet = new Set(selectedSiteIds);
  const isIncluded = (siteId: string) => targetMode === "all" || selectedSet.has(siteId);
  const includedSites = activeSites.filter((site) => isIncluded(site._id));
  const archivedSitesCount = sites.length - activeSites.length;
  const targetStateCounts = includedSites.reduce(
    (acc, site) => {
      const state = siteTargetState(site, targetVersion);
      acc[state] += 1;
      return acc;
    },
    { all: 0, behind: 0, current: 0, missing: 0, blocked: 0 } as Record<TargetFilter, number>
  );
  const plannedBlocked = plan?.summary.blockedSites ?? targetStateCounts.blocked;
  const plannedReady = plan ? plan.summary.readySites + plan.summary.warningSites : targetStateCounts.behind;
  const updateOne = (siteId: string, checked: boolean) => {
    if (targetMode === "single") {
      onSelectedSiteIdsChange(checked ? [siteId] : []);
      return;
    }
    onSelectedSiteIdsChange(checked ? Array.from(new Set([...selectedSiteIds, siteId])) : selectedSiteIds.filter((id) => id !== siteId));
  };

  const columns: DataTableColumn<Site>[] = [
    {
      key: "include",
      header: "כלול",
      helpKey: "deploy.targetMode",
      render: (site) => (
        <input
          type="checkbox"
          checked={isIncluded(site._id)}
          disabled={targetMode === "all"}
          onChange={(event) => updateOne(site._id, event.target.checked)}
          aria-label={`כלול ${site.displayName}`}
        />
      )
    },
    {
      key: "site",
      header: "אתר",
      helpKey: "sites.registry",
      render: (site) => (
        <div className="min-w-0">
          <p className="truncate font-bold" style={{ color: "var(--text-strong)" }}>{site.displayName}</p>
          <p className="num text-xs muted">{site.siteCode} · {site._id}</p>
        </div>
      )
    },
    { key: "env", header: "סביבה", helpKey: "site.environment", render: (site) => <StatusChip tone="neutral" helpKey="site.environment">{site.environment || "unknown"}</StatusChip> },
    { key: "current", header: "גרסה נוכחית", helpKey: "version.current", render: (site) => <span className="num">{siteVersion(site) || "חסר מידע"}</span> },
    { key: "target", header: "גרסת יעד", helpKey: "deploy.versionChange", render: () => <span className="num">{targetVersion || "-"}</span> },
    {
      key: "status",
      header: "סטטוס",
      helpKey: "job.status",
      render: (site) => {
        const row = planRows.get(site._id);
        const fallback = siteTargetState(site, targetVersion);
        const label = row ? planRowLabel(row) : fallback === "behind" ? "מאחור" : fallback === "current" ? "כבר עדכני" : fallback === "blocked" ? "חסום" : fallback === "missing" ? "חסר מידע" : siteStatusLabel(site.status);
        const tone = row ? planRowTone(row) : fallback === "behind" ? "warning" : fallback === "current" ? "success" : fallback === "blocked" || fallback === "missing" ? "danger" : "neutral";
        return <StatusChip tone={tone} helpKey="deploy.dryRun">{label}</StatusChip>;
      }
    },
    {
      key: "blockers",
      header: "חסמים / אזהרות",
      helpKey: "deploy.blocker",
      render: (site) => {
        const row = planRows.get(site._id);
        const text = joinMessages([...(row?.blockers || []), ...(row?.warnings || [])]);
        return <code className="num block max-w-[320px] truncate text-xs muted" title={text}>{text || "-"}</code>;
      }
    }
  ];

  return (
    <div className="target-site-selector space-y-4">
      <div className="target-toolbar">
        <div>
          <p className="field-label"><HelpLabel helpKey="deploy.targetMode">Target mode</HelpLabel></p>
          <div className="segmented-control flex-wrap">
            {[
              ["single", "אתר אחד"],
              ["selected", "אתרים נבחרים"],
              ["all", "כל האתרים"]
            ].map(([mode, label]) => (
              <button key={mode} className={targetMode === mode ? "active" : ""} type="button" onClick={() => {
                onModeChange(mode as BatchDeployTargetMode);
                if (mode === "all") onSelectedSiteIdsChange([]);
                if (mode === "single") onSelectedSiteIdsChange(selectedSiteIds.slice(0, 1));
              }}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="target-toolbar-controls">
          <label>
            <span className="field-label">חיפוש אתר</span>
            <div className="relative">
              <Search className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 muted" size={16} />
              <input className="control pr-9" value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="שם אתר, Site ID, סביבה" />
            </div>
          </label>
          <label>
            <span className="field-label"><HelpLabel helpKey="filters">Filter</HelpLabel></span>
            <select className="control" value={filter} onChange={(event) => onFilterChange(event.target.value as TargetFilter)}>
              <option value="all">כל האתרים</option>
              <option value="behind">מאחורי הגרסה</option>
              <option value="current">כבר בגרסה</option>
              <option value="missing">חסר מידע</option>
              <option value="blocked">חסום</option>
            </select>
          </label>
          <div className="flex gap-2">
            <button className="btn btn-secondary" type="button" disabled={targetMode === "all"} onClick={() => onSelectedSiteIdsChange(targetMode === "single" ? visibleIds.slice(0, 1) : visibleIds)}>בחר הכל</button>
            <button className="btn btn-secondary" type="button" disabled={targetMode === "all"} onClick={() => onSelectedSiteIdsChange([])}>נקה</button>
          </div>
        </div>
      </div>

      <div className="target-scope-grid">
        <div className="soft-panel p-3">
          <p className="field-label">Blast radius</p>
          <p className="num text-xl font-bold" style={{ color: "var(--text-strong)" }}>{formatNumber(includedSites.length)}</p>
          <p className="text-xs muted">אתרים פעילים בתוך ה-scope</p>
        </div>
        <div className="soft-panel p-3">
          <p className="field-label">צפויים להשתנות</p>
          <p className="num text-xl font-bold" style={{ color: plannedReady ? "var(--warning)" : "var(--text-strong)" }}>{formatNumber(plannedReady)}</p>
          <p className="text-xs muted">לפני/אחרי Dry-run</p>
        </div>
        <div className="soft-panel p-3">
          <p className="field-label">כבר עדכניים</p>
          <p className="num text-xl font-bold" style={{ color: "var(--success)" }}>{formatNumber(plan?.summary.alreadyUpToDateSites ?? targetStateCounts.current)}</p>
          <p className="text-xs muted">יידולגו בביצוע</p>
        </div>
        <div className="soft-panel p-3">
          <p className="field-label">חסומים/חסרי מידע</p>
          <p className="num text-xl font-bold" style={{ color: plannedBlocked || targetStateCounts.missing ? "var(--danger)" : "var(--text-strong)" }}>{formatNumber(plannedBlocked + targetStateCounts.missing)}</p>
          <p className="text-xs muted">דורשים טיפול לפני Execute</p>
        </div>
        <div className="soft-panel p-3">
          <p className="field-label">מחוץ ל-scope</p>
          <p className="num text-xl font-bold" style={{ color: "var(--text-strong)" }}>{formatNumber(archivedSitesCount + (targetMode === "all" ? 0 : activeSites.length - includedSites.length))}</p>
          <p className="text-xs muted">Archived או לא נבחרו</p>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(site) => site._id}
        minWidth={1120}
        density="dense"
        mobileCard={(site) => {
          const row = planRows.get(site._id);
          return (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <label className="flex min-w-0 items-start gap-2">
                  <input type="checkbox" checked={isIncluded(site._id)} disabled={targetMode === "all"} onChange={(event) => updateOne(site._id, event.target.checked)} />
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{site.displayName}</span>
                    <span className="num block text-xs muted">{site.siteCode} · {site.environment || "unknown"}</span>
                  </span>
                </label>
                <StatusChip tone={planRowTone(row)}>{planRowLabel(row)}</StatusChip>
              </div>
              <p className="num text-xs">{siteVersion(site) || "חסר מידע"} ← {targetVersion || "-"}</p>
              <code className="num block max-w-full truncate text-xs muted" title={joinMessages([...(row?.blockers || []), ...(row?.warnings || [])])}>
                {joinMessages([...(row?.blockers || []), ...(row?.warnings || [])]) || "-"}
              </code>
            </div>
          );
        }}
      />
    </div>
  );
}

function DeploymentPlanResults({ plan }: { plan: BatchDeployPlan }) {
  const groups = groupPlanRows(plan.results);
  const remediations = buildBlockerRemediations(plan);
  const changingSites = groups.ready.length + groups.warning.length;
  const allMessages = [
    ...plan.blockers,
    ...plan.warnings,
    ...plan.results.flatMap((row) => [...row.blockers, ...row.warnings])
  ];
  const hasBackupBlocker = allMessages.some((message) => isBackupRequiredMessage(message) || isBackupStaleMessage(message));
  const backupBlockedRows = groups.blocked.filter((row) => row.blockers.some((message) => isBackupRequiredMessage(message) || isBackupStaleMessage(message)));
  const backupActionLink = backupBlockedRows.length === 1 ? `/sites/${backupBlockedRows[0].siteId}?tab=backups` : "/backups";
  const uniquePlanBlockers = Array.from(new Set(plan.blockers.map(humanizeDeployMessage).filter(Boolean)));
  const blockedRowsWithReasons = groups.blocked.map((row) => ({
    row,
    reasons: [...row.blockers, ...row.warnings].map(humanizeDeployMessage).filter(Boolean)
  }));
  const columns: DataTableColumn<BatchDeployPlanRow>[] = [
    {
      key: "site",
      header: "אתר",
      render: (row) => (
        <div>
          <p className="font-bold" style={{ color: "var(--text-strong)" }}>{row.displayName}</p>
          <p className="num text-xs muted">{row.siteCode} · {row.environment}</p>
        </div>
      )
    },
    { key: "current", header: "נוכחי", helpKey: "version.current", render: (row) => <span className="num">{row.currentVersion || "חסר"}</span> },
    { key: "target", header: "יעד", helpKey: "deploy.versionChange", render: (row) => <span className="num">{row.targetVersion}</span> },
    { key: "files", header: "קבצים", helpKey: "artifact", render: (row) => <span className="num">{row.plan ? formatNumber(row.plan.summary.filesCount) : "-"}</span> },
    { key: "stale", header: "Stale", helpKey: "deploy.warning", render: (row) => <span className="num">{row.plan?.summary.staleTargetFilesCount ? formatNumber(row.plan.summary.staleTargetFilesCount) : "-"}</span> },
    { key: "status", header: "מוכנות", helpKey: "deploy.dryRun", render: (row) => <StatusChip tone={planRowTone(row)} helpKey="deploy.dryRun">{planRowLabel(row)}</StatusChip> },
    {
      key: "reason",
      header: "סיבות",
      helpKey: "deploy.blocker",
      render: (row) => {
        const text = joinMessages([...row.blockers, ...row.warnings]);
        return <code className="num block max-w-[420px] truncate text-xs muted" title={text}>{text || "-"}</code>;
      }
    }
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-5">
        <KpiCard title="נבחרו" value={formatNumber(plan.summary.totalSelectedSites)} icon={<Filter size={18} />} tone="neutral" variant="inline" helpKey="deploy.targetMode" />
        <KpiCard title="מוכנים" value={formatNumber(plan.summary.readySites)} icon={<CheckCircle2 size={18} />} tone="success" variant="inline" helpKey="deploy.dryRun" />
        <KpiCard title="חסומים" value={formatNumber(plan.summary.blockedSites)} icon={<AlertTriangle size={18} />} tone={plan.summary.blockedSites ? "danger" : "success"} variant="inline" helpKey="deploy.blocker" />
        <KpiCard title="אזהרות" value={formatNumber(plan.summary.warningSites)} icon={<Info size={18} />} tone={plan.summary.warningSites ? "warning" : "neutral"} variant="inline" helpKey="deploy.warning" />
        <KpiCard title="כבר עדכני" value={formatNumber(plan.summary.alreadyUpToDateSites)} icon={<CheckCircle2 size={18} />} tone="info" variant="inline" helpKey="version.status" />
      </div>
      <div className="flex flex-wrap gap-2">
        <StatusChip tone={plan.connectorMode === "browser-sharepoint" ? "success" : "warning"}>
          Browser Digest: ייבדק בזמן Execute
        </StatusChip>
        <StatusChip tone="success">Browser Upload: מוכן</StatusChip>
        <StatusChip tone="info">Server SharePoint: מושבת</StatusChip>
        {plan.allowDeployWithoutBackup ? <StatusChip tone="warning">גיבוי: Override מסוכן פעיל</StatusChip> : null}
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <div className="soft-panel p-3">
          <p className="field-label">Will deploy</p>
          <p className="num text-xl font-bold" style={{ color: changingSites ? "var(--success)" : "var(--text-strong)" }}>{formatNumber(changingSites)}</p>
          <p className="text-xs muted">Ready + warnings, בכפוף ל-Review</p>
        </div>
        <div className="soft-panel p-3">
          <p className="field-label">Ready clean</p>
          <p className="num text-xl font-bold" style={{ color: "var(--success)" }}>{formatNumber(groups.ready.length)}</p>
          <p className="text-xs muted">ללא blockers או warnings</p>
        </div>
        <div className="soft-panel p-3">
          <p className="field-label">Already current</p>
          <p className="num text-xl font-bold" style={{ color: "var(--info)" }}>{formatNumber(groups.upToDate.length)}</p>
          <p className="text-xs muted">יוצגו אך לא ייפרסו מחדש</p>
        </div>
        <div className="soft-panel p-3">
          <p className="field-label">Blocked</p>
          <p className="num text-xl font-bold" style={{ color: groups.blocked.length ? "var(--danger)" : "var(--text-strong)" }}>{formatNumber(groups.blocked.length)}</p>
          <p className="text-xs muted">דורשים remediation</p>
        </div>
      </div>
      {hasBackupBlocker ? (
        <div className="panel panel-warning p-4 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="max-w-3xl">
              <p className="flex items-center gap-2 text-base font-bold" style={{ color: "var(--warning)" }}><AlertTriangle size={17} />חסר גיבוי מאומת לפני Deploy</p>
              <p className="mt-1 muted">המערכת עומדת לדרוס קבצים חיים ב־SharePoint. לכן היא דורשת Backup תקין ומאומת לאתר היעד לפני Execute.</p>
              <p className="mt-2 font-bold" style={{ color: "var(--text-strong)" }}>מה לעשות: או להריץ Backup ולאמת אותו, או לסמן את אפשרות ה־Override המסוכנת בשלב Target Sites ואז להריץ Dry-run מחדש.</p>
            </div>
            <Link className="btn btn-primary" to={backupActionLink}>פתח גיבוי ושחזור</Link>
          </div>
        </div>
      ) : null}
      {!changingSites ? (
        <div className="panel panel-warning p-3 text-sm">
          <p className="flex items-center gap-2 font-bold" style={{ color: "var(--warning)" }}><AlertTriangle size={16} />Dry-run לא ישנה אף אתר כרגע.</p>
          <p className="mt-1 muted">בחרו release אחר, שנו scope, או תקנו blockers לפני מעבר ל-Execute.</p>
        </div>
      ) : null}
      {plan.blockers.length ? (
        <div className="panel panel-warning p-3 text-sm">
          <p className="mb-2 flex items-center gap-2 font-bold" style={{ color: "var(--warning)" }}><AlertTriangle size={16} />הפריסה חסומה</p>
          <ul className="list-inside list-disc space-y-1">
            {uniquePlanBlockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
          </ul>
        </div>
      ) : (
        <div className="panel panel-success p-3 text-sm">
          <p className="flex items-center gap-2 font-bold" style={{ color: "var(--success)" }}><CheckCircle2 size={16} />Dry-run עבר. כל היעדים הנדרשים מוכנים להרצה.</p>
        </div>
      )}
      {!hasBackupBlocker && remediations.length ? (
        <div className="panel p-3 text-sm">
          <p className="mb-2 font-bold" style={{ color: "var(--text-strong)" }}>מה צריך לעשות עכשיו</p>
          <ul className="list-inside list-disc space-y-1">
            {remediations.map((remediation) => <li key={remediation}>{remediation}</li>)}
          </ul>
        </div>
      ) : null}
      {blockedRowsWithReasons.length ? (
        <div className="panel p-3 text-sm">
          <p className="mb-2 font-bold" style={{ color: "var(--text-strong)" }}>למה כל אתר חסום</p>
          <div className="space-y-3">
            {blockedRowsWithReasons.map(({ row, reasons }) => (
              <div key={row.siteId} className="rounded-md border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold" style={{ color: "var(--text-strong)" }}>{row.displayName} <span className="num text-xs muted">({row.siteCode})</span></p>
                  <StatusChip tone="danger">חסום</StatusChip>
                </div>
                {reasons.length ? (
                  <ul className="mt-2 list-inside list-disc space-y-1">
                    {reasons.map((reason) => <li key={reason}>{reason}</li>)}
                  </ul>
                ) : (
                  <p className="mt-2 muted">אין סיבה מפורטת מהשרת. הרץ Dry-run מחדש ובדוק Diagnostics.</p>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <DataTable
        columns={columns}
        rows={plan.results}
        rowKey={(row) => row.siteId}
        minWidth={980}
        mobileCard={(row) => (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-bold">{row.displayName}</p>
                <p className="num text-xs muted">{row.currentVersion || "חסר"} ← {row.targetVersion}</p>
              </div>
              <StatusChip tone={planRowTone(row)}>{planRowLabel(row)}</StatusChip>
            </div>
            <code className="num block max-w-full truncate text-xs muted" title={joinMessages([...row.blockers, ...row.warnings])}>
              {joinMessages([...row.blockers, ...row.warnings]) || "-"}
            </code>
          </div>
        )}
      />
    </div>
  );
}

function DeployWizard({
  releases,
  sites,
  selectedRelease,
  selectedReleaseId,
  latestVersion,
  capabilities,
  deployMode,
  allowDeployWithoutBackup,
  targetMode,
  targetSiteIds,
  search,
  filter,
  step,
  plan,
  busyAction,
  deployResult,
  browserDeployResults,
  onSelectRelease,
  onDeployModeChange,
  onAllowDeployWithoutBackupChange,
  onTargetModeChange,
  onTargetSiteIdsChange,
  onSearchChange,
  onFilterChange,
  onStepChange,
  onBuildPlan,
  onExecute
}: {
  releases: Release[];
  sites: Site[];
  selectedRelease: Release | null;
  selectedReleaseId: string;
  latestVersion: string;
  capabilities: OperationCapabilities | null;
  deployMode: DeployMode;
  allowDeployWithoutBackup: boolean;
  targetMode: BatchDeployTargetMode;
  targetSiteIds: string[];
  search: string;
  filter: TargetFilter;
  step: DeployStep;
  plan: BatchDeployPlan | null;
  busyAction: string;
  deployResult: DeployExecutionResult | null;
  browserDeployResults: BrowserDeploySiteResult[];
  onSelectRelease: (releaseId: string) => void;
  onDeployModeChange: (mode: DeployMode) => void;
  onAllowDeployWithoutBackupChange: (value: boolean) => void;
  onTargetModeChange: (mode: BatchDeployTargetMode) => void;
  onTargetSiteIdsChange: (siteIds: string[]) => void;
  onSearchChange: (value: string) => void;
  onFilterChange: (filter: TargetFilter) => void;
  onStepChange: (step: DeployStep) => void;
  onBuildPlan: () => void;
  onExecute: () => void;
}) {
  const readiness = releaseReadiness(selectedRelease, latestVersion);
  const planFresh = isPlanForCurrentSelection({ plan, releaseId: selectedReleaseId, deployMode, targetMode, targetSiteIds, allowDeployWithoutBackup });
  const readyRows = planFresh ? plan?.results.filter((row) => row.status === "ready" || row.status === "warning") || [] : [];
  const browserDeployMode = planFresh && plan?.connectorMode === "browser-sharepoint";
  const browserUploadReady = browserDeployMode && readyRows.length > 0;
  const planHasBackupBlocker = Boolean(plan && [
    ...plan.blockers,
    ...plan.warnings,
    ...plan.results.flatMap((row) => [...row.blockers, ...row.warnings])
  ].some((message) => isBackupRequiredMessage(message) || isBackupStaleMessage(message)));
  const deployRequestReady =
    Boolean(selectedReleaseId) &&
    readiness.canPlan &&
    (targetMode === "all" || targetSiteIds.length > 0);
  const executionDisabledReason = !plan
    ? "יש להריץ Dry-run לפני Execute."
    : !planFresh
      ? "Dry-run לא תואם לבחירה הנוכחית. הריצו Dry-run מחדש."
      : !readiness.canExecuteAfterDryRun
        ? "Execution חסום כי ה-Release לא מוכן לתכנון פריסה."
        : readyRows.length === 0
          ? "Execution חסום כי אין אתרים מוכנים."
          : !browserDeployMode
            ? "Execution חסום כי Dry-run לא מסומן כ־Browser SharePoint."
            : "";

  const selectedTargetText = targetMode === "all"
    ? "כל האתרים המנוהלים"
    : targetSiteIds.length === 1
      ? "אתר אחד"
      : `${formatNumber(targetSiteIds.length)} אתרים`;

  return (
    <SectionCard
      title="מרכז פריסה"
      subtitle="בחר Release, בחר יעד אחד או קבוצה, הרץ Dry-run, ורק אז אשר פריסה."
      helpKey="deploy"
      actions={<StatusChip tone={browserDeployMode ? "success" : "warning"} helpKey={browserDeployMode ? "sharepoint.write" : "sharepoint.writeBlocked"}>{browserDeployMode ? "דפדפן SharePoint" : "נדרש Dry-run דפדפן"}</StatusChip>}
    >
      <div className="deploy-current-release">
        <div>
          <p className="field-label">מה נבחר עכשיו</p>
          <h3>{selectedRelease ? releaseDisplayLabel(selectedRelease) : "לא נבחר Release"}</h3>
          <p>{selectedRelease ? `${releaseTypeLabel(selectedRelease.releaseType)} · ${readiness.label}` : "בחרו Release מוכן כדי להתחיל תוכנית פריסה."}</p>
        </div>
        <div className="deploy-current-release-meta">
          <StatusChip tone={readiness.canPlan ? "success" : "warning"} helpKey="release">{readiness.label}</StatusChip>
          <span className="text-xs muted">{selectedTargetText}</span>
        </div>
      </div>

      <div className="operation-stepper">
        {[
          ["בחירת Release", selectedRelease ? `${releaseDisplayLabel(selectedRelease)} · ${readiness.label}` : "בחר Release"],
          ["בחירת אתרים", selectedTargetText],
          ["Dry-run וחסמים", plan ? planFresh ? `${formatNumber(plan.summary.readySites)} מוכנים` : "דורש רענון" : "לא הורץ"],
          ["סקירה והרצה", executionDisabledReason || "מוכן להרצה דרך הדפדפן"]
        ].map(([title, text], index) => {
          const currentStep = (index + 1) as DeployStep;
          const stateClass = step > currentStep ? "operation-step-done" : step === currentStep ? "operation-step-active" : "";
          return (
            <button key={title} className={`operation-step text-right ${stateClass}`} type="button" onClick={() => onStepChange(currentStep)}>
              <span className="operation-step-number">{currentStep}</span>
              <p className="operation-step-title">{title}</p>
              <p className="operation-step-text">{text}</p>
            </button>
          );
        })}
      </div>

      {step === 1 ? (
        <div className="deploy-step-panel space-y-4">
          <label>
            <span className="field-label"><HelpLabel helpKey="release">Release לפריסה</HelpLabel></span>
            <select className="control" value={selectedReleaseId} onChange={(event) => onSelectRelease(event.target.value)}>
              {releases.map((release) => <option key={release._id} value={release._id}>{releaseOptionLabel(release, releaseTypeLabel(release.releaseType))}</option>)}
            </select>
          </label>
          <div className="grid gap-3 md:grid-cols-3">
            <SafetyGate ok={Boolean(selectedRelease?.artifactRef)} label="Artifact" detail={selectedRelease?.artifactRef ? "Artifact reference קיים." : "Deploy חסום עד חיבור Artifact."} helpKey="artifact" />
            <SafetyGate ok={Boolean(selectedRelease?.artifactValidation?.readyForDeploy)} label="Validation" detail={selectedRelease?.artifactValidation?.readyForDeploy ? "הגרסה אומתה בעבר." : "Dry-run יריץ validation ויציג blockers."} helpKey="artifact.validation" />
            <SafetyGate ok label="Browser Upload" detail="הדפדפן ישתמש ב־Digest מאתר היעד, יעלה קבצים, ויאמת read-back לפני עדכון גרסה." helpKey="sharepoint.write" />
          </div>
          {readiness.olderThanLatest ? (
            <div className="panel panel-warning p-3 text-sm">
              <p className="font-bold" style={{ color: "var(--warning)" }}>הגרסה שנבחרה ישנה מה-Latest ({latestVersion}).</p>
              <p className="mt-1 muted">אם המטרה היא לחזור אחורה, השתמשו ב-Rollback. Deploy רגיל צריך בדרך כלל להשתמש בגרסה החדשה ביותר שמוכנה לפריסה.</p>
            </div>
          ) : null}
          {!readiness.canPlan ? (
            <div className="panel panel-warning p-3 text-sm">
              <p className="font-bold" style={{ color: "var(--warning)" }}>{readiness.label}</p>
              <p className="mt-1 muted">חברו Artifact תקין או בחרו Release אחר לפני Target Sites ו-Dry-run.</p>
            </div>
          ) : null}
          <div className="flex justify-end">
            <button className="btn btn-primary" type="button" disabled={!selectedReleaseId || !readiness.canPlan} onClick={() => onStepChange(2)}>
              המשך לבחירת אתרים <ChevronLeft size={16} />
            </button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="deploy-step-panel space-y-4">
          <div className="deploy-mode-grid">
            <label>
              <span className="field-label"><HelpLabel helpKey="deploy.mode">Deploy mode</HelpLabel></span>
              <select className="control" value={deployMode} onChange={(event) => onDeployModeChange(event.target.value as DeployMode)}>
                <option value="local-dev-owner">Local/dev owner deploy</option>
                <option value="production-safe">Production-safe deploy</option>
              </select>
            </label>
            <div className="deploy-help-card">
              <p className="font-bold" style={{ color: "var(--text-strong)" }}>הבהרה חשובה</p>
              <p className="mt-1 muted">אתרים שכבר נמצאים בגרסה הזו לא ייפרסו מחדש. אתרים חסומים יוצגו לפני Execute.</p>
            </div>
          </div>
          <label className={`danger-override-panel ${allowDeployWithoutBackup ? "danger-override-panel-active" : ""}`}>
            <span className="flex items-start gap-3">
              <input
                className="mt-1"
                type="checkbox"
                checked={allowDeployWithoutBackup}
                disabled={deployMode !== "local-dev-owner"}
                onChange={(event) => onAllowDeployWithoutBackupChange(event.target.checked)}
              />
              <span>
                <span className="block font-bold" style={{ color: allowDeployWithoutBackup ? "var(--warning)" : "var(--text-strong)" }}>
                  כן, זה מסוכן, אני רוצה לאפשר Deploy בלי גיבוי מאומת
                </span>
                <span className="mt-1 block muted">
                  אם זה מסומן, Dry-run במצב Browser + Local/dev owner לא יחסום אתר רק בגלל שחסר Backup. Production-safe עדיין דורש גיבוי.
                </span>
              </span>
            </span>
          </label>
          <TargetSiteSelector
            sites={sites}
            selectedRelease={selectedRelease}
            targetMode={targetMode}
            selectedSiteIds={targetSiteIds}
            search={search}
            filter={filter}
            plan={plan}
            onModeChange={onTargetModeChange}
            onSelectedSiteIdsChange={onTargetSiteIdsChange}
            onSearchChange={onSearchChange}
            onFilterChange={onFilterChange}
          />
          <div className="flex flex-wrap justify-between gap-2">
            <button className="btn btn-secondary" type="button" onClick={() => onStepChange(1)}>חזרה</button>
            <button className="btn btn-primary" type="button" disabled={!deployRequestReady} onClick={() => onStepChange(3)}>
              המשך ל-Dry-run <ChevronLeft size={16} />
            </button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="deploy-step-panel space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-bold" style={{ color: "var(--text-strong)" }}><HelpLabel helpKey="deploy.dryRun">Dry-run / Deployment plan</HelpLabel></p>
              <p className="mt-1 text-sm muted">המערכת תבדוק Artifact, גרסאות יעד, נתיבי יעד, blockers ואזהרות לכל אתר. הפריסה עצמה תרוץ דרך חיבור SharePoint בדפדפן.</p>
            </div>
            <button className="btn btn-primary" type="button" disabled={!deployRequestReady || busyAction === "batch-plan"} onClick={onBuildPlan}>
              <ListChecks size={16} />{busyAction === "batch-plan" ? "מריץ..." : "Run Dry-run"}
            </button>
          </div>
          {plan ? (
            planFresh ? (
              <>
                <DeploymentPlanResults plan={plan} />
                {planHasBackupBlocker && deployMode === "local-dev-owner" && plan.connectorMode === "browser-sharepoint" && !allowDeployWithoutBackup ? (
                  <label className="danger-override-panel danger-override-panel-active">
                    <span className="flex items-start gap-3">
                      <input className="mt-1" type="checkbox" checked={false} onChange={(event) => onAllowDeployWithoutBackupChange(event.target.checked)} />
                      <span>
                        <span className="block font-bold" style={{ color: "var(--warning)" }}>כן, זה מסוכן, אני רוצה לאפשר Deploy בלי גיבוי מאומת</span>
                        <span className="mt-1 block muted">סימון האפשרות יאפס את ה־Dry-run. אחר כך לחץ Run Dry-run שוב, והחסימה של גיבוי תהפוך לאזהרה במקום blocker.</span>
                      </span>
                    </span>
                  </label>
                ) : null}
              </>
            ) : (
              <div className="panel panel-warning p-3 text-sm">
                <p className="font-bold" style={{ color: "var(--warning)" }}>ה-Dry-run כבר לא תואם לבחירה הנוכחית.</p>
                <p className="mt-1 muted">שיניתם Release, mode או scope אחרי התוכנית. הריצו Dry-run מחדש כדי למנוע Execute על תוכנית לא עדכנית.</p>
              </div>
            )
          ) : <EmptyState title="אין Dry-run עדיין" description="הרץ Dry-run כדי לראות מי מוכן, מי חסום ולמה." />}
          <div className="flex flex-wrap justify-between gap-2">
            <button className="btn btn-secondary" type="button" onClick={() => onStepChange(2)}>חזרה</button>
            <button className="btn btn-primary" type="button" disabled={!plan || !planFresh} onClick={() => onStepChange(4)}>Review</button>
          </div>
        </div>
      ) : null}

      {step === 4 ? (
        <div className="deploy-step-panel space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <SafetyGate ok={readiness.canPlan} label="Release" detail={selectedRelease ? `${releaseDisplayLabel(selectedRelease)} · ${readiness.label}` : "לא נבחר Release."} helpKey="release" />
            <SafetyGate ok={Boolean(plan && planFresh)} label="Dry-run" detail={plan ? planFresh ? `נוצר ב-${formatDateTime(plan.generatedAt)}.` : "התוכנית לא תואמת לבחירה הנוכחית." : "חסר Dry-run."} helpKey="deploy.dryRun" />
            <SafetyGate ok={readyRows.length > 0} label="Ready targets" detail={readyRows.length ? `${formatNumber(readyRows.length)} אתרים מוכנים לפריסה.` : "אין יעדים מוכנים."} helpKey="deploy.blocker" />
            <SafetyGate ok={browserUploadReady} label="העלאה דרך הדפדפן" detail={browserUploadReady ? "הדפדפן מחובר ל־SharePoint ומוכן לפריסה." : "נדרש Dry-run במצב Browser SharePoint עם יעדים מוכנים."} helpKey={browserUploadReady ? "sharepoint.write" : "sharepoint.writeBlocked"} />
          </div>
          {plan && planFresh ? <DeploymentPlanResults plan={plan} /> : null}
          {executionDisabledReason ? (
            <div className="panel panel-warning p-3 text-sm">
              <p className="flex items-center gap-2 font-bold" style={{ color: "var(--warning)" }}><AlertTriangle size={16} />{executionDisabledReason}</p>
            </div>
          ) : null}
          <div className="flex flex-wrap justify-between gap-2">
            <button className="btn btn-secondary" type="button" onClick={() => onStepChange(3)}>חזרה</button>
            <button className="btn btn-danger" type="button" disabled={Boolean(executionDisabledReason) || busyAction === "batch-run"} onClick={onExecute}>
              <Rocket size={16} />{busyAction === "batch-run" ? "פורס דרך הדפדפן..." : "בצע פריסה דרך הדפדפן"}
            </button>
          </div>
          {browserDeployResults.length ? (
            <div className="space-y-2">
              {browserDeployResults.map((result) => (
                <div key={result.siteId} className={`panel p-3 text-sm ${result.status === "success" ? "panel-success" : result.status === "failed" ? "panel-warning" : ""}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-bold" style={{ color: "var(--text-strong)" }}>{result.displayName} · {result.siteCode}</p>
                    <StatusChip tone={result.status === "success" ? "success" : result.status === "failed" ? "danger" : "info"}>{result.status}</StatusChip>
                  </div>
                  <p className="mt-1 muted">{result.message}</p>
                  <p className="num mt-1 text-xs muted">{formatNumber(result.verifiedFilesCount)}/{formatNumber(result.filesCount)} verified · {formatNumber(result.failedFilesCount)} failed</p>
                </div>
              ))}
            </div>
          ) : null}
          {deployResult ? (
            <div className="panel panel-success p-3 text-sm">
              <p className="font-bold" style={{ color: "var(--success)" }}>{deployResult.message || "Browser deploy completed"}</p>
              <p className="num mt-1 muted">{formatNumber(deployResult.results.filter((item) => item.status === "success").length)} succeeded / {formatNumber(deployResult.results.length)} sites</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </SectionCard>
  );
}

function RollbackPanel({
  releases,
  sites,
  selectedReleaseId,
  selectedSiteIds,
  reason,
  planRows,
  busyAction,
  onReleaseChange,
  onSiteIdsChange,
  onReasonChange,
  onPlan,
  onOpenConfirm
}: {
  releases: Release[];
  sites: Site[];
  selectedReleaseId: string;
  selectedSiteIds: string[];
  reason: string;
  planRows: RollbackPlanRow[];
  busyAction: string;
  onReleaseChange: (releaseId: string) => void;
  onSiteIdsChange: (siteIds: string[]) => void;
  onReasonChange: (reason: string) => void;
  onPlan: () => void;
  onOpenConfirm: () => void;
}) {
  const activeSites = sites.filter((site) => site.status !== "archived");
  const selectedRelease = releases.find((release) => release._id === selectedReleaseId) || null;
  const selectedSet = new Set(selectedSiteIds);
  const ready = planRows.length > 0 && planRows.every((row) => row.ready);
  const rowsBySiteId = new Map(planRows.map((row) => [row.site._id, row]));
  const columns: DataTableColumn<Site>[] = [
    {
      key: "include",
      header: "כלול",
      render: (site) => (
        <input
          type="checkbox"
          checked={selectedSet.has(site._id)}
          onChange={(event) => onSiteIdsChange(event.target.checked ? [...selectedSiteIds, site._id] : selectedSiteIds.filter((id) => id !== site._id))}
          aria-label={`בחר ${site.displayName} ל-Rollback`}
        />
      )
    },
    { key: "site", header: "אתר", helpKey: "sites.registry", render: (site) => <div><p className="font-bold">{site.displayName}</p><p className="num text-xs muted">{site.siteCode}</p></div> },
    { key: "current", header: "נוכחי", helpKey: "version.current", render: (site) => <span className="num">{siteVersion(site) || "-"}</span> },
    {
      key: "plan",
      header: "Plan",
      helpKey: "rollback",
      render: (site) => {
        const row = rowsBySiteId.get(site._id);
        return row ? <StatusChip tone={row.ready ? "success" : "danger"} helpKey="rollback">{row.ready ? "מוכן" : "חסום"}</StatusChip> : <StatusChip tone="neutral" helpKey="rollback">לא נבדק</StatusChip>;
      }
    },
    {
      key: "reason",
      header: "סיבות",
      helpKey: "deploy.blocker",
      render: (site) => {
        const row = rowsBySiteId.get(site._id);
        const text = [...(row?.blockers || []), ...(row?.warnings || [])].join(" | ");
        return <code className="num block max-w-[360px] truncate text-xs muted" title={text}>{text || "-"}</code>;
      }
    }
  ];

  return (
    <SectionCard
      title="Rollback"
      subtitle="אזור מתקדם ובטוח לחזרה לגרסה ישנה. Rollback לא מתערבב עם Deploy רגיל."
      helpKey="rollback"
      actions={<StatusChip tone="success" helpKey="sharepoint.write">Execution דרך הדפדפן</StatusChip>}
    >
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <label>
            <span className="field-label"><HelpLabel helpKey="rollback">גרסת יעד ל-Rollback</HelpLabel></span>
            <select className="control" value={selectedReleaseId} onChange={(event) => onReleaseChange(event.target.value)}>
              {releases.map((release) => <option key={release._id} value={release._id}>{releaseOptionLabel(release, releaseTypeLabel(release.releaseType))}</option>)}
            </select>
          </label>
          <label>
            <span className="field-label"><HelpLabel helpKey="rollback">סיבת Rollback</HelpLabel></span>
            <input className="control" value={reason} onChange={(event) => onReasonChange(event.target.value)} placeholder="לדוגמה: תקלה בגרסה האחרונה, לאחר בדיקת backup" />
          </label>
        </div>
        <div className="deploy-current-release rollback-release-summary">
          <div>
            <p className="field-label">Release יעד</p>
            <h3>{selectedRelease ? releaseDisplayLabel(selectedRelease) : "לא נבחר Release"}</h3>
            <p>{selectedRelease ? `${releaseTypeLabel(selectedRelease.releaseType)} · ${selectedRelease.artifactValidation?.readyForDeploy ? "Artifact מאומת" : "נדרש Validate לפני הרצה"}` : "בחרו גרסה שאליה רוצים לחזור לפני תכנון Rollback."}</p>
          </div>
          <StatusChip tone={selectedRelease?.artifactValidation?.readyForDeploy ? "success" : "warning"} helpKey="artifact.validation">
            {selectedRelease?.artifactValidation?.readyForDeploy ? "מוכן לתכנון" : "דורש בדיקה"}
          </StatusChip>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-secondary" type="button" onClick={() => onSiteIdsChange(activeSites.map((site) => site._id))}>בחר הכל</button>
          <button className="btn btn-secondary" type="button" onClick={() => onSiteIdsChange([])}>נקה</button>
          <button className="btn btn-primary" type="button" disabled={!selectedReleaseId || selectedSiteIds.length === 0 || busyAction === "rollback-plan"} onClick={onPlan}>
            <RotateCcw size={16} />Plan rollback
          </button>
          <button className="btn btn-danger" type="button" disabled={!ready || busyAction === "rollback-run"} onClick={onOpenConfirm}>
            <RotateCcw size={16} />Execute rollback
          </button>
        </div>
        {!ready ? (
          <div className="panel panel-warning p-3 text-sm">
            <p className="font-bold" style={{ color: "var(--warning)" }}>Rollback נשאר חסום עד שקיים Plan תקין לכל האתרים הנבחרים.</p>
          </div>
        ) : null}
        <DataTable
          columns={columns}
          rows={activeSites}
          rowKey={(site) => site._id}
          minWidth={900}
          density="dense"
          mobileCard={(site) => {
            const row = rowsBySiteId.get(site._id);
            return (
              <div className="space-y-3">
                <label className="flex items-start gap-2">
                  <input type="checkbox" checked={selectedSet.has(site._id)} onChange={(event) => onSiteIdsChange(event.target.checked ? [...selectedSiteIds, site._id] : selectedSiteIds.filter((id) => id !== site._id))} />
                  <span>
                    <span className="block font-bold">{site.displayName}</span>
                    <span className="num block text-xs muted">{siteVersion(site) || "-"}</span>
                  </span>
                </label>
                <StatusChip tone={row?.ready ? "success" : row ? "danger" : "neutral"}>{row?.ready ? "מוכן" : row ? "חסום" : "לא נבדק"}</StatusChip>
              </div>
            );
          }}
        />
      </div>
    </SectionCard>
  );
}

function CreateReleaseModal({
  open,
  busy,
  latestVersion,
  name,
  releaseType,
  version,
  notes,
  artifactRef,
  suggestedVersion,
  onClose,
  onNameChange,
  onTypeChange,
  onVersionChange,
  onNotesChange,
  onArtifactRefChange,
  onCreate
}: {
  open: boolean;
  busy: boolean;
  latestVersion: string;
  name: string;
  releaseType: ReleaseType;
  version: string;
  notes: string;
  artifactRef: string;
  suggestedVersion: string;
  onClose: () => void;
  onNameChange: (value: string) => void;
  onTypeChange: (type: ReleaseType) => void;
  onVersionChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onArtifactRefChange: (value: string) => void;
  onCreate: () => void;
}) {
  if (!open) return null;
  const trimmedName = name.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="surface-card flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden">
        <header className="flex items-start justify-between gap-3 border-b divider px-5 py-4">
          <div>
            <h2 className="inline-flex items-center gap-2 text-lg font-bold" style={{ color: "var(--text-strong)" }}>יצירת Release<HelpIcon helpKey="release" /></h2>
            <p className="mt-1 text-sm muted">יצירת Release לא מבצעת פריסה בפועל. אחרי היצירה עוברים ל-Deploy Center.</p>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="סגור" disabled={busy}><X size={17} /></button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-md border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}>
              <p className="field-label"><HelpLabel helpKey="version.current">Base version</HelpLabel></p>
              <p className="num text-xl font-bold" style={{ color: "var(--text-strong)" }}>{latestVersion || "0.1.0"}</p>
            </div>
            <div className="rounded-md border p-3" style={{ borderColor: "var(--border)", background: "var(--accent-soft)" }}>
              <p className="field-label"><HelpLabel helpKey="version.latest">Computed next version</HelpLabel></p>
              <p className="num text-xl font-bold" style={{ color: "var(--accent)" }}>{version || suggestedVersion}</p>
            </div>
            <label className="md:col-span-2">
              <span className="field-label"><HelpLabel helpKey="release">שם מזהה ל-Release</HelpLabel></span>
              <input className="control" value={name} onChange={(event) => onNameChange(event.target.value)} placeholder="לדוגמה: הדרכות 2026, תיקוני הרשאות, פורטל עובדים חדש" aria-invalid={!trimmedName} />
              <span className="mt-1 block text-xs muted">זה השם שיופיע בבחירת Release בזמן יצירת אתר. מספר הגרסה נשאר לזיהוי טכני.</span>
            </label>
            <label>
              <span className="field-label"><HelpLabel helpKey="release">Release type</HelpLabel></span>
              <select className="control" value={releaseType} onChange={(event) => onTypeChange(event.target.value as ReleaseType)}>
                <option value="patch">Patch</option>
                <option value="minor">Minor</option>
                <option value="major">Major</option>
                <option value="hotfix">Hotfix</option>
              </select>
            </label>
            <label>
              <span className="field-label"><HelpLabel helpKey="version.latest">Version</HelpLabel></span>
              <input className="control" value={version} onChange={(event) => onVersionChange(event.target.value)} placeholder={suggestedVersion} />
            </label>
            <label className="md:col-span-2">
              <span className="field-label"><HelpLabel helpKey="artifact">Artifact reference</HelpLabel></span>
              <input className="control" value={artifactRef} onChange={(event) => onArtifactRefChange(event.target.value)} placeholder="נתיב לתיקיית dist או sharepoint-deploy-manifest.json" />
            </label>
            <label className="md:col-span-2">
              <span className="field-label"><HelpLabel helpKey="changelog">Notes / changelog</HelpLabel></span>
              <textarea className="control min-h-28" value={notes} onChange={(event) => onNotesChange(event.target.value)} placeholder="מה השתנה בגרסה הזו? תיקונים, שינויים, סיכונים ידועים." />
            </label>
            <div className="md:col-span-2 grid gap-3 md:grid-cols-4">
              <SafetyGate ok={Boolean(trimmedName)} label="שם מזהה" detail={trimmedName ? "אפשר לזהות את ה-Release באשפים ובבחירה ידנית." : "חסר שם אנושי. בלי זה המשתמש יראה בעיקר מספר גרסה."} helpKey="release" />
              <SafetyGate ok={Boolean(version || suggestedVersion)} label="גרסה מחושבת" detail="המספר יישמר ב-registry בלבד." helpKey="release" />
              <SafetyGate ok={Boolean(artifactRef.trim())} label="Artifact" detail={artifactRef.trim() ? "ניתן להריץ validation אחרי היצירה." : "אפשר ליצור בלי Artifact, אבל Deploy יהיה חסום."} helpKey="artifact" />
              <SafetyGate ok label="No deploy" detail="יצירת Release לא מפעילה פריסה." helpKey="deploy" />
            </div>
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t divider px-5 py-4" style={{ background: "var(--surface)" }}>
          <button className="btn btn-secondary" type="button" onClick={onClose} disabled={busy}>ביטול</button>
          <button className="btn btn-primary" type="button" disabled={busy || !trimmedName} onClick={onCreate}>
            <Plus size={16} />{busy ? "יוצר..." : "Create Release"}
          </button>
        </footer>
      </div>
    </div>
  );
}

type ReleaseEditDraft = {
  name: string;
  version: string;
  releaseType: ReleaseType;
  artifactRef: string;
  notes: string;
  status: Release["status"];
};

const blankReleaseEditDraft: ReleaseEditDraft = {
  name: "",
  version: "",
  releaseType: "patch",
  artifactRef: "",
  notes: "",
  status: "active"
};

const releaseToEditDraft = (release: Release): ReleaseEditDraft => ({
  name: release.name || "",
  version: release.version || "",
  releaseType: release.releaseType,
  artifactRef: release.artifactRef || "",
  notes: release.notes || "",
  status: release.status || "active"
});

function EditReleaseModal({
  release,
  draft,
  busy,
  onDraftChange,
  onClose,
  onSave
}: {
  release: Release | null;
  draft: ReleaseEditDraft;
  busy: boolean;
  onDraftChange: (value: ReleaseEditDraft) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  if (!release) return null;
  const trimmedName = draft.name.trim();
  const trimmedVersion = draft.version.trim();
  const artifactChanged = draft.artifactRef.trim() !== String(release.artifactRef || "").trim();
  const versionChanged = trimmedVersion !== String(release.version || "").trim();
  const updateDraft = <K extends keyof ReleaseEditDraft>(key: K, value: ReleaseEditDraft[K]) => onDraftChange({ ...draft, [key]: value });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="surface-card flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden">
        <header className="flex items-start justify-between gap-3 border-b divider px-5 py-4">
          <div>
            <h2 className="inline-flex items-center gap-2 text-lg font-bold" style={{ color: "var(--text-strong)" }}><Pencil size={18} />עריכת Release</h2>
            <p className="mt-1 text-sm muted">עדכון פרטי registry בלבד. שינוי Artifact מחייב Validate מחדש לפני Deploy.</p>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="סגור" disabled={busy}><X size={17} /></button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-md border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}>
            <p className="field-label">Release לעריכה</p>
            <p className="font-bold" style={{ color: "var(--text-strong)" }}>{releaseDisplayLabel(release)}</p>
            <p className="num mt-1 text-xs muted">גרסה {release.version} · מזהה {release._id.slice(-8)}</p>
          </div>
          <div className="rounded-md border p-3" style={{ borderColor: "var(--border)", background: artifactChanged ? "var(--warning-soft)" : "var(--surface-muted)" }}>
            <p className="field-label">השפעת שינוי</p>
            <p className="text-sm font-bold" style={{ color: artifactChanged ? "var(--warning)" : "var(--text-strong)" }}>
              {artifactChanged ? "Artifact השתנה - צריך Validate מחדש" : versionChanged ? "מספר גרסה ישתנה ב-registry" : "אין שינוי מסוכן מזוהה"}
            </p>
            <p className="mt-1 text-xs muted">הפעולה לא מריצה Deploy ולא משנה אתרים קיימים.</p>
          </div>
          <label className="md:col-span-2">
            <span className="field-label"><HelpLabel helpKey="release">שם מזהה ל-Release</HelpLabel></span>
            <input className="control" value={draft.name} onChange={(event) => updateDraft("name", event.target.value)} placeholder="לדוגמה: הדרכות יוני, תיקוני הרשאות, פורטל עובדים חדש" aria-invalid={!trimmedName} />
            <span className="mt-1 block text-xs muted">זה השם שיופיע ביצירת אתר, Deploy Center ו-Rollback.</span>
          </label>
          <label>
            <span className="field-label"><HelpLabel helpKey="version.latest">מספר גרסה</HelpLabel></span>
            <input className="control" value={draft.version} onChange={(event) => updateDraft("version", event.target.value)} placeholder="1.1.1" aria-invalid={!trimmedVersion} />
            <span className="mt-1 block text-xs muted">שינוי גרסה משנה את זיהוי ה־Release. ודאו שאין כפילות.</span>
          </label>
          <label>
            <span className="field-label"><HelpLabel helpKey="release">סוג Release</HelpLabel></span>
            <select className="control" value={draft.releaseType} onChange={(event) => updateDraft("releaseType", event.target.value as ReleaseType)}>
              <option value="patch">Patch</option>
              <option value="minor">Minor</option>
              <option value="major">Major</option>
              <option value="hotfix">Hotfix</option>
            </select>
          </label>
          <label>
            <span className="field-label"><HelpLabel helpKey="release">סטטוס</HelpLabel></span>
            <select className="control" value={draft.status} onChange={(event) => updateDraft("status", event.target.value as Release["status"])}>
              <option value="active">פעיל</option>
              <option value="deprecated">Deprecated</option>
            </select>
          </label>
          <label>
            <span className="field-label"><HelpLabel helpKey="artifact">Artifact reference</HelpLabel></span>
            <input className="control" value={draft.artifactRef} onChange={(event) => updateDraft("artifactRef", event.target.value)} placeholder="נתיב לתיקיית dist או sharepoint-deploy-manifest.json" />
            <span className="mt-1 block text-xs muted">אם משנים נתיב, ה־validation הקודם יבוטל עד להרצת Validate מחדש.</span>
          </label>
          <label className="md:col-span-2">
            <span className="field-label"><HelpLabel helpKey="changelog">Notes / changelog</HelpLabel></span>
            <textarea className="control min-h-28" value={draft.notes} onChange={(event) => updateDraft("notes", event.target.value)} placeholder="מה השתנה בגרסה הזו? תיקונים, סיכונים ידועים, הקשר לפריסה." />
          </label>
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t divider px-5 py-4" style={{ background: "var(--surface)" }}>
          <button className="btn btn-secondary" type="button" onClick={onClose} disabled={busy}>ביטול</button>
          <button className="btn btn-primary" type="button" disabled={busy || !trimmedName || !trimmedVersion} onClick={onSave}>
            <CheckCircle2 size={16} />{busy ? "שומר..." : "שמור Release"}
          </button>
        </footer>
      </div>
    </div>
  );
}

export function ReleasesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [releases, setReleases] = useState<Release[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [health, setHealth] = useState<{ status: string; mongo: string } | null>(null);
  const [versionStatus, setVersionStatus] = useState<any>(null);
  const [capabilities, setCapabilities] = useState<OperationCapabilities | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [message, setMessage] = useState("");
  const [busyAction, setBusyAction] = useState("");

  const [activeTab, setActiveTab] = useState<ReleaseTab>("releases");
  const [selectedReleaseId, setSelectedReleaseId] = useState("");
  const [releaseDetailsOpen, setReleaseDetailsOpen] = useState(false);
  const [validationByReleaseId, setValidationByReleaseId] = useState<Record<string, ReleaseArtifactValidation>>({});

  const [deployStep, setDeployStep] = useState<DeployStep>(1);
  const [deployMode, setDeployMode] = useState<DeployMode>("local-dev-owner");
  const [allowDeployWithoutBackup, setAllowDeployWithoutBackup] = useState(false);
  const [targetMode, setTargetMode] = useState<BatchDeployTargetMode>("all");
  const [targetSiteIds, setTargetSiteIds] = useState<string[]>([]);
  const [targetSearch, setTargetSearch] = useState("");
  const [targetFilter, setTargetFilter] = useState<TargetFilter>("all");
  const [batchPlan, setBatchPlan] = useState<BatchDeployPlan | null>(null);
  const [deployResult, setDeployResult] = useState<DeployExecutionResult | null>(null);
  const [browserDeployResults, setBrowserDeployResults] = useState<BrowserDeploySiteResult[]>([]);

  const [createReleaseOpen, setCreateReleaseOpen] = useState(false);
  const [releaseName, setReleaseName] = useState("");
  const [editRelease, setEditRelease] = useState<Release | null>(null);
  const [editReleaseDraft, setEditReleaseDraft] = useState<ReleaseEditDraft>(blankReleaseEditDraft);
  const [newVersion, setNewVersion] = useState("");
  const [versionManuallyEdited, setVersionManuallyEdited] = useState(false);
  const [releaseType, setReleaseType] = useState<ReleaseType>("patch");
  const [notes, setNotes] = useState("");
  const [artifactRef, setArtifactRef] = useState("");

  const [rollbackReleaseId, setRollbackReleaseId] = useState("");
  const [rollbackSiteIds, setRollbackSiteIds] = useState<string[]>([]);
  const [rollbackReason, setRollbackReason] = useState("");
  const [rollbackRows, setRollbackRows] = useState<RollbackPlanRow[]>([]);
  const [deployConfirmOpen, setDeployConfirmOpen] = useState(false);
  const [rollbackConfirmOpen, setRollbackConfirmOpen] = useState(false);
  const [siteDeployments, setSiteDeployments] = useState<SiteDeployment[]>([]);
  const [siteDeployQueryApplied, setSiteDeployQueryApplied] = useState(false);

  const selectedRelease = releases.find((release) => release._id === selectedReleaseId) || null;
  const latestRelease = releases[0] || null;
  const latestVersion = versionStatus?.latestVersion || latestRelease?.version || "";
  const latestVersionForSuggestion = latestVersion || "0.1.0";
  const suggestedVersion = useMemo(() => suggestVersion(latestVersionForSuggestion, releaseType), [latestVersionForSuggestion, releaseType]);
  const selectedValidation = selectedReleaseId ? validationByReleaseId[selectedReleaseId] || null : null;
  const currentPlanFresh = isPlanForCurrentSelection({ plan: batchPlan, releaseId: selectedReleaseId, deployMode, targetMode, targetSiteIds, allowDeployWithoutBackup });
  const executablePlanRows = currentPlanFresh ? batchPlan?.results.filter((row) => row.status === "ready" || row.status === "warning") || [] : [];
  const rollbackRelease = releases.find((release) => release._id === rollbackReleaseId) || null;

  const siteUsage = useMemo(() => {
    const usage = new Map<string, number>();
    sites.forEach((site) => {
      const version = siteVersion(site);
      if (version) usage.set(version, (usage.get(version) || 0) + 1);
    });
    return usage;
  }, [sites]);

  const versionGroups = useMemo(() => {
    const groups = new Map<string, number>();
    sites.forEach((site) => groups.set(siteVersion(site) || "לא ידוע", (groups.get(siteVersion(site) || "לא ידוע") || 0) + 1));
    return [...groups.entries()].sort((a, b) => b[1] - a[1]);
  }, [sites]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [relRes, sitesRes, statusRes, capsRes, healthRes] = await Promise.all([
        sitesApi.releases(),
        sitesApi.list(),
        sitesApi.versionStatus(),
        sitesApi.operationCapabilities(),
        sitesApi.health()
      ]);
      setReleases(relRes.data);
      setSites(sitesRes.data);
      setVersionStatus(statusRes.data);
      setCapabilities(capsRes.data);
      setHealth({ status: healthRes.data.status, mongo: healthRes.data.mongo });
      const defaultRelease = selectDefaultDeployRelease(relRes.data, statusRes.data?.latestVersion || "");
      setSelectedReleaseId((current) => relRes.data.some((release) => release._id === current) ? current : defaultRelease?._id || "");
      setRollbackReleaseId((current) => current || relRes.data[1]?._id || relRes.data[0]?._id || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בטעינת מרכז גרסאות ופריסות");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const targetSiteId = searchParams.get("targetSiteId") || "";
    if (siteDeployQueryApplied || !targetSiteId || sites.length === 0) return;
    const targetSite = sites.find((site) => site._id === targetSiteId);
    if (!targetSite) return;

    setActiveTab("deploy");
    setDeployStep(1);
    setTargetMode("single");
    setTargetSiteIds([targetSiteId]);
    setBatchPlan(null);
    setDeployResult(null);
    setBrowserDeployResults([]);
    setSiteDeployQueryApplied(true);

    const next = new URLSearchParams(searchParams);
    next.delete("targetSiteId");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, siteDeployQueryApplied, sites]);

  useEffect(() => {
    if (!rollbackSiteIds[0]) {
      setSiteDeployments([]);
      return;
    }
    sitesApi.siteDeployments(rollbackSiteIds[0])
      .then((result) => setSiteDeployments(result.data))
      .catch(() => setSiteDeployments([]));
  }, [rollbackSiteIds, message]);

  useEffect(() => {
    if (!versionManuallyEdited && suggestedVersion && newVersion !== suggestedVersion) {
      setNewVersion(suggestedVersion);
    }
  }, [newVersion, suggestedVersion, versionManuallyEdited]);

  const runAction = async (key: string, action: () => Promise<void>) => {
    setBusyAction(key);
    setActionError("");
    setMessage("");
    try {
      await action();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "שגיאה בביצוע פעולה");
    } finally {
      setBusyAction("");
    }
  };

  const handleReleaseTypeChange = (type: ReleaseType) => {
    setReleaseType(type);
    setVersionManuallyEdited(false);
    setNewVersion(suggestVersion(latestVersionForSuggestion, type));
  };

  const handleVersionChange = (value: string) => {
    setNewVersion(value);
    setVersionManuallyEdited(true);
    const inferredType = inferReleaseType(latestVersionForSuggestion, value, releaseType);
    if (inferredType && inferredType !== releaseType) setReleaseType(inferredType);
  };

  const openEditRelease = (release: Release) => {
    setEditRelease(release);
    setEditReleaseDraft(releaseToEditDraft(release));
    setActionError("");
  };

  const closeEditRelease = () => {
    setEditRelease(null);
    setEditReleaseDraft(blankReleaseEditDraft);
  };

  const saveEditRelease = async () => {
    if (!editRelease) return;
    const nextName = editReleaseDraft.name.trim();
    const nextVersion = editReleaseDraft.version.trim();
    if (!nextName || !nextVersion) return;

    await runAction("edit-release", async () => {
      const artifactChanged = editReleaseDraft.artifactRef.trim() !== String(editRelease.artifactRef || "").trim();
      const result = await sitesApi.updateRelease(editRelease._id, {
        name: nextName,
        version: nextVersion,
        releaseType: editReleaseDraft.releaseType,
        artifactRef: editReleaseDraft.artifactRef.trim(),
        notes: editReleaseDraft.notes,
        status: editReleaseDraft.status
      });
      setReleases((current) => current.map((release) => release._id === result.data._id ? result.data : release));
      if (artifactChanged) {
        setValidationByReleaseId((prev) => {
          const next = { ...prev };
          delete next[result.data._id];
          return next;
        });
      }
      setMessage(artifactChanged
        ? `${releaseDisplayLabel(result.data)} נשמר. Artifact השתנה, לכן צריך להריץ Validate מחדש.`
        : `${releaseDisplayLabel(result.data)} נשמר.`);
      closeEditRelease();
      await load();
    });
  };

  const validateRelease = async (releaseId: string) => {
    await runAction(`validate-${releaseId}`, async () => {
      const result = await sitesApi.validateReleaseArtifact(releaseId);
      setValidationByReleaseId((prev) => ({ ...prev, [releaseId]: result.data }));
      setMessage(result.data.summary.readyForDeploy ? "Artifact אומת ומוכן לפריסה" : "Artifact נבדק אך עדיין חסום");
      await load();
    });
  };

  const startDeployPlan = (releaseId: string) => {
    const release = releases.find((item) => item._id === releaseId) || null;
    const readiness = releaseReadiness(release, latestVersion);
    setSelectedReleaseId(releaseId);
    setReleaseDetailsOpen(false);
    if (!readiness.canPlan) {
      setActiveTab("releases");
      setDeployStep(1);
      setBatchPlan(null);
      setDeployResult(null);
      setBrowserDeployResults([]);
      setMessage(`${readiness.label}: חברו Artifact תקין או בחרו Release אחר לפני Deploy.`);
      return;
    }
    setActiveTab("deploy");
    setDeployStep(2);
    setBatchPlan(null);
    setDeployResult(null);
    setBrowserDeployResults([]);
  };

  const buildDeployPayload = (): BatchDeployRequest => ({
    targetMode,
    targetSiteIds: targetMode === "all" ? [] : targetSiteIds,
    deployMode,
    connectorMode: "browser-sharepoint",
    allowDeployWithoutBackup
  });

  const buildBatchPlan = async () => {
    await runAction("batch-plan", async () => {
      if (!selectedReleaseId) throw new Error("בחר Release לפני Dry-run");
      const readiness = releaseReadiness(selectedRelease, latestVersion);
      if (!readiness.canPlan) throw new Error(`${readiness.label}: אי אפשר להריץ Dry-run בלי Release מוכן לתכנון.`);
      const result = await sitesApi.deploymentPlan(selectedReleaseId, buildDeployPayload());
      setBatchPlan(result.data);
      setDeployResult(null);
      setBrowserDeployResults([]);
      setDeployStep(3);
      setMessage(`Dry-run נוצר: ${formatNumber(result.data.summary.readySites)} מוכנים, ${formatNumber(result.data.summary.blockedSites)} חסומים`);
    });
  };

  const updateBrowserDeployResult = (next: BrowserDeploySiteResult) => {
    setBrowserDeployResults((current) => {
      const index = current.findIndex((item) => item.siteId === next.siteId);
      if (index === -1) return [...current, next];
      const copy = [...current];
      copy[index] = next;
      return copy;
    });
  };

  const resultFromBrowserDeploy = (
    row: BatchDeployPlanRow,
    site: Site,
    result: BrowserSharePointDeployResult,
    deploymentId?: string
  ): BrowserDeploySiteResult => ({
    siteId: site._id,
    siteCode: site.siteCode,
    displayName: site.displayName,
    status: result.finalStatus === "success" ? "success" : "failed",
    message: result.finalStatus === "success" ? "הקבצים הועלו ואומתו." : "העלאת קובץ נכשלה.",
    filesCount: result.readBackEvidence.length || row.plan?.summary.filesCount || 0,
    verifiedFilesCount: result.readBackEvidence.filter((item) => item.status === "verified").length,
    failedFilesCount: result.readBackEvidence.filter((item) => item.status !== "verified").length,
    deploymentId,
    error: result.errors.map((item) => item.error).filter(Boolean).join("; ")
  });

  const executeBatchDeploy = async () => {
    await runAction("batch-run", async () => {
      if (!selectedReleaseId || !batchPlan) throw new Error("יש להריץ Dry-run לפני Execute");
      if (!isPlanForCurrentSelection({ plan: batchPlan, releaseId: selectedReleaseId, deployMode, targetMode, targetSiteIds, allowDeployWithoutBackup })) {
        throw new Error("Dry-run לא תואם לבחירה הנוכחית. הריצו Dry-run מחדש לפני Execute.");
      }
      const executableRows = batchPlan.results.filter((row) => row.status === "ready" || row.status === "warning");
      if (!executableRows.length) throw new Error("אין אתרים מוכנים לפריסה");

      const manifestResponse = await sitesApi.releaseArtifactManifest(selectedReleaseId);
      const manifest = manifestResponse.data;
      if (!manifest.summary.readyForDeploy) throw new Error("ה־artifact חסר או לא תקין.");

      const manifestFilesByPath = new Map(manifest.files.map((file) => [file.relativePath, file]));
      const finalResults: BrowserDeploySiteResult[] = [];

      for (const row of executableRows) {
        const site = sites.find((item) => item._id === row.siteId);
        if (!site || !row.plan) continue;

        const running: BrowserDeploySiteResult = {
          siteId: site._id,
          siteCode: site.siteCode,
          displayName: site.displayName,
          status: "running",
          message: "מבצע Digest והעלאה דרך הדפדפן...",
          filesCount: row.plan.summary.filesCount,
          verifiedFilesCount: 0,
          failedFilesCount: 0
        };
        updateBrowserDeployResult(running);

        const targetSiteUrl = row.plan.target?.sharePointSiteUrl || site.sharePointSiteUrl;
        const targetDistPath = row.plan.target?.targetDistPath || row.plan.files[0]?.targetPath?.replace(/\/[^/]+$/g, "") || "";
        const startedAt = new Date().toISOString();

        try {
          await requestBrowserDigest(targetSiteUrl, { forceRefresh: true });
          const deployFiles = row.plan.files.map((file) => {
            const manifestFile = manifestFilesByPath.get(file.relativePath);
            return {
              relativePath: file.relativePath,
              targetRelativePath: manifestFile?.targetRelativePath || file.relativePath,
              sizeBytes: manifestFile?.sizeBytes || file.sizeBytes,
              contentType: manifestFile?.contentType || "application/octet-stream",
              sha256: manifestFile?.sha256 || file.sha256,
              deployable: manifestFile?.deployable ?? true,
              targetPath: file.targetPath
            };
          });
          const deploymentMetadata = await buildDeploymentMetadataFile({
            releaseId: selectedReleaseId,
            releaseVersion: row.targetVersion,
            operation: "deploy",
            site,
            targetSiteUrl,
            targetDistPath,
            finalAppUrl: row.plan.target?.finalAppUrl
          });
          const browserDeploy = await deployArtifactToSharePointBrowser({
            releaseId: selectedReleaseId,
            siteId: site._id,
            siteCode: site.siteCode,
            targetSiteUrl,
            targetDistPath,
            finalAppUrl: row.plan.target?.finalAppUrl,
            files: [...deployFiles, deploymentMetadata.file],
            loadArtifactFile: (relativePath) =>
              relativePath === DEPLOYMENT_METADATA_FILE
                ? Promise.resolve(deploymentMetadata.response)
                : sitesApi.releaseArtifactFile(selectedReleaseId, relativePath),
            onFileProgress: (event) => {
              updateBrowserDeployResult({
                ...running,
                message: `${event.relativePath}: ${event.status}${event.error ? ` - ${event.error}` : ""}`
              });
            }
          });

          const evidencePayload: BrowserDeployEvidencePayload = {
            releaseId: selectedReleaseId,
            deployMode,
            connectorMode: "browser-sharepoint",
            targetSite: {
              siteId: site._id,
              siteCode: site.siteCode,
              sharePointSiteUrl: targetSiteUrl
            },
            targetPaths: {
              targetDistPath,
              finalAppUrl: row.plan.target?.finalAppUrl
            },
            uploadedFilesEvidence: browserDeploy.uploadedFilesEvidence,
            readBackEvidence: browserDeploy.readBackEvidence,
            finalAppUrlVerification: browserDeploy.finalAppUrlVerification,
            errors: browserDeploy.errors,
            startedAt: browserDeploy.startedAt,
            completedAt: browserDeploy.completedAt,
            finalStatus: browserDeploy.finalStatus,
            versionBefore: row.currentVersion,
            versionAfter: browserDeploy.finalStatus === "success" ? row.targetVersion : row.currentVersion
          };
          const evidenceResponse = await sitesApi.recordBrowserDeployEvidence(site._id, evidencePayload);
          const siteResult = resultFromBrowserDeploy(row, site, browserDeploy, evidenceResponse.data.deployment._id);
          updateBrowserDeployResult(siteResult);
          finalResults.push(siteResult);
        } catch (error) {
          const failedEvidence: DeploymentVerificationEvidence[] = (row.plan?.files || []).map((file) => ({
            relativePath: file.relativePath,
            sourcePath: `artifact:${file.relativePath}`,
            targetPath: file.targetPath,
            status: "failed",
            checkedAt: new Date().toISOString(),
            expectedSizeBytes: file.sizeBytes,
            actualSizeBytes: 0,
            expectedSha256: file.sha256,
            actualSha256: "",
            sizeMatches: false,
            sha256Matches: false,
            error: error instanceof Error ? error.message : String(error)
          }));
          const payload: BrowserDeployEvidencePayload = {
            releaseId: selectedReleaseId,
            deployMode,
            connectorMode: "browser-sharepoint",
            targetSite: {
              siteId: site._id,
              siteCode: site.siteCode,
              sharePointSiteUrl: targetSiteUrl
            },
            targetPaths: {
              targetDistPath,
              finalAppUrl: row.plan?.target?.finalAppUrl
            },
            uploadedFilesEvidence: failedEvidence,
            readBackEvidence: failedEvidence,
            errors: [{ error: error instanceof Error ? error.message : String(error) }],
            startedAt,
            completedAt: new Date().toISOString(),
            finalStatus: "failed",
            versionBefore: row.currentVersion,
            versionAfter: row.currentVersion
          };
          try {
            const evidenceResponse = await sitesApi.recordBrowserDeployEvidence(site._id, payload);
            const failedResult: BrowserDeploySiteResult = {
              siteId: site._id,
              siteCode: site.siteCode,
              displayName: site.displayName,
              status: "failed",
              message: "העלאת קובץ נכשלה.",
              filesCount: failedEvidence.length,
              verifiedFilesCount: 0,
              failedFilesCount: failedEvidence.length,
              deploymentId: evidenceResponse.data.deployment._id,
              error: payload.errors?.map((item) => typeof item === "string" ? item : item.error).join("; ")
            };
            updateBrowserDeployResult(failedResult);
            finalResults.push(failedResult);
          } catch {
            const failedResult: BrowserDeploySiteResult = {
              siteId: site._id,
              siteCode: site.siteCode,
              displayName: site.displayName,
              status: "failed",
              message: "העלאה נכשלה וגם שמירת evidence נכשלה.",
              filesCount: failedEvidence.length,
              verifiedFilesCount: 0,
              failedFilesCount: failedEvidence.length,
              error: error instanceof Error ? error.message : String(error)
            };
            updateBrowserDeployResult(failedResult);
            finalResults.push(failedResult);
          }
        }
      }

      const successCount = finalResults.filter((result) => result.status === "success").length;
      const message = successCount === finalResults.length
        ? "הקבצים הועלו ואומתו."
        : `${formatNumber(successCount)} מתוך ${formatNumber(finalResults.length)} אתרים נפרסו בהצלחה.`;
      setDeployResult({ connectorMode: "browser-sharepoint", results: finalResults, message });
      setMessage(message);
      await load();
    });
  };

  const planRollback = async () => {
    await runAction("rollback-plan", async () => {
      const selectedSites = sites.filter((site) => rollbackSiteIds.includes(site._id));
      const rows: RollbackPlanRow[] = [];
      for (const site of selectedSites) {
        try {
          const result = await sitesApi.rollbackSiteVersionPlan(site._id, rollbackReleaseId, rollbackReason);
          const blockers = [
            result.data.summary.readyForDeploy ? "" : "Artifact לא מוכן ל-Rollback",
            result.data.summary.readyForDeployExecution === false ? "Execution חסום לפי safety gates" : "",
          ].filter(Boolean);
          rows.push({
            site,
            plan: result.data,
            ready: blockers.length === 0,
            blockers,
            warnings: result.data.rollback.risks || [],
            status: blockers.length === 0 ? "planned" : "blocked"
          });
        } catch (err) {
          rows.push({
            site,
            ready: false,
            blockers: [err instanceof Error ? err.message : "rollback-plan-failed"],
            warnings: [],
            status: "blocked"
          });
        }
      }
      setRollbackRows(rows);
      setMessage(`Rollback plan נוצר: ${formatNumber(rows.filter((row) => row.ready).length)}/${formatNumber(rows.length)} מוכנים`);
    });
  };

  const executeRollback = async (reason: string) => {
    await runAction("rollback-run", async () => {
      const readyRows = rollbackRows.filter((row) => row.ready);
      if (!readyRows.length) throw new Error("אין Rollback plans מוכנים");
      if (!rollbackReleaseId) throw new Error("בחר Release יעד ל-Rollback");
      const manifestResponse = await sitesApi.releaseArtifactManifest(rollbackReleaseId);
      const manifest = manifestResponse.data;
      if (!manifest.summary.readyForDeploy) throw new Error("ה־artifact של גרסת ה-Rollback חסר או לא תקין.");
      const manifestFilesByPath = new Map(manifest.files.map((file) => [file.relativePath, file]));
      const nextRows = [...rollbackRows];
      let successCount = 0;

      for (const row of readyRows) {
        const index = nextRows.findIndex((item) => item.site._id === row.site._id);
        if (!row.plan || index === -1) continue;
        const site = row.site;
        const targetSiteUrl = row.plan.target?.sharePointSiteUrl || site.sharePointSiteUrl;
        const targetDistPath = row.plan.target?.targetDistPath || row.plan.files[0]?.targetPath?.replace(/\/[^/]+$/g, "") || "";
        const versionBefore = siteVersion(site) || row.plan.rollback.fromVersion;
        const versionAfter = row.plan.rollback.toVersion || row.plan.releaseVersion;
        const startedAt = new Date().toISOString();
        const queued = await sitesApi.rollbackSiteVersion(site._id, rollbackReleaseId, reason);
        nextRows[index] = { ...nextRows[index], status: "running", jobId: queued.data.job._id };
        setRollbackRows([...nextRows]);

        try {
          await requestBrowserDigest(targetSiteUrl, { forceRefresh: true });
          const deployFiles = row.plan.files.map((file) => {
            const manifestFile = manifestFilesByPath.get(file.relativePath);
            return {
              relativePath: file.relativePath,
              targetRelativePath: manifestFile?.targetRelativePath || file.relativePath,
              sizeBytes: manifestFile?.sizeBytes || file.sizeBytes,
              contentType: manifestFile?.contentType || "application/octet-stream",
              sha256: manifestFile?.sha256 || file.sha256,
              deployable: manifestFile?.deployable ?? true,
              targetPath: file.targetPath
            };
          });
          const deploymentMetadata = await buildDeploymentMetadataFile({
            releaseId: rollbackReleaseId,
            releaseVersion: versionAfter,
            operation: "rollback",
            site,
            targetSiteUrl,
            targetDistPath,
            finalAppUrl: row.plan.target?.finalAppUrl
          });
          const browserDeploy = await deployArtifactToSharePointBrowser({
            releaseId: rollbackReleaseId,
            siteId: site._id,
            siteCode: site.siteCode,
            targetSiteUrl,
            targetDistPath,
            finalAppUrl: row.plan.target?.finalAppUrl,
            files: [...deployFiles, deploymentMetadata.file],
            loadArtifactFile: (relativePath) =>
              relativePath === DEPLOYMENT_METADATA_FILE
                ? Promise.resolve(deploymentMetadata.response)
                : sitesApi.releaseArtifactFile(rollbackReleaseId, relativePath)
          });
          const payload: BrowserDeployEvidencePayload = {
            releaseId: rollbackReleaseId,
            deployMode: "local-dev-owner",
            connectorMode: "browser-sharepoint",
            targetSite: {
              siteId: site._id,
              siteCode: site.siteCode,
              sharePointSiteUrl: targetSiteUrl
            },
            targetPaths: {
              targetDistPath,
              finalAppUrl: row.plan.target?.finalAppUrl
            },
            uploadedFilesEvidence: browserDeploy.uploadedFilesEvidence,
            readBackEvidence: browserDeploy.readBackEvidence,
            finalAppUrlVerification: browserDeploy.finalAppUrlVerification,
            errors: browserDeploy.errors,
            startedAt: browserDeploy.startedAt,
            completedAt: browserDeploy.completedAt,
            finalStatus: browserDeploy.finalStatus,
            versionBefore,
            versionAfter: browserDeploy.finalStatus === "success" ? versionAfter : versionBefore
          };
          await sitesApi.recordBrowserDeployEvidence(site._id, payload);
          if (browserDeploy.finalStatus === "success") successCount += 1;
          nextRows[index] = { ...nextRows[index], status: browserDeploy.finalStatus === "success" ? "succeeded" : "failed", jobId: queued.data.job._id };
          setRollbackRows([...nextRows]);
        } catch (error) {
          const failedEvidence: DeploymentVerificationEvidence[] = row.plan.files.map((file) => ({
            relativePath: file.relativePath,
            sourcePath: `artifact:${file.relativePath}`,
            targetPath: file.targetPath,
            status: "failed",
            checkedAt: new Date().toISOString(),
            expectedSizeBytes: file.sizeBytes,
            actualSizeBytes: 0,
            expectedSha256: file.sha256,
            actualSha256: "",
            sizeMatches: false,
            sha256Matches: false,
            error: error instanceof Error ? error.message : String(error)
          }));
          await sitesApi.recordBrowserDeployEvidence(site._id, {
            releaseId: rollbackReleaseId,
            deployMode: "local-dev-owner",
            connectorMode: "browser-sharepoint",
            targetSite: {
              siteId: site._id,
              siteCode: site.siteCode,
              sharePointSiteUrl: targetSiteUrl
            },
            targetPaths: {
              targetDistPath,
              finalAppUrl: row.plan.target?.finalAppUrl
            },
            uploadedFilesEvidence: failedEvidence,
            readBackEvidence: failedEvidence,
            errors: [{ error: error instanceof Error ? error.message : String(error) }],
            startedAt,
            completedAt: new Date().toISOString(),
            finalStatus: "failed",
            versionBefore,
            versionAfter: versionBefore
          }).catch(() => undefined);
          nextRows[index] = { ...nextRows[index], status: "failed", jobId: queued.data.job._id, blockers: [error instanceof Error ? error.message : String(error)] };
          setRollbackRows([...nextRows]);
        }
      }
      setRollbackRows(nextRows);
      setRollbackConfirmOpen(false);
      setMessage(successCount === readyRows.length
        ? `${formatNumber(successCount)} Rollback פעולות הושלמו דרך הדפדפן`
        : `${formatNumber(successCount)} מתוך ${formatNumber(readyRows.length)} Rollback פעולות הושלמו; Evidence נשמר עבור הכשלים`);
      await load();
    });
  };

  const tabItems: Array<{ key: ReleaseTab; label: string; icon: ReactNode }> = [
    { key: "releases", label: "Releases", icon: <PackageCheck size={15} /> },
    { key: "deploy", label: "Deploy", icon: <Rocket size={15} /> },
    { key: "rollback", label: "Rollback", icon: <RotateCcw size={15} /> },
    { key: "history", label: "History", icon: <History size={15} /> }
  ];

  return (
    <div className="space-y-5">
      <ReleaseHeader
        capabilities={capabilities}
        health={health}
        loading={loading}
        onCreate={() => setCreateReleaseOpen(true)}
        onNewPlan={() => {
          setActiveTab("deploy");
          setDeployStep(1);
          setBatchPlan(null);
          setDeployResult(null);
          setBrowserDeployResults([]);
        }}
      />

      <OperationalSummary
        title="פריסה בטוחה מתחילה בתוכנית"
        purpose="המסך הזה מיועד לבחור גרסה, להבין מי יושפע, לראות חסמים, ואז לבצע רק אחרי Dry-run ואישור מוגן."
        state={selectedRelease ? `ה-Release שנבחר: ${releaseDisplayLabel(selectedRelease)} · ${releaseReadiness(selectedRelease, latestVersion).label}` : "אין Release נבחר לפריסה"}
        attention={!releases.some(isDeployableRelease)
          ? "אין כרגע Release שמוכן לפריסה. צריך Artifact תקין ו־Validation."
          : batchPlan && !currentPlanFresh
            ? "ה־Dry-run לא תואם לבחירה הנוכחית. צריך להריץ אותו מחדש."
            : batchPlan?.summary.blockedSites
              ? `${formatNumber(batchPlan.summary.blockedSites)} אתרים חסומים בתוכנית.`
              : "אין חסימת פריסה מרכזית שמוצגת כרגע."}
        attentionTone={!releases.some(isDeployableRelease) || (batchPlan && !currentPlanFresh) || batchPlan?.summary.blockedSites ? "warning" : "success"}
        nextAction={activeTab === "deploy"
          ? batchPlan && currentPlanFresh
            ? "עברו ל־Review ובדקו את היעדים המוכנים לפני Execute."
            : "בחרו Release ויעדים, ואז הריצו Dry-run."
          : "בחרו Release מוכן או פתחו תוכנית פריסה חדשה."}
        blocked={!releases.some(isDeployableRelease)
          ? "Release בלי Artifact תקין לא יכול להרגיש deployable. חברו Artifact והריצו Validate."
          : batchPlan?.connectorMode === "browser-sharepoint"
            ? undefined
            : "פריסה ל־SharePoint מתבצעת דרך הדפדפן בלבד. הריצו Dry-run במסלול Browser SharePoint."}
        tone={!releases.some(isDeployableRelease) || batchPlan?.summary.blockedSites ? "warning" : "success"}
      >
        <GuidedFlow
          title="זרימת פריסה מוגנת"
          steps={[
            { title: "Release מוכן", description: "בחרו את הגרסה החדשה ביותר שיש לה Artifact מאומת.", status: selectedRelease && isDeployableRelease(selectedRelease) ? "done" : "active" },
            { title: "Scope ברור", description: "בחרו אתר אחד, אתרים נבחרים, או כל האתרים הפעילים.", status: targetMode === "all" || targetSiteIds.length ? "done" : "pending" },
            { title: "Dry-run", description: "המערכת מחלקת יעדים למוכנים, עדכניים, חסומים ודורשים בדיקה.", status: batchPlan ? currentPlanFresh ? "done" : "blocked" : "pending" },
            { title: "אישור מוגן", description: `Execute אפשרי רק אחרי Review. כרגע ${formatNumber(executablePlanRows.length)} יעדים מוכנים.`, status: executablePlanRows.length ? "active" : "pending" }
          ]}
        />
        <ModeBoundary
          items={[
            { label: "פריסה רגילה", description: "מיועדת לגרסה חדשה ומוכנה לפריסה.", tone: "success" },
            { label: "Rollback", description: "חזרה לגרסה ישנה נשארת בלשונית Rollback עם אישור נפרד.", tone: "warning" },
            { label: "Evidence", description: "קבצים, read-back ושגיאות נשמרים אחרי הפעולה ומוצגים בפרטים.", tone: "info" }
          ]}
        />
      </OperationalSummary>

      {message ? <div className="badge badge-success px-3 py-2">{message}</div> : null}
      {actionError ? <div className="badge badge-danger px-3 py-2">{actionError}</div> : null}
      {loading ? <LoadingState /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !error ? (
        <>
          <ReleaseStats
            releases={releases}
            sites={sites}
            versionStatus={versionStatus}
            latestRelease={latestRelease}
            latestVersion={latestVersion}
            lastPlan={batchPlan}
          />

          <div className="queue-tabs">
            {tabItems.map((tab) => (
              <button key={tab.key} className={`queue-tab ${activeTab === tab.key ? "queue-tab-active" : ""}`} type="button" onClick={() => setActiveTab(tab.key)}>
                {tab.icon}{tab.label}
              </button>
            ))}
          </div>

          {activeTab === "releases" ? (
            <SectionCard title="Release Registry" subtitle="רשימת גרסאות עם Artifact, סטטוס ושימוש באתרים. פרטים נפתחים במגירה ימנית ולא תופסים שטח מהעמוד." helpKey="release">
              <ReleaseRegistry
                releases={releases}
                selectedReleaseId={selectedReleaseId}
                latestVersion={latestVersion}
                siteUsage={siteUsage}
                onSelect={(releaseId) => {
                  setSelectedReleaseId(releaseId);
                  setReleaseDetailsOpen(true);
                  setBatchPlan(null);
                  setDeployResult(null);
                  setBrowserDeployResults([]);
                }}
                onEdit={openEditRelease}
                onValidate={validateRelease}
                onDeploy={startDeployPlan}
              />
            </SectionCard>
          ) : null}

          {releaseDetailsOpen && activeTab === "releases" ? (
            <div className="drawer-layer release-details-layer">
              <button className="release-details-backdrop" type="button" aria-label="סגור פרטי Release" onClick={() => setReleaseDetailsOpen(false)} />
              <aside className="drawer-panel drawer-panel-right release-details-drawer" role="dialog" aria-modal="true" aria-labelledby="release-details-title">
                <div className="drawer-header">
                  <div className="min-w-0">
                    <h2 id="release-details-title" className="panel-title panel-title-with-help">פרטי Release<HelpIcon helpKey="release" /></h2>
                    <p className="panel-subtitle">Artifact, תאימות ופעולות לגרסה שנבחרה</p>
                  </div>
                  <button className="icon-btn" type="button" onClick={() => setReleaseDetailsOpen(false)} aria-label="סגור פרטי Release"><X size={16} /></button>
                </div>
                <div className="drawer-body">
                  <ReleaseDetailsPanel
                    release={selectedRelease}
                    latestVersion={latestVersion}
                    sites={sites}
                    validation={selectedValidation}
                    validating={busyAction === `validate-${selectedReleaseId}`}
                    onValidate={() => selectedReleaseId && validateRelease(selectedReleaseId)}
                    onEdit={openEditRelease}
                    onDeploy={() => selectedReleaseId && startDeployPlan(selectedReleaseId)}
                    shell={false}
                  />
                </div>
              </aside>
            </div>
          ) : null}

          {activeTab === "deploy" ? (
            <DeployWizard
              releases={releases}
              sites={sites}
              selectedRelease={selectedRelease}
              selectedReleaseId={selectedReleaseId}
              latestVersion={latestVersion}
              capabilities={capabilities}
              deployMode={deployMode}
              allowDeployWithoutBackup={allowDeployWithoutBackup}
              targetMode={targetMode}
              targetSiteIds={targetSiteIds}
              search={targetSearch}
              filter={targetFilter}
              step={deployStep}
              plan={batchPlan}
              busyAction={busyAction}
              deployResult={deployResult}
              browserDeployResults={browserDeployResults}
              onSelectRelease={(releaseId) => {
                setSelectedReleaseId(releaseId);
                setBatchPlan(null);
                setDeployResult(null);
                setBrowserDeployResults([]);
              }}
              onDeployModeChange={(mode) => {
                setDeployMode(mode);
                if (mode !== "local-dev-owner") setAllowDeployWithoutBackup(false);
                setBatchPlan(null);
                setDeployResult(null);
                setBrowserDeployResults([]);
              }}
              onAllowDeployWithoutBackupChange={(value) => {
                setAllowDeployWithoutBackup(value);
                setBatchPlan(null);
                setDeployResult(null);
                setBrowserDeployResults([]);
              }}
              onTargetModeChange={(mode) => {
                setTargetMode(mode);
                setBatchPlan(null);
                setDeployResult(null);
                setBrowserDeployResults([]);
              }}
              onTargetSiteIdsChange={(siteIds) => {
                setTargetSiteIds(siteIds);
                setBatchPlan(null);
                setDeployResult(null);
                setBrowserDeployResults([]);
              }}
              onSearchChange={setTargetSearch}
              onFilterChange={setTargetFilter}
              onStepChange={setDeployStep}
              onBuildPlan={buildBatchPlan}
              onExecute={() => setDeployConfirmOpen(true)}
            />
          ) : null}

          {activeTab === "rollback" ? (
            <RollbackPanel
              releases={releases}
              sites={sites}
              selectedReleaseId={rollbackReleaseId}
              selectedSiteIds={rollbackSiteIds}
              reason={rollbackReason}
              planRows={rollbackRows}
              busyAction={busyAction}
              onReleaseChange={(releaseId) => {
                setRollbackReleaseId(releaseId);
                setRollbackRows([]);
              }}
              onSiteIdsChange={(siteIds) => {
                setRollbackSiteIds(siteIds);
                setRollbackRows([]);
              }}
              onReasonChange={(reason) => {
                setRollbackReason(reason);
                setRollbackRows([]);
              }}
              onPlan={planRollback}
              onOpenConfirm={() => setRollbackConfirmOpen(true)}
            />
          ) : null}

          {activeTab === "history" ? (
            <div className="grid gap-5 xl:grid-cols-2">
              <SectionCard title="אתרים לפי גרסה" subtitle="התפלגות currentVersion במערך המנוהל" helpKey="version.current">
                {versionGroups.length === 0 ? <EmptyState title="אין מידע גרסאות" description="המידע יופיע לאחר רישום אתרים." /> : (
                  <div className="space-y-3">
                    {versionGroups.map(([version, count]) => {
                      const pct = sites.length ? Math.round((count / sites.length) * 100) : 0;
                      return (
                        <div key={version}>
                          <div className="mb-1 flex justify-between text-sm">
                            <span className="num">{version}</span>
                            <span className="num muted">{formatNumber(count)} ({pct}%)</span>
                          </div>
                          <div className="progress-track"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </SectionCard>
              <SectionCard title="Deployment history" subtitle="תוצאות אחרונות לאתר הראשון שנבחר ב-Rollback" helpKey="history">
                {siteDeployments.length === 0 ? <EmptyState title="אין היסטוריית Deploy להצגה" description="בחר אתר ב-Rollback או הרץ Deploy כדי לראות תוצאות." /> : (
                  <div className="space-y-3">
                    {siteDeployments.slice(0, 6).map((deployment) => (
                      <div key={deployment._id} className="rounded-md border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="num font-bold">{deployment.fromVersion || "Unknown"} ← {deployment.toVersion}</p>
                          <StatusChip tone={deployment.status === "succeeded" ? "success" : deployment.status === "failed" ? "danger" : "warning"}>{deployment.status}</StatusChip>
                        </div>
                        <p className="num mt-1 text-xs muted">{formatDateTime(deployment.finishedAt || deployment.startedAt || deployment.createdAt)}</p>
                        <div className="mt-2 grid gap-2 md:grid-cols-3">
                          <LinkRow label="Verification" value={deployment.verification?.status || "unverified"} />
                          <LinkRow label="Read-back files" value={`${deployment.verification?.verifiedFilesCount ?? 0}/${deployment.verification?.filesCount ?? 0}`} />
                          <LinkRow label="Size" value={formatBytes(deployment.verification?.totalSizeBytes || 0)} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            </div>
          ) : null}
        </>
      ) : null}

      <CreateReleaseModal
        open={createReleaseOpen}
        busy={busyAction === "create-release"}
        latestVersion={latestVersionForSuggestion}
        name={releaseName}
        releaseType={releaseType}
        version={newVersion}
        notes={notes}
        artifactRef={artifactRef}
        suggestedVersion={suggestedVersion}
        onClose={() => setCreateReleaseOpen(false)}
        onNameChange={setReleaseName}
        onTypeChange={handleReleaseTypeChange}
        onVersionChange={handleVersionChange}
        onNotesChange={setNotes}
        onArtifactRefChange={setArtifactRef}
        onCreate={() => runAction("create-release", async () => {
          const result = await sitesApi.createRelease({
            name: releaseName.trim(),
            version: newVersion || suggestedVersion || undefined,
            releaseType,
            notes: notes || undefined,
            artifactRef: artifactRef || undefined
          });
          const requestedName = releaseName.trim();
          let createdRelease = result.data;
          if (requestedName && !createdRelease.name) {
            const repairResult = await sitesApi.updateRelease(createdRelease._id, {
              name: requestedName,
              version: createdRelease.version,
              releaseType: createdRelease.releaseType,
              artifactRef: createdRelease.artifactRef || "",
              notes: createdRelease.notes || "",
              status: createdRelease.status
            });
            createdRelease = repairResult.data;
          }
          setCreateReleaseOpen(false);
          setSelectedReleaseId(createdRelease._id);
          setReleaseName("");
          setNewVersion("");
          setVersionManuallyEdited(false);
          setNotes("");
          setArtifactRef("");

          try {
            const validation = await sitesApi.validateReleaseArtifact(createdRelease._id);
            setValidationByReleaseId((prev) => ({ ...prev, [createdRelease._id]: validation.data }));
            setMessage(
              validation.data.summary.readyForDeploy
                ? `${releaseDisplayLabel(createdRelease)} נוצר ואומת אוטומטית. הוא עדיין לא נפרס.`
                : `${releaseDisplayLabel(createdRelease)} נוצר ונבדק אוטומטית, אבל ה-Artifact עדיין חסום. אפשר להריץ Validate שוב אחרי תיקון.`
            );
          } catch (validationError) {
            setMessage(`${releaseDisplayLabel(createdRelease)} נוצר ב-Hub. הוא לא נפרס בפועל.`);
            setActionError(`ה-Release נוצר, אבל Validate אוטומטי נכשל: ${validationError instanceof Error ? validationError.message : "שגיאה לא ידועה"}`);
          }
          await load();
        })}
      />

      <EditReleaseModal
        release={editRelease}
        draft={editReleaseDraft}
        busy={busyAction === "edit-release"}
        onDraftChange={setEditReleaseDraft}
        onClose={closeEditRelease}
        onSave={() => void saveEditRelease()}
      />

      <ProtectedActionDialog
        open={deployConfirmOpen}
        title="אישור Execute לפריסה"
        description={`פריסה חיה של ${selectedRelease ? releaseDisplayLabel(selectedRelease) : "ה-Release הנבחר"} ל-${formatNumber(executablePlanRows.length)} אתרים מוכנים. הפעולה תרוץ דרך Browser SharePoint ותשמור evidence לאחר כל אתר.`}
        confirmWord={`Deploy ${selectedRelease?.version || ""}`.trim()}
        noteLabel="סיבת פריסה"
        notePlaceholder="לדוגמה: פריסת גרסה מאושרת אחרי Dry-run נקי"
        noteHint="נדרש נימוק של לפחות 3 תווים כדי למנוע Execute בטעות. ה־evidence וה־audit יישמרו לאחר ביצוע הפריסה."
        confirmLabel="Execute deploy"
        busy={busyAction === "batch-run"}
        risks={[
          `${formatNumber(executablePlanRows.length)} אתרים יקבלו את קבצי ה-Artifact של ${selectedRelease ? releaseDisplayLabel(selectedRelease) : "ה-Release הנבחר"}.`,
          allowDeployWithoutBackup ? "נבחר Override: הפריסה תרוץ גם אם אין גיבוי מאומת לפני דריסת הקבצים." : "",
          batchPlan ? `${formatNumber(batchPlan.summary.alreadyUpToDateSites)} אתרים כבר עדכניים וידולגו.` : "חסר Dry-run.",
          batchPlan ? `${formatNumber(batchPlan.summary.blockedSites)} אתרים חסומים לא ייפרסו.` : "חסר Dry-run.",
          currentPlanFresh ? "ה-Dry-run תואם לבחירה הנוכחית." : "ה-Dry-run לא תואם לבחירה הנוכחית, ולכן Execute ייחסם."
        ].filter(Boolean)}
        onClose={() => setDeployConfirmOpen(false)}
        onConfirm={() => {
          setDeployConfirmOpen(false);
          void executeBatchDeploy();
        }}
      />

      <ProtectedActionDialog
	        open={rollbackConfirmOpen}
	        title="הרצת Rollback"
	        description={`הרצת Rollback דרך הדפדפן עבור ${formatNumber(rollbackRows.filter((row) => row.ready).length)} אתרים אל ${rollbackRelease ? releaseDisplayLabel(rollbackRelease) : "ה-Release הנבחר"}. השרת ישמור Job ו־Evidence בלבד.`}
        confirmWord="Rollback"
        noteLabel="סיבת Rollback"
        notePlaceholder="לדוגמה: תקלה בגרסה האחרונה, חזרה לגרסה יציבה לאחר בדיקת backup"
        initialNote={rollbackReason}
	        confirmLabel="הרץ Rollback בדפדפן"
        busy={busyAction === "rollback-run"}
        risks={[
          `Rollback ידרוס קבצי dist חיים ב-SharePoint באמצעות artifact של ${rollbackRelease ? releaseDisplayLabel(rollbackRelease) : "Release היעד"}.`,
          "מומלץ לוודא שקיים backup/evidence עדכני לפני ההרצה.",
          "קבצים שלא קיימים ב-artifact היעד לא בהכרח יימחקו, בהתאם למדיניות stale files."
        ]}
        onClose={() => setRollbackConfirmOpen(false)}
        onConfirm={(reason) => {
          setRollbackReason(reason);
          void executeRollback(reason);
        }}
      />
    </div>
  );
}
