import { InferSchemaType, Schema, model } from "mongoose";

const alertEntityRefSchema = new Schema(
  {
    type: { type: String, required: true },
    id: { type: String, required: true },
    label: { type: String, default: "" },
    metadata: { type: Schema.Types.Mixed, default: undefined }
  },
  { _id: false }
);

const monitoringAlertSchema = new Schema(
  {
    fingerprint: { type: String, required: true, unique: true, index: true },
    severity: { type: String, enum: ["info", "warning", "critical"], required: true, index: true },
    category: {
      type: String,
      enum: ["failed_job", "stale_backup", "failed_health_check"],
      required: true,
      index: true
    },
    status: { type: String, enum: ["active", "acknowledged", "resolved"], default: "active", index: true },
    message: { type: String, required: true },
    entityRefs: { type: [alertEntityRefSchema], default: [] },
    firstDetectedAt: { type: Date, default: Date.now },
    lastDetectedAt: { type: Date, default: Date.now, index: true },
    acknowledgedAt: { type: Date },
    acknowledgedBy: { type: String, default: "" },
    acknowledgementNote: { type: String, default: "" },
    resolvedAt: { type: Date },
    evidence: { type: Schema.Types.Mixed, default: undefined },
    details: { type: Schema.Types.Mixed, default: undefined }
  },
  { timestamps: true }
);

monitoringAlertSchema.index({ status: 1, severity: 1, lastDetectedAt: -1 });
monitoringAlertSchema.index({ category: 1, status: 1, lastDetectedAt: -1 });

export type MonitoringAlertDocument = InferSchemaType<typeof monitoringAlertSchema>;
export const MonitoringAlert = model("MonitoringAlert", monitoringAlertSchema);
