import type { StorageBackend } from "../types/site";

export type SiteDetailsConnectorMode =
  | "hub-metadata"
  | "browser-sharepoint"
  | "mongo-backend"
  | "server-local"
  | "manual"
  | "not-implemented";

export type SiteDetailsRiskClass =
  | "safe-read"
  | "metadata-only"
  | "plan-only"
  | "live-hosting-write"
  | "data-source-write"
  | "permission-write"
  | "destructive"
  | "not-implemented";

export type SiteDetailsActionKey =
  | "identify-source"
  | "browser-hosting-check"
  | "runtime-config-read"
  | "mongo-health-read"
  | "admin-live-read"
  | "deploy-center-open"
  | "txt-to-mongo-migration"
  | "txt-admin-repair"
  | "browser-txt-backup"
  | "backup-plan"
  | "bootstrap-plan"
  | "provision-plan"
  | "permissions-plan"
  | "site-provision-run"
  | "permissions-setup-run"
  | "site-bootstrap-run"
  | "mongo-backup-execution"
  | "restore-review"
  | "rollback-open";

export interface SiteDetailsActionPolicy {
  key: SiteDetailsActionKey;
  label: string;
  helperText: string;
  connectorMode: SiteDetailsConnectorMode;
  riskClass: SiteDetailsRiskClass;
  visible: boolean;
  enabled: boolean;
  disabledReason?: string;
}

export interface SiteDetailsStorageCopy {
  storageBackend: StorageBackend;
  sourceBadge: string;
  sourceDescription: string;
  overviewAttention?: string;
  overviewNextAction?: string;
  operationsSubtitle: string;
  backupsSubtitle: string;
  adminsSubtitle: string;
  pathsSubtitle: string;
  txtPathDescription: string;
}

export const normalizeSiteDetailsStorageBackend = (storageBackend?: StorageBackend): StorageBackend =>
  storageBackend === "mongo" || storageBackend === "txt" ? storageBackend : "unknown";

const unknownReason = "צריך לזהות את מקור הנתונים לפני פעולות כתיבה";
const unknownHelper = "האתר עדיין לא זוהה כ־Mongo או TXT. ניתן להריץ בדיקות קריאה בלבד.";
const mongoTxtReason = "פעולה זו לא רלוונטית לאתר Mongo";
const mongoProvisionReason = "SharePoint משמש לאירוח קבצי האתר בלבד; זרימת ההקמה הנוכחית יוצרת קבצי TXT ולכן חסומה לאתר Mongo.";

const actionBase: Record<SiteDetailsActionKey, Omit<SiteDetailsActionPolicy, "visible" | "enabled" | "disabledReason">> = {
  "identify-source": {
    key: "identify-source",
    label: "זהה מקור נתונים",
    helperText: "בדיקות ללא שינוי שעוזרות להבין אם האתר עובד מול Mongo או מול TXT.",
    connectorMode: "browser-sharepoint",
    riskClass: "safe-read"
  },
  "browser-hosting-check": {
    key: "browser-hosting-check",
    label: "בדוק אירוח SharePoint",
    helperText: "בדיקה ללא שינוי דרך הדפדפן המחובר ל־SharePoint.",
    connectorMode: "browser-sharepoint",
    riskClass: "safe-read"
  },
  "runtime-config-read": {
    key: "runtime-config-read",
    label: "בדוק קובץ הגדרות טעינה",
    helperText: "בדיקה ללא שינוי של קובץ ההגדרות שמכוון את האתר למקור הנתונים.",
    connectorMode: "browser-sharepoint",
    riskClass: "safe-read"
  },
  "mongo-health-read": {
    key: "mongo-health-read",
    label: "בדוק מקור נתונים Mongo",
    helperText: "בדיקה מול שרת Builder כדי לוודא רישום אתר, אוסף נתונים ונתוני בסיס.",
    connectorMode: "mongo-backend",
    riskClass: "safe-read"
  },
  "admin-live-read": {
    key: "admin-live-read",
    label: "רענן מנהלים עכשיו",
    helperText: "בדיקה ללא שינוי של מקורות מנהלים וגישה דרך הדפדפן המחובר ל־SharePoint.",
    connectorMode: "browser-sharepoint",
    riskClass: "safe-read"
  },
  "deploy-center-open": {
    key: "deploy-center-open",
    label: "פתח פריסה וגרסאות",
    helperText: "פותח את מרכז הפריסה עבור האתר הזה. הפריסה עצמה עוברת דרך תכנון ואישור.",
    connectorMode: "manual",
    riskClass: "safe-read"
  },
  "txt-to-mongo-migration": {
    key: "txt-to-mongo-migration",
    label: "העברת אתר TXT ל־Mongo",
    helperText: "פעולה רגישה שמשנה את מקור הנתונים: קוראת TXT דרך הדפדפן, כותבת ל־Mongo, מעלה קובץ הגדרות טעינה ומעדכנת dist.",
    connectorMode: "browser-sharepoint",
    riskClass: "data-source-write"
  },
  "txt-admin-repair": {
    key: "txt-admin-repair",
    label: "תיקון נתוני מנהלים בקבצי TXT",
    helperText: "פעולה שמשנה נתונים בקובץ users_data.txt דרך הדפדפן המחובר ל־SharePoint.",
    connectorMode: "browser-sharepoint",
    riskClass: "data-source-write"
  },
  "browser-txt-backup": {
    key: "browser-txt-backup",
    label: "הרץ גיבוי TXT בדפדפן",
    helperText: "מגבה את קבצי מקור ה־TXT ב־SharePoint דרך הדפדפן המחובר. גיבוי TXT אינו מגבה את נתוני Mongo החיים.",
    connectorMode: "browser-sharepoint",
    riskClass: "live-hosting-write"
  },
  "backup-plan": {
    key: "backup-plan",
    label: "צור תוכנית גיבוי",
    helperText: "תוכנית לפני הרצה. לא מריצה גיבוי ולא משנה נתונים.",
    connectorMode: "server-local",
    riskClass: "plan-only"
  },
  "bootstrap-plan": {
    key: "bootstrap-plan",
    label: "הכן תוכנית הקמה",
    helperText: "תוכנית לפני הרצה. מציגה מה יבוצע ללא כתיבה ל־SharePoint.",
    connectorMode: "server-local",
    riskClass: "plan-only"
  },
  "provision-plan": {
    key: "provision-plan",
    label: "תכנן תשתית אירוח",
    helperText: "תוכנית לפני הרצה. מציגה ספריות, תיקיות וקבצים שהזרימה הנוכחית מתכננת.",
    connectorMode: "server-local",
    riskClass: "plan-only"
  },
  "permissions-plan": {
    key: "permissions-plan",
    label: "תכנן שינוי הרשאות",
    helperText: "תוכנית לפני הרצה. מציגה את שינויי ההרשאות המתוכננים ללא ביצוע.",
    connectorMode: "server-local",
    riskClass: "plan-only"
  },
  "site-provision-run": {
    key: "site-provision-run",
    label: "הרץ הקמת תשתית אירוח",
    helperText: "פעולה שמשנה SharePoint דרך הדפדפן המחובר ויוצרת/מאמתת ספריות, תיקיות וקבצי בסיס.",
    connectorMode: "browser-sharepoint",
    riskClass: "live-hosting-write"
  },
  "permissions-setup-run": {
    key: "permissions-setup-run",
    label: "הרץ שינוי הרשאות SharePoint",
    helperText: "פעולת שינוי הרשאות. רצה דרך הדפדפן המחובר ומשנה הרשאות בספריית המשתמשים.",
    connectorMode: "browser-sharepoint",
    riskClass: "permission-write"
  },
  "site-bootstrap-run": {
    key: "site-bootstrap-run",
    label: "הרץ הקמת אירוח והרשאות",
    helperText: "פעולה שמשנה SharePoint דרך הדפדפן. הזרימה הנוכחית מריצה הקמת תשתית והרשאות; היא לא יוצרת Site Collection חדש.",
    connectorMode: "browser-sharepoint",
    riskClass: "live-hosting-write"
  },
  "mongo-backup-execution": {
    key: "mongo-backup-execution",
    label: "הרץ גיבוי Mongo מלא",
    helperText: "גיבוי Mongo מלא דרך Hub עדיין לא ממומש. ניתן לבדוק יכולת מול שרת Builder בלבד.",
    connectorMode: "not-implemented",
    riskClass: "not-implemented"
  },
  "restore-review": {
    key: "restore-review",
    label: "בדוק מוכנות שחזור",
    helperText: "בודק חסמים לפני שחזור. שחזור בפועל הוא פעולה רגישה ואינו רץ מכאן ללא תהליך מוגן.",
    connectorMode: "manual",
    riskClass: "destructive"
  },
  "rollback-open": {
    key: "rollback-open",
    label: "פתח אפשרויות חזרה לגרסה קודמת",
    helperText: "חזרה לגרסה קודמת נעשית דרך מרכז הפריסה ונחשבת פעולה רגישה.",
    connectorMode: "manual",
    riskClass: "destructive"
  }
};

export function getSiteDetailsActionPolicy(
  storageBackend: StorageBackend | undefined,
  key: SiteDetailsActionKey
): SiteDetailsActionPolicy {
  const backend = normalizeSiteDetailsStorageBackend(storageBackend);
  const base = actionBase[key];
  let visible = true;
  let enabled = true;
  let disabledReason: string | undefined;

  if (backend === "unknown") {
    if ([
      "txt-to-mongo-migration",
      "txt-admin-repair",
      "browser-txt-backup",
      "site-provision-run",
      "permissions-setup-run",
      "site-bootstrap-run"
    ].includes(key)) {
      enabled = false;
      disabledReason = unknownReason;
    }
    if (key === "txt-to-mongo-migration") visible = false;
    if (key === "mongo-health-read") {
      visible = false;
    }
  }

  if (backend === "mongo") {
    if (["txt-to-mongo-migration", "txt-admin-repair", "browser-txt-backup"].includes(key)) {
      enabled = false;
      disabledReason = key === "browser-txt-backup"
        ? "גיבוי TXT אינו מגבה את נתוני Mongo החיים"
        : mongoTxtReason;
    }
    if (["txt-to-mongo-migration"].includes(key)) visible = false;
    if (["site-provision-run", "site-bootstrap-run"].includes(key)) {
      enabled = false;
      disabledReason = mongoProvisionReason;
    }
    if (key === "mongo-backup-execution") {
      enabled = false;
      disabledReason = "גיבוי Mongo מלא עדיין לא ממומש ב־Hub";
    }
  }

  if (backend === "txt" && key === "mongo-health-read") {
    visible = false;
  }

  if (backend !== "mongo" && key === "mongo-backup-execution") {
    visible = false;
    enabled = false;
    disabledReason = "גיבוי Mongo רלוונטי רק לאתר Mongo.";
  }

  return {
    ...base,
    visible,
    enabled,
    disabledReason
  };
}

export function assertSiteDetailsActionEnabled(
  storageBackend: StorageBackend | undefined,
  key: SiteDetailsActionKey
) {
  const policy = getSiteDetailsActionPolicy(storageBackend, key);
  if (!policy.enabled) {
    throw new Error(policy.disabledReason || policy.helperText);
  }
}

export function getSiteDetailsStorageCopy(storageBackend?: StorageBackend): SiteDetailsStorageCopy {
  const backend = normalizeSiteDetailsStorageBackend(storageBackend);
  if (backend === "mongo") {
    return {
      storageBackend: backend,
      sourceBadge: "מקור הנתונים: Mongo דרך שרת Builder",
      sourceDescription: "SharePoint משמש לאירוח קבצי האתר וקובץ ההגדרות. נתוני האתר החיים נמצאים ב־Mongo.",
      operationsSubtitle: "תוכניות לפני הרצה זמינות. הקמת תשתית והקמת אירוח והרשאות דרך הדפדפן חסומות כרגע כי הזרימה הנוכחית יוצרת קבצי TXT.",
      backupsSubtitle: "מקור הנתונים הוא Mongo דרך שרת Builder. גיבוי TXT אינו מגבה את נתוני Mongo החיים.",
      adminsSubtitle: "Site Collection Admins ו־Owners Group הם גישת אירוח ב־SharePoint; מקור מנהלי האפליקציה מגיע מ־Mongo/Builder.",
      pathsSubtitle: "SharePoint מציג נתיבי אירוח וקבצי טעינה. נתיבי TXT מוצגים כתאימות/מורשת בלבד.",
      txtPathDescription: "נתיב תאימות/מורשת בלבד; אינו מקור הנתונים החי באתר Mongo."
    };
  }
  if (backend === "txt") {
    return {
      storageBackend: backend,
      sourceBadge: "מקור הנתונים: קבצי TXT ב־SharePoint",
      sourceDescription: "קבצי TXT ב־SharePoint הם מקור הנתונים הפעיל של האתר.",
      operationsSubtitle: "פעולות הקמה, גיבוי ותיקון TXT רצות דרך הדפדפן המחובר ל־SharePoint ומשנות קבצים/הרשאות לפי הפעולה.",
      backupsSubtitle: "גיבוי TXT רץ דרך הדפדפן המחובר ל־SharePoint ומגבה את קבצי המקור של האתר.",
      adminsSubtitle: "מנהלי TXT יכולים להיות מקור מנהלי האפליקציה; SharePoint Owners ו־Site Collection Admins הם מקורות גישה נוספים.",
      pathsSubtitle: "נתיבי SharePoint כוללים אירוח ואת קבצי ה־TXT שהם מקור הנתונים החי.",
      txtPathDescription: "קובץ TXT המשמש כמקור נתונים חי לאתר."
    };
  }
  return {
    storageBackend: backend,
    sourceBadge: "מקור הנתונים לא זוהה",
    sourceDescription: "לפני פעולות כתיבה צריך לזהות אם האתר עובד מול Mongo או מול TXT.",
    overviewAttention: unknownReason,
    overviewNextAction: "ניתן להריץ בדיקות קריאה בלבד כדי לזהות את מקור הנתונים לפני פעולות כתיבה.",
    operationsSubtitle: "האתר עדיין לא זוהה כ־Mongo או TXT. פעולות כתיבה חסומות; ניתן לבנות תוכניות ולהריץ בדיקות קריאה בלבד.",
    backupsSubtitle: "צריך לזהות את מקור הנתונים לפני הרצת גיבוי. גיבוי TXT בדפדפן חסום עד לזיהוי.",
    adminsSubtitle: "מקורות מנהלים מוצגים לקריאה בלבד. תיקון TXT חסום עד לזיהוי מקור הנתונים.",
    pathsSubtitle: "נתיבי SharePoint מוצגים כנתיבים אפשריים בלבד עד לזיהוי מקור הנתונים.",
    txtPathDescription: "נתיב TXT אפשרי; עדיין לא אושר שזה מקור הנתונים החי."
  };
}

export const siteDetailsConnectorLabel = (connectorMode: SiteDetailsConnectorMode) => {
  const labels: Record<SiteDetailsConnectorMode, string> = {
    "hub-metadata": "מידע ניהולי ב־Hub",
    "browser-sharepoint": "הרצה דרך הדפדפן המחובר ל־SharePoint",
    "mongo-backend": "בדיקה מול שרת Builder",
    "server-local": "תכנון מקומי בשרת",
    manual: "פעולה ידנית",
    "not-implemented": "לא ממומש עדיין"
  };
  return labels[connectorMode];
};

export const siteDetailsRiskLabel = (riskClass: SiteDetailsRiskClass) => {
  const labels: Record<SiteDetailsRiskClass, string> = {
    "safe-read": "ללא שינוי",
    "metadata-only": "מידע ניהולי ב־Hub",
    "plan-only": "תוכנית לפני הרצה",
    "live-hosting-write": "משנה קבצים",
    "data-source-write": "משנה מקור נתונים",
    "permission-write": "משנה הרשאות",
    destructive: "פעולה רגישה",
    "not-implemented": "לא ממומש עדיין"
  };
  return labels[riskClass];
};
