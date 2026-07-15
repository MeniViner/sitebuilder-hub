import { describe, expect, it } from "vitest";
import { buildHubFeaturePolicy, resolveHubUiMode } from "../client/src/config/uiMode";
import {
  HUB_ROUTE_MANIFEST,
  PRIMARY_ROUTES,
  isRouteModeEnabled,
  resolveSiteWorkspaceArea,
  siteWorkspaceRoute
} from "../client/src/config/routeManifest";
import {
  canMutate,
  presentBackupRecoverability,
  presentOperationState,
  presentSiteCondition,
  presentVisibleRole,
  settleSlice
} from "../client/src/domain/presentation";
import { identityBoundaryForSite } from "../client/src/domain/hubDomain";
import type { Site } from "../client/src/types/site";

const site = (values: Partial<Site> = {}) => ({
  _id: "managed-507f1f77bcf86cd799439011",
  siteCode: "alpha",
  displayName: "Alpha",
  sharePointSiteUrl: "https://portal.example/sites/alpha",
  status: "active",
  lifecycleStatus: "ready",
  provisioningStatus: "succeeded",
  derivedHealthStatus: "healthy",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...values
}) as Site;

describe("normal product mode", () => {
  it("defaults missing or invalid configuration to Normal with Help and Labs off", () => {
    expect(resolveHubUiMode()).toBe("normal");
    expect(resolveHubUiMode("enterprise")).toBe("normal");
    expect(buildHubFeaturePolicy()).toEqual({ mode: "normal", helpIcons: false, labs: false });
  });

  it("only enables Help, Diagnostics, and Labs deliberately", () => {
    expect(isRouteModeEnabled("help", buildHubFeaturePolicy({ mode: "normal" }))).toBe(false);
    expect(isRouteModeEnabled("help", buildHubFeaturePolicy({ mode: "help" }))).toBe(true);
    expect(isRouteModeEnabled("diagnostics", buildHubFeaturePolicy({ mode: "diagnostics" }))).toBe(true);
    expect(isRouteModeEnabled("labs", buildHubFeaturePolicy({ labs: "true" }))).toBe(true);
  });
});

describe("route and workspace contracts", () => {
  it("has exactly four primary destinations", () => {
    expect(PRIMARY_ROUTES.map((route) => route.id)).toEqual(["dashboard", "sites", "operations", "settings"]);
    expect(PRIMARY_ROUTES).toHaveLength(4);
    expect(HUB_ROUTE_MANIFEST.every((route) => route.mode && route.roles.length > 0)).toBe(true);
  });

  it("maps every legacy site tab into one of five visible areas", () => {
    expect(resolveSiteWorkspaceArea("health")).toBe("overview");
    expect(resolveSiteWorkspaceArea("versions")).toBe("overview");
    expect(resolveSiteWorkspaceArea("admins")).toBe("access");
    expect(resolveSiteWorkspaceArea("advanced")).toBe("structure");
    expect(resolveSiteWorkspaceArea("recovery")).toBe("backups");
    expect(resolveSiteWorkspaceArea("audit")).toBe("activity");
    expect(resolveSiteWorkspaceArea("anything-else")).toBe("overview");
  });

  it("uses the managed HUB id—not siteCode—for navigation", () => {
    expect(siteWorkspaceRoute("managed:id", "activity")).toBe("/sites/managed%3Aid?area=activity");
    expect(siteWorkspaceRoute("managed:id")).not.toContain("alpha");
  });
});

describe("human presentation contracts", () => {
  it("maps detailed operation states into exactly four outcomes", () => {
    expect(presentOperationState("browser-required").state).toBe("ready");
    expect(presentOperationState("verifying").state).toBe("in-progress");
    expect(presentOperationState("verified").state).toBe("succeeded");
    expect(presentOperationState("blocked-service-auth-required").state).toBe("failed");
    expect(presentOperationState("blocked", { terminalBlocker: true }).state).toBe("failed");
  });

  it("maps site persistence into three conditions without changing it", () => {
    expect(presentSiteCondition(site()).state).toBe("ready");
    expect(presentSiteCondition(site({ lifecycleStatus: "partially-created" })).state).toBe("needs-attention");
    expect(presentSiteCondition(site({ status: "archived" })).state).toBe("unavailable");
    expect(presentSiteCondition(site({ lifecycleStatus: "failed", derivedHealthStatus: "failed" })).state).toBe("unavailable");
  });

  it("presents only Admin and Viewer and never enables Viewer mutations", () => {
    expect(presentVisibleRole("operator")).toBe("admin");
    expect(presentVisibleRole("viewer")).toBe("viewer");
    expect(canMutate("admin")).toBe(true);
    expect(canMutate("viewer")).toBe(false);
  });

  it("does not call evidence-only records recoverable backups", () => {
    expect(presentBackupRecoverability({ status: "succeeded", verification: { status: "verified" } }).recoverable).toBe(false);
    expect(presentBackupRecoverability({
      status: "succeeded",
      verification: { status: "verified" },
      storagePath: "/backups/alpha/b1",
      filesCount: 3,
      sourcePaths: [{ path: "/source/a", exists: true, status: "verified" }]
    }).recoverable).toBe(true);
  });

  it("keeps successful slices visible when another load fails", async () => {
    const [good, bad] = await Promise.all([
      settleSlice(Promise.resolve(["site"])),
      settleSlice(Promise.reject(new Error("jobs unavailable")))
    ]);
    expect(good).toEqual({ status: "ready", data: ["site"], error: "" });
    expect(bad).toEqual({ status: "failed", data: null, error: "jobs unavailable" });
  });
});

describe("Mongo consolidation identity boundary", () => {
  it("keeps control-plane navigation separate from logical and physical data-plane identities", () => {
    const identities = identityBoundaryForSite(site({
      siteCode: "not-an-identity",
      builderSiteId: "builder-alpha",
      mongoSiteId: "mongo-alpha",
      safeCollectionName: "site_alpha_123",
      siteIdentityKey: "full-identity-key"
    }));
    expect(identities).toEqual({
      managedSiteId: "managed-507f1f77bcf86cd799439011",
      builderSiteId: "builder-alpha",
      mongoSiteId: "mongo-alpha",
      safeCollectionName: "site_alpha_123",
      siteIdentityKey: "full-identity-key"
    });
  });
});
