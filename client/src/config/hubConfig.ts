type HubRuntimeConfig = {
  apiBaseUrl?: string;
  API_BASE_URL?: string;
};

declare global {
  interface Window {
    SiteBuilderHubConfig?: HubRuntimeConfig;
    SITEBUILDER_HUB_CONFIG?: HubRuntimeConfig;
  }
}

const DEFAULT_API_BASE_URL = "http://localhost:4100/api";
const API_BASE_URL_STORAGE_KEY = "sitebuilderHub.apiBaseUrl";

const cleanBaseUrl = (value?: string | null) => String(value || "").trim().replace(/\/+$/, "");

const getRuntimeConfigApiBaseUrl = () => {
  if (typeof window === "undefined") return "";
  const config = window.SiteBuilderHubConfig || window.SITEBUILDER_HUB_CONFIG || {};
  return cleanBaseUrl(config.apiBaseUrl || config.API_BASE_URL);
};

const getStoredApiBaseUrl = () => {
  if (typeof window === "undefined") return "";
  try {
    return cleanBaseUrl(window.localStorage?.getItem(API_BASE_URL_STORAGE_KEY));
  } catch {
    return "";
  }
};

const getQueryApiBaseUrl = () => {
  if (typeof window === "undefined") return "";
  const search = new URLSearchParams(window.location?.search || "");
  const fromSearch = cleanBaseUrl(search.get("hubApiBaseUrl") || search.get("apiBaseUrl"));
  if (fromSearch) return fromSearch;

  const hash = window.location?.hash || "";
  const hashQuery = hash.includes("?") ? hash.split("?").slice(1).join("?") : "";
  if (!hashQuery) return "";
  const hashParams = new URLSearchParams(hashQuery);
  return cleanBaseUrl(hashParams.get("hubApiBaseUrl") || hashParams.get("apiBaseUrl"));
};

export function resolveHubApiBaseUrl() {
  return (
    getQueryApiBaseUrl() ||
    getRuntimeConfigApiBaseUrl() ||
    getStoredApiBaseUrl() ||
    cleanBaseUrl(import.meta.env.VITE_API_BASE_URL) ||
    DEFAULT_API_BASE_URL
  );
}

export function getHubApiBaseUrlSource() {
  if (getQueryApiBaseUrl()) return "query";
  if (getRuntimeConfigApiBaseUrl()) return "hub-config";
  if (getStoredApiBaseUrl()) return "localStorage";
  if (cleanBaseUrl(import.meta.env.VITE_API_BASE_URL)) return "env";
  return "default";
}

export const API_BASE_URL = resolveHubApiBaseUrl();
export const API_BASE_URL_SOURCE = getHubApiBaseUrlSource();
