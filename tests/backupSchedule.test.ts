import { describe, expect, it } from "vitest";
import { normalizeBackupScheduleInput } from "../server/src/services/backupSchedule.service";

describe("backup schedule normalization", () => {
  it("computes a weekly next-run preview in the requested timezone", () => {
    const schedule = normalizeBackupScheduleInput(
      {
        enabled: true,
        paused: false,
        frequency: "weekly",
        daysOfWeek: [1, 3],
        timeOfDay: "09:30",
        timezone: "UTC",
        retention: { mode: "count-and-days", keepLast: 20, deleteOlderThanDays: 120 }
      },
      { storageBackend: "txt" },
      new Date("2026-07-02T08:00:00.000Z")
    );

    expect(schedule.nextRunAt?.toISOString()).toBe("2026-07-06T09:30:00.000Z");
    expect(schedule.executionMode).toBe("backend-service-auth-required");
    expect(schedule.retention).toMatchObject({
      mode: "count-and-days",
      keepLast: 20,
      deleteOlderThanDays: 120
    });
  });

  it("does not preview a next run while paused", () => {
    const schedule = normalizeBackupScheduleInput(
      {
        enabled: true,
        paused: true,
        frequency: "daily",
        timeOfDay: "02:00",
        timezone: "UTC"
      },
      { storageBackend: "txt" },
      new Date("2026-07-02T08:00:00.000Z")
    );

    expect(schedule.nextRunAt).toBeUndefined();
  });

  it("does not treat Mongo inventory capability as scheduled backup execution capability", () => {
    const schedule = normalizeBackupScheduleInput(
      {
        enabled: true,
        frequency: "daily",
        timeOfDay: "02:00",
        timezone: "UTC"
      },
      {
        storageBackend: "mongo",
        mongoBackendStatus: { backupsStatus: "ok" },
        recoveryState: {
          backupCapability: {
            canInventory: true,
            canRunScheduledBackup: false
          }
        }
      },
      new Date("2026-07-02T08:00:00.000Z")
    );

    expect(schedule.executionMode).toBe("not-configured");
    expect(schedule.nextRunAt?.toISOString()).toBe("2026-07-03T02:00:00.000Z");
  });
});
