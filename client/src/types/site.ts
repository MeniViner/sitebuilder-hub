export type SiteStatus = "active" | "warning" | "failed" | "draft" | "archived";
export type DerivedHealthStatus = "healthy" | "warning" | "failed" | "unknown";

export interface SiteHealth {
  siteDbExists?: boolean;
  usersDbExists?: boolean;
  distExists?: boolean;
  indexExists?: boolean;
  assetsExists?: boolean;
  txtFilesExist?: boolean;
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

export interface Site {
  _id: string;
  siteCode: string;
  displayName: string;
  description?: string;
  sharePointHost?: string;
  sharePointSiteUrl: string;
  finalAppUrl?: string;
  bootstrapUrl?: string;
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
  adminSyncStatus?: "unknown" | "idle" | "running" | "succeeded" | "failed";
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
