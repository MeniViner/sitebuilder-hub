export const formatDateTime = (value?: string | Date | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("he-IL", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
};

export const formatNumber = (value?: number | null) => Number(value || 0).toLocaleString("he-IL");

export const formatMb = (value?: number | null) => `${formatNumber(value)} MB`;

export const formatBytes = (value?: number | null) => {
  const bytes = Number(value || 0);
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes.toLocaleString("he-IL")} B`;
};

export const siteStatusLabel = (status?: string) => {
  const labels: Record<string, string> = {
    active: "פעיל",
    warning: "אזהרה",
    failed: "נכשל",
    draft: "טיוטה",
    archived: "בארכיון"
  };
  return labels[status || ""] || "לא ידוע";
};

export const healthStatusLabel = (status?: string) => {
  const labels: Record<string, string> = {
    healthy: "תקין",
    warning: "אזהרה",
    failed: "נכשל",
    unknown: "לא נבדק"
  };
  return labels[status || ""] || "לא נבדק";
};

export const versionStatusLabel = (status?: string) => {
  const labels: Record<string, string> = {
    up_to_date: "עדכני",
    outdated: "מיושן",
    updating: "בתהליך עדכון",
    failed: "נכשל",
    unknown: "לא נבדק"
  };
  return labels[status || ""] || "לא נבדק";
};

export const jobStatusLabel = (status?: string) => {
  const labels: Record<string, string> = {
    "awaiting-approval": "אישור מתקדם",
    queued: "בתור",
    "browser-required": "ממתין להרצה דרך הדפדפן",
    "browser-in-progress": "רץ דרך הדפדפן",
    "blocked-service-auth-required": "היסטורי: שרת מושבת",
    preflight: "בדיקה מקדימה",
    running: "רץ",
    verifying: "מאמת",
    succeeded: "הצליח",
    failed: "נכשל",
    cancelled: "בוטל",
    retrying: "ניסיון חוזר"
  };
  return labels[status || ""] || status || "-";
};

export const jobTypeLabel = (type?: string) => {
  const labels: Record<string, string> = {
    "health-check": "בדיקת תקינות",
    deploy: "פריסה",
    backup: "גיבוי",
    restore: "שחזור",
    "admin-sync": "סנכרון מנהלים",
    repair: "תיקון",
    "version-upgrade": "עדכון גרסה",
    "version-rollback": "Rollback גרסה",
    "site-provision": "הכנת אתר",
    "site-bootstrap": "Bootstrap אתר",
    "permissions-setup": "הרשאות"
  };
  return labels[type || ""] || type || "-";
};

export const releaseTypeLabel = (type?: string) => {
  const labels: Record<string, string> = {
    patch: "Patch",
    minor: "Minor",
    major: "Major",
    hotfix: "Hotfix"
  };
  return labels[type || ""] || type || "-";
};
