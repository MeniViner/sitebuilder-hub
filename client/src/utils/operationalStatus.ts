import type {
  BuilderMongoHealthResult,
  OperationalStatusSnapshot,
  RuntimeConfigValidationResult,
  SharePointHealthResult,
  WhoAmIResult
} from "../api/sitesApi";

export const defaultOperationalStatus = (): OperationalStatusSnapshot => {
  const now = new Date().toISOString();
  return {
    generatedAt: now,
    hubApi: {
      status: "failed",
      checkedAt: now,
      message: "Hub API עדיין לא נבדק"
    },
    hubMongo: {
      status: "unknown",
      checkedAt: now,
      message: "Hub Mongo עדיין לא נבדק"
    },
    browserSharePoint: {
      status: "not_checked",
      source: "cached evidence",
      message: "SharePoint דרך הדפדפן עדיין לא נבדק",
      nextStep: "פתחו Diagnostics, Health, Admins או Backups כדי להריץ בדיקת דפדפן בטוחה"
    },
    builderBackend: {
      status: "not_configured",
      configured: false,
      message: "Builder backend עדיין לא נבדק",
      nextStep: "פתחו Settings או Health כדי לבדוק Builder/Mongo"
    },
    currentIdentity: {
      mode: "unknown",
      label: "זהות עדיין לא נבדקה"
    },
    operationMode: {
      readOnlyBrowserChecksAvailable: true,
      browserSharePointWritesAvailable: false,
      builderBackendMongoOperationsAvailable: false,
      legacyBackendSharePointAvailable: false,
      label: "Browser SharePoint לפעולות SharePoint; Builder backend לנתוני Mongo; Hub Mongo לראיות ומטא־דאטה"
    },
    dataSourceMatrix: {
      txt: {
        appData: "browser-sharepoint-txt",
        backupInventory: "browser-sharepoint",
        adminReads: "browser-sharepoint",
        hostingRuntimeConfig: "browser-sharepoint",
        hubEvidence: "hub-mongo"
      },
      mongo: {
        appData: "builder-backend-mongo",
        seedRuntimeData: "builder-backend-mongo",
        backupCapabilityInventory: "builder-backend-mongo",
        hostingRuntimeConfig: "browser-sharepoint",
        sharePointAccessChecks: "browser-sharepoint",
        hubEvidence: "hub-mongo"
      }
    }
  };
};

export const browserStatusFromHealth = (
  result: SharePointHealthResult
): OperationalStatusSnapshot["browserSharePoint"] => {
  const authBlocked = (result.evidence || []).some((item) => item.authBlocked || item.status === 401 || item.status === 403);
  const reachedTarget = (result.evidence || []).some((item) => item.ok || (typeof item.status === "number" && item.status !== 401 && item.status !== 403));
  const connected = reachedTarget && !authBlocked;
  return {
    status: connected ? "connected" : "failed",
    checkedAt: result.checkedAt,
    source: "Browser SharePoint",
    targetSharePointSiteUrl: result.targetSharePointSiteUrl,
    siteId: result.siteId,
    siteCode: result.siteCode,
    message: connected ? "Browser SharePoint מחובר לפי בדיקת Health" : "חיבור SharePoint דרך הדפדפן נכשל",
    nextStep: connected ? "אפשר לרענן אם המידע מתיישן" : "פתחו את אתר SharePoint בכניסה פעילה והריצו רענון דרך הדפדפן"
  };
};

export const browserStatusFromRuntimeConfig = (
  result: RuntimeConfigValidationResult
): OperationalStatusSnapshot["browserSharePoint"] => {
  const failed = result.readStatus === "auth-blocked" || result.readStatus === "error";
  return {
    status: failed ? "failed" : "connected",
    checkedAt: result.checkedAt,
    source: "Browser SharePoint",
    targetSharePointSiteUrl: result.runtimeConfigUrl,
    siteId: result.siteId,
    siteCode: result.siteCode,
    message: failed ? "חיבור SharePoint דרך הדפדפן נכשל בקריאת runtime config" : "Browser SharePoint קרא runtime config",
    nextStep: failed ? "רעננו runtime config מתוך דפדפן שמחובר לאתר היעד" : "אפשר לרענן runtime config אם המידע ישן"
  };
};

export const builderStatusFromMongoHealth = (
  result: BuilderMongoHealthResult
): OperationalStatusSnapshot["builderBackend"] => ({
  status: result.backendReachable ? "reachable" : "failed",
  checkedAt: result.checkedAt,
  configured: Boolean(result.backendApiUrl),
  reachable: result.backendReachable,
  backendApiUrlHost: result.backendApiUrlHost,
  siteId: result.siteId,
  message: result.backendReachable ? "Builder backend נגיש לפי בדיקת Mongo" : "Builder backend מוגדר אך הבדיקה נכשלה",
  nextStep: result.backendReachable ? "אפשר לרענן אם המידע מתיישן" : "בדקו URL ו־credential ref של Builder backend"
});

export const identityFromAuthUser = (
  authUser?: NonNullable<WhoAmIResult["user"]> | null,
  authChecking = false
): OperationalStatusSnapshot["currentIdentity"] => {
  if (authChecking) return { mode: "unknown", label: "בודק זהות" };
  if (!authUser) return { mode: "unknown", label: "זהות עדיין לא נבדקה" };
  if (authUser.identityMode === "sharepoint-user" || authUser.source === "sharepoint") {
    return {
      mode: "sharepoint-user",
      label: authUser.loginName || authUser.email || authUser.name || "SharePoint user",
      source: authUser.source
    };
  }
  if (authUser.identityMode === "explicit-owner" || authUser.source === "owner" || authUser.source === "bootstrap" || authUser.source === "site-admin") {
    return {
      mode: "explicit-owner",
      label: authUser.personalNumber || authUser.name || "בעלים/מנהל מורשה",
      source: authUser.source
    };
  }
  if (authUser.identityMode === "api-key" || authUser.source === "api-key") return { mode: "api-key", label: authUser.name || "API key", source: authUser.source };
  if (authUser.identityMode === "local-fallback" || authUser.source === "dev") return { mode: "local-dev-fallback", label: "Local Developer", source: authUser.source };
  return { mode: "unknown", label: authUser.name || "זהות לא ידועה", source: authUser.source };
};

export const isNewerEvidence = (incoming?: string, existing?: string) => {
  if (!incoming) return false;
  if (!existing) return true;
  const incomingTime = new Date(incoming).getTime();
  const existingTime = new Date(existing).getTime();
  return Number.isFinite(incomingTime) && (!Number.isFinite(existingTime) || incomingTime >= existingTime);
};
