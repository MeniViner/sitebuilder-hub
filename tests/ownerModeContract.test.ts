import { readFileSync } from "fs";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetTestEnv } from "./setup/env";
import { deriveClientOwnerMode } from "../client/src/utils/authOwnerMode";

const root = process.cwd();
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

describe("owner-mode auth contract", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("auth/me source owner enables wizard owner mode on the frontend", () => {
    const result = deriveClientOwnerMode({
      id: "pn:s8856096",
      name: "Hub Owner",
      role: "admin",
      personalNumber: "s8856096",
      source: "owner"
    });

    expect(result.ownerMode).toBe(true);
    expect(result.ownerModeReason).toContain("owner");
  });

  it("auth/me identityMode explicit-owner enables wizard owner mode on the frontend", () => {
    const result = deriveClientOwnerMode({
      id: "pn:s8856096",
      name: "Hub Owner",
      role: "admin",
      personalNumber: "s8856096",
      source: "bootstrap",
      identityMode: "explicit-owner"
    });

    expect(result.ownerMode).toBe(true);
    expect(result.ownerModeReason).toContain("explicit-owner");
  });

  it("auth/me ownerMode true enables wizard owner mode on the frontend", () => {
    const result = deriveClientOwnerMode({
      id: "pn:s8856096",
      name: "Hub Owner",
      role: "admin",
      personalNumber: "s8856096",
      source: "api-key",
      identityMode: "api-key",
      ownerMode: true,
      ownerModeReason: "server confirmed owner mode"
    });

    expect(result.ownerMode).toBe(true);
    expect(result.ownerModeReason).toBe("server confirmed owner mode");
  });

  it("non-owner remains blocked with useful Hebrew explanation", () => {
    const result = deriveClientOwnerMode({
      id: "pn:s1234567",
      name: "Site Admin",
      role: "admin",
      personalNumber: "s1234567",
      source: "site-admin"
    });

    expect(result.ownerMode).toBe(false);
    expect(result.ownerModeReason).toContain("אינו מזוהה כבעלים");
    expect(result.ownerModeReason).toContain("ownerMode=true");
  });

  it("backend owner personal number match resolves ownerMode true for auth/me", async () => {
    resetTestEnv({
      HUB_OWNER_PERSONAL_NUMBER: "s8856096",
      HUB_OWNER_DIRECT_MODE: "false",
      HUB_ADVANCED_APPROVALS_ENABLED: "true"
    });
    vi.resetModules();
    const { resolveAuthOwnerMode } = await import("../server/src/services/authOwnerMode.service");

    expect(resolveAuthOwnerMode({
      id: "pn:s8856096",
      name: "Hub Owner",
      role: "admin",
      personalNumber: "s8856096",
      source: "bootstrap"
    })).toMatchObject({
      ownerMode: true
    });
  });

  it("auth/me response and wizard use one owner-mode contract", () => {
    const authController = read("server/src/controllers/auth.controller.ts");
    const app = read("client/src/App.tsx");
    const sitesPage = read("client/src/pages/SitesPage.tsx");
    const modal = read("client/src/components/SiteFormModal.tsx");

    expect(authController).toContain("ownerMode: ownerMode.ownerMode");
    expect(authController).toContain("user = withOwnerMode");
    expect(app).toContain("<SitesPage authUser={authUser} />");
    expect(sitesPage).toContain("authUser={authUser}");
    expect(modal).toContain("deriveClientOwnerMode(authUser)");
    expect(modal).toContain("מספר אישי נוכחי");
    expect(modal).toContain("identityMode");
    expect(modal).toContain("Owner mode לא פעיל");
  });
});
