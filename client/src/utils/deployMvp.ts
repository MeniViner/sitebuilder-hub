import type { DeployMode, DeployPlan, OperationCapabilities, ReleaseArtifactValidation, SharePointConnectorMode } from "../api/sitesApi";

export type DeployMvpGateInput = {
  releaseId?: string;
  siteId?: string;
  deployMode: DeployMode;
  plan?: DeployPlan | null;
  artifactValidation?: ReleaseArtifactValidation | null;
  releaseArtifactRef?: string;
  capabilities?: OperationCapabilities | null;
  connectorMode?: SharePointConnectorMode;
};

const hasArtifactRef = (value?: string) => Boolean(String(value || "").trim());

export function getDeployMvpMissingRequirements(input: DeployMvpGateInput) {
  const missing: string[] = [];

  if (!input.releaseId) missing.push("Select a release before running Deploy.");
  if (!input.siteId) missing.push("Select one managed site before running Deploy.");

  const validationReady = input.artifactValidation?.summary?.readyForDeploy;
  const validationKnown = Boolean(input.artifactValidation);
  if (validationKnown && !validationReady) {
    missing.push("Deploy cannot run because the release artifact is invalid.");
  } else if (!hasArtifactRef(input.releaseArtifactRef) && !input.plan?.artifactRef) {
    missing.push("Deploy cannot run because the release artifact is missing.");
  }

  if (!input.plan) {
    missing.push("Generate a dry-run deploy plan before running Deploy.");
  } else {
    if (input.plan.releaseId !== input.releaseId || input.plan.siteId !== input.siteId) {
      missing.push("Generate a fresh dry-run deploy plan for the selected release and site.");
    }
    if (input.plan.deployMode && input.plan.deployMode !== input.deployMode) {
      missing.push("Generate a fresh dry-run deploy plan for the selected deploy mode.");
    }
    if (!input.plan.summary.readyForDeploy) {
      missing.push("Deploy cannot run because the release artifact is invalid.");
    }
    if (!input.plan.summary.readyForDeployExecution) {
      for (const requirement of input.plan.missingRequirements || []) {
        if (requirement && !missing.includes(requirement)) missing.push(requirement);
      }
    }
  }

  const connectorMode = input.connectorMode || input.plan?.connectorMode || "backend-sharepoint";
  if (connectorMode === "backend-sharepoint" && input.capabilities && !input.capabilities.sharePoint.writeAvailable) {
    missing.push("Deploy cannot run because SharePoint write is not configured.");
  }

  return Array.from(new Set(missing));
}

export function canRunDeployMvp(input: DeployMvpGateInput) {
  return getDeployMvpMissingRequirements(input).length === 0;
}
