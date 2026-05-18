import { afterEach, beforeEach, vi } from "vitest";

const deterministicEnv = {
  NODE_ENV: "test",
  TZ: "UTC",
  SERVER_PORT: "4100",
  MONGO_URI: "mongodb://127.0.0.1:27017/sitebuilder_hub_test",
  CLIENT_ORIGIN: "http://localhost:5177",
  AUTH_ENABLED: "false",
  API_KEY: "test-api-key",
  BOOTSTRAP_ADMIN_PERSONAL_NUMBERS: "s0000001",
  RATE_LIMIT_WINDOW_MS: "60000",
  RATE_LIMIT_MAX: "180",
  JOB_WORKER_ENABLED: "false",
  JOB_WORKER_POLL_MS: "3000",
  JOB_APPROVAL_TTL_HOURS: "24",
  MAINTENANCE_SCHEDULER_ENABLED: "false",
  MAINTENANCE_SCHEDULER_POLL_MS: "60000",
  MAINTENANCE_SCHEDULER_MAX_SITES_PER_TICK: "25",
  MONITORING_STALE_BACKUP_HOURS: "26",
  SHAREPOINT_WRITE_ENABLED: "false",
  SHAREPOINT_ALLOW_UNAUTHENTICATED_WRITE: "false",
  SHAREPOINT_AUTH_COOKIE: "",
  SHAREPOINT_BEARER_TOKEN: "",
  SHAREPOINT_REQUEST_TIMEOUT_MS: "15000",
  SHAREPOINT_SITE_CREATE_POLL_ATTEMPTS: "2",
  SHAREPOINT_SITE_CREATE_POLL_INTERVAL_MS: "1",
  LOG_ALL: "false",
  LOG_FORMAT: "json",
  LOG_PRETTY: "false",
  LOG_VERBOSE_PAYLOADS: "false",
  LOG_HTTP_PAYLOADS: "false",
  LOG_SHOW_SENSITIVE: "false",
  LOG_SERVER: "false",
  LOG_ENV: "false",
  LOG_HTTP: "false",
  LOG_AUTH: "false",
  LOG_RATE_LIMIT: "false",
  LOG_DB: "false",
  LOG_JOBS: "false",
  LOG_AUDIT: "false",
  LOG_SITES: "false",
  LOG_RELEASES: "false",
  LOG_BACKUPS: "false",
  LOG_MONITORING: "false",
  LOG_ADMINS: "false",
  LOG_OPERATIONS: "false",
  LOG_SHAREPOINT: "false",
  LOG_SECURITY: "false",
  LOG_ERRORS: "false",
  LOG_PERFORMANCE: "false"
};

export const resetTestEnv = (overrides: Record<string, string> = {}) => {
  for (const [key, value] of Object.entries(deterministicEnv)) {
    process.env[key] = value;
  }

  for (const [key, value] of Object.entries(overrides)) {
    process.env[key] = value;
  }
};

beforeEach(() => {
  resetTestEnv();
});

afterEach(() => {
  vi.unstubAllGlobals();
});
