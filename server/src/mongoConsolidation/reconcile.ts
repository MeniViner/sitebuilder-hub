import { normalizeSiteDataBinding, siteDataBindingSchema } from "../contracts/siteDataBinding";
import { ReconciliationReport, ReconciliationRow, ReconciliationSnapshot } from "./types";
import { reconciliationFindingExitCode } from "./exitCodes";

const KNOWN_SCOPES = new Set(["admins", "backups", "events", "externalLinks", "gantt", "navigation", "siteContent", "theme", "widgets"]);
const stringValue = (value: unknown) => typeof value === "string" ? value.trim() : "";
const nested = (value: unknown, key: string) => value && typeof value === "object" ? stringValue((value as Record<string, unknown>)[key]) : "";
const counts = (values: string[]) => values.reduce((map, value) => value ? map.set(value, (map.get(value) || 0) + 1) : map, new Map<string, number>());
const duplicate = (map: Map<string, number>, value: string) => Boolean(value && (map.get(value) || 0) > 1);

const safeOrigin = (value: string) => {
  if (!value) return { origin: "", unsafe: false };
  try {
    const url = new URL(value);
    return { origin: url.origin, unsafe: Boolean(url.username || url.password || url.search || url.hash) };
  } catch { return { origin: "[invalid-url]", unsafe: true }; }
};
const safeTechnicalUrl = (value: string) => {
  if (!value) return "";
  try { const url = new URL(value); return `${url.origin}${url.pathname}`; } catch { return "[invalid-url]"; }
};

export function reconcileSnapshot(snapshot: ReconciliationSnapshot, generatedAt = new Date().toISOString()): ReconciliationReport {
  const findings: ReconciliationReport["findings"] = [];
  const add = (severity: "info" | "warning" | "blocker", code: string, subject: string, message: string) => findings.push({ severity, code, subject, message });
  const hubIdentityCounts = counts(snapshot.hubSites.map((site) => stringValue(site.siteIdentityKey)));
  const siteCodeCounts = counts(snapshot.hubSites.map((site) => stringValue(site.siteCode)));
  const builderRegistryCounts = counts(snapshot.builderSites.map((site) => stringValue(site.siteId)));
  const builderCollectionCounts = counts(snapshot.builderSites.map((site) => stringValue(site.safeCollectionName)));
  const physicalByName = new Map(snapshot.physicalCollections.map((item) => [item.name, item]));
  const builderById = new Map(snapshot.builderSites.filter((site) => site.siteId).map((site) => [stringValue(site.siteId), site]));
  const runtimeBySite = new Map<string, typeof snapshot.runtimeConfigs>();
  snapshot.runtimeConfigs.forEach((runtime) => runtime.siteId && runtimeBySite.set(runtime.siteId, [...(runtimeBySite.get(runtime.siteId) || []), runtime]));

  const hubCandidates = snapshot.hubSites.map((site) => {
    const binding = siteDataBindingSchema.safeParse(site.siteDataBinding);
    const builderCandidates = new Set([
      stringValue(site.builderSiteId), stringValue(site.mongoSiteId), nested(site.runtimeConfigStatus, "builderSiteId"), nested(site.mongoBackendStatus, "siteId"),
      ...(binding.success ? [normalizeSiteDataBinding(binding.data).builderSiteId] : [])
    ].filter(Boolean));
    const collectionCandidates = new Set([
      stringValue(site.safeCollectionName), nested(site.mongoBackendStatus, "safeCollectionName"),
      ...(binding.success ? [normalizeSiteDataBinding(binding.data).safeCollectionName] : [])
    ].filter(Boolean));
    return { site, binding, builderCandidates: [...builderCandidates], collectionCandidates: [...collectionCandidates] };
  });
  const explicitBuilderCounts = counts(hubCandidates.flatMap((item) => item.builderCandidates.length === 1 ? item.builderCandidates : []));
  const explicitCollectionCounts = counts(hubCandidates.flatMap((item) => item.collectionCandidates.length === 1 ? item.collectionCandidates : []));
  const rows: ReconciliationRow[] = [];

  for (const candidate of hubCandidates) {
    const site = candidate.site;
    const subject = stringValue(site._id);
    const warnings: string[] = [];
    const blockers: string[] = [];
    const warn = (code: string, message: string) => { warnings.push(message); add("warning", code, subject, message); };
    const block = (code: string, message: string) => { blockers.push(message); add("blocker", code, subject, message); };
    const siteIdentityKey = stringValue(site.siteIdentityKey);
    const siteCode = stringValue(site.siteCode);
    if (!siteIdentityKey) warn("hub.identity.missing", "HUB siteIdentityKey is missing");
    if (duplicate(hubIdentityCounts, siteIdentityKey)) block("hub.identity.duplicate", "Duplicate siteIdentityKey");
    if (duplicate(siteCodeCounts, siteCode)) warn("hub.siteCode.duplicate", "Duplicate siteCode is informational and was not used for mapping");
    if (candidate.builderCandidates.length > 1) block("hub.builderId.inconsistent", "Inconsistent explicit builderSiteId fields");
    if (candidate.collectionCandidates.length > 1) block("hub.collection.inconsistent", "Inconsistent explicit safeCollectionName fields");
    const builderSiteId = candidate.builderCandidates[0] || "";
    const explicitCollection = candidate.collectionCandidates[0] || "";
    if (duplicate(explicitBuilderCounts, builderSiteId)) block("mapping.builderId.duplicate", "Duplicate explicit builderSiteId mapping");
    if (duplicate(explicitCollectionCounts, explicitCollection)) block("mapping.collection.duplicate", "Duplicate explicit safeCollectionName mapping");
    if (site.siteDataBinding !== undefined && !candidate.binding.success) warn("binding.invalid", "Non-authoritative siteDataBinding is invalid");
    if (["archived", "superseded"].includes(stringValue(site.status)) || ["archived", "superseded"].includes(stringValue(site.lifecycleStatus))) warn("hub.lifecycle.inactive", "HUB record is archived or superseded");
    if (site.status && !["active", "warning", "failed", "draft", "archived", "superseded"].includes(site.status)) block("hub.status.invalid", "Invalid HUB status value");
    if (site.lifecycleStatus && !["unknown", "draft", "planned", "provisioning", "partially-created", "ready", "failed", "archived", "superseded"].includes(site.lifecycleStatus)) block("hub.lifecycle.invalid", "Invalid HUB lifecycle value");
    const storage = stringValue(site.storageBackend || nested(site.runtimeConfigStatus, "storageBackend"));
    if (storage && !["txt", "mongo", "unknown"].includes(storage)) block("hub.storage.invalid", "Invalid HUB storage backend value");
    const builder = builderSiteId ? builderById.get(builderSiteId) : undefined;
    let safeCollectionName = explicitCollection || stringValue(builder?.safeCollectionName);
    if (builder && explicitCollection && builder.safeCollectionName !== explicitCollection) block("mapping.collection.mismatch", "HUB and Builder safeCollectionName differ");
    const physical = safeCollectionName ? physicalByName.get(safeCollectionName) : undefined;
    const expectedRuntimePath = nested(site.runtimeConfigStatus, "path");
    const runtimes = runtimeBySite.get(builderSiteId) || snapshot.runtimeConfigs.filter((item) => expectedRuntimePath && item.path === expectedRuntimePath);
    const runtime = runtimes[0];
    if (runtimes.length > 1) warn("runtime.duplicate", "Multiple runtime configs claim the same siteId");
    if (runtime?.parseError) block("runtime.invalid", "Runtime config could not be parsed");
    const runtimeTarget = safeOrigin(runtime?.backendUrl || runtime?.backendOrigin || "");
    if (runtimeTarget.unsafe) block("runtime.url.unsafe", "Runtime backend URL contains credentials, query, fragment, or is invalid");
    if (runtime?.deploymentUrl?.startsWith("https://") && runtimeTarget.origin.startsWith("http://")) block("runtime.mixedContent", "HTTPS deployment points to an HTTP backend");
    if (runtime?.siteId && runtime.siteId !== builderSiteId) block("runtime.siteId.mismatch", "Runtime siteId differs from explicit mapping");
    if (storage === "mongo" && !runtime) warn("runtime.metadata.missing", "Mongo-backed HUB site has no runtime-config metadata");
    if (!builderSiteId && storage !== "txt") warn("mapping.builderId.missing", "Explicit builderSiteId mapping is missing");
    if (builderSiteId && !builder) block("mapping.builder.orphan", "HUB mapping references a missing Builder registry site");
    if (builder && !physical?.exists) block("physical.missing", "Mapped physical collection is missing");
    if (physical) {
      if (physical.wrongSiteDocuments) block("physical.wrongSite", `${physical.wrongSiteDocuments} documents have the wrong siteId`);
      if (physical.invalidVersions) block("physical.version.invalid", `${physical.invalidVersions} documents have invalid versions`);
      if (physical.invalidDeletedAt) block("physical.deletedAt.invalid", `${physical.invalidDeletedAt} documents have invalid deletedAt state`);
      if (physical.malformedIds) block("physical.id.invalid", `${physical.malformedIds} documents have malformed logical IDs`);
      if (physical.criticalBackups) block("physical.backup.critical", `${physical.criticalBackups} backup documents exceed the critical size threshold`);
      else if (physical.oversizedBackups) warn("physical.backup.large", `${physical.oversizedBackups} backup documents exceed the warning threshold`);
      if (physical.duplicateLogicalDocuments) block("physical.identity.duplicate", "Duplicate logical documents detected");
      if (!physical.documentCount) warn("physical.empty", "Physical collection is empty");
      physical.unknownScopes.filter((scope) => !KNOWN_SCOPES.has(scope)).forEach((scope) => warn("physical.scope.unknown", `Unknown scope: ${scope}`));
      const expectedScopes = Array.isArray(site.mongoBackendStatus?.expectedScopes)
        ? site.mongoBackendStatus.expectedScopes.map(stringValue).filter(Boolean)
        : [];
      const missingScopes = expectedScopes.filter((scope) => !Object.prototype.hasOwnProperty.call(physical.scopes, scope));
      if (missingScopes.length) warn("physical.seed.partial", `Partially seeded collection; missing scopes: ${missingScopes.join(", ")}`);
    }
    const status = candidate.builderCandidates.length > 1 || candidate.collectionCandidates.length > 1
      ? "ambiguous mapping"
      : duplicate(explicitBuilderCounts, builderSiteId) || duplicate(explicitCollectionCounts, explicitCollection)
        ? "duplicate mapping"
        : builder && !physical?.exists
          ? "physical collection missing"
          : runtime && (runtime.siteId !== builderSiteId || runtimeTarget.unsafe)
            ? "runtime mismatch"
            : blockers.length ? "blocked" : storage === "txt" ? "not yet Mongo-backed" : !builderSiteId ? "HUB-only orphan" : !runtime ? "mapped without runtime evidence" : "mapped cleanly";
    rows.push({ hubSiteId: subject, siteIdentityKey, siteCode, builderSiteId, sourceDatabase: stringValue(site.mongoDatabase) || "sitebuilder_hub",
      safeCollectionName, physicalCollectionExists: Boolean(physical?.exists), runtimeConfigPath: runtime?.path || "", runtimeSiteId: runtime?.siteId || "",
      runtimeStorageBackend: runtime?.storageBackend || "", runtimeBackendOrigin: runtimeTarget.origin,
      sharePointSiteUrl: safeTechnicalUrl(stringValue(site.sharePointSiteUrl)), migrationState: candidate.binding.success ? candidate.binding.data.migrationState : "source", status, warnings, blockers });
  }

  const mappedBuilderIds = new Set(rows.map((row) => row.builderSiteId).filter(Boolean));
  for (const site of snapshot.builderSites) {
    const siteId = stringValue(site.siteId), collection = stringValue(site.safeCollectionName), subject = siteId || "[malformed-registry-row]";
    if (!siteId || !collection) add("blocker", "builder.registry.malformed", subject, "Builder registry row is missing required fields");
    if (duplicate(builderRegistryCounts, siteId)) add("blocker", "builder.registry.siteId.duplicate", subject, "Duplicate Builder registry siteId");
    if (duplicate(builderCollectionCounts, collection)) add("blocker", "builder.registry.collection.duplicate", subject, "Duplicate Builder registry safeCollectionName");
    if (collection && !/^[a-zA-Z0-9_]{1,120}$/.test(collection)) add("blocker", "builder.registry.collection.invalid", subject, "Invalid physical collection name");
    if (site.schemaVersion !== undefined && (!Number.isInteger(site.schemaVersion) || site.schemaVersion < 1)) add("warning", "builder.registry.schemaVersion", subject, "Registry schemaVersion is anomalous");
    if (site.status && !["active", "archived", "disabled"].includes(site.status)) add("warning", "builder.registry.status", subject, "Registry status is anomalous");
    if (siteId && !mappedBuilderIds.has(siteId)) {
      const physical = physicalByName.get(collection);
      rows.push({ hubSiteId: "", siteIdentityKey: "", siteCode: "", builderSiteId: siteId, sourceDatabase: "sitebuilder_site_data", safeCollectionName: collection,
        physicalCollectionExists: Boolean(physical?.exists), runtimeConfigPath: (runtimeBySite.get(siteId) || [])[0]?.path || "", runtimeSiteId: siteId,
        runtimeStorageBackend: (runtimeBySite.get(siteId) || [])[0]?.storageBackend || "", runtimeBackendOrigin: safeOrigin((runtimeBySite.get(siteId) || [])[0]?.backendUrl || "").origin,
        sharePointSiteUrl: "", migrationState: "source", status: "Builder-only orphan", warnings: ["No explicit HUB mapping"], blockers: [] });
      add("warning", "mapping.builderOnly", siteId, "Builder registry site has no explicit HUB mapping");
    }
  }
  const registryCollections = new Set(snapshot.builderSites.map((site) => stringValue(site.safeCollectionName)).filter(Boolean));
  snapshot.physicalCollections.filter((item) => !registryCollections.has(item.name)).forEach((item) => {
    add("warning", "physical.orphan", item.name, "Physical collection has no Builder registry row");
    rows.push({ hubSiteId: "", siteIdentityKey: "", siteCode: "", builderSiteId: "", sourceDatabase: "sitebuilder_site_data", safeCollectionName: item.name,
      physicalCollectionExists: item.exists, runtimeConfigPath: "", runtimeSiteId: "", runtimeStorageBackend: "", runtimeBackendOrigin: "", sharePointSiteUrl: "",
      migrationState: "source", status: "physical collection orphan", warnings: ["No Builder registry row"], blockers: [] });
  });
  const registryIds = new Set(snapshot.builderSites.map((site) => stringValue(site.siteId)).filter(Boolean));
  snapshot.revisions.forEach((revision, index) => {
    const subject = revision.documentKey || `revision-${index}`;
    if (!revision.siteId || !registryIds.has(revision.siteId)) add("blocker", "revision.site.orphan", subject, "Revision references a missing registry site");
    if (!revision.documentKey) add("blocker", "revision.key.missing", subject, "Revision documentKey is missing");
    if (!Number.isInteger(revision.previousVersion) || !Number.isInteger(revision.nextVersion) || revision.nextVersion !== (revision.previousVersion || 0) + 1) add("blocker", "revision.version.invalid", subject, "Invalid previous/next revision version ordering");
    if (revision.physicalDocumentMissing && !["delete", "purge"].includes(revision.operation || "")) add("warning", "revision.document.missing", subject, "Latest non-delete revision has no physical document");
  });
  snapshot.audits.forEach((audit, index) => {
    const subject = audit.documentKey || `audit-${index}`;
    if (!audit.siteId || !registryIds.has(audit.siteId)) add("blocker", "audit.site.orphan", subject, "Audit entry references a missing registry site");
    if (!audit.documentKey && !["create-site", "backup", "restore", "admin"].includes(audit.operation || "")) add("warning", "audit.key.missing", subject, "Non-administrative audit entry is missing documentKey");
  });
  (snapshot.revisionAggregates || []).forEach((aggregate) => {
    const subject = aggregate.siteId || "[missing-siteId]";
    if (aggregate.orphanCount) add("blocker", "revision.site.orphan", subject, `${aggregate.orphanCount} revisions reference a missing registry site`);
    if (aggregate.invalidVersionTransitions) add("blocker", "revision.version.invalid", subject, `${aggregate.invalidVersionTransitions} revisions have invalid version transitions`);
    if (aggregate.missingDocumentKeys || aggregate.malformedDocumentKeys) add("blocker", "revision.key.invalid", subject, `${aggregate.missingDocumentKeys + aggregate.malformedDocumentKeys} revisions have missing or malformed document keys`);
    if (aggregate.physicalDocumentsMissing) add("warning", "revision.document.missing", subject, `${aggregate.physicalDocumentsMissing} latest non-delete revisions have no physical document`);
    if (aggregate.physicalDocumentCheckComplete === false) add("warning", "revision.documentCheck.incomplete", subject, "Physical-document reconciliation was not collected for this aggregate snapshot");
    if (aggregate.duplicateOperationIds) add("blocker", "revision.operationId.duplicate", subject, `${aggregate.duplicateOperationIds} duplicate revision operation/request IDs were detected`);
  });
  (snapshot.auditAggregates || []).forEach((aggregate) => {
    const subject = aggregate.siteId || "[missing-siteId]";
    if (aggregate.orphanCount) add("blocker", "audit.site.orphan", subject, `${aggregate.orphanCount} audit entries reference a missing registry site`);
    if (aggregate.missingDocumentKeys || aggregate.malformedDocumentKeys) add("warning", "audit.key.invalid", subject, `${aggregate.missingDocumentKeys + aggregate.malformedDocumentKeys} audit entries have missing or malformed document keys`);
    if (aggregate.duplicateOperationIds) add("blocker", "audit.operationId.duplicate", subject, `${aggregate.duplicateOperationIds} duplicate audit operation/request IDs were detected`);
  });
  const auditCounts = counts(snapshot.audits.filter((row) => row.documentKey).map((row) => `${row.siteId}:${row.documentKey}`));
  const revisionCounts = counts(snapshot.revisions.filter((row) => row.documentKey).map((row) => `${row.siteId}:${row.documentKey}`));
  for (const [key, count] of revisionCounts) if ((auditCounts.get(key) || 0) === 0 && count > 0) add("warning", "revision.audit.inconsistent", key, "Revisions exist without a corresponding document audit entry");
  for (const [key, count] of auditCounts) if ((revisionCounts.get(key) || 0) === 0 && count > 1) add("warning", "audit.revision.inconsistent", key, "Repeated document audit entries exist without revisions");
  const mappedOrBuilderIds = new Set([...mappedBuilderIds, ...registryIds]);
  const runtimePathCounts = counts(snapshot.runtimeConfigs.map((runtime) => runtime.path));
  snapshot.runtimeConfigs.forEach((runtime) => {
    if (duplicate(runtimePathCounts, runtime.path)) add("warning", "runtime.installation.duplicate", runtime.path, "Multiple runtime configs claim the same physical installation path");
    if (!runtime.siteId) add("blocker", "runtime.siteId.missing", runtime.path, "Runtime siteId is missing");
    else if (!mappedOrBuilderIds.has(runtime.siteId)) {
      const isMongo = runtime.storageBackend === "mongo";
      add(isMongo ? "blocker" : "info", isMongo ? "runtime.orphan" : "runtime.txt.unmapped", runtime.path,
        isMongo ? "Mongo runtime references no HUB or Builder site" : "TXT runtime is not yet Mongo-backed");
      rows.push({ hubSiteId: "", siteIdentityKey: "", siteCode: "", builderSiteId: runtime.siteId, sourceDatabase: isMongo ? "sitebuilder_site_data" : "",
        safeCollectionName: "", physicalCollectionExists: false, runtimeConfigPath: runtime.path, runtimeSiteId: runtime.siteId,
        runtimeStorageBackend: runtime.storageBackend || "", runtimeBackendOrigin: safeOrigin(runtime.backendUrl || runtime.backendOrigin || "").origin,
        sharePointSiteUrl: "", migrationState: "source", status: isMongo ? "runtime-only orphan" : "not yet Mongo-backed",
        warnings: isMongo ? [] : ["TXT runtime has no Mongo mapping"], blockers: isMongo ? ["No HUB or Builder mapping"] : [] });
    }
  });
  const warningCount = findings.filter((item) => item.severity === "warning").length;
  const blockerCount = findings.filter((item) => item.severity === "blocker").length;
  return { schemaVersion: 1, generatedAt, readOnly: true, summary: { rows: rows.length, warnings: warningCount, blockers: blockerCount, exitCode: reconciliationFindingExitCode(warningCount, blockerCount) }, inventory: rows, findings };
}
