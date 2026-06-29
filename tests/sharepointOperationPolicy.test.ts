import { describe, expect, it } from "vitest";

describe("SharePoint operation connector policy", () => {
  it("classifies the audited SharePoint operations with connector policy metadata", async () => {
    const { getSharePointOperationInventory } = await import("../server/src/services/sharepointOperationPolicy.service");

    const inventory = getSharePointOperationInventory();
    const byOperation = new Map(inventory.map((item) => [item.operation, item]));

    [
      "browser-health-check",
      "backend-health-check",
      "backup",
      "scheduled-backup",
      "restore",
      "admin-live-read",
      "admin-sync",
      "admin-txt-repair",
      "admin-sharepoint-membership",
      "permissions-setup",
      "site-bootstrap",
      "site-provision",
      "deploy",
      "scheduled-health-check"
    ].forEach((operation) => {
      expect(byOperation.get(operation as any)).toEqual(expect.objectContaining({
        operation,
        uiEntryPoint: expect.any(String),
        backendRoute: expect.any(String),
        controller: expect.any(String),
        service: expect.any(String),
        policy: expect.stringMatching(/browser-supported|backend-service-auth-required|not-implemented/),
        statusLabelHe: expect.any(String)
      }));
    });

    expect(byOperation.get("backup")).toMatchObject({
      policy: "browser-supported",
      connectorMode: "browser-sharepoint",
      needsDigest: true,
      canRunFromBrowser: true
    });
    expect(byOperation.get("scheduled-backup")).toMatchObject({
      policy: "backend-service-auth-required",
      connectorMode: "backend-sharepoint",
      backendServiceAuthOnly: true
    });
    expect(byOperation.get("restore")).toMatchObject({
      policy: "not-implemented",
      connectorMode: "none",
      blockerHe: "שחזור דורש הרשאת שרת ל־SharePoint או מימוש שחזור דרך הדפדפן."
    });
  });
});
