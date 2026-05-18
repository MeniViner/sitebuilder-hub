export type ClientLogLevel = "debug" | "info" | "warn" | "error";

export type ClientLogCategory =
  | "app"
  | "api"
  | "audit"
  | "auth"
  | "monitoring"
  | "router"
  | "ui"
  | "state"
  | "storage"
  | "browserFetch"
  | "performance"
  | "errors";

type LogContext = Record<string, unknown>;

type LoggerMethod = {
  (message: string, context?: LogContext): void;
  (category: ClientLogCategory, message: string, context?: LogContext): void;
};

const categoryEnvNames: Record<ClientLogCategory, string> = {
  app: "VITE_LOG_APP",
  api: "VITE_LOG_API",
  audit: "VITE_LOG_AUDIT",
  auth: "VITE_LOG_AUTH",
  monitoring: "VITE_LOG_MONITORING",
  router: "VITE_LOG_ROUTER",
  ui: "VITE_LOG_UI",
  state: "VITE_LOG_STATE",
  storage: "VITE_LOG_STORAGE",
  browserFetch: "VITE_LOG_BROWSER_FETCH",
  performance: "VITE_LOG_PERFORMANCE",
  errors: "VITE_LOG_ERRORS"
};

const enabledByDefault = new Set<ClientLogCategory>(["app", "errors"]);
const sensitiveKeyPattern = /(authorization|cookie|token|secret|password|api[-_]?key|bearer|digest|credential|personalnumber|personal-number)/i;

const envValue = (name: string) => import.meta.env[name] as string | boolean | undefined;

const booleanFromEnv = (name: string, fallback = false) => {
  const value = envValue(name);
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off", ""].includes(normalized)) return false;
  return fallback;
};

const formatFromEnv = () => {
  const value = String(envValue("VITE_LOG_FORMAT") || "").trim().toLowerCase();
  if (value === "pretty" || booleanFromEnv("VITE_LOG_PRETTY", false)) return "pretty";
  return "json";
};

const shouldShowSensitiveValues = () => booleanFromEnv("VITE_LOG_SHOW_SENSITIVE", false);
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
  if (value instanceof Headers) return Object.fromEntries(value.entries());
  if (value instanceof URLSearchParams) return Object.fromEntries(value.entries());
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
): { category: ClientLogCategory; message: string; context?: LogContext } => {
  if (typeof second === "string") {
    return { category: first as ClientLogCategory, message: second, context: third };
  }

  return { category: "app", message: first, context: second };
};

const isCategoryEnabled = (category: ClientLogCategory, level?: ClientLogLevel) => {
  if (booleanFromEnv("VITE_LOG_ALL", false)) return true;
  if (level === "error" && booleanFromEnv("VITE_LOG_ERRORS", true)) return true;
  return booleanFromEnv(categoryEnvNames[category], enabledByDefault.has(category));
};

const isPayloadLoggingEnabled = () => booleanFromEnv("VITE_LOG_VERBOSE_PAYLOADS", false) || booleanFromEnv("VITE_LOG_API_PAYLOADS", false);

const writeRecord = (level: ClientLogLevel, category: ClientLogCategory, message: string, context?: LogContext) => {
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
    const prefix = `[SiteBuilder] [${level.toUpperCase()}] [${category}] ${message}`;
    if (Object.keys(sanitizedContext).length > 0) {
      output(prefix, sanitizedContext);
    } else {
      output(prefix);
    }
    return;
  }

  output(JSON.stringify(record));
};

const makeLoggerMethod = (level: ClientLogLevel): LoggerMethod =>
  ((first: string, second?: string | LogContext, third?: LogContext) => {
    const { category, message, context } = normalizeArgs(first, second, third);
    writeRecord(level, category, message, context);
  }) as LoggerMethod;

const describeRequestBody = (body: BodyInit | null | undefined) => {
  if (body === undefined || body === null) return {};
  if (typeof body === "string") {
    return {
      bodyType: "string",
      bodyBytes: new TextEncoder().encode(body).length,
      ...(isPayloadLoggingEnabled() ? { body } : {})
    };
  }
  if (body instanceof URLSearchParams) return { bodyType: "URLSearchParams", body: isPayloadLoggingEnabled() ? body.toString() : undefined };
  if (body instanceof FormData) return { bodyType: "FormData" };
  if (body instanceof Blob) return { bodyType: "Blob", bodyBytes: body.size };
  return { bodyType: typeof body };
};

let browserDiagnosticsInstalled = false;
let originalFetch: typeof window.fetch | null = null;

export const clientLogger = {
  debug: makeLoggerMethod("debug"),
  info: makeLoggerMethod("info"),
  warn: makeLoggerMethod("warn"),
  error: makeLoggerMethod("error"),
  isCategoryEnabled,
  isPayloadLoggingEnabled,
  sanitize: (value: unknown) => sanitizeValue(value, new WeakSet<object>()),
  describeRequestBody,
  createRequestId: () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `client-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  installBrowserDiagnostics: () => {
    if (browserDiagnosticsInstalled || typeof window === "undefined") return;
    browserDiagnosticsInstalled = true;

    window.addEventListener("error", (event) => {
      clientLogger.error("errors", "Browser error event", {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error
      });
    });

    window.addEventListener("unhandledrejection", (event) => {
      clientLogger.error("errors", "Unhandled browser promise rejection", {
        reason: event.reason instanceof Error ? event.reason : String(event.reason)
      });
    });

    if (!booleanFromEnv("VITE_LOG_BROWSER_FETCH", false)) return;

    originalFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const startedAt = performance.now();
      const url = input instanceof Request ? input.url : String(input);
      const method = init?.method || (input instanceof Request ? input.method : "GET");
      clientLogger.info("browserFetch", "window.fetch started", {
        method,
        url,
        ...describeRequestBody(init?.body)
      });

      try {
        const response = await originalFetch!(input, init);
        clientLogger.info("browserFetch", "window.fetch finished", {
          method,
          url,
          status: response.status,
          statusText: response.statusText,
          ok: response.ok,
          durationMs: Math.round(performance.now() - startedAt)
        });
        return response;
      } catch (error) {
        clientLogger.error("browserFetch", "window.fetch failed", {
          method,
          url,
          durationMs: Math.round(performance.now() - startedAt),
          error
        });
        throw error;
      }
    };
  }
};
