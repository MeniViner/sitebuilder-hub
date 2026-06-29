import { describe, expect, it } from "vitest";
import type { AccessDirectoryUser } from "../client/src/api/sitesApi";
import { defaultAccessFilters, filterAccessUsers } from "../client/src/utils/accessDirectory";

const users: AccessDirectoryUser[] = [
  {
    principalId: "pn:s1000001",
    displayName: "Alpha Admin",
    normalizedPersonalNumber: "s1000001",
    emails: ["alpha@example.test"],
    aliases: ["s1000001"],
    unitName: "HQ",
    sites: [
      {
        siteId: "site-a",
        siteCode: "alpha",
        displayName: "Alpha",
        environment: "production",
        storageBackend: "mongo",
        roleType: "app-admin",
        sourceType: "mongo-users-data",
        sourceAuthority: "authoritative",
        effectiveAccess: "app-admin",
        readStatus: "success",
        lastReadAt: "2026-06-18T09:00:00.000Z",
        evidence: {},
        warnings: [],
        blockers: []
      }
    ],
    roles: ["app-admin"],
    sources: ["mongo-users-data"],
    conflicts: [],
    lastVerifiedAt: "2026-06-18T09:00:00.000Z",
    status: ["healthy"],
    evidenceRefs: []
  },
  {
    principalId: "mail:beta@example.test",
    displayName: "Beta User",
    normalizedPersonalNumber: "",
    emails: ["beta@example.test"],
    aliases: ["beta@example.test"],
    unitName: "Ops",
    sites: [
      {
        siteId: "site-b",
        siteCode: "beta",
        displayName: "Beta",
        environment: "test",
        storageBackend: "txt",
        roleType: "regular-user",
        sourceType: "txt-users-data",
        sourceAuthority: "authoritative",
        effectiveAccess: "app-user",
        readStatus: "failed",
        evidence: { httpStatus: 404 },
        warnings: [],
        blockers: ["failed"]
      }
    ],
    roles: ["regular-user"],
    sources: ["txt-users-data"],
    conflicts: [],
    status: ["source-failed", "not-verified"],
    evidenceRefs: []
  }
];

describe("Access Directory user filters", () => {
  it("searches by identity and site code", () => {
    expect(filterAccessUsers(users, { ...defaultAccessFilters, search: "s1000001" })).toHaveLength(1);
    expect(filterAccessUsers(users, { ...defaultAccessFilters, search: "beta" })[0].displayName).toBe("Beta User");
  });

  it("filters by source/status and quick views", () => {
    expect(filterAccessUsers(users, { ...defaultAccessFilters, source: "mongo-users-data" })).toHaveLength(1);
    expect(filterAccessUsers(users, { ...defaultAccessFilters, status: "source-failed" })).toHaveLength(1);
    expect(filterAccessUsers(users, { ...defaultAccessFilters, quickView: "failed-sources" })[0].displayName).toBe("Beta User");
    expect(filterAccessUsers(users, { ...defaultAccessFilters, quickView: "production" })[0].displayName).toBe("Alpha Admin");
  });

  it("sorts by highest access before regular users", () => {
    const result = filterAccessUsers(users, { ...defaultAccessFilters, sort: "highestAccess" });
    expect(result.map((user) => user.displayName)).toEqual(["Alpha Admin", "Beta User"]);
  });
});
