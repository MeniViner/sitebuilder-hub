const DEFAULT_HOST = "portal.army.idf";
const DEFAULT_SITE_DB_LIBRARY = "siteDB";
const DEFAULT_USERS_DB_LIBRARY = "siteUsersDb";
const DEFAULT_BOOTSTRAP_LIBRARY = "SiteAssets";
const DEFAULT_BOOTSTRAP_FOLDER = "sitebuilder-bootstrap";

export type WidgetsDbTarget = "users" | "site";

export type SiteBuilderPathInput = {
  siteCode?: string;
  sharePointHost?: string;
  sharePointSiteUrl?: string;
  siteDbLibrary?: string;
  usersDbLibrary?: string;
  bootstrapLibrary?: string;
  bootstrapFolder?: string;
  widgetsDbTarget?: string;
};

export type SiteBuilderResolvedPaths = {
  host: string;
  siteRoot: string;
  sharePointSiteUrl: string;
  siteDbRoot: string;
  usersDbRoot: string;
  siteAssetsRoot: string;
  imagesRoot: string;
  finalDistRoot: string;
  finalAppUrl: string;
  bootstrapRoot: string;
  bootstrapDistRoot: string;
  bootstrapUrl: string;
  backupsRoot: string;
  deployManifestFile: string;
  permissionsMarkerFile: string;
  widgetsDbTarget: WidgetsDbTarget;
  txtFiles: {
    masterConfig: string;
    users: string;
    events: string;
    navigation: string;
    siteContent: string;
    theme: string;
    widgets: string;
    externalLinks: string;
  };
};

const trimSlashes = (value: string) => value.replace(/^\/+|\/+$/g, "");
const normalizeSegment = (value: unknown, fallback: string) => trimSlashes(String(value || "").trim()).split("/").filter(Boolean).pop() || fallback;
const normalizeSiteCode = (value?: string) => trimSlashes(String(value || "").trim());
const normalizeWidgetsDbTarget = (value?: string): WidgetsDbTarget => (String(value || "users").trim().toLowerCase() === "site" ? "site" : "users");

const normalizeHost = (value?: string) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return new URL(withProtocol).host;
  } catch {
    return trimmed.replace(/^https?:\/\//i, "").split("/")[0] || "";
  }
};

const toServerRelativePath = (value?: string) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  try {
    return new URL(trimmed).pathname.replace(/\/+$/g, "");
  } catch {
    return trimmed.startsWith("/") ? trimmed.replace(/\/+$/g, "") : "";
  }
};

const joinServerRelative = (...parts: string[]) => {
  const joined = parts
    .filter((part) => String(part || "").trim())
    .map((part, index) => (index === 0 ? String(part).replace(/\/+$/g, "") : trimSlashes(String(part))))
    .join("/");
  return joined.startsWith("/") ? joined : `/${joined}`;
};

const deriveSiteRoot = (sharePointSiteUrl: string | undefined, siteCode: string) => {
  const segments = toServerRelativePath(sharePointSiteUrl).split("/").filter(Boolean);
  if (segments.length >= 2 && ["sites", "teams"].includes(segments[0].toLowerCase())) {
    return `/${segments[0]}/${segments[1]}`;
  }
  return `/sites/${siteCode}`;
};

const resolveLibraryRoot = (value: string | undefined, fallbackName: string, siteRoot: string) => {
  const serverRelative = toServerRelativePath(value);
  if (serverRelative) {
    const segments = serverRelative.split("/").filter(Boolean);
    if (segments.length >= 3 && ["sites", "teams"].includes(segments[0].toLowerCase())) return serverRelative;
    return joinServerRelative(siteRoot, normalizeSegment(serverRelative, fallbackName));
  }
  return joinServerRelative(siteRoot, normalizeSegment(value, fallbackName));
};

const buildAbsoluteUrl = (host: string, serverRelativePath: string) =>
  `https://${host}${serverRelativePath.startsWith("/") ? serverRelativePath : `/${serverRelativePath}`}`;

export const resolveSiteBuilderPaths = (input: SiteBuilderPathInput): SiteBuilderResolvedPaths | null => {
  const siteCode = normalizeSiteCode(input.siteCode);
  if (!siteCode) return null;

  const host = normalizeHost(input.sharePointHost || input.sharePointSiteUrl) || DEFAULT_HOST;
  const siteRoot = deriveSiteRoot(input.sharePointSiteUrl, siteCode);
  const siteDbLibrary = normalizeSegment(input.siteDbLibrary, DEFAULT_SITE_DB_LIBRARY);
  const usersDbLibrary = normalizeSegment(input.usersDbLibrary, DEFAULT_USERS_DB_LIBRARY);
  const bootstrapLibrary = normalizeSegment(input.bootstrapLibrary, DEFAULT_BOOTSTRAP_LIBRARY);
  const bootstrapFolder = normalizeSegment(input.bootstrapFolder, DEFAULT_BOOTSTRAP_FOLDER);
  const widgetsDbTarget = normalizeWidgetsDbTarget(input.widgetsDbTarget);
  const siteDbRoot = resolveLibraryRoot(input.siteDbLibrary, siteDbLibrary, siteRoot);
  const usersDbRoot = resolveLibraryRoot(input.usersDbLibrary, usersDbLibrary, siteRoot);
  const siteAssetsRoot = joinServerRelative(siteDbRoot, "siteAssets");
  const imagesRoot = joinServerRelative(siteDbRoot, "images");
  const finalDistRoot = joinServerRelative(siteDbRoot, "dist");
  const bootstrapRoot = joinServerRelative(siteRoot, bootstrapLibrary, bootstrapFolder);
  const bootstrapDistRoot = joinServerRelative(bootstrapRoot, "dist");
  const backupsRoot = joinServerRelative(siteAssetsRoot, "Backups");
  const widgetsRoot = widgetsDbTarget === "users" ? usersDbRoot : siteAssetsRoot;

  return {
    host,
    siteRoot,
    sharePointSiteUrl: buildAbsoluteUrl(host, siteRoot),
    siteDbRoot,
    usersDbRoot,
    siteAssetsRoot,
    imagesRoot,
    finalDistRoot,
    finalAppUrl: `${buildAbsoluteUrl(host, finalDistRoot)}/index.html`,
    bootstrapRoot,
    bootstrapDistRoot,
    bootstrapUrl: `${buildAbsoluteUrl(host, bootstrapDistRoot)}/index.html#/admin/sharepoint-setup`,
    backupsRoot,
    deployManifestFile: joinServerRelative(bootstrapDistRoot, "sharepoint-deploy-manifest.json"),
    permissionsMarkerFile: joinServerRelative(usersDbRoot, ".permissions-setup.json"),
    widgetsDbTarget,
    txtFiles: {
      masterConfig: joinServerRelative(siteAssetsRoot, "bihs_master_config_v1.txt"),
      users: joinServerRelative(siteAssetsRoot, "users_data.txt"),
      events: joinServerRelative(siteAssetsRoot, "events_data.txt"),
      navigation: joinServerRelative(siteAssetsRoot, "nav_data.txt"),
      siteContent: joinServerRelative(siteAssetsRoot, "site_content_data.txt"),
      theme: joinServerRelative(siteAssetsRoot, "theme_data.txt"),
      widgets: joinServerRelative(widgetsRoot, "widgets_data.txt"),
      externalLinks: joinServerRelative(siteAssetsRoot, "external_links_data.txt")
    }
  };
};
