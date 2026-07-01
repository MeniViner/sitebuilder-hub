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
    storageCompatibility: { type: [String], default: [] },
    artifactKind: {
      type: String,
      enum: ["site-builder-frontend", "legacy-txt-frontend", "mongo-frontend", "unknown"],
      default: "unknown"
    },
    requiresRuntimeConfig: { type: Boolean, default: false },
    preservesRuntimeConfig: { type: Boolean, default: true },
    requiredFolders: { type: [String], default: [] },
    runtimeConfigFiles: { type: [String], default: [] },
    compatibilitySource: { type: String, enum: ["manifest", "inferred", "unknown"], default: "unknown" },
    compatibilityWarnings: { type: [String], default: [] },
    readyForDeploy: { type: Boolean, default: false },
    validatedAt: { type: Date },
    validationError: { type: String, default: "" }
  },
  { _id: false }
);

const releaseSchema = new Schema(
  {
    name: { type: String, default: "", trim: true },
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
