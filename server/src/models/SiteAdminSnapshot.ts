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

const siteAdminSnapshotSchema = new Schema(
  {
    siteId: { type: Schema.Types.ObjectId, ref: "Site", required: true, index: true },
    jobId: { type: Schema.Types.ObjectId, ref: "Job", index: true },

    capturedBy: { type: String, default: "system" },
    capturedAt: { type: Date, default: Date.now },

    txtAdmins: { type: [adminIdentitySchema], default: [] },
    siteCollectionAdmins: { type: [adminIdentitySchema], default: [] },
    ownersGroupAdmins: { type: [adminIdentitySchema], default: [] },

    syncStatus: {
      type: String,
      enum: ["running", "succeeded", "failed"],
      default: "running"
    },
    syncError: { type: String, default: "" },
    adminDifferences: { type: adminDiffSchema, default: () => ({}) }
  },
  { timestamps: true }
);

siteAdminSnapshotSchema.index({ siteId: 1, capturedAt: -1 });

export type SiteAdminSnapshotDocument = InferSchemaType<typeof siteAdminSnapshotSchema>;
export const SiteAdminSnapshot = model("SiteAdminSnapshot", siteAdminSnapshotSchema);
