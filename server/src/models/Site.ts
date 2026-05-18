import { InferSchemaType, Schema, model } from "mongoose";

const healthSchema = new Schema(
  {
    siteDbExists: { type: Boolean, default: false },
    usersDbExists: { type: Boolean, default: false },
    distExists: { type: Boolean, default: false },
    indexExists: { type: Boolean, default: false },
    assetsExists: { type: Boolean, default: false },
    txtFilesExist: { type: Boolean, default: false },
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

const maintenanceTaskScheduleSchema = (defaultIntervalMinutes: number) =>
  new Schema(
    {
      enabled: { type: Boolean, default: false },
      intervalMinutes: { type: Number, default: defaultIntervalMinutes, min: 5 },
      nextRunAt: { type: Date },
      lastQueuedAt: { type: Date },
      lastJobId: { type: String, default: "" },
      failureCount: { type: Number, default: 0 },
      lastError: { type: String, default: "" }
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
    externalLinks: { type: String, default: "" }
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
    deployManifestFile: { type: String, default: "" },
    permissionsMarkerFile: { type: String, default: "" },
    txtFiles: { type: txtFilePathsSchema, default: () => ({}) }
  },
  { _id: false }
);

const siteSchema = new Schema(
  {
    siteCode: { type: String, required: true, unique: true, trim: true },
    displayName: { type: String, required: true, trim: true },
    description: { type: String, default: "" },

    sharePointHost: { type: String, default: "portal.army.idf" },
    sharePointSiteUrl: { type: String, required: true },
    finalAppUrl: { type: String, default: "" },
    bootstrapUrl: { type: String, default: "" },

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
    adminSyncStatus: {
      type: String,
      enum: ["unknown", "idle", "running", "succeeded", "failed"],
      default: "unknown"
    },

    txtAdmins: { type: [adminIdentitySchema], default: [] },
    siteCollectionAdmins: { type: [adminIdentitySchema], default: [] },
    ownersGroupAdmins: { type: [adminIdentitySchema], default: [] },
    adminDifferences: { type: adminDifferencesSchema, default: () => ({}) },

    lastHealthCheckAt: { type: Date },
    lastDeployAt: { type: Date },
    lastError: { type: String, default: "" },
    notes: { type: String, default: "" },
    health: { type: healthSchema, default: () => ({}) },

    maintenanceSchedule: { type: maintenanceScheduleSchema, default: () => ({}) },
    sharePointStatus: { type: sharePointStatusSchema, default: () => ({}) }
  },
  { timestamps: true }
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
