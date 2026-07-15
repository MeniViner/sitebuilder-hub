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

const activeStates = new Set(["queued", "preflight", "running", "uploading", "verifying", "retrying", "waiting-external", "partial", "browser-in-progress"]);
const successStates = new Set(["completed", "complete", "success", "succeeded", "verified", "ready"]);
const failedStates = new Set(["failed", "error", "rejected", "cancelled", "expired", "recovery-required", "blocked-service-auth-required"]);

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

export function presentSiteCondition(site: Partial<Site>): HumanState<HumanSiteCondition> {
  const health = site.derivedHealthStatus || "unknown";
  const lifecycle = site.lifecycleStatus || "unknown";
  const provisioning = site.provisioningStatus || "unknown";
  const archived = site.status === "archived" || lifecycle === "archived";
  const terminalFailure = lifecycle === "failed" && (health === "failed" || site.dataBackendStatus === "failed");
  const unavailable = archived || terminalFailure;
  const incomplete = ["draft", "planned", "provisioning", "partially-created", "failed", "unknown"].includes(lifecycle)
    || ["planned", "running", "partially-created", "failed", "unknown"].includes(provisioning);
  const versionNeedsAttention = ["outdated", "updating", "failed"].includes(site.versionStatus || "unknown");
  const needsAttention = health !== "healthy" || incomplete || versionNeedsAttention || site.status === "warning" || site.status === "failed";
  const state: HumanSiteCondition = unavailable ? "unavailable" : needsAttention ? "needs-attention" : "ready";
  const reason = archived
    ? "האתר בארכיון"
    : terminalFailure
      ? "האתר נכשל ואינו נגיש"
      : incomplete
        ? "ההקמה עדיין לא הושלמה"
        : site.versionStatus === "outdated"
          ? "קיים עדכון שטרם הותקן"
          : site.versionStatus === "updating"
            ? "עדכון האתר עדיין בתהליך"
            : site.versionStatus === "failed"
              ? "עדכון האתר דורש בדיקה"
              : health === "unknown"
                ? "האתר עדיין לא נבדק"
                : health === "warning" || health === "failed"
                  ? "בדיקת התקינות דורשת טיפול"
                  : "";
  return { state, label: conditionLabels[state], internalState: `${lifecycle}/${provisioning}/${health}`, reason };
}

export function presentVisibleRole(role?: string | null): VisibleRole {
  return role === "admin" || role === "operator" ? "admin" : "viewer";
}

export function canMutate(role?: string | null) {
  return presentVisibleRole(role) === "admin";
}

export type BackupPresentation = {
  recoverable: boolean;
  label: "גיבוי ניתן לשחזור" | "ראיית גיבוי בלבד" | "לא אומת";
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
  | { status: "failed"; data: null; error: string };

export async function settleSlice<T>(work: Promise<T>): Promise<SettledSlice<T>> {
  try {
    return { status: "ready", data: await work, error: "" };
  } catch (error) {
    return { status: "failed", data: null, error: error instanceof Error ? error.message : "טעינת המידע נכשלה" };
  }
}
