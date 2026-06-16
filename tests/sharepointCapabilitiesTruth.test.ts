import { describe, expect, it, vi } from "vitest";

vi.mock("../server/src/config/env", () => ({
  env: {
    SHAREPOINT_WRITE_ENABLED: true,
    SHAREPOINT_ALLOW_UNAUTHENTICATED_WRITE: true,
    SHAREPOINT_AUTH_COOKIE: "",
    SHAREPOINT_BEARER_TOKEN: "",
    SHAREPOINT_REQUEST_TIMEOUT_MS: 15000,
    SHAREPOINT_SITE_CREATE_POLL_ATTEMPTS: 2,
    SHAREPOINT_SITE_CREATE_POLL_INTERVAL_MS: 1
  }
}));
vi.mock("../server/src/utils/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    isPayloadLoggingEnabled: vi.fn(() => false)
  }
}));

describe("SharePoint capability truthfulness", () => {
  it("does not treat unauthenticated write bypass as verified write capability", async () => {
    const { getSharePointOperationCapabilities } = await import("../server/src/services/sharepointOperationClient");

    const capabilities = getSharePointOperationCapabilities();

    expect(capabilities.writeEnabled).toBe(true);
    expect(capabilities.unauthenticatedWriteAllowed).toBe(true);
    expect(capabilities.hasAuthMaterial).toBe(false);
    expect(capabilities.writeAvailable).toBe(false);
    expect(capabilities.writeVerified).toBe(false);
    expect(capabilities.digest.canRequest).toBe(false);
    expect(capabilities.reason).toContain("unauthenticated write bypass is not proof");
  });
});
