import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

const normalBusinessPages = [
  "client/src/pages/SimpleDashboardPage.tsx",
  "client/src/pages/SimpleSitesPage.tsx",
  "client/src/pages/OperationsPage.tsx",
  "client/src/pages/SiteSetupPage.tsx",
  "client/src/pages/SiteWorkspacePage.tsx"
];

const normalUiFiles = [
  ...normalBusinessPages,
  "client/src/pages/SimpleSettingsPage.tsx",
  "client/src/components/AppShell.tsx",
  "client/src/components/TopBar.tsx",
  "client/src/components/product/ActivityRow.tsx",
  "client/src/components/product/BidiValue.tsx",
  "client/src/components/product/HumanStatus.tsx",
  "client/src/components/product/ProductPage.tsx"
];

describe("normal-product domain boundary", () => {
  it("keeps business pages on the thin domain and presentation seams", () => {
    for (const file of normalBusinessPages) {
      const source = read(file);
      expect(source, file).toMatch(/from "\.\.\/domain\/hubDomain"/);
      expect(source, file).toMatch(/from "\.\.\/domain\/presentation"/);
    }
  });

  it("does not import transports, Builder connectors, or current/future data API paths", () => {
    for (const file of normalUiFiles) {
      const source = read(file);
      expect(source, file).not.toMatch(/api\/sitesApi|sharepointBrowser(?:Connector|OperationRunner|SiteOperations)/);
      expect(source, file).not.toMatch(/backendApiUrl|\/api\/site-data\/v1|["'`]\/api\/(?:sites|builder|site-builder)/);
      expect(source, file).not.toMatch(/\bfetch\s*\(/);
    }
  });

  it("builds normal Site links from managed IDs through one route helper", () => {
    for (const file of [
      "client/src/pages/SimpleDashboardPage.tsx",
      "client/src/pages/SimpleSitesPage.tsx",
      "client/src/pages/OperationsPage.tsx",
      "client/src/pages/SiteSetupPage.tsx",
      "client/src/pages/SiteWorkspacePage.tsx"
    ]) {
      const source = read(file);
      expect(source, file).toContain("siteWorkspaceRoute");
      expect(source, file).not.toMatch(/(?:to|href)=\{[^}]*siteCode/);
    }
    const routes = read("client/src/config/routeManifest.ts");
    expect(routes).toContain("siteWorkspaceRoute(managedSiteId: string");
    expect(routes).not.toMatch(/siteWorkspaceRoute\([^)]*siteCode/);
  });

  it("keeps control-plane and data-plane identities as distinct branded properties", () => {
    const domain = read("client/src/domain/hubDomain.ts");
    expect(domain).toContain("type ManagedSiteId = string & { readonly __managedSiteId: unique symbol }");
    expect(domain).toContain("type BuilderLogicalSiteId = string & { readonly __builderLogicalSiteId: unique symbol }");
    expect(domain).toContain("type PhysicalCollectionName = string & { readonly __physicalCollectionName: unique symbol }");
    for (const property of ["managedSiteId", "builderSiteId", "mongoSiteId", "safeCollectionName", "siteIdentityKey"]) {
      expect(domain).toContain(property);
    }
  });

  it("routes raw statuses, backup truth, and role policy through centralized rules", () => {
    const dashboard = read("client/src/pages/SimpleDashboardPage.tsx");
    const operations = read("client/src/pages/OperationsPage.tsx");
    const workspace = read("client/src/pages/SiteWorkspacePage.tsx");
    const sites = read("client/src/pages/SimpleSitesPage.tsx");
    const setup = read("client/src/pages/SiteSetupPage.tsx");
    const allNormalPages = normalBusinessPages.map(read).join("\n");

    for (const source of [dashboard, operations, workspace]) {
      expect(source.replaceAll("presentOperationState(job.status)", "")).not.toContain("job.status");
      expect(source).toContain("presentOperationTitle");
    }
    expect(workspace.replaceAll("presentOperationState(backup.status)", "")).not.toContain("backup.status");
    expect(workspace).toContain("presentBackupRecoverability(backup)");
    expect(dashboard).toContain("presentBackupRecoverability(backup)");
    expect(operations).toContain("presentBackupRecoverability(backup)");
    expect(sites).toContain("lastVerifiedBackupAt(site)");
    expect(setup).toContain("isSiteSetupComplete");
    expect(allNormalPages).not.toMatch(/authUser\.role\s*===|authUser\.role\s*!==/);
    expect(allNormalPages).toContain("canMutate(authUser.role)");
  });

  it("keeps deterministic scenario transport development-only and lazy", () => {
    const main = read("client/src/main.tsx");
    expect(main).toContain("import.meta.env.DEV");
    expect(main).toContain('await import("./dev/scenarioTransport")');
    expect(main).not.toMatch(/^import .*scenarioTransport/m);
  });
});

describe("normal-product CSS boundary", () => {
  it("ships only declared Assistant weights and avoids synthetic font weights", () => {
    const main = read("client/src/main.tsx");
    const styles = read("client/src/styles/index.css");
    expect(main.match(/@fontsource\/assistant\/hebrew-(400|600|700)\.css/g)).toHaveLength(3);
    expect(main).not.toContain("assistant/hebrew-500.css");
    expect(styles).not.toMatch(/font-weight:\s*650/);
  });

  it("does not add broad transition or permanent compositor hints to the normal layer", () => {
    const styles = read("client/src/styles/index.css");
    const normalLayer = styles.slice(0, styles.indexOf("/* Dashboard Design Studio"));
    expect(normalLayer).not.toMatch(/transition(?:-property)?:\s*all/);
    expect(normalLayer).not.toMatch(/will-change:\s*all/);
  });
});
