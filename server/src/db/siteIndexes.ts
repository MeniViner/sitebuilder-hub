import { Site } from "../models/Site";
import { buildSiteIdentityKey } from "../utils/siteIdentity";
import { logger } from "../utils/logger";

const LEGACY_SITE_CODE_INDEX = "siteCode_1";
const SITE_IDENTITY_INDEX = "siteIdentityKey_1";

type MongoIndex = {
  name?: string;
  unique?: boolean;
};

const backfillSiteIdentityKeys = async () => {
  const existingKeyRows = await Site.find(
    { siteIdentityKey: { $exists: true, $type: "string" } },
    { siteIdentityKey: 1 }
  ).lean<Array<{ siteIdentityKey?: string }>>();
  const reservedKeys = new Set(existingKeyRows.map((row) => row.siteIdentityKey).filter(Boolean));

  const sites = await Site.find(
    { $or: [{ siteIdentityKey: { $exists: false } }, { siteIdentityKey: "" }] },
    {
      _id: 1,
      siteCode: 1,
      sharePointHost: 1,
      sharePointSiteUrl: 1,
      siteDbLibrary: 1,
      usersDbLibrary: 1,
      bootstrapLibrary: 1,
      bootstrapFolder: 1,
      widgetsDbTarget: 1
    }
  ).lean<
    Array<{
      _id: unknown;
      siteCode?: string;
      sharePointHost?: string;
      sharePointSiteUrl?: string;
      siteDbLibrary?: string;
      usersDbLibrary?: string;
      bootstrapLibrary?: string;
      bootstrapFolder?: string;
      widgetsDbTarget?: string;
    }>
  >();

  for (const site of sites) {
    try {
      const siteIdentityKey = buildSiteIdentityKey({
        siteCode: site.siteCode,
        sharePointHost: site.sharePointHost,
        sharePointSiteUrl: site.sharePointSiteUrl,
        siteDbLibrary: site.siteDbLibrary,
        usersDbLibrary: site.usersDbLibrary,
        bootstrapLibrary: site.bootstrapLibrary,
        bootstrapFolder: site.bootstrapFolder,
        widgetsDbTarget: site.widgetsDbTarget
      });

      if (reservedKeys.has(siteIdentityKey)) {
        logger.warn("db", "Skipping duplicate site identity key backfill", {
          siteId: String(site._id),
          siteCode: site.siteCode,
          siteIdentityKey
        });
        continue;
      }

      await Site.updateOne({ _id: site._id }, { $set: { siteIdentityKey } });
      reservedKeys.add(siteIdentityKey);
    } catch (error) {
      logger.warn("db", "Failed to backfill site identity key", {
        siteId: String(site._id),
        siteCode: site.siteCode,
        error
      });
    }
  }
};

export const ensureSiteIndexes = async () => {
  const indexes = (await Site.collection.indexes()) as MongoIndex[];
  const legacySiteCodeIndex = indexes.find((index) => index.name === LEGACY_SITE_CODE_INDEX && index.unique);

  if (legacySiteCodeIndex) {
    logger.warn("db", "Dropping legacy unique siteCode index; siteCode is no longer globally unique");
    await Site.collection.dropIndex(LEGACY_SITE_CODE_INDEX);
  }

  await backfillSiteIdentityKeys();

  await Site.collection.createIndex({ siteCode: 1 }, { name: LEGACY_SITE_CODE_INDEX });
  await Site.collection.createIndex(
    { siteIdentityKey: 1 },
    { name: SITE_IDENTITY_INDEX, unique: true, partialFilterExpression: { siteIdentityKey: { $exists: true } } }
  );
};
