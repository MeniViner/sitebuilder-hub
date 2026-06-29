import { describe, expect, it } from "vitest";
import { buildAccessDirectoryFromSites, normalizeAccessIdentityKey } from "../server/src/services/accessDirectory.service";

const siteId = (id: string) => ({ toString: () => id });

describe("Access Directory aggregation", () => {
  it("normalizes army identities and keeps source-aware memberships", () => {
    const directory = buildAccessDirectoryFromSites([
      {
        _id: siteId("txt-site"),
        siteCode: "alpha",
        displayName: "Alpha",
        environment: "production",
        storageBackend: "txt",
        status: "active",
        ownerName: "Owner One",
        ownerPersonalNumber: "8856096",
        ownerEmail: "owner@example.test",
        txtAdmins: [
          { displayName: "Dana Admin", loginName: "i:0#.w|army\\s8856096", email: "s8856096@army.idf.il" }
        ],
        siteCollectionAdmins: [
          { displayName: "Dana Admin", personalNumber: "s8856096", email: "s8856096@army.idf.il" }
        ],
        ownersGroupAdmins: [],
        adminSourceStatus: [
          { source: "txt", ok: true, status: "success", count: 1, readAt: "2026-06-18T09:00:00.000Z" },
          { source: "siteCollection", ok: true, status: "success", count: 1, readAt: "2026-06-18T09:00:00.000Z" },
          { source: "ownersGroup", ok: true, status: "success", count: 0, readAt: "2026-06-18T09:00:00.000Z" }
        ]
      }
    ], "2026-06-18T10:00:00.000Z");

    expect(normalizeAccessIdentityKey({ loginName: "i:0#.w|army\\s8856096" })).toBe("pn:s8856096");
    const user = directory.users.find((row) => row.normalizedPersonalNumber === "s8856096");
    expect(user).toBeTruthy();
    expect(user?.aliases).toEqual(expect.arrayContaining(["s8856096", "s8856096@army.idf.il", "i:0#.w|army\\s8856096"]));
    expect(user?.sources).toEqual(expect.arrayContaining(["txt-users-data", "sharepoint-site-collection-admin", "hub-metadata-owner"]));
    expect(user?.roles).toEqual(expect.arrayContaining(["app-admin", "sharepoint-site-collection-admin", "site-owner"]));
  });

  it("does not treat a failed users_data.txt source as zero users", () => {
    const directory = buildAccessDirectoryFromSites([
      {
        _id: siteId("failed-txt"),
        siteCode: "bravo",
        displayName: "Bravo",
        environment: "test",
        storageBackend: "txt",
        status: "active",
        txtAdmins: [{ displayName: "Stale Admin", personalNumber: "s1234567" }],
        siteCollectionAdmins: [],
        ownersGroupAdmins: [],
        adminSourceStatus: [
          {
            source: "txt",
            ok: false,
            status: "failed",
            httpStatus: 404,
            errorMessage: "Not Found",
            readAt: "2026-06-18T08:00:00.000Z"
          }
        ]
      }
    ]);

    const txtSource = directory.sourceMatrix.find((source) => source.siteId === "failed-txt" && source.sourceType === "txt-users-data");
    expect(txtSource).toMatchObject({
      status: "failed",
      httpStatus: 404
    });
    expect(txtSource?.count).toBeUndefined();
    expect(directory.users[0].status).toEqual(expect.arrayContaining(["stale"]));
  });

  it("labels Mongo users as app source of truth and SharePoint owners as hosting access", () => {
    const directory = buildAccessDirectoryFromSites([
      {
        _id: siteId("mongo-site"),
        siteCode: "charlie",
        displayName: "Charlie",
        environment: "dev",
        storageBackend: "mongo",
        status: "active",
        ownersGroupAdmins: [{ displayName: "Hosting Owner", email: "host@example.test" }],
        adminSourceStatus: [
          { source: "ownersGroup", ok: true, status: "success", count: 1, readAt: "2026-06-18T09:00:00.000Z" }
        ],
        mongoBackendStatus: {
          adminsStatus: "ok",
          checkedAt: "2026-06-18T09:30:00.000Z",
          evidence: {
            checks: {
              seedBatch: {
                payload: {
                  results: [
                    {
                      key: "users_data.txt",
                      ok: true,
                      data: [
                        { displayName: "Regular User", email: "regular@example.test", role: "user" },
                        { displayName: "Mongo Admin", email: "admin@example.test", role: "admin" }
                      ]
                    }
                  ]
                }
              }
            }
          }
        }
      }
    ]);

    const mongoSource = directory.sourceMatrix.find((source) => source.sourceType === "mongo-users-data");
    const hostingMembership = directory.users.find((user) => user.emails.includes("host@example.test"))?.sites[0];

    expect(mongoSource).toMatchObject({ authority: "authoritative", connector: "mongo-backend", status: "success" });
    expect(directory.users.find((user) => user.emails.includes("regular@example.test"))?.roles).toContain("regular-user");
    expect(directory.users.find((user) => user.emails.includes("admin@example.test"))?.roles).toContain("app-admin");
    expect(hostingMembership).toMatchObject({
      sourceType: "sharepoint-owners-group",
      sourceAuthority: "hosting"
    });
  });
});
