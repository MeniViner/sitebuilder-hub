import dotenv from "dotenv";
import path from "path";
import { z } from "zod";

[
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "..", ".env")
].forEach((envPath) => dotenv.config({ path: envPath }));

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off", ""].includes(normalized)) return false;
  return value;
}, z.boolean());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SERVER_PORT: z.coerce.number().int().positive("SERVER_PORT חייב להיות מספר חיובי").default(4100),
  MONGO_URI: z.string().min(1, "MONGO_URI הוא שדה חובה"),
  CLIENT_ORIGIN: z.string().url("CLIENT_ORIGIN חייב להיות URL תקין").default("http://localhost:5177"),

  AUTH_ENABLED: booleanFromEnv.default(false),
  API_KEY: z.string().min(8, "API_KEY חייב להכיל לפחות 8 תווים").default("dev-local-key"),
  BOOTSTRAP_ADMIN_PERSONAL_NUMBERS: z.string().default("s8856096,s8856095"),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(180),

  JOB_WORKER_ENABLED: booleanFromEnv.default(true),
  JOB_WORKER_POLL_MS: z.coerce.number().int().positive().default(3_000),
  JOB_APPROVAL_TTL_HOURS: z.coerce.number().positive().default(24),
  MAINTENANCE_SCHEDULER_ENABLED: booleanFromEnv.default(true),
  MAINTENANCE_SCHEDULER_POLL_MS: z.coerce.number().int().positive().default(60_000),
  MAINTENANCE_SCHEDULER_MAX_SITES_PER_TICK: z.coerce.number().int().positive().default(25),
  MONITORING_STALE_BACKUP_HOURS: z.coerce.number().positive().default(26),

  SHAREPOINT_WRITE_ENABLED: booleanFromEnv.default(false),
  SHAREPOINT_ALLOW_UNAUTHENTICATED_WRITE: booleanFromEnv.default(false),
  SHAREPOINT_AUTH_COOKIE: z.string().default(""),
  SHAREPOINT_BEARER_TOKEN: z.string().default(""),
  SHAREPOINT_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  SHAREPOINT_SITE_CREATE_POLL_ATTEMPTS: z.coerce.number().int().positive().default(24),
  SHAREPOINT_SITE_CREATE_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5_000),

  LOG_ALL: booleanFromEnv.default(false),
  LOG_FORMAT: z.enum(["json", "pretty"]).default("json"),
  LOG_PRETTY: booleanFromEnv.default(false),
  LOG_VERBOSE_PAYLOADS: booleanFromEnv.default(false),
  LOG_HTTP_PAYLOADS: booleanFromEnv.default(false),
  LOG_SHOW_SENSITIVE: booleanFromEnv.default(false),
  LOG_SERVER: booleanFromEnv.default(true),
  LOG_ENV: booleanFromEnv.default(false),
  LOG_HTTP: booleanFromEnv.default(false),
  LOG_AUTH: booleanFromEnv.default(false),
  LOG_RATE_LIMIT: booleanFromEnv.default(false),
  LOG_DB: booleanFromEnv.default(false),
  LOG_JOBS: booleanFromEnv.default(false),
  LOG_AUDIT: booleanFromEnv.default(false),
  LOG_SITES: booleanFromEnv.default(false),
  LOG_RELEASES: booleanFromEnv.default(false),
  LOG_BACKUPS: booleanFromEnv.default(false),
  LOG_MONITORING: booleanFromEnv.default(false),
  LOG_ADMINS: booleanFromEnv.default(false),
  LOG_OPERATIONS: booleanFromEnv.default(false),
  LOG_SHAREPOINT: booleanFromEnv.default(false),
  LOG_SECURITY: booleanFromEnv.default(false),
  LOG_ERRORS: booleanFromEnv.default(true),
  LOG_PERFORMANCE: booleanFromEnv.default(false)
});

const parsed = envSchema.safeParse({
  NODE_ENV: process.env.NODE_ENV,
  SERVER_PORT: process.env.SERVER_PORT,
  MONGO_URI: process.env.MONGO_URI,
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN,

  AUTH_ENABLED: process.env.AUTH_ENABLED,
  API_KEY: process.env.API_KEY,
  BOOTSTRAP_ADMIN_PERSONAL_NUMBERS: process.env.BOOTSTRAP_ADMIN_PERSONAL_NUMBERS,

  RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX: process.env.RATE_LIMIT_MAX,

  JOB_WORKER_ENABLED: process.env.JOB_WORKER_ENABLED,
  JOB_WORKER_POLL_MS: process.env.JOB_WORKER_POLL_MS,
  JOB_APPROVAL_TTL_HOURS: process.env.JOB_APPROVAL_TTL_HOURS,
  MAINTENANCE_SCHEDULER_ENABLED: process.env.MAINTENANCE_SCHEDULER_ENABLED,
  MAINTENANCE_SCHEDULER_POLL_MS: process.env.MAINTENANCE_SCHEDULER_POLL_MS,
  MAINTENANCE_SCHEDULER_MAX_SITES_PER_TICK: process.env.MAINTENANCE_SCHEDULER_MAX_SITES_PER_TICK,
  MONITORING_STALE_BACKUP_HOURS: process.env.MONITORING_STALE_BACKUP_HOURS,

  SHAREPOINT_WRITE_ENABLED: process.env.SHAREPOINT_WRITE_ENABLED,
  SHAREPOINT_ALLOW_UNAUTHENTICATED_WRITE: process.env.SHAREPOINT_ALLOW_UNAUTHENTICATED_WRITE,
  SHAREPOINT_AUTH_COOKIE: process.env.SHAREPOINT_AUTH_COOKIE,
  SHAREPOINT_BEARER_TOKEN: process.env.SHAREPOINT_BEARER_TOKEN,
  SHAREPOINT_REQUEST_TIMEOUT_MS: process.env.SHAREPOINT_REQUEST_TIMEOUT_MS,
  SHAREPOINT_SITE_CREATE_POLL_ATTEMPTS: process.env.SHAREPOINT_SITE_CREATE_POLL_ATTEMPTS,
  SHAREPOINT_SITE_CREATE_POLL_INTERVAL_MS: process.env.SHAREPOINT_SITE_CREATE_POLL_INTERVAL_MS,

  LOG_ALL: process.env.LOG_ALL,
  LOG_FORMAT: process.env.LOG_FORMAT,
  LOG_PRETTY: process.env.LOG_PRETTY,
  LOG_VERBOSE_PAYLOADS: process.env.LOG_VERBOSE_PAYLOADS,
  LOG_HTTP_PAYLOADS: process.env.LOG_HTTP_PAYLOADS,
  LOG_SHOW_SENSITIVE: process.env.LOG_SHOW_SENSITIVE,
  LOG_SERVER: process.env.LOG_SERVER,
  LOG_ENV: process.env.LOG_ENV,
  LOG_HTTP: process.env.LOG_HTTP,
  LOG_AUTH: process.env.LOG_AUTH,
  LOG_RATE_LIMIT: process.env.LOG_RATE_LIMIT,
  LOG_DB: process.env.LOG_DB,
  LOG_JOBS: process.env.LOG_JOBS,
  LOG_AUDIT: process.env.LOG_AUDIT,
  LOG_SITES: process.env.LOG_SITES,
  LOG_RELEASES: process.env.LOG_RELEASES,
  LOG_BACKUPS: process.env.LOG_BACKUPS,
  LOG_MONITORING: process.env.LOG_MONITORING,
  LOG_ADMINS: process.env.LOG_ADMINS,
  LOG_OPERATIONS: process.env.LOG_OPERATIONS,
  LOG_SHAREPOINT: process.env.LOG_SHAREPOINT,
  LOG_SECURITY: process.env.LOG_SECURITY,
  LOG_ERRORS: process.env.LOG_ERRORS,
  LOG_PERFORMANCE: process.env.LOG_PERFORMANCE
});

if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
  throw new Error(`תצורת סביבה לא תקינה: ${details}`);
}

export const env = parsed.data;
