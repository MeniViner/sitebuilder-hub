import mongoose from "mongoose";
import { connectMongo } from "../db/mongo";
import { Job } from "../models/Job";

const LEGACY_CONNECTOR_MODES = ["backend-sharepoint", "backend-service-auth-required"];
const LEGACY_EXECUTION_STATUSES = ["blocked-service-auth-required"];
const SHAREPOINT_JOB_TYPES = [
  "health-check",
  "deploy",
  "backup",
  "restore",
  "admin-sync",
  "repair",
  "version-upgrade",
  "version-rollback",
  "site-provision",
  "permissions-setup",
  "site-bootstrap"
];
const TERMINAL_STATUSES = new Set(["succeeded", "failed", "cancelled"]);

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;

const legacyFilter = {
  type: { $in: SHAREPOINT_JOB_TYPES },
  $or: [
    { connectorMode: { $in: LEGACY_CONNECTOR_MODES } },
    { "payload.connectorMode": { $in: LEGACY_CONNECTOR_MODES } },
    { executionMode: { $in: LEGACY_EXECUTION_STATUSES } },
    { status: { $in: LEGACY_EXECUTION_STATUSES } }
  ]
};

const terminalExecutionMode = (status: string, fallback: string) => {
  if (status === "succeeded") return "completed";
  if (status === "failed" || status === "cancelled") return "failed";
  return fallback || "failed";
};

const nextStatusFor = (job: any) => {
  if (TERMINAL_STATUSES.has(String(job.status))) return job.status;
  if (job.requiresApproval && !job.approvedAt) return "awaiting-approval";
  return "browser-required";
};

const nextExecutionModeFor = (job: any, nextStatus: string) => {
  if (TERMINAL_STATUSES.has(String(nextStatus))) return terminalExecutionMode(String(nextStatus), String(job.executionMode || ""));
  return "browser-required";
};

async function migrate() {
  await connectMongo();
  const query = Job.find(legacyFilter).sort({ createdAt: 1 });
  if (limit > 0) query.limit(limit);
  const jobs = await query;
  const now = new Date();

  const updates = jobs.map((job: any) => {
    const nextStatus = nextStatusFor(job);
    const nextExecutionMode = nextExecutionModeFor(job, nextStatus);
    return {
      job,
      nextStatus,
      nextExecutionMode,
      update: {
        $set: {
          status: nextStatus,
          executionMode: nextExecutionMode,
          connectorMode: "browser-sharepoint",
          "payload.connectorMode": "browser-sharepoint",
          "payload.executionMode": nextExecutionMode,
          "payload.legacyServerSharePoint": {
            migratedAt: now,
            previousStatus: job.status || "",
            previousExecutionMode: job.executionMode || "",
            previousConnectorMode: job.connectorMode || "",
            previousPayloadConnectorMode: job.payload?.connectorMode || ""
          },
          connectorStatusLabel: "ממתין לדפדפן SharePoint",
          connectorBlocker: "פעולת SharePoint היסטורית הועברה למסלול דפדפן בלבד."
        },
        $push: {
          logs: {
            level: "info",
            message: "Legacy server SharePoint job migrated to browser-required architecture",
            at: now
          }
        }
      }
    };
  });

  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    matched: jobs.length,
    changes: updates.map(({ job, nextStatus, nextExecutionMode }) => ({
      id: job._id.toString(),
      type: job.type,
      previousStatus: job.status,
      nextStatus,
      previousExecutionMode: job.executionMode,
      nextExecutionMode,
      previousConnectorMode: job.connectorMode,
      nextConnectorMode: "browser-sharepoint"
    }))
  }, null, 2));

  if (apply && updates.length) {
    const result = await Job.bulkWrite(updates.map(({ job, update }) => ({
      updateOne: {
        filter: { _id: job._id },
        update
      }
    })) as any);
    console.log(JSON.stringify({
      modified: result.modifiedCount,
      matched: result.matchedCount
    }, null, 2));
  }

  await mongoose.disconnect();
}

migrate().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
