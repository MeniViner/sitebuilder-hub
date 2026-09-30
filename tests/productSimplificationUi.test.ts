import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

describe("simplified normal UI", () => {
  it("routes normal users through four composed areas and lazy-loads legacy detail", () => {
    const app = read("client/src/App.tsx");
    expect(app).toContain('<Route path="/" element={<SimpleDashboardPage authUser={authUser} />}');
    expect(app).toContain('<Route path="/sites" element={<SimpleSitesPage');
    expect(app).toContain('<Route path="/operations" element={<OperationsPage authUser={authUser} />}');
    expect(app).toContain('<Route\n        path="/settings"');
    expect(app).toContain("const LegacySitesPage = lazy");
    expect(app).toContain("const SiteSetupPage = lazy");
    expect(app).toContain('<GatedRoute id="site-create"');
    expect(app).toContain("const JobsPage = lazy");
    expect(app).toContain('<GatedRoute id="jobs"');
  });

  it("shows exactly four setup stages and five site workspace areas", () => {
    const setup = read("client/src/pages/SiteSetupPage.tsx");
    const workspace = read("client/src/pages/SiteWorkspacePage.tsx");
    expect(setup.match(/key: "(details|destination|create|complete)"/g)).toHaveLength(4);
    expect(setup).toContain("האתר לא מסומן כהצלחה מלאה");
    expect(setup).toContain("continueSiteSetup");
    expect(setup).toContain('disabled={stage === "details" ? !detailsValid : !destinationValid}');
    expect(workspace.match(/key: "(overview|access|structure|backups|activity)"/g)).toHaveLength(5);
    expect(workspace).toContain("רק גיבוי עם מטען ואימות מלא מסומן כניתן לשחזור");
    expect(workspace).toContain("normal-header-actions");
  });

  it("keeps normal pages behind the domain facade", () => {
    [
      "client/src/pages/SimpleDashboardPage.tsx",
      "client/src/pages/SimpleSitesPage.tsx",
      "client/src/pages/OperationsPage.tsx",
      "client/src/pages/SiteSetupPage.tsx",
      "client/src/pages/SiteWorkspacePage.tsx"
    ].forEach((file) => {
      const source = read(file);
      expect(source).toContain("hubDomain");
      expect(source).not.toContain("sitesApi.");
      expect(source).not.toContain("/api/site-data/v1");
    });
    const facade = read("client/src/domain/hubDomain.ts");
    ["listSites", "getSite", "checkSite", "createSite", "continueSiteSetup", "listOperations", "deployVersion", "listBackups", "createBackup", "restoreBackup", "getAccess", "updateAccess"].forEach((action) => expect(facade).toContain(`${action}(`));
    expect(facade).not.toContain("/api/site-data/v1");
  });

  it("keeps mutation affordances conditional on the visible role", () => {
    const sites = read("client/src/pages/SimpleSitesPage.tsx");
    const setup = read("client/src/pages/SiteSetupPage.tsx");
    const workspace = read("client/src/pages/SiteWorkspacePage.tsx");
    expect(sites).toContain("canMutate(authUser.role)");
    expect(setup).toContain("התפקיד שלך מאפשר צפייה בלבד");
    expect(workspace.match(/canMutate\(authUser\.role\)/g)?.length).toBeGreaterThanOrEqual(4);
    expect(read("client/src/pages/SimpleDashboardPage.tsx")).toContain("canMutate(authUser.role)");
  });

  it("uses a local Hebrew font and accessible, keyboard-contained overlays", () => {
    const main = read("client/src/main.tsx");
    const styles = read("client/src/styles/index.css");
    const confirm = read("client/src/components/ConfirmDialog.tsx");
    const protectedDialog = read("client/src/components/ProtectedActionDialog.tsx");
    const focus = read("client/src/hooks/useDialogFocus.ts");
    expect(main).toContain('@fontsource/heebo/hebrew-400.css');
    expect(styles).toContain('font-family: "Heebo"');
    expect(confirm).toContain('role="dialog"');
    expect(confirm).toContain('aria-modal="true"');
    expect(protectedDialog).toContain('aria-labelledby={titleId}');
    expect(focus).toContain('event.key === "Escape"');
    expect(focus).toContain('event.key !== "Tab"');
    expect(focus).toContain("previousFocusRef.current?.focus()");
    expect(read("client/src/components/product/BidiValue.tsx")).toContain('<bdi dir="ltr">');
  });
});
