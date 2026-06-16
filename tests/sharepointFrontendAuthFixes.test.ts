import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const root = process.cwd();
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

const makeLocalStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
    clear: vi.fn(() => {
      values.clear();
    })
  };
};

beforeEach(() => {
  vi.stubGlobal("window", {
    location: {
      hostname: "portal.army.idf",
      origin: "https://portal.army.idf",
      href: "https://portal.army.idf/sites/alphateam/siteBuilderHub/dist3/index.html#/diagnostics"
    },
    localStorage: makeLocalStorage()
  });
});

afterEach(async () => {
  const api = await import("../client/src/api/sitesApi");
  api.setSharePointCurrentUserForApi(null);
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("SharePoint-hosted frontend auth fixes", () => {
  it("extracts s-prefixed personal numbers from SharePoint login and email", async () => {
    const {
      extractPersonalNumberFromSharePointCurrentUser,
      normalizePersonalNumber
    } = await import("../client/src/api/sitesApi");

    expect(
      extractPersonalNumberFromSharePointCurrentUser({
        id: 7,
        title: "שם משתמש",
        loginName: "i:0#.w|army\\s8856096",
        email: ""
      })
    ).toBe("s8856096");
    expect(
      extractPersonalNumberFromSharePointCurrentUser({
        id: 8,
        title: "שם משתמש",
        loginName: "",
        email: "s8856096@army.idf.il"
      })
    ).toBe("s8856096");
    expect(normalizePersonalNumber("8856096")).toBe("s8856096");
    expect(normalizePersonalNumber("s8856096")).toBe("s8856096");
  });

  it("stores the detected SharePoint personal number after current-user detection", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          d: {
            Id: 7,
            Title: "שם משתמש",
            LoginName: "i:0#.w|army\\s8856096",
            Email: "s8856096@army.idf.il"
          }
        }),
        { status: 200, statusText: "OK", headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchSpy);

    const { detectSharePointCurrentUser, getHubPersonalNumber } = await import("../client/src/api/sitesApi");

    await expect(detectSharePointCurrentUser()).resolves.toMatchObject({ ok: true });
    expect(getHubPersonalNumber()).toBe("s8856096");
  });

  it("uses only safe API headers and never sends the Hebrew SharePoint title", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, data: { authenticated: true, user: null } }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchSpy);

    const { setSharePointCurrentUserForApi, sitesApi } = await import("../client/src/api/sitesApi");
    setSharePointCurrentUserForApi({
      id: 7,
      title: "שם משתמש בעברית",
      loginName: "i:0#.w|army\\s8856096",
      email: "s8856096@army.idf.il"
    });

    await sitesApi.me();

    const headers = fetchSpy.mock.calls[0][1]?.headers as Headers;
    expect(headers.get("x-personal-number")).toBe("s8856096");
    expect(headers.get("x-sharepoint-user-id")).toBe("7");
    expect(headers.get("x-sharepoint-login-name")).toBe("i:0#.w|army\\s8856096");
    expect(headers.get("x-sharepoint-email")).toBe("s8856096@army.idf.il");
    expect(headers.has("x-sharepoint-title")).toBe(false);
  });

  it("keeps diagnostics logging safe and grouped for the SharePoint check button", () => {
    const diagnostics = read("client/src/pages/DiagnosticsPage.tsx");

    expect(diagnostics).toContain('console.groupCollapsed("[HUB][SharePoint diagnostics] בדוק SharePoint עכשיו")');
    expect(diagnostics).toContain("Personal number exists:");
    expect(diagnostics).toContain("Browser currentuser URL:");
    expect(diagnostics).toContain("Browser contextinfo URL:");
    expect(diagnostics).toContain("digestFound");
    expect(diagnostics).toContain("digestPreview");
    expect(diagnostics).not.toContain("document.cookie");
    expect(diagnostics).not.toContain("Bearer token:");
  });

  it("prefers personal number and login name over SharePoint display title in the status bar", () => {
    const statusBar = read("client/src/components/SystemStatusBar.tsx");

    expect(statusBar).toContain("extractPersonalNumber(authUser.personalNumber, authUser.loginName, authUser.email)");
    expect(statusBar).toContain("authUser.loginName || authUser.name");
  });

  it("keeps backend personal-number normalization compatible with bare digits and s-prefixed values", async () => {
    const { normalizePersonalNumber } = await import("../server/src/services/personal-auth.service");

    expect(normalizePersonalNumber("8856096")).toBe("s8856096");
    expect(normalizePersonalNumber("s8856096")).toBe("s8856096");
    expect(normalizePersonalNumber("i:0#.w|army\\s8856096")).toBe("s8856096");
  });
});
