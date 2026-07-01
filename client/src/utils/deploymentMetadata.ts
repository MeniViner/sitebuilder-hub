import type { ReleaseArtifactFileResponse, ReleaseArtifactManifestFile } from "../api/sitesApi";
import type { Site } from "../types/site";

export const DEPLOYMENT_METADATA_FILE = "sitebuilder-deployment.json";

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
}): Promise<{ file: ReleaseArtifactManifestFile & { targetPath: string }; response: ReleaseArtifactFileResponse }> {
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
    allowedSiteRoot: params.targetSiteUrl,
    sharePointSiteUrl: params.targetSiteUrl,
    finalAppUrl: params.finalAppUrl || "",
    targetDistPath: params.targetDistPath,
    deployedAt: new Date().toISOString()
  };
  const text = `${JSON.stringify(payload, null, 2)}\n`;
  const bytes = new TextEncoder().encode(text);
  const sha256 = await sha256Text(text);
  return {
    file: {
      relativePath: DEPLOYMENT_METADATA_FILE,
      targetRelativePath: DEPLOYMENT_METADATA_FILE,
      sizeBytes: bytes.byteLength,
      contentType: "application/json;charset=utf-8",
      sha256,
      deployable: true,
      targetPath: `${params.targetDistPath.replace(/\/+$/g, "")}/${DEPLOYMENT_METADATA_FILE}`
    },
    response: {
      blob: new Blob([text], { type: "application/json;charset=utf-8" }),
      relativePath: DEPLOYMENT_METADATA_FILE,
      sizeBytes: bytes.byteLength,
      sha256,
      contentType: "application/json;charset=utf-8"
    }
  };
}
