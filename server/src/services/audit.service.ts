import type { Request } from "express";
import type { FilterQuery } from "mongoose";
import { AuditLog } from "../models/AuditLog";
import { logger } from "../utils/logger";

type AuditResult = "success" | "failure";

type AuditActor = {
  userId?: string;
  userName?: string;
  role?: string;
};

type AuditLogBaseParams = {
  action: string;
  entityType: string;
  entityId?: string;
  result?: AuditResult;
  error?: string;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
};

type AuditLogPersistParams = AuditLogBaseParams & {
  requestId?: string;
  actor?: AuditActor;
};

export type AuditQueryParams = {
  action?: string;
  entityType?: string;
  entityId?: string;
  result?: AuditResult;
  actor?: string;
  search?: string;
  from?: string;
  to?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
};

export type AuditReportParams = Omit<AuditQueryParams, "page"> & {
  limit?: number;
};

type AuditRow = {
  _id?: unknown;
  id?: unknown;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  requestId?: string;
  actor?: AuditActor;
  action?: string;
  entityType?: string;
  entityId?: string;
  result?: AuditResult;
  error?: string;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
  toObject?: () => AuditRow;
};

const systemActor: Required<AuditActor> = {
  userId: "system",
  userName: "System",
  role: "system"
};

const normalizeActor = (actor?: AuditActor): Required<AuditActor> => ({
  userId: actor?.userId || systemActor.userId,
  userName: actor?.userName || systemActor.userName,
  role: actor?.role || systemActor.role
});

const summarizeForLog = (value: unknown): unknown => {
  if (value === undefined || value === null) return value;
  if (Array.isArray(value)) return { kind: "array", count: value.length };
  if (value instanceof Date) return { kind: "date" };
  if (typeof value === "object") return { kind: "object", keys: Object.keys(value as Record<string, unknown>).slice(0, 20) };
  return { kind: typeof value };
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const asRow = (row: AuditRow): AuditRow => (typeof row.toObject === "function" ? row.toObject() : row);

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

const normalizeDate = (value?: string, boundary: "start" | "end" = "start") => {
  if (!value) return undefined;
  if (dateOnlyPattern.test(value)) {
    return new Date(`${value}T${boundary === "end" ? "23:59:59.999" : "00:00:00.000"}Z`);
  }
  return new Date(value);
};

const normalizeDateForMeta = (value?: string, boundary: "start" | "end" = "start") => {
  const date = normalizeDate(value, boundary);
  return date ? date.toISOString() : undefined;
};

export const buildAuditFilter = (params: AuditQueryParams = {}): FilterQuery<typeof AuditLog> => {
  const filter: FilterQuery<typeof AuditLog> = {};

  if (params.action) filter.action = params.action;
  if (params.entityType) filter.entityType = params.entityType;
  if (params.entityId) filter.entityId = params.entityId;
  if (params.result) filter.result = params.result;

  const from = normalizeDate(params.from || params.startDate, "start");
  const to = normalizeDate(params.to || params.endDate, "end");
  if (from || to) {
    filter.createdAt = {
      ...(from ? { $gte: from } : {}),
      ...(to ? { $lte: to } : {})
    };
  }

  const andFilters: FilterQuery<typeof AuditLog>[] = [];
  if (params.actor) {
    const actorPattern = new RegExp(escapeRegExp(params.actor), "i");
    andFilters.push({
      $or: [{ "actor.userId": actorPattern }, { "actor.userName": actorPattern }, { "actor.role": actorPattern }]
    });
  }

  if (params.search) {
    const searchPattern = new RegExp(escapeRegExp(params.search), "i");
    andFilters.push({
      $or: [
        { requestId: searchPattern },
        { action: searchPattern },
        { entityType: searchPattern },
        { entityId: searchPattern },
        { result: searchPattern },
        { error: searchPattern },
        { "actor.userId": searchPattern },
        { "actor.userName": searchPattern },
        { "actor.role": searchPattern }
      ]
    });
  }

  if (andFilters.length > 0) filter.$and = andFilters;
  return filter;
};

const summarizeFilters = (params: AuditQueryParams = {}) => ({
  action: params.action,
  entityType: params.entityType,
  entityId: params.entityId,
  result: params.result,
  actor: params.actor,
  search: params.search,
  from: normalizeDateForMeta(params.from || params.startDate, "start"),
  to: normalizeDateForMeta(params.to || params.endDate, "end")
});

const serializeValue = (value: unknown): string => {
  if (value === undefined || value === null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return "[Unserializable]";
  }
};

export const escapeCsvValue = (value: unknown): string => {
  const serialized = serializeValue(value);
  const formulaSafe = /^[=+\-@\t\r]/.test(serialized) ? `'${serialized}` : serialized;
  const escaped = formulaSafe.replace(/"/g, '""');
  return /[",\r\n]|^\s|\s$/.test(escaped) ? `"${escaped}"` : escaped;
};

const rowId = (row: AuditRow) => {
  const id = row._id || row.id;
  return id && typeof id === "object" && "toString" in id ? id.toString() : serializeValue(id);
};

const rowDate = (value: unknown) => {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
};

const csvColumns = [
  { header: "id", value: (row: AuditRow) => rowId(row) },
  { header: "createdAt", value: (row: AuditRow) => rowDate(row.createdAt) },
  { header: "requestId", value: (row: AuditRow) => row.requestId },
  { header: "actorUserId", value: (row: AuditRow) => row.actor?.userId },
  { header: "actorUserName", value: (row: AuditRow) => row.actor?.userName },
  { header: "actorRole", value: (row: AuditRow) => row.actor?.role },
  { header: "action", value: (row: AuditRow) => row.action },
  { header: "entityType", value: (row: AuditRow) => row.entityType },
  { header: "entityId", value: (row: AuditRow) => row.entityId },
  { header: "result", value: (row: AuditRow) => row.result },
  { header: "error", value: (row: AuditRow) => row.error },
  { header: "metadata", value: (row: AuditRow) => row.metadata },
  { header: "before", value: (row: AuditRow) => row.before },
  { header: "after", value: (row: AuditRow) => row.after }
];

export const auditRowsToCsv = (rows: AuditRow[]) => {
  const header = csvColumns.map((column) => escapeCsvValue(column.header)).join(",");
  const body = rows.map((row) => csvColumns.map((column) => escapeCsvValue(column.value(asRow(row)))).join(","));
  return [header, ...body].join("\r\n");
};

const increment = (target: Record<string, number>, key?: string) => {
  const normalized = key || "(blank)";
  target[normalized] = (target[normalized] || 0) + 1;
};

const sortCounts = (counts: Record<string, number>) =>
  Object.entries(counts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([key, count]) => ({ key, count }));

export const summarizeAuditRows = (rows: AuditRow[]) => {
  const byResult: Record<string, number> = {};
  const byAction: Record<string, number> = {};
  const byEntityType: Record<string, number> = {};
  const byActor: Record<string, number> = {};
  const byDay: Record<string, number> = {};
  let firstSeenAt = "";
  let lastSeenAt = "";

  for (const rawRow of rows) {
    const row = asRow(rawRow);
    increment(byResult, row.result);
    increment(byAction, row.action);
    increment(byEntityType, row.entityType);
    increment(byActor, row.actor?.userName || row.actor?.userId);

    const createdAt = rowDate(row.createdAt);
    if (createdAt) {
      const day = createdAt.slice(0, 10);
      increment(byDay, day);
      if (!firstSeenAt || createdAt < firstSeenAt) firstSeenAt = createdAt;
      if (!lastSeenAt || createdAt > lastSeenAt) lastSeenAt = createdAt;
    }
  }

  return {
    totalRows: rows.length,
    firstSeenAt: firstSeenAt || null,
    lastSeenAt: lastSeenAt || null,
    byResult: sortCounts(byResult),
    byAction: sortCounts(byAction),
    byEntityType: sortCounts(byEntityType),
    byActor: sortCounts(byActor),
    byDay: sortCounts(byDay)
  };
};

export async function listAuditLogs(params: AuditQueryParams = {}) {
  const page = params.page || 1;
  const limit = params.limit || 100;
  const skip = (page - 1) * limit;
  const filter = buildAuditFilter(params);

  logger.info("audit", "Audit list requested", {
    filters: summarizeFilters(params),
    page,
    limit
  });

  const [rows, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    AuditLog.countDocuments(filter)
  ]);

  const pages = Math.max(1, Math.ceil(total / limit));
  return {
    rows,
    meta: {
      filters: summarizeFilters(params),
      pagination: {
        page,
        limit,
        total,
        pages,
        hasNextPage: page < pages,
        hasPreviousPage: page > 1
      }
    }
  };
}

export async function buildAuditReport(params: AuditReportParams = {}) {
  const limit = params.limit || 5000;
  const filter = buildAuditFilter(params);
  logger.info("audit", "Audit report requested", {
    filters: summarizeFilters(params),
    limit
  });

  const rows = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(limit);
  const totalMatchingRows = await AuditLog.countDocuments(filter);
  const summary = summarizeAuditRows(rows);

  return {
    generatedAt: new Date().toISOString(),
    filters: summarizeFilters(params),
    limit,
    totalMatchingRows,
    truncated: totalMatchingRows > rows.length,
    summary
  };
}

export async function exportAuditRows(params: AuditReportParams = {}) {
  const limit = params.limit || 5000;
  const filter = buildAuditFilter(params);
  logger.info("audit", "Audit CSV export requested", {
    filters: summarizeFilters(params),
    limit
  });

  const rows = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(limit);
  return {
    generatedAt: new Date().toISOString(),
    filters: summarizeFilters(params),
    limit,
    rowCount: rows.length,
    csv: auditRowsToCsv(rows)
  };
}

async function persistAuditLog(params: AuditLogPersistParams) {
  const {
    requestId = "",
    actor: rawActor,
    action,
    entityType,
    entityId = "",
    result = "success",
    error = "",
    before,
    after,
    metadata
  } = params;
  const actor = normalizeActor(rawActor);

  logger.info("audit", "Writing audit log", {
    requestId,
    action,
    entityType,
    entityId,
    result,
    actor: actor.userName,
    error,
    ...(logger.isPayloadLoggingEnabled()
      ? { before, after, metadata }
      : {
          before: summarizeForLog(before),
          after: summarizeForLog(after),
          metadata: summarizeForLog(metadata)
        })
  });

  const auditLog = await AuditLog.create({
    requestId,
    actor,
    action,
    entityType,
    entityId,
    result,
    error,
    before,
    after,
    metadata
  });
  logger.debug("audit", "Audit log persisted", {
    auditLogId: auditLog._id.toString(),
    requestId,
    action
  });
  return auditLog;
}

export async function writeAuditLog(params: AuditLogBaseParams & { req: Request }) {
  const { req, ...auditParams } = params;
  return persistAuditLog({
    ...auditParams,
    requestId: req.requestId || "",
    actor: {
      userId: req.user?.id || "system",
      userName: req.user?.name || "System",
      role: req.user?.role || "system"
    }
  });
}

export async function writeSystemAuditLog(params: AuditLogBaseParams & { actorName?: string; requestId?: string }) {
  const { actorName, ...auditParams } = params;
  const normalizedActorName = String(actorName || "").trim();
  const isSystemActor = !normalizedActorName || normalizedActorName.toLowerCase() === "system";

  return persistAuditLog({
    ...auditParams,
    actor: isSystemActor
      ? systemActor
      : {
          userId: normalizedActorName,
          userName: normalizedActorName,
          role: "system"
        }
  });
}
