import { beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeError } from "../server/src/utils/errors";

const mocks = vi.hoisted(() => ({
  SiteBackup: {
    findOne: vi.fn()
  },
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    isPayloadLoggingEnabled: vi.fn(() => false)
  }
}));

vi.mock("../server/src/models/SiteBackup", () => ({ SiteBackup: mocks.SiteBackup }));
vi.mock("../server/src/utils/logger", () => ({ logger: mocks.logger }));

const siteId = "665000000000000000000001";
const restoreBackupId = "665000000000000000000201";
const idOf = (value: string) => ({ toString: () => value });

const queryResult = <T>(value: T) => {
  const query: any = {};
  query.sort = vi.fn(() => query);
  query.lean = vi.fn(async () => value);
  query.exec = vi.fn(async () => value);
  query.then = (resolve: (result: T) => unknown, reject: (error: unknown) => unknown) =>
    Promise.resolve(value).then(resolve, reject);
  return query;
};

const excludedBackupIds = (filter: any) => {
  const idFilter = filter?._id || {};
  if (idFilter.$ne) return [idFilter.$ne.toString()];
  if (Array.isArray(idFilter.$nin)) return idFilter.$nin.map((id: unknown) => id?.toString?.() || String(id));
  return [];
};

const makeBackup = (overrides: Record<string, unknown> = {}) => ({
  _id: idOf("665000000000000000000101"),
  siteId,
  backupId: "backup-2026-05-14",
  status: "verified",
  storagePath: "/sites/alpha/siteDB/siteAssets/Backups/backup-2026-05-14",
  filesCount: 2,
  sizeBytes: 2048,
  createdAt: new Date("2026-05-14T10:00:00.000Z"),
  verification: {
    status: "verified",
    checkedAt: new Date("2026-05-14T11:00:00.000Z")
  },
  ...overrides
});

beforeEach(() => {
  mocks.SiteBackup.findOne.mockReset();
  mocks.logger.debug.mockReset();
  mocks.logger.info.mockReset();
  mocks.logger.warn.mockReset();
  mocks.logger.error.mockReset();
});

describe("dangerous write backup safety policy", () => {
  it("returns backup safety metadata for a recent verified backup", async () => {
    const backup = makeBackup();
    const query = queryResult(backup);
    mocks.SiteBackup.findOne.mockReturnValue(query);

    const { assertRecentVerifiedBackupForDangerousWrite } = await import("../server/src/services/writeSafety.service");
    const snapshot = await assertRecentVerifiedBackupForDangerousWrite({
      siteId,
      operation: "deploy",
      now: new Date("2026-05-14T12:00:00.000Z")
    });

    const filter = mocks.SiteBackup.findOne.mock.calls[0][0];
    expect(filter.siteId.toString()).toBe(siteId.toString());
    expect(filter).toMatchObject({
      status: { $in: ["verified", "succeeded"] },
      "verification.status": "verified"
    });
    expect(query.sort).toHaveBeenCalledWith({ "verification.checkedAt": -1, createdAt: -1 });
    expect(snapshot).toMatchObject({
      policy: "recent-verified-backup",
      operation: "deploy",
      required: true,
      satisfied: true,
      maxAgeHours: 24,
      checkedAt: "2026-05-14T12:00:00.000Z",
      backup: {
        id: backup._id.toString(),
        backupId: "backup-2026-05-14",
        status: "verified",
        verificationStatus: "verified",
        storagePath: "/sites/alpha/siteDB/siteAssets/Backups/backup-2026-05-14",
        filesCount: 2,
        sizeBytes: 2048,
        createdAt: "2026-05-14T10:00:00.000Z",
        verificationCheckedAt: "2026-05-14T11:00:00.000Z",
        ageHours: 1
      }
    });
  });

  it("rejects when no verified backup exists for the site", async () => {
    mocks.SiteBackup.findOne.mockReturnValue(queryResult(null));

    const { assertRecentVerifiedBackupForDangerousWrite } = await import("../server/src/services/writeSafety.service");

    await expect(
      assertRecentVerifiedBackupForDangerousWrite({
        siteId,
        operation: "restore",
        now: new Date("2026-05-14T12:00:00.000Z")
      })
    ).rejects.toThrow("dangerous-write-backup-required:restore");
  });

  it("requires pre-restore safety to use a distinct verified backup instead of the backup being restored", async () => {
    mocks.SiteBackup.findOne.mockReturnValue(queryResult(null));

    const { assertDistinctRecentVerifiedBackupForRestore } = await import("../server/src/services/writeSafety.service");

    await expect(
      assertDistinctRecentVerifiedBackupForRestore({
        siteId,
        restoreBackupObjectId: restoreBackupId,
        restoreBackupExternalId: "backup-being-restored",
        now: new Date("2026-05-14T12:00:00.000Z")
      })
    ).rejects.toThrow("pre-restore-backup-required");

    const filter = mocks.SiteBackup.findOne.mock.calls[0][0];
    expect(filter.siteId.toString()).toBe(siteId.toString());
    expect(filter).toMatchObject({
      status: { $in: ["verified", "succeeded"] },
      "verification.status": "verified",
      backupId: { $ne: "backup-being-restored" }
    });
    expect(excludedBackupIds(filter)).toContain(restoreBackupId);
  });

  it("returns pre-restore safety metadata for a distinct recent verified backup", async () => {
    const backup = makeBackup({
      _id: idOf("665000000000000000000301"),
      backupId: "pre-restore-current-state-2026-05-14"
    });
    mocks.SiteBackup.findOne.mockReturnValue(queryResult(backup));

    const { assertDistinctRecentVerifiedBackupForRestore } = await import("../server/src/services/writeSafety.service");
    const snapshot = await assertDistinctRecentVerifiedBackupForRestore({
      siteId,
      restoreBackupObjectId: restoreBackupId,
      restoreBackupExternalId: "backup-being-restored",
      now: new Date("2026-05-14T12:00:00.000Z")
    });

    expect(snapshot).toMatchObject({
      policy: "pre-restore-current-state-backup",
      operation: "restore",
      satisfied: true,
      backup: {
        id: "665000000000000000000301",
        backupId: "pre-restore-current-state-2026-05-14"
      },
      restoreBackup: {
        id: restoreBackupId,
        backupId: "backup-being-restored"
      }
    });
    expect(snapshot.backup?.id).not.toBe(snapshot.restoreBackup?.id);
  });

  it("rejects when the newest verified backup is stale", async () => {
    const backup = makeBackup({
      verification: {
        status: "verified",
        checkedAt: new Date("2026-05-13T11:59:59.000Z")
      }
    });
    mocks.SiteBackup.findOne.mockReturnValue(queryResult(backup));

    const { assertRecentVerifiedBackupForDangerousWrite } = await import("../server/src/services/writeSafety.service");

    await expect(
      assertRecentVerifiedBackupForDangerousWrite({
        siteId,
        operation: "rollback",
        now: new Date("2026-05-14T12:00:00.000Z")
      })
    ).rejects.toThrow("dangerous-write-backup-stale:rollback");
  });
});

describe("dangerous write backup safety error normalization", () => {
  it.each([
    ["dangerous-write-backup-required:deploy", "DANGEROUS_WRITE_BACKUP_REQUIRED"],
    ["dangerous-write-backup-stale:restore", "DANGEROUS_WRITE_BACKUP_STALE"]
  ])("maps %s to a 409 conflict", (message, code) => {
    expect(normalizeError(new Error(message))).toMatchObject({
      code,
      status: 409
    });
  });
});
