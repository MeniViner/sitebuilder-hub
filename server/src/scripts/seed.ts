import dotenv from "dotenv";
import { connectMongo } from "../db/mongo";
import { Release } from "../models/Release";
import { Site } from "../models/Site";
import { applyResolvedSiteBuilderPaths } from "../utils/sitebuilderPaths";
import { buildSiteIdentityKeyFromResolvedPaths } from "../utils/siteIdentity";

dotenv.config();

const now = new Date();

const samples = [
  {
    siteCode: "schedule",
    displayName: "מערכת לו\"ז חטיבתית",
    sharePointSiteUrl: "https://portal.army.idf/sites/schedule",
    finalAppUrl: "https://portal.army.idf/sites/schedule/app",
    siteDbLibrary: "siteDB",
    usersDbLibrary: "siteUsersDb",
    ownerName: "רון כהן",
    ownerPersonalNumber: "s1234567",
    ownerPhone: "050-1111111",
    ownerEmail: "s1234567@army.idf.il",
    unitName: "אג\"ם",
    status: "active",
    version: "0.1.19",
    currentVersion: "0.1.19",
    latestKnownVersion: "0.1.20",
    versionStatus: "outdated",
    storageMb: 392,
    filesCount: 1012,
    adminsCount: 3,
    txtAdmins: [
      { displayName: "רון כהן", personalNumber: "s1234567", email: "s1234567@army.idf.il", loginName: "i:0#.f|membership|s1234567@army.idf.il" }
    ],
    siteCollectionAdmins: [
      { displayName: "רון כהן", personalNumber: "s1234567", email: "s1234567@army.idf.il", loginName: "i:0#.f|membership|s1234567@army.idf.il" },
      { displayName: "דנה לוי", personalNumber: "s2345678", email: "s2345678@army.idf.il", loginName: "i:0#.f|membership|s2345678@army.idf.il" }
    ],
    ownersGroupAdmins: [
      { displayName: "דנה לוי", personalNumber: "s2345678", email: "s2345678@army.idf.il", loginName: "i:0#.f|membership|s2345678@army.idf.il" }
    ],
    adminSyncStatus: "succeeded",
    lastAdminSyncAt: now,
    backupStatus: "succeeded",
    backupCount: 4,
    backupStorageMb: 810,
    lastBackupAt: now,
    lastBackupId: "BKP-schedule-latest",
    lastHealthCheckAt: now,
    health: { siteDbExists: true, usersDbExists: true, distExists: true, indexExists: true, assetsExists: true, txtFilesExist: true, adminsSyncOk: true, permissionsOk: true }
  },
  {
    siteCode: "demo-training",
    displayName: "אתר הדגמות הדרכה",
    sharePointSiteUrl: "https://portal.army.idf/sites/demo-training",
    siteDbLibrary: "siteDB2",
    usersDbLibrary: "siteUsersDb2",
    ownerName: "שירה לוי",
    ownerPersonalNumber: "s7654321",
    ownerPhone: "050-2222222",
    ownerEmail: "s7654321@army.idf.il",
    unitName: "בה\"ד הדרכה",
    status: "warning",
    version: "0.1.20",
    currentVersion: "0.1.20",
    latestKnownVersion: "0.1.20",
    versionStatus: "up_to_date",
    storageMb: 118,
    filesCount: 94,
    adminsCount: 1,
    backupStatus: "failed",
    backupCount: 1,
    backupStorageMb: 120,
    lastBackupId: "BKP-demo-training-1",
    lastHealthCheckAt: now,
    health: { siteDbExists: true, usersDbExists: true, distExists: true, indexExists: true, assetsExists: false, txtFilesExist: true, adminsSyncOk: false, permissionsOk: true }
  }
];

const releases = [
  { version: "0.1.18", releaseType: "patch", notes: "Baseline release", createdBy: "seed" },
  { version: "0.1.19", releaseType: "patch", notes: "Stability fixes", createdBy: "seed" },
  { version: "0.1.20", releaseType: "patch", notes: "Hub compatibility", createdBy: "seed" }
];

async function seed() {
  await connectMongo();

  for (const sample of samples) {
    const resolvedSample = applyResolvedSiteBuilderPaths(sample);
    const siteIdentityKey = buildSiteIdentityKeyFromResolvedPaths(resolvedSample.resolvedPaths);
    await Site.updateOne({ siteIdentityKey }, { $set: { ...resolvedSample, siteIdentityKey } }, { upsert: true });
  }

  for (const rel of releases) {
    await Release.updateOne({ version: rel.version }, { $set: rel }, { upsert: true });
  }

  console.log(`Seed completed: ${samples.length} sites synced, ${releases.length} releases synced`);
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
