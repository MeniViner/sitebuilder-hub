import { z } from "zod";

export const jobStatusSchema = z.enum([
  "awaiting-approval",
  "queued",
  "browser-required",
  "browser-in-progress",
  "blocked-service-auth-required",
  "preflight",
  "running",
  "verifying",
  "succeeded",
  "failed",
  "cancelled",
  "retrying"
]);

export const jobsQuerySchema = z.object({
  status: jobStatusSchema.optional(),
  type: z.enum(["health-check", "deploy", "backup", "restore", "admin-sync", "repair", "version-upgrade", "version-rollback", "site-provision", "permissions-setup", "site-bootstrap"]).optional(),
  siteId: z.string().optional()
});

export const jobApprovalDecisionSchema = z.object({
  reason: z.string().trim().max(2000).optional()
});

export const jobRerunSchema = z.object({
  reason: z.string().trim().max(2000).optional()
});
