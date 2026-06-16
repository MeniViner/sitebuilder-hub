import { Site, SitesStats, SiteHealth } from "../types/site";
import { clientLogger } from "../utils/logger";
import { normalizePersonalNumber as normalizeHubPersonalNumber } from "../utils/personalNumber";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4100/api";
export const HUB_PERSONAL_NUMBER_STORAGE_KEY = "sitebuilderHubPersonalNumber";

type ApiSuccess<T> = { ok: true; data: T; meta?: Record<string, unknown> };
type ApiError = { ok: false; error: { code: string; message: string; details?: unknown } };

export type AuthLoginResult = {
  authenticated: boolean;
  personalNumber: string;
  role: "admin";
  source: "owner" | "bootstrap" | "site-admin";
  isBootstrapAdmin: boolean;
  matchedSite: null | {
    siteId: string;
    siteCode?: string;
    siteName?: string;
  };
};

export type AuthBootstrapStatus = {
  personalNumberLoginEnabled: boolean;
  ownerPersonalNumberConfigured: number;
  envBootstrapAdminsConfigured: number;
  bootstrapAdminsConfigured: number;
  bootstrapPersonalNumberAuthAvailable: boolean;
};

export type WhoAmIResult = {
  authenticated: boolean;
  user: null | {
    id: string;
    name: string;
    role: "viewer" | "operator" | "admin";
    personalNumber?: string;
    source?: "dev" | "api-key" | "owner" | "bootstrap" | "site-admin" | "sharepoint";
    loginName?: string;
    email?: string;
    identityMode?: "sharepoint-user" | "explicit-owner" | "local-fallback" | "api-key";
    isBootstrapAdmin?: boolean;
  };
};

export type SharePointCurrentUserResult = {
  mode: "sharepoint-hosted" | "local-dev" | "unknown";
  attempted: boolean;
  ok: boolean;
  url: string;
  status?: number;
  statusText?: string;
  error?: string;
  user?: {
    id?: number | string;
    title: string;
    loginName: string;
    email?: string;
    personalNumber?: string;
  };
};

export type Release = {
  _id: string;
  version: string;
  releaseType: "patch" | "minor" | "major" | "hotfix";
  notes?: string;
  artifactRef?: string;
  artifactValidation?: {
    artifactRef?: string;
    artifactRoot?: string;
    filesCount?: number;
    totalSizeBytes?: number;
    hasIndexHtml?: boolean;
    hasManifest?: boolean;
    readyForDeploy?: boolean;
    validatedAt?: string;
    validationError?: string;
  };
  status: "active" | "deprecated";
  createdBy?: string;
  createdAt: string;
};

export type Job = {
  _id: string;
  type: string;
  status: "awaiting-approval" | "queued" | "preflight" | "running" | "verifying" | "succeeded" | "failed" | "cancelled" | "retrying";
  progressPercent: number;
  createdBy?: string;
  siteId?: string;
  errorMessage?: string;
  evidence?: unknown;
  result?: unknown;
  targetPaths?: string[];
  requiresApproval?: boolean;
  approvalSummary?: string | Record<string, unknown>;
  approvalRequestedAt?: string;
  approvalRequestedBy?: string;
  approvedAt?: string;
  approvedBy?: string;
  rejectedAt?: string;
  rejectedBy?: string;
  approvalDecisionReason?: string;
  approvalExpiresAt?: string;
  approvalSnapshot?: unknown;
  approvalResult?: unknown;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  logs?: Array<{ at: string; level: string; message: string }>;
};

export type BackupVerificationEvidence = {
  sourcePath: string;
  targetPath: string;
  status: "verified" | "failed";
  checkedAt?: string;
  sourceSizeBytes?: number;
  sourceSha256?: string;
  expectedBackupSizeBytes?: number;
  expectedBackupSha256?: string;
  backupSizeBytes?: number;
  backupSha256?: string;
  sizeMatches?: boolean;
  sha256Matches?: boolean;
  httpStatus?: number;
  httpStatusText?: string;
  contentType?: string;
  etag?: string;
  lastModified?: string;
  error?: string;
};

export type BackupRestoreEvidence = {
  sourcePath: string;
  targetPath: string;
  backupPath: string;
  status: "verified" | "failed";
  checkedAt?: string;
  expectedBackupSizeBytes?: number;
  expectedBackupSha256?: string;
  backupSizeBytes?: number;
  backupSha256?: string;
  expectedRestoreSizeBytes?: number;
  expectedRestoreSha256?: string;
  restoredSizeBytes?: number;
  restoredSha256?: string;
  sizeMatches?: boolean;
  sha256Matches?: boolean;
  httpStatus?: number;
  httpStatusText?: string;
  contentType?: string;
  etag?: string;
  lastModified?: string;
  error?: string;
};

export type BackupSourceEvidence = {
  path: string;
  exists: boolean;
  targetPath?: string;
  status?: "pending" | "verified" | "failed";
  sourceSizeBytes?: number;
  sourceSha256?: string;
  backupSizeBytes?: number;
  backupSha256?: string;
  error?: string;
};

export type Backup = {
  _id: string;
  siteId: string;
  backupId: string;
  status: string;
  storagePath?: string;
  filesCount: number;
  sizeBytes: number;
  sourceSha256?: string;
  backupSha256?: string;
  sourcePaths?: BackupSourceEvidence[];
  createdAt: string;
  verification?: {
    status?: string;
    checkedAt?: string;
    checkedBy?: string;
    details?: string;
    evidence?: BackupVerificationEvidence[];
  };
  restoreStatus?: "never-restored" | "running" | "succeeded" | "verified" | "failed";
  lastRestoreAt?: string;
  lastRestoreJobId?: string;
  restoreEvidence?: BackupRestoreEvidence[];
  lastRestoreError?: string;
};

export type DeploymentVerificationEvidence = {
  relativePath: string;
  sourcePath: string;
  targetPath: string;
  status: "verified" | "failed";
  checkedAt?: string;
  expectedSizeBytes?: number;
  actualSizeBytes?: number;
  expectedSha256?: string;
  actualSha256?: string;
  sizeMatches?: boolean;
  sha256Matches?: boolean;
  httpStatus?: number;
  httpStatusText?: string;
  contentType?: string;
  etag?: string;
  lastModified?: string;
  error?: string;
};

export type DeploymentFinalAppUrlVerification = {
  key?: string;
  label?: string;
  url?: string;
  finalAppUrl?: string;
  ok?: boolean;
  status?: number;
  statusText?: string;
  httpStatus?: number;
  httpStatusText?: string;
  checkedAt?: string;
  authBlocked?: boolean;
  error?: string;
};

export type DeploymentPostHealthResult = {
  checkedAt?: string;
  siteId?: string;
  siteCode?: string;
  health?: SiteHealth;
  derivedHealthStatus?: string;
  status?: string;
  evidence?: SharePointHealthEvidence[];
  note?: string;
  error?: string;
};

export type SiteDeployment = {
  _id: string;
  siteId: string;
  releaseId: string;
  jobId?: string;
  fromVersion?: string;
  toVersion: string;
  deploymentKind?: "deploy" | "rollback";
  rollbackReason?: string;
  status: string;
  startedAt?: string;
  finishedAt?: string;
  triggeredBy?: string;
  error?: string;
  verification?: {
    status?: string;
    checkedAt?: string;
    filesCount?: number;
    verifiedFilesCount?: number;
    failedFilesCount?: number;
    totalSizeBytes?: number;
    evidence?: DeploymentVerificationEvidence[];
    finalAppUrlVerification?: DeploymentFinalAppUrlVerification;
    postHealth?: DeploymentPostHealthResult;
  };
  createdAt?: string;
};

export type SharePointHealthEvidence = {
  key: string;
  label: string;
  url: string;
  ok: boolean;
  status?: number;
  statusText?: string;
  authBlocked?: boolean;
  error?: string;
};

export type SharePointHealthResult = {
  checkedAt: string;
  siteId: string;
  siteCode: string;
  health: SiteHealth;
  derivedHealthStatus: string;
  evidence: SharePointHealthEvidence[];
  connectorMode?: "browser-sharepoint" | "backend-sharepoint";
  targetSharePointSiteUrl?: string;
  source?: string;
  resolvedPaths?: Record<string, unknown>;
  note?: string;
};

export type BackupPlanSource = {
  key: string;
  label: string;
  serverRelativePath: string;
  url: string;
  required: boolean;
  exists: boolean;
  status?: number;
  statusText?: string;
  sizeBytes?: number;
  authBlocked?: boolean;
  error?: string;
};

export type BackupPlan = {
  generatedAt: string;
  siteId: string;
  siteCode: string;
  backupIdPreview: string;
  target: {
    backupsRoot: string;
    backupFolder: string;
  };
  sources: BackupPlanSource[];
  summary: {
    totalSources: number;
    existingSources: number;
    missingSources: number;
    authBlockedSources: number;
    knownSizeBytes: number;
    readyForBackup: boolean;
    readyForBackupExecution?: boolean;
  };
  notes: string[];
};

export type SharePointBackupInventoryFile = {
  name: string;
  serverRelativeUrl: string;
  url: string;
  sizeBytes?: number;
  timeCreated?: string;
  timeLastModified?: string;
  uniqueId?: string;
  etag?: string;
  contentType?: string;
};

export type SharePointBackupInventoryFolder = {
  name: string;
  serverRelativeUrl: string;
  url: string;
  itemCount?: number;
  timeCreated?: string;
  timeLastModified?: string;
  uniqueId?: string;
  files?: SharePointBackupInventoryFile[];
  filesStatus?: {
    exists: boolean;
    status?: number;
    statusText?: string;
    authBlocked?: boolean;
    error?: string;
  };
  filesCount: number;
  knownSizeBytes: number;
};

export type SharePointBackupInventory = {
  generatedAt: string;
  siteId: string;
  siteCode: string;
  includeFiles: boolean;
  resolvedPaths?: Record<string, unknown>;
  root: {
    serverRelativePath: string;
    url: string;
    apiUrl: string;
    checkedAt: string;
    exists: boolean;
    status?: number;
    statusText?: string;
    authBlocked?: boolean;
    error?: string;
  };
  folders: SharePointBackupInventoryFolder[];
  summary: {
    rootExists: boolean;
    foldersCount: number;
    filesCount: number;
    knownSizeBytes: number;
    authBlocked: boolean;
    readOk: boolean;
  };
  notes: string[];
};

export type SiteProvisionPlan = {
  generatedAt: string;
  siteId: string;
  siteCode: string;
  steps: Array<{
    key: string;
    label: string;
    mode: "read-write";
    target: string;
    status?: string;
  }>;
  notes: string[];
  capabilities: {
    readAvailable: boolean;
    writeEnabled: boolean;
    hasAuthMaterial: boolean;
    unauthenticatedWriteAllowed: boolean;
    writeAvailable: boolean;
    authMode: "bearer" | "cookie" | "none";
    siteCreation?: {
      modernSiteCollectionEndpoint: string;
      statusEndpoint: string;
      canCreate: boolean;
      pollAttempts: number;
      pollIntervalMs: number;
      reason?: string;
    };
    reason?: string;
  };
};

export type SiteBootstrapOptions = {
  owner?: string;
  lcid?: number | string;
  webTemplate?: string;
  shareByEmailEnabled?: boolean;
  classification?: string;
  sensitivityLabel?: string;
  siteDesignId?: string;
  webTemplateExtensionId?: string;
  runProvisioning?: boolean;
  runPermissionsSetup?: boolean;
  reason?: string;
};

export type SiteBootstrapPlan = {
  operation: "site-bootstrap";
  generatedAt: string;
  siteId: string;
  siteCode: string;
  targetWeb: {
    sharePointSiteUrl: string;
    siteRoot: string;
    creationMode: "site-collection";
    owner: string;
    webTemplate: string;
    lcid: number;
  };
  resolvedPaths?: Record<string, unknown>;
  steps: Array<{
    key: string;
    label: string;
    mode: "read-write";
    phase: "site-create" | "provision" | "permissions";
    target: string;
    status?: string;
  }>;
  blockers: string[];
  risks: string[];
  notes: string[];
  summary: {
    totalSteps: number;
    createsSharePointSite: boolean;
    runsProvisioning: boolean;
    runsPermissionsSetup: boolean;
    writeRequired: boolean;
    requestDigestRequired: boolean;
    readyForBootstrapExecution: boolean;
  };
  capabilities?: OperationCapabilities["sharePoint"];
};

export type OperationCapabilities = {
  generatedAt: string;
  sharePoint: {
    readAvailable: boolean;
    writeEnabled: boolean;
    configured?: {
      writeEnabled: boolean;
      authCookieConfigured: boolean;
      bearerTokenConfigured: boolean;
      unauthenticatedWriteBypassEnabled: boolean;
    };
    hasAuthMaterial: boolean;
    unauthenticatedWriteAllowed: boolean;
    writeAvailable: boolean;
    writeVerified?: boolean;
    authMode: "bearer" | "cookie" | "none";
    reason?: string;
  };
  operations: Record<string, { available: boolean; writeRequired: boolean; reason?: string }>;
};

export type PermissionsSetupPlan = {
  generatedAt: string;
  siteId: string;
  siteCode: string;
  steps: Array<{ key: string; label: string; target: string; status?: string }>;
  notes: string[];
  capabilities: OperationCapabilities["sharePoint"];
};

export type DeployMode = "local-dev-owner" | "production-safe";
export type SharePointConnectorMode = "backend-sharepoint" | "browser-sharepoint";

export type DeployPolicy = {
  mode: DeployMode;
  label: string;
  productionSafeMode: boolean;
  localDevOwnerMode: boolean;
  requiresApproval: boolean;
  requiresRecentVerifiedBackup: boolean;
  ownerOverrideAllowed: boolean;
  checkedAt: string;
  warning: string;
  blockers: string[];
};

export type DeployPlan = {
  generatedAt: string;
  deployMode?: DeployMode;
  connectorMode?: SharePointConnectorMode;
  deployPolicy?: DeployPolicy;
  releaseId: string;
  releaseVersion: string;
  artifactRef: string;
  artifactRoot: string;
  siteId: string;
  siteCode: string;
  target?: {
    siteId: string;
    siteCode: string;
    siteDisplayName: string;
    environment: string;
    sharePointSiteUrl: string;
    finalAppUrl: string;
    currentKnownVersion: string;
    currentVersionSource: "hub-metadata" | "unknown";
    releaseVersion: string;
    artifactPath: string;
    targetDistPath: string;
    sharePointWriteConfigured: boolean;
    backupRequired: boolean;
    mode: DeployMode;
    productionSafeMode: boolean;
    localDevOwnerMode: boolean;
  };
  files: Array<{
    relativePath: string;
    sourcePath: string;
    targetPath: string;
    sizeBytes: number;
    sha256: string;
  }>;
  summary: {
    filesCount: number;
    totalSizeBytes: number;
    hasIndexHtml: boolean;
    hasManifest: boolean;
    readyForDeploy: boolean;
    readyForDeployExecution?: boolean;
    targetInventoryReadOk?: boolean;
    staleTargetFilesCount?: number;
  };
  capabilities: {
    readAvailable: boolean;
    writeEnabled: boolean;
    hasAuthMaterial: boolean;
    unauthenticatedWriteAllowed: boolean;
    writeAvailable: boolean;
    authMode: "bearer" | "cookie" | "none";
    reason?: string;
  };
  blockers?: string[];
  missingRequirements?: string[];
  notes: string[];
  targetInventory?: DeployTargetInventory;
  staleTargetFiles?: DeployTargetInventoryFile[];
  approvalSummary?: string | Record<string, unknown>;
  approvalSnapshot?: unknown;
};

export type BatchDeployTargetMode = "single" | "selected" | "all";
export type BatchDeployTargetStatus = "ready" | "warning" | "blocked" | "up_to_date";

export type BatchDeployPlanRow = {
  siteId: string;
  siteCode: string;
  displayName: string;
  environment: string;
  currentVersion: string;
  targetVersion: string;
  alreadyUpToDate: boolean;
  included: boolean;
  status: BatchDeployTargetStatus;
  blockers: string[];
  warnings: string[];
  plan?: DeployPlan;
};

export type BatchDeployPlan = {
  generatedAt: string;
  dryRun: true;
  releaseId: string;
  releaseVersion: string;
  targetMode: BatchDeployTargetMode;
  targetSiteIds: string[];
  deployMode: DeployMode;
  connectorMode?: SharePointConnectorMode;
  summary: {
    totalSelectedSites: number;
    readySites: number;
    blockedSites: number;
    warningSites: number;
    alreadyUpToDateSites: number;
    executionReady: boolean;
  };
  results: BatchDeployPlanRow[];
  blockers: string[];
  warnings: string[];
};

export type BatchDeployRequest = {
  targetMode: BatchDeployTargetMode;
  targetSiteIds?: string[];
  deployMode?: DeployMode;
  connectorMode?: SharePointConnectorMode;
};

export type BatchDeployResult = {
  plan: BatchDeployPlan;
  queued: number;
  skippedUpToDate: number;
  jobs: Job[];
  deployments: SiteDeployment[];
  requiresApproval: boolean;
  approvalStatus: string;
  message: string;
};

export type DeployTargetInventoryFile = {
  relativePath?: string;
  path?: string;
  name?: string;
  sourcePath?: string;
  targetPath?: string;
  serverRelativeUrl?: string;
  url?: string;
  sizeBytes?: number;
  sha256?: string;
  etag?: string;
  contentType?: string;
  lastModified?: string;
  timeLastModified?: string;
  exists?: boolean;
  staleReason?: string;
  reason?: string;
  policy?: string;
  status?: string;
  error?: string;
};

export type DeployTargetInventory = {
  checkedAt?: string;
  root?: string;
  readOk?: boolean;
  filesCount?: number;
  staleFilesCount?: number;
  filesSample?: DeployTargetInventoryFile[];
  staleFiles?: DeployTargetInventoryFile[];
  failedFolders?: Array<{ path: string; error?: string; status?: number; statusText?: string; authBlocked?: boolean }>;
  generatedAt?: string;
  targetRoot?: string;
  distRoot?: string;
  serverRelativePath?: string;
  url?: string;
  files?: DeployTargetInventoryFile[];
  summary?: {
    filesCount?: number;
    existingFilesCount?: number;
    staleFilesCount?: number;
    knownSizeBytes?: number;
    readOk?: boolean;
    authBlocked?: boolean;
    mirrorDeleteEnabled?: boolean;
    staleFilePolicy?: string;
  };
  notes?: string[];
};

export type LiveAdminSourcesResult = {
  siteId: string;
  siteCode: string;
  capturedAt: string;
  adminsCount: number;
  txtAdmins: any[];
  siteCollectionAdmins: any[];
  ownersGroupAdmins: any[];
  adminDifferences: Record<string, string[]>;
  sourceStatus: Array<{
    source: "txt" | "siteCollection" | "ownersGroup";
    ok: boolean;
    count: number;
    error?: string;
  }>;
};

export type AdminTxtRepairPlan = {
  operation: "admin-txt-repair";
  generatedAt: string;
  siteId: string;
  siteCode: string;
  siteDisplayName?: string;
  targetPath: string;
  sourceStatus: LiveAdminSourcesResult["sourceStatus"];
  sourceCounts: {
    txt: number;
    siteCollection: number;
    ownersGroup: number;
  };
  missingInTxt: string[];
  missingAdmins: any[];
  mergedTxtAdmins: any[];
  additions?: any[];
  toAdd?: any[];
  unchanged?: any[];
  diff?: {
    additions?: any[];
    missingInTxt?: any[];
    removals?: any[];
    unchanged?: any[];
  };
  summary: {
    readyForRepair: boolean;
    targetPath: string;
    currentTxtAdminsCount: number;
    targetTxtAdminsCount: number;
    missingInTxtCount: number;
    additionsCount: number;
    removalsCount: number;
    unchangedCount: number;
  };
  liveRead?: {
    capturedAt: string;
    adminsCount: number;
    sourceStatus: LiveAdminSourcesResult["sourceStatus"];
    adminDifferences: Record<string, string[]>;
  };
  notes?: string[];
};

export type RollbackPlan = DeployPlan & {
  rollback: {
    fromVersion: string;
    toVersion: string;
    reason?: string;
    risks: string[];
  };
};

export type ReleaseArtifactValidation = {
  generatedAt: string;
  releaseId: string;
  releaseVersion: string;
  artifactRef: string;
  artifactRoot: string;
  summary: {
    filesCount: number;
    totalSizeBytes: number;
    hasIndexHtml: boolean;
    hasManifest: boolean;
    readyForDeploy: boolean;
  };
  sampleFiles: Array<{ relativePath: string; sourcePath: string; sizeBytes: number; sha256: string }>;
  notes: string[];
};

export type ReleaseArtifactManifestFile = {
  relativePath: string;
  targetRelativePath: string;
  sizeBytes: number;
  contentType: string;
  sha256: string;
  deployable: boolean;
};

export type ReleaseArtifactManifest = {
  generatedAt: string;
  releaseId: string;
  version: string;
  artifactRef: string;
  artifactRoot: string;
  files: ReleaseArtifactManifestFile[];
  summary: {
    filesCount: number;
    deployableFilesCount: number;
    totalSizeBytes: number;
    hasIndexHtml: boolean;
    hasManifest: boolean;
    readyForDeploy: boolean;
  };
};

export type ReleaseArtifactFileResponse = {
  blob: Blob;
  relativePath: string;
  sizeBytes: number;
  sha256: string;
  contentType: string;
};

export type BrowserDeployEvidencePayload = {
  releaseId: string;
  deployMode?: DeployMode;
  connectorMode: "browser-sharepoint";
  targetSite?: {
    siteId?: string;
    siteCode?: string;
    sharePointSiteUrl?: string;
  };
  targetPaths?: {
    targetDistPath?: string;
    finalAppUrl?: string;
  };
  uploadedFilesEvidence?: DeploymentVerificationEvidence[];
  readBackEvidence?: DeploymentVerificationEvidence[];
  errors?: Array<{ relativePath?: string; targetPath?: string; error: string; status?: number } | string>;
  startedAt?: string;
  completedAt?: string;
  finalStatus: "success" | "failed";
  versionBefore?: string;
  versionAfter?: string;
};

export type AllBackupPlans = {
  generatedAt: string;
  count: number;
  readyCount: number;
  failedCount: number;
  results: Array<
    | { ok: true; siteId: string; siteCode: string; plan: BackupPlan }
    | { ok: false; siteId: string; siteCode: string; error: string }
  >;
};

export type SiteOperationsSummary = {
  generatedAt: string;
  capabilities: OperationCapabilities;
  site: Partial<Site> & {
    sharePointStatus?: Record<string, unknown>;
    backupStatus?: string;
    adminSyncStatus?: string;
    versionStatus?: string;
  };
  recent: {
    jobs: Job[];
    backups: Backup[];
    deployments: SiteDeployment[];
  };
  recommendedActions: string[];
};

export type AuditLogRow = {
  _id: string;
  requestId?: string;
  actor?: {
    userId?: string;
    userName?: string;
    role?: string;
  };
  action: string;
  entityType: string;
  entityId?: string;
  result: "success" | "failure";
  error?: string;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
  createdAt: string;
  updatedAt?: string;
};

export type AuditQuery = {
  action?: string;
  entityType?: string;
  entityId?: string;
  result?: "success" | "failure" | "all";
  actor?: string;
  search?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
};

export type AuditReport = {
  generatedAt: string;
  filters?: Record<string, unknown>;
  limit: number;
  totalMatchingRows: number;
  truncated: boolean;
  summary: {
    totalRows: number;
    firstSeenAt: string | null;
    lastSeenAt: string | null;
    byResult: Array<{ key: string; count: number }>;
    byAction: Array<{ key: string; count: number }>;
    byEntityType: Array<{ key: string; count: number }>;
    byActor: Array<{ key: string; count: number }>;
    byDay: Array<{ key: string; count: number }>;
  };
};

export type OperationalAlert = {
  _id: string;
  fingerprint?: string;
  status: "active" | "acknowledged" | "resolved";
  severity: "critical" | "warning" | "info";
  category: "failed_job" | "stale_backup" | "failed_health_check";
  message: string;
  entityRefs?: Array<{ type: string; id: string; label?: string; metadata?: Record<string, unknown> }>;
  firstDetectedAt?: string;
  lastDetectedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  acknowledgementNote?: string;
  resolvedAt?: string;
  details?: Record<string, unknown>;
  evidence?: unknown;
};

export type MonitoringSummary = {
  generatedAt: string;
  counts: {
    open: number;
    active: number;
    acknowledged: number;
    resolved: number;
    bySeverity: Record<string, number>;
    byCategory: Record<string, number>;
  };
  latestOpen: OperationalAlert[];
};

export type MonitoringRefreshResult = {
  refreshedAt: string;
  detected: number;
  resolved: number;
  fingerprints: string[];
};

export type DiagnosticsResult = {
  generatedAt: string;
  appMode: string;
  frontendOrigin: string;
  configuredClientOrigin: string;
  configuredClientOrigins: string[];
  currentApiBaseUrl: string;
  mongo: string;
  auth: {
    authEnabled: boolean;
    activeBackendUser: WhoAmIResult["user"];
    ownerDirectMode: boolean;
    localFallbackActive: boolean;
    currentUserDetectionResult: string;
  };
  sharePoint: {
    targetSiteUrl: string;
    preferredConnectorMode?: "browser-sharepoint" | "backend-sharepoint";
    writeEnabled: boolean;
    authCookieConfigured: boolean;
    authCookieNames?: string[];
    bearerTokenConfigured: boolean;
    unauthenticatedWriteBypassEnabled: boolean;
    capabilities: OperationCapabilities["sharePoint"] & {
      configured?: {
        writeEnabled: boolean;
        authCookieConfigured: boolean;
        bearerTokenConfigured: boolean;
        unauthenticatedWriteBypassEnabled: boolean;
      };
      writeVerified?: boolean;
    };
  };
  selectedSite?: Partial<Site> | null;
  paths?: {
    siteBaseUrl: string;
    siteRoot: string;
    libraryName: string;
    folderPath: string;
    finalRestUrl: string;
    resolvedPaths: Record<string, unknown>;
    checks: Array<Record<string, string>>;
  } | null;
  envWarnings: string[];
};

export type SharePointDiagnosticsCheck = {
  generatedAt: string;
  connectorMode?: "backend-sharepoint";
  appMode?: string;
  targetSharePointSiteUrl?: string;
  site?: Partial<Site> | null;
  configured?: Record<string, boolean | string[]>;
  currentUser?: Record<string, unknown>;
  readTest?: Record<string, unknown>;
  digestTest?: Record<string, unknown>;
  writeCapability?: Record<string, unknown>;
  paths?: { siteBaseUrl: string; checks: Array<Record<string, string>> };
  overall?: {
    reachable: boolean;
    authenticated: boolean;
    digestWorks: boolean;
    writeVerified: boolean;
    failedUrl?: string;
    failedStatus?: number;
    failedBackendErrorCode?: string;
    humanExplanation?: string;
    suggestedFix?: string;
  };
  ok?: boolean;
  errorCode?: string;
  humanExplanation?: string;
  suggestedFix?: string;
};

export const normalizePersonalNumber = (value: string) => normalizeHubPersonalNumber(value);
let sharePointCurrentUser: SharePointCurrentUserResult["user"] | null = null;

const canUseStorage = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const isLocalHostName = (host: string) =>
  ["localhost", "127.0.0.1", "::1"].includes(host) || host.endsWith(".localhost");

export const getClientRuntimeMode = () => {
  if (typeof window === "undefined") return "unknown" as const;
  return isLocalHostName(window.location.hostname) ? "local-dev" as const : "sharepoint-hosted" as const;
};

export function setSharePointCurrentUserForApi(user?: SharePointCurrentUserResult["user"] | null) {
  sharePointCurrentUser = user ?? null;
  clientLogger.info("auth", "SharePoint current user set for API headers", {
    hasUser: Boolean(sharePointCurrentUser),
    loginName: sharePointCurrentUser?.loginName,
    hasTitle: Boolean(sharePointCurrentUser?.title)
  });
}

const payloadData = (payload: any) => payload?.d || payload;

export function extractPersonalNumberFromSharePointCurrentUser(
  user?: SharePointCurrentUserResult["user"] | null
): string | null {
  const raw = [user?.loginName, user?.email]
    .filter(Boolean)
    .join(" ");

  const match = raw.match(/s?\d{6,8}/i);
  if (!match) return null;

  const digits = match[0].replace(/\D/g, "");
  if (!digits) return null;

  return `s${digits}`;
}

export async function detectSharePointCurrentUser(): Promise<SharePointCurrentUserResult> {
  const mode = getClientRuntimeMode();
  const url = "/_api/web/currentuser";

  if (mode === "local-dev") {
    return {
      mode,
      attempted: false,
      ok: false,
      url,
      error: "local-dev"
    };
  }

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json;odata=verbose" },
      credentials: "include",
      redirect: "follow"
    });
    const result: SharePointCurrentUserResult = {
      mode,
      attempted: true,
      ok: response.ok,
      url,
      status: response.status,
      statusText: response.statusText
    };

    if (!response.ok) {
      result.error = `sharepoint-current-user-failed:${response.status}`;
      setSharePointCurrentUserForApi(null);
      return result;
    }

    const payload = payloadData(await response.json());
    const user = {
      id: payload?.Id ?? payload?.id,
      title: String(payload?.Title || payload?.title || payload?.LoginName || payload?.loginName || "").trim(),
      loginName: String(payload?.LoginName || payload?.loginName || "").trim(),
      email: String(payload?.Email || payload?.email || "").trim()
    };
    result.user = user;
    setSharePointCurrentUserForApi(user);
    const detectedPersonalNumber = extractPersonalNumberFromSharePointCurrentUser(user);
    if (detectedPersonalNumber) {
      setHubPersonalNumber(detectedPersonalNumber);
    }
    return result;
  } catch (error) {
    const result = {
      mode,
      attempted: true,
      ok: false,
      url,
      error: error instanceof Error ? error.message : String(error)
    };
    setSharePointCurrentUserForApi(null);
    return result;
  }
}

export function getHubPersonalNumber() {
  if (!canUseStorage()) {
    clientLogger.warn("storage", "localStorage unavailable while reading personal number");
    return "";
  }
  const personalNumber = normalizePersonalNumber(window.localStorage.getItem(HUB_PERSONAL_NUMBER_STORAGE_KEY) || "");
  clientLogger.debug("storage", "Personal number read from localStorage", { hasPersonalNumber: Boolean(personalNumber) });
  return personalNumber;
}

export function setHubPersonalNumber(value: string) {
  const personalNumber = normalizePersonalNumber(value);
  if (!canUseStorage()) {
    clientLogger.warn("storage", "localStorage unavailable while saving personal number", { hasPersonalNumber: Boolean(personalNumber) });
    return personalNumber;
  }
  if (personalNumber) {
    window.localStorage.setItem(HUB_PERSONAL_NUMBER_STORAGE_KEY, personalNumber);
  } else {
    window.localStorage.removeItem(HUB_PERSONAL_NUMBER_STORAGE_KEY);
  }
  clientLogger.info("storage", "Personal number storage updated", { hasPersonalNumber: Boolean(personalNumber) });
  return personalNumber;
}

export function clearHubPersonalNumber() {
  if (canUseStorage()) {
    window.localStorage.removeItem(HUB_PERSONAL_NUMBER_STORAGE_KEY);
    clientLogger.info("storage", "Personal number cleared from localStorage");
  } else {
    clientLogger.warn("storage", "localStorage unavailable while clearing personal number");
  }
}

function withAuthHeaders(headersInit?: HeadersInit, requestId?: string) {
  const headers = new Headers(headersInit);
  if (requestId && !headers.has("x-request-id")) {
    headers.set("x-request-id", requestId);
  }
  const personalNumber =
    getHubPersonalNumber() ||
    extractPersonalNumberFromSharePointCurrentUser(sharePointCurrentUser) ||
    "";
  if (personalNumber && !headers.has("x-personal-number")) {
    headers.set("x-personal-number", personalNumber);
  }
  if (sharePointCurrentUser) {
    if (sharePointCurrentUser.id !== undefined && !headers.has("x-sharepoint-user-id")) {
      headers.set("x-sharepoint-user-id", String(sharePointCurrentUser.id));
    }
    if (sharePointCurrentUser.loginName && !headers.has("x-sharepoint-login-name")) {
      headers.set("x-sharepoint-login-name", sharePointCurrentUser.loginName);
    }
    if (sharePointCurrentUser.email && !headers.has("x-sharepoint-email")) {
      headers.set("x-sharepoint-email", sharePointCurrentUser.email);
    }
  }
  return headers;
}

async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const requestId = clientLogger.createRequestId();
  const url = input instanceof Request ? input.url : String(input);
  const method = init.method || (input instanceof Request ? input.method : "GET");
  const startedAt = performance.now();
  const headers = withAuthHeaders(init.headers, requestId);

  clientLogger.info("api", "API request started", {
    requestId,
    method,
    url,
    headers,
    ...clientLogger.describeRequestBody(init.body)
  });

  try {
    const response = await fetch(input, {
      ...init,
      headers
    });
    clientLogger.info("api", "API response received", {
      requestId,
      method,
      url,
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      serverRequestId: response.headers.get("x-request-id"),
      durationMs: Math.round(performance.now() - startedAt)
    });
    return response;
  } catch (error) {
    clientLogger.error("api", "API request failed", {
      requestId,
      method,
      url,
      durationMs: Math.round(performance.now() - startedAt),
      error
    });
    const message = error instanceof TypeError ? "שרת ה־API אינו זמין כרגע" : "שגיאת תקשורת מול השרת";
    throw new Error(message);
  }
}

async function parseResponse<T>(response: Response): Promise<ApiSuccess<T>> {
  const requestId = response.headers.get("x-request-id") || "";
  let payload: ApiSuccess<T> | ApiError;
  try {
    payload = (await response.json()) as ApiSuccess<T> | ApiError;
  } catch (error) {
    clientLogger.error("api", "API response JSON parse failed", {
      requestId,
      url: response.url,
      status: response.status,
      error
    });
    throw new Error("תגובת ה־API אינה JSON תקין");
  }

  clientLogger.debug("api", "API response payload parsed", {
    requestId,
    url: response.url,
    status: response.status,
    payload: clientLogger.isPayloadLoggingEnabled()
      ? payload
      : {
          ok: payload.ok,
          meta: (payload as ApiSuccess<T>).meta,
          error: (payload as ApiError).error
        }
  });

  if (!response.ok || payload.ok === false) {
    const message = (payload as ApiError).error?.message ?? "שגיאת API";
    clientLogger.warn("api", "API response rejected", {
      requestId,
      url: response.url,
      status: response.status,
      error: (payload as ApiError).error
    });
    throw new Error(message);
  }
  return payload as ApiSuccess<T>;
}

function asJson(body?: unknown) {
  return body === undefined
    ? undefined
    : {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      };
}

function queryString(params?: Record<string, unknown>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null || value === "" || value === "all") continue;
    query.set(key, String(value));
  }
  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}

async function parseDownload(response: Response) {
  if (!response.ok) {
    await parseResponse<never>(response);
  }
  const contentDisposition = response.headers.get("content-disposition") || "";
  const filenameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  return {
    blob: await response.blob(),
    filename: filenameMatch?.[1] || "sitebuilder-audit-export.csv",
    contentType: response.headers.get("content-type") || "text/csv"
  };
}

export const sitesApi = {
  authBootstrapStatus: async () => parseResponse<AuthBootstrapStatus>(await apiFetch(`${API_BASE_URL}/auth/bootstrap-status`)),
  loginPersonalNumber: async (personalNumber: string) => {
    const res = await parseResponse<AuthLoginResult>(
      await apiFetch(`${API_BASE_URL}/auth/login-personal-number`, {
        method: "POST",
        ...asJson({ personalNumber })
      })
    );
    setHubPersonalNumber(res.data.personalNumber);
    return res;
  },
  logoutPersonalNumber: async () => {
    clearHubPersonalNumber();
    return { ok: true as const, data: { authenticated: false } };
  },
  me: async () => parseResponse<WhoAmIResult>(await apiFetch(`${API_BASE_URL}/auth/me`)),
  health: async () => parseResponse<{ status: string; serverTime: string; mongo: string }>(await apiFetch(`${API_BASE_URL}/health`)),
  list: async (params?: Record<string, string>) => {
    const query = new URLSearchParams(params ?? {}).toString();
    const url = query ? `${API_BASE_URL}/sites?${query}` : `${API_BASE_URL}/sites`;
    const res = await parseResponse<Site[]>(await apiFetch(url));
    return { data: res.data, meta: res.meta as { count: number; stats: SitesStats } };
  },
  getById: async (id: string) => parseResponse<Site>(await apiFetch(`${API_BASE_URL}/sites/${id}`)),
  create: async (site: Partial<Site>) =>
    parseResponse<Site>(
      await apiFetch(`${API_BASE_URL}/sites`, {
        method: "POST",
        ...asJson(site)
      })
    ),
  update: async (id: string, site: Partial<Site>) =>
    parseResponse<Site>(
      await apiFetch(`${API_BASE_URL}/sites/${id}`, {
        method: "PATCH",
        ...asJson(site)
      })
    ),
  archive: async (id: string) => parseResponse<Site>(await apiFetch(`${API_BASE_URL}/sites/${id}`, { method: "DELETE" })),
  restoreFromArchive: async (id: string) =>
    parseResponse<Site>(
      await apiFetch(`${API_BASE_URL}/sites/${id}`, {
        method: "PATCH",
        ...asJson({ status: "active" })
      })
    ),
  deletePermanently: async (id: string) => parseResponse<Site>(await apiFetch(`${API_BASE_URL}/sites/${id}?force=true`, { method: "DELETE" })),
  updateManualHealth: async (id: string, health: SiteHealth) =>
    parseResponse<Site>(
      await apiFetch(`${API_BASE_URL}/sites/${id}/health-check/manual`, {
        method: "POST",
        ...asJson({ health })
      })
    ),
  runSharePointReadOnlyHealth: async (id: string) =>
    parseResponse<SharePointHealthResult>(
      await apiFetch(`${API_BASE_URL}/sites/${id}/health-check/sharepoint-readonly`, {
        method: "POST",
        ...asJson({})
      })
    ),
  recordBrowserSharePointHealth: async (id: string, result: SharePointHealthResult) =>
    parseResponse<SharePointHealthResult>(
      await apiFetch(`${API_BASE_URL}/sites/${id}/health-check/browser-sharepoint`, {
        method: "POST",
        ...asJson(result)
      })
    ),
  siteProvisionPlan: async (id: string) => parseResponse<SiteProvisionPlan>(await apiFetch(`${API_BASE_URL}/sites/${id}/provision/plan`)),
  queueSiteProvision: async (id: string) =>
    parseResponse<{ job: Job }>(
      await apiFetch(`${API_BASE_URL}/sites/${id}/provision`, {
        method: "POST",
        ...asJson({})
      })
    ),
  permissionsSetupPlan: async (id: string) => parseResponse<PermissionsSetupPlan>(await apiFetch(`${API_BASE_URL}/sites/${id}/permissions/plan`)),
  queuePermissionsSetup: async (id: string) =>
    parseResponse<{ job: Job }>(
      await apiFetch(`${API_BASE_URL}/sites/${id}/permissions/setup`, {
        method: "POST",
        ...asJson({})
      })
    ),
  siteBootstrapPlan: async (id: string, options?: SiteBootstrapOptions) => {
    const query = options ? new URLSearchParams(Object.entries(options).reduce<Record<string, string>>((acc, [key, value]) => {
      if (value !== undefined && value !== null && value !== "") acc[key] = String(value);
      return acc;
    }, {})).toString() : "";
    const suffix = query ? `?${query}` : "";
    return parseResponse<SiteBootstrapPlan>(await apiFetch(`${API_BASE_URL}/sites/${id}/bootstrap/plan${suffix}`));
  },
  queueSiteBootstrap: async (id: string, options?: SiteBootstrapOptions) =>
    parseResponse<{ job: Job; plan: SiteBootstrapPlan; requiresApproval?: boolean; approvalStatus?: string; message?: string }>(
      await apiFetch(`${API_BASE_URL}/sites/${id}/bootstrap`, {
        method: "POST",
        ...asJson(options ?? {})
      })
    ),

  releases: async () => parseResponse<Release[]>(await apiFetch(`${API_BASE_URL}/releases`)),
  createRelease: async (payload: { version?: string; releaseType: Release["releaseType"]; notes?: string; artifactRef?: string }) =>
    parseResponse<Release>(
      await apiFetch(`${API_BASE_URL}/releases`, {
        method: "POST",
        ...asJson(payload)
      })
    ),
  deployReleaseAll: async (releaseId: string, onlyOutdated = false, deployMode: DeployMode = "production-safe") =>
    parseResponse<{ queuedJobs: number }>(
      await apiFetch(`${API_BASE_URL}/releases/${releaseId}/deploy-all`, {
        method: "POST",
        ...asJson({ onlyOutdated, deployMode })
      })
    ),
  deploymentPlan: async (releaseId: string, payload: BatchDeployRequest) =>
    parseResponse<BatchDeployPlan>(
      await apiFetch(`${API_BASE_URL}/releases/${releaseId}/deployment-plan`, {
        method: "POST",
        ...asJson(payload)
      })
    ),
  deployBatch: async (releaseId: string, payload: BatchDeployRequest & { confirmNoPartial?: boolean }) =>
    parseResponse<BatchDeployResult>(
      await apiFetch(`${API_BASE_URL}/releases/${releaseId}/deploy-batch`, {
        method: "POST",
        ...asJson({ confirmNoPartial: true, ...payload })
      })
    ),
  validateReleaseArtifact: async (releaseId: string) =>
    parseResponse<ReleaseArtifactValidation>(await apiFetch(`${API_BASE_URL}/releases/${releaseId}/artifact/validate`)),
  releaseArtifactManifest: async (releaseId: string) =>
    parseResponse<ReleaseArtifactManifest>(await apiFetch(`${API_BASE_URL}/releases/${releaseId}/artifact/manifest`)),
  releaseArtifactFile: async (releaseId: string, relativePath: string): Promise<ReleaseArtifactFileResponse> => {
    const response = await apiFetch(`${API_BASE_URL}/releases/${releaseId}/artifact/file?path=${encodeURIComponent(relativePath)}`);
    if (!response.ok) {
      await parseResponse<never>(response);
    }
    const blob = await response.blob();
    return {
      blob,
      relativePath: decodeURIComponent(response.headers.get("x-artifact-relative-path") || encodeURIComponent(relativePath)),
      sizeBytes: Number(response.headers.get("x-artifact-size") || blob.size || 0),
      sha256: response.headers.get("x-artifact-sha256") || "",
      contentType: response.headers.get("content-type") || blob.type || "application/octet-stream"
    };
  },
  deploySiteVersion: async (siteId: string, releaseId: string, deployMode: DeployMode = "production-safe") =>
    parseResponse<{ job: Job; deployment?: SiteDeployment; requiresApproval?: boolean; approvalStatus?: string; message?: string; deployMode?: DeployMode; deployPolicy?: DeployPolicy }>(
      await apiFetch(`${API_BASE_URL}/sites/${siteId}/deploy-version`, {
        method: "POST",
        ...asJson({ releaseId, deployMode })
      })
    ),
  deploySiteVersionPlan: async (siteId: string, releaseId: string, deployMode: DeployMode = "production-safe", connectorMode: SharePointConnectorMode = "backend-sharepoint") =>
    parseResponse<DeployPlan>(
      await apiFetch(`${API_BASE_URL}/sites/${siteId}/deploy-version/plan`, {
        method: "POST",
        ...asJson({ releaseId, deployMode, connectorMode })
      })
    ),
  recordBrowserDeployEvidence: async (siteId: string, payload: BrowserDeployEvidencePayload) =>
    parseResponse<{ deployment: SiteDeployment; site: Site; summary: Record<string, unknown> }>(
      await apiFetch(`${API_BASE_URL}/sites/${siteId}/deployments/browser-evidence`, {
        method: "POST",
        ...asJson(payload)
      })
    ),
  rollbackSiteVersionPlan: async (siteId: string, releaseId: string, reason = "") =>
    parseResponse<RollbackPlan>(
      await apiFetch(`${API_BASE_URL}/sites/${siteId}/rollback-version/plan`, {
        method: "POST",
        ...asJson(reason ? { releaseId, reason } : { releaseId })
      })
    ),
  rollbackSiteVersion: async (siteId: string, releaseId: string, reason = "") =>
    parseResponse<{ job: Job; deployment: SiteDeployment; requiresApproval: boolean; approvalStatus: string; message: string }>(
      await apiFetch(`${API_BASE_URL}/sites/${siteId}/rollback-version`, {
        method: "POST",
        ...asJson(reason ? { releaseId, reason } : { releaseId })
      })
    ),
  siteDeployments: async (siteId: string) => parseResponse<SiteDeployment[]>(await apiFetch(`${API_BASE_URL}/sites/${siteId}/deployments`)),
  versionStatus: async () => parseResponse<any>(await apiFetch(`${API_BASE_URL}/version/status`)),
  nextVersion: async (fromVersion: string, releaseType: Release["releaseType"] = "patch") =>
    parseResponse<{ nextVersion: string }>(
      await apiFetch(`${API_BASE_URL}/version/next`, {
        method: "POST",
        ...asJson({ fromVersion, releaseType })
      })
    ),

  backups: async () => parseResponse<Backup[]>(await apiFetch(`${API_BASE_URL}/backups`)),
  siteBackups: async (siteId: string) => parseResponse<Backup[]>(await apiFetch(`${API_BASE_URL}/sites/${siteId}/backups`)),
  siteBackupInventory: async (siteId: string, includeFiles = true) =>
    parseResponse<SharePointBackupInventory>(
      await apiFetch(`${API_BASE_URL}/sites/${siteId}/backups/inventory?includeFiles=${includeFiles ? "true" : "false"}`)
    ),
  siteBackupPlan: async (siteId: string) =>
    parseResponse<BackupPlan>(
      await apiFetch(`${API_BASE_URL}/sites/${siteId}/backups/plan`, {
        method: "POST",
        ...asJson({})
      })
    ),
  runSiteBackup: async (siteId: string) =>
    parseResponse<{ job: Job }>(
      await apiFetch(`${API_BASE_URL}/sites/${siteId}/backups`, {
        method: "POST",
        ...asJson({})
      })
    ),
  runAllBackups: async () =>
    parseResponse<{ queued: number }>(
      await apiFetch(`${API_BASE_URL}/backups/run-all`, {
        method: "POST",
        ...asJson({})
      })
    ),
  allBackupPlans: async (siteIds?: string[]) =>
    parseResponse<AllBackupPlans>(
      await apiFetch(`${API_BASE_URL}/backups/plan-all`, {
        method: "POST",
        ...asJson(siteIds?.length ? { siteIds } : {})
      })
    ),
  verifyBackup: async (backupId: string, details = "") =>
    parseResponse<Backup>(
      await apiFetch(`${API_BASE_URL}/backups/${backupId}/verify`, {
        method: "POST",
        ...asJson({ details })
      })
    ),
  restorePlan: async (backupId: string, notes = "") =>
    parseResponse<Backup>(
      await apiFetch(`${API_BASE_URL}/backups/${backupId}/restore-plan`, {
        method: "POST",
        ...asJson({ notes })
      })
    ),
  queueRestoreBackup: async (backupId: string, notes = "") =>
    parseResponse<{ job: Job }>(
      await apiFetch(`${API_BASE_URL}/backups/${backupId}/restore`, {
        method: "POST",
        ...asJson(notes ? { notes } : {})
      })
    ),

  siteAdmins: async (siteId: string) => parseResponse<any>(await apiFetch(`${API_BASE_URL}/sites/${siteId}/admins`)),
  readLiveSiteAdmins: async (siteId: string) =>
    parseResponse<LiveAdminSourcesResult>(
      await apiFetch(`${API_BASE_URL}/sites/${siteId}/admins/live-read`, {
        method: "POST",
        ...asJson({})
      })
    ),
  syncSiteAdmins: async (siteId: string, mode: "read-only" | "sync" = "sync") =>
    parseResponse<{ job: Job }>(
      await apiFetch(`${API_BASE_URL}/sites/${siteId}/admins/sync`, {
        method: "POST",
        ...asJson({ mode })
      })
    ),
  addSiteAdmin: async (siteId: string, admin: Record<string, string>) =>
    parseResponse<any>(
      await apiFetch(`${API_BASE_URL}/sites/${siteId}/admins`, {
        method: "POST",
        ...asJson({ admin })
      })
    ),
  removeSiteAdmin: async (siteId: string, adminId: string, source?: "txt" | "siteCollection" | "ownersGroup") => {
    const query = source ? `?source=${encodeURIComponent(source)}` : "";
    return parseResponse<any>(await apiFetch(`${API_BASE_URL}/sites/${siteId}/admins/${encodeURIComponent(adminId)}${query}`, { method: "DELETE" }));
  },
  adminsDiff: async (siteId: string) => parseResponse<any>(await apiFetch(`${API_BASE_URL}/sites/${siteId}/admins/diff`)),
  queueAdminTxtRepairPlan: async (siteId: string, notes = "") =>
    parseResponse<AdminTxtRepairPlan>(
      await apiFetch(`${API_BASE_URL}/sites/${siteId}/admins/repair-txt/plan`, {
        method: "POST",
        ...asJson(notes ? { notes } : {})
      })
    ),
  queueAdminTxtRepair: async (siteId: string, notes = "") =>
    parseResponse<{ job: Job; plan: AdminTxtRepairPlan; requiresApproval: boolean; approvalStatus: string; message: string }>(
      await apiFetch(`${API_BASE_URL}/sites/${siteId}/admins/repair-txt`, {
        method: "POST",
        ...asJson(notes ? { notes } : {})
      })
    ),

  jobs: async () => parseResponse<Job[]>(await apiFetch(`${API_BASE_URL}/jobs`)),
  rerunJob: async (jobId: string) => parseResponse<Job>(await apiFetch(`${API_BASE_URL}/jobs/${jobId}/rerun`, { method: "POST" })),
  approveJob: async (jobId: string, reason = "") =>
    parseResponse<Job>(
      await apiFetch(`${API_BASE_URL}/jobs/${jobId}/approve`, {
        method: "POST",
        ...asJson(reason ? { reason } : {})
      })
    ),
  rejectJob: async (jobId: string, reason = "") =>
    parseResponse<Job>(
      await apiFetch(`${API_BASE_URL}/jobs/${jobId}/reject`, {
        method: "POST",
        ...asJson(reason ? { reason } : {})
      })
    ),
  audit: async (params?: AuditQuery) =>
    parseResponse<AuditLogRow[]>(await apiFetch(`${API_BASE_URL}/audit${queryString(params as Record<string, unknown>)}`)),
  auditReport: async (params?: AuditQuery) =>
    parseResponse<AuditReport>(await apiFetch(`${API_BASE_URL}/audit/report${queryString(params as Record<string, unknown>)}`)),
  auditExport: async (params?: AuditQuery & { format?: "csv" | "json" }) =>
    parseDownload(await apiFetch(`${API_BASE_URL}/audit/export${queryString({ format: "csv", ...(params ?? {}) })}`)),
  monitoringSummary: async () => parseResponse<MonitoringSummary>(await apiFetch(`${API_BASE_URL}/monitoring/summary`)),
  monitoringAlerts: async (params?: { status?: string; severity?: string; category?: string; limit?: number }) =>
    parseResponse<OperationalAlert[]>(await apiFetch(`${API_BASE_URL}/monitoring/alerts${queryString(params)}`)),
  refreshMonitoringAlerts: async () =>
    parseResponse<MonitoringRefreshResult>(
      await apiFetch(`${API_BASE_URL}/monitoring/alerts/refresh`, {
        method: "POST",
        ...asJson({})
      })
    ),
  acknowledgeMonitoringAlert: async (alertId: string, note = "") =>
    parseResponse<OperationalAlert>(
      await apiFetch(`${API_BASE_URL}/monitoring/alerts/${alertId}/acknowledge`, {
        method: "POST",
        ...asJson(note ? { note } : {})
      })
    ),
  operationCapabilities: async () => parseResponse<OperationCapabilities>(await apiFetch(`${API_BASE_URL}/operations/capabilities`)),
  siteOperationsSummary: async (siteId: string) => parseResponse<SiteOperationsSummary>(await apiFetch(`${API_BASE_URL}/operations/sites/${siteId}/summary`)),
  diagnostics: async (siteId?: string) => parseResponse<DiagnosticsResult>(await apiFetch(`${API_BASE_URL}/diagnostics${siteId ? `?siteId=${encodeURIComponent(siteId)}` : ""}`)),
  runSharePointDiagnostics: async (siteId?: string) =>
    parseResponse<SharePointDiagnosticsCheck>(
      await apiFetch(`${API_BASE_URL}/diagnostics/sharepoint-check`, {
        method: "POST",
        ...asJson(siteId ? { siteId } : {})
      })
    )
};
