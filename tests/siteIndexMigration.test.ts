import { describe, expect, it, vi } from "vitest";
import { applySiteIndexMigration, planSiteIndexMigration, SiteIndexMigrationAdapter } from "../server/src/db/siteIndexMigration";
import { SiteIndexInspection } from "../server/src/db/siteIndexes";

const inspection = (overrides: Partial<SiteIndexInspection> = {}): SiteIndexInspection => ({
  status: "warnings", existingIndexes: [{ name: "_id_", key: { _id: 1 } }],
  missingRequired: ["siteIdentityKey_1"], missingRecommended: ["siteCode_1"], mismatched: [],
  legacyUniqueSiteCode: false, missingSiteIdentityKey: 0,
  duplicates: ["siteIdentityKey", "builderSiteId", "safeCollectionName"].map((field) => ({ field, groups: 0, documents: 0 })),
  warnings: [], blockers: ["Required index missing: sites.siteIdentityKey_1"], ...overrides
});

const adapter = (report = inspection()): SiteIndexMigrationAdapter => ({
  inspect: vi.fn(async () => report),
  listIdentityCandidates: vi.fn(async () => []),
  dropIndex: vi.fn(async () => undefined),
  createIndex: vi.fn(async () => undefined),
  setSiteIdentityKey: vi.fn(async () => undefined)
});

describe("HUB explicit site index migration", () => {
  it("plans in dry-run without mutation", async () => {
    const target = adapter();
    const plan = await planSiteIndexMigration(target);
    expect(plan.plannedActions).toHaveLength(2);
    expect(target.createIndex).not.toHaveBeenCalled();
    expect(target.dropIndex).not.toHaveBeenCalled();
    expect(target.setSiteIdentityKey).not.toHaveBeenCalled();
  });

  it("requires confirmation and lets blockers prevent writes", async () => {
    const target = adapter();
    await expect(applySiteIndexMigration(target, "wrong")).rejects.toThrow("SITE_INDEX_MIGRATION");
    expect(target.createIndex).not.toHaveBeenCalled();
    const blocked = adapter(inspection({ blockers: ["duplicate"], duplicates: [{ field: "siteIdentityKey", groups: 1, documents: 2 }] }));
    await expect(applySiteIndexMigration(blocked, "SITE_INDEX_MIGRATION")).rejects.toThrow("duplicate");
    expect(blocked.createIndex).not.toHaveBeenCalled();
  });

  it("can explicitly plan removal of the legacy unique siteCode index", async () => {
    const target = adapter(inspection({
      missingRequired: [], missingRecommended: [], legacyUniqueSiteCode: true, mismatched: ["siteCode_1"],
      blockers: ["Index definition mismatch: sites.siteCode_1", "Legacy unique index present: sites.siteCode_1"]
    }));
    const plan = await planSiteIndexMigration(target);
    expect(plan.blockers).toEqual([]);
    expect(plan.plannedActions.map((action) => action.type)).toEqual(["dropIndex", "createIndex"]);
  });

  it("is idempotent when the inspection is already current", async () => {
    const target = adapter(inspection({ status: "healthy", missingRequired: [], missingRecommended: [], blockers: [], warnings: [] }));
    const result = await applySiteIndexMigration(target, "SITE_INDEX_MIGRATION");
    expect(result.status).toBe("already-current");
    expect(target.createIndex).not.toHaveBeenCalled();
  });

  it("is idempotent after a mocked apply", async () => {
    const created = new Set<string>();
    const target = adapter();
    target.inspect = vi.fn(async () => inspection({
      status: created.size === 2 ? "healthy" : "warnings",
      missingRequired: created.has("siteIdentityKey_1") ? [] : ["siteIdentityKey_1"],
      missingRecommended: created.has("siteCode_1") ? [] : ["siteCode_1"],
      blockers: created.has("siteIdentityKey_1") ? [] : ["Required index missing: sites.siteIdentityKey_1"]
    }));
    target.createIndex = vi.fn(async (_key, options) => { created.add(String(options.name)); });
    expect((await applySiteIndexMigration(target, "SITE_INDEX_MIGRATION")).status).toBe("applied");
    expect((await applySiteIndexMigration(target, "SITE_INDEX_MIGRATION")).status).toBe("already-current");
    expect(target.createIndex).toHaveBeenCalledTimes(2);
  });
});
