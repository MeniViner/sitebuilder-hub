import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  Job: {
    findOneAndUpdate: vi.fn()
  },
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    isPayloadLoggingEnabled: vi.fn(() => false)
  }
}));

vi.mock("../server/src/models/Job", () => ({ Job: mocks.Job }));
vi.mock("../server/src/utils/logger", () => ({ logger: mocks.logger }));

beforeEach(() => {
  vi.resetModules();
  mocks.Job.findOneAndUpdate.mockReset();
  mocks.Job.findOneAndUpdate.mockResolvedValue(null);
});

describe("job claiming", () => {
  it("filters out browser-required SharePoint jobs from backend worker claims", async () => {
    const { claimNextJob } = await import("../server/src/services/jobs.service");

    await claimNextJob();

    expect(mocks.Job.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "queued",
        executionMode: { $nin: ["browser-required", "browser-in-progress", "blocked-service-auth-required"] },
        connectorMode: { $nin: ["browser-sharepoint", "backend-sharepoint", "backend-service-auth-required"] },
        "payload.connectorMode": { $nin: ["browser-sharepoint", "backend-sharepoint", "backend-service-auth-required"] },
        "payload.executionMode": { $ne: "browser-required" }
      }),
      expect.any(Object),
      expect.objectContaining({ sort: { createdAt: 1 }, new: true })
    );
  });
});
