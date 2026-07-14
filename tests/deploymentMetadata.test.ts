import { describe, expect, it } from "vitest";
import {
  buildDeploymentMetadataFile,
  DEPLOYMENT_METADATA_FILE,
  RUNTIME_CONFIG_FILE
} from "../client/src/utils/deploymentMetadata";

describe("Hub deployment generated config", () => {
  it("generates authoritative TXT runtime and deployment files without secrets", async () => {
    const generated = await buildDeploymentMetadataFile({
      releaseId: "release-1",
      releaseVersion: "1.2.3",
      operation: "deploy",
      site: { _id: "site-1", siteCode: "nested-site" } as any,
      targetSiteUrl: "https://portal.example/sites/root/nested-site",
      targetDistPath: "/sites/root/nested-site/siteDB/dist",
      finalAppUrl: "https://portal.example/sites/root/nested-site/siteDB/dist/index.html",
      storageBackend: "txt",
      storageBackendSource: "safe-production-default",
      storageSiteId: "nested-site",
      backendApiUrl: ""
    });

    expect(generated.files.map((file) => file.relativePath)).toEqual([RUNTIME_CONFIG_FILE, DEPLOYMENT_METADATA_FILE]);
    const runtime = JSON.parse(await generated.responses[RUNTIME_CONFIG_FILE].blob.text());
    const metadata = JSON.parse(await generated.responses[DEPLOYMENT_METADATA_FILE].blob.text());
    expect(runtime).toMatchObject({
      storageBackend: "txt",
      siteId: "nested-site",
      allowedSiteRoot: "https://portal.example/sites/root/nested-site",
      sharePointSiteUrl: "https://portal.example/sites/root/nested-site"
    });
    expect(metadata).toMatchObject({
      storageBackend: "txt",
      storageBackendSource: "safe-production-default",
      siteId: "nested-site"
    });
    expect(JSON.stringify({ runtime, metadata })).not.toMatch(/apiKey|secret|credential/i);
  });
});
