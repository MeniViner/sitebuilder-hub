export function normalizeError(error: unknown): { code: string; message: string; status: number; details?: unknown } {
  if (error instanceof Error && /duplicate key/.test(error.message)) {
    return { code: "DUPLICATE", message: "ערך ייחודי כבר קיים", status: 409 };
  }

  if (error instanceof Error && /Cast to ObjectId failed/.test(error.message)) {
    return { code: "INVALID_ID", message: "מזהה לא תקין", status: 400 };
  }

  if (error instanceof Error && error.message === "site-not-found") {
    return { code: "NOT_FOUND", message: "האתר לא נמצא", status: 404 };
  }

  if (error instanceof Error && error.message === "release-not-found") {
    return { code: "NOT_FOUND", message: "Release לא נמצא", status: 404 };
  }

  if (error instanceof Error && error.message === "backup-not-found") {
    return { code: "NOT_FOUND", message: "Backup לא נמצא", status: 404 };
  }

  if (error instanceof Error && error.message === "backup-restore-evidence-missing") {
    return {
      code: "BACKUP_RESTORE_EVIDENCE_MISSING",
      message: "Backup restore cannot be queued because stored source/target evidence is missing.",
      status: 409
    };
  }

  if (error instanceof Error && error.message === "backup-restore-evidence-incomplete") {
    return {
      code: "BACKUP_RESTORE_EVIDENCE_INCOMPLETE",
      message: "Backup restore cannot run because one or more stored evidence rows are incomplete.",
      status: 409
    };
  }

  if (error instanceof Error && error.message === "restore-backup-site-mismatch") {
    return {
      code: "RESTORE_BACKUP_SITE_MISMATCH",
      message: "Backup restore job site does not match the backup site.",
      status: 409
    };
  }

  if (error instanceof Error && error.message === "restore-job-requires-approval") {
    return {
      code: "RESTORE_JOB_REQUIRES_APPROVAL",
      message: "Restore job must be approved before it can run.",
      status: 409
    };
  }

  if (
    error instanceof Error &&
    error.message.endsWith("-job-requires-approval") &&
    !["restore-job-requires-approval", "repair-job-requires-approval", "site-bootstrap-job-requires-approval"].includes(error.message)
  ) {
    return {
      code: "JOB_REQUIRES_APPROVAL",
      message: "This job must be approved by a separate admin before it can run.",
      status: 409
    };
  }

  if (error instanceof Error && error.message.startsWith("restore-unsupported-storage-provider:")) {
    return {
      code: "RESTORE_UNSUPPORTED_STORAGE_PROVIDER",
      message: "Backup restore supports SharePoint-backed backups only.",
      status: 409
    };
  }

  if (error instanceof Error && error.message.startsWith("backup-restore-source-")) {
    return {
      code: "BACKUP_RESTORE_SOURCE_MISMATCH",
      message: "Backup restore source file no longer matches the stored backup evidence.",
      status: 409
    };
  }

  if (error instanceof Error && error.message.startsWith("restore-backup-file-verification-failed:")) {
    return {
      code: "RESTORE_BACKUP_FILE_VERIFICATION_FAILED",
      message: "Backup restore source file no longer matches the stored backup evidence.",
      status: 409
    };
  }

  if (error instanceof Error && error.message.startsWith("restore-target-verification-failed:")) {
    return {
      code: "RESTORE_TARGET_VERIFICATION_FAILED",
      message: "Restore wrote a file but read-back verification failed.",
      status: 409
    };
  }

  if (error instanceof Error && error.message === "job-not-found") {
    return { code: "NOT_FOUND", message: "Job לא נמצא", status: 404 };
  }

  if (error instanceof Error && error.message === "job-already-running") {
    return { code: "CONFLICT", message: "Job כבר רץ", status: 409 };
  }

  if (error instanceof Error && error.message === "job-already-awaiting-approval") {
    return { code: "CONFLICT", message: "Job כבר ממתין לאישור", status: 409 };
  }

  if (error instanceof Error && error.message === "job-approval-not-awaiting") {
    return { code: "CONFLICT", message: "Job אינו ממתין לאישור", status: 409 };
  }

  if (error instanceof Error && error.message === "job-approval-expired") {
    return { code: "JOB_APPROVAL_EXPIRED", message: "חלון האישור של ה-Job פג", status: 409 };
  }

  if (error instanceof Error && error.message === "monitoring-alert-not-found") {
    return { code: "NOT_FOUND", message: "Monitoring alert לא נמצא", status: 404 };
  }

  if (error instanceof Error && error.message === "job-self-approval-forbidden") {
    return {
      code: "JOB_SELF_APPROVAL_FORBIDDEN",
      message: "מבקש הפעולה אינו יכול לאשר בעצמו Job מסוכן או כותב.",
      status: 403
    };
  }

  if (error instanceof Error && error.message === "duplicate-release-version") {
    return { code: "DUPLICATE_RELEASE_VERSION", message: "גרסת release כבר קיימת", status: 409 };
  }

  if (error instanceof Error && error.message === "rollback-target-version-same-as-current") {
    return {
      code: "ROLLBACK_TARGET_VERSION_SAME_AS_CURRENT",
      message: "גרסת היעד ל-rollback זהה לגרסה הנוכחית של האתר.",
      status: 409
    };
  }

  if (error instanceof Error && error.message === "rollback-target-version-not-older") {
    return {
      code: "ROLLBACK_TARGET_VERSION_NOT_OLDER",
      message: "Rollback דורש לבחור Release ישן יותר מהגרסה הנוכחית של האתר.",
      status: 409
    };
  }

  if (error instanceof Error && error.message.startsWith("dangerous-write-backup-required:")) {
    return {
      code: "DANGEROUS_WRITE_BACKUP_REQUIRED",
      message: "נדרש גיבוי מאומת ועדכני לפני פעולה כותבת מסוכנת.",
      status: 409
    };
  }

  if (error instanceof Error && error.message.startsWith("dangerous-write-backup-stale:")) {
    return {
      code: "DANGEROUS_WRITE_BACKUP_STALE",
      message: "הגיבוי המאומת האחרון ישן מדי לפעולה כותבת מסוכנת.",
      status: 409
    };
  }

  if (error instanceof Error && error.message === "pre-restore-backup-required") {
    return {
      code: "PRE_RESTORE_BACKUP_REQUIRED",
      message: "נדרש גיבוי מאומת ועדכני של המצב הנוכחי לפני Restore.",
      status: 409
    };
  }

  if (error instanceof Error && error.message === "pre-restore-backup-stale") {
    return {
      code: "PRE_RESTORE_BACKUP_STALE",
      message: "גיבוי המצב הנוכחי לפני Restore ישן מדי.",
      status: 409
    };
  }

  if (error instanceof Error && error.message === "admin-txt-repair-not-needed") {
    return {
      code: "ADMIN_TXT_REPAIR_NOT_NEEDED",
      message: "אין כרגע מנהלים חסרים לתיקון בקובץ TXT.",
      status: 409
    };
  }

  if (error instanceof Error && error.message === "admin-txt-repair-plan-not-ready") {
    return {
      code: "ADMIN_TXT_REPAIR_PLAN_NOT_READY",
      message: "תוכנית תיקון TXT admins אינה מוכנה להרצה.",
      status: 409
    };
  }

  if (error instanceof Error && error.message === "admin-txt-repair-verification-failed") {
    return {
      code: "ADMIN_TXT_REPAIR_VERIFICATION_FAILED",
      message: "תיקון TXT admins נכתב אך אימות קריאה חזרה נכשל.",
      status: 409
    };
  }

  if (error instanceof Error && error.message === "repair-job-requires-approval") {
    return {
      code: "REPAIR_JOB_REQUIRES_APPROVAL",
      message: "Repair job must be approved before it can run.",
      status: 409
    };
  }

  if (error instanceof Error && error.message === "site-bootstrap-job-requires-approval") {
    return {
      code: "SITE_BOOTSTRAP_JOB_REQUIRES_APPROVAL",
      message: "Site bootstrap job must be approved before it can run.",
      status: 409
    };
  }

  if (error instanceof Error && error.message === "site-bootstrap-owner-missing") {
    return {
      code: "SITE_BOOTSTRAP_OWNER_MISSING",
      message: "SharePoint site bootstrap requires an owner email.",
      status: 409
    };
  }

  if (error instanceof Error && error.message.startsWith("sharepoint-site-create-")) {
    return {
      code: "SHAREPOINT_SITE_CREATE_FAILED",
      message: "SharePoint site creation did not complete successfully.",
      status: 409
    };
  }

  if (error instanceof Error && error.message.startsWith("sharepoint-site-status-")) {
    return {
      code: "SHAREPOINT_SITE_STATUS_FAILED",
      message: "SharePoint site creation status could not be verified.",
      status: 409
    };
  }

  if (error instanceof Error && error.name === "SharePointWriteCapabilityError") {
    return { code: "SHAREPOINT_WRITE_NOT_CONFIGURED", message: error.message, status: 409 };
  }

  if (error instanceof Error && error.message === "real-deploy-not-implemented") {
    return {
      code: "REAL_DEPLOY_NOT_IMPLEMENTED",
      message: "פריסה אמיתית עדיין לא מחוברת ל-artifact/manifest ולכן לא סומנה כהצלחה.",
      status: 409
    };
  }

  if (error instanceof Error && error.message === "release-artifact-ref-missing") {
    return { code: "RELEASE_ARTIFACT_MISSING", message: "ל-Release אין artifactRef לתיקיית dist או manifest.", status: 409 };
  }

  if (error instanceof Error && error.message.startsWith("release-artifact-not-found:")) {
    return { code: "RELEASE_ARTIFACT_NOT_FOUND", message: "נתיב artifactRef של ה-Release לא נמצא בשרת.", status: 404 };
  }

  if (error instanceof Error && error.message === "deploy-plan-not-ready") {
    return { code: "DEPLOY_PLAN_NOT_READY", message: "תוכנית deploy אינה מוכנה: חסרים קבצים או index.html.", status: 409 };
  }

  if (error instanceof Error && error.message.startsWith("deploy-final-app-url-verification-failed:")) {
    return {
      code: "DEPLOY_FINAL_APP_URL_VERIFICATION_FAILED",
      message: "Deploy כתב את הקבצים אך אימות URL האפליקציה הסופי נכשל.",
      status: 409
    };
  }

  if (error instanceof Error && error.message === "deployment-not-found") {
    return { code: "NOT_FOUND", message: "Deployment לא נמצא", status: 404 };
  }

  return {
    code: "INTERNAL_ERROR",
    message: error instanceof Error ? error.message : "אירעה שגיאה פנימית בשרת",
    status: 500
  };
}
