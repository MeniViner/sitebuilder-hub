import { describe, expect, it } from "vitest";
import { assertSecretSafeOutput, reconciliationToCsv, reconciliationToMarkdown } from "../server/src/mongoConsolidation/output";
import { reconcileSnapshot } from "../server/src/mongoConsolidation/reconcile";
import { ReconciliationSnapshot } from "../server/src/mongoConsolidation/types";
import { RECONCILIATION_EXIT_CODES, reconciliationFailureExitCode, reconciliationFindingExitCode } from "../server/src/mongoConsolidation/exitCodes";

const clean = (): ReconciliationSnapshot => ({
  hubSites: [{ _id: "hub-1", siteIdentityKey: "identity-1", siteCode: "ALPHA", builderSiteId: "builder-1", safeCollectionName: "site_alpha", storageBackend: "mongo", mongoDatabase: "sitebuilder_hub", sharePointSiteUrl: "https://sharepoint.example/sites/alpha?ignored=yes" }],
  builderSites: [{ siteId: "builder-1", safeCollectionName: "site_alpha", status: "active", schemaVersion: 1 }],
  physicalCollections: [{ name: "site_alpha", registrySiteId: "builder-1", exists: true, documentCount: 1, wrongSiteDocuments: 0, invalidVersions: 0, invalidDeletedAt: 0, malformedIds: 0, oversizedBackups: 0, criticalBackups: 0, unknownScopes: ["theme"], scopes: { theme: 1 }, duplicateLogicalDocuments: 0 }],
  revisions: [{ siteId: "builder-1", collectionName: "site_alpha", documentKey: "theme:main", operation: "replace", previousVersion: 0, nextVersion: 1, physicalDocumentMissing: false }],
  audits: [{ siteId: "builder-1", documentKey: "theme:main", operation: "replace" }],
  runtimeConfigs: [{ path: "/runtime/runtime-config.json", siteId: "builder-1", storageBackend: "mongo", backendUrl: "https://builder.example", deploymentUrl: "https://site.example" }]
});

describe("read-only Mongo reconciliation", () => {
  it("classifies a clean explicit mapping and sanitizes URLs", () => {
    const report = reconcileSnapshot(clean(), "2026-07-15T00:00:00.000Z");
    expect(report.summary).toMatchObject({ blockers: 0, warnings: 0, exitCode: 0 });
    expect(report.inventory[0]).toMatchObject({ status: "mapped cleanly", sharePointSiteUrl: "https://sharepoint.example/sites/alpha" });
  });
  it("treats duplicate siteCode as warning but duplicate explicit IDs/collections as blockers", () => {
    const snapshot = clean();
    snapshot.hubSites.push({ _id: "hub-2", siteIdentityKey: "identity-2", siteCode: "ALPHA", builderSiteId: "builder-1", safeCollectionName: "site_alpha", storageBackend: "txt" });
    const report = reconcileSnapshot(snapshot);
    expect(report.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "hub.siteCode.duplicate", severity: "warning" }),
      expect.objectContaining({ code: "mapping.builderId.duplicate", severity: "blocker" }),
      expect.objectContaining({ code: "mapping.collection.duplicate", severity: "blocker" })
    ]));
    expect(report.summary.exitCode).toBe(20);
  });
  it("detects HUB/Builder/physical orphans and missing physical collections", () => {
    const snapshot = clean();
    snapshot.hubSites[0].builderSiteId = "missing-builder";
    snapshot.builderSites.push({ siteId: "builder-only", safeCollectionName: "site_builder_only" });
    snapshot.physicalCollections.push({ ...snapshot.physicalCollections[0], name: "site_orphan", registrySiteId: undefined });
    const report = reconcileSnapshot(snapshot);
    expect(report.findings.map((item) => item.code)).toEqual(expect.arrayContaining(["mapping.builder.orphan", "mapping.builderOnly", "physical.orphan"]));
    expect(report.inventory.some((row) => row.status === "Builder-only orphan")).toBe(true);
    const missingPhysical = clean();
    missingPhysical.physicalCollections[0].exists = false;
    const missingReport = reconcileSnapshot(missingPhysical);
    expect(missingReport.findings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "physical.missing" })]));
    expect(missingReport.inventory[0].status).toBe("physical collection missing");
  });
  it("detects physical integrity, revision and audit failures", () => {
    const snapshot = clean();
    Object.assign(snapshot.physicalCollections[0], { wrongSiteDocuments: 1, invalidVersions: 1, invalidDeletedAt: 1, malformedIds: 1, duplicateLogicalDocuments: 1 });
    snapshot.revisions.push({ siteId: "missing", documentKey: "x:y", operation: "replace", previousVersion: 3, nextVersion: 7, physicalDocumentMissing: true });
    snapshot.audits.push({ siteId: "missing", operation: "replace" });
    const codes = reconcileSnapshot(snapshot).findings.map((item) => item.code);
    expect(codes).toEqual(expect.arrayContaining(["physical.wrongSite", "physical.version.invalid", "physical.deletedAt.invalid", "physical.id.invalid", "physical.identity.duplicate", "revision.site.orphan", "revision.version.invalid", "revision.document.missing", "audit.site.orphan", "audit.key.missing"]));
  });
  it("applies revision and audit aggregate findings from validated snapshots", () => {
    const snapshot = clean();
    snapshot.revisions = [];
    snapshot.audits = [];
    snapshot.revisionAggregates = [{ siteId: "builder-1", count: 4, orphanCount: 0, invalidVersionTransitions: 1, missingDocumentKeys: 1, malformedDocumentKeys: 0, physicalDocumentsMissing: 1, physicalDocumentCheckComplete: false, duplicateOperationIds: 1 }];
    snapshot.auditAggregates = [{ siteId: "missing", count: 3, orphanCount: 3, missingDocumentKeys: 0, malformedDocumentKeys: 1, duplicateOperationIds: 1 }];
    const report = reconcileSnapshot(snapshot);
    expect(report.findings.map((item) => item.code)).toEqual(expect.arrayContaining([
      "revision.version.invalid", "revision.key.invalid", "revision.document.missing", "revision.documentCheck.incomplete", "revision.operationId.duplicate",
      "audit.site.orphan", "audit.key.invalid", "audit.operationId.duplicate"
    ]));
    expect(report.summary.exitCode).toBe(20);
  });
  it("detects runtime mismatch/unsafe URL while TXT-only runtime remains informational", () => {
    const snapshot = clean();
    snapshot.hubSites[0].runtimeConfigStatus = { path: "/runtime/runtime-config.json" };
    snapshot.runtimeConfigs[0] = { path: "/runtime/runtime-config.json", siteId: "other", storageBackend: "mongo", backendUrl: "https://u:p@builder.example/path?token=x", deploymentUrl: "https://site.example" };
    snapshot.runtimeConfigs.push({ path: "/runtime/txt.json", siteId: "legacy-only", storageBackend: "txt" });
    const report = reconcileSnapshot(snapshot);
    expect(report.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "runtime.siteId.mismatch", severity: "blocker" }),
      expect.objectContaining({ code: "runtime.url.unsafe", severity: "blocker" }),
      expect.objectContaining({ code: "runtime.txt.unmapped", severity: "info" })
    ]));
  });
  it("reports duplicate HUB/registry identities and partial physical seed warnings", () => {
    const snapshot = clean();
    snapshot.hubSites.push({ _id: "hub-2", siteIdentityKey: "identity-1", siteCode: "BETA", storageBackend: "txt", lifecycleStatus: "unexpected" });
    snapshot.builderSites.push({ siteId: "builder-1", safeCollectionName: "site_alpha", schemaVersion: 0 });
    snapshot.hubSites[0].mongoBackendStatus = { expectedScopes: ["theme", "widgets"] };
    Object.assign(snapshot.physicalCollections[0], { documentCount: 0, oversizedBackups: 1, unknownScopes: ["theme", "custom"] });
    const report = reconcileSnapshot(snapshot);
    expect(report.findings.map((item) => item.code)).toEqual(expect.arrayContaining([
      "hub.identity.duplicate", "hub.lifecycle.invalid", "builder.registry.siteId.duplicate", "builder.registry.collection.duplicate",
      "builder.registry.schemaVersion", "physical.empty", "physical.backup.large", "physical.scope.unknown", "physical.seed.partial"
    ]));
  });
  it("renders JSON-compatible data, CSV and Markdown and enforces output secret safety", () => {
    const report = reconcileSnapshot(clean());
    expect(() => JSON.stringify(report)).not.toThrow();
    expect(reconciliationToCsv(report)).toContain("hubSiteId,siteIdentityKey");
    expect(reconciliationToMarkdown(report)).toContain("# Site Builder Mongo reconciliation");
    expect(() => assertSecretSafeOutput({ json: "mongodb://u:p@host/db" })).toThrow("Secret-safety");
  });
  it("uses stable exit codes for clean, warning, blocker, source and secret outcomes", () => {
    expect(reconciliationFindingExitCode(0, 0)).toBe(RECONCILIATION_EXIT_CODES.clean);
    expect(reconciliationFindingExitCode(1, 0)).toBe(RECONCILIATION_EXIT_CODES.warnings);
    expect(reconciliationFindingExitCode(0, 1)).toBe(RECONCILIATION_EXIT_CODES.blockers);
    expect(reconciliationFailureExitCode(false)).toBe(RECONCILIATION_EXIT_CODES.sourceFailure);
    expect(reconciliationFailureExitCode(true)).toBe(RECONCILIATION_EXIT_CODES.secretFailure);
  });
});
