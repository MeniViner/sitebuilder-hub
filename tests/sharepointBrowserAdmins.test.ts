import { afterEach, describe, expect, it, vi } from "vitest";
import type { Site } from "../client/src/types/site";
import {
  buildBrowserAssociatedOwnerGroupUrl,
  buildBrowserOwnersGroupUsersUrl,
  buildBrowserSiteCollectionAdminsUrl,
  buildBrowserTxtAdminsUrl,
  readSharePointAdminsFromBrowser
} from "../client/src/utils/sharepointBrowserAdmins";

const makeSite = (): Site => ({
  _id: "site-1",
  siteCode: "schedule",
  displayName: "Schedule",
  sharePointHost: "portal.army.idf",
  sharePointSiteUrl: "https://portal.army.idf/sites/schedule",
  status: "active",
  createdAt: "2026-06-16T00:00:00.000Z",
  updatedAt: "2026-06-16T00:00:00.000Z",
  derivedHealthStatus: "unknown"
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("browser SharePoint admin reads", () => {
  it("builds browser admin source URLs for TXT, Site Collection admins, and Owners Group", () => {
    const site = makeSite();

    expect(buildBrowserTxtAdminsUrl(site)).toBe(
      "https://portal.army.idf/sites/schedule/siteDB/siteAssets/users_data.txt"
    );
    expect(buildBrowserSiteCollectionAdminsUrl(site)).toBe(
      "https://portal.army.idf/sites/schedule/_api/web/siteusers?$select=Id,Title,Email,LoginName,IsSiteAdmin,PrincipalType&$filter=IsSiteAdmin eq true"
    );
    expect(buildBrowserAssociatedOwnerGroupUrl(site)).toBe(
      "https://portal.army.idf/sites/schedule/_api/web/associatedownergroup"
    );
    expect(buildBrowserOwnersGroupUsersUrl(site, 42)).toBe(
      "https://portal.army.idf/sites/schedule/_api/web/sitegroups(42)/users?$select=Id,Title,Email,LoginName,IsSiteAdmin,PrincipalType"
    );
  });

  it("reads and parses all admin sources with credentials include", async () => {
    const fetchSpy = vi.fn((url: string) => {
      if (url.endsWith("users_data.txt")) {
        return Promise.resolve(new Response(JSON.stringify([
          { displayName: "Txt Admin", email: "txt@example.test", loginName: "i:0#.f|membership|txt@example.test" }
        ]), { status: 200, statusText: "OK" }));
      }
      if (url.includes("siteusers?")) {
        return Promise.resolve(new Response(JSON.stringify({
          d: {
            results: [
              { Title: "SC Admin", Email: "sc@example.test", LoginName: "i:0#.f|membership|sc@example.test", IsSiteAdmin: true }
            ]
          }
        }), { status: 200, statusText: "OK" }));
      }
      if (url.endsWith("/_api/web/associatedownergroup")) {
        return Promise.resolve(new Response(JSON.stringify({ d: { Id: 42, Title: "Owners" } }), { status: 200, statusText: "OK" }));
      }
      return Promise.resolve(new Response(JSON.stringify({
        d: {
          results: [
            { Title: "Owner Admin", Email: "owner@example.test", LoginName: "i:0#.f|membership|owner@example.test" }
          ]
        }
      }), { status: 200, statusText: "OK" }));
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await readSharePointAdminsFromBrowser(makeSite());

    expect(result.connectorMode).toBe("browser-sharepoint");
    expect(result.adminsCount).toBe(3);
    expect(result.txtAdmins).toHaveLength(1);
    expect(result.siteCollectionAdmins).toHaveLength(1);
    expect(result.ownersGroupAdmins).toHaveLength(1);
    expect(result.sourceStatus.every((source) => source.ok && source.status === "success")).toBe(true);
    for (const [, init] of fetchSpy.mock.calls) {
      expect(init).toEqual(expect.objectContaining({ credentials: "include" }));
    }
  });

  it("represents a failed source as failed, not as a real zero count", async () => {
    const fetchSpy = vi.fn((url: string) => {
      if (url.endsWith("users_data.txt")) {
        return Promise.resolve(new Response("missing", { status: 404, statusText: "Not Found" }));
      }
      if (url.includes("siteusers?")) {
        return Promise.resolve(new Response(JSON.stringify({ d: { results: [] } }), { status: 200, statusText: "OK" }));
      }
      if (url.endsWith("/_api/web/associatedownergroup")) {
        return Promise.resolve(new Response(JSON.stringify({ d: { Id: 42 } }), { status: 200, statusText: "OK" }));
      }
      return Promise.resolve(new Response(JSON.stringify({ d: { results: [] } }), { status: 200, statusText: "OK" }));
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await readSharePointAdminsFromBrowser(makeSite());
    const txtStatus = result.sourceStatus.find((source) => source.source === "txt");

    expect(txtStatus).toMatchObject({
      source: "txt",
      status: "failed",
      ok: false,
      httpStatus: 404
    });
    expect(txtStatus).not.toHaveProperty("count", 0);
  });
});
