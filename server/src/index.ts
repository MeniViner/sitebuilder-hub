import { env } from "./config/env";
import { connectMongo } from "./db/mongo";
import { app } from "./app";
import { logger } from "./utils/logger";
import { startJobsWorker } from "./services/jobs.worker";
import { startMaintenanceScheduler } from "./services/maintenanceScheduler.service";

process.on("unhandledRejection", (reason) => {
  logger.error("errors", "Unhandled promise rejection", {
    reason: reason instanceof Error ? reason : String(reason)
  });
});

process.on("uncaughtExceptionMonitor", (error) => {
  logger.error("errors", "Uncaught exception detected", { error });
});

process.on("warning", (warning) => {
  logger.warn("errors", "Node process warning", {
    name: warning.name,
    message: warning.message,
    stack: warning.stack
  });
});

const bootstrap = async () => {
  logger.info("env", "Runtime configuration loaded", {
    nodeEnv: env.NODE_ENV,
    serverPort: env.SERVER_PORT,
    clientOrigin: env.CLIENT_ORIGIN,
    authEnabled: env.AUTH_ENABLED,
    jobWorkerEnabled: env.JOB_WORKER_ENABLED,
    jobWorkerPollMs: env.JOB_WORKER_POLL_MS,
    maintenanceSchedulerEnabled: env.MAINTENANCE_SCHEDULER_ENABLED,
    maintenanceSchedulerPollMs: env.MAINTENANCE_SCHEDULER_POLL_MS,
    rateLimitWindowMs: env.RATE_LIMIT_WINDOW_MS,
    rateLimitMax: env.RATE_LIMIT_MAX,
    sharePoint: {
      writeEnabled: env.SHAREPOINT_WRITE_ENABLED,
      unauthenticatedWriteAllowed: env.SHAREPOINT_ALLOW_UNAUTHENTICATED_WRITE,
      hasAuthCookie: Boolean(env.SHAREPOINT_AUTH_COOKIE),
      hasBearerToken: Boolean(env.SHAREPOINT_BEARER_TOKEN),
      requestTimeoutMs: env.SHAREPOINT_REQUEST_TIMEOUT_MS
    },
    dangerousOverrides: {
      allValidationGates: env.HUB_DANGEROUS_BYPASS_ALL_VALIDATION_GATES,
      approvalGates: env.HUB_DANGEROUS_BYPASS_APPROVAL_GATES,
      sharePointWriteGates: env.HUB_DANGEROUS_BYPASS_SHAREPOINT_WRITE_GATES,
      releaseArtifactValidation: env.HUB_DANGEROUS_BYPASS_RELEASE_ARTIFACT_VALIDATION,
      deployPlanBlockers: env.HUB_DANGEROUS_BYPASS_DEPLOY_PLAN_BLOCKERS,
      restoreEvidenceGates: env.HUB_DANGEROUS_BYPASS_RESTORE_EVIDENCE_GATES,
      browserEvidenceGates: env.HUB_DANGEROUS_BYPASS_BROWSER_EVIDENCE_GATES,
      adminRepairGates: env.HUB_DANGEROUS_BYPASS_ADMIN_REPAIR_GATES
    },
    logging: {
      all: env.LOG_ALL,
      format: env.LOG_FORMAT,
      verbosePayloads: env.LOG_VERBOSE_PAYLOADS || env.LOG_HTTP_PAYLOADS,
      showSensitive: env.LOG_SHOW_SENSITIVE,
      categories: {
        server: env.LOG_SERVER,
        http: env.LOG_HTTP,
        auth: env.LOG_AUTH,
        rateLimit: env.LOG_RATE_LIMIT,
        db: env.LOG_DB,
        jobs: env.LOG_JOBS,
        audit: env.LOG_AUDIT,
        sites: env.LOG_SITES,
        releases: env.LOG_RELEASES,
        backups: env.LOG_BACKUPS,
        monitoring: env.LOG_MONITORING,
        admins: env.LOG_ADMINS,
        operations: env.LOG_OPERATIONS,
        sharepoint: env.LOG_SHAREPOINT,
        security: env.LOG_SECURITY,
        errors: env.LOG_ERRORS,
        performance: env.LOG_PERFORMANCE
      }
    }
  });

  await connectMongo();

  app.listen(env.SERVER_PORT, () => {
    logger.info("server", "Site Builder Hub server started", {
      port: env.SERVER_PORT,
      authEnabled: env.AUTH_ENABLED,
      jobWorkerEnabled: env.JOB_WORKER_ENABLED
    });
  });

  startJobsWorker();
  startMaintenanceScheduler();
};

bootstrap().catch((error) => {
  logger.error("errors", "Failed to start server", { error });
  process.exit(1);
});
