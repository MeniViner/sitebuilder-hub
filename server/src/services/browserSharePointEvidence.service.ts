import { Site } from "../models/Site";
import { logger } from "../utils/logger";
import { setJobEvidence, setJobFailed, setJobResult, setJobStatus, setJobSucceeded, setJobTargetPaths } from "./jobs.service";

type BrowserSiteOperation = "site-provision" | "site-bootstrap" | "permissions-setup";

type BrowserOperationStepEvidence = {
  step: string;
  status: "succeeded" | "failed" | "skipped";
  path?: string;
  httpStatus?: number;
  error?: string;
};

type BrowserSiteOperationEvidenceInput = {
  connectorMode: "browser-sharepoint";
  jobId?: string;
  operation: BrowserSiteOperation;
  targetSiteUrl?: string;
  startedAt?: string;
  completedAt?: string;
  finalStatus: "success" | "failed";
  steps?: BrowserOperationStepEvidence[];
  health?: Record<string, unknown>;
  evidence?: Record<string, unknown>;
  warnings?: string[];
};

const dateValue = (value?: string) => {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

const operationLabel = (operation: BrowserSiteOperation) => {
  if (operation === "site-provision") return "Browser site provisioning";
  if (operation === "site-bootstrap") return "Browser site bootstrap";
  return "Browser permissions setup";
};

const deriveHealthFromSteps = (operation: BrowserSiteOperation, steps: BrowserOperationStepEvidence[]) => {
  const stepOk = (needle: string) => steps.some((step) => step.step.includes(needle) && step.status !== "failed");
  if (operation === "permissions-setup") {
    return { permissionsOk: steps.length > 0 && steps.every((step) => step.status !== "failed") };
  }
  return {
    siteDbExists: stepOk("site-db"),
    usersDbExists: stepOk("users-db"),
    distExists: stepOk("dist"),
    assetsExists: stepOk("assets") || stepOk("images"),
    txtFilesExist: steps.some((step) => step.step.includes("txt") && step.status !== "failed")
  };
};

const plainSubdocument = (value: unknown) =>
  value && typeof (value as any).toObject === "function" ? (value as any).toObject() : value || {};

export async function recordBrowserSiteOperationEvidence(siteId: string, input: BrowserSiteOperationEvidenceInput, actor = "browser-sharepoint") {
  if (input.connectorMode !== "browser-sharepoint") throw new Error("browser-site-operation-connector-mode-required");
  const site = await Site.findById(siteId);
  if (!site) throw new Error("site-not-found");

  const completedAt = dateValue(input.completedAt);
  const steps = input.steps || [];
  const failedSteps = steps.filter((step) => step.status === "failed");
  const success = input.finalStatus === "success" && failedSteps.length === 0;
  const derivedHealth = deriveHealthFromSteps(input.operation, steps);
  const suppliedHealth = input.health || {};

  site.health = {
    ...plainSubdocument(site.health),
    ...derivedHealth,
    ...suppliedHealth
  } as any;
  site.lastHealthCheckAt = completedAt;
  site.lastSharePointHostingVerificationAt = completedAt;
  site.lastError = success ? "" : failedSteps.map((step) => step.error || step.step).filter(Boolean).join("; ").slice(0, 1000) || `${input.operation}-failed`;
  site.sharePointPathEvidence = {
    connectorMode: "browser-sharepoint",
    operation: input.operation,
    actor,
    targetSiteUrl: input.targetSiteUrl || site.sharePointSiteUrl,
    startedAt: input.startedAt || "",
    completedAt: completedAt.toISOString(),
    finalStatus: input.finalStatus,
    steps,
    warnings: input.warnings || [],
    evidence: input.evidence || {}
  };

  if (input.operation === "permissions-setup") {
    site.sharePointStatus = {
      ...plainSubdocument(site.sharePointStatus),
      permissionsStatus: success ? "ok" : "failed"
    } as any;
  } else {
    site.provisioningStatus = success ? "succeeded" : "failed";
    site.lifecycleStatus = success ? "ready" : "partially-created";
    site.status = success ? "active" : "warning";
    site.sharePointStatus = {
      ...plainSubdocument(site.sharePointStatus),
      documentLibrariesStatus: success ? "ok" : "failed"
    } as any;
  }

  await site.save();

  const jobId = String(input.jobId || "").trim();
  if (jobId) {
    const label = operationLabel(input.operation);
    await setJobStatus(jobId, "browser-in-progress", { progressPercent: 80, message: `${label} evidence received` });
    await setJobTargetPaths(jobId, steps.map((step) => step.path).filter(Boolean) as string[], `${label} target paths recorded`);
    await setJobEvidence(jobId, {
      connectorMode: "browser-sharepoint",
      operation: input.operation,
      targetSiteUrl: input.targetSiteUrl || site.sharePointSiteUrl,
      steps,
      warnings: input.warnings || []
    }, `${label} evidence recorded`);
    await setJobResult(jobId, {
      connectorMode: "browser-sharepoint",
      operation: input.operation,
      status: success ? "succeeded" : "failed",
      stepsCount: steps.length,
      failedStepsCount: failedSteps.length
    }, `${label} result recorded`);
    if (success) await setJobSucceeded(jobId, `${label} completed in browser`);
    else await setJobFailed(jobId, site.lastError || `${input.operation}-failed`);
  }

  logger[success ? "info" : "warn"]("sites", "Browser SharePoint site operation evidence recorded", {
    siteId: site._id.toString(),
    siteCode: site.siteCode,
    operation: input.operation,
    finalStatus: input.finalStatus,
    steps: steps.length,
    failedSteps: failedSteps.length
  });

  return {
    site,
    summary: {
      connectorMode: "browser-sharepoint" as const,
      operation: input.operation,
      label: operationLabel(input.operation),
      finalStatus: input.finalStatus,
      stepsCount: steps.length,
      failedStepsCount: failedSteps.length,
      completedAt: completedAt.toISOString()
    }
  };
}
