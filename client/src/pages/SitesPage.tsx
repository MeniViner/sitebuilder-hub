import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCcw, Search, SlidersHorizontal } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { sitesApi, type BrowserDeployEvidencePayload, type DeploymentVerificationEvidence, type OperationCapabilities, type Release, type WhoAmIResult } from "../api/sitesApi";
import { DerivedHealthStatus, Site, SiteStatus, SitesStats } from "../types/site";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DetailsDrawer } from "../components/DetailsDrawer";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { FilterBar } from "../components/FilterBar";
import { KpiCard } from "../components/KpiCard";
import { LoadingState } from "../components/LoadingState";
import { MetadataOnlyBadge } from "../components/MetadataOnlyBadge";
import { GuidedFlow, ModeBoundary, OperationalSummary } from "../components/OperationalSummary";
import { PageHeader } from "../components/PageHeader";
import { SectionCard } from "../components/SectionCard";
import { SiteFormModal, SiteFormSaveOptions } from "../components/SiteFormModal";
import { SitesTable } from "../components/SitesTable";
import { formatMb, formatNumber } from "../utils/format";
import { resolveSiteBuilderPaths, type SiteBuilderResolvedPaths } from "../utils/sitebuilderPaths";
import {
  ensureSharePointDocumentLibraryBrowser,
  ensureSharePointFolderHierarchyBrowser,
  ensureSharePointTextFileIfMissingBrowser,
  deployArtifactToSharePointBrowser,
  readSharePointFileBrowser
} from "../utils/sharepointBrowserConnector";
import { requestDigestForBrowserOperation, uploadBinaryFileForBrowserOperation } from "../utils/sharepointBrowserOperationRunner";
import {
  deriveRequiredFoldersFromArtifactFilePaths,
  manifestFilesForPlan
} from "../utils/artifactCompatibility";
import { buildDeploymentMetadataFile, DEPLOYMENT_METADATA_FILE } from "../utils/deploymentMetadata";

type AuthUser = NonNullable<WhoAmIResult["user"]>;

const defaultStats: SitesStats = {
  total: 0,
  active: 0,
  warning: 0,
  failed: 0,
  archived: 0,
  totalStorageMb: 0,
  health: { healthy: 0, warning: 0, failed: 0, unknown: 0 }
};

const DEFAULT_GANTT_DATA = {
  enabled: false,
  buttonLabel: "גאנט עבודה",
  pageTitle: "גאנט עבודה",
  description: "",
  groupBy: "category",
  defaultView: "month",
  showLegend: true,
  showToday: true,
  categories: [],
  items: []
};

const normalizeAdminKey = (admin: NonNullable<Site["txtAdmins"]>[number]) =>
  [
    admin.loginName?.trim().toLowerCase(),
    admin.email?.trim().toLowerCase(),
    admin.personalNumber?.trim().toLowerCase(),
    admin.displayName?.trim().toLowerCase()
  ].find(Boolean) || "";

const initialUsersForSite = (site: Site) => {
  const candidates = [
    {
      displayName: site.ownerName,
      personalNumber: site.ownerPersonalNumber,
      email: site.ownerEmail,
      loginName: ""
    },
    ...(site.txtAdmins || [])
  ];
  const seen = new Set<string>();
  return candidates.flatMap((admin, index) => {
    const normalized = {
      id: index + 1,
      name: String(admin.displayName || "").trim() || String(admin.personalNumber || admin.email || "").trim(),
      role: "admin",
      personalNumber: String(admin.personalNumber || "").trim(),
      email: String(admin.email || "").trim(),
      loginName: String(admin.loginName || "").trim()
    };
    const key = normalizeAdminKey(normalized);
    if (!key || seen.has(key)) return [];
    seen.add(key);
    return [normalized];
  });
};

const defaultTxtSeedFiles = (site: Site, paths: SiteBuilderResolvedPaths) => [
  { path: paths.txtFiles.masterConfig, content: JSON.stringify({ schemaVersion: "1.0.0" }, null, 2) },
  { path: paths.txtFiles.users, content: JSON.stringify(initialUsersForSite(site), null, 2) },
  { path: paths.txtFiles.events, content: JSON.stringify({ displayCount: 3, displayMode: "default", events: [] }, null, 2) },
  { path: paths.txtFiles.navigation, content: JSON.stringify([], null, 2) },
  { path: paths.txtFiles.siteContent, content: JSON.stringify({}, null, 2) },
  { path: paths.txtFiles.theme, content: JSON.stringify({}, null, 2) },
  { path: paths.txtFiles.widgets, content: JSON.stringify({}, null, 2) },
  { path: paths.txtFiles.externalLinks, content: JSON.stringify([], null, 2) },
  { path: paths.txtFiles.gantt, content: JSON.stringify(DEFAULT_GANTT_DATA, null, 2) }
];

const displayBackendHost = (value?: string) => {
  const trimmed = String(value || "").trim().replace(/\/+$/g, "");
  if (!trimmed) return "";
  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed.replace(/[?#].*$/g, "");
  }
};

export function SitesPage({ authUser }: { authUser?: AuthUser | null }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [allSites, setAllSites] = useState<Site[]>([]);
  const [stats, setStats] = useState<SitesStats>(defaultStats);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | SiteStatus>("all");
  const [healthFilter, setHealthFilter] = useState<"all" | DerivedHealthStatus>("all");
  const [versionFilter, setVersionFilter] = useState<"all" | "outdated" | "up_to_date" | "unknown">("all");
  const [sortBy, setSortBy] = useState<"updatedAt" | "createdAt" | "lastHealthCheckAt" | "displayName">("updatedAt");
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);
  const [siteToArchive, setSiteToArchive] = useState<Site | null>(null);
  const [siteToRestore, setSiteToRestore] = useState<Site | null>(null);
  const [siteToDelete, setSiteToDelete] = useState<Site | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"active" | "archive">("active");
  const [notice, setNotice] = useState("");
  const [operationCapabilities, setOperationCapabilities] = useState<OperationCapabilities | null>(null);
  const [releases, setReleases] = useState<Release[]>([]);
  const [releasesLoading, setReleasesLoading] = useState(false);

  const loadSites = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await sitesApi.list({ includeArchived: "true" });
      setAllSites(response.data);
      setStats(response.meta?.stats ?? defaultStats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בטעינת רשימת אתרים");
    } finally {
      setLoading(false);
    }
  };

  const loadOperationCapabilities = async () => {
    try {
      const response = await sitesApi.operationCapabilities();
      setOperationCapabilities(response.data);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "שגיאה בטעינת הגדרות Builder backend");
    }
  };

  const loadReleases = async () => {
    setReleasesLoading(true);
    try {
      const response = await sitesApi.releases();
      setReleases(response.data);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "שגיאה בטעינת Releases");
    } finally {
      setReleasesLoading(false);
    }
  };

  useEffect(() => { loadSites(); }, []);
  useEffect(() => { void loadOperationCapabilities(); }, []);
  useEffect(() => { void loadReleases(); }, []);

  useEffect(() => {
    const editId = searchParams.get("edit");
    if (!editId || allSites.length === 0) return;
    const found = allSites.find((site) => site._id === editId);
    if (found) {
      setSelectedSite(found);
      setModalOpen(true);
      setSearchParams({});
    }
  }, [searchParams, allSites, setSearchParams]);

  const sites = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return allSites
      .filter((site) => activeTab === "archive" ? site.status === "archived" : site.status !== "archived")
      .filter((site) => !needle || [site.displayName, site.siteCode, site.ownerName, site.ownerPersonalNumber, site.unitName, site.ownerEmail].some((value) => (value || "").toLowerCase().includes(needle)))
      .filter((site) => (statusFilter === "all" ? true : site.status === statusFilter))
      .filter((site) => (healthFilter === "all" ? true : site.derivedHealthStatus === healthFilter))
      .filter((site) => (versionFilter === "all" ? true : (site.versionStatus || "unknown") === versionFilter))
      .sort((a, b) => {
        if (sortBy === "displayName") return a.displayName.localeCompare(b.displayName, "he");
        return new Date((b as any)[sortBy] || 0).getTime() - new Date((a as any)[sortBy] || 0).getTime();
      });
  }, [activeTab, allSites, search, statusFilter, healthFilter, versionFilter, sortBy]);

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setHealthFilter("all");
    setVersionFilter("all");
    setSortBy("updatedAt");
  };

  const activeFilterCount = [statusFilter !== "all", healthFilter !== "all", versionFilter !== "all", sortBy !== "updatedAt"].filter(Boolean).length;
  const hasVisibleFilters = Boolean(search.trim()) || activeFilterCount > 0;

  const resolveBrowserPaths = (site: Site, runtimeConfigPath?: string) => {
    const paths = resolveSiteBuilderPaths({
      siteCode: site.siteCode,
      sharePointHost: site.sharePointHost,
      sharePointSiteUrl: site.sharePointSiteUrl,
      siteDbLibrary: site.siteDbLibrary,
      usersDbLibrary: site.usersDbLibrary,
      bootstrapLibrary: site.bootstrapLibrary,
      bootstrapFolder: site.bootstrapFolder,
      widgetsDbTarget: site.widgetsDbTarget,
      runtimeConfigPath
    });
    if (!paths) throw new Error("sharepoint-paths-missing");
    return paths;
  };

  const ensureBrowserSharePointHosting = async (
    site: Site,
    paths: SiteBuilderResolvedPaths,
    steps: Array<{ step: string; status: "succeeded" | "failed" | "skipped"; path?: string; httpStatus?: number; error?: string }>
  ) => {
    const targetSiteUrl = paths.sharePointSiteUrl || site.sharePointSiteUrl;
    await requestDigestForBrowserOperation(targetSiteUrl);
    steps.push({ step: "sharepoint-request-digest", status: "succeeded", path: targetSiteUrl });

    const siteDb = await ensureSharePointDocumentLibraryBrowser(paths, paths.siteDbLibrary, paths.siteDbRoot);
    steps.push({ step: "sharepoint-library-site-db", status: "succeeded", path: paths.siteDbRoot, httpStatus: siteDb.httpStatus });

    if (paths.usersDbRoot === paths.siteDbRoot) {
      steps.push({ step: "sharepoint-library-users-db", status: "skipped", path: paths.usersDbRoot });
    } else {
      const usersDb = await ensureSharePointDocumentLibraryBrowser(paths, paths.usersDbLibrary, paths.usersDbRoot);
      steps.push({ step: "sharepoint-library-users-db", status: "succeeded", path: paths.usersDbRoot, httpStatus: usersDb.httpStatus });
    }

    for (const [step, folder] of [
      ["sharepoint-folder-site-assets", paths.siteAssetsRoot],
      ["sharepoint-folder-images", paths.imagesRoot],
      ["sharepoint-folder-dist", paths.finalDistRoot],
      ["sharepoint-folder-dist-assets", `${paths.finalDistRoot}/assets`]
    ] as const) {
      await ensureSharePointFolderHierarchyBrowser(paths, folder);
      steps.push({ step, status: "succeeded", path: folder });
    }
  };

  const runTxtBrowserSharePointProvisioning = async (site: Site) => {
    const paths = resolveBrowserPaths(site);
    const targetSiteUrl = paths.sharePointSiteUrl || site.sharePointSiteUrl;
    const steps: Array<{ step: string; status: "succeeded" | "failed" | "skipped"; path?: string; httpStatus?: number; error?: string }> = [];

    try {
      await ensureBrowserSharePointHosting(site, paths, steps);

      for (const file of defaultTxtSeedFiles(site, paths)) {
        const result = await ensureSharePointTextFileIfMissingBrowser({ paths, targetPath: file.path, content: file.content });
        if (result.status === "failed") {
          steps.push({ step: "txt-seed-file", status: "failed", path: file.path, httpStatus: result.httpStatus, error: result.error });
          throw new Error(result.error || `txt-seed-file-failed:${file.path}`);
        }
        steps.push({ step: "txt-seed-file", status: "succeeded", path: file.path, httpStatus: result.httpStatus });
      }

      await sitesApi.recordBrowserSharePointHealth(site._id, {
        checkedAt: new Date().toISOString(),
        siteId: site._id,
        siteCode: site.siteCode,
        connectorMode: "browser-sharepoint",
        targetSharePointSiteUrl: targetSiteUrl,
        source: "Browser SharePoint",
        resolvedPaths: paths as unknown as Record<string, unknown>,
        derivedHealthStatus: "warning",
        health: {
          siteDbExists: true,
          usersDbExists: true,
          distExists: true,
          assetsExists: true,
          indexExists: false,
          txtFilesExist: true
        },
        evidence: steps.map((step) => ({
          key: step.step.includes("users-db") ? "usersDbExists" : step.step.includes("site-db") ? "siteDbExists" : step.step.includes("dist") ? "distExists" : step.step.includes("txt") ? "txtFile" : "assetsExists",
          label: step.step,
          url: step.path || targetSiteUrl,
          ok: step.status !== "failed",
          status: step.httpStatus,
          error: step.error
        })),
        note: "TXT-backed Create New Site provisioned through Browser SharePoint before initial deploy."
      });

      return { ok: true, steps };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      steps.push({ step: "browser-sharepoint-provisioning", status: "failed", path: targetSiteUrl, error: message });
      await sitesApi.recordBrowserSharePointHealth(site._id, {
        checkedAt: new Date().toISOString(),
        siteId: site._id,
        siteCode: site.siteCode,
        connectorMode: "browser-sharepoint",
        targetSharePointSiteUrl: targetSiteUrl,
        source: "Browser SharePoint",
        resolvedPaths: paths as unknown as Record<string, unknown>,
        derivedHealthStatus: "failed",
        health: {
          siteDbExists: false,
          usersDbExists: false,
          distExists: false,
          assetsExists: false,
          indexExists: false,
          txtFilesExist: false
        },
        evidence: steps.map((step) => ({
          key: "txtFile",
          label: step.step,
          url: step.path || targetSiteUrl,
          ok: false,
          status: step.httpStatus,
          error: step.error || message
        })),
        note: message
      }).catch(() => undefined);
      throw error;
    }
  };

  const runMongoBrowserSharePointHostingProvisioning = async (site: Site) => {
    const paths = resolveBrowserPaths(site);
    const targetSiteUrl = paths.sharePointSiteUrl || site.sharePointSiteUrl;
    const steps: Array<{ step: string; status: "succeeded" | "failed" | "skipped"; path?: string; httpStatus?: number; error?: string }> = [];

    try {
      await ensureBrowserSharePointHosting(site, paths, steps);
      await sitesApi.recordMongoCreateBrowserEvidence(site._id, {
        connectorMode: "browser-sharepoint",
        targetSharePointSiteUrl: targetSiteUrl,
        capturedAt: new Date().toISOString(),
        steps,
        runtimeConfig: {
          path: site.runtimeConfigPath || paths.runtimeConfigPath,
          uploaded: false,
          verified: false,
          storageBackend: "mongo",
          backendApiUrlHost: displayBackendHost(site.backendApiUrl),
          siteId: site.mongoSiteId || site.builderSiteId || site.siteCode,
          apiKeyConfigured: Boolean(site.builderApiKeyRef)
        },
        hosting: {
          siteDbRootReady: true,
          usersDbRootReady: true,
          finalDistRootReady: true,
          siteAssetsRootReady: true,
          assetsFolderReady: true,
          indexHtmlVerified: false
        },
        warnings: ["תשתית SharePoint נוצרה/אומתה. runtime config ו־initial deploy עדיין לא הושלמו."]
      });
      return { ok: true, steps };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      steps.push({ step: "browser-sharepoint-hosting-provision", status: "failed", path: targetSiteUrl, error: message });
      await sitesApi.recordMongoCreateBrowserEvidence(site._id, {
        connectorMode: "browser-sharepoint",
        targetSharePointSiteUrl: targetSiteUrl,
        capturedAt: new Date().toISOString(),
        steps,
        runtimeConfig: {
          path: site.runtimeConfigPath || paths.runtimeConfigPath,
          uploaded: false,
          verified: false,
          storageBackend: "mongo",
          backendApiUrlHost: displayBackendHost(site.backendApiUrl),
          siteId: site.mongoSiteId || site.builderSiteId || site.siteCode,
          apiKeyConfigured: Boolean(site.builderApiKeyRef)
        },
        hosting: {
          siteDbRootReady: false,
          usersDbRootReady: false,
          finalDistRootReady: false,
          siteAssetsRootReady: false,
          assetsFolderReady: false,
          indexHtmlVerified: false
        },
        warnings: [message]
      }).catch(() => undefined);
      throw error;
    }
  };

  const runMongoBrowserRuntimeConfigSetup = async (site: Site) => {
    const runtimeConfig = await sitesApi.mongoRuntimeConfigContent(site._id);
    const paths = resolveBrowserPaths(site, runtimeConfig.data.runtimeConfigPath);
    const targetSiteUrl = paths.sharePointSiteUrl || site.sharePointSiteUrl;
    const steps: Array<{ step: string; status: "succeeded" | "failed" | "skipped"; path?: string; httpStatus?: number; error?: string }> = [];

    try {
      await ensureBrowserSharePointHosting(site, paths, steps);

      const encoded = new TextEncoder().encode(runtimeConfig.data.content);
      const upload = await uploadBinaryFileForBrowserOperation({
        targetSiteUrl,
        targetPath: runtimeConfig.data.runtimeConfigPath,
        relativePath: runtimeConfig.data.runtimeConfigPath.split("/").pop() || "sitebuilder-runtime-config.json",
        body: encoded,
        contentType: runtimeConfig.data.contentType,
        expectedSizeBytes: runtimeConfig.data.sizeBytes,
        expectedSha256: runtimeConfig.data.sha256
      });
      if (upload.status !== "uploaded") {
        steps.push({ step: "upload-runtime-config", status: "failed", path: runtimeConfig.data.runtimeConfigPath, httpStatus: upload.httpStatus, error: upload.error });
        throw new Error(upload.error || "runtime-config-upload-failed");
      }
      steps.push({ step: "upload-runtime-config", status: "succeeded", path: runtimeConfig.data.runtimeConfigPath, httpStatus: upload.httpStatus });

      const runtimeReadBack = await verifyMongoRuntimeConfigReadBack(site, runtimeConfig.data);
      steps.push(runtimeReadBack.step);

      await sitesApi.recordMongoCreateBrowserEvidence(site._id, {
        connectorMode: "browser-sharepoint",
        targetSharePointSiteUrl: targetSiteUrl,
        capturedAt: new Date().toISOString(),
        steps,
        runtimeConfig: {
          path: runtimeConfig.data.runtimeConfigPath,
          uploaded: upload.status === "uploaded",
          verified: runtimeReadBack.verified,
          storageBackend: "mongo",
          backendApiUrlHost: String(runtimeConfig.data.redactedPreview.backendApiUrl || ""),
          siteId: String(runtimeConfig.data.redactedPreview.siteId || ""),
          apiKeyConfigured: runtimeConfig.data.redactedPreview.apiKey === "[configured]"
        },
        hosting: {
          siteDbRootReady: true,
          usersDbRootReady: true,
          finalDistRootReady: true,
          siteAssetsRootReady: true,
          assetsFolderReady: true,
          indexHtmlVerified: false
        },
        warnings: ["לאחר יצירת תשתית SharePoint ו־runtime config ניתן להריץ פריסה ראשונית; index.html יאומת אחרי deploy."]
      });

      return { ok: true, steps };
    } catch (error) {
      await sitesApi.recordMongoCreateBrowserEvidence(site._id, {
        connectorMode: "browser-sharepoint",
        targetSharePointSiteUrl: targetSiteUrl,
        capturedAt: new Date().toISOString(),
        steps: steps.length ? steps : [{ step: "browser-sharepoint-runtime-config", status: "failed", path: runtimeConfig.data.runtimeConfigPath, error: error instanceof Error ? error.message : String(error) }],
        runtimeConfig: {
          path: runtimeConfig.data.runtimeConfigPath,
          uploaded: false,
          verified: false,
          storageBackend: "mongo",
          backendApiUrlHost: String(runtimeConfig.data.redactedPreview.backendApiUrl || ""),
          siteId: String(runtimeConfig.data.redactedPreview.siteId || ""),
          apiKeyConfigured: runtimeConfig.data.redactedPreview.apiKey === "[configured]"
        },
        hosting: {
          siteDbRootReady: false,
          usersDbRootReady: false,
          finalDistRootReady: false,
          siteAssetsRootReady: false,
          assetsFolderReady: false,
          indexHtmlVerified: false
        },
        warnings: [error instanceof Error ? error.message : String(error)]
      }).catch(() => undefined);
      throw error;
    }
  };

  const verifyMongoRuntimeConfigReadBack = async (
    site: Site,
    runtimeConfigData?: Awaited<ReturnType<typeof sitesApi.mongoRuntimeConfigContent>>["data"]
  ) => {
    const runtimeConfig = runtimeConfigData || (await sitesApi.mongoRuntimeConfigContent(site._id)).data;
    const paths = resolveBrowserPaths(site, runtimeConfig.runtimeConfigPath);
    const targetSiteUrl = paths.sharePointSiteUrl || site.sharePointSiteUrl;
    const readBack = await readSharePointFileBrowser(targetSiteUrl, runtimeConfig.runtimeConfigPath);
    const readBackText = readBack.bytes ? new TextDecoder().decode(readBack.bytes) : "";
    let parsed: Record<string, unknown> = {};
    try {
      parsed = readBackText ? JSON.parse(readBackText) : {};
    } catch {
      parsed = {};
    }
    const expectedBackendApiUrl = String(runtimeConfig.redactedPreview.backendApiUrl || "");
    const expectedSiteId = String(runtimeConfig.redactedPreview.siteId || "");
    const runtimeVerified = Boolean(
      readBack.ok &&
      parsed.storageBackend === "mongo" &&
      String(parsed.backendApiUrl || "") === expectedBackendApiUrl &&
      String(parsed.siteId || "") === expectedSiteId &&
      Boolean(parsed.apiKey)
    );
    return {
      verified: runtimeVerified,
      path: runtimeConfig.runtimeConfigPath,
      backendApiUrlHost: expectedBackendApiUrl,
      siteId: expectedSiteId,
      apiKeyConfigured: Boolean(parsed.apiKey),
      step: {
        step: "verify-runtime-config-readback",
        status: runtimeVerified ? "succeeded" as const : "failed" as const,
        path: runtimeConfig.runtimeConfigPath,
        httpStatus: readBack.status,
        error: runtimeVerified ? undefined : readBack.error || "runtime-config-readback-invalid"
      }
    };
  };

  const failedDeployEvidenceForPlan = (
    files: Array<{ relativePath: string; targetPath: string; sizeBytes: number; sha256: string }>,
    error: unknown
  ): DeploymentVerificationEvidence[] =>
    files.map((file) => ({
      relativePath: file.relativePath,
      sourcePath: `artifact:${file.relativePath}`,
      targetPath: file.targetPath,
      status: "failed",
      checkedAt: new Date().toISOString(),
      expectedSizeBytes: file.sizeBytes,
      actualSizeBytes: 0,
      expectedSha256: file.sha256,
      actualSha256: "",
      sizeMatches: false,
      sha256Matches: false,
      error: error instanceof Error ? error.message : String(error)
    }));

  const runInitialBrowserDeploy = async (
    site: Site,
    releaseId: string,
    options: { allowUnknownCompatibility?: boolean; storageBackend?: "txt" | "mongo" } = {}
  ) => {
    const storageBackend = options.storageBackend || (site.storageBackend === "txt" ? "txt" : "mongo");
    const manifestResponse = await sitesApi.releaseArtifactManifest(releaseId);
    const manifest = manifestResponse.data;
    const compatibility = manifest.compatibility || {
      storageCompatibility: manifest.summary.storageCompatibility || [],
      artifactKind: manifest.summary.artifactKind || "unknown",
      requiresRuntimeConfig: Boolean(manifest.summary.requiresRuntimeConfig),
      preservesRuntimeConfig: manifest.summary.preservesRuntimeConfig !== false,
      requiredFolders: manifest.summary.requiredFolders || [],
      runtimeConfigFiles: manifest.summary.runtimeConfigFiles || [],
      compatibilitySource: manifest.summary.compatibilitySource || "unknown",
      compatibilityWarnings: []
    };
    const compatible = compatibility.storageCompatibility.includes(storageBackend);
    const unknownAllowed = compatibility.storageCompatibility.length === 0 && options.allowUnknownCompatibility === true;
    if (!compatible && !unknownAllowed) {
      throw new Error(storageBackend === "mongo" ? "ה־Release הזה לא תואם לאתר Mongo." : "ה־Release הזה לא תואם לאתר TXT legacy.");
    }
    if (storageBackend === "mongo" && compatibility.preservesRuntimeConfig === false) {
      throw new Error("ה־Release הזה אינו מצהיר שהוא שומר runtime config.");
    }
    if (!manifest.summary.readyForDeploy) throw new Error("ה־artifact חסר או לא תקין.");

    const planResponse = await sitesApi.deploySiteVersionPlan(site._id, releaseId, "local-dev-owner", "browser-sharepoint");
    const plan = planResponse.data;
    if (!plan.summary.readyForDeploy) throw new Error("ה־artifact חסר או לא תקין.");
    if (plan.summary.readyForDeployExecution === false && plan.missingRequirements?.length) {
      throw new Error(plan.missingRequirements.join("; "));
    }

    const paths = resolveBrowserPaths(site, site.runtimeConfigPath || plan.target?.runtimeConfigPath);
    const targetSiteUrl = plan.target?.sharePointSiteUrl || paths.sharePointSiteUrl || site.sharePointSiteUrl;
    const targetDistPath = plan.target?.targetDistPath || paths.finalDistRoot;
    const steps: Array<{ step: string; status: "succeeded" | "failed" | "skipped"; path?: string; httpStatus?: number; error?: string }> = [];
    await ensureBrowserSharePointHosting(site, paths, steps);

    const deployFiles = manifestFilesForPlan(plan.files, manifest.files);
    const requiredFolders = deriveRequiredFoldersFromArtifactFilePaths(deployFiles.filter((file) => file.deployable).map((file) => file.relativePath));
    for (const folder of requiredFolders) {
      const targetFolder = `${targetDistPath.replace(/\/+$/g, "")}/${folder}`;
      await ensureSharePointFolderHierarchyBrowser(paths, targetFolder);
      steps.push({ step: "artifact-required-folder", status: "succeeded", path: targetFolder });
    }

    const startedAt = new Date().toISOString();
    let deployEvidenceRecorded = false;
    try {
      const deploymentMetadata = await buildDeploymentMetadataFile({
        releaseId,
        releaseVersion: plan.releaseVersion,
        operation: "deploy",
        site,
        targetSiteUrl,
        targetDistPath,
        finalAppUrl: plan.target?.finalAppUrl || paths.finalAppUrl
      });
      const browserDeploy = await deployArtifactToSharePointBrowser({
        releaseId,
        siteId: site._id,
        siteCode: site.siteCode,
        targetSiteUrl,
        targetDistPath,
        finalAppUrl: plan.target?.finalAppUrl || paths.finalAppUrl,
        files: [...deployFiles, deploymentMetadata.file],
        loadArtifactFile: async (relativePath) => {
          if (relativePath === DEPLOYMENT_METADATA_FILE) {
            return deploymentMetadata.response;
          }
          return sitesApi.releaseArtifactFile(releaseId, relativePath);
        }
      });
      const versionBefore = site.currentVersion || site.version || "";
      const finalAppUrlVerified = browserDeploy.finalAppUrlVerification ? browserDeploy.finalAppUrlVerification.ok === true : true;
      const effectiveFinalStatus = browserDeploy.finalStatus === "success" && finalAppUrlVerified ? "success" : "failed";
      const finalAppUrlError = browserDeploy.finalAppUrlVerification && !browserDeploy.finalAppUrlVerification.ok
        ? browserDeploy.finalAppUrlVerification.error || "final-app-url-verification-failed"
        : "";
      const browserDeployErrors = finalAppUrlError
        ? [...browserDeploy.errors, { error: finalAppUrlError, status: browserDeploy.finalAppUrlVerification?.status }]
        : browserDeploy.errors;
      const evidencePayload: BrowserDeployEvidencePayload = {
        releaseId,
        deployMode: "local-dev-owner",
        connectorMode: "browser-sharepoint",
        targetSite: {
          siteId: site._id,
          siteCode: site.siteCode,
          sharePointSiteUrl: targetSiteUrl
        },
        targetPaths: {
          targetDistPath,
          finalAppUrl: plan.target?.finalAppUrl || paths.finalAppUrl
        },
        uploadedFilesEvidence: browserDeploy.uploadedFilesEvidence,
        readBackEvidence: browserDeploy.readBackEvidence,
        finalAppUrlVerification: browserDeploy.finalAppUrlVerification,
        errors: browserDeployErrors,
        startedAt: browserDeploy.startedAt,
        completedAt: browserDeploy.completedAt,
        finalStatus: effectiveFinalStatus,
        versionBefore,
        versionAfter: effectiveFinalStatus === "success" ? plan.releaseVersion : versionBefore
      };
      const evidenceResponse = await sitesApi.recordBrowserDeployEvidence(site._id, evidencePayload);
      deployEvidenceRecorded = true;
      if (browserDeploy.finalStatus !== "success") {
        throw new Error(browserDeploy.errors.map((item) => item.error).filter(Boolean).join("; ") || "initial-browser-deploy-failed");
      }
      if (!finalAppUrlVerified) {
        throw new Error(finalAppUrlError || "final-app-url-verification-failed");
      }

      const indexVerified = browserDeploy.readBackEvidence.some((item) => item.relativePath === "index.html" && item.status === "verified" && item.sizeMatches && item.sha256Matches);
      if (!indexVerified) throw new Error("index.html לא אומת אחרי הפריסה הראשונית.");

      let runtimeConfigVerified = true;
      let runtimeEvidence: Awaited<ReturnType<typeof verifyMongoRuntimeConfigReadBack>> | null = null;
      if (storageBackend === "mongo") {
        runtimeEvidence = await verifyMongoRuntimeConfigReadBack(site);
        runtimeConfigVerified = runtimeEvidence.verified;
        steps.push(runtimeEvidence.step);
        await sitesApi.recordMongoCreateBrowserEvidence(site._id, {
          connectorMode: "browser-sharepoint",
          targetSharePointSiteUrl: targetSiteUrl,
          capturedAt: new Date().toISOString(),
          steps,
          runtimeConfig: {
            path: runtimeEvidence.path,
            uploaded: true,
            verified: runtimeEvidence.verified,
            storageBackend: "mongo",
            backendApiUrlHost: runtimeEvidence.backendApiUrlHost,
            siteId: runtimeEvidence.siteId,
            apiKeyConfigured: runtimeEvidence.apiKeyConfigured
          },
          hosting: {
            siteDbRootReady: true,
            usersDbRootReady: true,
            finalDistRootReady: true,
            siteAssetsRootReady: true,
            assetsFolderReady: true,
            indexHtmlVerified: indexVerified
          },
          warnings: compatibility.runtimeConfigFiles.length
            ? ["ה־artifact כולל runtime config. ברירת המחדל היא לשמור את הקובץ שנוצר לאתר ולא לדרוס אותו."]
            : []
        });
      } else {
        await sitesApi.recordBrowserSharePointHealth(site._id, {
          checkedAt: new Date().toISOString(),
          siteId: site._id,
          siteCode: site.siteCode,
          connectorMode: "browser-sharepoint",
          targetSharePointSiteUrl: targetSiteUrl,
          source: "Browser SharePoint",
          resolvedPaths: paths as unknown as Record<string, unknown>,
          derivedHealthStatus: indexVerified ? "healthy" : "warning",
          health: {
            siteDbExists: true,
            usersDbExists: true,
            distExists: true,
            assetsExists: true,
            indexExists: indexVerified,
            txtFilesExist: true
          },
          evidence: [
            ...steps.map((step) => ({
              key: step.step,
              label: step.step,
              url: step.path || targetSiteUrl,
              ok: step.status !== "failed",
              status: step.httpStatus,
              error: step.error
            })),
            ...browserDeploy.readBackEvidence.map((item) => ({
              key: item.relativePath,
              label: `deploy-readback:${item.relativePath}`,
              url: item.targetPath,
              ok: item.status === "verified",
              status: item.httpStatus,
              error: item.error
            }))
          ],
          note: "Initial Browser Deploy completed inside Create New Site flow."
        });
      }

      if (!runtimeConfigVerified) throw new Error("runtime config לא אומת אחרי הפריסה הראשונית.");

      return {
        ok: true,
        releaseVersion: plan.releaseVersion,
        filesCount: browserDeploy.readBackEvidence.length,
        verifiedFilesCount: browserDeploy.readBackEvidence.filter((item) => item.status === "verified").length,
        requiredFolders,
        deploymentId: evidenceResponse.data.deployment._id
      };
    } catch (error) {
      const failedEvidence = failedDeployEvidenceForPlan(plan.files, error);
      const versionBefore = site.currentVersion || site.version || "";
      if (!deployEvidenceRecorded) {
        await sitesApi.recordBrowserDeployEvidence(site._id, {
          releaseId,
          deployMode: "local-dev-owner",
          connectorMode: "browser-sharepoint",
          targetSite: {
            siteId: site._id,
            siteCode: site.siteCode,
            sharePointSiteUrl: targetSiteUrl
          },
          targetPaths: {
            targetDistPath,
            finalAppUrl: plan.target?.finalAppUrl || paths.finalAppUrl
          },
          uploadedFilesEvidence: failedEvidence,
          readBackEvidence: failedEvidence,
          errors: [{ error: error instanceof Error ? error.message : String(error) }],
          startedAt,
          completedAt: new Date().toISOString(),
          finalStatus: "failed",
          versionBefore,
          versionAfter: versionBefore
        }).catch(() => undefined);
      }
      throw error;
    }
  };

  const onSave = async (payload: Partial<Site>, options: SiteFormSaveOptions) => {
    setNotice("");
    try {
      if (selectedSite) await sitesApi.update(selectedSite._id, payload);
      else {
        const created = await sitesApi.create(options.mongoNativeCreation ? {
          ...payload,
          storageBackend: "mongo",
          creationMode: "create-new",
          lifecycleStatus: "planned",
          provisioningStatus: "planned",
          status: "draft",
          dataBackendStatus: "unknown",
          authoritativeAdminSource: "mongo"
        } : payload);
        if (options.flow === "track-existing" && options.runReadOnlyValidation) {
          try {
            const health = await sitesApi.runSharePointReadOnlyHealth(created.data._id);
            setNotice(`האתר נשמר והבדיקה הסתיימה: ${health.data.derivedHealthStatus}.`);
          } catch (validationError) {
            setNotice(`האתר נשמר, אבל בדיקת הקריאה נכשלה: ${validationError instanceof Error ? validationError.message : "שגיאה לא ידועה"}`);
          }
        }
        if (options.flow === "create-new" && options.mongoNativeCreation) {
          const plan = await sitesApi.mongoSiteCreationPlan(created.data._id);
          if (!plan.data.summary.readyForMongoBackendExecution) {
            setNotice(`רשומת Mongo נשמרה כ־planned, אבל לא בוצע execute. חסמים: ${plan.data.blockers.join(", ")}`);
          } else {
            let hostingMessage = "תשתית SharePoint לא נוצרה.";
            try {
              const hosting = await runMongoBrowserSharePointHostingProvisioning(created.data);
              hostingMessage = `תשתית SharePoint נוצרה/אומתה דרך הדפדפן (${hosting.steps.length} שלבים).`;
            } catch (hostingError) {
              setNotice(`רשומת Mongo נשמרה כ־planned, אבל לא ניתן להמשיך ל־Mongo seed או deploy לפני תשתית SharePoint: ${hostingError instanceof Error ? hostingError.message : "שגיאה לא ידועה"}`);
              return;
            }
            const execution = await sitesApi.executeMongoSiteCreation(created.data._id);
            let browserMessage = "runtime config דרך הדפדפן לא הורץ.";
            try {
              await runMongoBrowserRuntimeConfigSetup(created.data);
              browserMessage = "runtime config הועלה ואומת דרך Browser SharePoint.";
            } catch (browserError) {
              browserMessage = `runtime config לא הושלם דרך הדפדפן: ${browserError instanceof Error ? browserError.message : "שגיאה לא ידועה"}`;
            }
            let deployMessage = "פריסה ראשונית לא הורצה.";
            if (options.initialDeploy?.mode === "skip") {
              deployMessage = "האתר נוצר חלקית. עדיין לא בוצעה פריסה ראשונית.";
            } else if (options.initialDeploy?.releaseId) {
              try {
                const deploy = await runInitialBrowserDeploy(created.data, options.initialDeploy.releaseId, {
                  storageBackend: "mongo",
                  allowUnknownCompatibility: options.initialDeploy.allowUnknownCompatibility
                });
                deployMessage = `הפריסה הראשונית הסתיימה ואומתה (${deploy.verifiedFilesCount}/${deploy.filesCount} קבצים, Release ${deploy.releaseVersion}).`;
              } catch (deployError) {
                deployMessage = `הפריסה הראשונית נכשלה והאתר נשאר partially-created: ${deployError instanceof Error ? deployError.message : "שגיאה לא ידועה"}`;
              }
            } else {
              deployMessage = "אין Release מתאים לאתר Mongo. צור או סמן Release כתואם Mongo לפני פריסה ראשונית.";
            }
            const verification = await sitesApi.verifyMongoSiteCreation(created.data._id);
            setNotice(`${hostingMessage} Mongo registry ${execution.data.registry.status === "ok" ? "נוצר" : "נכשל"}, seed: ${execution.data.seed.status}, ${browserMessage} ${deployMessage} ${verification.data.ready ? "האתר מוכן לשימוש." : "האתר עדיין לא מוכן לשימוש"}.`);
          }
        } else if (options.flow === "create-new" && options.bootstrapSharePoint) {
          try {
            const provision = await runTxtBrowserSharePointProvisioning(created.data);
            if (options.initialDeploy?.mode === "skip") {
              setNotice(`רשומת האתר נשמרה ותשתית SharePoint נוצרה/אומתה דרך הדפדפן (${provision.steps.length} שלבים). האתר נוצר חלקית. עדיין לא בוצעה פריסה ראשונית.`);
            } else if (options.initialDeploy?.releaseId) {
              try {
                const deploy = await runInitialBrowserDeploy(created.data, options.initialDeploy.releaseId, {
                  storageBackend: "txt",
                  allowUnknownCompatibility: options.initialDeploy.allowUnknownCompatibility
                });
                setNotice(`רשומת האתר נשמרה, תשתית SharePoint נוצרה/אומתה, והפריסה הראשונית הסתיימה ואומתה (${deploy.verifiedFilesCount}/${deploy.filesCount} קבצים, Release ${deploy.releaseVersion}). האתר מוכן לשימוש.`);
              } catch (deployError) {
                setNotice(`רשומת האתר נשמרה ותשתית SharePoint נוצרה/אומתה, אבל הפריסה הראשונית נכשלה והאתר נשאר partially-created: ${deployError instanceof Error ? deployError.message : "שגיאה לא ידועה"}`);
              }
            } else {
              setNotice(`רשומת האתר נשמרה ותשתית SharePoint נוצרה/אומתה דרך הדפדפן (${provision.steps.length} שלבים). אין Release מתאים לאתר TXT legacy.`);
            }
          } catch (provisionError) {
            setNotice(`רשומת האתר נשמרה כ־planned, אבל תשתית SharePoint עדיין לא מוכנה: ${provisionError instanceof Error ? provisionError.message : "שגיאה לא ידועה"}`);
          }
        }
      }
      setModalOpen(false);
      setSelectedSite(null);
      await loadSites();
    } catch (err) {
      const message = err instanceof Error ? err.message : "שגיאה בשמירה";
      setError(message);
      throw new Error(message);
    }
  };

  const archiveSelected = async () => {
    if (!siteToArchive) return;
    await sitesApi.archive(siteToArchive._id);
    setSiteToArchive(null);
    await loadSites();
  };

  const restoreSelected = async () => {
    if (!siteToRestore) return;
    await sitesApi.restoreFromArchive(siteToRestore._id);
    setSiteToRestore(null);
    await loadSites();
  };

  const deleteSelected = async () => {
    if (!siteToDelete) return;
    await sitesApi.deletePermanently(siteToDelete._id);
    setSiteToDelete(null);
    await loadSites();
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="רשימת אתרים"
        subtitle="ניהול registry מרכזי לאתרי Site Builder. הרשומות כאן הן מקור ניהולי ב־Mongo; פעולות SharePoint מסומנות בנפרד."
        helpKey="sites.registry"
        actions={
          <>
            <MetadataOnlyBadge mode="metadata" />
            <button className="btn btn-primary" onClick={() => { setSelectedSite(null); setModalOpen(true); }} type="button"><Plus size={16} />הוסף אתר</button>
          </>
        }
      />

      <OperationalSummary
        title="Registry אנושי לאתרים"
        purpose="כאן מוצאים אתר, מבינים אם הוא בריא, ורואים מה הפעולה הבטוחה הבאה בלי להיכנס מיד לנתיבי SharePoint."
        state={`${formatNumber(activeTab === "archive" ? stats.archived : stats.active)} אתרים ${activeTab === "archive" ? "בארכיון" : "פעילים"}`}
        attention={stats.failed
          ? `${formatNumber(stats.failed)} אתרים בכשל. פתחו אתר אחד ובדקו Health לפני פריסה או שחזור.`
          : stats.warning
            ? `${formatNumber(stats.warning)} אתרים באזהרה. מומלץ לסנן ולבדוק את הסיבה.`
            : "אין כרגע כשל רוחבי ברשימת האתרים."}
        attentionTone={stats.failed ? "danger" : stats.warning ? "warning" : "success"}
        nextAction={sites.length ? "חפשו אתר לפי שם, קוד, בעלים או יחידה. פעולה ראשית: פתיחת פרטי אתר." : "הוסיפו אתר קיים למעקב או צרו אתר חדש דרך האשף."}
        blocked={operationCapabilities?.sharePoint.writeAvailable ? undefined : "פעולות שמחייבות כתיבה ל־SharePoint יוסברו וייחסמו עד שהמסלול המתאים זמין. שמירת metadata עדיין מותרת."}
        tone={stats.failed ? "danger" : stats.warning ? "warning" : "success"}
      >
        <GuidedFlow
          title="זרימת עבודה מומלצת"
          steps={[
            { title: "מצא אתר", description: "חפש לפי שם, קוד, בעלים או יחידה.", status: "active" },
            { title: "בדוק מצב", description: "פתח את האתר כדי לראות תקינות, גרסה, גיבוי והרשאות.", status: "pending" },
            { title: "בחר פעולה", description: "פריסה, גיבוי, שחזור או הרשאות רצים במסכים ייעודיים עם Review.", status: "pending" }
          ]}
        />
        <ModeBoundary
          items={[
            { label: "הוספת אתר קיים", description: "שומרת רשומה ב־Hub ומריצה בדיקות קריאה בלבד. לא יוצרת קבצים.", tone: "info" },
            { label: "יצירת אתר חדש", description: "אשף תכנון והקמה. רק Review סופי מפעיל כתיבה.", tone: "warning" },
            { label: "ארכיון", description: "סימון ניהולי ב־Hub בלבד. לא מוחק קבצי SharePoint.", tone: "success" }
          ]}
        />
      </OperationalSummary>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard title="סה״כ רשומות" value={formatNumber(stats.total)} icon={<SlidersHorizontal size={18} />} description="אתרים רשומים ב־Hub" tone="info" variant="inline" helpKey="sites.registry" />
        <KpiCard title="פעילים" value={formatNumber(stats.active)} icon={<SlidersHorizontal size={18} />} description="סטטוס פעיל" tone="success" variant="inline" helpKey="site.active" />
        <KpiCard title="דורשים טיפול" value={formatNumber(stats.warning + stats.failed)} icon={<SlidersHorizontal size={18} />} description="warning או failed" tone={stats.warning + stats.failed ? "warning" : "success"} variant="inline" helpKey="monitoring.alert" />
        <KpiCard title="אחסון רשום" value={formatMb(stats.totalStorageMb)} icon={<SlidersHorizontal size={18} />} description="לפי metadata במערכת" tone="neutral" variant="inline" helpKey="storage" />
      </div>

      <div className="segmented-control w-fit">
        <button className={activeTab === "active" ? "active" : ""} onClick={() => { setActiveTab("active"); setStatusFilter("all"); }} type="button">אתרים פעילים</button>
        <button className={activeTab === "archive" ? "active" : ""} onClick={() => { setActiveTab("archive"); setStatusFilter("all"); }} type="button">ארכיון</button>
      </div>

      {notice ? (
        <div className="soft-panel p-3 text-sm" style={{ color: "var(--text-strong)" }}>
          {notice}
        </div>
      ) : null}

      <SectionCard
        title={activeTab === "archive" ? "ארכיון אתרים" : "ניהול אתרים"}
        subtitle="חיפוש, סינון ומיון לפי סטטוס, תקינות וגרסה"
        helpKey={activeTab === "archive" ? "site.archived" : "sites.registry"}
        actions={<button className="btn btn-secondary" onClick={loadSites} type="button"><RefreshCcw size={15} />רענן</button>}
      >
        <FilterBar actions={
          <>
            <button className="btn btn-secondary" onClick={() => setFiltersOpen(true)} type="button"><SlidersHorizontal size={15} />סינון מתקדם {activeFilterCount ? `(${activeFilterCount})` : ""}</button>
            {hasVisibleFilters ? <button className="btn btn-ghost" onClick={clearFilters} type="button">נקה סינונים</button> : null}
          </>
        }>
          <label className="block">
            <span className="field-label">חיפוש</span>
            <div className="relative">
              <Search className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 muted" size={15} />
              <input className="control pr-9" placeholder="שם, קוד, בעלים או יחידה" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </label>
          <div className="sites-filter-summary">
            {statusFilter !== "all" ? <span className="badge badge-info">סטטוס: {statusFilter}</span> : null}
            {healthFilter !== "all" ? <span className="badge badge-info">תקינות: {healthFilter}</span> : null}
            {versionFilter !== "all" ? <span className="badge badge-info">גרסה: {versionFilter}</span> : null}
            <span className="filter-result-count">מציג {formatNumber(sites.length)} מתוך {formatNumber(activeTab === "archive" ? stats.archived : allSites.length - stats.archived)}</span>
          </div>
        </FilterBar>

        {loading ? <LoadingState /> : null}
        {!loading && error ? <ErrorState message={error} onRetry={loadSites} /> : null}
        {!loading && !error && allSites.length === 0 ? (
          <EmptyState title="אין עדיין אתרים" description="התחל בהוספת אתר ראשון ל־registry. הפעולה אינה יוצרת אתר SharePoint." action={<button className="btn btn-primary" onClick={() => setModalOpen(true)} type="button"><Plus size={16} />הוסף אתר</button>} />
        ) : null}
        {!loading && !error && allSites.length > 0 && sites.length === 0 ? <EmptyState title="אין תוצאות" description="שנה סינונים או נקה אותם כדי לראות אתרים." /> : null}
        {!loading && !error && sites.length > 0 ? (
          <SitesTable
            sites={sites}
            onEdit={(site) => { setSelectedSite(site); setModalOpen(true); }}
            onArchive={setSiteToArchive}
            onRestore={setSiteToRestore}
            onPermanentDelete={setSiteToDelete}
            onDetails={(id) => navigate(`/sites/${id}`)}
          />
        ) : null}
      </SectionCard>

      <SiteFormModal
        open={modalOpen}
        site={selectedSite}
        authUser={authUser}
        builderBackendConfig={operationCapabilities?.builderBackendConfig || null}
        releases={releases}
        releasesLoading={releasesLoading}
        onRefreshReleases={loadReleases}
        onClose={() => setModalOpen(false)}
        onSave={onSave}
        onPlanMongoCreate={async (payload) => (await sitesApi.planMongoSiteCreationFromPayload(payload)).data}
      />
      <DetailsDrawer open={filtersOpen} title="סינון מתקדם" subtitle="סטטוס, תקינות, גרסה ומיון" onClose={() => setFiltersOpen(false)}>
        <div className="space-y-4">
          <label className="block">
            <span className="field-label">סטטוס</span>
            <select className="control" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
              <option value="all">כל הסטטוסים</option>
              <option value="active">פעיל</option>
              <option value="warning">אזהרה</option>
              <option value="failed">נכשל</option>
              <option value="draft">טיוטה</option>
              <option value="archived">בארכיון</option>
            </select>
          </label>
          <label className="block">
            <span className="field-label">תקינות</span>
            <select className="control" value={healthFilter} onChange={(e) => setHealthFilter(e.target.value as any)}>
              <option value="all">כל מצבי התקינות</option>
              <option value="healthy">תקין</option>
              <option value="warning">אזהרה</option>
              <option value="failed">נכשל</option>
              <option value="unknown">לא נבדק</option>
            </select>
          </label>
          <label className="block">
            <span className="field-label">גרסה</span>
            <select className="control" value={versionFilter} onChange={(e) => setVersionFilter(e.target.value as any)}>
              <option value="all">כל הגרסאות</option>
              <option value="outdated">מיושן</option>
              <option value="up_to_date">עדכני</option>
              <option value="unknown">לא נבדק</option>
            </select>
          </label>
          <label className="block">
            <span className="field-label">מיון</span>
            <select className="control" value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
              <option value="updatedAt">עדכון אחרון</option>
              <option value="createdAt">יצירה</option>
              <option value="lastHealthCheckAt">בדיקת תקינות</option>
              <option value="displayName">שם אתר</option>
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-secondary" type="button" onClick={clearFilters}>נקה סינונים</button>
            <button className="btn btn-primary" type="button" onClick={() => setFiltersOpen(false)}>החל</button>
          </div>
        </div>
      </DetailsDrawer>
      <ConfirmDialog
        open={Boolean(siteToArchive)}
        title="להעביר לארכיון?"
        description={`הפעולה מסמנת את ${siteToArchive?.displayName || "האתר"} בארכיון של ה־Hub בלבד. לא נמחקים קבצים או נתונים מ־SharePoint.`}
        confirmLabel="העבר לארכיון"
        danger
        onClose={() => setSiteToArchive(null)}
        onConfirm={archiveSelected}
      />
      <ConfirmDialog
        open={Boolean(siteToRestore)}
        title="לשחזר מהארכיון?"
        description={`האתר ${siteToRestore?.displayName || ""} יחזור לרשימת האתרים הפעילים.`}
        confirmLabel="שחזר"
        onClose={() => setSiteToRestore(null)}
        onConfirm={restoreSelected}
      />
      <ConfirmDialog
        open={Boolean(siteToDelete)}
        title="מחיקה קבועה?"
        description={`הפעולה מוחקת את רשומת ${siteToDelete?.displayName || "האתר"} מה־Hub. היא אינה מוחקת קבצי SharePoint.`}
        confirmLabel="מחק לצמיתות"
        danger
        onClose={() => setSiteToDelete(null)}
        onConfirm={deleteSelected}
      />
    </div>
  );
}
