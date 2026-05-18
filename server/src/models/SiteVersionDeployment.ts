import { InferSchemaType, Schema, model } from "mongoose";

const deploymentLogSchema = new Schema(
  {
    at: { type: Date, default: Date.now },
    level: { type: String, enum: ["info", "warn", "error"], default: "info" },
    message: { type: String, required: true }
  },
  { _id: false }
);

const deploymentVerificationFileSchema = new Schema(
  {
    relativePath: { type: String, default: "" },
    sourcePath: { type: String, default: "" },
    targetPath: { type: String, default: "" },
    status: { type: String, enum: ["verified", "failed"], default: "failed" },
    checkedAt: { type: Date },
    expectedSizeBytes: { type: Number, default: 0 },
    actualSizeBytes: { type: Number, default: 0 },
    expectedSha256: { type: String, default: "" },
    actualSha256: { type: String, default: "" },
    sizeMatches: { type: Boolean, default: false },
    sha256Matches: { type: Boolean, default: false },
    httpStatus: { type: Number },
    httpStatusText: { type: String, default: "" },
    contentType: { type: String, default: "" },
    etag: { type: String, default: "" },
    lastModified: { type: String, default: "" },
    error: { type: String, default: "" }
  },
  { _id: false }
);

const deploymentHealthEvidenceSchema = new Schema(
  {
    key: { type: String, default: "" },
    label: { type: String, default: "" },
    url: { type: String, default: "" },
    ok: { type: Boolean, default: false },
    status: { type: Number },
    statusText: { type: String, default: "" },
    authBlocked: { type: Boolean, default: false },
    checkedAt: { type: Date },
    error: { type: String, default: "" }
  },
  { _id: false }
);

const deploymentPostHealthSchema = new Schema(
  {
    checkedAt: { type: Date },
    derivedHealthStatus: { type: String, default: "" },
    evidenceCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    authBlockedCount: { type: Number, default: 0 },
    health: { type: Schema.Types.Mixed, default: {} },
    evidence: { type: [deploymentHealthEvidenceSchema], default: [] }
  },
  { _id: false }
);

const deploymentVerificationSchema = new Schema(
  {
    status: { type: String, enum: ["unverified", "verified", "failed"], default: "unverified" },
    checkedAt: { type: Date },
    filesCount: { type: Number, default: 0 },
    verifiedFilesCount: { type: Number, default: 0 },
    failedFilesCount: { type: Number, default: 0 },
    totalSizeBytes: { type: Number, default: 0 },
    evidence: { type: [deploymentVerificationFileSchema], default: [] },
    finalAppUrlVerification: { type: deploymentHealthEvidenceSchema, default: undefined },
    postHealth: { type: deploymentPostHealthSchema, default: undefined }
  },
  { _id: false }
);

const siteVersionDeploymentSchema = new Schema(
  {
    siteId: { type: Schema.Types.ObjectId, ref: "Site", required: true, index: true },
    releaseId: { type: Schema.Types.ObjectId, ref: "Release", required: true, index: true },
    jobId: { type: Schema.Types.ObjectId, ref: "Job", index: true },

    fromVersion: { type: String, default: "" },
    toVersion: { type: String, required: true },
    deploymentKind: { type: String, enum: ["deploy", "rollback"], default: "deploy", index: true },
    rollbackReason: { type: String, default: "" },

    status: {
      type: String,
      enum: ["queued", "running", "succeeded", "failed", "cancelled"],
      default: "queued"
    },
    startedAt: { type: Date },
    finishedAt: { type: Date },
    triggeredBy: { type: String, default: "system" },
    error: { type: String, default: "" },
    verification: { type: deploymentVerificationSchema, default: () => ({}) },
    logLines: { type: [deploymentLogSchema], default: [] }
  },
  { timestamps: true }
);

siteVersionDeploymentSchema.index({ siteId: 1, createdAt: -1 });

export type SiteVersionDeploymentDocument = InferSchemaType<typeof siteVersionDeploymentSchema>;
export const SiteVersionDeployment = model("SiteVersionDeployment", siteVersionDeploymentSchema);
