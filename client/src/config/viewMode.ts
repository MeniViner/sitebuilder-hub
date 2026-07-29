export type HubViewMode = "modern" | "legacy";

export const HUB_VIEW_MODE_STORAGE_KEY = "sitebuilder-hub-ui-mode";
export const HUB_VIEW_MODE_QUERY_KEY = "ui";

export type HubViewModeResolution = {
  mode: HubViewMode;
  source: "route-url" | "document-url" | "preference" | "default";
};

export function parseHubViewMode(value?: string | null): HubViewMode | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "modern" || normalized === "legacy" ? normalized : null;
}

export function hubViewModeFromSearch(search?: string | null) {
  return parseHubViewMode(new URLSearchParams(search || "").get(HUB_VIEW_MODE_QUERY_KEY));
}

export function hashRouteSearch(hash?: string | null) {
  const value = String(hash || "");
  const queryIndex = value.indexOf("?");
  if (queryIndex < 0) return "";
  const nestedHashIndex = value.indexOf("#", queryIndex + 1);
  return value.slice(queryIndex, nestedHashIndex < 0 ? undefined : nestedHashIndex);
}

export function resolveHubViewMode({
  routeSearch,
  documentSearch,
  storedPreference
}: {
  routeSearch?: string | null;
  documentSearch?: string | null;
  storedPreference?: string | null;
} = {}): HubViewModeResolution {
  const routeOverride = hubViewModeFromSearch(routeSearch);
  if (routeOverride) return { mode: routeOverride, source: "route-url" };

  const documentOverride = hubViewModeFromSearch(documentSearch);
  if (documentOverride) return { mode: documentOverride, source: "document-url" };

  const preference = parseHubViewMode(storedPreference);
  return preference
    ? { mode: preference, source: "preference" }
    : { mode: "modern", source: "default" };
}

export function resolveInitialHubViewMode({
  search,
  hash,
  storedPreference
}: {
  search?: string | null;
  hash?: string | null;
  storedPreference?: string | null;
} = {}) {
  return resolveHubViewMode({
    routeSearch: hashRouteSearch(hash),
    documentSearch: search,
    storedPreference
  }).mode;
}

export function withoutHubViewMode(search?: string | null) {
  const params = new URLSearchParams(search || "");
  params.delete(HUB_VIEW_MODE_QUERY_KEY);
  const value = params.toString();
  return value ? `?${value}` : "";
}
