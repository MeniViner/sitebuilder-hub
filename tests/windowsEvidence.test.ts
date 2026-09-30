import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { findSecretViolations, generateEvidenceMarkdown, loadEvidenceDirectory, normalizePowerShellJson, scanPowerShellPolicy, validateEvidenceBundle } from "../scripts/mongo-consolidation/evidence-lib.mjs";
import { loadEvidenceSnapshot } from "../server/src/mongoConsolidation/evidenceSnapshot";
import { reconcileSnapshot } from "../server/src/mongoConsolidation/reconcile";

const fixture = path.resolve("tests/fixtures/mongo-consolidation/windows-evidence-clean");
describe("Windows evidence package", () => {
  it("validates the fixture and generates Markdown from JSON", () => {
    const bundle = loadEvidenceDirectory(fixture);
    expect(validateEvidenceBundle(bundle)).toEqual({ valid: true, errors: [] });
    expect(generateEvidenceMarkdown(bundle)).toContain("| Docker containers | 1 |");
    expect(generateEvidenceMarkdown(bundle)).toContain("| Services/processes/tasks | 0 |");
  });
  it("reports secret locations without values", () => {
    const violations = findSecretViolations({ nested: { authorization: "Bearer do-not-print" }, uri: "mongodb://u:p@host/db" });
    expect(violations).toContain("$.nested.authorization");
    expect(JSON.stringify(violations)).not.toContain("do-not-print");
  });
  it("contains no prohibited command and emits environment names only", () => {
    const source = fs.readFileSync("scripts/mongo-consolidation/collect-windows-evidence.ps1", "utf8");
    expect(scanPowerShellPolicy(source)).toEqual([]);
    expect(source).toContain("environmentNames");
    expect(source).toContain('globalCollections=new Set(["sites","site_data_revisions","site_data_audit_logs"])');
    expect(source).not.toContain('collectorHostAlias="windows-host"');
  });
  it("records optional capability and search-root states instead of silently treating missing data as clean", () => {
    const source = fs.readFileSync("scripts/mongo-consolidation/collect-windows-evidence.ps1", "utf8");
    expect(source).toContain('Write-SafeJson "capability-states.json"');
    expect(source).toContain("function New-CollectionState");
    expect(source).toContain("Get-OptionalFailureState 'iis'");
    expect(source).toContain("Get-OptionalFailureState 'docker'");
    expect(source).toContain("listening-ports.netstat-fallback");
    expect(source).toContain("originalRoot,normalizedRoot,status,reason,filesScanned,accessDeniedCount");
    expect(source).not.toContain("mongosh $mongoUri");
  });
  it("normalizes representative PowerShell singleton JSON", () => {
    expect(normalizePowerShellJson("\uFEFF{\"Name\":\"MongoDB\"}", true)).toEqual([{ Name: "MongoDB" }]);
  });
  it("rejects structurally incomplete production snapshots as exit-30 validation errors", () => {
    const bundle = loadEvidenceDirectory(fixture);
    bundle.mongo.available = false;
    bundle.reconciliationSnapshot.physicalCollections[0].documentCount = -1;
    const result = validateEvidenceBundle(bundle);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      "$.mongo.available must be true for a complete production bundle",
      "$.reconciliationSnapshot.physicalCollections[0].documentCount must be a non-negative integer"
    ]));
  });
  it("loads the validated snapshot into the same reconciliation analyzer", () => {
    const report = reconcileSnapshot(loadEvidenceSnapshot(fixture), "2026-07-15T00:00:00.000Z");
    expect(report.summary).toMatchObject({ blockers: 0, warnings: 0, exitCode: 0 });
    expect(report.inventory[0]).toMatchObject({ builderSiteId: "builder-site-1", safeCollectionName: "site_alpha", status: "mapped cleanly" });
  });
  it("runs snapshot CLI mode and emits production-prefixed outputs", () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sitebuilder-evidence-"));
    const copiedFixture = path.join(temp, "evidence");
    const output = path.join(temp, "output");
    fs.cpSync(fixture, copiedFixture, { recursive: true });
    execFileSync(process.execPath, ["server/node_modules/tsx/dist/cli.mjs", "server/src/scripts/reconcileMongoConsolidation.ts", "--evidence-root", copiedFixture, "--output", output, "--format", "all"], {
      cwd: path.resolve("."), env: { ...process.env, HUB_AUDIT_MONGO_URI: "", BUILDER_AUDIT_MONGO_URI: "" }, stdio: "pipe"
    });
    expect(fs.readdirSync(output).sort()).toEqual([
      "production-sitebuilder-mongo-reconciliation.csv",
      "production-sitebuilder-mongo-reconciliation.json",
      "production-sitebuilder-mongo-reconciliation.md"
    ]);
    fs.rmSync(temp, { recursive: true, force: true });
  });
  it("preserves validator exit 40 and writes no reconciliation for unsafe evidence", () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sitebuilder-evidence-unsafe-"));
    const copiedFixture = path.join(temp, "evidence");
    const output = path.join(temp, "output");
    fs.cpSync(fixture, copiedFixture, { recursive: true });
    fs.writeFileSync(path.join(copiedFixture, "runtime-configs.json"), JSON.stringify([{ path: "D:\\Sites\\A\\runtime-config.json", authorization: ["Bearer", "fixture-secret"].join(" ") }]), "utf8");
    const result = spawnSync(process.execPath, ["server/node_modules/tsx/dist/cli.mjs", "server/src/scripts/reconcileMongoConsolidation.ts", "--evidence-root", copiedFixture, "--output", output], {
      cwd: path.resolve("."), env: { ...process.env, HUB_AUDIT_MONGO_URI: "", BUILDER_AUDIT_MONGO_URI: "" }, encoding: "utf8"
    });
    expect(result.status).toBe(40);
    expect(result.stderr).not.toContain("fixture-secret");
    expect(fs.existsSync(output)).toBe(false);
    fs.rmSync(temp, { recursive: true, force: true });
  });
});
