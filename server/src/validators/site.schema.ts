import { z } from "zod";

const statusEnum = z.enum(["active", "warning", "failed", "draft", "archived"]);

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

export const createSiteSchema = z.object({
  siteCode: z.string().trim().min(1, "קוד אתר הוא שדה חובה"),
  displayName: z.string().trim().min(1, "שם אתר הוא שדה חובה"),
  description: z.string().optional(),

  sharePointHost: z.string().optional(),
  sharePointSiteUrl: z.string().trim().url("יש להזין כתובת SharePoint תקינה"),
  finalAppUrl: optionalUrl,
  bootstrapUrl: optionalUrl,

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
  reason: z.string().trim().optional()
});

export const querySchema = z.object({
  status: statusEnum.optional(),
  search: z.string().optional(),
  siteCode: z.string().optional(),
  includeArchived: z.coerce.boolean().optional()
});
