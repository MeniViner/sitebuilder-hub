import { InferSchemaType, Schema, model } from "mongoose";

const auditActorSchema = new Schema(
  {
    userId: { type: String, default: "system" },
    userName: { type: String, default: "System" },
    role: { type: String, default: "system" }
  },
  { _id: false }
);

const auditLogSchema = new Schema(
  {
    requestId: { type: String, default: "" },
    actor: { type: auditActorSchema, default: () => ({}) },

    action: { type: String, required: true, index: true },
    entityType: { type: String, required: true, index: true },
    entityId: { type: String, default: "" },

    result: { type: String, enum: ["success", "failure"], default: "success" },
    error: { type: String, default: "" },

    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
    metadata: { type: Schema.Types.Mixed }
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });

auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });

export type AuditLogDocument = InferSchemaType<typeof auditLogSchema>;
export const AuditLog = model("AuditLog", auditLogSchema);
