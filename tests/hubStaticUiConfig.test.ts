import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { isHubHelpIconsEnabled } from "../client/src/help/helpConfig";

const root = process.cwd();
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");
const collectFiles = (relativeDir: string): string[] => {
  const absoluteDir = path.join(root, relativeDir);
  return readdirSync(absoluteDir).flatMap((entry) => {
    const absolutePath = path.join(absoluteDir, entry);
    const relativePath = path.join(relativeDir, entry);
    if (entry === "dist" || entry.endsWith(".tsbuildinfo")) return [];
    return statSync(absolutePath).isDirectory() ? collectFiles(relativePath) : [relativePath];
  });
};

describe("Hub SharePoint-hosted UI config", () => {
  it("uses HashRouter routes and relative Vite assets for SharePoint folder hosting", () => {
    expect(read("client/src/App.tsx")).toContain("HashRouter");
    expect(read("client/src/App.tsx")).not.toContain("BrowserRouter");
    expect(read("client/vite.config.ts")).toContain("base: \"./\"");
    expect(read("client/index.html")).toContain("./hub-config.js");
    expect(read("client/public/hub-config.js")).toContain("window.SiteBuilderHubConfig");
    expect(read("client/src/config/hubConfig.ts")).toContain("sitebuilderHub.apiBaseUrl");
  });

  it("keeps archive copy natural and exposes archive tabs", () => {
    const sitesPage = read("client/src/pages/SitesPage.tsx");
    const siteDetails = read("client/src/pages/SiteDetailsPage.tsx");
    const clientSource = [
      sitesPage,
      siteDetails,
      read("client/src/components/SitesTable.tsx")
    ].join("\n");

    expect(sitesPage).toContain("sites-tab-switch");
    expect(sitesPage).toContain("פעילים");
    expect(sitesPage).toContain("ארכיון");
    expect(clientSource).not.toContain("ארכב");
    expect(clientSource).not.toContain("בארכב");
  });

  it("surfaces diagnostics and the redesigned release/deploy control center", () => {
    const diagnostics = read("client/src/pages/DiagnosticsPage.tsx");
    const releases = read("client/src/pages/ReleasesPage.tsx");
    const styles = read("client/src/styles/index.css");

    expect(diagnostics).toContain("בעיות וחיבורים");
    expect(diagnostics).toContain("Browser SharePoint");
    expect(diagnostics).toContain("Hub API ו־Builder backend");
    expect(releases).toContain("Release & Deployment Control Center");
    expect(releases).toContain("Target mode");
    expect(releases).toContain("Rollback נשאר חסום");
    expect(styles).toContain("direction: rtl");
  });

  it("preserves detailed operational evidence behind one compact global status", () => {
    const app = read("client/src/App.tsx");
    const provider = read("client/src/components/OperationalStatusProvider.tsx");
    const sidebar = read("client/src/components/Sidebar.tsx");
    const systemStatusBar = read("client/src/components/SystemStatusBar.tsx");
    const operationsRoutes = read("server/src/routes/operations.routes.ts");
    const operationsService = read("server/src/services/operations.service.ts");

    expect(app).toContain("OperationalStatusProvider");
    expect(provider).toContain("sitebuilderHub.operationalStatus");
    expect(provider).toContain("recordBrowserSharePointHealth");
    expect(provider).toContain("recordRuntimeConfigEvidence");
    expect(provider).toContain("recordBuilderMongoHealth");
    expect(sidebar).toContain("פרטים זמינים בהגדרות");
    expect(sidebar).not.toContain("SharePoint דרך הדפדפן עדיין לא נבדק");
    expect(sidebar).not.toContain("Hub Mongo");
    expect(systemStatusBar).toContain('to="/settings"');
    expect(systemStatusBar).not.toContain("Browser SharePoint");
    expect(systemStatusBar).not.toContain("Builder backend");
    expect(operationsRoutes).toContain("router.get(\"/status\"");
    expect(operationsService).toContain("OperationalStatusSnapshot");
    expect(operationsService).toContain("DATA_SOURCE_MATRIX");
  });

  it("auto-loads safe page evidence without requiring the first manual click", () => {
    const dashboard = read("client/src/pages/DashboardPage.tsx");
    const siteDetails = read("client/src/pages/SiteDetailsPage.tsx");
    const health = read("client/src/pages/HealthPage.tsx");
    const diagnostics = read("client/src/pages/DiagnosticsPage.tsx");
    const backups = read("client/src/pages/BackupsPage.tsx");
    const admins = read("client/src/pages/AdminsPage.tsx");
    const settings = read("client/src/pages/SettingsPage.tsx");

    expect(siteDetails).toContain("useAutoSafeRead");
    expect(siteDetails).toContain("readBrowserRuntimeConfig");
    expect(siteDetails).toContain("buildBrowserSharePointBackupPlan");
    expect(health).toContain("useAutoSafeRead");
    expect(health).toContain("readBrowserRuntimeConfig");
    expect(diagnostics).toContain("useAutoSafeRead");
    expect(diagnostics).toContain("runBrowserSharePointDiagnostics");
    expect(backups).toContain("useAutoSafeRead");
    expect(backups).toContain("recordBrowserSharePointStatus");
    expect(admins).toContain("auto: true");
    expect(settings).toContain("sitesApi.operationCapabilities");
    expect(dashboard).toContain("Storage backends");
  });

  it("lets operators edit release identity and deployment metadata without recreating releases", () => {
    const releases = read("client/src/pages/ReleasesPage.tsx");
    const api = read("client/src/api/sitesApi.ts");
    const routes = read("server/src/routes/releases.routes.ts");

    expect(releases).toContain("עריכת Release");
    expect(releases).toContain("Artifact השתנה - צריך Validate מחדש");
    expect(releases).toContain("שם חסר - אפשר לתקן");
    expect(releases).toContain("sitesApi.updateRelease");
    expect(api).toContain("updateRelease: async");
    expect(api).toContain("updateReleaseName");
    expect(routes).toContain("router.patch(\"/:id\",");
    expect(routes).toContain("router.patch(\"/:id/name\"");
  });

  it("preserves analytics behind a hidden, lazy advanced route", () => {
    const app = read("client/src/App.tsx");
    const sidebar = read("client/src/components/Sidebar.tsx");
    const manifest = read("client/src/config/routeManifest.ts");
    const analytics = read("client/src/pages/AnalyticsDashboardPage.tsx");

    expect(app).toContain('path="/analytics"');
    expect(app).toContain("const AnalyticsDashboardPage = lazy");
    expect(manifest).toContain('{ id: "analytics"');
    expect(manifest).toContain('mode: "advanced", visibility: "hidden"');
    expect(sidebar).not.toContain("תובנות");
    expect(analytics).toContain("בונה גרפים");
    expect(analytics).toContain("תקינות לפי סביבה");
  });

  it("preserves the Hebrew help center behind an explicit mode without normal navigation", () => {
    const app = read("client/src/App.tsx");
    const sidebar = read("client/src/components/Sidebar.tsx");
    const manifest = read("client/src/config/routeManifest.ts");
    const helpPage = read("client/src/pages/HelpPage.tsx");
    const helpContent = read("client/src/help/helpContent.ts");

    expect(app).toContain('path="/help"');
    expect(app).toContain('<GatedRoute id="help"');
    expect(manifest).toContain('{ id: "help"');
    expect(sidebar).not.toContain("Playbooks והסברים");
    expect(helpPage).toContain("מרכז הסברים");
    [
      "מה זה Site Builder Hub",
      "מה אפשר לעשות במערכת",
      "אתרים",
      "הוספת אתר קיים",
      "יצירת אתר חדש",
      "גרסאות ופריסות",
      "SharePoint חיבורים",
      "מנהלים והרשאות",
      "גיבויים",
      "Jobs / משימות",
      "בדיקות תקינות",
      "יומן פעולות",
      "בעיות נפוצות",
      "מילון מונחים"
    ].forEach((sectionTitle) => expect(helpContent).toContain(sectionTitle));
  });

  it("keeps inline Hebrew help icons off by default with explicit opt-in", () => {
    const helpConfig = read("client/src/help/helpConfig.ts");
    const helpIcon = read("client/src/components/help/HelpIcon.tsx");
    const envExample = read(".env.example");
    const readme = read("README.md");

    expect(helpConfig).toContain("HUB_FEATURE_POLICY.helpIcons");
    expect(helpConfig).toContain("isExplicitlyEnabled(value)");
    expect(helpIcon).toContain("HUB_HELP_ICONS_ENABLED");
    expect(helpIcon).toContain("data-help-icon");
    expect(envExample).toContain("VITE_HUB_HELP_ICONS_ENABLED=false");
    expect(readme).toContain("VITE_HUB_HELP_ICONS_ENABLED=true");
    expect(isHubHelpIconsEnabled(undefined)).toBe(false);
    expect(isHubHelpIconsEnabled("true")).toBe(true);
    expect(isHubHelpIconsEnabled("FALSE")).toBe(false);
    expect(isHubHelpIconsEnabled("false")).toBe(false);
  });

  it("adds contextual help coverage to the main Hub screens", () => {
    [
      "client/src/pages/DashboardPage.tsx",
      "client/src/pages/SitesPage.tsx",
      "client/src/pages/SiteDetailsPage.tsx",
      "client/src/pages/ReleasesPage.tsx",
      "client/src/pages/BackupsPage.tsx",
      "client/src/pages/AdminsPage.tsx",
      "client/src/pages/JobsPage.tsx",
      "client/src/pages/MonitoringPage.tsx",
      "client/src/pages/AuditPage.tsx",
      "client/src/pages/HealthPage.tsx",
      "client/src/pages/DiagnosticsPage.tsx",
      "client/src/pages/SettingsPage.tsx",
      "client/src/pages/AnalyticsDashboardPage.tsx"
    ].forEach((relativePath) => {
      expect(read(relativePath), relativePath).toContain("helpKey");
    });
  });

  it("keeps the old awkward Hebrew and English 401 copy out of client UI", () => {
    const clientUi = [
      read("client/src/pages/DashboardPage.tsx"),
      read("client/src/pages/SitesPage.tsx"),
      read("client/src/pages/SiteDetailsPage.tsx"),
      read("client/src/pages/DiagnosticsPage.tsx"),
      read("client/src/pages/JobsPage.tsx"),
      read("client/src/components/SitesTable.tsx")
    ].join("\n");

    expect(clientUi).not.toContain("ארכב");
    expect(clientUi).not.toContain("פעולה כותבת מסוכנת");
    expect(clientUi).not.toContain("SharePoint rejected the backend request");
  });

  it("surfaces storage-backend-aware UI for Mongo and TXT sites", () => {
    const dashboard = read("client/src/pages/DashboardPage.tsx");
    const sitesTable = read("client/src/components/SitesTable.tsx");
    const sitesPage = read("client/src/pages/SitesPage.tsx");
    const siteDetails = read("client/src/pages/SiteDetailsPage.tsx");
    const siteDetailsActionPolicy = read("client/src/utils/siteDetailsActionPolicy.ts");
    const health = read("client/src/pages/HealthPage.tsx");
    const diagnostics = read("client/src/pages/DiagnosticsPage.tsx");
    const admins = read("client/src/pages/AdminsPage.tsx");
    const backups = read("client/src/pages/BackupsPage.tsx");
    const settings = read("client/src/pages/SettingsPage.tsx");

    expect(dashboard).toContain("Storage backends");
    expect(dashboard).toContain("storageCounts.txt");
    expect(dashboard).toContain("storageCounts.mongo");
    expect(dashboard).toContain("/sites?storageBackend=txt");
    expect(dashboard).toContain("/sites?storageBackend=mongo");
    expect(dashboard).not.toContain("writeAvailable = true");
    expect(sitesPage).toContain("storageBackendFilter");
    expect(sitesPage).toContain("searchParams.get(\"storageBackend\")");
    ["/releases", "/backups", "/admins", "/jobs", "/monitoring", "/audit", "/diagnostics", "/analytics"].forEach((route) =>
      expect(dashboard).toContain(`to: "${route}"`)
    );
    expect(sitesTable).toContain("נתוני התחלה");
    expect(sitesTable).not.toContain("Runtime:");
    expect(sitesTable).not.toContain("Data:");
    expect(siteDetails).toContain("runtime-config-read");
    expect(siteDetailsActionPolicy).toContain("בדוק קובץ הגדרות טעינה");
    expect(siteDetailsActionPolicy).toContain("בדוק מקור נתונים Mongo");
    expect(health).toContain("TXT / Seed");
    expect(diagnostics).toContain("Builder / Mongo backend connector");
    expect(admins).toContain("מקור אמת: Mongo / Builder backend");
    expect(backups).toContain("Recovery Center");
    expect(backups).toContain("Builder backend");
    expect(backups).toContain("Browser SharePoint");
    expect(settings).toContain("Storage backend rules");
  });

  it("renders Backups as a Recovery Center without duplicate plan actions or disabled-server copy", () => {
    const backups = read("client/src/pages/BackupsPage.tsx");

    expect(backups).toContain("RecoveryTabShell");
    expect(backups).toContain("RecoveryCommandPanel");
    expect(backups).toContain("recovery-scroll-region");
    expect(backups).toContain("data-recovery-tab");
    expect(backups).toContain("הרצת גיבוי");
    expect(backups).toContain("מלאי גיבויים");
    expect(backups).toContain("היסטוריה ו-Evidence");
    expect(backups).toContain("ProtectedActionDialog");
    expect(backups).toContain("confirmWord=\"שחזר\"");
    expect(backups).toContain("queueRestoreBackup");
    expect(backups).not.toContain("plan for site");
    expect(backups).not.toContain("plan for all sites");
    expect(backups).not.toContain("תוכנית לאתר");
    expect(backups).not.toContain("תוכנית לכל האתרים");
  });

  it("keeps forbidden legacy SharePoint server copy out of user-facing client source", () => {
    const userFacingFiles = [
      ...collectFiles("client/src/pages"),
      ...collectFiles("client/src/components"),
      ...collectFiles("client/src/help"),
      ...collectFiles("client/src/utils")
    ].filter((file) => !file.endsWith(".test.ts") && !file.endsWith(".test.tsx"));
    const userFacingSource = userFacingFiles.map(read).join("\n");
    const forbidden = [
      ["אין", "SharePoint", "בשרת"].join(" "),
      ["אין", "שרפוינט", "בשרת"].join(" "),
      ["שרת", "SharePoint", "מושבת"].join(" "),
      ["שרת", "שרפוינט", "מושבת"].join(" "),
      ["מסלול", "השרת", "מושבת"].join(" "),
      ["SharePoint", "server", "disabled"].join(" "),
      ["backend", "SharePoint", "disabled"].join(" "),
      ["backend", "service", "auth", "required"].join("-"),
      ["חסר", "חיבור", "ל־SharePoint"].join(" ")
    ];

    for (const phrase of forbidden) {
      expect(userFacingSource, phrase).not.toContain(phrase);
    }
  });

  it("surfaces the create-new Mongo-backed site wizard and APIs", () => {
    const modal = read("client/src/components/SiteFormModal.tsx");
    const sitesPage = read("client/src/pages/SitesPage.tsx");
    const api = read("client/src/api/sitesApi.ts");
    const routes = read("server/src/routes/sites.routes.ts");

    expect(modal).toContain("אתר Mongo חדש");
    expect(modal).toContain("צור תוכנית Mongo");
    expect(modal).toContain("Mongo registry נוצר");
    expect(modal).toContain("קבצי seed חסרים");
    expect(sitesPage).toContain("executeMongoSiteCreation");
    expect(sitesPage).toContain("recordMongoCreateBrowserEvidence");
    expect(api).toContain("mongoRuntimeConfigContent");
    expect(routes).toContain("/mongo-create/plan");
    expect(routes).toContain("/mongo-create/execute");
    expect(routes).toContain("/mongo-create/browser-evidence");
  });

  it("surfaces TXT to Mongo migration from site details and API routes", () => {
    const siteDetails = read("client/src/pages/SiteDetailsPage.tsx");
    const siteDetailsPolicy = read("client/src/utils/siteDetailsActionPolicy.ts");
    const browserOps = read("client/src/utils/sharepointBrowserSiteOperations.ts");
    const api = read("client/src/api/sitesApi.ts");
    const routes = read("server/src/routes/sites.routes.ts");

    expect(siteDetailsPolicy).toContain("label: \"העברת אתר TXT ל־Mongo\"");
    expect(siteDetails).toContain("actionFromPolicy(txtMigrationPolicy");
    expect(siteDetailsPolicy).toContain("פעולה רגישה שמשנה את מקור הנתונים");
    expect(siteDetails).toContain("runTxtToMongoMigrationInBrowser");
    expect(browserOps).toContain("readBrowserTxtSnapshotForMongoMigration");
    expect(browserOps).toContain("runBrowserMongoRuntimeConfigUpload");
    expect(api).toContain("migrateTxtToMongo");
    expect(routes).toContain("/mongo-migration/txt-to-mongo");
  });
});
