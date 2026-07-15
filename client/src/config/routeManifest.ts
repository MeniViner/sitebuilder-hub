import type { HubFeaturePolicy } from "./uiMode";

export type HubRouteArea = "dashboard" | "sites" | "operations" | "settings";
export type HubRouteMode = "normal" | "advanced" | "help" | "diagnostics" | "labs";
export type HubVisibleRole = "admin" | "viewer" | "internal";

export type HubRouteDefinition = {
  id: string;
  path: string;
  label: string;
  area: HubRouteArea;
  mode: HubRouteMode;
  visibility: "primary" | "contextual" | "hidden";
  roles: readonly HubVisibleRole[];
  lazy: boolean;
};

export const HUB_ROUTE_MANIFEST = [
  { id: "dashboard", path: "/", label: "לוח בקרה", area: "dashboard", mode: "normal", visibility: "primary", roles: ["admin", "viewer"], lazy: false },
  { id: "sites", path: "/sites", label: "אתרים", area: "sites", mode: "normal", visibility: "primary", roles: ["admin", "viewer"], lazy: false },
  { id: "site-create", path: "/sites/new", label: "יצירת אתר", area: "sites", mode: "normal", visibility: "contextual", roles: ["admin"], lazy: true },
  { id: "site", path: "/sites/:id", label: "סביבת אתר", area: "sites", mode: "normal", visibility: "contextual", roles: ["admin", "viewer"], lazy: true },
  { id: "operations", path: "/operations", label: "פעולות", area: "operations", mode: "normal", visibility: "primary", roles: ["admin", "viewer"], lazy: false },
  { id: "settings", path: "/settings", label: "הגדרות", area: "settings", mode: "normal", visibility: "primary", roles: ["admin", "viewer"], lazy: false },
  { id: "advanced-settings", path: "/advanced/settings", label: "הגדרות טכניות", area: "settings", mode: "advanced", visibility: "contextual", roles: ["admin"], lazy: true },
  { id: "releases", path: "/releases", label: "גרסאות מפורטות", area: "operations", mode: "advanced", visibility: "contextual", roles: ["admin", "viewer"], lazy: true },
  { id: "backups", path: "/backups", label: "שחזור מפורט", area: "operations", mode: "advanced", visibility: "contextual", roles: ["admin", "viewer"], lazy: true },
  { id: "admins", path: "/admins", label: "הרשאות מפורטות", area: "sites", mode: "advanced", visibility: "contextual", roles: ["admin", "viewer"], lazy: true },
  { id: "monitoring", path: "/monitoring", label: "ניטור מפורט", area: "operations", mode: "advanced", visibility: "contextual", roles: ["admin", "viewer"], lazy: true },
  { id: "health", path: "/health", label: "תקינות מפורטת", area: "sites", mode: "advanced", visibility: "contextual", roles: ["admin", "viewer"], lazy: true },
  { id: "analytics", path: "/analytics", label: "ניתוח נתונים", area: "operations", mode: "advanced", visibility: "hidden", roles: ["admin", "viewer"], lazy: true },
  { id: "jobs", path: "/jobs", label: "משימות גולמיות", area: "operations", mode: "diagnostics", visibility: "hidden", roles: ["admin"], lazy: true },
  { id: "audit", path: "/audit", label: "יומן ביקורת", area: "operations", mode: "diagnostics", visibility: "hidden", roles: ["admin"], lazy: true },
  { id: "diagnostics", path: "/diagnostics", label: "אבחון", area: "settings", mode: "diagnostics", visibility: "hidden", roles: ["admin"], lazy: true },
  { id: "help", path: "/help", label: "עזרה", area: "settings", mode: "help", visibility: "contextual", roles: ["admin", "viewer"], lazy: true },
  { id: "dashboard-lab", path: "/dashboard-lab", label: "מעבדת לוח בקרה", area: "dashboard", mode: "labs", visibility: "hidden", roles: ["internal"], lazy: true },
  { id: "dashboard-design-studio", path: "/dashboard-design-studio", label: "סטודיו עיצוב", area: "dashboard", mode: "labs", visibility: "hidden", roles: ["internal"], lazy: true },
  { id: "dashboard-northstar", path: "/dashboard-northstar", label: "North Star", area: "dashboard", mode: "labs", visibility: "hidden", roles: ["internal"], lazy: true }
] as const satisfies readonly HubRouteDefinition[];

export const PRIMARY_ROUTES = HUB_ROUTE_MANIFEST.filter((route) => route.visibility === "primary");

export function isRouteModeEnabled(mode: HubRouteMode, policy: HubFeaturePolicy) {
  if (mode === "normal" || mode === "advanced") return true;
  if (mode === "labs") return policy.labs;
  return policy.mode === mode;
}

export type SiteWorkspaceArea = "overview" | "access" | "structure" | "backups" | "activity";

const legacySiteAreaMap: Record<string, SiteWorkspaceArea> = {
  overview: "overview",
  health: "overview",
  deployment: "overview",
  versions: "overview",
  access: "access",
  admins: "access",
  hosting: "structure",
  advanced: "structure",
  recovery: "backups",
  backups: "backups",
  activity: "activity",
  jobs: "activity",
  audit: "activity"
};

export function resolveSiteWorkspaceArea(value?: string | null): SiteWorkspaceArea {
  return legacySiteAreaMap[String(value ?? "").trim().toLowerCase()] || "overview";
}

export function siteWorkspaceRoute(managedSiteId: string, area?: SiteWorkspaceArea) {
  const base = `/sites/${encodeURIComponent(managedSiteId)}`;
  return area && area !== "overview" ? `${base}?area=${area}` : base;
}

