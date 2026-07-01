export function normalizeError(error: unknown): { code: string; message: string; status: number; details?: unknown } {
  if (error instanceof Error && error.message === "site-identity-duplicate") {
    return {
      code: "SITE_IDENTITY_DUPLICATE",
      message: "כבר קיימת רשומת אתר עבור אותו יעד SharePoint ואותם נתיבי siteDB/siteUsersDb. אפשר להשתמש באותו קוד אתר רק אם נתיבי היעד שונים.",
      status: 409,
      details: (error as Error & { details?: unknown }).details
    };
  }

  if (error instanceof Error && /duplicate key/.test(error.message)) {
    const keyPattern = (error as Error & { keyPattern?: Record<string, unknown> }).keyPattern || {};
    if (keyPattern.siteIdentityKey) {
      return {
        code: "SITE_IDENTITY_DUPLICATE",
        message: "כבר קיימת רשומת אתר עבור אותו יעד SharePoint ואותם נתיבי siteDB/siteUsersDb.",
        status: 409
      };
    }

    if (keyPattern.siteCode) {
      return {
        code: "LEGACY_SITE_CODE_INDEX_CONFLICT",
        message: "האינדקס הישן על קוד אתר עדיין פעיל ב־Mongo. יש להפעיל מחדש את שרת ה־HUB כדי שמיגרציית האינדקסים תוריד אותו.",
        status: 409
      };
    }

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

  if (
    error instanceof Error &&
    [
      "release-artifact-file-path-invalid",
      "release-artifact-path-traversal-blocked",
      "release-artifact-file-not-in-manifest",
      "release-artifact-file-not-found",
      "release-artifact-file-hash-mismatch"
    ].includes(error.message)
  ) {
    return { code: "ARTIFACT_FILE_BLOCKED", message: "בקשת קובץ artifact אינה תקינה או אינה מותרת", status: 400 };
  }

  if (
    error instanceof Error &&
    [
      "browser-deploy-connector-mode-required",
      "releaseId-required",
      "browser-deploy-site-mismatch",
      "browser-deploy-version-after-mismatch",
      "browser-deploy-success-evidence-invalid",
      "release-artifact-not-ready"
    ].includes(error.message)
  ) {
    return { code: "BROWSER_DEPLOY_EVIDENCE_INVALID", message: "Evidence של browser deploy אינו תקין", status: 400 };
  }

  if (error instanceof Error && error.message === "backup-not-found") {
    return { code: "NOT_FOUND", message: "Backup לא נמצא", status: 404 };
  }

  if (error instanceof Error && error.message === "mongo-backup-execution-not-implemented") {
    return {
      code: "MONGO_BACKUP_EXECUTION_NOT_IMPLEMENTED",
      message: "אתר Mongo צריך גיבוי דרך Builder backend ולא העתקת קבצי TXT מ־SharePoint. בשלב זה ה־HUB יודע לאמת יכולת backup אבל עדיין לא מריץ יצירת backup Mongo מלאה.",
      status: 409,
      details: (error as Error & { details?: unknown }).details
    };
  }

  if (error instanceof Error && error.message === "mongo-site-create-plan-not-ready") {
    return {
      code: "MONGO_SITE_CREATE_PLAN_NOT_READY",
      message: "תוכנית יצירת אתר Mongo אינה מוכנה לביצוע. יש לפתור את החסמים לפני קריאה ל־Builder backend.",
      status: 409,
      details: (error as Error & { details?: unknown }).details
    };
  }

  if (error instanceof Error && error.message === "mongo-site-runtime-config-credential-missing") {
    return {
      code: "MONGO_RUNTIME_CONFIG_CREDENTIAL_MISSING",
      message: "אי אפשר ליצור runtime config כי credential reference ל־Builder backend לא מוגדר או לא נמצא בסביבה.",
      status: 409
    };
  }

  if (error instanceof Error && error.message === "txt-to-mongo-migration-snapshot-invalid") {
    return {
      code: "TXT_TO_MONGO_SNAPSHOT_INVALID",
      message: "אי אפשר להמיר ל־Mongo כי Snapshot ה־TXT מהדפדפן חסר או לא תקין.",
      status: 400,
      details: (error as Error & { details?: unknown }).details
    };
  }

  if (error instanceof Error && error.message === "browser-sharepoint-evidence-connector-mode-required") {
    return {
      code: "BROWSER_SHAREPOINT_EVIDENCE_INVALID",
      message: "Evidence של פעולת SharePoint בדפדפן אינו תקין.",
      status: 400
    };
  }

  if (
    error instanceof Error &&
    [
      "browser-backup-connector-mode-required",
      "browser-backup-id-required",
      "browser-backup-target-folder-invalid",
      "browser-backup-target-folder-mismatch",
      "browser-backup-root-mismatch",
      "browser-backup-site-mismatch",
      "browser-backup-source-path-mismatch",
      "browser-backup-target-path-mismatch",
      "browser-backup-success-evidence-invalid",
      "backup-verification-evidence-missing"
    ].includes(error.message)
  ) {
    return {
      code: "BROWSER_BACKUP_EVIDENCE_INVALID",
      message: "Evidence של browser backup אינו תקין או אינו מספיק לאימות גיבוי.",
      status: 400
    };
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

  if (error instanceof Error && error.message === "browser-sharepoint-required") {
    return {
      code: "BROWSER_SHAREPOINT_REQUIRED",
      message: "פעולת SharePoint חייבת לרוץ דרך הדפדפן הפעיל. השרת שומר רק סטטוס ו־Evidence.",
      status: 409
    };
  }

  if (error instanceof Error && error.message === "sharepoint-browser-execution-required") {
    return {
      code: "SHAREPOINT_BROWSER_EXECUTION_REQUIRED",
      message: "פעולת SharePoint לא רצה בשרת. יש להפעיל אותה דרך הדפדפן המחובר ולשמור Evidence.",
      status: 409
    };
  }

  if (error instanceof Error && error.message === "browser-backup-verification-required") {
    return {
      code: "BROWSER_BACKUP_VERIFICATION_REQUIRED",
      message: "אימות גיבוי SharePoint מתבצע דרך הדפדפן בלבד. השרת לא קורא קבצים מ־SharePoint.",
      status: 409
    };
  }

  if (
    error instanceof Error &&
    [
      "browser-admin-evidence-connector-mode-required",
      "browser-admin-evidence-source-status-required"
    ].includes(error.message)
  ) {
    return {
      code: "BROWSER_ADMIN_EVIDENCE_INVALID",
      message: "Evidence של קריאת מנהלים דרך הדפדפן אינו תקין.",
      status: 400
    };
  }

  if (
    error instanceof Error &&
    error.message.endsWith("-job-requires-approval") &&
    !["restore-job-requires-approval", "repair-job-requires-approval", "site-bootstrap-job-requires-approval"].includes(error.message)
  ) {
    return {
      code: "JOB_REQUIRES_APPROVAL",
      message: "This job must be approved before it can run.",
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
    return { code: "CONFLICT", message: "Job כבר נמצא במצב אישור מתקדם", status: 409 };
  }

  if (error instanceof Error && error.message === "job-approval-not-awaiting") {
    return { code: "CONFLICT", message: "Job אינו במצב אישור מתקדם", status: 409 };
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
      message: "אישור עצמי חסום עבור Job זה.",
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
      message: "אי אפשר להמשיך: אין גיבוי זמין.",
      status: 409
    };
  }

  if (error instanceof Error && error.message.startsWith("dangerous-write-backup-stale:")) {
    return {
      code: "DANGEROUS_WRITE_BACKUP_STALE",
      message: "אי אפשר להמשיך: הגיבוי הזמין ישן מדי.",
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

  if (error instanceof Error && error.message === "mongo-admin-txt-repair-not-applicable") {
    return {
      code: "MONGO_ADMIN_TXT_REPAIR_NOT_APPLICABLE",
      message: "באתר Mongo מקור מנהלי האפליקציה הוא Builder backend/Mongo. תיקון users_data.txt אינו פעולה ראשית לאתר הזה.",
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
    return {
      code: "SHAREPOINT_WRITE_NOT_CONFIGURED",
      message: "מסלול SharePoint מהשרת מושבת. השתמשו בפעולת דפדפן מחובר.",
      status: 409,
      details: { reason: error.message }
    };
  }

  if (error instanceof Error && error.message === "real-deploy-not-implemented") {
    return {
      code: "REAL_DEPLOY_NOT_IMPLEMENTED",
      message: "פריסה אמיתית עדיין לא מחוברת ל-artifact/manifest ולכן לא סומנה כהצלחה.",
      status: 409
    };
  }

  if (error instanceof Error && error.message === "release-artifact-ref-missing") {
    return {
      code: "RELEASE_ARTIFACT_MISSING",
      message: "Deploy cannot run because the release artifact is missing.",
      status: 409
    };
  }

  if (error instanceof Error && error.message.startsWith("release-artifact-not-found:")) {
    return {
      code: "RELEASE_ARTIFACT_NOT_FOUND",
      message: "Deploy cannot run because the release artifact path is invalid or missing on the server.",
      status: 404,
      details: { artifactRef: error.message.replace("release-artifact-not-found:", "") }
    };
  }

  if (error instanceof Error && error.message === "deploy-plan-not-ready") {
    return {
      code: "DEPLOY_PLAN_NOT_READY",
      message: "Deploy cannot run because the release artifact is invalid.",
      status: 409
    };
  }

  if (error instanceof Error && error.message === "deploy-plan-execution-not-ready") {
    return {
      code: "DEPLOY_PLAN_EXECUTION_NOT_READY",
      message: "Deploy cannot run because required site readiness checks are missing or failed.",
      status: 409
    };
  }

  if (error instanceof Error && error.message.startsWith("deploy-final-app-url-verification-failed:")) {
    return {
      code: "DEPLOY_FINAL_APP_URL_VERIFICATION_FAILED",
      message: "Deploy uploaded files, but post-deploy verification failed.",
      status: 409
    };
  }

  if (error instanceof Error && error.message === "local-dev-owner-deploy-mode-disabled-in-production") {
    return {
      code: "LOCAL_DEV_OWNER_DEPLOY_MODE_DISABLED_IN_PRODUCTION",
      message: "Local/dev owner deploy mode cannot run when NODE_ENV=production.",
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
