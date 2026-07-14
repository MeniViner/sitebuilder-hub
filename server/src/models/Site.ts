import { InferSchemaType, Schema, model } from "mongoose";

const healthSchema = new Schema(
  {
    siteDbExists: { type: Boolean, default: false },
    usersDbExists: { type: Boolean, default: false },
    distExists: { type: Boolean, default: false },
    indexExists: { type: Boolean, default: false },
    assetsExists: { type: Boolean, default: false },
    txtFilesExist: { type: Boolean, default: false },
    runtimeConfigExists: { type: Boolean, default: false },
    runtimeConfigValid: { type: Boolean, default: false },
    dataBackendReachable: { type: Boolean, default: false },
    mongoRegistryOk: { type: Boolean, default: false },
    mongoCollectionOk: { type: Boolean, default: false },
    mongoSeedOk: { type: Boolean, default: false },
    mongoBackupsOk: { type: Boolean, default: false },
    mongoRevisionsAuditOk: { type: Boolean, default: false },
    adminsSyncOk: { type: Boolean, default: false },
    permissionsOk: { type: Boolean, default: false }
  },
  { _id: false }
);

const adminIdentitySchema = new Schema(
  {
    displayName: { type: String, default: "" },
    personalNumber: { type: String, default: "" },
    email: { type: String, default: "" },
    loginName: { type: String, default: "" }
  },
  { _id: false }
);

const adminDifferencesSchema = new Schema(
  {
    missingInTxt: { type: [String], default: [] },
    missingInSiteCollection: { type: [String], default: [] },
    missingInOwnersGroup: { type: [String], default: [] }
  },
  { _id: false }
);

const adminSourceStatusSchema = new Schema(
  {
    source: { type: String, enum: ["txt", "mongo", "siteCollection", "ownersGroup"], required: true },
    status: { type: String, enum: ["success", "failed", "skipped"], default: "skipped" },
    ok: { type: Boolean, default: false },
    count: { type: Number },
    rawCount: { type: Number },
    normalizedCount: { type: Number },
    httpStatus: { type: Number },
    httpStatusText: { type: String, default: "" },
    sourceUrl: { type: String, default: "" },
    readAt: { type: Date },
    errorCode: { type: String, default: "" },
    errorMessage: { type: String, default: "" },
    error: { type: String, default: "" },
    warnings: { type: [String], default: [] }
  },
  { _id: false }
);

const sharePointStatusSchema = new Schema(
  {
    documentLibrariesStatus: {
      type: String,
      enum: ["unknown", "ok", "warning", "failed"],
      default: "unknown"
    },
    permissionsStatus: {
      type: String,
      enum: ["unknown", "ok", "warning", "failed"],
      default: "unknown"
    },
    deployStatus: {
      type: String,
      enum: ["idle", "queued", "running", "succeeded", "failed"],
      default: "idle"
    }
  },
  { _id: false }
);

const runtimeConfigStatusSchema = new Schema(
  {
    path: { type: String, default: "" },
    url: { type: String, default: "" },
    readStatus: {
      type: String,
      enum: ["unknown", "configured", "missing", "invalid", "mismatch", "auth-blocked", "error", "browser-required"],
      default: "unknown"
    },
    storageBackend: { type: String, enum: ["txt", "mongo", "unknown", ""], default: "" },
    backendApiUrl: { type: String, default: "" },
    backendApiUrlHost: { type: String, default: "" },
    builderSiteId: { type: String, default: "" },
    apiKeyStatus: { type: String, enum: ["unknown", "configured", "missing", "invalid"], default: "unknown" },
    belongsToSite: { type: Boolean, default: false },
    warnings: { type: [String], default: [] },
    checkedAt: { type: Date },
    evidence: { type: Schema.Types.Mixed, default: undefined }
  },
  { _id: false }
);

const mongoBackendStatusSchema = new Schema(
  {
    backendApiUrl: { type: String, default: "" },
    backendApiUrlHost: { type: String, default: "" },
    apiKeyRef: { type: String, default: "" },
    apiKeyConfigured: { type: Boolean, default: false },
    mongoEnvironment: { type: String, default: "" },
    mongoDatabase: { type: String, default: "" },
    siteId: { type: String, default: "" },
    safeCollectionName: { type: String, default: "" },
    backendReachable: { type: Boolean, default: false },
    registryStatus: { type: String, enum: ["unknown", "ok", "missing", "mismatch", "error"], default: "unknown" },
    collectionStatus: { type: String, enum: ["unknown", "ok", "missing", "error"], default: "unknown" },
    seedStatus: { type: String, enum: ["unknown", "ok", "missing", "partial", "error"], default: "unknown" },
    adminsStatus: { type: String, enum: ["unknown", "ok", "missing", "error"], default: "unknown" },
    backupsStatus: { type: String, enum: ["unknown", "ok", "missing", "error"], default: "unknown" },
    revisionsAuditStatus: { type: String, enum: ["unknown", "ok", "unsupported", "error"], default: "unknown" },
    expectedScopes: { type: [String], default: [] },
    missingScopes: { type: [String], default: [] },
    missingDocs: { type: [String], default: [] },
    warnings: { type: [String], default: [] },
    checkedAt: { type: Date },
    evidence: { type: Schema.Types.Mixed, default: undefined }
  },
  { _id: false }
);

const maintenanceTaskScheduleSchema = (defaultIntervalMinutes: number) =>
  new Schema(
    {
      enabled: { type: Boolean, default: false },
      paused: { type: Boolean, default: false },
      frequency: { type: String, enum: ["daily", "weekly", "monthly", "custom"], default: "daily" },
      daysOfWeek: { type: [Number], default: [] },
      dayOfMonth: { type: Number, min: 1, max: 31 },
      timeOfDay: { type: String, default: "02:00" },
      timezone: { type: String, default: "Asia/Jerusalem" },
      intervalMinutes: { type: Number, default: defaultIntervalMinutes, min: 5 },
      retention: {
        type: new Schema(
          {
            mode: { type: String, enum: ["none", "count", "days", "count-and-days"], default: "count" },
            keepLast: { type: Number, default: 14, min: 1 },
            deleteOlderThanDays: { type: Number, default: 90, min: 1 }
          },
          { _id: false }
        ),
        default: () => ({ mode: "count", keepLast: 14, deleteOlderThanDays: 90 })
      },
      executionMode: {
        type: String,
        enum: ["browser-manual", "builder-backend", "backend-service-auth-required", "not-configured"],
        default: "not-configured"
      },
      nextRunAt: { type: Date },
      lastRunAt: { type: Date },
      lastRunStatus: {
        type: String,
        enum: ["unknown", "queued", "succeeded", "failed", "blocked"],
        default: "unknown"
      },
      lastQueuedAt: { type: Date },
      lastJobId: { type: String, default: "" },
      failureCount: { type: Number, default: 0 },
      lastError: { type: String, default: "" },
      savedAt: { type: Date },
      savedBy: { type: String, default: "" }
    },
    { _id: false }
  );

const maintenanceScheduleSchema = new Schema(
  {
    backup: { type: maintenanceTaskScheduleSchema(24 * 60), default: () => ({ intervalMinutes: 24 * 60 }) },
    healthCheck: { type: maintenanceTaskScheduleSchema(60), default: () => ({ intervalMinutes: 60 }) }
  },
  { _id: false }
);

const txtFilePathsSchema = new Schema(
  {
    masterConfig: { type: String, default: "" },
    users: { type: String, default: "" },
    events: { type: String, default: "" },
    navigation: { type: String, default: "" },
    siteContent: { type: String, default: "" },
    theme: { type: String, default: "" },
    widgets: { type: String, default: "" },
    externalLinks: { type: String, default: "" },
    gantt: { type: String, default: "" }
  },
  { _id: false }
);

const resolvedPathsSchema = new Schema(
  {
    host: { type: String, default: "" },
    siteCode: { type: String, default: "" },
    siteRoot: { type: String, default: "" },
    sharePointSiteUrl: { type: String, default: "" },
    siteDbLibrary: { type: String, default: "" },
    usersDbLibrary: { type: String, default: "" },
    bootstrapLibrary: { type: String, default: "" },
    bootstrapFolder: { type: String, default: "" },
    widgetsDbTarget: { type: String, enum: ["users", "site"], default: "users" },
    siteDbRoot: { type: String, default: "" },
    usersDbRoot: { type: String, default: "" },
    siteAssetsRoot: { type: String, default: "" },
    imagesRoot: { type: String, default: "" },
    finalDistRoot: { type: String, default: "" },
    finalAppUrl: { type: String, default: "" },
    bootstrapRoot: { type: String, default: "" },
    bootstrapDistRoot: { type: String, default: "" },
    bootstrapUrl: { type: String, default: "" },
    backupsRoot: { type: String, default: "" },
    runtimeConfigPath: { type: String, default: "" },
    runtimeConfigUrl: { type: String, default: "" },
    deployManifestFile: { type: String, default: "" },
    permissionsMarkerFile: { type: String, default: "" },
    txtFiles: { type: txtFilePathsSchema, default: () => ({}) }
  },
  { _id: false }
);

const recoveryStateSchema = new Schema(
  {
    backupCapability: {
      type: new Schema(
        {
          status: { type: String, enum: ["unknown", "ready", "blocked", "error"], default: "unknown" },
          sourceType: { type: String, enum: ["txt-sharepoint", "mongo-builder", "unknown"], default: "unknown" },
          connectorMode: {
            type: String,
            enum: ["browser-sharepoint", "builder-backend", "backend-service-auth-required", "unknown"],
            default: "unknown"
          },
          checkedAt: { type: Date },
          checkedBy: { type: String, default: "" },
          canInventory: { type: Boolean, default: false },
          canRunManualBackup: { type: Boolean, default: false },
          canRunScheduledBackup: { type: Boolean, default: false },
          canRestore: { type: Boolean, default: false },
          blockers: { type: [String], default: [] },
          nextStep: { type: String, default: "" },
          evidence: { type: Schema.Types.Mixed, default: undefined }
        },
        { _id: false }
      ),
      default: () => ({})
    },
    latestInventoryRefresh: {
      type: new Schema(
        {
          status: { type: String, enum: ["unknown", "success", "failed", "partial"], default: "unknown" },
          sourceType: { type: String, enum: ["txt-sharepoint", "mongo-builder", "unknown"], default: "unknown" },
          connectorMode: {
            type: String,
            enum: ["browser-sharepoint", "builder-backend", "backend-service-auth-required", "unknown"],
            default: "unknown"
          },
          checkedAt: { type: Date },
          checkedBy: { type: String, default: "" },
          rootPath: { type: String, default: "" },
          foldersCount: { type: Number },
          filesCount: { type: Number },
          knownSizeBytes: { type: Number },
          backupRecordsCount: { type: Number },
          verificationStatus: { type: String, enum: ["unknown", "verified", "warning", "failed"], default: "unknown" },
          blocker: { type: String, default: "" },
          error: { type: String, default: "" },
          evidence: { type: Schema.Types.Mixed, default: undefined }
        },
        { _id: false }
      ),
      default: () => ({})
    },
    lastSuccessfulInventorySnapshot: { type: Schema.Types.Mixed, default: undefined },
    mongoBackupInventory: {
      type: new Schema(
        {
          status: { type: String, enum: ["unknown", "success", "failed", "blocked"], default: "unknown" },
          checkedAt: { type: Date },
          records: { type: [Schema.Types.Mixed], default: [] },
          summary: { type: Schema.Types.Mixed, default: undefined },
          evidence: { type: Schema.Types.Mixed, default: undefined }
        },
        { _id: false }
      ),
      default: () => ({})
    },
    lastBackupEvidence: {
      type: new Schema(
        {
          connectorMode: { type: String, default: "" },
          backupId: { type: String, default: "" },
          status: { type: String, default: "" },
          recordedAt: { type: Date },
          filesCount: { type: Number },
          verifiedFilesCount: { type: Number },
          failedFilesCount: { type: Number },
          evidenceRef: { type: String, default: "" },
          summary: { type: Schema.Types.Mixed, default: undefined }
        },
        { _id: false }
      ),
      default: () => ({})
    },
    restoreAudit: {
      type: new Schema(
        {
          readinessStatus: { type: String, enum: ["unknown", "ready", "blocked"], default: "unknown" },
          lastReviewAt: { type: Date },
          lastRestoreAt: { type: Date },
          lastJobId: { type: String, default: "" },
          blockers: { type: [String], default: [] },
          lastPlan: { type: Schema.Types.Mixed, default: undefined }
        },
        { _id: false }
      ),
      default: () => ({})
    }
  },
  { _id: false }
);

const siteSchema = new Schema(
  {
    siteCode: { type: String, required: true, trim: true },
    siteIdentityKey: { type: String, trim: true },
    displayName: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    environment: {
      type: String,
      enum: ["unknown", "local", "dev", "test", "staging", "production"],
      default: "unknown"
    },
    builderSiteId: { type: String, trim: true, default: "" },
    storageBackend: { type: String, enum: ["txt", "mongo", "unknown"], default: "unknown", index: true },
    lifecycleStatus: {
      type: String,
      enum: ["unknown", "draft", "planned", "provisioning", "partially-created", "ready", "failed", "archived"],
      default: "draft"
    },
    creationMode: {
      type: String,
      enum: ["unknown", "track-existing", "create-new", "import", "migration"],
      default: "unknown"
    },
    provisioningStatus: {
      type: String,
      enum: ["unknown", "not-started", "planned", "running", "partially-created", "succeeded", "failed"],
      default: "unknown"
    },

    sharePointHost: { type: String, default: "portal.army.idf" },
    sharePointSiteUrl: { type: String, required: true },
    finalAppUrl: { type: String, default: "" },
    bootstrapUrl: { type: String, default: "" },
    runtimeConfigPath: { type: String, default: "" },
    runtimeConfigUrl: { type: String, default: "" },

    siteDbLibrary: { type: String, default: "" },
    usersDbLibrary: { type: String, default: "" },
    bootstrapLibrary: { type: String, default: "" },
    bootstrapFolder: { type: String, default: "" },
    widgetsDbTarget: { type: String, enum: ["users", "site"], default: "users" },
    resolvedPaths: { type: resolvedPathsSchema, default: () => ({}) },

    ownerName: { type: String, default: "" },
    ownerPersonalNumber: { type: String, default: "" },
    ownerEmail: { type: String, default: "" },
    ownerPhone: { type: String, default: "" },
    unitName: { type: String, default: "" },

    status: { type: String, enum: ["active", "warning", "failed", "draft", "archived"], default: "draft" },

    version: { type: String, default: "0.1.0" },
    currentVersion: { type: String, default: "0.1.0" },
    targetVersion: { type: String, default: "" },
    latestKnownVersion: { type: String, default: "" },
    versionStatus: {
      type: String,
      enum: ["unknown", "up_to_date", "outdated", "updating", "failed"],
      default: "unknown"
    },
    lastVersionCheckAt: { type: Date },
    lastUpgradeAt: { type: Date },

    storageMb: { type: Number, default: 0 },
    filesCount: { type: Number, default: 0 },

    backupStatus: {
      type: String,
      enum: ["unknown", "idle", "queued", "running", "succeeded", "failed"],
      default: "unknown"
    },
    lastBackupAt: { type: Date },
    lastBackupId: { type: String, default: "" },
    backupCount: { type: Number, default: 0 },
    backupStorageMb: { type: Number, default: 0 },

    adminsCount: { type: Number, default: 0 },
    lastAdminSyncAt: { type: Date },
    lastAdminLiveReadAt: { type: Date },
    lastAdminLiveReadSource: { type: String, default: "" },
    adminSyncStatus: {
      type: String,
      enum: ["unknown", "idle", "running", "succeeded", "failed"],
      default: "unknown"
    },

    txtAdmins: { type: [adminIdentitySchema], default: [] },
    siteCollectionAdmins: { type: [adminIdentitySchema], default: [] },
    ownersGroupAdmins: { type: [adminIdentitySchema], default: [] },
    adminDifferences: { type: adminDifferencesSchema, default: () => ({}) },
    adminSourceStatus: { type: [adminSourceStatusSchema], default: [] },
    adminSourceCounts: { type: Schema.Types.Mixed, default: () => ({}) },
    authoritativeAdminSource: { type: String, enum: ["txt", "mongo", "unknown"], default: "unknown" },

    lastHealthCheckAt: { type: Date },
    lastSharePointHostingVerificationAt: { type: Date },
    sharePointPathEvidence: { type: Schema.Types.Mixed, default: undefined },
    runtimeConfigStatus: { type: runtimeConfigStatusSchema, default: () => ({}) },
    lastRuntimeConfigCheckAt: { type: Date },
    dataBackendStatus: {
      type: String,
      enum: ["unknown", "ok", "warning", "failed"],
      default: "unknown"
    },
    backendApiUrl: { type: String, default: "" },
    builderApiKeyRef: { type: String, default: "" },
    mongoEnvironment: { type: String, default: "" },
    mongoDatabase: { type: String, default: "" },
    mongoSiteId: { type: String, default: "" },
    safeCollectionName: { type: String, default: "" },
    mongoBackendStatus: { type: mongoBackendStatusSchema, default: () => ({}) },
    lastMongoHealthCheckAt: { type: Date },
    lastDeployAt: { type: Date },
    lastError: { type: String, default: "" },
    notes: { type: String, default: "" },
    health: { type: healthSchema, default: () => ({}) },

    maintenanceSchedule: { type: maintenanceScheduleSchema, default: () => ({}) },
    recoveryState: { type: recoveryStateSchema, default: () => ({}) },
    sharePointStatus: { type: sharePointStatusSchema, default: () => ({}) }
  },
  { timestamps: true }
);

siteSchema.index({ siteCode: 1 });
siteSchema.index({ storageBackend: 1, updatedAt: -1 });
siteSchema.index({ builderSiteId: 1 });
siteSchema.index({ mongoSiteId: 1, safeCollectionName: 1 });
siteSchema.index(
  { siteIdentityKey: 1 },
  { unique: true, name: "siteIdentityKey_1", partialFilterExpression: { siteIdentityKey: { $exists: true } } }
);
siteSchema.index({ status: 1, updatedAt: -1 });
siteSchema.index({ versionStatus: 1, updatedAt: -1 });
siteSchema.index({ backupStatus: 1, updatedAt: -1 });
siteSchema.index({ "maintenanceSchedule.backup.enabled": 1, "maintenanceSchedule.backup.nextRunAt": 1 });
siteSchema.index({ "maintenanceSchedule.healthCheck.enabled": 1, "maintenanceSchedule.healthCheck.nextRunAt": 1 });

export type SiteDocument = InferSchemaType<typeof siteSchema>;
export type SiteHealth = InferSchemaType<typeof healthSchema>;
export type SiteAdminIdentity = InferSchemaType<typeof adminIdentitySchema>;
export const Site = model("Site", siteSchema);
