import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  Job: {
    create: vi.fn()
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
vi.mock("../server/src/config/env", () => ({
  env: {
    JOB_APPROVAL_TTL_HOURS: 24
  },
  ownerDirectModeEnabled: () => true
}));
vi.mock("../server/src/utils/logger", () => ({ logger: mocks.logger }));

beforeEach(() => {
  mocks.Job.create.mockReset();
  mocks.Job.create.mockImplementation(async (input) => ({ _id: { toString: () => "job-owner-1" }, ...input }));
  mocks.logger.isPayloadLoggingEnabled.mockReturnValue(false);
});

describe("owner-direct jobs", () => {
  it("queues approval-requested jobs without awaiting approval in owner-direct mode", async () => {
    const { createJob } = await import("../server/src/services/jobs.service");

    const job = await createJob({
      type: "deploy",
      createdBy: "SharePoint Owner",
      requiresApproval: true,
      approvalSnapshot: { operation: "deploy" }
    });

    expect(job.requiresApproval).toBe(false);
    expect(job.status).toBe("queued");
    expect(mocks.Job.create.mock.calls[0][0]).toMatchObject({
      requiresApproval: false,
      status: "queued",
      approvalRequestedBy: "",
      approvalSnapshot: {
        operation: "deploy",
        approvalSkipped: true,
        approvalSkippedReason: "owner-direct-mode"
      }
    });
  });
});
