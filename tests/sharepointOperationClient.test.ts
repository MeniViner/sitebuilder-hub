import { describe, expect, it, vi } from "vitest";
import { resetTestEnv } from "./setup/env";

const testPaths = {
  host: "portal.army.idf",
  siteCode: "alpha",
  siteRoot: "/sites/alpha",
  sharePointSiteUrl: "https://portal.army.idf/sites/alpha",
  siteDbLibrary: "siteDB",
  usersDbLibrary: "siteUsersDb",
  bootstrapLibrary: "SiteAssets",
  bootstrapFolder: "sitebuilder-bootstrap",
  widgetsDbTarget: "users",
  siteDbRoot: "/sites/alpha/siteDB",
  usersDbRoot: "/sites/alpha/siteUsersDb",
  siteAssetsRoot: "/sites/alpha/siteDB/siteAssets",
  imagesRoot: "/sites/alpha/siteDB/images",
  finalDistRoot: "/sites/alpha/siteDB/dist",
  finalAppUrl: "https://portal.army.idf/sites/alpha/siteDB/dist/index.html",
  bootstrapRoot: "/sites/alpha/SiteAssets/sitebuilder-bootstrap",
  bootstrapDistRoot: "/sites/alpha/SiteAssets/sitebuilder-bootstrap/dist",
  bootstrapUrl: "https://portal.army.idf/sites/alpha/SiteAssets/sitebuilder-bootstrap/dist/index.html#/admin/sharepoint-setup",
  backupsRoot: "/sites/alpha/siteDB/siteAssets/Backups",
  runtimeConfigPath: "/sites/alpha/siteDB/dist/sitebuilder-runtime-config.json",
  runtimeConfigUrl: "https://portal.army.idf/sites/alpha/siteDB/dist/sitebuilder-runtime-config.json",
  deployManifestFile: "/sites/alpha/SiteAssets/sitebuilder-bootstrap/dist/sharepoint-deploy-manifest.json",
  permissionsMarkerFile: "/sites/alpha/siteUsersDb/.permissions-setup.json",
  txtFiles: {
    masterConfig: "/sites/alpha/siteDB/siteAssets/bihs_master_config_v1.txt",
    users: "/sites/alpha/siteDB/siteAssets/users_data.txt",
    events: "/sites/alpha/siteDB/siteAssets/events_data.txt",
    navigation: "/sites/alpha/siteDB/siteAssets/nav_data.txt",
    siteContent: "/sites/alpha/siteDB/siteAssets/site_content_data.txt",
    theme: "/sites/alpha/siteDB/siteAssets/theme_data.txt",
    widgets: "/sites/alpha/siteUsersDb/widgets_data.txt",
    externalLinks: "/sites/alpha/siteDB/siteAssets/external_links_data.txt",
    gantt: "/sites/alpha/siteDB/siteAssets/gantt_data.txt"
  }
} as const;

const importSharePointClient = async (envOverrides: Record<string, string> = {}) => {
  resetTestEnv(envOverrides);
  vi.resetModules();
  return import("../server/src/services/sharepointOperationClient");
};

describe("server SharePoint client disabled by architecture", () => {
  it("reports SharePoint REST as unavailable even when legacy env vars are present", async () => {
    const client = await importSharePointClient({
      SHAREPOINT_WRITE_ENABLED: "true",
      SHAREPOINT_AUTH_COOKIE: "FedAuth=test-cookie",
      SHAREPOINT_BEARER_TOKEN: "test-token",
      SHAREPOINT_ALLOW_UNAUTHENTICATED_WRITE: "true"
    });

    expect(client.getSharePointOperationCapabilities()).toMatchObject({
      readAvailable: false,
      readUsesAuthMaterial: false,
      writeEnabled: false,
      hasAuthMaterial: false,
      unauthenticatedWriteAllowed: false,
      writeAvailable: false,
      writeVerified: false,
      authMode: "none",
      authModes: [],
      digest: {
        canRequest: false,
        requiredForWrites: true,
        endpointSuffix: "/_api/contextinfo"
      },
      reason: "Server-side SharePoint REST is disabled. Use the active browser SharePoint session for SharePoint reads and writes."
    });
  });

  it("blocks write helpers before any network call", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const client = await importSharePointClient();

    await expect(client.getRequestDigest(testPaths)).rejects.toBeInstanceOf(client.SharePointWriteCapabilityError);
    await expect(client.writeSharePointTextFile(testPaths, testPaths.txtFiles.users, "[]")).rejects.toBeInstanceOf(client.SharePointWriteCapabilityError);
    await expect(client.ensureSharePointSiteCollection(testPaths, { title: "Alpha" })).rejects.toBeInstanceOf(client.SharePointWriteCapabilityError);
    await expect(client.ensureSharePointUser(testPaths, "user@example.test")).rejects.toBeInstanceOf(client.SharePointWriteCapabilityError);
    await expect(client.setSharePointSiteCollectionAdmin(testPaths, 42, true)).rejects.toBeInstanceOf(client.SharePointWriteCapabilityError);
    await expect(client.removeSharePointUserFromGroup(testPaths, 7, "i:0#.f|membership|user@example.test")).rejects.toBeInstanceOf(client.SharePointWriteCapabilityError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not expose legacy SharePoint auth headers for server reads", async () => {
    const client = await importSharePointClient({
      SHAREPOINT_AUTH_COOKIE: "FedAuth=test-cookie",
      SHAREPOINT_BEARER_TOKEN: "test-token"
    });

    expect(client.getSharePointReadHeaders("text/plain")).toEqual({ Accept: "text/plain" });
  });
});
