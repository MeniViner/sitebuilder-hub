import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildSiteIdentityKey } from "../server/src/utils/siteIdentity";
import { normalizeError } from "../server/src/utils/errors";

const mocks = vi.hoisted(() => ({
  Site: {
    create: vi.fn(),
    findById: vi.fn(),
    findOne: vi.fn()
  },
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock("../server/src/models/Site", () => ({ Site: mocks.Site }));
vi.mock("../server/src/utils/logger", () => ({ logger: mocks.logger }));

const idOf = (value: string) => ({ toString: () => value });

const makeFindOneLean = (value: unknown) => {
  const lean = vi.fn().mockResolvedValue(value);
  mocks.Site.findOne.mockReturnValue({ lean });
  return lean;
};

beforeEach(() => {
  vi.resetModules();
  mocks.Site.create.mockReset();
  mocks.Site.findById.mockReset();
  mocks.Site.findOne.mockReset();
  mocks.logger.debug.mockReset();
  mocks.logger.info.mockReset();
  mocks.logger.warn.mockReset();
  mocks.logger.error.mockReset();
});

describe("site instance identity", () => {
  it("does not use siteCode as the unique site identity", () => {
    const defaultInstance = buildSiteIdentityKey({
      siteCode: "alphateam",
      sharePointSiteUrl: "https://portal.army.idf/sites/alphateam",
      siteDbLibrary: "siteDB",
      usersDbLibrary: "siteUsersDb"
    });
    const secondInstanceOnSameSiteCode = buildSiteIdentityKey({
      siteCode: "alphateam",
      sharePointSiteUrl: "https://portal.army.idf/sites/alphateam",
      siteDbLibrary: "siteDB2",
      usersDbLibrary: "siteUsersDb2"
    });

    expect(secondInstanceOnSameSiteCode).not.toBe(defaultInstance);
  });

  it("includes runtime and Mongo backend identity in the site identity key", () => {
    const firstMongoInstance = buildSiteIdentityKey({
      siteCode: "alphateam",
      sharePointSiteUrl: "https://portal.army.idf/sites/alphateam",
      siteDbLibrary: "siteDB",
      usersDbLibrary: "siteUsersDb",
      runtimeConfigPath: "/sites/alphateam/siteDB/dist/sitebuilder-runtime-config.json",
      storageBackend: "mongo",
      builderSiteId: "alpha",
      mongoSiteId: "alpha",
      safeCollectionName: "site_alpha_a"
    });
    const secondMongoInstance = buildSiteIdentityKey({
      siteCode: "alphateam",
      sharePointSiteUrl: "https://portal.army.idf/sites/alphateam",
      siteDbLibrary: "siteDB",
      usersDbLibrary: "siteUsersDb",
      runtimeConfigPath: "/sites/alphateam/siteDB/dist/sitebuilder-runtime-config.json",
      storageBackend: "mongo",
      builderSiteId: "alpha-2",
      mongoSiteId: "alpha-2",
      safeCollectionName: "site_alpha_b"
    });

    expect(secondMongoInstance).not.toBe(firstMongoInstance);
    expect(firstMongoInstance).toContain("runtimeConfigPath");
    expect(firstMongoInstance).toContain("safeCollectionName");
  });

  it("preserves nested SharePoint site paths in identity", () => {
    const nestedKey = buildSiteIdentityKey({
      siteCode: "subsite",
      sharePointSiteUrl: "https://portal.army.idf/sites/main-site/subsite",
      siteDbLibrary: "siteDB",
      usersDbLibrary: "siteUsersDb"
    });

    expect(nestedKey).toContain("/sites/main-site/subsite");
  });

  it("keeps the same identity for the same SharePoint URL, siteDB, and siteUsersDb even when display code differs", () => {
    const firstKey = buildSiteIdentityKey({
      siteCode: "alphateam",
      sharePointSiteUrl: "https://portal.army.idf/sites/alphateam",
      siteDbLibrary: "siteDB",
      usersDbLibrary: "siteUsersDb"
    });
    const secondKey = buildSiteIdentityKey({
      siteCode: "any-other-label",
      sharePointSiteUrl: "https://portal.army.idf/sites/alphateam",
      siteDbLibrary: "siteDB",
      usersDbLibrary: "siteUsersDb"
    });

    expect(secondKey).toBe(firstKey);
  });
});

describe("sites service identity guard", () => {
  it("allows creating another registry row with the same siteCode when the target data roots differ", async () => {
    makeFindOneLean(null);
    mocks.Site.create.mockImplementation(async (payload) => ({
      _id: idOf("site-2"),
      siteCode: payload.siteCode,
      siteIdentityKey: payload.siteIdentityKey
    }));

    const { createSite } = await import("../server/src/services/sites.service");
    const created = await createSite({
      siteCode: "alphateam",
      displayName: "Alpha Team - second app",
      sharePointSiteUrl: "https://portal.army.idf/sites/alphateam",
      siteDbLibrary: "siteDB2",
      usersDbLibrary: "siteUsersDb2"
    });

    expect(created.siteCode).toBe("alphateam");
    expect(mocks.Site.findOne).toHaveBeenCalledWith(
      { siteIdentityKey: expect.stringContaining("sitedb2") },
      expect.any(Object)
    );
    expect(mocks.Site.create).toHaveBeenCalledWith(expect.objectContaining({
      siteCode: "alphateam",
      siteDbLibrary: "siteDB2",
      usersDbLibrary: "siteUsersDb2",
      siteIdentityKey: expect.stringContaining("siteusersdb2")
    }));
  });

  it("rejects creating the same SharePoint URL, siteDB, and siteUsersDb twice", async () => {
    makeFindOneLean({
      _id: idOf("site-1"),
      siteCode: "alphateam",
      displayName: "Alpha Team",
      sharePointSiteUrl: "https://portal.army.idf/sites/alphateam",
      siteDbLibrary: "siteDB",
      usersDbLibrary: "siteUsersDb"
    });

    const { createSite } = await import("../server/src/services/sites.service");
    await expect(createSite({
      siteCode: "alphateam",
      displayName: "Duplicate Alpha",
      sharePointSiteUrl: "https://portal.army.idf/sites/alphateam",
      siteDbLibrary: "siteDB",
      usersDbLibrary: "siteUsersDb"
    })).rejects.toThrow("site-identity-duplicate");

    expect(mocks.Site.create).not.toHaveBeenCalled();
  });

  it("checks duplicate identity on update while excluding the current document", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const doc = {
      _id: idOf("site-1"),
      siteCode: "alphateam",
      toObject: () => ({
        siteCode: "alphateam",
        displayName: "Alpha Team",
        sharePointSiteUrl: "https://portal.army.idf/sites/alphateam",
        siteDbLibrary: "siteDB",
        usersDbLibrary: "siteUsersDb"
      }),
      set: vi.fn(),
      save
    };
    mocks.Site.findById.mockResolvedValue(doc);
    makeFindOneLean(null);
    save.mockResolvedValue({ _id: idOf("site-1"), siteCode: "alphateam", siteIdentityKey: "key" });

    const { updateSite } = await import("../server/src/services/sites.service");
    await updateSite("site-1", { displayName: "Alpha Team renamed" });

    expect(mocks.Site.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        siteIdentityKey: expect.any(String),
        _id: { $ne: doc._id }
      }),
      expect.any(Object)
    );
    expect(doc.set).toHaveBeenCalledWith(expect.objectContaining({ siteIdentityKey: expect.any(String) }));
    expect(save).toHaveBeenCalled();
  });
});

describe("site identity duplicate errors", () => {
  it("returns a clear Hebrew conflict for duplicate site identities", () => {
    const error = new Error("site-identity-duplicate") as Error & { details?: unknown };
    error.details = { existingSiteId: "site-1" };

    expect(normalizeError(error)).toMatchObject({
      code: "SITE_IDENTITY_DUPLICATE",
      status: 409,
      details: { existingSiteId: "site-1" }
    });
  });

  it("explains when the old unique siteCode index is still active", () => {
    const error = new Error("E11000 duplicate key error") as Error & { keyPattern?: Record<string, number> };
    error.keyPattern = { siteCode: 1 };

    expect(normalizeError(error)).toMatchObject({
      code: "LEGACY_SITE_CODE_INDEX_CONFLICT",
      status: 409
    });
  });
});
