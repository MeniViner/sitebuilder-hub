import fs from "node:fs";
import path from "node:path";
import { sanitizeMongoTarget } from "../db/mongoTarget";
import { assertSecretSafeOutput, reconciliationToCsv, reconciliationToMarkdown } from "../mongoConsolidation/output";
import { reconcileSnapshot } from "../mongoConsolidation/reconcile";
import { collectBuilderSnapshot, collectHubSnapshot, collectRuntimeConfigs, createReadOnlyMongoClient } from "../mongoConsolidation/readOnlySources";
import { reconciliationFailureExitCode } from "../mongoConsolidation/exitCodes";

const args = process.argv.slice(2);
const value = (name: string, fallback = "") => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] || fallback : fallback; };
const values = (name: string) => args.flatMap((arg, index) => arg === name && args[index + 1] ? [args[index + 1]] : []);
const hubUri = process.env.HUB_AUDIT_MONGO_URI || "";
const builderUri = process.env.BUILDER_AUDIT_MONGO_URI || "";
const hubDatabase = value("--hub-db", process.env.HUB_AUDIT_DB_NAME || "sitebuilder_hub");
const builderDatabase = value("--builder-db", process.env.BUILDER_AUDIT_DB_NAME || "sitebuilder_site_data");
const outputDirectory = path.resolve(value("--output", "mongo-consolidation-reconciliation"));
const format = value("--format", "all");
const siteFilter = value("--site", "") || undefined;

const main = async () => {
  if (!hubUri || !builderUri) throw new Error("HUB_AUDIT_MONGO_URI and BUILDER_AUDIT_MONGO_URI environment variables are required");
  if (!new Set(["all", "json", "csv", "markdown"]).has(format)) throw new Error("--format must be all, json, csv, or markdown");
  const hubClient = createReadOnlyMongoClient(hubUri), builderClient = createReadOnlyMongoClient(builderUri);
  try {
    await Promise.all([hubClient.connect(), builderClient.connect()]);
    const [hubSites, builder, runtimeConfigs] = await Promise.all([
      collectHubSnapshot(hubClient.db(hubDatabase), siteFilter), collectBuilderSnapshot(builderClient.db(builderDatabase)), Promise.resolve(collectRuntimeConfigs(values("--runtime-root")))
    ]);
    const report = reconcileSnapshot({ hubSites, ...builder, runtimeConfigs });
    const outputs = {
      json: JSON.stringify({ ...report, targets: { hub: sanitizeMongoTarget(hubUri, hubDatabase), builder: sanitizeMongoTarget(builderUri, builderDatabase) } }, null, 2) + "\n",
      csv: reconciliationToCsv(report), markdown: reconciliationToMarkdown(report)
    };
    assertSecretSafeOutput(outputs);
    fs.mkdirSync(outputDirectory, { recursive: true });
    if (["all", "json"].includes(format)) fs.writeFileSync(path.join(outputDirectory, "sitebuilder-mongo-reconciliation.json"), outputs.json, "utf8");
    if (["all", "csv"].includes(format)) fs.writeFileSync(path.join(outputDirectory, "sitebuilder-mongo-reconciliation.csv"), outputs.csv, "utf8");
    if (["all", "markdown"].includes(format)) fs.writeFileSync(path.join(outputDirectory, "sitebuilder-mongo-reconciliation.md"), outputs.markdown, "utf8");
    console.log(`Read-only reconciliation completed with ${report.summary.blockers ? "blockers" : report.summary.warnings ? "warnings" : "no actionable findings"}; output=${outputDirectory}`);
    process.exitCode = report.summary.exitCode;
  } finally { await Promise.allSettled([hubClient.close(), builderClient.close()]); }
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(message.includes("Secret-safety") ? "Reconciliation output failed secret-safety validation" : `Read-only reconciliation failed for ${hubDatabase} / ${builderDatabase}: ${message.includes("environment variables") || message.startsWith("--format") ? message : "source inaccessible"}`);
  process.exitCode = reconciliationFailureExitCode(message.includes("Secret-safety"));
});
