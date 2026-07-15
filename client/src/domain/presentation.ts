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
  const needsAttention = health !== "healthy" || incomplete || site.status === "warning" || site.status === "failed";
  const state: HumanSiteCondition = unavailable ? "unavailable" : needsAttention ? "needs-attention" : "ready";
  const reason = archived
    ? "האתר בארכיון"
    : terminalFailure
      ? "האתר נכשל ואינו נגיש"
      : health === "unknown"
        ? "האתר עדיין לא נבדק"
        : incomplete
          ? "ההקמה עדיין לא הושלמה"
          : health === "warning" || health === "failed"
            ? "בדיקת התקינות דורשת טיפול"
            : "";
  return { state, label: conditionLabels[state], internalState: `${lifecycle}/${provisioning}/${health}`, reason };
}

export function presentVisibleRole(role?: string | null): VisibleRole {
  return role === "viewer" ? "viewer" : "admin";
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

