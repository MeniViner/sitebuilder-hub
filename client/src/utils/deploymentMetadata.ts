import type { ReleaseArtifactFileResponse, ReleaseArtifactManifestFile } from "../api/sitesApi";
import type { Site } from "../types/site";

export const DEPLOYMENT_METADATA_FILE = "sitebuilder-deployment.json";
export const RUNTIME_CONFIG_FILE = "sitebuilder-runtime-config.json";

export type DeploymentConfigSnapshot = {
  storageBackend: "txt" | "mongo";
  storageBackendSource: string;
  siteId: string;
  backendApiUrl: string;
  allowedSiteRoot: string;
  sharePointSiteUrl: string;
  deployedAt: string;
  operation: "deploy" | "rollback";
};

const sha256Text = async (text: string) => {
  const bytes = new TextEncoder().encode(text);
  const hash = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

export async function buildDeploymentMetadataFile(params: {
  releaseId: string;
  releaseVersion: string;
  operation: "deploy" | "rollback";
  site: Site;
  targetSiteUrl: string;
  targetDistPath: string;
  finalAppUrl?: string;
  storageBackend: "txt" | "mongo";
  storageBackendSource: string;
  storageSiteId: string;
  backendApiUrl?: string;
}): Promise<{
  file: ReleaseArtifactManifestFile & { targetPath: string };
  response: ReleaseArtifactFileResponse;
  files: Array<ReleaseArtifactManifestFile & { targetPath: string }>;
  responses: Record<string, ReleaseArtifactFileResponse>;
  snapshot: DeploymentConfigSnapshot;
}> {
  if (params.storageBackend !== "txt" && params.storageBackend !== "mongo") {
    throw new Error(`invalid-deployment-storage-backend:${params.storageBackend}`);
  }
  const backendApiUrl = String(params.backendApiUrl || "").trim().replace(/\/+$/g, "");
  if (params.storageBackend === "mongo" && !backendApiUrl) throw new Error("mongo-deployment-backend-api-url-required");
  if (!String(params.storageSiteId || "").trim()) throw new Error("deployment-storage-site-id-required");
  const deployedAt = new Date().toISOString();
  const snapshot: DeploymentConfigSnapshot = {
    storageBackend: params.storageBackend,
    storageBackendSource: params.storageBackendSource,
    siteId: params.storageSiteId,
    backendApiUrl: params.storageBackend === "mongo" ? backendApiUrl : "",
    allowedSiteRoot: params.targetSiteUrl.replace(/\/+$/g, ""),
    sharePointSiteUrl: params.targetSiteUrl.replace(/\/+$/g, ""),
    deployedAt,
    operation: params.operation
  };
  const runtimePayload = {
    schemaVersion: 1,
    storageBackend: snapshot.storageBackend,
    siteId: snapshot.siteId,
    ...(snapshot.storageBackend === "mongo" ? { backendApiUrl: snapshot.backendApiUrl } : {}),
    allowedSiteRoot: snapshot.allowedSiteRoot,
    sharePointSiteUrl: snapshot.sharePointSiteUrl,
    generatedBy: "sitebuilder-hub",
    generatedAt: deployedAt
  };
  const payload = {
    kind: "sitebuilder-deployment",
    schemaVersion: 1,
    generatedBy: "sitebuilder-hub",
    deploymentGeneratedBy: "sitebuilder-hub",
    connectorMode: "browser-sharepoint",
    operation: params.operation,
    releaseId: params.releaseId,
    releaseVersion: params.releaseVersion,
    hubSiteId: params.site._id,
    siteCode: params.site.siteCode,
    siteId: snapshot.siteId,
    storageBackend: snapshot.storageBackend,
    storageBackendSource: snapshot.storageBackendSource,
    backendApiUrl: snapshot.backendApiUrl,
    allowedSiteRoot: params.targetSiteUrl,
    sharePointSiteUrl: params.targetSiteUrl,
    finalAppUrl: params.finalAppUrl || "",
    targetDistPath: params.targetDistPath,
    deployedAt
  };
  const text = `${JSON.stringify(payload, null, 2)}\n`;
  const bytes = new TextEncoder().encode(text);
  const sha256 = await sha256Text(text);
  const runtimeText = `${JSON.stringify(runtimePayload, null, 2)}\n`;
  const runtimeBytes = new TextEncoder().encode(runtimeText);
  const runtimeSha256 = await sha256Text(runtimeText);
  const file = {
      relativePath: DEPLOYMENT_METADATA_FILE,
      targetRelativePath: DEPLOYMENT_METADATA_FILE,
      sizeBytes: bytes.byteLength,
      contentType: "application/json;charset=utf-8",
      sha256,
      deployable: true,
      targetPath: `${params.targetDistPath.replace(/\/+$/g, "")}/${DEPLOYMENT_METADATA_FILE}`
    };
  const response = {
      blob: new Blob([text], { type: "application/json;charset=utf-8" }),
      relativePath: DEPLOYMENT_METADATA_FILE,
      sizeBytes: bytes.byteLength,
      sha256,
      contentType: "application/json;charset=utf-8"
    };
  const runtimeFile = {
    relativePath: RUNTIME_CONFIG_FILE,
    targetRelativePath: RUNTIME_CONFIG_FILE,
    sizeBytes: runtimeBytes.byteLength,
    contentType: "application/json;charset=utf-8",
    sha256: runtimeSha256,
    deployable: true,
    targetPath: `${params.targetDistPath.replace(/\/+$/g, "")}/${RUNTIME_CONFIG_FILE}`
  };
  const runtimeResponse = {
    blob: new Blob([runtimeText], { type: "application/json;charset=utf-8" }),
    relativePath: RUNTIME_CONFIG_FILE,
    sizeBytes: runtimeBytes.byteLength,
    sha256: runtimeSha256,
    contentType: "application/json;charset=utf-8"
  };
  return {
    file,
    response,
    files: [runtimeFile, file],
    responses: {
      [RUNTIME_CONFIG_FILE]: runtimeResponse,
      [DEPLOYMENT_METADATA_FILE]: response
    },
    snapshot
  };
}
