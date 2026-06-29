import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Site } from "../client/src/types/site";
import {
  buildContextInfoUrl,
  buildSharePointFilesAddUrl,
  backupSiteToSharePointBrowser,
  buildBrowserSharePointBackupPlan,
  clearBrowserDigestCache,
  combineSharePointConnectorDiagnostics,
  deployArtifactToSharePointBrowser,
  extractFormDigestValue,
  listBrowserSharePointBackupInventory,
  requestBrowserDigest,
  runBrowserSharePointHealthCheck,
  uploadFileToSharePointBrowser
} from "../client/src/utils/sharepointBrowserConnector";
import { getDeployMvpMissingRequirements } from "../client/src/utils/deployMvp";

const makeSite = (siteCode: string, sharePointSiteUrl: string): Site => ({
  _id: `site-${siteCode}`,
  siteCode,
  displayName: `${siteCode} site`,
  sharePointHost: "portal.army.idf",
  sharePointSiteUrl,
  status: "active",
  createdAt: "2026-06-16T00:00:00.000Z",
  updatedAt: "2026-06-16T00:00:00.000Z",
  derivedHealthStatus: "unknown"
});

const digestPayload = (digest: string, webFullUrl: string) => ({
  d: {
    GetContextWebInformation: {
      FormDigestValue: digest,
      FormDigestTimeoutSeconds: 1800,
      WebFullUrl: webFullUrl
    }
  }
});

const sha256Hex = async (text: string) => {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

beforeEach(() => {
  clearBrowserDigestCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("Browser SharePoint connector", () => {
  it("builds the target-site contextinfo URL without reusing the HUB site", () => {
    expect(buildContextInfoUrl("https://portal.army.idf/sites/alphateam/")).toBe(
      "https://portal.army.idf/sites/alphateam/_api/contextinfo"
    );
    expect(buildContextInfoUrl("https://portal.army.idf/sites/schedule")).toBe(
      "https://portal.army.idf/sites/schedule/_api/contextinfo"
    );
  });

  it("uses credentials include and extracts FormDigestValue from verbose JSON", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(digestPayload("digest-schedule", "https://portal.army.idf/sites/schedule")), {
        status: 200,
        statusText: "OK",
        headers: { "Content-Type": "application/json;odata=verbose" }
      })
    );
    vi.stubGlobal("fetch", fetchSpy);

    await expect(requestBrowserDigest("https://portal.army.idf/sites/schedule")).resolves.toMatchObject({
      ok: true,
      digestFound: true,
      digestPreview: "digest-sch",
      cacheKey: "https://portal.army.idf/sites/schedule"
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://portal.army.idf/sites/schedule/_api/contextinfo",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: expect.objectContaining({
          Accept: "application/json;odata=verbose",
          "Content-Type": "application/json;odata=verbose"
        })
      })
    );
    expect(extractFormDigestValue(digestPayload("digest-value", "https://portal.army.idf/sites/schedule"))).toBe("digest-value");
  });

  it("keeps digest cache entries separated per target site", async () => {
    const fetchSpy = vi.fn((url: string) => {
      const site = url.includes("/sites/alphateam/") ? "alphateam" : "schedule";
      return Promise.resolve(
        new Response(JSON.stringify(digestPayload(`digest-${site}`, `https://portal.army.idf/sites/${site}`)), {
          status: 200,
          statusText: "OK",
          headers: { "Content-Type": "application/json;odata=verbose" }
        })
      );
    });
    vi.stubGlobal("fetch", fetchSpy);

    await requestBrowserDigest("https://portal.army.idf/sites/alphateam");
    await requestBrowserDigest("https://portal.army.idf/sites/schedule");
    await requestBrowserDigest("https://portal.army.idf/sites/alphateam");

    expect(fetchSpy.mock.calls.map((call) => call[0])).toEqual([
      "https://portal.army.idf/sites/alphateam/_api/contextinfo",
      "https://portal.army.idf/sites/schedule/_api/contextinfo"
    ]);
  });

  it("does not let backend 401 override browser connector success", () => {
    const combined = combineSharePointConnectorDiagnostics(
      {
        generatedAt: "2026-06-16T00:00:00.000Z",
        connectorMode: "browser-sharepoint",
        targetSharePointSiteUrl: "https://portal.army.idf/sites/schedule",
        site: { _id: "site-schedule", siteCode: "schedule", displayName: "schedule", status: "active" },
        currentUser: { connectorMode: "browser-sharepoint", ok: true, url: "currentuser", method: "GET", status: 200 },
        readTest: { connectorMode: "browser-sharepoint", ok: true, url: "read", method: "GET", status: 200 },
        digestTest: { connectorMode: "browser-sharepoint", ok: true, url: "contextinfo", method: "POST", status: 200, digestFound: true, cacheKey: "schedule" },
        writeCapability: { connectorMode: "browser-sharepoint", digestWorks: true, writeVerified: true, uploadImplemented: false, message: "" },
        overall: {
          reachable: true,
          authenticated: true,
          digestWorks: true,
          writeVerified: true,
          preferredConnectorMode: "browser-sharepoint",
          humanExplanation: "",
          suggestedFix: ""
        }
      },
      {
        generatedAt: "2026-06-16T00:00:00.000Z",
        connectorMode: "backend-sharepoint",
        currentUser: { ok: false, status: 401 },
        readTest: { ok: false, status: 401 },
        digestTest: { ok: false, status: 401 },
        overall: {
          reachable: false,
          authenticated: false,
          digestWorks: false,
          writeVerified: false,
          failedStatus: 401
        }
      }
    );

    expect(combined).toMatchObject({
      preferredConnectorMode: "browser-sharepoint",
      browserHealthy: true,
      backendBlockedBy401: true,
      globalBlocked: false,
      digestWorks: true
    });
    expect(combined.message).toContain("הדפדפן מחובר ל־SharePoint ומצליח לקבל Digest");
  });

  it("runs health probes from the browser connector with credentials include", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response("{}", { status: 200, statusText: "OK" }));
    vi.stubGlobal("fetch", fetchSpy);

    const result = await runBrowserSharePointHealthCheck(makeSite("schedule", "https://portal.army.idf/sites/schedule"));

    expect(result.connectorMode).toBe("browser-sharepoint");
    expect(result.source).toBe("Browser SharePoint");
    expect(result.health).toMatchObject({
      siteDbExists: true,
      usersDbExists: true,
      distExists: true,
      indexExists: true,
      assetsExists: true,
      permissionsOk: true,
      txtFilesExist: true
    });
    expect(fetchSpy).toHaveBeenCalled();
    for (const [, init] of fetchSpy.mock.calls) {
      expect(init).toEqual(expect.objectContaining({ credentials: "include" }));
    }
  });

  it("builds the Files/add upload URL for the target folder and file name", () => {
    expect(buildSharePointFilesAddUrl(
      "https://portal.army.idf/sites/schedule",
      "/sites/schedule/siteDB/dist/assets/app.js"
    )).toBe(
      "https://portal.army.idf/sites/schedule/_api/web/GetFolderByServerRelativeUrl('/sites/schedule/siteDB/dist/assets')/Files/add(url='app.js',overwrite=true)"
    );
  });

  it("uploads with credentials include, X-RequestDigest, and the digest from the same target site", async () => {
    const fetchSpy = vi.fn((url: string, init?: RequestInit) => {
      if (url.endsWith("/_api/contextinfo")) {
        return Promise.resolve(new Response(JSON.stringify(digestPayload("digest-schedule", "https://portal.army.idf/sites/schedule")), { status: 200 }));
      }
      return Promise.resolve(new Response("{}", { status: 200, statusText: "OK", headers: { etag: "\"1\"" } }));
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await uploadFileToSharePointBrowser({
      targetSiteUrl: "https://portal.army.idf/sites/schedule",
      targetPath: "/sites/schedule/siteDB/dist/index.html",
      relativePath: "index.html",
      body: new Blob(["hello"]),
      contentType: "text/html"
    });

    expect(result.status).toBe("uploaded");
    expect(fetchSpy.mock.calls[0][0]).toBe("https://portal.army.idf/sites/schedule/_api/contextinfo");
    expect(fetchSpy.mock.calls[1][0]).toBe(
      "https://portal.army.idf/sites/schedule/_api/web/GetFolderByServerRelativeUrl('/sites/schedule/siteDB/dist')/Files/add(url='index.html',overwrite=true)"
    );
    expect(fetchSpy.mock.calls[1][1]).toEqual(expect.objectContaining({
      method: "POST",
      credentials: "include",
      headers: expect.objectContaining({
        "X-RequestDigest": "digest-schedule",
        "Content-Type": "text/html"
      })
    }));
  });

  it("deploys multiple files and verifies each file by browser read-back", async () => {
    const indexSha = await sha256Hex("index");
    const appSha = await sha256Hex("app");
    const fetchSpy = vi.fn((url: string) => {
      if (url.endsWith("/_api/contextinfo")) {
        return Promise.resolve(new Response(JSON.stringify(digestPayload("digest-schedule", "https://portal.army.idf/sites/schedule")), { status: 200 }));
      }
      if (url.includes("/Files/add(")) {
        return Promise.resolve(new Response("{}", { status: 200, statusText: "OK" }));
      }
      if (url.endsWith("/index.html")) {
        return Promise.resolve(new Response("index", { status: 200, headers: { "Content-Type": "text/html" } }));
      }
      return Promise.resolve(new Response("app", { status: 200, headers: { "Content-Type": "text/javascript" } }));
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await deployArtifactToSharePointBrowser({
      releaseId: "release-1",
      siteId: "site-schedule",
      siteCode: "schedule",
      targetSiteUrl: "https://portal.army.idf/sites/schedule",
      targetDistPath: "/sites/schedule/siteDB/dist",
      files: [
        { relativePath: "index.html", targetRelativePath: "index.html", sizeBytes: 5, contentType: "text/html", sha256: indexSha, deployable: true, targetPath: "/sites/schedule/siteDB/dist/index.html" },
        { relativePath: "assets/app.js", targetRelativePath: "assets/app.js", sizeBytes: 3, contentType: "text/javascript", sha256: appSha, deployable: true, targetPath: "/sites/schedule/siteDB/dist/assets/app.js" }
      ],
      loadArtifactFile: async (relativePath) => ({
        blob: new Blob([relativePath === "index.html" ? "index" : "app"]),
        relativePath,
        sizeBytes: relativePath === "index.html" ? 5 : 3,
        sha256: relativePath === "index.html" ? indexSha : appSha,
        contentType: relativePath === "index.html" ? "text/html" : "text/javascript"
      })
    });

    expect(result.finalStatus).toBe("success");
    expect(result.readBackEvidence).toHaveLength(2);
    expect(result.readBackEvidence.every((item) => item.status === "verified")).toBe(true);
    expect(fetchSpy.mock.calls.filter((call) => String(call[0]).includes("/Files/add("))).toHaveLength(2);
  });

  it("marks a failed file upload as a failed browser deploy without failing other sites globally", async () => {
    const indexSha = await sha256Hex("index");
    const appSha = await sha256Hex("app");
    const fetchSpy = vi.fn((url: string) => {
      if (url.endsWith("/_api/contextinfo")) {
        return Promise.resolve(new Response(JSON.stringify(digestPayload("digest-schedule", "https://portal.army.idf/sites/schedule")), { status: 200 }));
      }
      if (url.includes("app.js") && url.includes("/Files/add(")) {
        return Promise.resolve(new Response("upload failed", { status: 500, statusText: "Server Error" }));
      }
      if (url.includes("/Files/add(")) {
        return Promise.resolve(new Response("{}", { status: 200, statusText: "OK" }));
      }
      return Promise.resolve(new Response("index", { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await deployArtifactToSharePointBrowser({
      releaseId: "release-1",
      siteId: "site-schedule",
      siteCode: "schedule",
      targetSiteUrl: "https://portal.army.idf/sites/schedule",
      targetDistPath: "/sites/schedule/siteDB/dist",
      files: [
        { relativePath: "index.html", targetRelativePath: "index.html", sizeBytes: 5, contentType: "text/html", sha256: indexSha, deployable: true, targetPath: "/sites/schedule/siteDB/dist/index.html" },
        { relativePath: "assets/app.js", targetRelativePath: "assets/app.js", sizeBytes: 3, contentType: "text/javascript", sha256: appSha, deployable: true, targetPath: "/sites/schedule/siteDB/dist/assets/app.js" }
      ],
      loadArtifactFile: async (relativePath) => ({
        blob: new Blob([relativePath === "index.html" ? "index" : "app"]),
        relativePath,
        sizeBytes: relativePath === "index.html" ? 5 : 3,
        sha256: relativePath === "index.html" ? indexSha : appSha,
        contentType: relativePath === "index.html" ? "text/html" : "text/javascript"
      })
    });

    expect(result.finalStatus).toBe("failed");
    expect(result.readBackEvidence.find((item) => item.relativePath === "index.html")?.status).toBe("verified");
    expect(result.readBackEvidence.find((item) => item.relativePath === "assets/app.js")?.status).toBe("failed");
    expect(result.errors).toEqual([expect.objectContaining({ relativePath: "assets/app.js", status: 500 })]);
  });

  it("does not require backend SharePoint write when browser connector mode is selected", () => {
    expect(getDeployMvpMissingRequirements({
      releaseId: "release-1",
      siteId: "site-1",
      deployMode: "local-dev-owner",
      releaseArtifactRef: "/tmp/dist",
      connectorMode: "browser-sharepoint",
      capabilities: {
        generatedAt: "2026-06-16T00:00:00.000Z",
        sharePoint: {
          readAvailable: true,
          writeEnabled: false,
          hasAuthMaterial: false,
          unauthenticatedWriteAllowed: false,
          writeAvailable: false,
          authMode: "none"
        },
        operations: {}
      }
    })).not.toContain("Deploy cannot run because SharePoint write is not configured.");
  });

  it("builds backup plans from the browser connector and never calls backend SharePoint", async () => {
    const fetchSpy = vi.fn((url: string, init?: RequestInit) => {
      if (url.endsWith("/_api/contextinfo")) {
        return Promise.resolve(new Response(JSON.stringify(digestPayload("digest-schedule", "https://portal.army.idf/sites/schedule")), { status: 200 }));
      }
      return Promise.resolve(new Response("source", { status: 200, statusText: "OK", headers: { "Content-Type": "text/plain" } }));
    });
    vi.stubGlobal("fetch", fetchSpy);

    const plan = await buildBrowserSharePointBackupPlan(makeSite("schedule", "https://portal.army.idf/sites/schedule"));

    expect(plan.summary).toMatchObject({
      totalSources: 9,
      existingSources: 9,
      authBlockedSources: 0,
      readyForBackup: true,
      readyForBackupExecution: true
    });
    expect(fetchSpy.mock.calls[0][0]).toBe("https://portal.army.idf/sites/schedule/_api/contextinfo");
    for (const [, init] of fetchSpy.mock.calls) {
      expect(init).toEqual(expect.objectContaining({ credentials: "include" }));
    }
    expect(plan.notes.join(" ")).toContain("Browser SharePoint Connector");
  });

  it("backs up source files through the browser using target-site digest, folder creation, upload, and read-back", async () => {
    const fetchSpy = vi.fn((url: string, init?: RequestInit) => {
      if (url.endsWith("/_api/contextinfo")) {
        return Promise.resolve(new Response(JSON.stringify(digestPayload("digest-schedule", "https://portal.army.idf/sites/schedule")), { status: 200 }));
      }
      if (url.endsWith("/_api/web/folders")) {
        return Promise.resolve(new Response("{}", { status: 201, statusText: "Created" }));
      }
      if (url.includes("/Files/add(")) {
        return Promise.resolve(new Response("{}", { status: 200, statusText: "OK" }));
      }
      const fileName = String(url).split("/").pop() || "file.txt";
      return Promise.resolve(new Response(fileName, { status: 200, statusText: "OK", headers: { "Content-Type": "text/plain" } }));
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await backupSiteToSharePointBrowser(makeSite("schedule", "https://portal.army.idf/sites/schedule"));

    expect(result.finalStatus).toBe("success");
    expect(result.connectorMode).toBe("browser-sharepoint");
    expect(result.verificationEvidence).toHaveLength(9);
    expect(result.verificationEvidence.every((item) => item.status === "verified" && item.sizeMatches && item.sha256Matches)).toBe(true);
    expect(fetchSpy.mock.calls[0][0]).toBe("https://portal.army.idf/sites/schedule/_api/contextinfo");
    expect(fetchSpy.mock.calls.some((call) => String(call[0]).endsWith("/_api/web/folders"))).toBe(true);
    expect(fetchSpy.mock.calls.filter((call) => String(call[0]).includes("/Files/add("))).toHaveLength(9);
    for (const [, init] of fetchSpy.mock.calls.filter((call) => String(call[0]).endsWith("/_api/web/folders") || String(call[0]).includes("/Files/add("))) {
      expect(init).toEqual(expect.objectContaining({
        credentials: "include",
        headers: expect.objectContaining({ "X-RequestDigest": "digest-schedule" })
      }));
    }
  });

  it("lists backup inventory from the browser with credentials include", async () => {
    const fetchSpy = vi.fn((url: string) => {
      if (String(url).includes("/Folders?")) {
        return Promise.resolve(new Response(JSON.stringify({
          d: {
            results: [
              {
                Name: "backup-2026",
                ServerRelativeUrl: "/sites/schedule/siteDB/siteAssets/Backups/backup-2026",
                ItemCount: 1
              }
            ]
          }
        }), { status: 200 }));
      }
      if (String(url).includes("/Files?")) {
        return Promise.resolve(new Response(JSON.stringify({
          d: {
            results: [
              {
                Name: "users_data.txt",
                ServerRelativeUrl: "/sites/schedule/siteDB/siteAssets/Backups/backup-2026/users_data.txt",
                Length: "12"
              }
            ]
          }
        }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ d: { Name: "Backups" } }), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchSpy);

    const inventory = await listBrowserSharePointBackupInventory(makeSite("schedule", "https://portal.army.idf/sites/schedule"), true);

    expect(inventory.summary).toMatchObject({
      rootExists: true,
      foldersCount: 1,
      filesCount: 1,
      knownSizeBytes: 12,
      readOk: true
    });
    expect(inventory.notes.join(" ")).toContain("Browser SharePoint Connector");
    for (const [, init] of fetchSpy.mock.calls) {
      expect(init).toEqual(expect.objectContaining({ credentials: "include" }));
    }
  });
});
