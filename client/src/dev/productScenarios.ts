import type { Backup, Job, Release } from "../api/sitesApi";
import type { Site } from "../types/site";

export const PRODUCT_SCENARIO_NOW = "2026-07-16T10:00:00.000Z";
export const PRODUCT_SCENARIO_FRESH_HEALTH = "2026-07-16T09:30:00.000Z";
export const PRODUCT_SCENARIO_STALE_HEALTH = "2026-07-13T08:00:00.000Z";

export type ScenarioEndpoint =
  | "sites"
  | "site"
  | "siteBackups"
  | "access"
  | "activity"
  | "deployments"
  | "operationsBackups"
  | "releases"
  | "createSite";

export type ScenarioFailureRule = {
  mode: "error" | "timeout";
  afterSuccesses?: number;
};

export type ProductScenario = {
  id: string;
  label: string;
  authRole: string;
  sites: Site[];
  jobs: Job[];
  backups: Backup[];
  releases: Release[];
  failures?: Partial<Record<ScenarioEndpoint, ScenarioFailureRule>>;
  createOutcome?: "partial" | "complete" | "failed";
};

export function makeScenarioSite(values: Partial<Site> = {}): Site {
  const _id = values._id || "managed-ready";
  const siteCode = values.siteCode || "ready-portal";
  return {
    _id,
    siteCode,
    displayName: values.displayName || "פורטל מוכן",
    sharePointSiteUrl: values.sharePointSiteUrl || `https://portal.example/sites/${siteCode}`,
    finalAppUrl: values.finalAppUrl || `https://portal.example/sites/${siteCode}/SiteAssets/app/index.html`,
    status: "active",
    lifecycleStatus: "ready",
    provisioningStatus: "succeeded",
    creationMode: "create-new",
    storageBackend: "txt",
    environment: "production",
    currentVersion: "2.4.1",
    latestKnownVersion: "2.4.1",
    versionStatus: "up_to_date",
    derivedHealthStatus: "healthy",
    dataBackendStatus: "ok",
    lastHealthCheckAt: PRODUCT_SCENARIO_FRESH_HEALTH,
    ownerName: "נועה לוי",
    ownerEmail: "noa.levi@example.org",
    unitName: "תפעול",
    createdAt: "2026-06-01T08:00:00.000Z",
    updatedAt: PRODUCT_SCENARIO_NOW,
    ...values
  };
}

export function makeScenarioJob(values: Partial<Job> & Pick<Job, "_id" | "type" | "status">): Job {
  return {
    progressPercent: values.status === "succeeded" ? 100 : 45,
    createdAt: "2026-07-15T08:00:00.000Z",
    siteId: "managed-ready",
    ...values
  } as Job;
}

export function makeScenarioBackup(values: Partial<Backup> & Pick<Backup, "_id" | "status">): Backup {
  return {
    siteId: "managed-ready",
    backupId: values._id,
    filesCount: 0,
    sizeBytes: 0,
    createdAt: "2026-07-15T07:00:00.000Z",
    ...values
  };
}

const readySite = makeScenarioSite({
  recoveryState: {
    lastBackupEvidence: {
      backupId: "backup-verified",
      status: "verified",
      recordedAt: "2026-07-15T07:05:00.000Z",
      filesCount: 6,
      verifiedFilesCount: 6,
      failedFilesCount: 0
    }
  },
  lastBackupAt: "2026-07-15T07:05:00.000Z"
});

const scenarioSites: Site[] = [
  readySite,
  makeScenarioSite({ _id: "managed-attention", siteCode: "attention", displayName: "פורטל דורש טיפול", derivedHealthStatus: "warning" }),
  makeScenarioSite({ _id: "managed-unavailable", siteCode: "unavailable", displayName: "פורטל לא זמין", dataBackendStatus: "failed" }),
  makeScenarioSite({
    _id: "managed-partial",
    siteCode: "partial",
    displayName: "אתר בהקמה",
    lifecycleStatus: "partially-created",
    provisioningStatus: "partially-created",
    status: "draft",
    finalAppUrl: undefined
  }),
  makeScenarioSite({ _id: "managed-storage-unknown", siteCode: "storage-unknown", displayName: "אחסון לא מזוהה", storageBackend: "unknown" }),
  makeScenarioSite({ _id: "managed-runtime-down", siteCode: "runtime-down", displayName: "יישום לא זמין", dataBackendStatus: "failed", finalAppUrl: undefined }),
  makeScenarioSite({ _id: "managed-health-stale", siteCode: "health-stale", displayName: "בדיקה לא עדכנית", lastHealthCheckAt: PRODUCT_SCENARIO_STALE_HEALTH }),
  makeScenarioSite({ _id: "managed-outdated", siteCode: "outdated", displayName: "גרסה ישנה", currentVersion: "2.3.0", versionStatus: "outdated" }),
  makeScenarioSite({ _id: "managed-updating", siteCode: "updating", displayName: "עדכון בתהליך", currentVersion: "2.3.0", targetVersion: "2.4.1", versionStatus: "updating" }),
  makeScenarioSite({ _id: "managed-no-backup", siteCode: "no-backup", displayName: "אתר ללא גיבוי", recoveryState: undefined, lastBackupAt: undefined })
];

const scenarioJobs: Job[] = [
  makeScenarioJob({ _id: "job-running", type: "deploy", status: "running", startedAt: "2026-07-15T09:35:00.000Z" }),
  makeScenarioJob({ _id: "job-backup-running", type: "backup", status: "verifying", startedAt: "2026-07-15T09:30:00.000Z" }),
  makeScenarioJob({ _id: "job-retrying", type: "health-check", status: "retrying", startedAt: "2026-07-15T09:25:00.000Z" }),
  makeScenarioJob({ _id: "job-browser-required", type: "permissions-setup", status: "browser-required", createdAt: "2026-07-15T09:20:00.000Z" }),
  makeScenarioJob({ _id: "job-partial", type: "site-bootstrap", status: "partial" as Job["status"], siteId: "managed-partial", createdAt: "2026-07-15T09:15:00.000Z" }),
  makeScenarioJob({ _id: "job-succeeded", type: "backup", status: "succeeded", progressPercent: 100, finishedAt: "2026-07-15T09:10:00.000Z" }),
  makeScenarioJob({ _id: "job-failed", type: "deploy", status: "failed", progressPercent: 60, errorMessage: "internal failure detail", finishedAt: "2026-07-15T09:05:00.000Z" }),
  makeScenarioJob({ _id: "job-restore-running", type: "restore", status: "running", startedAt: "2026-07-15T09:00:00.000Z" }),
  makeScenarioJob({ _id: "job-restore-partial-failed", type: "restore", status: "partially-failed" as Job["status"], progressPercent: 80, errorMessage: "two files failed", finishedAt: "2026-07-15T08:55:00.000Z" }),
  makeScenarioJob({ _id: "job-unknown-type", type: "internal_collection_reconcile", status: "succeeded", progressPercent: 100, createdAt: "2026-07-15T09:40:00.000Z", finishedAt: "2026-07-15T09:41:00.000Z" })
];

const scenarioBackups: Backup[] = [
  makeScenarioBackup({ _id: "backup-evidence", status: "succeeded", sourcePaths: [{ path: "/source/site", exists: true, status: "verified" }] }),
  makeScenarioBackup({ _id: "backup-payload-unverified", status: "succeeded", storagePath: "/backups/payload", filesCount: 5, sizeBytes: 2048, verification: { status: "pending" } }),
  makeScenarioBackup({
    _id: "backup-verified",
    status: "succeeded",
    storagePath: "/backups/verified",
    filesCount: 6,
    sizeBytes: 4096,
    verification: { status: "verified", checkedAt: "2026-07-15T07:05:00.000Z" },
    sourcePaths: [{ path: "/source/site", exists: true, status: "verified" }]
  }),
  makeScenarioBackup({ _id: "backup-failed", status: "failed", filesCount: 2, sizeBytes: 1024 }),
  makeScenarioBackup({ _id: "backup-restore-running", status: "succeeded", storagePath: "/backups/restoring", filesCount: 4, sizeBytes: 3072, verification: { status: "verified" }, restoreStatus: "running" }),
  makeScenarioBackup({ _id: "backup-restore-failed", status: "succeeded", storagePath: "/backups/restore-failed", filesCount: 4, sizeBytes: 3072, verification: { status: "verified" }, restoreStatus: "failed", lastRestoreError: "partial restore" })
];

const scenarioReleases: Release[] = [{
  _id: "release-241",
  name: "גרסה יציבה",
  version: "2.4.1",
  releaseType: "patch",
  status: "active",
  createdAt: "2026-07-14T10:00:00.000Z"
}];

function scenario(
  id: string,
  values: Partial<Omit<ProductScenario, "id" | "label">> & { label: string }
): ProductScenario {
  return {
    id,
    authRole: "admin",
    sites: scenarioSites,
    jobs: scenarioJobs,
    backups: scenarioBackups,
    releases: scenarioReleases,
    ...values
  };
}

export const PRODUCT_SCENARIOS = {
  admin: scenario("admin", { label: "Admin with realistic mixed states" }),
  viewer: scenario("viewer", { label: "Viewer read-only", authRole: "viewer" }),
  "unknown-role": scenario("unknown-role", { label: "Malformed role fails closed", authRole: "super-admin-v2" }),
  empty: scenario("empty", { label: "No sites, operations, or backups", sites: [], jobs: [], backups: [], releases: [] }),
  "backups-fail": scenario("backups-fail", { label: "Site loads while backups fail", failures: { siteBackups: { mode: "error" } } }),
  "access-fail": scenario("access-fail", { label: "Site loads while access fails", failures: { access: { mode: "error" } } }),
  "activity-fail": scenario("activity-fail", { label: "Site loads while activity fails", failures: { activity: { mode: "error" } } }),
  "secondary-timeout": scenario("secondary-timeout", { label: "Secondary request times out", failures: { deployments: { mode: "timeout" } } }),
  cached: scenario("cached", { label: "Cached slice survives refresh failure", failures: { siteBackups: { mode: "error", afterSuccesses: 2 } } }),
  "no-data": scenario("no-data", { label: "Core data is unavailable", failures: { sites: { mode: "error" }, site: { mode: "error" }, activity: { mode: "error" }, operationsBackups: { mode: "error" }, releases: { mode: "error" } } }),
  "partial-setup": scenario("partial-setup", { label: "Creation persists as partial", createOutcome: "partial" }),
  "complete-setup": scenario("complete-setup", { label: "All completion gates pass", createOutcome: "complete" }),
  "failed-setup": scenario("failed-setup", { label: "Creation fails safely", createOutcome: "failed", failures: { createSite: { mode: "error" } } }),
  "failed-operation": scenario("failed-operation", { label: "Failed and partially failed operations", jobs: scenarioJobs.filter((job) => ["job-failed", "job-restore-partial-failed"].includes(job._id)) })
} as const satisfies Record<string, ProductScenario>;

export type ProductScenarioId = keyof typeof PRODUCT_SCENARIOS;

export function getProductScenario(value?: string | null): ProductScenario | null {
  return Object.prototype.hasOwnProperty.call(PRODUCT_SCENARIOS, value || "")
    ? PRODUCT_SCENARIOS[value as ProductScenarioId]
    : null;
}

export function scenarioSiteById(scenarioValue: ProductScenario, managedSiteId: string) {
  return scenarioValue.sites.find((site) => site._id === managedSiteId) || null;
}
