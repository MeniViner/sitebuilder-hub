import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  Site: {
    findByIdAndUpdate: vi.fn()
  },
  SiteVersionDeployment: {
    findByIdAndUpdate: vi.fn()
  },
  Job: {
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn()
  },
  claimNextJob: vi.fn(),
  setJobFailed: vi.fn(),
  setJobStatus: vi.fn(),
  setJobSucceeded: vi.fn(),
  writeSystemAuditLog: vi.fn(),
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    isPayloadLoggingEnabled: vi.fn(() => false)
  }
}));

vi.mock("../server/src/models/Site", () => ({ Site: mocks.Site }));
vi.mock("../server/src/models/Job", () => ({ Job: mocks.Job }));
vi.mock("../server/src/models/SiteVersionDeployment", () => ({
  SiteVersionDeployment: mocks.SiteVersionDeployment
}));
vi.mock("../server/src/services/jobs.service", () => ({
  claimNextJob: mocks.claimNextJob,
  setJobFailed: mocks.setJobFailed,
  setJobStatus: mocks.setJobStatus,
  setJobSucceeded: mocks.setJobSucceeded
}));
vi.mock("../server/src/services/audit.service", () => ({
  writeSystemAuditLog: mocks.writeSystemAuditLog
}));
vi.mock("../server/src/utils/logger", () => ({ logger: mocks.logger }));
vi.mock("../server/src/config/env", () => ({
  env: {
    JOB_WORKER_ENABLED: false,
    JOB_WORKER_POLL_MS: 3000
  },
  ownerDirectModeEnabled: () => false
}));

const idOf = (value: string) => ({ toString: () => value });

beforeEach(() => {
  vi.resetModules();
  Object.values(mocks).forEach((group) => {
    if (vi.isMockFunction(group)) {
      group.mockReset();
      return;
    }
    Object.values(group as Record<string, unknown>).forEach((value) => {
      if (vi.isMockFunction(value)) value.mockReset();
    });
  });
  mocks.logger.isPayloadLoggingEnabled.mockReturnValue(false);
});

describe("site-bootstrap browser-only worker handling", () => {
  it("moves site-bootstrap reruns to browser-required without executing a server worker", async () => {
    const originalJob = {
      _id: idOf("rerun-request-1"),
      type: "site-bootstrap",
      status: "failed",
      requiresApproval: false,
      createdBy: "operator",
      siteId: idOf("site-1"),
      payload: {
        connectorMode: "browser-sharepoint",
        executionMode: "browser-required"
      }
    };
    const updatedJob = {
      ...originalJob,
      status: "browser-required",
      executionMode: "browser-required",
      connectorMode: "browser-sharepoint"
    };

    mocks.Job.findById.mockResolvedValueOnce(originalJob).mockResolvedValueOnce(updatedJob);

    const { runJobNow } = await import("../server/src/services/jobs.worker");
    const result = await runJobNow("rerun-request-1");

    expect(result).toBe(updatedJob);
    expect(mocks.Job.findByIdAndUpdate).toHaveBeenCalledWith(
      "rerun-request-1",
      expect.objectContaining({
        $set: expect.objectContaining({
          status: "browser-required",
          executionMode: "browser-required",
          connectorMode: "browser-sharepoint"
        }),
        $push: {
          logs: expect.objectContaining({
            level: "info",
            message: "Job rerun requested and is waiting for browser SharePoint execution"
          })
        }
      })
    );
    expect(mocks.claimNextJob).not.toHaveBeenCalled();
    expect(mocks.setJobStatus).not.toHaveBeenCalled();
    expect(mocks.setJobSucceeded).not.toHaveBeenCalled();
    expect(mocks.setJobFailed).not.toHaveBeenCalled();
  });
});
