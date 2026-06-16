import { describe, expect, it } from "vitest";
import { canRunDeployMvp, getDeployMvpMissingRequirements } from "../client/src/utils/deployMvp";
import type { DeployPlan, OperationCapabilities } from "../client/src/api/sitesApi";

const capabilities = (writeAvailable: boolean): OperationCapabilities => ({
  generatedAt: "2026-05-14T10:00:00.000Z",
  sharePoint: {
    readAvailable: true,
    writeEnabled: writeAvailable,
    hasAuthMaterial: writeAvailable,
    unauthenticatedWriteAllowed: false,
    writeAvailable,
    authMode: writeAvailable ? "bearer" : "none",
    reason: writeAvailable ? undefined : "SharePoint write is disabled."
  },
  operations: {}
});

const plan = (overrides: Partial<DeployPlan> = {}): DeployPlan => ({
  generatedAt: "2026-05-14T10:00:00.000Z",
  deployMode: "local-dev-owner",
  deployPolicy: {
    mode: "local-dev-owner",
    label: "Local/dev owner deploy",
    productionSafeMode: false,
    localDevOwnerMode: true,
    requiresApproval: false,
    requiresRecentVerifiedBackup: false,
    ownerOverrideAllowed: true,
    checkedAt: "2026-05-14T10:00:00.000Z",
    warning: "local/dev",
    blockers: []
  },
  releaseId: "release-1",
  releaseVersion: "1.2.4",
  artifactRef: "/tmp/artifact",
  artifactRoot: "/tmp/artifact",
  siteId: "site-1",
  siteCode: "alpha",
  files: [
    {
      relativePath: "index.html",
      sourcePath: "/tmp/artifact/index.html",
      targetPath: "/sites/alpha/siteDB/dist/index.html",
      sizeBytes: 42,
      sha256: "sha"
    }
  ],
  summary: {
    filesCount: 1,
    totalSizeBytes: 42,
    hasIndexHtml: true,
    hasManifest: true,
    readyForDeploy: true,
    readyForDeployExecution: true
  },
  capabilities: {
    readAvailable: true,
    writeEnabled: true,
    hasAuthMaterial: true,
    unauthenticatedWriteAllowed: false,
    writeAvailable: true,
    authMode: "bearer"
  },
  notes: [],
  ...overrides
});

describe("Deploy MVP UI gate", () => {
  it("keeps Deploy disabled until release, site, artifact, plan, and write capability are ready", () => {
    expect(getDeployMvpMissingRequirements({
      deployMode: "local-dev-owner",
      capabilities: capabilities(false)
    })).toEqual(expect.arrayContaining([
      "Select a release before running Deploy.",
      "Select one managed site before running Deploy.",
      "Deploy cannot run because the release artifact is missing.",
      "Generate a dry-run deploy plan before running Deploy.",
      "Deploy cannot run because SharePoint write is not configured."
    ]));

    expect(canRunDeployMvp({
      releaseId: "release-1",
      siteId: "site-1",
      deployMode: "local-dev-owner",
      releaseArtifactRef: "/tmp/artifact",
      capabilities: capabilities(true),
      plan: plan()
    })).toBe(true);
  });

  it("requires a fresh dry-run plan when the deploy mode changes", () => {
    expect(getDeployMvpMissingRequirements({
      releaseId: "release-1",
      siteId: "site-1",
      deployMode: "production-safe",
      releaseArtifactRef: "/tmp/artifact",
      capabilities: capabilities(true),
      plan: plan()
    })).toContain("Generate a fresh dry-run deploy plan for the selected deploy mode.");
  });

  it("does not block browser-sharepoint deploy on backend write capability", () => {
    expect(getDeployMvpMissingRequirements({
      releaseId: "release-1",
      siteId: "site-1",
      deployMode: "local-dev-owner",
      releaseArtifactRef: "/tmp/artifact",
      connectorMode: "browser-sharepoint",
      capabilities: capabilities(false),
      plan: plan({ connectorMode: "browser-sharepoint" })
    })).toEqual([]);
  });
});
