import { describe, expect, it } from "vitest";
import { deriveHealthStatus } from "../server/src/utils/health";

const checkedAt = new Date("2026-06-17T00:00:00.000Z");

describe("storage-aware health derivation", () => {
  it("treats missing TXT files as fatal for TXT-backed sites", () => {
    expect(deriveHealthStatus({
      siteDbExists: true,
      usersDbExists: true,
      distExists: true,
      indexExists: true,
      assetsExists: true,
      txtFilesExist: false,
      adminsSyncOk: true,
      permissionsOk: true
    }, checkedAt, "txt")).toBe("failed");
  });

  it("does not treat missing TXT files as fatal for Mongo-backed sites", () => {
    expect(deriveHealthStatus({
      siteDbExists: true,
      usersDbExists: true,
      distExists: true,
      indexExists: true,
      assetsExists: true,
      txtFilesExist: false,
      runtimeConfigExists: true,
      runtimeConfigValid: true,
      dataBackendReachable: true,
      mongoRegistryOk: true,
      mongoCollectionOk: true,
      mongoSeedOk: true,
      mongoBackupsOk: true,
      mongoRevisionsAuditOk: true,
      adminsSyncOk: true,
      permissionsOk: true
    }, checkedAt, "mongo")).toBe("healthy");
  });

  it("blocks Mongo readiness when siteUsersDb is missing", () => {
    expect(deriveHealthStatus({
      siteDbExists: true,
      usersDbExists: false,
      distExists: true,
      indexExists: true,
      assetsExists: true,
      txtFilesExist: false,
      runtimeConfigExists: true,
      runtimeConfigValid: true,
      dataBackendReachable: true,
      mongoRegistryOk: true,
      mongoCollectionOk: true,
      mongoSeedOk: true,
      mongoBackupsOk: true,
      mongoRevisionsAuditOk: true,
      adminsSyncOk: true,
      permissionsOk: true
    }, checkedAt, "mongo")).toBe("failed");
  });

  it("blocks Mongo readiness when seed docs are missing", () => {
    expect(deriveHealthStatus({
      siteDbExists: true,
      usersDbExists: true,
      distExists: true,
      indexExists: true,
      assetsExists: true,
      runtimeConfigExists: true,
      runtimeConfigValid: true,
      dataBackendReachable: true,
      mongoRegistryOk: true,
      mongoCollectionOk: true,
      mongoSeedOk: false,
      mongoBackupsOk: true,
      mongoRevisionsAuditOk: true,
      adminsSyncOk: true,
      permissionsOk: true
    }, checkedAt, "mongo")).toBe("failed");
  });
});
