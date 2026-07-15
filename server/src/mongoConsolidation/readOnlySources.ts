import fs from "node:fs";
import path from "node:path";
import { Db, MongoClient } from "mongodb";
import { AuditSnapshot, BuilderSiteSnapshot, HubSiteSnapshot, PhysicalCollectionSnapshot, ReconciliationSnapshot, RevisionSnapshot, RuntimeConfigSnapshot } from "./types";

export const createReadOnlyMongoClient = (uri: string) => new MongoClient(uri, { retryWrites: false, autoSelectFamily: true });

const asString = (value: unknown) => typeof value === "string" ? value.trim() : "";
const safeOrigin = (value: string) => {
  try { const url = new URL(value); return `${url.protocol}//${url.host}`; } catch { return value ? "[invalid-url]" : ""; }
};

export async function collectHubSnapshot(db: Db, siteFilter?: string): Promise<HubSiteSnapshot[]> {
  const filter = siteFilter ? { $or: [{ siteCode: siteFilter }, { builderSiteId: siteFilter }, { mongoSiteId: siteFilter }, { "runtimeConfigStatus.builderSiteId": siteFilter }] } : {};
  const rows = await db.collection("sites").find(filter, { projection: {
    _id: 1, siteIdentityKey: 1, siteCode: 1, builderSiteId: 1, mongoSiteId: 1, safeCollectionName: 1, mongoDatabase: 1,
    storageBackend: 1, status: 1, lifecycleStatus: 1, sharePointSiteUrl: 1, runtimeConfigStatus: 1, mongoBackendStatus: 1, siteDataBinding: 1
  } }).toArray();
  return rows.map((row) => ({ ...row, _id: String(row._id) })) as unknown as HubSiteSnapshot[];
}

const invalidVersionQuery = { $or: [
  { version: { $exists: false } },
  { $expr: { $cond: [
    { $isNumber: "$version" },
    { $or: [{ $lt: ["$version", 1] }, { $ne: ["$version", { $trunc: "$version" }] }] },
    true
  ] } }
] };
const invalidDeletedAtQuery = { $expr: { $and: [
  { $ne: [{ $type: "$deletedAt" }, "missing"] }, { $ne: ["$deletedAt", null] }, { $ne: [{ $type: "$deletedAt" }, "date"] }
] } };
const malformedIdQuery = { $expr: { $ne: [
  { $convert: { input: "$_id", to: "string", onError: "[invalid]", onNull: "[missing]" } },
  { $concat: [
    { $convert: { input: "$scope", to: "string", onError: "", onNull: "" } }, ":",
    { $convert: { input: "$entityId", to: "string", onError: "", onNull: "" } }
  ] }
] } };

async function collectPhysical(db: Db, collectionNames: Set<string>, registry: BuilderSiteSnapshot[]): Promise<PhysicalCollectionSnapshot[]> {
  const byCollection = new Map(registry.filter((row) => row.safeCollectionName).map((row) => [asString(row.safeCollectionName), asString(row.siteId)]));
  const globalCollections = new Set(["sites", "site_data_revisions", "site_data_audit_logs"]);
  const candidates = new Set([...byCollection.keys(), ...[...collectionNames].filter((name) => /^(?:site|test_site)_/.test(name) && !globalCollections.has(name))]);
  const output: PhysicalCollectionSnapshot[] = [];
  for (const name of candidates) {
    const registrySiteId = byCollection.get(name);
    if (!collectionNames.has(name)) {
      output.push({ name, registrySiteId, exists: false, documentCount: 0, wrongSiteDocuments: 0, invalidVersions: 0, invalidDeletedAt: 0, malformedIds: 0, oversizedBackups: 0, criticalBackups: 0, unknownScopes: [], scopes: {}, duplicateLogicalDocuments: 0 });
      continue;
    }
    const collection = db.collection(name);
    const [documentCount, wrongSiteDocuments, invalidVersions, invalidDeletedAt, malformedIds, scopes, duplicates, sizes] = await Promise.all([
      collection.countDocuments({}),
      registrySiteId ? collection.countDocuments({ siteId: { $ne: registrySiteId } }) : Promise.resolve(0),
      collection.countDocuments(invalidVersionQuery), collection.countDocuments(invalidDeletedAtQuery), collection.countDocuments(malformedIdQuery),
      collection.aggregate<{ _id: string; count: number }>([{ $group: { _id: "$scope", count: { $sum: 1 } } }]).toArray(),
      collection.aggregate<{ count: number }>([{ $group: { _id: { siteId: "$siteId", scope: "$scope", entityId: "$entityId" }, count: { $sum: 1 } } }, { $match: { count: { $gt: 1 } } }]).toArray(),
      collection.aggregate<{ warning: number; critical: number }>([
        { $match: { scope: "backups" } }, { $project: { size: { $bsonSize: "$$ROOT" } } },
        { $group: { _id: null, warning: { $sum: { $cond: [{ $gte: ["$size", 8 * 1024 * 1024] }, 1, 0] } }, critical: { $sum: { $cond: [{ $gte: ["$size", 14 * 1024 * 1024] }, 1, 0] } } } }
      ]).toArray()
    ]);
    const scopeMap = Object.fromEntries(scopes.map((row) => [asString(row._id) || "[missing]", row.count]));
    output.push({ name, registrySiteId, exists: true, documentCount, wrongSiteDocuments, invalidVersions, invalidDeletedAt, malformedIds,
      oversizedBackups: sizes[0]?.warning || 0, criticalBackups: sizes[0]?.critical || 0,
      unknownScopes: Object.keys(scopeMap), scopes: scopeMap, duplicateLogicalDocuments: duplicates.length });
  }
  return output;
}

export async function collectBuilderSnapshot(db: Db): Promise<Pick<ReconciliationSnapshot, "builderSites" | "physicalCollections" | "revisions" | "audits">> {
  const collectionNames = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((item) => item.name));
  const builderSites = collectionNames.has("sites")
    ? await db.collection<BuilderSiteSnapshot>("sites").find({}, { projection: { _id: 0, siteId: 1, safeCollectionName: 1, siteSlug: 1, status: 1, schemaVersion: 1 } }).toArray()
    : [];
  const physicalCollections = await collectPhysical(db, collectionNames, builderSites);
  const revisions = collectionNames.has("site_data_revisions")
    ? await db.collection<RevisionSnapshot>("site_data_revisions").find({}, { projection: { _id: 0, siteId: 1, collectionName: 1, documentKey: 1, operation: 1, previousVersion: 1, nextVersion: 1 } }).toArray()
    : [];
  const audits = collectionNames.has("site_data_audit_logs")
    ? await db.collection<AuditSnapshot>("site_data_audit_logs").find({}, { projection: { _id: 0, siteId: 1, documentKey: 1, operation: 1 } }).toArray()
    : [];
  const missingCache = new Map<string, Set<string>>();
  for (const collectionName of new Set(revisions.map((row) => row.collectionName).filter(Boolean) as string[])) {
    const keys = [...new Set(revisions.filter((row) => row.collectionName === collectionName).map((row) => row.documentKey).filter(Boolean) as string[])];
    if (!collectionNames.has(collectionName)) { missingCache.set(collectionName, new Set(keys)); continue; }
    const found = await db.collection<{ _id: string }>(collectionName).find({ _id: { $in: keys } }, { projection: { _id: 1 } }).toArray();
    const foundKeys = new Set(found.map((row) => String(row._id)));
    missingCache.set(collectionName, new Set(keys.filter((key) => !foundKeys.has(key))));
  }
  revisions.forEach((row) => { row.physicalDocumentMissing = Boolean(row.collectionName && row.documentKey && missingCache.get(row.collectionName)?.has(row.documentKey)); });
  return { builderSites, physicalCollections, revisions, audits };
}

function walk(root: string, output: string[]) {
  if (!fs.existsSync(root)) return;
  const stat = fs.lstatSync(root);
  if (stat.isSymbolicLink()) return;
  if (stat.isFile()) { output.push(root); return; }
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (["node_modules", ".git", "dist"].includes(entry.name)) continue;
    walk(path.join(root, entry.name), output);
  }
}

export function collectRuntimeConfigs(roots: string[]): RuntimeConfigSnapshot[] {
  const files: string[] = [];
  roots.forEach((root) => walk(path.resolve(root), files));
  return files.filter((file) => ["sitebuilder-runtime-config.json", "runtime-config.json"].includes(path.basename(file))).map((file) => {
    try {
      const value = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
      const backendUrl = asString(value.backendApiUrl || value.apiBaseUrl);
      return { path: file, siteId: asString(value.siteId || value.builderSiteId), storageBackend: asString(value.storageBackend), backendUrl,
        backendOrigin: safeOrigin(backendUrl), deploymentUrl: asString(value.deploymentUrl || value.siteUrl), apiVersion: asString(value.apiVersion), schemaVersion: asString(value.schemaVersion || value.runtimeConfigSchemaVersion) };
    } catch { return { path: file, parseError: "invalid-json" }; }
  });
}
