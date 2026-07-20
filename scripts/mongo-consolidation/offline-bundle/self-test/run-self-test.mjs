#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const option = (name, fallback = "") => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1] || fallback;
};
const runnerDirectory = path.dirname(path.resolve(process.argv[1] || "."));
const bundleRoot = path.resolve(option("--bundle-root", path.join(runnerDirectory, "..")));
const node = path.resolve(option("--node", process.execPath));
const reconcile = path.resolve(option("--reconcile", path.join(bundleRoot, "reconciliation", "reconcile-snapshot.cjs")));
const defaultValidator = fs.existsSync(path.join(bundleRoot, "validator", "validate-windows-evidence.mjs"))
  ? path.join(bundleRoot, "validator", "validate-windows-evidence.mjs")
  : path.join(bundleRoot, "validator", "validate-windows-evidence.cjs");
const validator = path.resolve(option("--validator", defaultValidator));
const collector = path.resolve(option("--collector", path.join(bundleRoot, "collector", "collect-windows-evidence.ps1")));
const commandScanner = path.resolve(option("--command-scanner", path.join(bundleRoot, "security", "release-bundle-tools.cjs")));
const fixtures = path.resolve(option("--fixtures", path.join(bundleRoot, "fixtures")));
const networkDeny = path.resolve(option("--network-deny", path.join(runnerDirectory, "network-deny.cjs")));
const uriPattern = /mongodb(?:\+srv)?:\/\//i;
const fixtureRoot = (name) => path.join(fixtures, name);

const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const hashFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const fileTree = (directory) => {
  if (!fs.existsSync(directory)) return [];
  const entries = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) entries.push(...fileTree(full).map((item) => `${entry.name}/${item}`));
    else if (entry.isFile()) entries.push(`${entry.name}:${hashFile(full)}`);
    else entries.push(`${entry.name}:non-file`);
  }
  return entries.sort();
};
const assertNoMongoUri = (values, context) => {
  const unsafe = values.filter((value) => uriPattern.test(String(value)));
  assert(unsafe.length === 0, `${context} contains a Mongo URI`);
};
const command = (script, commandArgs, label) => {
  assert(fs.existsSync(node), `Bundled Node runtime is missing: ${node}`);
  assert(fs.existsSync(script), `${label} entry point is missing: ${script}`);
  assert(fs.existsSync(networkDeny), `Network-deny module is missing: ${networkDeny}`);
  const childArgs = ["--require", networkDeny, script, ...commandArgs];
  assertNoMongoUri(childArgs, `${label} child arguments`);
  const result = spawnSync(node, childArgs, {
    cwd: os.tmpdir(), encoding: "utf8", env: { ...process.env, OFFLINE_BUNDLE_NETWORK: "disabled", MONGODB_URI: "" }
  });
  if (result.error) fail(`${label} could not start: ${result.error.code || result.error.name}`);
  assertNoMongoUri([result.stdout || "", result.stderr || ""], `${label} output`);
  return { status: result.status, stdout: result.stdout || "", stderr: result.stderr || "" };
};
const mustBe = (actual, expected, message) => assert(actual === expected, `${message}; expected ${expected}, received ${actual}`);
const expectedOutputs = [
  "production-sitebuilder-mongo-reconciliation.csv",
  "production-sitebuilder-mongo-reconciliation.json",
  "production-sitebuilder-mongo-reconciliation.md"
];

function runReconciliationScenario(name, expectedExit, requiredCodes = []) {
  const output = path.join(activeRun, `${name}-reconciliation`);
  const result = command(reconcile, ["--input", fixtureRoot(name), "--output", output, "--format", "all"], `${name} reconciliation`);
  mustBe(result.status, expectedExit, `${name} reconciliation exit code`);
  if (expectedExit === 30) {
    assert(!fs.existsSync(output), "Invalid reconciliation input must not create an output directory");
    return { exitCode: result.status, outputs: [] };
  }
  const files = fs.readdirSync(output).sort();
  assert(JSON.stringify(files) === JSON.stringify(expectedOutputs), `${name} reconciliation must produce JSON, CSV, and Markdown`);
  const report = JSON.parse(fs.readFileSync(path.join(output, expectedOutputs[1]), "utf8"));
  mustBe(report.summary.exitCode, expectedExit, `${name} JSON report exit code`);
  for (const code of requiredCodes) assert(report.findings.some((finding) => finding.code === code), `${name} report lacks stable finding code ${code}`);
  for (const file of expectedOutputs) assert(fs.readFileSync(path.join(output, file), "utf8").length > 0, `${name} output ${file} is empty`);
  return { exitCode: result.status, outputs: files, findingCodes: report.findings.map((finding) => finding.code).sort() };
}

function runSecretScenario() {
  const result = command(validator, ["--input", fixtureRoot("secret"), "--script", collector], "secret validation");
  mustBe(result.status, 40, "Secret validation exit code");
  assert(!/synthetic-token-for-negative-test/i.test(result.stdout + result.stderr), "Secret validation output disclosed fixture secret");
  return { exitCode: result.status };
}

function runCommandPolicyScenario() {
  const fixture = path.join(fixtureRoot("negative-command"), "unsafe-command.ps1");
  const result = command(commandScanner, ["scan-command-policy", "--input", fixture], "command-policy validation");
  assert(result.status !== 0, "Command-policy scanner accepted deliberately prohibited executable fixture");
  return { exitCode: result.status };
}

assertNoMongoUri(process.argv, "self-test process arguments");
assert(fs.existsSync(fixtures), `Fixtures are missing: ${fixtures}`);
const runParent = path.join(bundleRoot, "tmp", "agent-runs");
fs.mkdirSync(runParent, { recursive: true });
const previousRunTree = fileTree(runParent);
const activeRun = fs.mkdtempSync(path.join(runParent, "self-test-"));
const resultPath = path.join(activeRun, "self-test-result.json");
let exitCode = 0;
let result = {};
try {
  result = {
    schemaVersion: 1,
    synthetic: true,
    networkDenied: true,
    mongoUriInProcessArguments: false,
    scenarios: {
      clean: runReconciliationScenario("clean", 0),
      warning: runReconciliationScenario("warning", 10, ["hub.siteCode.duplicate", "mapping.builderOnly"]),
      blocking: runReconciliationScenario("blocking", 20, ["hub.builderId.inconsistent", "physical.missing", "runtime.siteId.mismatch"]),
      invalid: runReconciliationScenario("invalid", 30),
      secret: runSecretScenario(),
      commandPolicy: runCommandPolicyScenario()
    }
  };
  const afterPreviousEntries = fileTree(runParent).filter((item) => !item.startsWith(`${path.basename(activeRun)}:`) && !item.startsWith(`${path.basename(activeRun)}/`));
  assert(JSON.stringify(afterPreviousEntries) === JSON.stringify(previousRunTree), "A pre-existing run folder was modified by self-test");
  fs.writeFileSync(resultPath, JSON.stringify({ ...result, passed: true }, null, 2) + "\n", "utf8");
  process.stdout.write("Offline fixture self-test passed\n");
} catch (error) {
  exitCode = 1;
  const safeMessage = error instanceof Error ? error.message.replace(uriPattern, "[redacted-uri]") : "self-test failed";
  fs.writeFileSync(resultPath, JSON.stringify({ ...result, passed: false, error: safeMessage }, null, 2) + "\n", "utf8");
  process.stderr.write(`Offline fixture self-test failed: ${safeMessage}\n`);
} finally {
  assertNoMongoUri(process.argv, "self-test process arguments after execution");
  process.exitCode = exitCode;
}
