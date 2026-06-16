import { describe, expect, it } from "vitest";
import {
  resolveSiteBuilderPaths as resolveClientSiteBuilderPaths,
  type SiteBuilderPathInput as ClientSiteBuilderPathInput
} from "../client/src/utils/sitebuilderPaths";
import {
  resolveSiteBuilderPaths as resolveServerSiteBuilderPaths,
  type SiteBuilderPathInput as ServerSiteBuilderPathInput
} from "../server/src/utils/sitebuilderPaths";

const sharedPathKeys = [
  "host",
  "siteRoot",
  "sharePointSiteUrl",
  "siteDbRoot",
  "usersDbRoot",
  "siteAssetsRoot",
  "imagesRoot",
  "finalDistRoot",
  "finalAppUrl",
  "bootstrapRoot",
  "bootstrapDistRoot",
  "bootstrapUrl",
  "backupsRoot",
  "deployManifestFile",
  "permissionsMarkerFile",
  "widgetsDbTarget",
  "txtFiles"
] as const;

const pickSharedPaths = (paths: Record<string, unknown>) =>
  Object.fromEntries(sharedPathKeys.map((key) => [key, paths[key]]));

const parityCases: Array<ServerSiteBuilderPathInput & ClientSiteBuilderPathInput> = [
  { siteCode: "bihs7134" },
  {
    siteCode: " /alpha-site/ ",
    sharePointHost: "https://tenant.sharepoint.local/sites/ignored",
    sharePointSiteUrl: "https://portal.army.idf/teams/alpha",
    siteDbLibrary: "/teams/alpha/CustomSiteDb",
    usersDbLibrary: "nested/customUsers",
    bootstrapLibrary: "Shared Documents/SiteAssets",
    bootstrapFolder: "/bootstrap/root/",
    widgetsDbTarget: "SITE"
  }
];

describe("server Site Builder path resolver", () => {
  it("resolves deterministic default SharePoint paths", () => {
    const paths = resolveServerSiteBuilderPaths({ siteCode: "bihs7134" });

    expect(paths).toMatchObject({
      host: "portal.army.idf",
      siteCode: "bihs7134",
      siteRoot: "/sites/bihs7134",
      sharePointSiteUrl: "https://portal.army.idf/sites/bihs7134",
      siteDbLibrary: "siteDB",
      usersDbLibrary: "siteUsersDb",
      bootstrapLibrary: "SiteAssets",
      bootstrapFolder: "sitebuilder-bootstrap",
      widgetsDbTarget: "users",
      siteDbRoot: "/sites/bihs7134/siteDB",
      usersDbRoot: "/sites/bihs7134/siteUsersDb",
      siteAssetsRoot: "/sites/bihs7134/siteDB/siteAssets",
      imagesRoot: "/sites/bihs7134/siteDB/images",
      finalDistRoot: "/sites/bihs7134/siteDB/dist",
      finalAppUrl: "https://portal.army.idf/sites/bihs7134/siteDB/dist/index.html",
      bootstrapRoot: "/sites/bihs7134/SiteAssets/sitebuilder-bootstrap",
      bootstrapDistRoot: "/sites/bihs7134/SiteAssets/sitebuilder-bootstrap/dist",
      bootstrapUrl: "https://portal.army.idf/sites/bihs7134/SiteAssets/sitebuilder-bootstrap/dist/index.html#/admin/sharepoint-setup",
      backupsRoot: "/sites/bihs7134/siteDB/siteAssets/Backups",
      deployManifestFile: "/sites/bihs7134/SiteAssets/sitebuilder-bootstrap/dist/sharepoint-deploy-manifest.json",
      permissionsMarkerFile: "/sites/bihs7134/siteUsersDb/.permissions-setup.json"
    });
    expect(paths.txtFiles).toEqual({
      masterConfig: "/sites/bihs7134/siteDB/siteAssets/bihs_master_config_v1.txt",
      users: "/sites/bihs7134/siteDB/siteAssets/users_data.txt",
      events: "/sites/bihs7134/siteDB/siteAssets/events_data.txt",
      navigation: "/sites/bihs7134/siteDB/siteAssets/nav_data.txt",
      siteContent: "/sites/bihs7134/siteDB/siteAssets/site_content_data.txt",
      theme: "/sites/bihs7134/siteDB/siteAssets/theme_data.txt",
      widgets: "/sites/bihs7134/siteUsersDb/widgets_data.txt",
      externalLinks: "/sites/bihs7134/siteDB/siteAssets/external_links_data.txt",
      gantt: "/sites/bihs7134/siteDB/siteAssets/gantt_data.txt"
    });
  });

  it("normalizes custom hosts, roots, libraries, and widget target", () => {
    const paths = resolveServerSiteBuilderPaths(parityCases[1]);

    expect(paths).toMatchObject({
      host: "tenant.sharepoint.local",
      siteCode: "alpha-site",
      siteRoot: "/teams/alpha",
      sharePointSiteUrl: "https://tenant.sharepoint.local/teams/alpha",
      siteDbLibrary: "CustomSiteDb",
      usersDbLibrary: "customUsers",
      bootstrapLibrary: "SiteAssets",
      bootstrapFolder: "root",
      widgetsDbTarget: "site",
      siteDbRoot: "/teams/alpha/CustomSiteDb",
      usersDbRoot: "/teams/alpha/customUsers",
      siteAssetsRoot: "/teams/alpha/CustomSiteDb/siteAssets",
      bootstrapRoot: "/teams/alpha/SiteAssets/root"
    });
    expect(paths.txtFiles.widgets).toBe("/teams/alpha/CustomSiteDb/siteAssets/widgets_data.txt");
  });

  it("requires a site code", () => {
    expect(() => resolveServerSiteBuilderPaths({ siteCode: " / " })).toThrow(
      "siteCode is required to resolve Site Builder paths"
    );
  });
});

describe("client Site Builder path resolver", () => {
  it("returns null when the site code is missing", () => {
    expect(resolveClientSiteBuilderPaths({ siteCode: "" })).toBeNull();
  });

  it("resolves the client-facing default paths", () => {
    expect(resolveClientSiteBuilderPaths({ siteCode: "bihs7134" })).toMatchObject({
      host: "portal.army.idf",
      siteRoot: "/sites/bihs7134",
      sharePointSiteUrl: "https://portal.army.idf/sites/bihs7134",
      siteDbRoot: "/sites/bihs7134/siteDB",
      usersDbRoot: "/sites/bihs7134/siteUsersDb",
      finalAppUrl: "https://portal.army.idf/sites/bihs7134/siteDB/dist/index.html",
      widgetsDbTarget: "users"
    });
  });
});

describe("server/client Site Builder path parity", () => {
  it.each(parityCases)("matches shared resolved path fields for %#", (input) => {
    const serverPaths = resolveServerSiteBuilderPaths(input);
    const clientPaths = resolveClientSiteBuilderPaths(input);

    expect(clientPaths).not.toBeNull();
    expect(pickSharedPaths(clientPaths!)).toEqual(pickSharedPaths(serverPaths));
  });
});
