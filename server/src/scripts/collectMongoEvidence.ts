/**
 * Offline-bundle Mongo reader.  It deliberately exposes no mutation CLI: the
 * only input is MONGODB_URI in process environment and the only output is a
 * sanitized JSON file supplied by --output.
 */
import fs from "node:fs";
import path from "node:path";
import { MongoClient } from "mongodb";
import { collectBuilderSnapshot, collectHubSnapshot } from "../mongoConsolidation/readOnlySources";

const args = process.argv.slice(2);
const value = (name: string, fallback = "") => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1] || fallback; };
const output = value("--output");
const hubDatabase = value("--hub-db", "sitebuilder_hub");
const builderDatabase = value("--builder-db", "sitebuilder_site_data");
const uri = process.env.MONGODB_URI || "";

const fail = (code: string) => { console.error(`Mongo evidence reader failed: ${code}`); process.exitCode = 30; };
const safeTopology = async (client: MongoClient) => {
  const admin = client.db("admin");
  const [hello, build, fcv, cmd, status, rw] = await Promise.all([
    admin.command({ hello: 1 }), admin.command({ buildInfo: 1 }), admin.command({ getParameter: 1, featureCompatibilityVersion: 1 }),
    admin.command({ getCmdLineOpts: 1 }).catch(() => ({ ok: 0 })), admin.command({ serverStatus: 1 }), admin.command({ getDefaultRWConcern: 1 }).catch(() => ({ ok: 0 }))
  ]);
  const replica = hello.setName ? await admin.command({ replSetGetStatus: 1 }).catch(() => ({ ok: 0, members: [] })) : null;
  const parsed = (cmd as any).parsed || {}, security = parsed.security || {}, net = parsed.net || parsed.ssl || {};
  return { version: (build as any).version || "unknown", fcv: (fcv as any).featureCompatibilityVersion || "unknown",
    authenticationEnabled: (cmd as any).ok ? security.authorization === "enabled" : "unknown",
    tlsEnabled: (cmd as any).ok ? Boolean((net.tls && net.tls.mode && net.tls.mode !== "disabled") || (net.ssl && net.ssl.mode && net.ssl.mode !== "disabled")) : "unknown",
    network: { bindIp: net.bindIp || net.bindIpAll || "", port: net.port || 27017 },
    storage: { engine: (status as any).storageEngine?.name || "unknown", persistent: (status as any).storageEngine?.persistent ?? "unknown", supportsCommittedReads: (status as any).storageEngine?.supportsCommittedReads ?? "unknown" },
    defaultReadConcern: (rw as any).ok ? (rw as any).defaultReadConcern || {} : "unknown", defaultWriteConcern: (rw as any).ok ? (rw as any).defaultWriteConcern || {} : "unknown",
    topology: { kind: (hello as any).msg === "isdbgrid" ? "sharded" : (hello as any).setName ? "replica-set" : "standalone", setName: (hello as any).setName || "", isWritablePrimary: Boolean((hello as any).isWritablePrimary), replicationHealthy: replica?.ok ? !(replica.members || []).some((m: any) => m.health !== 1) : (hello as any).setName ? "unknown" : "not-applicable", members: replica?.ok ? (replica.members || []).map((m: any, i: number) => ({ alias: `member-${i + 1}`, state: m.stateStr, health: m.health })) : [] }
  };
};

async function main() {
  if (!output || !uri) return fail(!output ? "missing-output" : "missing-mongodb-uri");
  const client = new MongoClient(uri, { retryWrites: false, autoSelectFamily: true });
  try {
    await client.connect();
    const admin = client.db("admin"), topology = await safeTopology(client);
    const databases = await admin.admin().listDatabases({ nameOnly: false }).then(async ({ databases }) => Promise.all(databases.map(async (entry) => {
      const db = client.db(entry.name), infos = await db.listCollections().toArray();
      const collections = await Promise.all(infos.map(async (info) => { const stats = await db.command({ collStats: info.name }).catch(() => ({})); return { name: info.name, options: (info as any).options || {}, count: await db.collection(info.name).countDocuments({}), logicalSizeBytes: (stats as any).size || 0, storageSizeBytes: (stats as any).storageSize || 0, indexes: await db.collection(info.name).indexes(), maxObservedBsonBytes: null, earliestTimestamp: null, latestTimestamp: null, fullBsonScanPerformed: false }; }));
      return { name: entry.name, sizeOnDisk: entry.sizeOnDisk, collections };
    })));
    const [hubSites, builder] = await Promise.all([collectHubSnapshot(client.db(hubDatabase)), collectBuilderSnapshot(client.db(builderDatabase))]);
    const mappingInput = { hubSites, registry: builder.builderSites, physical: builder.physicalCollections, orphanPhysical: builder.physicalCollections.filter((item) => !item.registrySiteId).map((item) => item.name), revisionAggregates: [], auditAggregates: [] };
    const record = { available: true, ...topology, databases, connection: { authenticationConfigured: /^(mongodb(?:\+srv)?:\/\/[^/@]+@)/.test(uri), tlsConfigured: /^mongodb\+srv:/i.test(uri) || /[?&](tls|ssl)=(true|1)/i.test(uri) }, mappingInput, reconciliationSnapshot: { hubSites, builderSites: builder.builderSites, physicalCollections: builder.physicalCollections, revisions: builder.revisions, audits: builder.audits, runtimeConfigs: [], revisionAggregates: [], auditAggregates: [] } };
    fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
    fs.writeFileSync(path.resolve(output), JSON.stringify(record, null, 2) + "\n", "utf8");
  } catch { fail("source-inaccessible"); } finally { process.env.MONGODB_URI = ""; await client.close().catch(() => undefined); }
}
void main();
