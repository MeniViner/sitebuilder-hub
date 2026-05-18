import { z } from "zod";

const auditDateSchema = z.preprocess((value) => {
  if (Array.isArray(value)) return value[0];
  if (value === undefined || value === null || value === "") return undefined;
  return value;
}, z.string().refine((value) => !Number.isNaN(new Date(value).getTime()), "Invalid date").optional());

const optionalTrimmedString = z.preprocess((value) => {
  if (Array.isArray(value)) return value[0];
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  return trimmed || undefined;
}, z.string().optional());

const positiveIntegerQuery = (fallback: number, max: number) =>
  z.preprocess((value) => {
    if (Array.isArray(value)) return value[0];
    if (value === undefined || value === null || value === "") return fallback;
    return Number(value);
  }, z.number().int().min(1).max(max));

const withValidDateRange = <T extends z.ZodTypeAny>(schema: T) =>
  schema.refine(
    (query) => {
      const from = query.from || query.startDate;
      const to = query.to || query.endDate;
      if (!from || !to) return true;
      return new Date(from).getTime() <= new Date(to).getTime();
    },
    {
      message: "from must be before to",
      path: ["from"]
    }
  );

const auditQueryBaseSchema = z.object({
  action: optionalTrimmedString,
  entityType: optionalTrimmedString,
  entityId: optionalTrimmedString,
  result: z.preprocess((value) => {
    if (Array.isArray(value)) return value[0];
    if (value === undefined || value === null || value === "") return undefined;
    return value;
  }, z.enum(["success", "failure"]).optional()),
  actor: optionalTrimmedString,
  search: optionalTrimmedString,
  from: auditDateSchema,
  to: auditDateSchema,
  startDate: auditDateSchema,
  endDate: auditDateSchema,
  page: positiveIntegerQuery(1, 10000),
  limit: positiveIntegerQuery(100, 500)
});

const auditReportQueryBaseSchema = auditQueryBaseSchema.omit({ page: true, limit: true }).extend({
  limit: positiveIntegerQuery(5000, 20000).optional()
});

const auditExportQueryBaseSchema = auditReportQueryBaseSchema.extend({
  format: z.preprocess((value) => {
    if (Array.isArray(value)) return value[0];
    if (value === undefined || value === null || value === "") return "csv";
    return String(value).toLowerCase();
  }, z.enum(["csv", "json"]))
});

export const auditQuerySchema = withValidDateRange(auditQueryBaseSchema);
export const auditReportQuerySchema = withValidDateRange(auditReportQueryBaseSchema);
export const auditExportQuerySchema = withValidDateRange(auditExportQueryBaseSchema);
