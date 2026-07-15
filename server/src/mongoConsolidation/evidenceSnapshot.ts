import fs from "node:fs";
import path from "node:path";
import { ReconciliationSnapshot } from "./types";

const requiredArrays = ["hubSites", "builderSites", "physicalCollections", "revisions", "audits", "runtimeConfigs"] as const;

export function loadEvidenceSnapshot(evidenceRoot: string): ReconciliationSnapshot {
  const file = path.join(path.resolve(evidenceRoot), "reconciliation-snapshot.json");
  const parsed = JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "")) as Record<string, unknown>;
  for (const key of requiredArrays) {
    if (!Array.isArray(parsed[key])) throw new Error(`Validated evidence snapshot is missing array: ${key}`);
  }
  for (const key of ["revisionAggregates", "auditAggregates"] as const) {
    if (parsed[key] !== undefined && !Array.isArray(parsed[key])) throw new Error(`Validated evidence snapshot field must be an array: ${key}`);
  }
  return parsed as unknown as ReconciliationSnapshot;
}
