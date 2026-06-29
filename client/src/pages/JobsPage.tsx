import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Eye, RefreshCcw, RotateCcw, ShieldCheck, Workflow, X, XCircle } from "lucide-react";
import { Job, sitesApi } from "../api/sitesApi";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { DetailsDrawer } from "../components/DetailsDrawer";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { FilterBar } from "../components/FilterBar";
import { HelpLabel } from "../components/help/HelpLabel";
import { KpiCard } from "../components/KpiCard";
import { LoadingState } from "../components/LoadingState";
import { MetadataOnlyBadge } from "../components/MetadataOnlyBadge";
import { PageHeader } from "../components/PageHeader";
import { ProtectedActionDialog } from "../components/ProtectedActionDialog";
import { SectionCard } from "../components/SectionCard";
import { StatusToken } from "../components/StatusToken";
import { formatDateTime, formatNumber, jobStatusLabel, jobTypeLabel } from "../utils/format";

const activeStatuses = new Set(["preflight", "running", "verifying", "browser-in-progress"]);

const jobStatusBadgeClass = (status: Job["status"]) => {
  if (status === "failed") return "badge-danger";
  if (status === "succeeded") return "badge-success";
  if (status === "awaiting-approval") return "badge-warning";
  if (status === "browser-required") return "badge-warning";
  if (status === "blocked-service-auth-required") return "badge-danger";
  if (status === "preflight" || status === "running" || status === "verifying" || status === "browser-in-progress") return "badge-info";
  if (status === "retrying") return "badge-warning";
  return "badge-neutral";
};

const approvalText = (value: unknown) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const payloadCount = (value: unknown) => Array.isArray(value) ? value.length : value ? 1 : 0;

type ApprovalAction = "approve" | "reject";
type ApprovalDialogState = { job: Job; action: ApprovalAction } | null;
type RerunDialogState = { job: Job } | null;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const stringValue = (value: unknown) => typeof value === "string" ? value : "";

const stringList = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];

const approvalSummaryRecord = (job: Job) => isRecord(job.approvalSummary) ? job.approvalSummary : null;

const approvalSnapshotRecord = (job: Job) => isRecord(job.approvalSnapshot) ? job.approvalSnapshot : null;

const approvalSummaryTitle = (job: Job) => {
  const summary = approvalSummaryRecord(job);
  return stringValue(summary?.title) || stringValue(job.approvalSummary) || jobTypeLabel(job.type);
};

const approvalSummaryMessage = (job: Job) => {
  const summary = approvalSummaryRecord(job);
  return stringValue(summary?.message) || (summary ? approvalText(summary) : "");
};

const approvalRisks = (job: Job) => {
  const summary = approvalSummaryRecord(job);
  const snapshot = approvalSnapshotRecord(job);
  return stringList(snapshot?.risks).length ? stringList(snapshot?.risks) : stringList(summary?.risks);
};

const approvalTargetPaths = (job: Job) => {
  const snapshot = approvalSnapshotRecord(job);
  const directPaths = job.targetPaths || stringList(snapshot?.targetPaths);
  if (directPaths.length) return directPaths;

  const files = Array.isArray(snapshot?.files) ? snapshot.files : [];
  return files
    .map((file) => isRecord(file) ? stringValue(file.targetPath) || stringValue(file.path) : "")
    .filter(Boolean);
};

const approvalBackupSafety = (job: Job) => {
  const snapshot = approvalSnapshotRecord(job);
  return isRecord(snapshot?.backupSafety) ? snapshot.backupSafety : null;
};

const jobErrorSummary = (job: Job) => {
  const exact = job.errorMessage || stringValue((job.result as any)?.error) || stringValue((job.evidence as any)?.error) || "";
  const code = exact.split(":")[0] || (job.status === "failed" ? "JOB_FAILED" : "");
  const sharePoint401 = exact.includes("sharepoint-digest-failed:401") || exact.includes("sharepoint") && exact.includes(":401");
  const browserRequired = job.status === "browser-required" || job.executionMode === "browser-required";
  return {
    action: jobTypeLabel(job.type),
    site: job.siteId || "לא ידוע",
    operationType: job.type,
    status: jobStatusLabel(job.status),
    errorCode: sharePoint401 ? "SHAREPOINT_401" : code,
    humanExplanation: browserRequired
      ? "הפעולה ממתינה להרצה דרך הדפדפן המחובר ל־SharePoint."
      : sharePoint401
      ? "הדפדפן מחובר ל־SharePoint, אבל השרת המקומי לא מחובר"
      : exact ? "הפעולה נכשלה בזמן הרצה. בדקו את השגיאה המדויקת ואת פרטי החיבור." : "לא נשמרה שגיאה מפורשת.",
    suggestedFix: browserRequired
      ? "פתחו את מסך הפעולה המתאים והריצו אותה דרך הדפדפן. ה־worker לא יריץ אותה מהשרת."
      : sharePoint401
      ? "השרת המקומי לא מחובר ל־SharePoint, אבל פעולות שמוגדרות לדפדפן יכולות להמשיך דרך חיבור הדפדפן."
      : "הריצו אבחון במסך בעיות וחיבורים ובדקו את הלוגים הטכניים.",
    exact
  };
};

const isWriteLikeJob = (job: Job) =>
  ["deploy", "restore", "repair", "version-upgrade", "version-rollback", "site-provision", "permissions-setup", "site-bootstrap", "backup", "admin-sync"].includes(job.type);

const rerunRisks = (job: Job) => {
  const risks = [
    `Job type: ${jobTypeLabel(job.type)}.`,
    `Current status: ${jobStatusLabel(job.status)}.`,
    job.siteId ? `Target site: ${job.siteId}.` : "Target site is not attached to this job.",
    "Rerun resets execution timestamps/result/evidence and queues the operation again."
  ];
  if (job.requiresApproval) {
    risks.push("This job requires approval; rerun will return it to the approval gate instead of running immediately.");
  }
  if (isWriteLikeJob(job)) {
    risks.push("This operation may write to SharePoint or update Hub metadata. Review the original evidence before rerun.");
  }
  if (job.status === "failed" && job.errorMessage) {
    risks.push(`Previous failure: ${job.errorMessage}`);
  }
  return risks;
};

function ApprovalReviewDialog({
  state,
  busy,
  onClose,
  onSubmit
}: {
  state: ApprovalDialogState;
  busy: boolean;
  onClose: () => void;
  onSubmit: (job: Job, action: ApprovalAction, reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");

  useEffect(() => {
    setReason("");
    setConfirmation("");
  }, [state?.job._id, state?.action]);

  if (!state) return null;

  const { job, action } = state;
  const isReject = action === "reject";
  const confirmWord = isReject ? "דחה" : "אשר";
  const summary = approvalSummaryRecord(job);
  const snapshot = approvalSnapshotRecord(job);
  const risks = approvalRisks(job);
  const targetPaths = approvalTargetPaths(job);
  const backupSafety = approvalBackupSafety(job);
  const canSubmit = reason.trim().length >= 3 && confirmation.trim() === confirmWord && !busy;
  const backup = isRecord(backupSafety?.backup) ? backupSafety.backup : null;

  const submit = async () => {
    if (!canSubmit) return;
    await onSubmit(job, action, reason.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="surface-card flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden">
        <header className="flex items-start justify-between gap-3 border-b divider px-5 py-4">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className={`badge ${isReject ? "badge-danger" : "badge-warning"}`}>
                {isReject ? <XCircle size={13} /> : <ShieldCheck size={13} />}
                {isReject ? "דחיית Approval" : "סקירת Approval"}
              </span>
              <span className={`badge ${jobStatusBadgeClass(job.status)}`}>{jobStatusLabel(job.status)}</span>
            </div>
            <h2 className="text-lg font-bold" style={{ color: "var(--text-strong)" }}>{approvalSummaryTitle(job)}</h2>
            <p className="mt-1 text-sm muted">{approvalSummaryMessage(job) || "בדוק את פרטי הפעולה לפני החלטה."}</p>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="סגור"><X size={17} /></button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="soft-panel p-3">
              <p className="field-label"><HelpLabel helpKey="job">Job</HelpLabel></p>
              <p className="font-bold">{jobTypeLabel(job.type)}</p>
              <p className="num text-xs muted">{job._id}</p>
            </div>
            <div className="soft-panel p-3">
              <p className="field-label"><HelpLabel helpKey="job.approval">מבקש</HelpLabel></p>
              <p>{job.approvalRequestedBy || job.createdBy || "system"}</p>
              <p className="num text-xs muted">{formatDateTime(job.approvalRequestedAt)}</p>
            </div>
            <div className="soft-panel p-3">
              <p className="field-label"><HelpLabel helpKey="deploy.targetMode">יעדים</HelpLabel></p>
              <p className="num">{formatNumber(targetPaths.length)}</p>
            </div>
            <div className="soft-panel p-3">
              <p className="field-label"><HelpLabel helpKey="deploy.warning">סיכונים</HelpLabel></p>
              <p className="num">{formatNumber(risks.length)}</p>
            </div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <section className="soft-panel p-4">
              <div className="mb-3 flex items-center gap-2 font-bold" style={{ color: risks.length ? "var(--warning)" : "var(--success)" }}>
                <AlertTriangle size={16} />
                סיכונים ונתיבי יעד
              </div>
              {risks.length ? (
                <ul className="list-disc space-y-2 pr-5 text-sm">
                  {risks.map((risk) => <li key={risk}>{risk}</li>)}
                </ul>
              ) : (
                <p className="text-sm muted">לא צורפו סיכונים מפורשים ל־approval snapshot.</p>
              )}
              <div className="mt-4 rounded-lg border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--border)" }}>
                <p className="field-label"><HelpLabel helpKey="deploy.targetMode">Target paths</HelpLabel></p>
                {targetPaths.length ? (
                  <div className="mt-2 max-h-48 space-y-1 overflow-auto">
                    {targetPaths.slice(0, 30).map((targetPath) => (
                      <code key={targetPath} className="num block truncate text-xs" title={targetPath}>{targetPath}</code>
                    ))}
                    {targetPaths.length > 30 ? <p className="text-xs muted">ועוד {formatNumber(targetPaths.length - 30)} נתיבים</p> : null}
                  </div>
                ) : (
                  <p className="text-sm muted">לא צורפו נתיבי יעד.</p>
                )}
              </div>
            </section>

            <section className="soft-panel p-4">
              <div className="mb-3 flex items-center gap-2 font-bold" style={{ color: backupSafety?.satisfied === false ? "var(--danger)" : "var(--success)" }}>
                <ShieldCheck size={16} />
                Backup safety
              </div>
              {backupSafety ? (
                <div className="grid gap-3 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="field-label"><HelpLabel helpKey="backup.verified">Policy</HelpLabel></p>
                      <p>{stringValue(backupSafety.policy) || "-"}</p>
                    </div>
                    <div>
                      <p className="field-label"><HelpLabel helpKey="backup.verified">Satisfied</HelpLabel></p>
                      <span className={`badge ${backupSafety.satisfied ? "badge-success" : "badge-danger"}`}>{backupSafety.satisfied ? "כן" : "לא"}</span>
                    </div>
                  </div>
                  <div>
                    <p className="field-label"><HelpLabel helpKey="backup">Backup</HelpLabel></p>
                    <p className="num text-xs">{stringValue(backup?.backupId) || stringValue(backup?.id) || "-"}</p>
                    <p className="text-xs muted">{stringValue(backup?.verificationStatus) || stringValue(backup?.status)}</p>
                  </div>
                  <pre className="num max-h-44 overflow-auto rounded-lg border p-3 text-xs" style={{ background: "var(--surface-muted)", borderColor: "var(--border)" }}>{approvalText(backupSafety)}</pre>
                </div>
              ) : (
                <p className="text-sm muted">לא צורף מידע backupSafety ל־approval snapshot.</p>
              )}
            </section>
          </div>

          {summary || snapshot ? (
            <details className="mt-4 rounded-lg border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--border)" }}>
              <summary className="cursor-pointer text-sm font-bold" style={{ color: "var(--text-strong)" }}>Raw approval payload</summary>
              <pre className="num mt-3 max-h-72 overflow-auto text-xs">{approvalText({ approvalSummary: job.approvalSummary, approvalSnapshot: job.approvalSnapshot })}</pre>
            </details>
          ) : null}

          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_16rem]">
            <label className="block text-sm">
              <span className="field-label"><HelpLabel helpKey="job.approval">סיבת החלטה</HelpLabel></span>
              <textarea className="control min-h-28" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={isReject ? "הסבר למה ה־Job נדחה" : "הסבר קצר למה הפעולה מאושרת"} />
              <span className="mt-1 block text-xs muted">נדרש טקסט של לפחות 3 תווים. הסיבה תישלח ל־API.</span>
            </label>
            <label className="block text-sm">
              <span className="field-label"><HelpLabel helpKey="job.approval">הקלד {confirmWord} לאישור פעולה</HelpLabel></span>
              <input className="control" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
              <span className="mt-1 block text-xs muted">מונע אישור או דחייה בטעות.</span>
            </label>
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t divider px-5 py-4" style={{ background: "var(--surface)" }}>
          <div className="text-xs muted">החלטה זו תישמר ב־Audit ותעדכן את סטטוס ה־Job.</div>
          <div className="flex gap-2">
            <button className="btn btn-secondary" onClick={onClose} type="button" disabled={busy}>ביטול</button>
            <button className={`btn ${isReject ? "btn-danger" : "btn-primary"}`} onClick={submit} type="button" disabled={!canSubmit}>
              {busy ? "שולח..." : isReject ? "דחה Job" : "אשר Job"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

export function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [busyAction, setBusyAction] = useState("");
  const [approvalDialog, setApprovalDialog] = useState<ApprovalDialogState>(null);
  const [rerunDialog, setRerunDialog] = useState<RerunDialogState>(null);

  const load = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError("");
    try {
      const res = await sitesApi.jobs();
      setJobs(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בטעינת Jobs");
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const timer = window.setInterval(() => load(false), 5000);
    return () => window.clearInterval(timer);
  }, []);

  const filteredJobs = useMemo(
    () =>
      jobs.filter((job) => {
        if (statusFilter === "all") return true;
        if (statusFilter === "active") return activeStatuses.has(job.status);
        if (statusFilter === "completed") return job.status === "succeeded" || job.status === "cancelled";
        return job.status === statusFilter;
      })
        .filter((job) => (typeFilter === "all" ? true : job.type === typeFilter)),
    [jobs, statusFilter, typeFilter]
  );

  const jobTypes = useMemo(() => [...new Set(jobs.map((job) => job.type))], [jobs]);
  const counts = {
    awaiting: jobs.filter((job) => job.status === "awaiting-approval").length,
    queued: jobs.filter((job) => job.status === "queued").length,
    browserRequired: jobs.filter((job) => job.status === "browser-required").length,
    serviceAuthBlocked: jobs.filter((job) => job.status === "blocked-service-auth-required").length,
    active: jobs.filter((job) => activeStatuses.has(job.status)).length,
    succeeded: jobs.filter((job) => job.status === "succeeded").length,
    completed: jobs.filter((job) => job.status === "succeeded" || job.status === "cancelled").length,
    failed: jobs.filter((job) => job.status === "failed").length
  };

  const rerun = async (job: Job, reason: string) => {
    setBusyAction(job._id);
    setError("");
    setMessage("");
    try {
      const result = await sitesApi.rerunJob(job._id, reason);
      const nextStatus = result.data.status === "awaiting-approval" ? "ממתין לאישור מתקדם" : "נשלח לתור";
      setMessage(`Job ${job._id} ${nextStatus}`);
      setRerunDialog(null);
      await load(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בהרצת Job מחדש");
    } finally {
      setBusyAction("");
    }
  };

  const queueTabs = [
    { key: "all", label: "הכל", count: jobs.length, token: "neutral" as const },
    { key: "awaiting-approval", label: "אישור מתקדם", count: counts.awaiting, token: "approval" as const },
    { key: "browser-required", label: "דפדפן", count: counts.browserRequired, token: "approval" as const },
    { key: "active", label: "בתהליך", count: counts.active, token: "running" as const },
    { key: "failed", label: "נכשלו", count: counts.failed, token: "blocked" as const },
    { key: "completed", label: "הושלמו", count: counts.completed, token: "success" as const }
  ];

  const jobColumns: DataTableColumn<Job>[] = [
    {
      key: "type",
      header: "סוג",
      helpKey: "job",
      render: (job) => (
        <div>
          <p className="font-bold" style={{ color: "var(--text-strong)" }}>{jobTypeLabel(job.type)}</p>
          <p className="num text-xs muted">{job._id}</p>
        </div>
      )
    },
    {
      key: "status",
      header: "סטטוס",
      helpKey: "job.status",
      render: (job) => <span className={`badge ${jobStatusBadgeClass(job.status)}`}>{jobStatusLabel(job.status)}</span>
    },
    {
      key: "progress",
      header: "התקדמות",
      helpKey: "job.running",
      render: (job) => (
        <div className="flex items-center gap-2">
          <div className="progress-track w-36"><div className="progress-fill" style={{ width: `${job.progressPercent || 0}%` }} /></div>
          <span className="num text-xs muted">{job.progressPercent || 0}%</span>
        </div>
      )
    },
    {
      key: "approval",
      header: "אישור",
      helpKey: "job.approval",
      render: (job) => (
        <div className="max-w-[260px]">
          {job.status === "awaiting-approval" ? (
            <div className="space-y-1">
              <StatusToken kind="approval" label="אישור מתקדם" compact />
              <p className="truncate text-xs muted" title={approvalSummaryTitle(job)}>{approvalSummaryTitle(job) || "-"}</p>
            </div>
          ) : job.requiresApproval ? (
            <span className="badge badge-neutral">{job.approvedAt ? "אושר" : job.rejectedAt ? "נדחה" : "Approval gate"}</span>
          ) : (
            <span className="text-xs muted">-</span>
          )}
        </div>
      )
    },
    {
      key: "created",
      header: "נוצר",
      helpKey: "history",
      render: (job) => <span className="num text-xs">{formatDateTime(job.createdAt)}</span>
    },
    {
      key: "finished",
      header: "הסתיים",
      helpKey: "history",
      render: (job) => <span className="num text-xs">{formatDateTime(job.finishedAt)}</span>
    },
    {
      key: "error",
      header: "שגיאה",
      helpKey: "job.failed",
      render: (job) => (
        <span className="block max-w-[240px] truncate text-sm" style={{ color: job.errorMessage ? "var(--danger)" : "var(--text-muted)" }} title={job.errorMessage || ""}>
          {job.errorMessage || "-"}
        </span>
      )
    },
    {
      key: "actions",
      header: "פעולות",
      helpKey: "operations",
      render: (job) => (
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-secondary min-h-0 px-2 py-1 text-xs" onClick={() => setSelectedJob(job)} type="button"><Eye size={13} />פרטים</button>
          {job.status === "awaiting-approval" ? (
            <>
              <button className="btn btn-primary min-h-0 px-2 py-1 text-xs" disabled={busyAction === `approve-${job._id}`} onClick={() => setApprovalDialog({ job, action: "approve" })} type="button"><CheckCircle2 size={13} />סקור ואשר</button>
              <button className="btn btn-danger min-h-0 px-2 py-1 text-xs" disabled={busyAction === `reject-${job._id}`} onClick={() => setApprovalDialog({ job, action: "reject" })} type="button"><XCircle size={13} />סקור ודחה</button>
            </>
          ) : null}
          <button
            className="btn btn-secondary min-h-0 px-2 py-1 text-xs"
            disabled={busyAction === job._id || activeStatuses.has(job.status) || job.status === "awaiting-approval"}
            onClick={() => setRerunDialog({ job })}
            type="button"
            title={activeStatuses.has(job.status) || job.status === "awaiting-approval" ? "Rerun זמין רק לפעולה שאינה רצה ואינה ממתינה לאישור" : "פתח אישור Rerun"}
          >
            <RotateCcw size={13} />Rerun
          </button>
        </div>
      )
    }
  ];

  const jobMobileCard = (job: Job) => (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-bold" style={{ color: "var(--text-strong)" }}>{jobTypeLabel(job.type)}</p>
          <p className="num truncate text-xs muted">{job._id}</p>
        </div>
        <span className={`badge ${jobStatusBadgeClass(job.status)}`}>{jobStatusLabel(job.status)}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="progress-track flex-1"><div className="progress-fill" style={{ width: `${job.progressPercent || 0}%` }} /></div>
        <span className="num text-xs muted">{job.progressPercent || 0}%</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <span className="muted">נוצר: <span className="num">{formatDateTime(job.createdAt)}</span></span>
        <span className="muted">הסתיים: <span className="num">{formatDateTime(job.finishedAt)}</span></span>
      </div>
      {job.errorMessage ? <p className="rounded-md border p-2 text-xs" style={{ background: "var(--danger-soft)", borderColor: "var(--border)", color: "var(--danger)" }}>{job.errorMessage}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-secondary min-h-0 px-2 py-1 text-xs" onClick={() => setSelectedJob(job)} type="button"><Eye size={13} />פרטים</button>
        {job.status === "awaiting-approval" ? (
          <>
            <button className="btn btn-primary min-h-0 px-2 py-1 text-xs" disabled={busyAction === `approve-${job._id}`} onClick={() => setApprovalDialog({ job, action: "approve" })} type="button"><CheckCircle2 size={13} />אשר</button>
            <button className="btn btn-danger min-h-0 px-2 py-1 text-xs" disabled={busyAction === `reject-${job._id}`} onClick={() => setApprovalDialog({ job, action: "reject" })} type="button"><XCircle size={13} />דחה</button>
          </>
        ) : null}
        <button
          className="btn btn-secondary min-h-0 px-2 py-1 text-xs"
          disabled={busyAction === job._id || activeStatuses.has(job.status) || job.status === "awaiting-approval"}
          onClick={() => setRerunDialog({ job })}
          type="button"
        >
          <RotateCcw size={13} />Rerun
        </button>
      </div>
    </div>
  );

  const decideApproval = async (job: Job, action: ApprovalAction, reason: string) => {
    setBusyAction(`${action}-${job._id}`);
    setError("");
    setMessage("");
    try {
      if (action === "approve") {
        await sitesApi.approveJob(job._id, reason);
        setMessage(`Job ${job._id} אושר ונכנס לתור`);
      } else {
        await sitesApi.rejectJob(job._id, reason);
        setMessage(`Job ${job._id} נדחה ובוטל`);
      }
      setApprovalDialog(null);
      await load(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : action === "approve" ? "שגיאה באישור Job" : "שגיאה בדחיית Job");
    } finally {
      setBusyAction("");
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="תור פעולות"
        subtitle="Operations Queue לפעולות פריסה, שחזור, גיבוי, הרשאות, health ו-provisioning. כל פעולה מסוכנת עוברת approval או confirmation לפני הרצה."
        helpKey="job"
        actions={
          <div className="flex flex-wrap gap-2">
            <StatusToken kind="running" label="Auto-refresh 5s" compact />
            <MetadataOnlyBadge mode="metadata" />
          </div>
        }
      />

      {message ? <div className="badge badge-success px-3 py-2">{message}</div> : null}
      {loading ? <LoadingState /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={() => load()} /> : null}

      {!loading && !error ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard variant="inline" title="אישור מתקדם" value={formatNumber(counts.awaiting)} icon={<CheckCircle2 size={18} />} description="מופיע רק אם מצב אישורים מתקדם פעיל" tone={counts.awaiting ? "warning" : "neutral"} helpKey="job.approval" />
            <KpiCard variant="inline" title="בתהליך" value={formatNumber(counts.active)} icon={<Workflow size={18} />} description={`${formatNumber(counts.queued)} בתור · ${formatNumber(counts.browserRequired)} ממתינים לדפדפן`} tone="info" helpKey="job.running" />
            <KpiCard variant="inline" title="הושלמו" value={formatNumber(counts.completed)} icon={<Workflow size={18} />} description="Succeeded או cancelled" tone="success" helpKey="job.completed" />
            <KpiCard variant="inline" title="נכשלו" value={formatNumber(counts.failed)} icon={<Workflow size={18} />} description="דורשים תחקור" tone={counts.failed ? "danger" : "success"} helpKey="job.failed" />
          </div>

          <SectionCard
            title="Operations Queue"
            subtitle="תור פעולות עם approval, retry מבוקר, evidence וסטטוס ריצה. Rerun דורש נימוק ואישור מוגן."
            helpKey="job"
            actions={<button className="btn btn-secondary" onClick={() => load()} type="button"><RefreshCcw size={15} />רענן עכשיו</button>}
          >
            <div className="queue-tabs" role="tablist" aria-label="סינון Queue">
              {queueTabs.map((tab) => (
                <button
                  key={tab.key}
                  className={`queue-tab ${statusFilter === tab.key ? "queue-tab-active" : ""}`}
                  type="button"
                  onClick={() => setStatusFilter(tab.key)}
                >
                  <span>{tab.label}</span>
                  <StatusToken kind={tab.token} label={formatNumber(tab.count)} compact />
                </button>
              ))}
            </div>
            <FilterBar>
              <label className="block">
                <span className="field-label"><HelpLabel helpKey="job.status">סטטוס</HelpLabel></span>
                <select className="control" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="all">כל הסטטוסים</option>
                  <option value="awaiting-approval">אישור מתקדם</option>
                  <option value="browser-required">ממתין להרצה דרך הדפדפן</option>
                  <option value="browser-in-progress">רץ דרך הדפדפן</option>
                  <option value="blocked-service-auth-required">דורש הרשאת שרת</option>
                  <option value="active">בתהליך</option>
                  <option value="queued">בתור</option>
                  <option value="preflight">בדיקה מקדימה</option>
                  <option value="running">רץ</option>
                  <option value="verifying">מאמת</option>
                  <option value="completed">הושלמו</option>
                  <option value="succeeded">הצליח</option>
                  <option value="failed">נכשל</option>
                  <option value="cancelled">בוטל</option>
                  <option value="retrying">ניסיון חוזר</option>
                </select>
              </label>
              <label className="block">
                <span className="field-label"><HelpLabel helpKey="job">סוג</HelpLabel></span>
                <select className="control" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                  <option value="all">כל הסוגים</option>
                  {jobTypes.map((type) => <option key={type} value={type}>{jobTypeLabel(type)}</option>)}
                </select>
              </label>
            </FilterBar>

            {filteredJobs.length === 0 ? (
              <EmptyState
                title={jobs.length === 0 ? "אין פעולות בתור" : "אין פעולות בסינון הנוכחי"}
                description={jobs.length === 0
                  ? "אין כרגע deploy, backup, restore, admin repair או health job שממתין להרצה. המסך מתרענן אוטומטית כל 5 שניות."
                  : "שנו סטטוס או סוג פעולה כדי לראות פעולות אחרות בתור."}
              />
            ) : (
              <DataTable columns={jobColumns} rows={filteredJobs} rowKey={(job) => job._id} mobileCard={jobMobileCard} minWidth={1240} density="dense" />
            )}
          </SectionCard>
        </>
      ) : null}

      <DetailsDrawer open={Boolean(selectedJob)} title={selectedJob ? jobTypeLabel(selectedJob.type) : "Job"} subtitle={selectedJob?._id} onClose={() => setSelectedJob(null)}>
        {selectedJob ? (
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="soft-panel p-3"><p className="field-label"><HelpLabel helpKey="job.status">סטטוס</HelpLabel></p><span className={`badge ${jobStatusBadgeClass(selectedJob.status)}`}>{jobStatusLabel(selectedJob.status)}</span></div>
              <div className="soft-panel p-3"><p className="field-label"><HelpLabel helpKey="job.running">התקדמות</HelpLabel></p><p className="num">{selectedJob.progressPercent || 0}%</p></div>
              <div className="soft-panel p-3"><p className="field-label"><HelpLabel helpKey="sharepoint.currentUser">נוצר על ידי</HelpLabel></p><p>{selectedJob.createdBy || "system"}</p></div>
              <div className="soft-panel p-3"><p className="field-label"><HelpLabel helpKey="history">נוצר</HelpLabel></p><p className="num">{formatDateTime(selectedJob.createdAt)}</p></div>
            </div>
            {selectedJob.errorMessage ? (
              <SectionCard title="פרטי כשל" compact helpKey="job.failed">
                {(() => {
                  const summary = jobErrorSummary(selectedJob);
                  return (
                    <div className="space-y-3">
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="soft-panel p-3"><p className="field-label"><HelpLabel helpKey="operations">פעולה</HelpLabel></p><p>{summary.action}</p></div>
                        <div className="soft-panel p-3"><p className="field-label"><HelpLabel helpKey="sites.registry">אתר</HelpLabel></p><p className="num">{summary.site}</p></div>
                        <div className="soft-panel p-3"><p className="field-label"><HelpLabel helpKey="job">סוג פעולה</HelpLabel></p><p>{summary.operationType}</p></div>
                        <div className="soft-panel p-3"><p className="field-label"><HelpLabel helpKey="job.status">סטטוס</HelpLabel></p><p>{summary.status}</p></div>
                        <div className="soft-panel p-3"><p className="field-label"><HelpLabel helpKey="diagnostics">קוד שגיאה</HelpLabel></p><p className="num">{summary.errorCode || "-"}</p></div>
                        <div className="soft-panel p-3"><p className="field-label"><HelpLabel helpKey="history">זמן</HelpLabel></p><p className="num">{formatDateTime(selectedJob.finishedAt || selectedJob.createdAt)}</p></div>
                      </div>
                      <div className="rounded-lg border p-3 text-sm" style={{ background: "var(--danger-soft)", color: "var(--danger)", borderColor: "var(--border)" }}>
                        <p className="font-bold">{summary.humanExplanation}</p>
                        <p className="mt-2">{summary.suggestedFix}</p>
                        <code className="num mt-3 block break-all text-xs">{summary.exact}</code>
                      </div>
                      <details className="rounded-lg border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--border)" }}>
                        <summary className="cursor-pointer text-sm font-bold" style={{ color: "var(--text-strong)" }}>פרטים טכניים</summary>
                        <pre className="num mt-3 max-h-72 overflow-auto text-xs">{approvalText({ result: selectedJob.result, evidence: selectedJob.evidence, approvalSnapshot: selectedJob.approvalSnapshot })}</pre>
                      </details>
                    </div>
                  );
                })()}
              </SectionCard>
            ) : null}
            {selectedJob.requiresApproval ? (
              <SectionCard title="Approval" compact helpKey="job.approval">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="soft-panel p-3">
                    <p className="field-label"><HelpLabel helpKey="job.approval">נדרש אישור</HelpLabel></p>
                    <p>{approvalSummaryTitle(selectedJob) || "-"}</p>
                    {approvalSummaryMessage(selectedJob) ? <p className="mt-1 text-xs muted">{approvalSummaryMessage(selectedJob)}</p> : null}
                  </div>
                  <div className="soft-panel p-3">
                    <p className="field-label"><HelpLabel helpKey="job.approval">מבקש</HelpLabel></p>
                    <p>{selectedJob.approvalRequestedBy || selectedJob.createdBy || "system"}</p>
                    <p className="num text-xs muted">{formatDateTime(selectedJob.approvalRequestedAt)}</p>
                  </div>
                  <div className="soft-panel p-3">
                    <p className="field-label"><HelpLabel helpKey="job.approval">אושר</HelpLabel></p>
                    <p>{selectedJob.approvedBy || "-"}</p>
                    <p className="num text-xs muted">{formatDateTime(selectedJob.approvedAt)}</p>
                  </div>
                  <div className="soft-panel p-3">
                    <p className="field-label"><HelpLabel helpKey="job.approval">נדחה</HelpLabel></p>
                    <p>{selectedJob.rejectedBy || "-"}</p>
                    <p className="num text-xs muted">{formatDateTime(selectedJob.rejectedAt)}</p>
                  </div>
                </div>
                {selectedJob.approvalDecisionReason ? (
                  <div className="mt-3 rounded-lg border p-3 text-sm muted" style={{ background: "var(--surface-muted)", borderColor: "var(--border)" }}>{selectedJob.approvalDecisionReason}</div>
                ) : null}
                {selectedJob.approvalSnapshot ? (
                  <pre className="num mt-3 max-h-72 overflow-auto rounded-lg border p-3 text-xs" style={{ background: "var(--surface-muted)", borderColor: "var(--border)" }}>{approvalText(selectedJob.approvalSnapshot)}</pre>
                ) : null}
              </SectionCard>
            ) : null}
            {selectedJob.targetPaths?.length || selectedJob.result || selectedJob.evidence ? (
              <SectionCard title="Execution Evidence" compact helpKey="audit.evidence">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="soft-panel p-3">
                    <p className="field-label"><HelpLabel helpKey="deploy.targetMode">Target paths</HelpLabel></p>
                    <p className="num">{formatNumber(selectedJob.targetPaths?.length || 0)}</p>
                  </div>
                  <div className="soft-panel p-3">
                    <p className="field-label"><HelpLabel helpKey="audit.evidence">Result</HelpLabel></p>
                    <p className="num">{payloadCount(selectedJob.result)}</p>
                  </div>
                  <div className="soft-panel p-3">
                    <p className="field-label"><HelpLabel helpKey="audit.evidence">Evidence rows</HelpLabel></p>
                    <p className="num">{formatNumber(payloadCount(selectedJob.evidence))}</p>
                  </div>
                </div>
                {selectedJob.targetPaths?.length ? (
                  <div className="mt-3 rounded-lg border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--border)" }}>
                    <p className="field-label"><HelpLabel helpKey="deploy.targetMode">Target paths sample</HelpLabel></p>
                    <div className="mt-2 space-y-1">
                      {selectedJob.targetPaths.slice(0, 12).map((targetPath) => (
                        <code key={targetPath} className="num block truncate text-xs" title={targetPath}>{targetPath}</code>
                      ))}
                    </div>
                  </div>
                ) : null}
                {selectedJob.result ? (
                  <pre className="num mt-3 max-h-72 overflow-auto rounded-lg border p-3 text-xs" style={{ background: "var(--surface-muted)", borderColor: "var(--border)" }}>{approvalText(selectedJob.result)}</pre>
                ) : null}
                {selectedJob.evidence ? (
                  <pre className="num mt-3 max-h-96 overflow-auto rounded-lg border p-3 text-xs" style={{ background: "var(--surface-muted)", borderColor: "var(--border)" }}>{approvalText(selectedJob.evidence)}</pre>
                ) : null}
              </SectionCard>
            ) : null}
            <SectionCard title="Logs" compact helpKey="job.logs">
              {selectedJob.logs?.length ? (
                <div className="space-y-2">
                  {selectedJob.logs.map((log, index) => (
                    <div key={`${log.at}-${index}`} className="border-b divider pb-2 last:border-b-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`badge ${log.level === "error" ? "badge-danger" : log.level === "warn" ? "badge-warning" : "badge-neutral"}`}>{log.level}</span>
                        <span className="num text-xs muted">{formatDateTime(log.at)}</span>
                      </div>
                      <p className="mt-1 text-sm">{log.message}</p>
                    </div>
                  ))}
                </div>
              ) : <EmptyState title="אין Logs" description="לא נשמרו לוגים עבור Job זה." />}
            </SectionCard>
          </div>
        ) : null}
      </DetailsDrawer>
      <ApprovalReviewDialog
        state={approvalDialog}
        busy={Boolean(approvalDialog && busyAction === `${approvalDialog.action}-${approvalDialog.job._id}`)}
        onClose={() => setApprovalDialog(null)}
        onSubmit={decideApproval}
      />
      <ProtectedActionDialog
        open={Boolean(rerunDialog)}
        title="אישור Rerun"
        description={rerunDialog
          ? `הרצה מחדש של ${jobTypeLabel(rerunDialog.job.type)} (${rerunDialog.job._id}). הפעולה תאפס timestamps/result/evidence קודמים ותכניס את ה־Job שוב לתור או לשער אישור.`
          : ""}
        confirmWord="Rerun Job"
        noteLabel="סיבת Rerun"
        notePlaceholder="לדוגמה: תיקון הגדרת חיבור אחרי כשל SharePoint 401"
        noteHint="נדרש נימוק של לפחות 3 תווים. הנימוק יישמר ב־Audit של פעולת ה־rerun."
        confirmLabel="אשר Rerun"
        busy={Boolean(rerunDialog && busyAction === rerunDialog.job._id)}
        risks={rerunDialog ? rerunRisks(rerunDialog.job) : []}
        onClose={() => {
          if (!busyAction) setRerunDialog(null);
        }}
        onConfirm={(reason) => {
          if (rerunDialog) void rerun(rerunDialog.job, reason);
        }}
      />
    </div>
  );
}
