import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  Job: {
    find: vi.fn()
  },
  Site: {
    find: vi.fn()
  },
  MonitoringAlert: {
    aggregate: vi.fn(),
    find: vi.fn(),
    findOneAndUpdate: vi.fn(),
    updateMany: vi.fn()
  },
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock("../server/src/models/Job", () => ({ Job: mocks.Job }));
vi.mock("../server/src/models/Site", () => ({ Site: mocks.Site }));
vi.mock("../server/src/models/MonitoringAlert", () => ({ MonitoringAlert: mocks.MonitoringAlert }));
vi.mock("../server/src/config/env", () => ({
  env: {
    MONITORING_STALE_BACKUP_HOURS: 26
  }
}));
vi.mock("../server/src/utils/logger", () => ({ logger: mocks.logger }));

const queryResult = <T>(items: T[]) => {
  const chain = {
    sort: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    lean: vi.fn(async () => items)
  };
  return chain;
};

const findResult = <T>(items: T[]) => {
  const chain = {
    sort: vi.fn(() => chain),
    limit: vi.fn(() => items)
  };
  return chain;
};

const idOf = (value: string) => ({ toString: () => value });

beforeEach(() => {
  mocks.Job.find.mockReset();
  mocks.Site.find.mockReset();
  mocks.MonitoringAlert.aggregate.mockReset();
  mocks.MonitoringAlert.find.mockReset();
  mocks.MonitoringAlert.findOneAndUpdate.mockReset();
  mocks.MonitoringAlert.updateMany.mockReset();
  mocks.logger.debug.mockReset();
  mocks.logger.info.mockReset();
  mocks.logger.warn.mockReset();
  mocks.logger.error.mockReset();
});

describe("monitoring alert derivation", () => {
  it("derives failed job, stale backup, and failed health alerts from persisted state", async () => {
    mocks.Job.find.mockReturnValue(
      queryResult([
        {
          _id: idOf("job-1"),
          type: "deploy",
          status: "failed",
          siteId: idOf("site-1"),
          attempt: 2,
          maxAttempts: 3,
          errorCode: "JOB_FAILED",
          errorMessage: "deploy failed",
          logs: [{ level: "error", message: "deploy failed" }],
          finishedAt: new Date("2026-05-14T08:00:00.000Z")
        }
      ])
    );
    mocks.Site.find.mockReturnValue(
      queryResult([
        {
          _id: idOf("site-1"),
          siteCode: "alpha",
          displayName: "Alpha Site",
          status: "active",
          backupStatus: "succeeded",
          lastBackupAt: new Date("2026-05-12T06:00:00.000Z"),
          lastBackupId: "backup-1",
          backupCount: 1,
          lastHealthCheckAt: new Date("2026-05-14T07:00:00.000Z"),
          health: {
            siteDbExists: true,
            usersDbExists: true,
            distExists: false,
            indexExists: true
          },
          sharePointStatus: { deployStatus: "failed" }
        }
      ])
    );

    const { deriveMonitoringAlerts } = await import("../server/src/services/monitoring.service");
    const alerts = await deriveMonitoringAlerts(new Date("2026-05-14T10:00:00.000Z"));

    expect(alerts.map((alert) => alert.category).sort()).toEqual([
      "failed_health_check",
      "failed_job",
      "stale_backup"
    ]);
    expect(alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fingerprint: "job:failed:job-1",
          severity: "critical",
          category: "failed_job",
          evidence: expect.objectContaining({
            jobId: "job-1",
            siteId: "site-1",
            errorMessage: "deploy failed"
          })
        }),
        expect.objectContaining({
          fingerprint: "site:backup-stale:site-1",
          severity: "warning",
          category: "stale_backup",
          evidence: expect.objectContaining({
            siteCode: "alpha",
            thresholdHours: 26
          })
        }),
        expect.objectContaining({
          fingerprint: "site:health-failed:site-1",
          severity: "critical",
          category: "failed_health_check",
          evidence: expect.objectContaining({
            failedChecks: ["distExists"],
            derivedHealthStatus: "failed"
          })
        })
      ])
    );
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      "monitoring",
      "Critical monitoring alerts detected",
      expect.objectContaining({ criticalCount: 2 })
    );
  });

  it("refreshes active fingerprints and resolves alerts no longer derived", async () => {
    mocks.Job.find.mockReturnValue(queryResult([]));
    mocks.Site.find.mockReturnValue(queryResult([]));
    mocks.MonitoringAlert.updateMany.mockResolvedValue({ modifiedCount: 4 });

    const { refreshMonitoringAlerts } = await import("../server/src/services/monitoring.service");
    const result = await refreshMonitoringAlerts(new Date("2026-05-14T10:00:00.000Z"));

    expect(mocks.MonitoringAlert.findOneAndUpdate).not.toHaveBeenCalled();
    expect(mocks.MonitoringAlert.updateMany).toHaveBeenCalledWith(
      {
        category: { $in: ["failed_job", "stale_backup", "failed_health_check"] },
        status: { $in: ["active", "acknowledged"] }
      },
      {
        $set: {
          status: "resolved",
          resolvedAt: new Date("2026-05-14T10:00:00.000Z")
        }
      }
    );
    expect(result).toMatchObject({
      detected: 0,
      resolved: 4,
      fingerprints: []
    });
  });

  it("maps status=open to active and acknowledged alerts", async () => {
    mocks.MonitoringAlert.find.mockReturnValue(findResult([]));

    const { listMonitoringAlerts } = await import("../server/src/services/monitoring.service");
    await listMonitoringAlerts({ status: "open", severity: "critical" });

    expect(mocks.MonitoringAlert.find).toHaveBeenCalledWith({
      status: { $in: ["active", "acknowledged"] },
      severity: "critical"
    });
  });
});
