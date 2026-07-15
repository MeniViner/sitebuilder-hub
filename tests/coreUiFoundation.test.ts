import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

const between = (source: string, start: string, end: string) => {
  const startIndex = source.indexOf(start);
  if (startIndex === -1) return "";
  const endIndex = source.indexOf(end, startIndex);
  return endIndex === -1 ? source.slice(startIndex) : source.slice(startIndex, endIndex);
};

describe("core UI foundation redesign", () => {
  it("keeps mobile navigation as a drawer and exposes exactly four primary areas", () => {
    const appShell = read("client/src/components/AppShell.tsx");
    const sidebar = read("client/src/components/Sidebar.tsx");
    const topBar = read("client/src/components/TopBar.tsx");
    const routes = read("client/src/config/routeManifest.ts");
    const styles = read("client/src/styles/index.css");

    expect(appShell).toContain("onOpenNav={() => setNavOpen(true)}");
    expect(sidebar).toContain("mobile-nav-layer");
    expect(sidebar).toContain("sidebar-shell sidebar-shell-desktop hidden");
    expect(styles).toContain("mobile-nav-panel");
    expect(topBar).toContain("hub-topbar-title");
    expect(topBar).toContain("aria-label=\"פתיחת ניווט\"");
    expect(sidebar).toContain("PRIMARY_ROUTES.map");
    ["לוח בקרה", "אתרים", "פעולות", "הגדרות"].forEach((label) => expect(routes).toContain(`label: \"${label}\"`));
    expect(routes.match(/mode: \"normal\", visibility: \"primary\"/g)).toHaveLength(4);
  });

  it("keeps global status calm and routes technical details to Settings", () => {
    const appShell = read("client/src/components/AppShell.tsx");
    const topBar = read("client/src/components/TopBar.tsx");
    const statusBar = read("client/src/components/SystemStatusBar.tsx");

    expect(topBar).toContain("<SystemStatusBar");
    expect(appShell).not.toContain("<SystemStatusBar");
    expect(statusBar).toContain("system-status-summary-link");
    expect(statusBar).toContain('to="/settings"');
    expect(statusBar).toContain("מערכת זמינה");
    expect(statusBar).toContain("נדרשת בדיקה");
    expect(statusBar).not.toContain("connector");
  });

  it("turns Dashboard into a command center with no more than four primary KPI cards", () => {
    const dashboard = read("client/src/pages/DashboardPage.tsx");
    const styles = read("client/src/styles/index.css");
    const kpiStrip = between(dashboard, "<section className=\"dashboard-kpi-strip\"", "].map((item)");
    const kpiCount = (kpiStrip.match(/\{ label:/g) || []).length;

    expect(dashboard).toContain("dashboard-hero-summary");
    expect(dashboard).toContain("דורש טיפול עכשיו");
    expect(dashboard).toContain("אין כרגע פעולות דחופות. אפשר לבדוק אתרים, גרסאות או גיבויים.");
    expect(dashboard).toContain("Hub metadata");
    expect(dashboard).toContain("Last checked evidence");
    expect(dashboard).toContain("Browser SharePoint read");
    expect(dashboard).toContain("Mongo backend status");
    expect(dashboard).toContain("Unknown/not checked");
    expect(kpiCount).toBeLessThanOrEqual(4);
    expect(styles).toContain("grid-template-columns: repeat(4, minmax(0, 1fr));");
  });

  it("makes Sites a registry with search-led filters and one primary details action", () => {
    const sitesPage = read("client/src/pages/SitesPage.tsx");
    const sitesTable = read("client/src/components/SitesTable.tsx");
    const detailsActionCount = (sitesTable.match(/site-row-details-action/g) || []).length;

    expect(sitesPage).toContain("Professional Site Registry");
    expect(sitesPage).toContain("sites-search-field");
    expect(sitesPage).toContain("environmentFilter");
    expect(sitesPage).toContain("אין אתרים פעילים");
    expect(sitesPage).toContain("אין אתרים בארכיון");
    expect(sitesPage).toContain("אין תוצאות לסינון הזה");

    expect(sitesTable).toContain("site-next-action-label");
    expect(sitesTable).toContain("פעולה הבאה");
    expect(sitesTable).toContain("פתח אתר פעיל");
    expect(sitesTable).toContain("site-mobile-actions");
    expect(sitesTable).not.toContain("btn btn-primary site-row-primary-action");
    expect(detailsActionCount).toBe(2);
    expect(sitesTable).toContain('backend === "mongo" ? "Mongo" : backend === "txt" ? "TXT" : "Unknown"');
  });

  it("keeps mobile density compact on Dashboard and Sites", () => {
    const styles = read("client/src/styles/index.css");

    expect(styles).toContain(".hub-topbar-title");
    expect(styles).toContain(".site-row-details-action");
    expect(styles).toContain(".sites-quick-stat-grid {\n    gap: 0.5rem;\n    grid-template-columns: repeat(2, minmax(0, 1fr));");
    expect(styles).toContain(".dashboard-status-grid,\n  .dashboard-hero-summary,\n  .dashboard-kpi-strip,\n  .dashboard-fleet-metrics {\n    grid-template-columns: repeat(2, minmax(0, 1fr));");
  });
});
