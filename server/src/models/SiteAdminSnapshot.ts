import { InferSchemaType, Schema, model } from "mongoose";

const adminIdentitySchema = new Schema(
  {
    displayName: { type: String, default: "" },
    personalNumber: { type: String, default: "" },
    email: { type: String, default: "" },
    loginName: { type: String, default: "" }
  },
  { _id: false }
);

const adminDiffSchema = new Schema(
  {
    missingInTxt: { type: [String], default: [] },
    missingInSiteCollection: { type: [String], default: [] },
    missingInOwnersGroup: { type: [String], default: [] }
  },
  { _id: false }
);

const adminSourceStatusSchema = new Schema(
  {
    source: { type: String, enum: ["txt", "siteCollection", "ownersGroup"], required: true },
    status: { type: String, enum: ["success", "failed", "skipped"], default: "skipped" },
    ok: { type: Boolean, default: false },
    count: { type: Number },
    rawCount: { type: Number },
    normalizedCount: { type: Number },
    httpStatus: { type: Number },
    httpStatusText: { type: String, default: "" },
    sourceUrl: { type: String, default: "" },
    readAt: { type: Date },
    errorCode: { type: String, default: "" },
    errorMessage: { type: String, default: "" },
    error: { type: String, default: "" },
    warnings: { type: [String], default: [] }
  },
  { _id: false }
);

const siteAdminSnapshotSchema = new Schema(
  {
    siteId: { type: Schema.Types.ObjectId, ref: "Site", required: true, index: true },
    jobId: { type: Schema.Types.ObjectId, ref: "Job", index: true },

    capturedBy: { type: String, default: "system" },
    capturedAt: { type: Date, default: Date.now },
    connectorMode: { type: String, enum: ["browser-sharepoint", "backend-sharepoint", "mongo-backend"], default: "backend-sharepoint" },
    targetSiteUrl: { type: String, default: "" },

    txtAdmins: { type: [adminIdentitySchema], default: [] },
    siteCollectionAdmins: { type: [adminIdentitySchema], default: [] },
    ownersGroupAdmins: { type: [adminIdentitySchema], default: [] },
    uniqueAdmins: { type: [adminIdentitySchema], default: [] },

    syncStatus: {
      type: String,
      enum: ["running", "succeeded", "failed"],
      default: "running"
    },
    syncError: { type: String, default: "" },
    adminDifferences: { type: adminDiffSchema, default: () => ({}) },
    sourceStatus: { type: [adminSourceStatusSchema], default: [] },
    rawCounts: { type: Schema.Types.Mixed, default: () => ({}) },
    normalizedCounts: { type: Schema.Types.Mixed, default: () => ({}) },
    warnings: { type: [String], default: [] },
    evidence: { type: Schema.Types.Mixed, default: () => ({}) }
  },
  { timestamps: true }
);

siteAdminSnapshotSchema.index({ siteId: 1, capturedAt: -1 });

export type SiteAdminSnapshotDocument = InferSchemaType<typeof siteAdminSnapshotSchema>;
export const SiteAdminSnapshot = model("SiteAdminSnapshot", siteAdminSnapshotSchema);
