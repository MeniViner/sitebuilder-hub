export const GENERATED_SAFE_COLLECTION_LABEL = "ייווצר אוטומטית ב־Builder backend";
export const DEFAULT_BUILDER_API_KEY_REF = "SITE_BUILDER_BACKEND_API_KEY";

const mongoCreateBlockerMessages: Record<string, string> = {
  "site-code-missing": "חסר קוד אתר / נתיב SharePoint. בלי הקוד הזה המערכת לא יכולה לחשב את כתובת האתר, ספריות האירוח והנתיבים שייבדקו. מלאו קוד קצר, למשל: alphateam.",
  "display-name-missing": "חסר שם אתר. השם מוצג לבעלים, בדוחות וב־Audit ולכן צריך להיות ברור. מלאו שם עסקי, למשל: פורטל צוות Alpha.",
  "builder-site-id-missing": "חסר מזהה אתר במערכת Site Builder. זה המזהה שה־Frontend וה־Backend משתמשים בו בקריאות API. מלאו מזהה יציב, למשל: alphateam.",
  "builder-backend-api-url-missing": "חסרה כתובת Backend של Site Builder. בלי הכתובת הזו האתר לא יוכל לקרוא או לשמור נתונים ב־Mongo. הזינו כתובת API מלאה, למשל: https://builder.example.local.",
  "builder-backend-not-configured": "לא מוגדר Backend של Site Builder לסביבה הזאת. יש להגדיר SITE_BUILDER_DEFAULT_BACKEND_API_URL או לבחור Backend מתוך ההגדרות.",
  "builder-backend-url-not-allowed": "כתובת Backend של Site Builder אינה מאושרת בהגדרות ה־HUB. זה מגן מפנייה לשרת לא נכון. בחרו כתובת שמופיעה ברשימת הכתובות המותרות או עדכנו את הגדרות השרת.",
  "production-localhost-backend-blocked": "אתר production לא יכול להיכתב עם Backend מקומי כמו localhost. בחרו Production / Classified Builder Backend שמוגדר ב־HUB.",
  "builder-backend-credential-missing": "חסרה הפניה להרשאת API. בלי זה ה־HUB לא יכול לקרוא או ליצור נתונים ב־Builder backend. בחרו credential reference קיים או הגדירו אחד בהגדרות השרת.",
  "initial-admins-missing": "לא נמצאו בעלים או מנהלים ראשוניים. בלי לפחות מנהל אחד האתר ייווצר ללא נקודת ניהול ברורה. מלאו מספר אישי/מייל לבעל האתר או הוסיפו מנהל לרשימה.",
  "site-physical-runtime-identity-duplicate": "כבר קיימת רשומת אתר לאותו יעד פיזי ולאותו runtime config. קוד אתר כפול בפני עצמו יכול להיות תקין, אבל אי אפשר ליצור כפילות לאותו SharePoint URL, siteDB, siteUsersDb ו־Mongo siteId."
};

const mongoCreateStepLabels: Record<string, string> = {
  "hub-registry-record": "רשומת אתר ב־HUB",
  "builder-registry": "רשומת אתר ב־Mongo / Builder backend",
  "safe-collection": "שם Collection בטוח במונגו",
  "sharepoint-request-digest": "אישור כתיבה זמני מ־SharePoint",
  "sharepoint-library-site-db": "יצירה/אימות של siteDB",
  "sharepoint-library-users-db": "יצירה/אימות של siteUsersDb",
  "sharepoint-folder-site-assets": "יצירה/אימות של siteAssets",
  "sharepoint-folder-images": "יצירה/אימות של images",
  "sharepoint-folder-dist": "יצירה/אימות של dist",
  "sharepoint-folder-dist-assets": "יצירה/אימות של dist/assets",
  "runtime-config-upload": "העלאת runtime config",
  "initial-browser-deploy": "פריסה ראשונית אחרי provisioning"
};

const mongoCreateExecutionLabels: Record<string, string> = {
  "server-local": "HUB מקומי",
  "browser-sharepoint": "SharePoint בדפדפן",
  "mongo-backend": "Mongo backend",
  "backend-service-auth-required": "היסטורי: שרת מושבת",
  manual: "ידני"
};

export function humanizeMongoCreateBlocker(blocker?: string) {
  const value = String(blocker || "").trim();
  if (!value) return "";
  if (mongoCreateBlockerMessages[value]) return mongoCreateBlockerMessages[value];
  if (value.includes("backendApiUrl חסר")) return mongoCreateBlockerMessages["builder-backend-api-url-missing"];
  if (value.includes("Builder backend לא מוגדר")) return mongoCreateBlockerMessages["builder-backend-not-configured"];
  if (value.includes("credential reference חסר")) return mongoCreateBlockerMessages["builder-backend-credential-missing"];
  if (value.includes("backend URL חסום")) return mongoCreateBlockerMessages["builder-backend-url-not-allowed"];
  if (value.includes("localhost לא מותר")) return mongoCreateBlockerMessages["production-localhost-backend-blocked"];
  if (value.includes("Builder siteId חסר")) return mongoCreateBlockerMessages["builder-site-id-missing"];
  return value;
}

export function humanizeMongoCreateStepLabel(key: string, fallback: string) {
  return mongoCreateStepLabels[key] || fallback;
}

export function humanizeMongoCreateExecutionClass(value: string) {
  return mongoCreateExecutionLabels[value] || value;
}
