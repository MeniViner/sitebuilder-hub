/** Snapshot-only offline reconciliation entry.  Deliberately has no MongoDB-driver import. */
import fs from "node:fs";
import path from "node:path";
import { reconcileSnapshot } from "../mongoConsolidation/reconcile";
import { assertSecretSafeOutput, reconciliationToCsv, reconciliationToMarkdown } from "../mongoConsolidation/output";

const args = process.argv.slice(2);
const value = (name: string, fallback = "") => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1] || fallback; };
const input = value("--input"), output = value("--output"), format = value("--format", "all");
try {
  if (!input || !output || !new Set(["all", "json", "csv", "markdown"]).has(format)) throw new Error("invalid-input");
  const snapshot = JSON.parse(fs.readFileSync(path.join(path.resolve(input), "reconciliation-snapshot.json"), "utf8"));
  const report = reconcileSnapshot(snapshot);
  const files = { json: JSON.stringify({ ...report, targets: { mode: "validated-evidence-snapshot" } }, null, 2) + "\n", csv: reconciliationToCsv(report), markdown: reconciliationToMarkdown(report) };
  assertSecretSafeOutput(files);
  fs.mkdirSync(path.resolve(output), { recursive: true });
  if (["all", "json"].includes(format)) fs.writeFileSync(path.join(output, "production-sitebuilder-mongo-reconciliation.json"), files.json);
  if (["all", "csv"].includes(format)) fs.writeFileSync(path.join(output, "production-sitebuilder-mongo-reconciliation.csv"), files.csv);
  if (["all", "markdown"].includes(format)) fs.writeFileSync(path.join(output, "production-sitebuilder-mongo-reconciliation.md"), files.markdown);
  process.exitCode = report.summary.exitCode;
} catch (error) { console.error(error instanceof Error && error.message === "Secret-safety validation failed for: json, csv, markdown" ? "Secret-safety validation failed" : "Snapshot reconciliation failed"); process.exitCode = 30; }
