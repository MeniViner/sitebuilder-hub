import type { Backup } from "../api/sitesApi";
import type { Site } from "../types/site";

export type VisibleRole = "admin" | "viewer";
export type HumanOperationState = "ready" | "in-progress" | "succeeded" | "failed";
export type HumanSiteCondition = "ready" | "needs-attention" | "unavailable";

export type HumanState<T extends string> = {
  state: T;
  label: string;
  internalState: string;
  reason: string;
};

const labels: Record<HumanOperationState, string> = {
  ready: "מוכן",
  "in-progress": "בתהליך",
  succeeded: "הושלם",
  failed: "נכשל"
};

const activeStates = new Set(["awaiting-approval", "queued", "preflight", "running", "uploading", "verifying", "retrying", "waiting-external", "partial", "browser-required", "browser-in-progress"]);
const successStates = new Set(["completed", "complete", "success", "succeeded", "verified", "ready"]);
const failedStates = new Set(["failed", "error", "rejected", "cancelled", "expired", "partial-failed", "partially-failed", "recovery-required", "blocked-service-auth-required"]);

const operationTitles: Record<string, string> = {
  "health-check": "בדיקת תקינות",
  deploy: "עדכון אתר",
  backup: "גיבוי",
  restore: "שחזור",
  "admin-sync": "עדכון גישה",
  repair: "תיקון אתר",
  "version-upgrade": "עדכון גרסה",
  "version-rollback": "חזרה לגרסה קודמת",
  "site-provision": "הכנת אתר",
  "site-bootstrap": "השלמת אתר",
  "permissions-setup": "עדכון גישה"
};

export function presentOperationTitle(type?: string | null) {
  return operationTitles[String(type || "").trim().toLowerCase()] || "פעולה באתר";
}

export function presentOperationState(value?: string | null, options: { terminalBlocker?: boolean; reason?: string } = {}): HumanState<HumanOperationState> {
  const internalState = String(value || "unknown").trim().toLowerCase().replace(/_/g, "-");
  const state: HumanOperationState = activeStates.has(internalState)
    ? "in-progress"
    : successStates.has(internalState)
      ? "succeeded"
      : failedStates.has(internalState) || options.terminalBlocker
        ? "failed"
        : "ready";
  return {
    state,
    label: labels[state],
    internalState,
    reason: options.reason || (internalState === "unknown" ? "טרם התקבל מצב מאומת" : "")
  };
}

const conditionLabels: Record<HumanSiteCondition, string> = {
  ready: "מוכן",
  "needs-attention": "דורש תשומת לב",
  unavailable: "לא זמין"
};

export const SITE_HEALTH_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export function presentSiteCondition(site: Partial<Site>, options: { now?: Date | string | number } = {}): HumanState<HumanSiteCondition> {
  const health = site.derivedHealthStatus || "unknown";
  const lifecycle = site.lifecycleStatus || "unknown";
  const provisioning = site.provisioningStatus || "unknown";
  const storageBackend = site.storageBackend || "unknown";
  const now = options.now instanceof Date ? options.now.getTime() : new Date(options.now ?? Date.now()).getTime();
  const lastHealthAt = Date.parse(site.lastHealthCheckAt || "");
  const healthStale = !Number.isFinite(lastHealthAt) || now - lastHealthAt > SITE_HEALTH_STALE_AFTER_MS;
  const storageIdentityUnknown = storageBackend === "unknown" || (storageBackend === "mongo" && !(site.builderSiteId && site.mongoSiteId && site.safeCollectionName));
  const runtimeUnavailable = site.dataBackendStatus === "failed";
  const runtimeNeedsAttention = site.dataBackendStatus === "warning" || site.runtimeConfigStatus?.readStatus === "missing" || site.runtimeConfigStatus?.readStatus === "invalid" || site.runtimeConfigStatus?.readStatus === "error";
  const archived = site.status === "archived" || lifecycle === "archived";
  const terminalFailure = lifecycle === "failed" && (health === "failed" || site.dataBackendStatus === "failed");
  const unavailable = archived || terminalFailure || runtimeUnavailable;
  const incomplete = ["draft", "planned", "provisioning", "partially-created", "failed", "unknown"].includes(lifecycle)
    || ["planned", "running", "partially-created", "failed", "unknown"].includes(provisioning);
  const versionNeedsAttention = ["outdated", "updating", "failed"].includes(site.versionStatus || "unknown");
  const needsAttention = health !== "healthy" || healthStale || storageIdentityUnknown || runtimeNeedsAttention || incomplete || versionNeedsAttention || site.status === "warning" || site.status === "failed";
  const state: HumanSiteCondition = unavailable ? "unavailable" : needsAttention ? "needs-attention" : "ready";
  const reason = archived
    ? "האתר בארכיון"
    : terminalFailure || runtimeUnavailable
      ? "האתר אינו זמין כרגע"
      : incomplete
        ? "ההקמה עדיין לא הושלמה"
        : storageIdentityUnknown
          ? "זהות אחסון הנתונים עדיין לא אומתה"
          : runtimeNeedsAttention
            ? "חיבור נתוני האתר דורש בדיקה"
            : site.versionStatus === "outdated"
          ? "קיים עדכון שטרם הותקן"
          : site.versionStatus === "updating"
            ? "עדכון האתר עדיין בתהליך"
            : site.versionStatus === "failed"
              ? "עדכון האתר דורש בדיקה"
              : healthStale
                ? "בדיקת התקינות אינה עדכנית"
              : health === "unknown"
                ? "האתר עדיין לא נבדק"
                : health === "warning" || health === "failed"
                  ? "בדיקת התקינות דורשת טיפול"
                  : "";
  return { state, label: conditionLabels[state], internalState: `${lifecycle}/${provisioning}/${health}/${storageBackend}`, reason };
}

export function isSiteSetupComplete(site: Partial<Site>, options: { now?: Date | string | number } = {}) {
  return site.lifecycleStatus === "ready"
    && site.provisioningStatus === "succeeded"
    && presentSiteCondition(site, options).state === "ready";
}

const environmentLabels: Record<string, string> = {
  local: "מקומית",
  dev: "פיתוח",
  test: "בדיקות",
  staging: "קדם־ייצור",
  production: "ייצור"
};

export function presentEnvironment(value?: string | null) {
  return environmentLabels[String(value || "").trim().toLowerCase()] || "לא ידועה";
}

export function presentVisibleRole(role?: string | null): VisibleRole {
  return role === "admin" || role === "operator" ? "admin" : "viewer";
}

export function canMutate(role?: string | null) {
  return presentVisibleRole(role) === "admin";
}

export type BackupPresentation = {
  recoverable: boolean;
  label: "גיבוי ניתן לשחזור" | "ראיית גיבוי בלבד" | "הגיבוי נכשל" | "לא אומת";
  reason: string;
};

export function presentBackupRecoverability(backup?: Partial<Backup> | null): BackupPresentation {
  if (!backup) return { recoverable: false, label: "לא אומת", reason: "לא נמצא גיבוי מאומת" };
  const status = presentOperationState(backup.status).state;
  const verified = String(backup.verification?.status || "").toLowerCase() === "verified";
  const hasPayload = Boolean(backup.storagePath && Number(backup.filesCount || 0) > 0);
  const sourceEvidenceComplete = !backup.sourcePaths?.length || backup.sourcePaths.every((source) => source.exists && source.status === "verified");
  const recoverable = status === "succeeded" && verified && hasPayload && sourceEvidenceComplete;
  if (recoverable) return { recoverable: true, label: "גיבוי ניתן לשחזור", reason: "המטען נשמר ואומת" };
  if (status === "failed") return { recoverable: false, label: "הגיבוי נכשל", reason: "הגיבוי לא הושלם ולא ניתן לשחזר ממנו" };
  if (verified || backup.storagePath || backup.sourcePaths?.length) {
    return { recoverable: false, label: "ראיית גיבוי בלבד", reason: "אין הוכחה מלאה למטען בר־שחזור" };
  }
  return { recoverable: false, label: "לא אומת", reason: "הגיבוי טרם אומת" };
}

export function lastVerifiedBackupAt(site: Partial<Site>): string | null {
  const evidence = site.recoveryState?.lastBackupEvidence;
  const status = String(evidence?.status || "").toLowerCase();
  const files = Number(evidence?.filesCount || 0);
  const verifiedFiles = Number(evidence?.verifiedFilesCount || 0);
  const failedFiles = Number(evidence?.failedFilesCount || 0);
  const fullyVerified = ["verified", "succeeded", "success"].includes(status)
    && files > 0
    && verifiedFiles === files
    && failedFiles === 0;
  return fullyVerified ? evidence?.recordedAt || site.lastBackupAt || null : null;
}

export type SettledSlice<T> =
  | { status: "ready"; data: T; error: "" }
  | { status: "stale"; data: T; error: string }
  | { status: "failed"; data: null; error: string };

export async function settleSlice<T>(work: Promise<T>, cached?: T): Promise<SettledSlice<T>> {
  try {
    return { status: "ready", data: await work, error: "" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "טעינת המידע נכשלה";
    return cached === undefined ? { status: "failed", data: null, error: message } : { status: "stale", data: cached, error: message };
  }
}
