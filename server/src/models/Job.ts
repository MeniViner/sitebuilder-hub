import { InferSchemaType, Schema, model } from "mongoose";

const jobLogSchema = new Schema(
  {
    at: { type: Date, default: Date.now },
    level: { type: String, enum: ["info", "warn", "error"], default: "info" },
    message: { type: String, required: true }
  },
  { _id: false }
);

const jobSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["health-check", "deploy", "backup", "restore", "admin-sync", "repair", "version-upgrade", "version-rollback", "site-provision", "permissions-setup", "site-bootstrap", "runtime-config-check", "mongo-health-check", "mongo-seed"],
      required: true,
      index: true
    },
    siteId: { type: Schema.Types.ObjectId, ref: "Site", index: true },
    payload: { type: Schema.Types.Mixed, default: {} },

    status: {
      type: String,
      enum: [
        "awaiting-approval",
        "queued",
        "browser-required",
        "browser-in-progress",
        "blocked-service-auth-required",
        "preflight",
        "running",
        "verifying",
        "succeeded",
        "failed",
        "cancelled",
        "retrying"
      ],
      default: "queued",
      index: true
    },
    executionMode: {
      type: String,
      enum: ["backend", "browser-required", "browser-in-progress", "completed", "failed", "blocked-service-auth-required"],
      default: "backend",
      index: true
    },
    connectorMode: {
      type: String,
      enum: ["backend-sharepoint", "browser-sharepoint", "mongo-backend", "server-local", "backend-service-auth-required", "manual", "none"],
      default: "backend-sharepoint",
      index: true
    },
    operationPolicy: { type: String, default: "" },
    connectorStatusLabel: { type: String, default: "" },
    connectorBlocker: { type: String, default: "" },
    progressPercent: { type: Number, default: 0 },

    attempt: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    nextRetryAt: { type: Date },

    startedAt: { type: Date },
    finishedAt: { type: Date },

    errorCode: { type: String, default: "" },
    errorMessage: { type: String, default: "" },
    errorDetails: { type: String, default: "" },

    evidence: { type: Schema.Types.Mixed, default: undefined },
    result: { type: Schema.Types.Mixed, default: undefined },
    targetPaths: { type: [String], default: [] },

    requiresApproval: { type: Boolean, default: false, index: true },
    approvalSummary: { type: String, default: "" },
    approvalRequestedAt: { type: Date },
    approvalRequestedBy: { type: String, default: "" },
    approvedAt: { type: Date },
    approvedBy: { type: String, default: "" },
    rejectedAt: { type: Date },
    rejectedBy: { type: String, default: "" },
    approvalDecisionReason: { type: String, default: "" },
    approvalExpiresAt: { type: Date },
    approvalSnapshot: { type: Schema.Types.Mixed, default: undefined },
    approvalResult: { type: Schema.Types.Mixed, default: undefined },

    createdBy: { type: String, default: "system" },
    createdById: { type: String, default: "" },
    approvalRequestedById: { type: String, default: "" },
    approvedById: { type: String, default: "" },
    rejectedById: { type: String, default: "" },
    logs: { type: [jobLogSchema], default: [] }
  },
  { timestamps: true }
);

jobSchema.index({ status: 1, createdAt: 1 });

export type JobDocument = InferSchemaType<typeof jobSchema>;
export const Job = model("Job", jobSchema);
