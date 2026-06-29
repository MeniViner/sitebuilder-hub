export type SiteStatus = "active" | "warning" | "failed" | "draft" | "archived";
export type DerivedHealthStatus = "healthy" | "warning" | "failed" | "unknown";
export type SiteEnvironment = "unknown" | "local" | "dev" | "test" | "staging" | "production";
export type StorageBackend = "txt" | "mongo" | "unknown";

export interface SiteHealth {
  siteDbExists?: boolean;
  usersDbExists?: boolean;
  distExists?: boolean;
  indexExists?: boolean;
  assetsExists?: boolean;
  txtFilesExist?: boolean;
  runtimeConfigExists?: boolean;
  runtimeConfigValid?: boolean;
  dataBackendReachable?: boolean;
  mongoRegistryOk?: boolean;
  mongoCollectionOk?: boolean;
  mongoSeedOk?: boolean;
  mongoBackupsOk?: boolean;
  mongoRevisionsAuditOk?: boolean;
  adminsSyncOk?: boolean;
  permissionsOk?: boolean;
}

export interface SiteMaintenanceTaskSchedule {
  enabled?: boolean;
  intervalMinutes?: number;
  nextRunAt?: string;
  lastQueuedAt?: string;
  lastJobId?: string;
  failureCount?: number;
  lastError?: string;
}

export interface SiteMaintenanceSchedule {
  backup?: SiteMaintenanceTaskSchedule;
  healthCheck?: SiteMaintenanceTaskSchedule;
}

export interface SiteAdminIdentity {
  displayName?: string;
  personalNumber?: string;
  email?: string;
  loginName?: string;
}

export interface Site {
  _id: string;
  siteCode: string;
  siteIdentityKey?: string;
  displayName: string;
  description?: string;
  environment?: SiteEnvironment;
  builderSiteId?: string;
  storageBackend?: StorageBackend;
  lifecycleStatus?: "unknown" | "draft" | "planned" | "provisioning" | "partially-created" | "ready" | "failed" | "archived";
  creationMode?: "unknown" | "track-existing" | "create-new" | "import" | "migration";
  provisioningStatus?: "unknown" | "not-started" | "planned" | "running" | "partially-created" | "succeeded" | "failed";
  sharePointHost?: string;
  sharePointSiteUrl: string;
  finalAppUrl?: string;
  bootstrapUrl?: string;
  runtimeConfigPath?: string;
  runtimeConfigUrl?: string;
  siteDbLibrary?: string;
  usersDbLibrary?: string;
  bootstrapLibrary?: string;
  bootstrapFolder?: string;
  widgetsDbTarget?: "users" | "site";
  resolvedPaths?: {
    host?: string;
    siteCode?: string;
    siteRoot?: string;
    sharePointSiteUrl?: string;
    siteDbLibrary?: string;
    usersDbLibrary?: string;
    bootstrapLibrary?: string;
    bootstrapFolder?: string;
    widgetsDbTarget?: "users" | "site";
    siteDbRoot?: string;
    usersDbRoot?: string;
    siteAssetsRoot?: string;
    imagesRoot?: string;
    finalDistRoot?: string;
    finalAppUrl?: string;
    bootstrapRoot?: string;
    bootstrapDistRoot?: string;
    bootstrapUrl?: string;
    backupsRoot?: string;
    runtimeConfigPath?: string;
    runtimeConfigUrl?: string;
    deployManifestFile?: string;
    permissionsMarkerFile?: string;
    txtFiles?: {
      masterConfig?: string;
      users?: string;
      events?: string;
      navigation?: string;
      siteContent?: string;
      theme?: string;
      widgets?: string;
      externalLinks?: string;
      gantt?: string;
    };
  };
  ownerName?: string;
  ownerPersonalNumber?: string;
  ownerEmail?: string;
  ownerPhone?: string;
  unitName?: string;
  status: SiteStatus;
  version?: string;
  currentVersion?: string;
  targetVersion?: string;
  latestKnownVersion?: string;
  versionStatus?: "unknown" | "up_to_date" | "outdated" | "updating" | "failed";
  backupStatus?: "unknown" | "idle" | "queued" | "running" | "succeeded" | "failed";
  backupCount?: number;
  backupStorageMb?: number;
  storageMb?: number;
  filesCount?: number;
  adminsCount?: number;
  lastHealthCheckAt?: string;
  lastDeployAt?: string;
  lastVersionCheckAt?: string;
  lastUpgradeAt?: string;
  lastBackupAt?: string;
  lastBackupId?: string;
  lastAdminSyncAt?: string;
  lastAdminLiveReadAt?: string;
  lastAdminLiveReadSource?: string;
  adminSyncStatus?: "unknown" | "idle" | "running" | "succeeded" | "failed";
  txtAdmins?: SiteAdminIdentity[];
  siteCollectionAdmins?: SiteAdminIdentity[];
  ownersGroupAdmins?: SiteAdminIdentity[];
  adminSourceStatus?: Array<{
    source: "txt" | "mongo" | "siteCollection" | "ownersGroup";
    status?: "success" | "failed" | "skipped";
    ok?: boolean;
    count?: number;
    rawCount?: number;
    normalizedCount?: number;
    httpStatus?: number;
    httpStatusText?: string;
    sourceUrl?: string;
    readAt?: string;
    errorCode?: string;
    errorMessage?: string;
    error?: string;
    warnings?: string[];
  }>;
  adminSourceCounts?: Record<string, number | null>;
  authoritativeAdminSource?: "txt" | "mongo" | "unknown";
  lastSharePointHostingVerificationAt?: string;
  sharePointPathEvidence?: unknown;
  runtimeConfigStatus?: {
    path?: string;
    url?: string;
    readStatus?: "unknown" | "configured" | "missing" | "invalid" | "mismatch" | "auth-blocked" | "error";
    storageBackend?: StorageBackend | "";
    backendApiUrl?: string;
    backendApiUrlHost?: string;
    builderSiteId?: string;
    apiKeyStatus?: "unknown" | "configured" | "missing" | "invalid";
    belongsToSite?: boolean;
    warnings?: string[];
    checkedAt?: string;
    evidence?: unknown;
  };
  lastRuntimeConfigCheckAt?: string;
  dataBackendStatus?: "unknown" | "ok" | "warning" | "failed";
  backendApiUrl?: string;
  builderApiKeyRef?: string;
  mongoEnvironment?: string;
  mongoDatabase?: string;
  mongoSiteId?: string;
  safeCollectionName?: string;
  mongoBackendStatus?: {
    backendApiUrl?: string;
    backendApiUrlHost?: string;
    apiKeyRef?: string;
    apiKeyConfigured?: boolean;
    mongoEnvironment?: string;
    mongoDatabase?: string;
    siteId?: string;
    safeCollectionName?: string;
    backendReachable?: boolean;
    registryStatus?: "unknown" | "ok" | "missing" | "mismatch" | "error";
    collectionStatus?: "unknown" | "ok" | "missing" | "error";
    seedStatus?: "unknown" | "ok" | "missing" | "partial" | "error";
    adminsStatus?: "unknown" | "ok" | "missing" | "error";
    backupsStatus?: "unknown" | "ok" | "missing" | "error";
    revisionsAuditStatus?: "unknown" | "ok" | "unsupported" | "error";
    expectedScopes?: string[];
    missingScopes?: string[];
    missingDocs?: string[];
    warnings?: string[];
    checkedAt?: string;
    evidence?: unknown;
  };
  lastMongoHealthCheckAt?: string;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
  notes?: string;
  health?: SiteHealth;
  maintenanceSchedule?: SiteMaintenanceSchedule;
  derivedHealthStatus: DerivedHealthStatus;
}

export interface SitesStats {
  total: number;
  active: number;
  warning: number;
  failed: number;
  archived: number;
  totalStorageMb: number;
  health: Record<DerivedHealthStatus, number>;
}
