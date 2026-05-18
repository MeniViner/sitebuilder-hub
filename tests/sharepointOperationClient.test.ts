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
    externalLinks: "/sites/alpha/siteDB/siteAssets/external_links_data.txt"
  }
} as const;

const importSharePointClient = async (envOverrides: Record<string, string> = {}) => {
  resetTestEnv(envOverrides);
  vi.resetModules();
  return import("../server/src/services/sharepointOperationClient");
};

describe("SharePoint operation capabilities", () => {
  it("defaults to read-only without auth material or write enablement", async () => {
    const client = await importSharePointClient();

    expect(client.getSharePointOperationCapabilities()).toMatchObject({
      readAvailable: true,
      readUsesAuthMaterial: false,
      writeEnabled: false,
      hasAuthMaterial: false,
      unauthenticatedWriteAllowed: false,
      writeAvailable: false,
      authMode: "none",
      authModes: [],
      requestTimeoutMs: 15000,
      digest: {
        requiredForWrites: true,
        endpointSuffix: "/_api/contextinfo",
        canRequest: false
      },
      reason: "SharePoint write is disabled. Set SHAREPOINT_WRITE_ENABLED=true and configure auth material to run real write operations."
    });
  });

  it("keeps writes blocked when write is enabled without auth material", async () => {
    const client = await importSharePointClient({
      SHAREPOINT_WRITE_ENABLED: "true"
    });

    const capabilities = client.getSharePointOperationCapabilities();
    expect(capabilities).toMatchObject({
      writeEnabled: true,
      hasAuthMaterial: false,
      unauthenticatedWriteAllowed: false,
      writeAvailable: false,
      authMode: "none",
      digest: {
        canRequest: false
      }
    });
    expect(capabilities.reason).toContain("no SHAREPOINT_AUTH_COOKIE");
    expect(capabilities.digest.reason).toBe(capabilities.reason);
  });

  it("reports bearer and cookie auth as write capable and exposes auth read headers", async () => {
    const client = await importSharePointClient({
      SHAREPOINT_WRITE_ENABLED: "true",
      SHAREPOINT_AUTH_COOKIE: "FedAuth=test-cookie",
      SHAREPOINT_BEARER_TOKEN: "test-token",
      SHAREPOINT_REQUEST_TIMEOUT_MS: "3210"
    });

    expect(client.getSharePointOperationCapabilities()).toMatchObject({
      readUsesAuthMaterial: true,
      writeEnabled: true,
      hasAuthMaterial: true,
      writeAvailable: true,
      authMode: "bearer",
      authModes: ["bearer", "cookie"],
      requestTimeoutMs: 3210,
      digest: {
        canRequest: true
      },
      reason: undefined
    });
    expect(client.getSharePointReadHeaders("text/plain")).toEqual({
      Accept: "text/plain",
      Cookie: "FedAuth=test-cookie",
      Authorization: "Bearer test-token"
    });
  });

  it("can explicitly allow unauthenticated writes for closed-network operation", async () => {
    const client = await importSharePointClient({
      SHAREPOINT_WRITE_ENABLED: "true",
      SHAREPOINT_ALLOW_UNAUTHENTICATED_WRITE: "true"
    });

    expect(client.getSharePointOperationCapabilities()).toMatchObject({
      writeEnabled: true,
      hasAuthMaterial: false,
      unauthenticatedWriteAllowed: true,
      writeAvailable: true,
      authMode: "none",
      authModes: [],
      digest: {
        canRequest: true
      },
      reason: undefined
    });
  });

  it("blocks write operations before any network call when capability is unavailable", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const client = await importSharePointClient({
      SHAREPOINT_WRITE_ENABLED: "false"
    });

    await expect(
      client.writeSharePointTextFile(testPaths, "/sites/alpha/siteDB/siteAssets/users_data.txt", "{}")
    ).rejects.toBeInstanceOf(client.SharePointWriteCapabilityError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("requests a digest through injected fetch when write capability is available", async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(
        JSON.stringify({
          d: {
            GetContextWebInformation: {
              FormDigestValue: "digest-value"
            }
          }
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        }
      )
    );
    vi.stubGlobal("fetch", fetchSpy);
    const client = await importSharePointClient({
      SHAREPOINT_WRITE_ENABLED: "true",
      SHAREPOINT_ALLOW_UNAUTHENTICATED_WRITE: "true"
    });

    await expect(client.getRequestDigest(testPaths)).resolves.toBe("digest-value");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://portal.army.idf/sites/alpha/_api/contextinfo",
      expect.objectContaining({
        method: "POST",
        headers: {
          Accept: "application/json;odata=verbose",
          "Content-Type": "application/json;odata=verbose"
        }
      })
    );
  });

  it("creates a missing SharePoint site collection through SPSiteManager and polls until ready", async () => {
    const responses = [
      new Response(JSON.stringify({ SiteStatus: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }),
      new Response(JSON.stringify({
        d: {
          GetContextWebInformation: {
            FormDigestValue: "root-digest"
          }
        }
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }),
      new Response(JSON.stringify({ SiteId: "creating-site" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }),
      new Response(JSON.stringify({ SiteStatus: 2, SiteId: "site-guid", SiteUrl: "https://portal.army.idf/sites/alpha" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    ];
    const fetchSpy = vi.fn(async () => responses.shift()!);
    vi.stubGlobal("fetch", fetchSpy);
    const client = await importSharePointClient({
      SHAREPOINT_WRITE_ENABLED: "true",
      SHAREPOINT_ALLOW_UNAUTHENTICATED_WRITE: "true",
      SHAREPOINT_SITE_CREATE_POLL_ATTEMPTS: "2",
      SHAREPOINT_SITE_CREATE_POLL_INTERVAL_MS: "1"
    });

    const result = await client.ensureSharePointSiteCollection(testPaths, {
      title: "Alpha Site",
      description: "New Alpha site",
      owner: "owner@example.test",
      lcid: 1033,
      webTemplate: "STS#3"
    });

    expect(result).toMatchObject({
      action: "created",
      targetUrl: "https://portal.army.idf/sites/alpha",
      statusBefore: { statusName: "not-found", siteStatus: 0 },
      statusAfter: { statusName: "ready", siteStatus: 2, siteId: "site-guid" }
    });
    expect(fetchSpy).toHaveBeenCalledTimes(4);
    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      "https://portal.army.idf/_api/SPSiteManager/status?url='https%3A%2F%2Fportal.army.idf%2Fsites%2Falpha'",
      expect.objectContaining({ method: "GET" })
    );
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      "https://portal.army.idf/_api/contextinfo",
      expect.objectContaining({ method: "POST" })
    );
    expect(fetchSpy).toHaveBeenNthCalledWith(
      3,
      "https://portal.army.idf/_api/SPSiteManager/create",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-RequestDigest": "root-digest"
        }),
        body: JSON.stringify({
          request: {
            Title: "Alpha Site",
            Url: "https://portal.army.idf/sites/alpha",
            Lcid: 1033,
            ShareByEmailEnabled: false,
            Description: "New Alpha site",
            WebTemplate: "STS#3",
            Owner: "owner@example.test"
          }
        })
      })
    );
  });

  it("does not create a SharePoint site collection when status is already ready", async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify({ SiteStatus: 2, SiteId: "site-guid" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchSpy);
    const client = await importSharePointClient({
      SHAREPOINT_WRITE_ENABLED: "true",
      SHAREPOINT_ALLOW_UNAUTHENTICATED_WRITE: "true"
    });

    const result = await client.ensureSharePointSiteCollection(testPaths, {
      title: "Alpha Site",
      owner: "owner@example.test"
    });

    expect(result).toMatchObject({
      action: "already-exists",
      statusAfter: { statusName: "ready", siteId: "site-guid" }
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("ensures a user and maps the SharePoint payload into a normalized user", async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(
        JSON.stringify({
          d: {
            Id: 42,
            Title: "Bob Admin",
            Email: "bob@example.test",
            LoginName: "i:0#.f|membership|bob@example.test"
          }
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        }
      )
    );
    vi.stubGlobal("fetch", fetchSpy);
    const client = await importSharePointClient({
      SHAREPOINT_WRITE_ENABLED: "true",
      SHAREPOINT_ALLOW_UNAUTHENTICATED_WRITE: "true"
    });

    await expect(client.ensureSharePointUser(testPaths, "bob@example.test", "digest-value")).resolves.toMatchObject({
      id: 42,
      displayName: "Bob Admin",
      email: "bob@example.test",
      loginName: "i:0#.f|membership|bob@example.test"
    });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://portal.army.idf/sites/alpha/_api/web/ensureuser");
    expect(init).toEqual(
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-RequestDigest": "digest-value"
        }),
        body: JSON.stringify({ logonName: "bob@example.test" })
      })
    );
  });

  it("sets a Site Collection Admin flag with SharePoint MERGE semantics", async () => {
    const fetchSpy = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchSpy);
    const client = await importSharePointClient({
      SHAREPOINT_WRITE_ENABLED: "true",
      SHAREPOINT_ALLOW_UNAUTHENTICATED_WRITE: "true"
    });

    await client.setSharePointSiteCollectionAdmin(
      testPaths,
      { id: 42, loginName: "i:0#.f|membership|bob@example.test" },
      true,
      "digest-value"
    );

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://portal.army.idf/sites/alpha/_api/web/getuserbyid(42)");
    expect(init).toEqual(
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-RequestDigest": "digest-value",
          "IF-MATCH": "*",
          "X-HTTP-Method": "MERGE"
        })
      })
    );
    expect(JSON.parse(String(init.body))).toMatchObject({
      __metadata: { type: "SP.User" },
      IsSiteAdmin: true
    });
  });

  it("removes an Owners Group member with an encoded login-name alias", async () => {
    const fetchSpy = vi.fn(async () => new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const client = await importSharePointClient({
      SHAREPOINT_WRITE_ENABLED: "true",
      SHAREPOINT_ALLOW_UNAUTHENTICATED_WRITE: "true"
    });

    await client.removeSharePointUserFromGroup(
      testPaths,
      7,
      "i:0#.f|membership|bob@example.test",
      "digest-value"
    );

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(
      "https://portal.army.idf/sites/alpha/_api/web/sitegroups(7)/users/removebyloginname(@v)?@v='i%3A0%23.f%7Cmembership%7Cbob%40example.test'"
    );
    expect(init).toEqual(
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-RequestDigest": "digest-value"
        }),
        body: undefined
      })
    );
  });
});
