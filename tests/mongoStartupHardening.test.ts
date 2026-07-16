import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { getMongoTopology, safeMongoError, sanitizeMongoTarget } from "../server/src/db/mongoTarget";
import {
  assertSiteIndexStartupPolicy,
  inspectSiteIndexes,
  SiteIndexInspectionAdapter
} from "../server/src/db/siteIndexes";

const healthyAdapter = (): SiteIndexInspectionAdapter => ({
  listIndexes: vi.fn(async () => [
    { name: "siteCode_1", key: { siteCode: 1 } },
    { name: "siteIdentityKey_1", key: { siteIdentityKey: 1 }, unique: true, partialFilterExpression: { siteIdentityKey: { $exists: true } } }
  ]),
  countMissingSiteIdentityKey: vi.fn(async () => 0),
  findDuplicateCandidates: vi.fn(async (field) => ({ field, groups: 0, documents: 0 }))
});

describe("HUB Mongo startup hardening", () => {
  it("sanitizes credentials, hosts and query secrets", () => {
    const secretUri = "mongodb+srv://alice:super-secret@cluster.internal/sitebuilder_hub?replicaSet=prod-rs&authSource=admin&apiKey=hidden";
    const metadata = sanitizeMongoTarget(secretUri);
    const output = JSON.stringify(metadata);
    expect(metadata).toMatchObject({ protocol: "mongodb+srv", database: "sitebuilder_hub", authenticationConfigured: true, tlsConfigured: true });
    for (const secret of ["alice", "super-secret", "cluster.internal", "hidden", "authSource"]) expect(output).not.toContain(secret);
    expect(safeMongoError(new Error(`failed ${secretUri}`), "sitebuilder_hub").message).toBe("Target Mongo connection failed for database sitebuilder_hub");
  });

  it("connects with automatic DDL disabled and invokes only the read-only inspector", async () => {
    const { connectMongo } = await import("../server/src/db/mongo");
    const connect = vi.fn(async () => undefined);
    const inspect = vi.fn(async () => inspectSiteIndexes(healthyAdapter()));
    const report = await connectMongo({
      connect: connect as never,
      inspect,
      connection: { readyState: 1, getClient: () => ({ topology: { description: { type: "ReplicaSetWithPrimary" } } }) } as never
    });
    expect(connect).toHaveBeenCalledWith(expect.any(String), { autoIndex: false, autoCreate: false });
    expect(inspect).toHaveBeenCalledOnce();
    expect(report.status).toBe("healthy");
    expect(getMongoTopology({ readyState: 1 })).toMatchObject({ connectionStatus: "connected" });
  });

  it("reports legacy, missing, duplicate and missing-identity state without writes", async () => {
    const adapter = healthyAdapter();
    adapter.listIndexes = vi.fn(async () => [{ name: "siteCode_1", key: { siteCode: 1 }, unique: true }]);
    adapter.countMissingSiteIdentityKey = vi.fn(async () => 3);
    adapter.findDuplicateCandidates = vi.fn(async (field) => ({ field, groups: field === "siteIdentityKey" ? 1 : 0, documents: 2 }));
    const report = await inspectSiteIndexes(adapter);
    expect(report.status).toBe("blockers");
    expect(report.legacyUniqueSiteCode).toBe(true);
    expect(report.missingRequired).toContain("siteIdentityKey_1");
    expect(report.missingSiteIdentityKey).toBe(3);
    expect(() => assertSiteIndexStartupPolicy(report, "production")).toThrow("Mongo startup validation blocked");
    expect(() => assertSiteIndexStartupPolicy(report, "development")).not.toThrow();
  });

  it("keeps normal startup structurally separated from mutation executors", () => {
    const mongoSource = fs.readFileSync("server/src/db/mongo.ts", "utf8");
    const serverSource = fs.readFileSync("server/src/index.ts", "utf8");
    expect(mongoSource).not.toMatch(/siteIndexMigration|createIndex|dropIndex|updateOne|backfill/i);
    expect(serverSource).not.toMatch(/siteIndexMigration|migrateSiteIndexes/i);
  });
});
