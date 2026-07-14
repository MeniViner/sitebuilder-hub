import { describe, expect, it } from "vitest";
import {
  browserStatusFromHealth,
  browserStatusFromRuntimeConfig,
  builderStatusFromMongoHealth,
  defaultOperationalStatus,
  identityFromAuthUser,
  isNewerEvidence
} from "../client/src/utils/operationalStatus";

describe("operational status derivation", () => {
  it("starts with Browser SharePoint not checked instead of a missing connection", () => {
    const status = defaultOperationalStatus();

    expect(status.browserSharePoint.status).toBe("not_checked");
    expect(status.browserSharePoint.message).toBe("SharePoint דרך הדפדפן עדיין לא נבדק");
    expect(status.operationMode.legacyBackendSharePointAvailable).toBe(false);
    expect(status.dataSourceMatrix.txt.appData).toBe("browser-sharepoint-txt");
    expect(status.dataSourceMatrix.mongo.hostingRuntimeConfig).toBe("browser-sharepoint");
  });

  it("keeps Browser SharePoint and Builder backend states separate", () => {
    const browser = browserStatusFromRuntimeConfig({
      checkedAt: "2026-07-02T08:00:00.000Z",
      siteId: "site-1",
      siteCode: "alpha",
      runtimeConfigPath: "/sites/alpha/siteDB/dist/sitebuilder-runtime-config.json",
      runtimeConfigUrl: "https://portal.army.idf/sites/alpha/siteDB/dist/sitebuilder-runtime-config.json",
      readStatus: "configured",
      storageBackend: "mongo",
      backendApiUrl: "https://builder.example.local",
      backendApiUrlHost: "https://builder.example.local",
      builderSiteId: "alpha",
      apiKeyStatus: "configured",
      belongsToSite: true,
      warnings: [],
      evidence: {
        attemptedPaths: ["/sites/alpha/siteDB/dist/sitebuilder-runtime-config.json"],
        selectedPath: "/sites/alpha/siteDB/dist/sitebuilder-runtime-config.json",
        connectorMode: "browser-sharepoint",
        ok: true
      }
    });
    const builder = builderStatusFromMongoHealth({
      checkedAt: "2026-07-02T08:01:00.000Z",
      siteId: "site-1",
      siteCode: "alpha",
      storageBackend: "mongo",
      backendApiUrl: "https://builder.example.local",
      backendApiUrlHost: "https://builder.example.local",
      backendReachable: false,
      builderSiteId: "alpha",
      collectionName: "alpha",
      seedStatus: "unknown",
      warnings: ["builder unavailable"],
      evidence: {}
    });

    expect(browser.status).toBe("connected");
    expect(builder.status).toBe("failed");
    expect(builder.message).toContain("Builder backend");
  });

  it("derives browser failures from auth-blocked health evidence and preserves newer timestamps", () => {
    const browser = browserStatusFromHealth({
      checkedAt: "2026-07-02T08:00:00.000Z",
      siteId: "site-1",
      siteCode: "alpha",
      targetSharePointSiteUrl: "https://portal.army.idf/sites/alpha",
      status: "failed",
      source: "Browser SharePoint",
      evidence: [
        { key: "currentUser", label: "Current user", ok: false, status: 401, authBlocked: true }
      ]
    });

    expect(browser.status).toBe("failed");
    expect(browser.message).toBe("חיבור SharePoint דרך הדפדפן נכשל");
    expect(isNewerEvidence("2026-07-02T08:02:00.000Z", "2026-07-02T08:01:00.000Z")).toBe(true);
    expect(isNewerEvidence("2026-07-02T08:00:00.000Z", "2026-07-02T08:01:00.000Z")).toBe(false);
  });

  it("labels SharePoint identity and explicit owner identity distinctly", () => {
    expect(identityFromAuthUser({
      role: "operator",
      source: "sharepoint",
      identityMode: "sharepoint-user",
      loginName: "i:0#.f|membership|user@example.test"
    }).mode).toBe("sharepoint-user");

    expect(identityFromAuthUser({
      role: "owner",
      source: "owner",
      identityMode: "explicit-owner",
      personalNumber: "s0000001"
    }).mode).toBe("explicit-owner");
  });
});
