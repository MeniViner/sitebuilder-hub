import { z } from "zod";

export const monitoringAlertStatusSchema = z.enum(["open", "active", "acknowledged", "resolved"]);
export const monitoringAlertCategorySchema = z.enum(["failed_job", "stale_backup", "failed_health_check"]);
export const monitoringAlertSeveritySchema = z.enum(["info", "warning", "critical"]);

export const monitoringAlertsQuerySchema = z.object({
  status: monitoringAlertStatusSchema.optional(),
  category: monitoringAlertCategorySchema.optional(),
  severity: monitoringAlertSeveritySchema.optional(),
  includeResolved: z
    .preprocess((value) => {
      if (typeof value !== "string") return value;
      return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
    }, z.boolean())
    .optional()
});

export const monitoringAlertAcknowledgeSchema = z.object({
  note: z.string().trim().max(2000).optional()
});
