import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  AuditLog: {
    create: vi.fn(),
    find: vi.fn(),
    countDocuments: vi.fn()
  },
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    isPayloadLoggingEnabled: vi.fn(() => false)
  }
}));

vi.mock("../server/src/models/AuditLog", () => ({ AuditLog: mocks.AuditLog }));
vi.mock("../server/src/utils/logger", () => ({ logger: mocks.logger }));

describe("audit reporting helpers", () => {
  it("builds escaped filters for fields, date range, actor, and broad search", async () => {
    const { buildAuditFilter } = await import("../server/src/services/audit.service");

    const filter = buildAuditFilter({
      action: "jobs.approve",
      entityType: "Job",
      entityId: "job-1",
      result: "success",
      actor: "Alice.Admin+1",
      search: "request[42]",
      from: "2026-05-14T08:00:00.000Z",
      to: "2026-05-14T09:00:00.000Z"
    });

    expect(filter).toMatchObject({
      action: "jobs.approve",
      entityType: "Job",
      entityId: "job-1",
      result: "success",
      createdAt: {
        $gte: new Date("2026-05-14T08:00:00.000Z"),
        $lte: new Date("2026-05-14T09:00:00.000Z")
      }
    });
    expect(filter.$and).toHaveLength(2);
    expect(String(filter.$and?.[0].$or?.[0]["actor.userId"])).toBe("/Alice\\.Admin\\+1/i");
    expect(String(filter.$and?.[1].$or?.[0].requestId)).toBe("/request\\[42\\]/i");
  });

  it("treats date-only ranges as whole UTC days", async () => {
    const { buildAuditFilter } = await import("../server/src/services/audit.service");

    const filter = buildAuditFilter({
      startDate: "2026-05-14",
      endDate: "2026-05-15"
    });

    expect(filter.createdAt).toEqual({
      $gte: new Date("2026-05-14T00:00:00.000Z"),
      $lte: new Date("2026-05-15T23:59:59.999Z")
    });
  });

  it("escapes CSV values including quotes, newlines, JSON, and spreadsheet formulas", async () => {
    const { auditRowsToCsv, escapeCsvValue } = await import("../server/src/services/audit.service");

    expect(escapeCsvValue('Alice, "Admin"')).toBe('"Alice, ""Admin"""');
    expect(escapeCsvValue("=cmd|'/C calc'!A0")).toBe("'=cmd|'/C calc'!A0");

    const csv = auditRowsToCsv([
      {
        _id: { toString: () => "audit-1" },
        createdAt: new Date("2026-05-14T08:00:00.000Z"),
        requestId: "req-1",
        actor: { userId: "u1", userName: "Alice\nAdmin", role: "admin" },
        action: "jobs.approve",
        entityType: "Job",
        entityId: "job-1",
        result: "success",
        metadata: { reason: "ok" },
        before: { status: "awaiting-approval" },
        after: { status: "queued" }
      }
    ]);

    expect(csv.split("\r\n")[0]).toContain("actorUserName");
    expect(csv).toContain('"Alice\nAdmin"');
    expect(csv).toContain('"{""reason"":""ok""}"');
  });

  it("summarizes audit rows by result, action, entity type, actor, and day", async () => {
    const { summarizeAuditRows } = await import("../server/src/services/audit.service");

    const summary = summarizeAuditRows([
      {
        createdAt: new Date("2026-05-14T08:00:00.000Z"),
        actor: { userName: "Alice" },
        action: "jobs.approve",
        entityType: "Job",
        result: "success"
      },
      {
        createdAt: new Date("2026-05-14T08:15:00.000Z"),
        actor: { userName: "Alice" },
        action: "jobs.approve",
        entityType: "Job",
        result: "failure"
      },
      {
        createdAt: new Date("2026-05-15T08:15:00.000Z"),
        actor: { userName: "Bob" },
        action: "backups.run-site",
        entityType: "Site",
        result: "success"
      }
    ]);

    expect(summary).toMatchObject({
      totalRows: 3,
      firstSeenAt: "2026-05-14T08:00:00.000Z",
      lastSeenAt: "2026-05-15T08:15:00.000Z",
      byResult: [
        { key: "success", count: 2 },
        { key: "failure", count: 1 }
      ],
      byAction: [
        { key: "jobs.approve", count: 2 },
        { key: "backups.run-site", count: 1 }
      ],
      byEntityType: [
        { key: "Job", count: 2 },
        { key: "Site", count: 1 }
      ],
      byActor: [
        { key: "Alice", count: 2 },
        { key: "Bob", count: 1 }
      ],
      byDay: [
        { key: "2026-05-14", count: 2 },
        { key: "2026-05-15", count: 1 }
      ]
    });
  });
});
