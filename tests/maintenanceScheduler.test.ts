import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  Site: {
    find: vi.fn(),
    findByIdAndUpdate: vi.fn()
  },
  Job: {
    findOne: vi.fn()
  },
  enqueueSiteBackup: vi.fn(),
  createJob: vi.fn(),
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
vi.mock("../server/src/services/backups.service", () => ({
  enqueueSiteBackup: mocks.enqueueSiteBackup
}));
vi.mock("../server/src/services/jobs.service", () => ({
  createJob: mocks.createJob
}));
vi.mock("../server/src/config/env", () => ({
  env: {
    MAINTENANCE_SCHEDULER_ENABLED: true,
    MAINTENANCE_SCHEDULER_POLL_MS: 60000,
    MAINTENANCE_SCHEDULER_MAX_SITES_PER_TICK: 25
  },
  ownerDirectModeEnabled: () => false
}));
vi.mock("../server/src/utils/logger", () => ({ logger: mocks.logger }));

const idOf = (value: string) => ({ toString: () => value });

const makeSite = () => ({
  _id: idOf("507f1f77bcf86cd799439011"),
  siteCode: "alpha",
  status: "active",
  maintenanceSchedule: {
    backup: {
      enabled: true,
      intervalMinutes: 120,
      nextRunAt: new Date("2026-05-14T08:00:00.000Z")
    },
    healthCheck: {
      enabled: true,
      intervalMinutes: 30,
      nextRunAt: new Date("2026-05-14T08:45:00.000Z")
    }
  }
});

const mockNoActiveJobs = () => {
  mocks.Job.findOne.mockImplementation(() => ({
    select: () => ({
      lean: async () => null
    })
  }));
};

beforeEach(() => {
  mocks.Site.find.mockReset();
  mocks.Site.findByIdAndUpdate.mockReset();
  mocks.Job.findOne.mockReset();
  mocks.enqueueSiteBackup.mockReset();
  mocks.createJob.mockReset();
  mocks.logger.debug.mockReset();
  mocks.logger.info.mockReset();
  mocks.logger.warn.mockReset();
  mocks.logger.error.mockReset();
  mocks.logger.isPayloadLoggingEnabled.mockReturnValue(false);
});

describe("maintenance scheduler", () => {
  it("queues due scheduled backup approval jobs and read-only health-check jobs", async () => {
    const now = new Date("2026-05-14T09:00:00.000Z");
    const site = makeSite();
    mocks.Site.find.mockReturnValue({
      limit: vi.fn(async () => [site])
    });
    mockNoActiveJobs();
    mocks.enqueueSiteBackup.mockResolvedValue({
      job: { _id: idOf("backup-job-1") },
      requiresApproval: true
    });
    mocks.createJob.mockResolvedValue({
      _id: idOf("health-job-1")
    });

    const { runMaintenanceSchedulerTick } = await import("../server/src/services/maintenanceScheduler.service");
    const result = await runMaintenanceSchedulerTick(now);

    expect(result).toMatchObject({
      dueSites: 1,
      queuedBackups: 1,
      queuedHealthChecks: 1,
      skipped: 0,
      failed: 0
    });
    expect(mocks.enqueueSiteBackup).toHaveBeenCalledWith({
      siteId: "507f1f77bcf86cd799439011",
      createdBy: "scheduler",
      executionContext: "scheduled"
    });
    expect(mocks.createJob).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "health-check",
        siteId: "507f1f77bcf86cd799439011",
        createdBy: "scheduler",
        payload: expect.objectContaining({
          scheduled: true,
          intervalMinutes: 30
        })
      })
    );
    expect(mocks.Site.findByIdAndUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        $set: expect.objectContaining({
          "maintenanceSchedule.backup.nextRunAt": new Date("2026-05-14T11:00:00.000Z"),
          "maintenanceSchedule.backup.lastJobId": "backup-job-1"
        })
      })
    );
    expect(mocks.Site.findByIdAndUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        $set: expect.objectContaining({
          "maintenanceSchedule.healthCheck.nextRunAt": new Date("2026-05-14T09:30:00.000Z"),
          "maintenanceSchedule.healthCheck.lastJobId": "health-job-1"
        })
      })
    );
  });

  it("does not require string-like site ids to be BSON ObjectIds in scheduler tests", async () => {
    const now = new Date("2026-05-14T09:00:00.000Z");
    const site = {
      ...makeSite(),
      _id: idOf("site-alpha"),
      maintenanceSchedule: {
        backup: {
          enabled: false,
          intervalMinutes: 120,
          nextRunAt: new Date("2026-05-14T08:00:00.000Z")
        },
        healthCheck: {
          enabled: true,
          intervalMinutes: 30,
          nextRunAt: new Date("2026-05-14T08:45:00.000Z")
        }
      }
    };
    mocks.Site.find.mockReturnValue({
      limit: vi.fn(async () => [site])
    });
    mockNoActiveJobs();
    mocks.createJob.mockResolvedValue({
      _id: idOf("health-job-1")
    });

    const { runMaintenanceSchedulerTick } = await import("../server/src/services/maintenanceScheduler.service");
    const result = await runMaintenanceSchedulerTick(now);

    expect(result).toMatchObject({
      dueSites: 1,
      queuedBackups: 0,
      queuedHealthChecks: 1,
      skipped: 0,
      failed: 0
    });
    expect(mocks.createJob).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "health-check",
        siteId: "site-alpha",
        createdBy: "scheduler"
      })
    );
    expect(mocks.Site.findByIdAndUpdate).toHaveBeenCalledWith(
      "site-alpha",
      expect.objectContaining({
        $set: expect.objectContaining({
          "maintenanceSchedule.healthCheck.nextRunAt": new Date("2026-05-14T09:30:00.000Z"),
          "maintenanceSchedule.healthCheck.lastJobId": "health-job-1"
        })
      })
    );
  });
});
