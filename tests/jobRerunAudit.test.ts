import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runJobNow: vi.fn(),
  writeAuditLog: vi.fn(),
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    isPayloadLoggingEnabled: vi.fn(() => false)
  }
}));

vi.mock("../server/src/services/jobs.worker", () => ({
  runJobNow: mocks.runJobNow
}));

vi.mock("../server/src/services/audit.service", () => ({
  writeAuditLog: mocks.writeAuditLog
}));

vi.mock("../server/src/utils/logger", () => ({ logger: mocks.logger }));

const idOf = (value: string) => ({ toString: () => value });

const makeResponse = () => {
  const res = {
    status: vi.fn(),
    json: vi.fn()
  };
  res.status.mockReturnValue(res);
  return res;
};

beforeEach(() => {
  vi.resetModules();
  mocks.runJobNow.mockReset();
  mocks.writeAuditLog.mockReset();
  mocks.logger.warn.mockReset();
  mocks.logger.error.mockReset();
});

describe("job rerun audit trail", () => {
  it("records rerun reason and job context in audit metadata", async () => {
    const job = {
      _id: idOf("job-rerun-1"),
      type: "deploy",
      siteId: idOf("site-1"),
      status: "queued"
    };
    mocks.runJobNow.mockResolvedValue(job);
    mocks.writeAuditLog.mockResolvedValue({ _id: idOf("audit-1") });

    const { rerunJob } = await import("../server/src/controllers/jobs.controller");
    const req = {
      params: { id: "job-rerun-1" },
      body: { reason: "Retry after SharePoint digest was refreshed" },
      requestId: "req-1",
      user: { id: "pn:s1234567", name: "Admin s1234567", role: "admin" }
    } as any;
    const res = makeResponse() as any;

    await rerunJob(req, res);

    expect(mocks.runJobNow).toHaveBeenCalledWith("job-rerun-1");
    expect(mocks.writeAuditLog).toHaveBeenCalledWith({
      req,
      action: "jobs.rerun",
      entityType: "Job",
      entityId: "job-rerun-1",
      metadata: {
        jobId: "job-rerun-1",
        type: "deploy",
        siteId: "site-1",
        reason: "Retry after SharePoint digest was refreshed",
        status: "queued"
      }
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true, data: job });
  });
});
