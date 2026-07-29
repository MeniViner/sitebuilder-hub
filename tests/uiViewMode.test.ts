import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  HUB_VIEW_MODE_QUERY_KEY,
  HUB_VIEW_MODE_STORAGE_KEY,
  hashRouteSearch,
  parseHubViewMode,
  resolveHubViewMode,
  resolveInitialHubViewMode,
  withoutHubViewMode
} from "../client/src/config/viewMode";

const root = process.cwd();
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

describe("Hub modern and legacy view resolution", () => {
  it("defaults to modern and accepts only the two public view values", () => {
    expect(HUB_VIEW_MODE_STORAGE_KEY).toBe("sitebuilder-hub-ui-mode");
    expect(HUB_VIEW_MODE_QUERY_KEY).toBe("ui");
    expect(resolveHubViewMode()).toEqual({ mode: "modern", source: "default" });
    expect(parseHubViewMode("legacy")).toBe("legacy");
    expect(parseHubViewMode("MODERN")).toBe("modern");
    expect(parseHubViewMode("diagnostics")).toBeNull();
    expect(parseHubViewMode("labs")).toBeNull();
  });

  it("uses a valid browser preference when no explicit URL override exists", () => {
    expect(resolveHubViewMode({ storedPreference: "legacy" })).toEqual({ mode: "legacy", source: "preference" });
    expect(resolveHubViewMode({ storedPreference: "modern" })).toEqual({ mode: "modern", source: "preference" });
    expect(resolveHubViewMode({ storedPreference: "unsupported" })).toEqual({ mode: "modern", source: "default" });
  });

  it("gives route and document URL overrides precedence without mutating preference input", () => {
    const storedPreference = "modern";
    expect(resolveHubViewMode({
      routeSearch: "?area=backups&ui=legacy",
      documentSearch: "?ui=modern",
      storedPreference
    })).toEqual({ mode: "legacy", source: "route-url" });
    expect(storedPreference).toBe("modern");

    expect(resolveHubViewMode({
      documentSearch: "?scenario=admin&ui=legacy",
      storedPreference: "modern"
    })).toEqual({ mode: "legacy", source: "document-url" });
  });

  it("resolves HashRouter deep links before React mounts", () => {
    expect(hashRouteSearch("#/sites/managed-ready?area=access&ui=legacy")).toBe("?area=access&ui=legacy");
    expect(resolveInitialHubViewMode({
      search: "?scenario=admin",
      hash: "#/sites/managed-ready?area=access&ui=legacy",
      storedPreference: "modern"
    })).toBe("legacy");
  });

  it("removes only the QA override and preserves every logical route query", () => {
    expect(withoutHubViewMode("?area=backups&ui=legacy&tab=recovery")).toBe("?area=backups&tab=recovery");
    expect(withoutHubViewMode("?ui=modern")).toBe("");
    expect(withoutHubViewMode("?scenario=admin&ui=legacy")).toBe("?scenario=admin");
  });
});

describe("legacy baseline integration contracts", () => {
  it("keeps one shared route tree and identity route mapping for both shells", () => {
    const app = read("client/src/App.tsx");
    const appShell = read("client/src/components/AppShell.tsx");
    expect(app.match(/<Routes>/g)).toHaveLength(1);
    expect(appShell).toContain('mode === "legacy"');
    expect(appShell).toContain("<LegacyAppShell");
    for (const pathValue of ["/", "/sites", "/sites/new", "/sites/:id", "/operations", "/settings"]) {
      expect(app).toContain(`path="${pathValue}"`);
    }
  });

  it("ships the exact scoped pre-redesign CSS baseline and its local Assistant font", () => {
    const legacyStyles = read("client/src/styles/legacy.css");
    const main = read("client/src/main.tsx");
    expect(legacyStyles).toContain("53488763b0a460613a639f5b0d7b2301a821ccd1:client/src/styles/index.css");
    expect(legacyStyles).toContain('html[data-hub-ui-mode="legacy"]');
    expect(legacyStyles).toContain("--accent: #0f6cbd;");
    expect(legacyStyles).toContain('--app-bg: #f6f8fb;');
    expect(legacyStyles).toContain('font-family: "Assistant"');
    expect(main.match(/@fontsource\/assistant\/hebrew-(400|600|700)\.css/g)).toHaveLength(3);
  });

  it("keeps advanced and diagnostic machinery absent from both primary sidebars", () => {
    const modernSidebar = read("client/src/components/Sidebar.tsx");
    const legacySidebar = read("client/src/components/LegacySidebar.tsx");
    for (const sidebar of [modernSidebar, legacySidebar]) {
      expect(sidebar).toContain("PRIMARY_ROUTES.map");
      expect(sidebar).not.toMatch(/JobsPage|DiagnosticsPage|DashboardLabPage|\/diagnostics|\/jobs|\/dashboard-lab/);
    }
  });
});
