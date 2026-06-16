import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  Job: {
    create: vi.fn(),
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn()
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
    JOB_APPROVAL_TTL_HOURS: 2
  },
  ownerDirectModeEnabled: () => false
}));
vi.mock("../server/src/utils/logger", () => ({ logger: mocks.logger }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-14T09:00:00.000Z"));
  mocks.Job.create.mockReset();
  mocks.Job.findById.mockReset();
  mocks.Job.findByIdAndUpdate.mockReset();
  mocks.Job.create.mockImplementation(async (input) => ({ _id: { toString: () => "job-1" }, ...input }));
  mocks.logger.isPayloadLoggingEnabled.mockReturnValue(false);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("job approval TTL defaults", () => {
  it("sets a default expiry for approval-gated jobs from env", async () => {
    const { createJob } = await import("../server/src/services/jobs.service");

    await createJob({
      type: "restore",
      createdBy: "operator",
      requiresApproval: true
    });

    const input = mocks.Job.create.mock.calls[0][0];
    expect(input).toMatchObject({
      type: "restore",
      createdBy: "operator",
      status: "awaiting-approval",
      requiresApproval: true,
      approvalRequestedBy: "operator"
    });
    expect(input.approvalExpiresAt).toEqual(new Date("2026-05-14T11:00:00.000Z"));
  });

  it("preserves explicit approval expiry and leaves non-approval jobs without expiry", async () => {
    const explicitExpiry = new Date("2026-05-14T10:15:00.000Z");
    const { createJob } = await import("../server/src/services/jobs.service");

    await createJob({
      type: "repair",
      createdBy: "operator",
      requiresApproval: true,
      approvalExpiresAt: explicitExpiry
    });
    await createJob({
      type: "backup",
      createdBy: "operator"
    });

    expect(mocks.Job.create.mock.calls[0][0].approvalExpiresAt).toBe(explicitExpiry);
    expect(mocks.Job.create.mock.calls[1][0].approvalExpiresAt).toBeUndefined();
  });

  it("allows self-approval for approval-gated jobs and logs the same actor decision", async () => {
    const pendingJob = {
      _id: { toString: () => "job-self-1" },
      type: "backup",
      status: "awaiting-approval",
      requiresApproval: true,
      createdBy: "Operator One",
      approvalRequestedBy: "Operator One"
    };
    const updatedJob = { ...pendingJob, status: "queued", approvedBy: "Operator One" };
    mocks.Job.findById.mockResolvedValue(pendingJob);
    mocks.Job.findByIdAndUpdate.mockResolvedValue(updatedJob);

    const { approveJob } = await import("../server/src/services/jobs.service");
    await expect(approveJob("job-self-1", "Operator One", "looks good")).resolves.toBe(updatedJob);

    expect(mocks.Job.findByIdAndUpdate).toHaveBeenCalledWith(
      "job-self-1",
      expect.objectContaining({
        $set: expect.objectContaining({
          status: "queued",
          approvedBy: "Operator One",
          approvalDecisionReason: "looks good"
        })
      }),
      { new: true }
    );
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      "security",
      "Job self-approval accepted",
      expect.objectContaining({
        jobId: "job-self-1",
        type: "backup",
        matchedBy: "name"
      })
    );
  });

  it("allows another admin to approve and records approver identity", async () => {
    const pendingJob = {
      _id: { toString: () => "job-approve-1" },
      type: "restore",
      status: "awaiting-approval",
      requiresApproval: true,
      createdBy: "Operator One",
      approvalRequestedBy: "Operator One",
      siteId: { toString: () => "site-1" }
    };
    const updatedJob = { ...pendingJob, status: "queued", approvedBy: "Admin Two" };
    mocks.Job.findById.mockResolvedValue(pendingJob);
    mocks.Job.findByIdAndUpdate.mockResolvedValue(updatedJob);

    const { approveJobWithActor } = await import("../server/src/services/jobs.service");
    await expect(
      approveJobWithActor("job-approve-1", { name: "Admin Two", id: "pn:s2222222" }, "approved by another admin")
    ).resolves.toBe(updatedJob);

    expect(mocks.Job.findByIdAndUpdate).toHaveBeenCalledWith(
      "job-approve-1",
      expect.objectContaining({
        $set: expect.objectContaining({
          status: "queued",
          approvedBy: "Admin Two",
          approvedById: "pn:s2222222",
          approvalResult: expect.objectContaining({
            decision: "approved",
            decidedBy: "Admin Two",
            decidedById: "pn:s2222222"
          })
        })
      }),
      { new: true }
    );
  });
});
