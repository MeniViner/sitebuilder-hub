import { InferSchemaType, Schema, model } from "mongoose";

const backupSourceSchema = new Schema(
  {
    path: { type: String, required: true },
    exists: { type: Boolean, default: true },
    targetPath: { type: String, default: "" },
    status: { type: String, enum: ["pending", "verified", "failed"], default: "pending" },
    sourceSizeBytes: { type: Number, default: 0 },
    sourceSha256: { type: String, default: "" },
    backupSizeBytes: { type: Number, default: 0 },
    backupSha256: { type: String, default: "" },
    error: { type: String, default: "" }
  },
  { _id: false }
);

const backupEvidenceSchema = new Schema(
  {
    sourcePath: { type: String, default: "" },
    targetPath: { type: String, default: "" },
    status: { type: String, enum: ["verified", "failed"], default: "failed" },
    checkedAt: { type: Date },
    sourceSizeBytes: { type: Number, default: 0 },
    sourceSha256: { type: String, default: "" },
    expectedBackupSizeBytes: { type: Number, default: 0 },
    expectedBackupSha256: { type: String, default: "" },
    backupSizeBytes: { type: Number, default: 0 },
    backupSha256: { type: String, default: "" },
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

const backupVerificationSchema = new Schema(
  {
    status: { type: String, enum: ["unverified", "verified", "failed"], default: "unverified" },
    checkedAt: { type: Date },
    checkedBy: { type: String, default: "" },
    details: { type: String, default: "" },
    evidence: { type: [backupEvidenceSchema], default: [] }
  },
  { _id: false }
);

const restoreEvidenceSchema = new Schema(
  {
    sourcePath: { type: String, default: "" },
    targetPath: { type: String, default: "" },
    backupPath: { type: String, default: "" },
    status: { type: String, enum: ["verified", "failed"], default: "failed" },
    checkedAt: { type: Date },
    expectedBackupSizeBytes: { type: Number, default: 0 },
    expectedBackupSha256: { type: String, default: "" },
    backupSizeBytes: { type: Number, default: 0 },
    backupSha256: { type: String, default: "" },
    expectedRestoreSizeBytes: { type: Number, default: 0 },
    expectedRestoreSha256: { type: String, default: "" },
    restoredSizeBytes: { type: Number, default: 0 },
    restoredSha256: { type: String, default: "" },
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

const siteBackupSchema = new Schema(
  {
    siteId: { type: Schema.Types.ObjectId, ref: "Site", required: true, index: true },
    jobId: { type: Schema.Types.ObjectId, ref: "Job", index: true },

    backupId: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ["queued", "running", "succeeded", "failed", "verified", "unverified"],
      default: "queued"
    },

    storageProvider: { type: String, default: "sharepoint" },
    storagePath: { type: String, default: "" },

    sizeBytes: { type: Number, default: 0 },
    filesCount: { type: Number, default: 0 },
    sourceSha256: { type: String, default: "" },
    backupSha256: { type: String, default: "" },

    createdBy: { type: String, default: "system" },
    sourcePaths: { type: [backupSourceSchema], default: [] },

    verification: { type: backupVerificationSchema, default: () => ({}) },
    error: { type: String, default: "" },
    restorePlan: { type: String, default: "" },

    restoreStatus: {
      type: String,
      enum: ["never-restored", "running", "succeeded", "verified", "failed"],
      default: "never-restored",
      index: true
    },
    lastRestoreAt: { type: Date },
    lastRestoreJobId: { type: Schema.Types.ObjectId, ref: "Job", index: true },
    restoreEvidence: { type: [restoreEvidenceSchema], default: [] },
    lastRestoreError: { type: String, default: "" }
  },
  { timestamps: true }
);

siteBackupSchema.index({ siteId: 1, createdAt: -1 });

export type SiteBackupDocument = InferSchemaType<typeof siteBackupSchema>;
export const SiteBackup = model("SiteBackup", siteBackupSchema);
