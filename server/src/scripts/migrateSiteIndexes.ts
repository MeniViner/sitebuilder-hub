import mongoose from "mongoose";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { env } from "../config/env";
import { sanitizeMongoTarget, safeMongoError } from "../db/mongoTarget";
import {
  applySiteIndexMigration,
  HUB_INDEX_MIGRATION_CONFIRMATION,
  HUB_INDEX_MIGRATION_VERSION,
  mongooseSiteIndexMigrationAdapter,
  planSiteIndexMigration
} from "../db/siteIndexMigration";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const confirmationIndex = args.indexOf("--confirm");
const confirmation = confirmationIndex >= 0 ? args[confirmationIndex + 1] || "" : "";
const format = args.includes("--json") ? "json" : "text";
const target = sanitizeMongoTarget(env.MONGO_URI);
const repositoryCommit = () => {
  try { return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(); }
  catch { return "unknown"; }
};

const main = async () => {
  if (apply && confirmation !== HUB_INDEX_MIGRATION_CONFIRMATION) {
    throw new Error(`Apply requires --confirm ${HUB_INDEX_MIGRATION_CONFIRMATION}`);
  }
  await mongoose.connect(env.MONGO_URI, { autoIndex: false, autoCreate: false });
  const adapter = mongooseSiteIndexMigrationAdapter();
  const plan = await planSiteIndexMigration(adapter);
  const base = {
    commandVersion: HUB_INDEX_MIGRATION_VERSION,
    repositoryCommit: process.env.GIT_COMMIT || repositoryCommit(),
    timestamp: new Date().toISOString(),
    mode: apply ? "apply" : "dry-run",
    target,
    database: target.database,
    plannedActions: plan.plannedActions,
    existingIndexes: plan.inspection.existingIndexes,
    candidateBackfills: plan.candidateBackfills.map((candidate) => ({ id: String(candidate.id), identityKeyHash: createHash("sha256").update(candidate.siteIdentityKey).digest("hex") })),
    duplicateCandidates: plan.inspection.duplicates,
    completedActions: [] as string[],
    skippedActions: [] as string[],
    blockers: plan.blockers,
    warnings: plan.warnings,
    status: plan.blockers.length ? "blocked" : plan.plannedActions.length ? "planned" : "already-current"
  };
  const result = apply
    ? { ...base, ...(await applySiteIndexMigration(adapter, confirmation)) }
    : base;
  console.log(format === "json" ? JSON.stringify(result, null, 2) : [
    `HUB site index migration (${result.mode})`,
    `database: ${result.database}`,
    `status: ${result.status}`,
    `planned actions: ${result.plannedActions.length}`,
    `candidate backfills: ${result.candidateBackfills.length}`,
    `duplicate candidate groups: ${result.duplicateCandidates.reduce((sum, item) => sum + item.groups, 0)}`,
    `blockers: ${result.blockers.length}`,
    `warnings: ${result.warnings.length}`
  ].join("\n"));
  process.exitCode = result.blockers.length ? 20 : 0;
};

main()
  .catch((error) => {
    const actionable = error instanceof Error && (error.message.startsWith("Apply requires") || error.message.startsWith("Cannot apply"));
    const safe = actionable ? { name: error.name, message: error.message } : safeMongoError(error, target.database);
    console.error(JSON.stringify({ status: "failed", target, error: safe }));
    process.exitCode = error instanceof Error && error.message.startsWith("Apply requires") ? 30 : 40;
  })
  .finally(async () => { await mongoose.disconnect().catch(() => undefined); });
