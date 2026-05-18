import { InferSchemaType, Schema, model } from "mongoose";

const releaseArtifactValidationSchema = new Schema(
  {
    artifactRef: { type: String, default: "" },
    artifactRoot: { type: String, default: "" },
    filesCount: { type: Number, default: 0 },
    totalSizeBytes: { type: Number, default: 0 },
    hasIndexHtml: { type: Boolean, default: false },
    hasManifest: { type: Boolean, default: false },
    manifestSha256: { type: String, default: "" },
    inventorySha256: { type: String, default: "" },
    readyForDeploy: { type: Boolean, default: false },
    validatedAt: { type: Date },
    validationError: { type: String, default: "" }
  },
  { _id: false }
);

const releaseSchema = new Schema(
  {
    version: { type: String, required: true, unique: true, trim: true },
    releaseType: {
      type: String,
      enum: ["patch", "minor", "major", "hotfix"],
      default: "patch"
    },
    notes: { type: String, default: "" },
    artifactRef: { type: String, default: "" },
    artifactValidation: { type: releaseArtifactValidationSchema, default: () => ({}) },
    createdBy: { type: String, default: "system" },
    status: { type: String, enum: ["active", "deprecated"], default: "active" }
  },
  { timestamps: true }
);

releaseSchema.index({ createdAt: -1 });

export type ReleaseDocument = InferSchemaType<typeof releaseSchema>;
export const Release = model("Release", releaseSchema);
