import { z } from "zod";

const statusEnum = z.enum(["active", "warning", "failed", "draft", "archived"]);
const environmentEnum = z.enum(["unknown", "local", "dev", "test", "staging", "production"]);
const storageBackendEnum = z.enum(["txt", "mongo", "unknown"]);
const lifecycleStatusEnum = z.enum(["unknown", "draft", "planned", "provisioning", "partially-created", "ready", "failed", "archived"]);
const creationModeEnum = z.enum(["unknown", "track-existing", "create-new", "import", "migration"]);
const provisioningStatusEnum = z.enum(["unknown", "not-started", "planned", "running", "partially-created", "succeeded", "failed"]);

const optionalUrl = z
  .string()
  .trim()
  .optional()
  .refine((value) => !value || /^https?:\/\//i.test(value), "יש להזין כתובת URL תקינה");

const optionalNonNegative = z.coerce.number().optional().refine((value) => value === undefined || value >= 0, "הערך חייב להיות 0 או יותר");

const healthSchema = z.object({
  siteDbExists: z.boolean().optional(),
  usersDbExists: z.boolean().optional(),
  distExists: z.boolean().optional(),
  indexExists: z.boolean().optional(),
  assetsExists: z.boolean().optional(),
  txtFilesExist: z.boolean().optional(),
  runtimeConfigExists: z.boolean().optional(),
  runtimeConfigValid: z.boolean().optional(),
  dataBackendReachable: z.boolean().optional(),
  mongoRegistryOk: z.boolean().optional(),
  mongoCollectionOk: z.boolean().optional(),
  mongoSeedOk: z.boolean().optional(),
  mongoBackupsOk: z.boolean().optional(),
  mongoRevisionsAuditOk: z.boolean().optional(),
  adminsSyncOk: z.boolean().optional(),
  permissionsOk: z.boolean().optional()
});

const adminIdentitySchema = z.object({
  displayName: z.string().optional(),
  personalNumber: z.string().optional(),
  email: z.string().optional(),
  loginName: z.string().optional()
});

const maintenanceTaskScheduleSchema = z.object({
  enabled: z.boolean().optional(),
  intervalMinutes: z.coerce.number().int().min(5).max(60 * 24 * 365).optional(),
  nextRunAt: z.coerce.date().optional().nullable(),
  lastQueuedAt: z.coerce.date().optional().nullable(),
  lastJobId: z.string().optional(),
  failureCount: optionalNonNegative,
  lastError: z.string().optional()
});

const maintenanceScheduleSchema = z.object({
  backup: maintenanceTaskScheduleSchema.optional(),
  healthCheck: maintenanceTaskScheduleSchema.optional()
});

const runtimeConfigStatusSchema = z.object({
  path: z.string().optional(),
  url: z.string().optional(),
  readStatus: z.enum(["unknown", "configured", "missing", "invalid", "mismatch", "auth-blocked", "error"]).optional(),
  storageBackend: z.enum(["txt", "mongo", "unknown", ""]).optional(),
  backendApiUrl: z.string().optional(),
  backendApiUrlHost: z.string().optional(),
  builderSiteId: z.string().optional(),
  apiKeyStatus: z.enum(["unknown", "configured", "missing", "invalid"]).optional(),
  belongsToSite: z.boolean().optional(),
  warnings: z.array(z.string()).optional(),
  checkedAt: z.coerce.date().optional().nullable(),
  evidence: z.unknown().optional()
});

const mongoBackendStatusSchema = z.object({
  backendApiUrl: z.string().optional(),
  backendApiUrlHost: z.string().optional(),
  apiKeyRef: z.string().optional(),
  apiKeyConfigured: z.boolean().optional(),
  mongoEnvironment: z.string().optional(),
  mongoDatabase: z.string().optional(),
  siteId: z.string().optional(),
  safeCollectionName: z.string().optional(),
  backendReachable: z.boolean().optional(),
  registryStatus: z.enum(["unknown", "ok", "missing", "mismatch", "error"]).optional(),
  collectionStatus: z.enum(["unknown", "ok", "missing", "error"]).optional(),
  seedStatus: z.enum(["unknown", "ok", "missing", "partial", "error"]).optional(),
  adminsStatus: z.enum(["unknown", "ok", "missing", "error"]).optional(),
  backupsStatus: z.enum(["unknown", "ok", "missing", "error"]).optional(),
  revisionsAuditStatus: z.enum(["unknown", "ok", "unsupported", "error"]).optional(),
  expectedScopes: z.array(z.string()).optional(),
  missingScopes: z.array(z.string()).optional(),
  missingDocs: z.array(z.string()).optional(),
  warnings: z.array(z.string()).optional(),
  checkedAt: z.coerce.date().optional().nullable(),
  evidence: z.unknown().optional()
});

export const createSiteSchema = z.object({
  siteCode: z.string().trim().min(1, "קוד אתר הוא שדה חובה"),
  displayName: z.string().trim().min(1, "שם אתר הוא שדה חובה"),
  description: z.string().optional(),
  environment: environmentEnum.optional(),
  builderSiteId: z.string().trim().optional(),
  storageBackend: storageBackendEnum.optional(),
  lifecycleStatus: lifecycleStatusEnum.optional(),
  creationMode: creationModeEnum.optional(),
  provisioningStatus: provisioningStatusEnum.optional(),

  sharePointHost: z.string().optional(),
  sharePointSiteUrl: z.string().trim().url("יש להזין כתובת SharePoint תקינה"),
  finalAppUrl: optionalUrl,
  bootstrapUrl: optionalUrl,
  runtimeConfigPath: z.string().trim().optional(),
  runtimeConfigUrl: optionalUrl,

  siteDbLibrary: z.string().optional(),
  usersDbLibrary: z.string().optional(),
  bootstrapLibrary: z.string().optional(),
  bootstrapFolder: z.string().optional(),
  widgetsDbTarget: z.enum(["users", "site"]).optional(),

  ownerName: z.string().optional(),
  ownerPersonalNumber: z.string().optional(),
  ownerEmail: z.string().trim().email("יש להזין אימייל תקין").optional().or(z.literal("")),
  ownerPhone: z.string().optional(),
  unitName: z.string().optional(),

  status: statusEnum.optional(),
  version: z.string().optional(),
  currentVersion: z.string().optional(),
  targetVersion: z.string().optional(),
  latestKnownVersion: z.string().optional(),
  versionStatus: z.enum(["unknown", "up_to_date", "outdated", "updating", "failed"]).optional(),

  storageMb: optionalNonNegative,
  filesCount: optionalNonNegative,
  adminsCount: optionalNonNegative,

  backupStatus: z.enum(["unknown", "idle", "queued", "running", "succeeded", "failed"]).optional(),
  backupCount: optionalNonNegative,
  backupStorageMb: optionalNonNegative,

  lastHealthCheckAt: z.coerce.date().optional(),
  lastSharePointHostingVerificationAt: z.coerce.date().optional(),
  lastRuntimeConfigCheckAt: z.coerce.date().optional(),
  lastMongoHealthCheckAt: z.coerce.date().optional(),
  lastDeployAt: z.coerce.date().optional(),
  lastVersionCheckAt: z.coerce.date().optional(),
  lastUpgradeAt: z.coerce.date().optional(),
  lastBackupAt: z.coerce.date().optional(),
  lastAdminSyncAt: z.coerce.date().optional(),

  lastBackupId: z.string().optional(),
  adminSyncStatus: z.enum(["unknown", "idle", "running", "succeeded", "failed"]).optional(),
  lastError: z.string().optional(),
  notes: z.string().optional(),

  txtAdmins: z.array(adminIdentitySchema).optional(),
  siteCollectionAdmins: z.array(adminIdentitySchema).optional(),
  ownersGroupAdmins: z.array(adminIdentitySchema).optional(),
  authoritativeAdminSource: z.enum(["txt", "mongo", "unknown"]).optional(),

  dataBackendStatus: z.enum(["unknown", "ok", "warning", "failed"]).optional(),
  backendApiUrl: optionalUrl,
  builderApiKeyRef: z.string().trim().optional(),
  mongoEnvironment: z.string().trim().optional(),
  mongoDatabase: z.string().trim().optional(),
  mongoSiteId: z.string().trim().optional(),
  safeCollectionName: z.string().trim().optional(),
  runtimeConfigStatus: runtimeConfigStatusSchema.optional(),
  mongoBackendStatus: mongoBackendStatusSchema.optional(),

  maintenanceSchedule: maintenanceScheduleSchema.optional(),
  health: healthSchema.optional()
});

export const updateSiteSchema = createSiteSchema.partial();

export const manualHealthSchema = z.object({ health: healthSchema });

export const siteBootstrapSchema = z.object({
  owner: z.string().trim().email("יש להזין אימייל בעל אתר תקין").optional().or(z.literal("")),
  lcid: z.coerce.number().int().positive().optional(),
  webTemplate: z.string().trim().optional(),
  shareByEmailEnabled: z.coerce.boolean().optional(),
  classification: z.string().trim().optional(),
  sensitivityLabel: z.string().trim().optional(),
  siteDesignId: z.string().trim().optional(),
  webTemplateExtensionId: z.string().trim().optional(),
  runProvisioning: z.coerce.boolean().optional(),
  runPermissionsSetup: z.coerce.boolean().optional(),
  reason: z.string().trim().optional(),
  connectorMode: z.enum(["browser-sharepoint", "backend-sharepoint"]).optional(),
  confirmBackendSharePoint: z.coerce.boolean().optional()
});

export const querySchema = z.object({
  status: statusEnum.optional(),
  search: z.string().optional(),
  siteCode: z.string().optional(),
  includeArchived: z.coerce.boolean().optional()
});
