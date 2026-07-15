import { ReconciliationReport } from "./types";

const csv = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
export const reconciliationToCsv = (report: ReconciliationReport) => {
  const fields = ["hubSiteId", "siteIdentityKey", "siteCode", "builderSiteId", "sourceDatabase", "safeCollectionName", "physicalCollectionExists", "runtimeConfigPath", "runtimeSiteId", "runtimeStorageBackend", "runtimeBackendOrigin", "sharePointSiteUrl", "migrationState", "status", "warnings", "blockers"] as const;
  return [fields.join(","), ...report.inventory.map((row) => fields.map((field) => csv(Array.isArray(row[field]) ? row[field].join(" | ") : row[field])).join(","))].join("\n") + "\n";
};
export const reconciliationToMarkdown = (report: ReconciliationReport) => [
  "# Site Builder Mongo reconciliation", "", `Generated: ${report.generatedAt}`, "", `Read-only: ${report.readOnly ? "yes" : "no"}`,
  `Rows: ${report.summary.rows}; warnings: ${report.summary.warnings}; blockers: ${report.summary.blockers}; exit code: ${report.summary.exitCode}`, "",
  "| HUB site | Builder site | Collection | Status | Warnings | Blockers |", "| --- | --- | --- | --- | ---: | ---: |",
  ...report.inventory.map((row) => `| ${row.hubSiteId || "—"} | ${row.builderSiteId || "—"} | ${row.safeCollectionName || "—"} | ${row.status} | ${row.warnings.length} | ${row.blockers.length} |`), "",
  "## Findings", "", ...report.findings.map((finding) => `- **${finding.severity.toUpperCase()} ${finding.code}** (${finding.subject}): ${finding.message}`), ""
].join("\n");

const secretPattern = /(mongodb(?:\+srv)?:\/\/[^\s/@:]+:[^\s/@]+@|bearer\s+\S+|[?&](?:token|api[-_]?key|password|secret|sig)=)/i;
export const assertSecretSafeOutput = (outputs: Record<string, string>) => {
  const unsafe = Object.entries(outputs).filter(([, value]) => secretPattern.test(value)).map(([name]) => name);
  if (unsafe.length) throw new Error(`Secret-safety validation failed for: ${unsafe.join(", ")}`);
};
