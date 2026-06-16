import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { isHubHelpIconsEnabled } from "../client/src/help/helpConfig";

const root = process.cwd();
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

describe("Hub SharePoint-hosted UI config", () => {
  it("uses HashRouter routes and relative Vite assets for SharePoint folder hosting", () => {
    expect(read("client/src/App.tsx")).toContain("HashRouter");
    expect(read("client/src/App.tsx")).not.toContain("BrowserRouter");
    expect(read("client/vite.config.ts")).toContain("base: \"./\"");
  });

  it("keeps archive copy natural and exposes archive tabs", () => {
    const sitesPage = read("client/src/pages/SitesPage.tsx");
    const siteDetails = read("client/src/pages/SiteDetailsPage.tsx");
    const clientSource = [
      sitesPage,
      siteDetails,
      read("client/src/components/SitesTable.tsx")
    ].join("\n");

    expect(sitesPage).toContain("אתרים פעילים");
    expect(sitesPage).toContain("ארכיון");
    expect(clientSource).not.toContain("ארכב");
    expect(clientSource).not.toContain("בארכב");
  });

  it("surfaces diagnostics and the redesigned release/deploy control center", () => {
    const diagnostics = read("client/src/pages/DiagnosticsPage.tsx");
    const releases = read("client/src/pages/ReleasesPage.tsx");
    const styles = read("client/src/styles/index.css");

    expect(diagnostics).toContain("בעיות וחיבורים");
    expect(diagnostics).toContain("הדפדפן מחובר ל־SharePoint, אבל השרת המקומי לא מחובר");
    expect(releases).toContain("Release & Deployment Control Center");
    expect(releases).toContain("Target mode");
    expect(releases).toContain("Rollback נשאר חסום");
    expect(styles).toContain("direction: rtl");
  });

  it("exposes the analytics charts dashboard route and navigation item", () => {
    const app = read("client/src/App.tsx");
    const sidebar = read("client/src/components/Sidebar.tsx");
    const analytics = read("client/src/pages/AnalyticsDashboardPage.tsx");

    expect(app).toContain('path="/analytics"');
    expect(sidebar).toContain("דשבורד גרפים");
    expect(analytics).toContain("בונה גרפים");
    expect(analytics).toContain("תקינות לפי סביבה");
  });

  it("exposes the Hebrew help center route, navigation item, and required sections", () => {
    const app = read("client/src/App.tsx");
    const sidebar = read("client/src/components/Sidebar.tsx");
    const helpPage = read("client/src/pages/HelpPage.tsx");
    const helpContent = read("client/src/help/helpContent.ts");

    expect(app).toContain('path="/help"');
    expect(sidebar).toContain("מרכז הסברים");
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

  it("keeps inline Hebrew help icons enabled by default with an env kill-switch", () => {
    const helpConfig = read("client/src/help/helpConfig.ts");
    const helpIcon = read("client/src/components/help/HelpIcon.tsx");
    const envExample = read(".env.example");
    const readme = read("README.md");

    expect(helpConfig).toContain("VITE_HUB_HELP_ICONS_ENABLED");
    expect(helpConfig).toContain("value ?? \"true\"");
    expect(helpConfig).toContain("!== \"false\"");
    expect(helpIcon).toContain("HUB_HELP_ICONS_ENABLED");
    expect(helpIcon).toContain("data-help-icon");
    expect(envExample).toContain("VITE_HUB_HELP_ICONS_ENABLED=true");
    expect(readme).toContain("VITE_HUB_HELP_ICONS_ENABLED=false");
    expect(isHubHelpIconsEnabled(undefined)).toBe(true);
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
});
