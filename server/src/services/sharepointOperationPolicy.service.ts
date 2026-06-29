import type { JobType } from "./jobs.service";
import { getSharePointOperationCapabilities } from "./sharepointOperationClient";

export type SharePointConnectorPolicyKind = "browser-supported" | "backend-service-auth-required" | "not-implemented";
export type SharePointConnectorMode = "browser-sharepoint" | "backend-sharepoint" | "mongo-backend" | "server-local" | "backend-service-auth-required" | "manual" | "none";
export type JobExecutionMode = "backend" | "browser-required" | "browser-in-progress" | "completed" | "failed" | "blocked-service-auth-required";

export type SharePointOperationName =
  | "browser-health-check"
  | "backend-health-check"
  | "backup"
  | "scheduled-backup"
  | "restore"
  | "admin-live-read"
  | "admin-sync"
  | "admin-txt-repair"
  | "admin-sharepoint-membership"
  | "permissions-setup"
  | "site-bootstrap"
  | "site-provision"
  | "deploy"
  | "scheduled-health-check";

export type SharePointOperationPolicy = {
  operation: SharePointOperationName;
  label: string;
  uiEntryPoint: string;
  backendRoute: string;
  controller: string;
  service: string;
  jobType?: JobType;
  readsSharePoint: boolean;
  writesSharePoint: boolean;
  needsDigest: boolean;
  policy: SharePointConnectorPolicyKind;
  connectorMode: SharePointConnectorMode;
  canRunFromBrowser: boolean;
  backendServiceAuthOnly: boolean;
  currentFailureMode: string;
  statusLabelHe: string;
  blockerHe?: string;
};

export const SHAREPOINT_OPERATION_POLICIES: Record<SharePointOperationName, SharePointOperationPolicy> = {
  "browser-health-check": {
    operation: "browser-health-check",
    label: "Browser SharePoint health check",
    uiEntryPoint: "Health / Site details",
    backendRoute: "POST /api/sites/:id/health-check/browser-sharepoint",
    controller: "sites.controller.browserSharePointHealthCheckEvidence",
    service: "sharepointHealth.recordBrowserSharePointHealthCheck",
    jobType: "health-check",
    readsSharePoint: true,
    writesSharePoint: false,
    needsDigest: false,
    policy: "browser-supported",
    connectorMode: "browser-sharepoint",
    canRunFromBrowser: true,
    backendServiceAuthOnly: false,
    currentFailureMode: "none",
    statusLabelHe: "מופעל דרך הדפדפן"
  },
  "backend-health-check": {
    operation: "backend-health-check",
    label: "Backend read-only health check",
    uiEntryPoint: "Health schedule / legacy read-only endpoint",
    backendRoute: "POST /api/sites/:id/health-check/sharepoint-readonly",
    controller: "sites.controller.readOnlySharePointHealthCheck",
    service: "sharepointHealth.runReadOnlySharePointHealthCheck",
    jobType: "health-check",
    readsSharePoint: true,
    writesSharePoint: false,
    needsDigest: false,
    policy: "backend-service-auth-required",
    connectorMode: "backend-sharepoint",
    canRunFromBrowser: false,
    backendServiceAuthOnly: true,
    currentFailureMode: "backend SharePoint read can return 401/403 without service auth",
    statusLabelHe: "דורש הרשאת שרת",
    blockerHe: "הפעולה לא יכולה לרוץ ברקע בלי חיבור שרת ל־SharePoint"
  },
  backup: {
    operation: "backup",
    label: "User-triggered backup",
    uiEntryPoint: "Backups page / Site details backups tab",
    backendRoute: "POST /api/sites/:id/backups and POST /api/sites/:id/backups/browser-evidence",
    controller: "backups.controller.runSiteBackup / recordBrowserBackupEvidence",
    service: "backups.enqueueSiteBackup / recordBrowserSharePointBackupEvidence",
    jobType: "backup",
    readsSharePoint: true,
    writesSharePoint: true,
    needsDigest: true,
    policy: "browser-supported",
    connectorMode: "browser-sharepoint",
    canRunFromBrowser: true,
    backendServiceAuthOnly: false,
    currentFailureMode: "legacy worker path called backend getRequestDigest and failed sharepoint-digest-failed:401",
    statusLabelHe: "מופעל דרך הדפדפן"
  },
  "scheduled-backup": {
    operation: "scheduled-backup",
    label: "Scheduled unattended backup",
    uiEntryPoint: "Backups schedule",
    backendRoute: "maintenance scheduler",
    controller: "maintenanceScheduler.queueScheduledBackup",
    service: "backups.enqueueSiteBackup / realBackup.executeSharePointBackup",
    jobType: "backup",
    readsSharePoint: true,
    writesSharePoint: true,
    needsDigest: true,
    policy: "backend-service-auth-required",
    connectorMode: "backend-sharepoint",
    canRunFromBrowser: false,
    backendServiceAuthOnly: true,
    currentFailureMode: "scheduled worker cannot use a browser session",
    statusLabelHe: "דורש הרשאת שרת",
    blockerHe: "הפעולה לא יכולה לרוץ ברקע בלי חיבור שרת ל־SharePoint"
  },
  restore: {
    operation: "restore",
    label: "Restore backup",
    uiEntryPoint: "Backups restore tab",
    backendRoute: "POST /api/backups/:id/restore",
    controller: "backups.controller.postRestoreBackup",
    service: "backups.enqueueBackupRestore / realBackup.executeSharePointRestore",
    jobType: "restore",
    readsSharePoint: true,
    writesSharePoint: true,
    needsDigest: true,
    policy: "not-implemented",
    connectorMode: "none",
    canRunFromBrowser: true,
    backendServiceAuthOnly: false,
    currentFailureMode: "legacy worker restore calls backend getRequestDigest",
    statusLabelHe: "לא מוכן להפעלה",
    blockerHe: "שחזור דורש הרשאת שרת ל־SharePoint או מימוש שחזור דרך הדפדפן."
  },
  "admin-live-read": {
    operation: "admin-live-read",
    label: "Admin live read",
    uiEntryPoint: "Admins page / Site Details Admins tab",
    backendRoute: "POST /api/sites/:id/admins/browser-live-read-evidence",
    controller: "admins.controller.browserLiveReadEvidenceEndpoint",
    service: "admins.recordBrowserAdminLiveReadEvidence",
    jobType: "admin-sync",
    readsSharePoint: true,
    writesSharePoint: false,
    needsDigest: false,
    policy: "browser-supported",
    connectorMode: "browser-sharepoint",
    canRunFromBrowser: true,
    backendServiceAuthOnly: false,
    currentFailureMode: "fixed: browser reads SharePoint and backend persists evidence only",
    statusLabelHe: "מופעל דרך הדפדפן"
  },
  "admin-sync": {
    operation: "admin-sync",
    label: "Persist admin snapshot from live SharePoint",
    uiEntryPoint: "Admins page Sync",
    backendRoute: "POST /api/sites/:id/admins/sync",
    controller: "admins.controller.syncAdmins",
    service: "admins.enqueueAdminSync / liveAdminSources.readLiveAdminSources",
    jobType: "admin-sync",
    readsSharePoint: true,
    writesSharePoint: false,
    needsDigest: false,
    policy: "not-implemented",
    connectorMode: "none",
    canRunFromBrowser: true,
    backendServiceAuthOnly: false,
    currentFailureMode: "legacy worker reads SharePoint from backend",
    statusLabelHe: "לא מוכן להפעלה",
    blockerHe: "סנכרון מנהלים דרך השרת עדיין דורש הרשאת שרת ל־SharePoint או הסבה לחיבור דרך הדפדפן."
  },
  "admin-txt-repair": {
    operation: "admin-txt-repair",
    label: "Admin TXT repair",
    uiEntryPoint: "Admins page TXT repair",
    backendRoute: "POST /api/sites/:id/admins/repair-txt",
    controller: "admins.controller.queueTxtAdminRepair",
    service: "admins.enqueueAdminTxtRepair / executeAdminTxtRepair",
    jobType: "repair",
    readsSharePoint: true,
    writesSharePoint: true,
    needsDigest: true,
    policy: "not-implemented",
    connectorMode: "none",
    canRunFromBrowser: true,
    backendServiceAuthOnly: false,
    currentFailureMode: "legacy worker writes users_data.txt through backend digest",
    statusLabelHe: "לא מוכן להפעלה",
    blockerHe: "הפעולה הזאת עדיין לא הוסבה לחיבור דרך הדפדפן."
  },
  "admin-sharepoint-membership": {
    operation: "admin-sharepoint-membership",
    label: "SharePoint admin membership changes",
    uiEntryPoint: "Admins add/remove Site Collection or Owners Group",
    backendRoute: "POST/DELETE /api/sites/:id/admins",
    controller: "admins.controller.addAdmin / deleteAdmin",
    service: "admins.addSiteAdmin / removeSiteAdmin",
    readsSharePoint: true,
    writesSharePoint: true,
    needsDigest: true,
    policy: "backend-service-auth-required",
    connectorMode: "backend-sharepoint",
    canRunFromBrowser: true,
    backendServiceAuthOnly: true,
    currentFailureMode: "backend digest can fail 401 unless service auth is valid",
    statusLabelHe: "דורש הרשאת שרת",
    blockerHe: "הפעולה הזאת עדיין רצה דרך השרת ולכן דורשת הרשאת שרת ל־SharePoint."
  },
  "permissions-setup": {
    operation: "permissions-setup",
    label: "Permissions setup",
    uiEntryPoint: "Site details / create site flow",
    backendRoute: "POST /api/sites/:id/permissions/setup",
    controller: "sites.controller.queuePermissionsSetup",
    service: "permissionsSetup.executePermissionsSetup",
    jobType: "permissions-setup",
    readsSharePoint: true,
    writesSharePoint: true,
    needsDigest: true,
    policy: "not-implemented",
    connectorMode: "none",
    canRunFromBrowser: true,
    backendServiceAuthOnly: false,
    currentFailureMode: "legacy worker calls backend digest",
    statusLabelHe: "לא מוכן להפעלה",
    blockerHe: "הפעולה הזאת עדיין לא הוסבה לחיבור דרך הדפדפן."
  },
  "site-bootstrap": {
    operation: "site-bootstrap",
    label: "Site bootstrap",
    uiEntryPoint: "Site details / create new site flow",
    backendRoute: "POST /api/sites/:id/bootstrap",
    controller: "sites.controller.queueSiteBootstrap",
    service: "siteBootstrap.executeSiteBootstrap",
    jobType: "site-bootstrap",
    readsSharePoint: true,
    writesSharePoint: true,
    needsDigest: true,
    policy: "backend-service-auth-required",
    connectorMode: "backend-sharepoint",
    canRunFromBrowser: false,
    backendServiceAuthOnly: true,
    currentFailureMode: "site collection creation/provision uses backend SharePoint service auth",
    statusLabelHe: "דורש הרשאת שרת",
    blockerHe: "הפעולה הזאת עדיין רצה דרך השרת ולכן דורשת הרשאת שרת ל־SharePoint."
  },
  "site-provision": {
    operation: "site-provision",
    label: "Site structure provisioning",
    uiEntryPoint: "Site details / create site flow",
    backendRoute: "POST /api/sites/:id/provision",
    controller: "sites.controller.queueSiteProvision",
    service: "siteProvisioning.executeSiteProvisioning",
    jobType: "site-provision",
    readsSharePoint: true,
    writesSharePoint: true,
    needsDigest: true,
    policy: "not-implemented",
    connectorMode: "none",
    canRunFromBrowser: true,
    backendServiceAuthOnly: false,
    currentFailureMode: "legacy worker calls backend digest",
    statusLabelHe: "לא מוכן להפעלה",
    blockerHe: "הפעולה הזאת עדיין לא הוסבה לחיבור דרך הדפדפן."
  },
  deploy: {
    operation: "deploy",
    label: "Deploy/upload release",
    uiEntryPoint: "Releases page",
    backendRoute: "POST /api/sites/:id/deployments/browser-evidence",
    controller: "releases.controller.recordBrowserDeploymentEvidence",
    service: "deployArtifact.recordBrowserSharePointDeploymentEvidence",
    jobType: "deploy",
    readsSharePoint: true,
    writesSharePoint: true,
    needsDigest: true,
    policy: "browser-supported",
    connectorMode: "browser-sharepoint",
    canRunFromBrowser: true,
    backendServiceAuthOnly: false,
    currentFailureMode: "browser deploy implemented; backend deploy remains service-auth only",
    statusLabelHe: "מופעל דרך הדפדפן"
  },
  "scheduled-health-check": {
    operation: "scheduled-health-check",
    label: "Scheduled health check",
    uiEntryPoint: "Health schedule",
    backendRoute: "maintenance scheduler",
    controller: "maintenanceScheduler.queueScheduledHealthCheck",
    service: "sharepointHealth.runReadOnlySharePointHealthCheck",
    jobType: "health-check",
    readsSharePoint: true,
    writesSharePoint: false,
    needsDigest: false,
    policy: "backend-service-auth-required",
    connectorMode: "backend-sharepoint",
    canRunFromBrowser: false,
    backendServiceAuthOnly: true,
    currentFailureMode: "scheduled read cannot use browser session",
    statusLabelHe: "דורש הרשאת שרת",
    blockerHe: "הפעולה לא יכולה לרוץ ברקע בלי חיבור שרת ל־SharePoint"
  }
};

export const getSharePointOperationPolicy = (operation: SharePointOperationName) =>
  SHAREPOINT_OPERATION_POLICIES[operation];

export const getSharePointOperationInventory = () => Object.values(SHAREPOINT_OPERATION_POLICIES);

export const getBrowserRequiredJobMessage = (operation: SharePointOperationName) => {
  const policy = getSharePointOperationPolicy(operation);
  return `${policy.statusLabelHe}: החיבור דרך הדפדפן תקין. הפעולה תרוץ דרך הדפדפן.`;
};

export const getBackendServiceAuthBlocker = (operation: SharePointOperationName) => {
  const policy = getSharePointOperationPolicy(operation);
  return policy.blockerHe || "הפעולה הזאת עדיין רצה דרך השרת ולכן דורשת הרשאת שרת ל־SharePoint.";
};

export const backendServiceAuthReady = () => {
  const capabilities = getSharePointOperationCapabilities();
  return Boolean(capabilities.writeAvailable && capabilities.digest.canRequest);
};

export const shouldBlockBackendSharePointByDefault = (operation: SharePointOperationName, input: {
  connectorMode?: string;
  confirmBackendSharePoint?: boolean;
} = {}) => {
  const policy = getSharePointOperationPolicy(operation);
  if (policy.policy === "browser-supported") return false;
  if (input.connectorMode === "backend-sharepoint" && input.confirmBackendSharePoint === true) return false;
  return true;
};

export const isBrowserRequiredJob = (job: { executionMode?: string; payload?: any; status?: string }) =>
  job.executionMode === "browser-required" ||
  job.executionMode === "browser-in-progress" ||
  job.status === "browser-required" ||
  job.status === "browser-in-progress" ||
  job.payload?.connectorMode === "browser-sharepoint" ||
  job.payload?.executionMode === "browser-required";
