import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordBrowserAdminLiveReadEvidence: vi.fn(),
  writeAuditLog: vi.fn(),
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    isPayloadLoggingEnabled: vi.fn(() => false)
  }
}));

vi.mock("../server/src/services/admins.service", () => ({
  recordBrowserAdminLiveReadEvidence: mocks.recordBrowserAdminLiveReadEvidence
}));
vi.mock("../server/src/services/audit.service", () => ({
  writeAuditLog: mocks.writeAuditLog
}));
vi.mock("../server/src/utils/logger", () => ({ logger: mocks.logger }));

beforeEach(() => {
  vi.resetModules();
  mocks.recordBrowserAdminLiveReadEvidence.mockReset();
  mocks.writeAuditLog.mockReset();
});

describe("browser admin evidence controller", () => {
  it("persists evidence and writes an audit log without calling the backend live-read endpoint", async () => {
    mocks.recordBrowserAdminLiveReadEvidence.mockResolvedValue({
      siteId: "site-1",
      siteCode: "schedule",
      connectorMode: "browser-sharepoint",
      capturedAt: "2026-06-17T08:00:00.000Z",
      liveRead: {
        sourceStatus: [
          { source: "txt", ok: true, status: "success" },
          { source: "siteCollection", ok: false, status: "failed" }
        ]
      },
      summary: {
        adminSyncStatus: "failed",
        adminsCount: 1
      },
      snapshot: { _id: { toString: () => "snapshot-1" } }
    });

    const { browserLiveReadEvidenceEndpoint } = await import("../server/src/controllers/admins.controller");
    const status = vi.fn().mockReturnThis();
    const json = vi.fn().mockReturnThis();
    await browserLiveReadEvidenceEndpoint(
      {
        params: { id: "site-1" },
        body: {
          connectorMode: "browser-sharepoint",
          targetSiteUrl: "https://portal.army.idf/sites/schedule",
          sourceStatus: [{ source: "txt", status: "success", ok: true, count: 1 }],
          txtAdmins: [{ displayName: "Txt Admin", email: "txt@example.test" }]
        },
        user: { name: "Owner", role: "admin" },
        requestId: "req-1"
      } as any,
      { status, json } as any
    );

    expect(mocks.recordBrowserAdminLiveReadEvidence).toHaveBeenCalledWith(expect.objectContaining({
      siteId: "site-1",
      actor: "Owner",
      input: expect.objectContaining({ connectorMode: "browser-sharepoint" })
    }));
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "admins.browser-live-read-evidence",
      entityType: "Site",
      entityId: "site-1",
      metadata: expect.objectContaining({
        connectorMode: "browser-sharepoint",
        snapshotId: "snapshot-1",
        failedSources: ["siteCollection"]
      })
    }));
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
  });
});
