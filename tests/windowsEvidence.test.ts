import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findSecretViolations, generateEvidenceMarkdown, loadEvidenceDirectory, normalizePowerShellJson, scanPowerShellPolicy, validateEvidenceBundle } from "../scripts/mongo-consolidation/evidence-lib.mjs";

const fixture = path.resolve("tests/fixtures/mongo-consolidation/windows-evidence-clean");
describe("Windows evidence package", () => {
  it("validates the fixture and generates Markdown from JSON", () => {
    const bundle = loadEvidenceDirectory(fixture);
    expect(validateEvidenceBundle(bundle)).toEqual({ valid: true, errors: [] });
    expect(generateEvidenceMarkdown(bundle)).toContain("| Docker containers | 1 |");
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
  });
  it("normalizes representative PowerShell singleton JSON", () => {
    expect(normalizePowerShellJson("\uFEFF{\"Name\":\"MongoDB\"}", true)).toEqual([{ Name: "MongoDB" }]);
  });
});
