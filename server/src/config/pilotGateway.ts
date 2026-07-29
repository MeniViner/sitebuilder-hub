import { URL } from "url";

export const PILOT_GATEWAY_SITE_ID = "alphateam-mongo-pilot";
export const PILOT_GATEWAY_MODE = "pilot";
export const PILOT_GATEWAY_BODY_LIMIT_BYTES = 10 * 1024 * 1024;
export const PILOT_GATEWAY_UPSTREAM_TIMEOUT_MS = 15_000;

export type PilotGatewayConfig = {
  enabled: boolean;
  prefix: string;
  target: URL | null;
  allowedSiteIds: ReadonlySet<string>;
  allowedOrigins: ReadonlySet<string>;
  apiKeyRef: string;
  apiKey: string;
  bodyLimitBytes: number;
  upstreamTimeoutMs: number;
};

type Environment = Record<string, string | undefined>;

const splitCsv = (value: string | undefined) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const parseEnabled = (value: string | undefined) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized || ["false", "0", "no", "off"].includes(normalized)) return false;
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  throw new Error("SITE_BUILDER_PILOT_GATEWAY_ENABLED must be true or false.");
};

const validatePrefix = (value: string | undefined) => {
  const prefix = String(value || "/builder-api").trim();
  if (
    prefix === "/"
    || !/^\/[A-Za-z0-9][A-Za-z0-9/_-]*$/.test(prefix)
    || prefix.endsWith("/")
    || prefix.includes("//")
    || prefix.includes("..")
  ) {
    throw new Error("SITE_BUILDER_PILOT_GATEWAY_PREFIX must be a safe absolute path such as /builder-api.");
  }
  return prefix;
};

const validateTarget = (value: string | undefined, required: boolean) => {
  const raw = String(value || "").trim();
  if (!raw) {
    if (required) throw new Error("SITE_BUILDER_PILOT_GATEWAY_TARGET is required when the pilot Gateway is enabled.");
    return null;
  }

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    throw new Error("SITE_BUILDER_PILOT_GATEWAY_TARGET must be a valid loopback HTTP(S) URL.");
  }

  const loopbackHosts = new Set(["127.0.0.1", "::1", "[::1]", "localhost"]);
  if (
    !["http:", "https:"].includes(target.protocol)
    || !loopbackHosts.has(target.hostname.toLowerCase())
    || target.username
    || target.password
    || target.search
    || target.hash
    || (target.pathname !== "/" && target.pathname !== "")
  ) {
    throw new Error("SITE_BUILDER_PILOT_GATEWAY_TARGET must be a fixed loopback HTTP(S) origin.");
  }

  target.pathname = "/";
  return target;
};

const validateSiteIds = (value: string | undefined, required: boolean) => {
  const siteIds = splitCsv(value);
  if (!siteIds.length) {
    if (required) {
      throw new Error("SITE_BUILDER_PILOT_GATEWAY_ALLOWED_SITE_IDS is required when the pilot Gateway is enabled.");
    }
    return new Set<string>();
  }
  if (
    siteIds.some((siteId) => !/^[A-Za-z0-9_-]{1,160}$/.test(siteId))
    || new Set(siteIds).size !== siteIds.length
    || siteIds.length !== 1
    || siteIds[0] !== PILOT_GATEWAY_SITE_ID
  ) {
    throw new Error(`SITE_BUILDER_PILOT_GATEWAY_ALLOWED_SITE_IDS must contain only ${PILOT_GATEWAY_SITE_ID}.`);
  }
  return new Set(siteIds);
};

const validateOrigins = (value: string | undefined, required: boolean) => {
  const origins = splitCsv(value);
  if (!origins.length) {
    if (required) {
      throw new Error("SITE_BUILDER_PILOT_GATEWAY_ALLOWED_ORIGINS is required when the pilot Gateway is enabled.");
    }
    return new Set<string>();
  }

  const normalized = origins.map((origin) => {
    if (origin === "*" || origin.includes("*")) {
      throw new Error("SITE_BUILDER_PILOT_GATEWAY_ALLOWED_ORIGINS does not permit wildcards.");
    }
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error("SITE_BUILDER_PILOT_GATEWAY_ALLOWED_ORIGINS must contain exact HTTP(S) origins.");
    }
    if (
      !["http:", "https:"].includes(parsed.protocol)
      || parsed.username
      || parsed.password
      || parsed.search
      || parsed.hash
      || (parsed.pathname !== "/" && parsed.pathname !== "")
      || parsed.origin !== origin
    ) {
      throw new Error("SITE_BUILDER_PILOT_GATEWAY_ALLOWED_ORIGINS must contain exact HTTP(S) origins.");
    }
    return parsed.origin;
  });

  if (new Set(normalized).size !== normalized.length) {
    throw new Error("SITE_BUILDER_PILOT_GATEWAY_ALLOWED_ORIGINS must not contain duplicates.");
  }
  return new Set(normalized);
};

const validateApiKey = (environment: Environment, required: boolean) => {
  const apiKeyRef = String(environment.SITE_BUILDER_PILOT_GATEWAY_API_KEY_REF || "").trim();
  if (!apiKeyRef) {
    if (required) {
      throw new Error("SITE_BUILDER_PILOT_GATEWAY_API_KEY_REF is required when the pilot Gateway is enabled.");
    }
    return { apiKeyRef: "", apiKey: "" };
  }
  if (!/^[A-Z][A-Z0-9_]{1,127}$/.test(apiKeyRef)) {
    throw new Error("SITE_BUILDER_PILOT_GATEWAY_API_KEY_REF must name a valid server environment variable.");
  }

  const apiKey = String(environment[apiKeyRef] || "").trim();
  if (required && !apiKey) {
    throw new Error("The server secret referenced by SITE_BUILDER_PILOT_GATEWAY_API_KEY_REF is missing.");
  }
  return { apiKeyRef, apiKey };
};

export const loadPilotGatewayConfig = (environment: Environment = process.env): PilotGatewayConfig => {
  const enabled = parseEnabled(environment.SITE_BUILDER_PILOT_GATEWAY_ENABLED);
  const prefix = validatePrefix(environment.SITE_BUILDER_PILOT_GATEWAY_PREFIX);
  const target = validateTarget(environment.SITE_BUILDER_PILOT_GATEWAY_TARGET, enabled);
  const allowedSiteIds = validateSiteIds(environment.SITE_BUILDER_PILOT_GATEWAY_ALLOWED_SITE_IDS, enabled);
  const allowedOrigins = validateOrigins(environment.SITE_BUILDER_PILOT_GATEWAY_ALLOWED_ORIGINS, enabled);
  const { apiKeyRef, apiKey } = validateApiKey(environment, enabled);

  return {
    enabled,
    prefix,
    target,
    allowedSiteIds,
    allowedOrigins,
    apiKeyRef,
    apiKey,
    bodyLimitBytes: PILOT_GATEWAY_BODY_LIMIT_BYTES,
    upstreamTimeoutMs: PILOT_GATEWAY_UPSTREAM_TIMEOUT_MS
  };
};
