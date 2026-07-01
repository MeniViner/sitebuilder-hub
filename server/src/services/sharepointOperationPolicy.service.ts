import type { JobType } from "./jobs.service";

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

export const SERVER_SHAREPOINT_DISABLED_HE =
  "SharePoint מתבצע רק דרך הדפדפן המחובר; השרת לא פונה ל־SharePoint.";

const BROWSER_REQUIRED_HE =
  "הפעולה צריכה לרוץ דרך הדפדפן המחובר ל־SharePoint. השרת ישמור רק metadata/evidence.";

const BROWSER_IMPLEMENTATION_MISSING_HE =
  "אין כרגע כפתור מקומי לפעולה הזאת. פעולות SharePoint מתבצעות רק דרך הדפדפן המחובר.";

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
    policy: "browser-supported",
    connectorMode: "browser-sharepoint",
    canRunFromBrowser: false,
    backendServiceAuthOnly: false,
    currentFailureMode: "server SharePoint REST is disabled by architecture",
    statusLabelHe: "מסלול שרת מושבת",
    blockerHe: SERVER_SHAREPOINT_DISABLED_HE
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
    currentFailureMode: "worker path is blocked; browser evidence endpoint is the supported execution path",
    statusLabelHe: "מופעל דרך הדפדפן"
  },
  "scheduled-backup": {
    operation: "scheduled-backup",
    label: "Scheduled backup awaiting browser execution",
    uiEntryPoint: "Backups schedule",
    backendRoute: "maintenance scheduler",
    controller: "maintenanceScheduler.queueScheduledBackup",
    service: "backups.enqueueSiteBackup / browser SharePoint runner",
    jobType: "backup",
    readsSharePoint: true,
    writesSharePoint: true,
    needsDigest: true,
    policy: "browser-supported",
    connectorMode: "browser-sharepoint",
    canRunFromBrowser: true,
    backendServiceAuthOnly: false,
    currentFailureMode: "queued until a connected SharePoint browser executes it",
    statusLabelHe: "ממתין לדפדפן SharePoint",
    blockerHe: BROWSER_REQUIRED_HE
  },
  restore: {
    operation: "restore",
    label: "Restore backup",
    uiEntryPoint: "Backups restore tab",
    backendRoute: "POST /api/backups/:id/restore and POST /api/backups/:id/browser-restore-evidence",
    controller: "backups.controller.postRestoreBackup",
    service: "backups.enqueueBackupRestore",
    jobType: "restore",
    readsSharePoint: true,
    writesSharePoint: true,
    needsDigest: true,
    policy: "browser-supported",
    connectorMode: "browser-sharepoint",
    canRunFromBrowser: true,
    backendServiceAuthOnly: false,
    currentFailureMode: "server restore is disabled; browser evidence endpoint is the supported execution path",
    statusLabelHe: "מופעל דרך הדפדפן",
    blockerHe: BROWSER_REQUIRED_HE
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
    policy: "browser-supported",
    connectorMode: "browser-sharepoint",
    canRunFromBrowser: true,
    backendServiceAuthOnly: false,
    currentFailureMode: "none",
    statusLabelHe: "מופעל דרך הדפדפן",
    blockerHe: BROWSER_REQUIRED_HE
  },
  "admin-txt-repair": {
    operation: "admin-txt-repair",
    label: "Admin TXT repair",
    uiEntryPoint: "Admins page TXT repair",
    backendRoute: "POST /api/sites/:id/admins/repair-txt and POST /api/sites/:id/admins/repair-txt/browser-evidence",
    controller: "admins.controller.queueTxtAdminRepair",
    service: "admins.enqueueAdminTxtRepair / executeAdminTxtRepair",
    jobType: "repair",
    readsSharePoint: true,
    writesSharePoint: true,
    needsDigest: true,
    policy: "browser-supported",
    connectorMode: "browser-sharepoint",
    canRunFromBrowser: true,
    backendServiceAuthOnly: false,
    currentFailureMode: "worker path is blocked; browser evidence endpoint is the supported execution path",
    statusLabelHe: "מופעל דרך הדפדפן",
    blockerHe: BROWSER_REQUIRED_HE
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
    policy: "browser-supported",
    connectorMode: "browser-sharepoint",
    canRunFromBrowser: true,
    backendServiceAuthOnly: false,
    currentFailureMode: "legacy backend membership write is disabled",
    statusLabelHe: "לא מוכן להפעלה",
    blockerHe: BROWSER_IMPLEMENTATION_MISSING_HE
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
    policy: "browser-supported",
    connectorMode: "browser-sharepoint",
    canRunFromBrowser: true,
    backendServiceAuthOnly: false,
    currentFailureMode: "server permissions setup is disabled; browser evidence endpoint is the supported execution path",
    statusLabelHe: "מופעל דרך הדפדפן",
    blockerHe: BROWSER_REQUIRED_HE
  },
  "site-bootstrap": {
    operation: "site-bootstrap",
    label: "Site bootstrap",
    uiEntryPoint: "Site details / create new site flow",
    backendRoute: "POST /api/sites/:id/bootstrap and POST /api/sites/:id/bootstrap/browser-evidence",
    controller: "sites.controller.queueSiteBootstrap",
    service: "siteBootstrap.executeSiteBootstrap",
    jobType: "site-bootstrap",
    readsSharePoint: true,
    writesSharePoint: true,
    needsDigest: true,
    policy: "browser-supported",
    connectorMode: "browser-sharepoint",
    canRunFromBrowser: true,
    backendServiceAuthOnly: false,
    currentFailureMode: "server bootstrap is disabled; browser evidence endpoint is the supported execution path",
    statusLabelHe: "מופעל דרך הדפדפן",
    blockerHe: BROWSER_REQUIRED_HE
  },
  "site-provision": {
    operation: "site-provision",
    label: "Site structure provisioning",
    uiEntryPoint: "Site details / create site flow",
    backendRoute: "POST /api/sites/:id/provision and POST /api/sites/:id/provision/browser-evidence",
    controller: "sites.controller.queueSiteProvision",
    service: "siteProvisioning.executeSiteProvisioning",
    jobType: "site-provision",
    readsSharePoint: true,
    writesSharePoint: true,
    needsDigest: true,
    policy: "browser-supported",
    connectorMode: "browser-sharepoint",
    canRunFromBrowser: true,
    backendServiceAuthOnly: false,
    currentFailureMode: "server provisioning is disabled; browser evidence endpoint is the supported execution path",
    statusLabelHe: "מופעל דרך הדפדפן",
    blockerHe: BROWSER_REQUIRED_HE
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
    currentFailureMode: "browser deploy implemented; backend deploy is disabled",
    statusLabelHe: "מופעל דרך הדפדפן"
  },
  "scheduled-health-check": {
    operation: "scheduled-health-check",
    label: "Scheduled health check awaiting browser execution",
    uiEntryPoint: "Health schedule",
    backendRoute: "maintenance scheduler",
    controller: "maintenanceScheduler.queueScheduledHealthCheck",
    service: "browser SharePoint health runner",
    jobType: "health-check",
    readsSharePoint: true,
    writesSharePoint: false,
    needsDigest: false,
    policy: "browser-supported",
    connectorMode: "browser-sharepoint",
    canRunFromBrowser: true,
    backendServiceAuthOnly: false,
    currentFailureMode: "queued until a connected SharePoint browser executes it",
    statusLabelHe: "ממתין לדפדפן SharePoint",
    blockerHe: BROWSER_REQUIRED_HE
  }
};

export const getSharePointOperationPolicy = (operation: SharePointOperationName) =>
  SHAREPOINT_OPERATION_POLICIES[operation];

export const getSharePointOperationInventory = () => Object.values(SHAREPOINT_OPERATION_POLICIES);

export const getBrowserRequiredJobMessage = (operation: SharePointOperationName) => {
  const policy = getSharePointOperationPolicy(operation);
  return `${policy.statusLabelHe}: ${BROWSER_REQUIRED_HE}`;
};

export const getBackendServiceAuthBlocker = (operation: SharePointOperationName) => {
  const policy = getSharePointOperationPolicy(operation);
  return policy.blockerHe || SERVER_SHAREPOINT_DISABLED_HE;
};

export const backendServiceAuthReady = () => false;

export const shouldBlockBackendSharePointByDefault = (operation: SharePointOperationName, input: {
  connectorMode?: string;
} = {}) => {
  void input;
  const policy = getSharePointOperationPolicy(operation);
  if (policy.policy === "browser-supported") return false;
  return true;
};

export const isBrowserRequiredJob = (job: { executionMode?: string; payload?: any; status?: string; connectorMode?: string }) =>
  job.executionMode === "browser-required" ||
  job.executionMode === "browser-in-progress" ||
  job.status === "browser-required" ||
  job.status === "browser-in-progress" ||
  job.connectorMode === "browser-sharepoint" ||
  job.payload?.connectorMode === "browser-sharepoint" ||
  job.payload?.executionMode === "browser-required";
