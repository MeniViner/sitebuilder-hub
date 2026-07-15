import { describe, expect, it } from "vitest";
import { compareSiteDataBindings, findDuplicateSiteDataBindings, normalizeSiteDataBinding, siteDataBindingSchema } from "../server/src/contracts/siteDataBinding";

const binding = { builderSiteId: "builder-1", database: "sitebuilder_site_data" as const, safeCollectionName: "site_builder_1", apiVersion: "v1" as const, migrationState: "source" as const };
describe("non-authoritative siteDataBinding contract", () => {
  it("normalizes and rejects unsupported authoritative-looking fields", () => {
    expect(normalizeSiteDataBinding({ ...binding, builderSiteId: " builder-1 " })).toMatchObject(binding);
    expect(siteDataBindingSchema.safeParse({ ...binding, siteCode: "do-not-infer" }).success).toBe(false);
  });
  it("compares and detects duplicate technical mappings", () => {
    expect(compareSiteDataBindings(binding, { ...binding, migrationState: "shadow" })).toEqual(["migrationState"]);
    expect(findDuplicateSiteDataBindings([binding, { ...binding, migrationState: "target" }])).toEqual(expect.arrayContaining([
      { field: "builderSiteId", value: "builder-1", count: 2 }, { field: "safeCollectionName", value: "site_builder_1", count: 2 }
    ]));
  });
});
