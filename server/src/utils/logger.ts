export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogCategory =
  | "server"
  | "env"
  | "http"
  | "auth"
  | "rateLimit"
  | "db"
  | "jobs"
  | "audit"
  | "sites"
  | "releases"
  | "backups"
  | "monitoring"
  | "admins"
  | "operations"
  | "sharepoint"
  | "security"
  | "errors"
  | "performance";

type LogContext = Record<string, unknown>;

type LoggerMethod = {
  (message: string, context?: LogContext): void;
  (category: LogCategory, message: string, context?: LogContext): void;
};

const categoryEnvNames: Record<LogCategory, string> = {
  server: "LOG_SERVER",
  env: "LOG_ENV",
  http: "LOG_HTTP",
  auth: "LOG_AUTH",
  rateLimit: "LOG_RATE_LIMIT",
  db: "LOG_DB",
  jobs: "LOG_JOBS",
  audit: "LOG_AUDIT",
  sites: "LOG_SITES",
  releases: "LOG_RELEASES",
  backups: "LOG_BACKUPS",
  monitoring: "LOG_MONITORING",
  admins: "LOG_ADMINS",
  operations: "LOG_OPERATIONS",
  sharepoint: "LOG_SHAREPOINT",
  security: "LOG_SECURITY",
  errors: "LOG_ERRORS",
  performance: "LOG_PERFORMANCE"
};

const enabledByDefault = new Set<LogCategory>(["server", "errors"]);
const sensitiveKeyPattern = /(authorization|cookie|token|secret|password|api[-_]?key|bearer|digest|credential|mongo.*uri|connection.*string)/i;

const booleanFromEnv = (name: string, fallback = false) => {
  const value = process.env[name];
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off", ""].includes(normalized)) return false;
  return fallback;
};

const formatFromEnv = () => {
  const value = String(process.env.LOG_FORMAT || "").trim().toLowerCase();
  if (value === "pretty" || booleanFromEnv("LOG_PRETTY", false)) return "pretty";
  return "json";
};

const shouldShowSensitiveValues = () => booleanFromEnv("LOG_SHOW_SENSITIVE", false);

const shouldRedactKey = (key: string) => sensitiveKeyPattern.test(key);

const sanitizeValue = (value: unknown, seen: WeakSet<object>, depth = 0, key = ""): unknown => {
  if (shouldRedactKey(key) && !shouldShowSensitiveValues()) return "[REDACTED]";
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack
    };
  }
  if (value === null || value === undefined) return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  if (depth > 8) return "[MaxDepth]";

  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, seen, depth + 1));
  }

  if (value instanceof Date) return value.toISOString();
  if (value instanceof Map) return Object.fromEntries(value);
  if (value instanceof Set) return Array.from(value);

  const output: Record<string, unknown> = {};
  for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
    output[childKey] = sanitizeValue(childValue, seen, depth + 1, childKey);
  }
  return output;
};

const sanitizeContext = (context?: LogContext) => {
  if (!context) return {};
  return sanitizeValue(context, new WeakSet<object>()) as LogContext;
};

const normalizeArgs = (
  first: string,
  second?: string | LogContext,
  third?: LogContext
): { category: LogCategory; message: string; context?: LogContext } => {
  if (typeof second === "string") {
    return { category: first as LogCategory, message: second, context: third };
  }

  return { category: "server", message: first, context: second };
};

const isCategoryEnabled = (category: LogCategory, level?: LogLevel) => {
  if (booleanFromEnv("LOG_ALL", false)) return true;
  if (level === "error" && booleanFromEnv("LOG_ERRORS", true)) return true;
  return booleanFromEnv(categoryEnvNames[category], enabledByDefault.has(category));
};

const isPayloadLoggingEnabled = () => booleanFromEnv("LOG_VERBOSE_PAYLOADS", false) || booleanFromEnv("LOG_HTTP_PAYLOADS", false);

const writeRecord = (level: LogLevel, category: LogCategory, message: string, context?: LogContext) => {
  if (!isCategoryEnabled(category, level)) return;

  const sanitizedContext = sanitizeContext(context);
  const record = {
    timestamp: new Date().toISOString(),
    level,
    category,
    message,
    ...sanitizedContext
  };

  const output = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  if (formatFromEnv() === "pretty") {
    const contextKeys = Object.keys(sanitizedContext);
    const prefix = `[${record.timestamp}] [${level.toUpperCase()}] [${category}] ${message}`;
    if (contextKeys.length > 0) {
      output(prefix, sanitizedContext);
    } else {
      output(prefix);
    }
    return;
  }

  output(JSON.stringify(record));
};

const makeLoggerMethod = (level: LogLevel): LoggerMethod =>
  ((first: string, second?: string | LogContext, third?: LogContext) => {
    const { category, message, context } = normalizeArgs(first, second, third);
    writeRecord(level, category, message, context);
  }) as LoggerMethod;

export const logger = {
  debug: makeLoggerMethod("debug"),
  info: makeLoggerMethod("info"),
  warn: makeLoggerMethod("warn"),
  error: makeLoggerMethod("error"),
  isCategoryEnabled,
  isPayloadLoggingEnabled,
  sanitize: (value: unknown) => sanitizeValue(value, new WeakSet<object>())
};
