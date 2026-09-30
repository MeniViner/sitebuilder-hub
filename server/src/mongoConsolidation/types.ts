export type HubSiteSnapshot = {
  _id: string; siteIdentityKey?: string; siteCode?: string; builderSiteId?: string; mongoSiteId?: string;
  safeCollectionName?: string; mongoDatabase?: string; storageBackend?: string; status?: string; lifecycleStatus?: string;
  provisioningStatus?: string; sharePointSiteUrl?: string; backendApiUrl?: string; runtimeConfigPath?: string;
  createdAt?: string; updatedAt?: string; runtimeConfigStatus?: Record<string, unknown>; mongoBackendStatus?: Record<string, unknown>;
  siteDataBinding?: unknown;
};
export type BuilderSiteSnapshot = { siteId?: string; safeCollectionName?: string; siteSlug?: string; status?: string; schemaVersion?: number; createdAt?: string; updatedAt?: string; physicalCollectionExists?: boolean };
export type PhysicalCollectionSnapshot = {
  name: string; registrySiteId?: string; exists: boolean; documentCount: number; wrongSiteDocuments: number;
  invalidVersions: number; invalidDeletedAt: number; malformedIds: number; oversizedBackups: number; criticalBackups: number;
  unknownScopes: string[]; scopes: Record<string, number>; duplicateLogicalDocuments: number; minimumVersion?: number;
  maximumVersion?: number; backupDocumentCount?: number; maximumBackupBsonSize?: number;
};
export type RevisionSnapshot = { siteId?: string; collectionName?: string; documentKey?: string; operation?: string; previousVersion?: number; nextVersion?: number; physicalDocumentMissing?: boolean };
export type AuditSnapshot = { siteId?: string; documentKey?: string; operation?: string };
export type RevisionAggregateSnapshot = { siteId?: string; count: number; orphanCount: number; invalidVersionTransitions: number; missingDocumentKeys: number; malformedDocumentKeys: number; physicalDocumentsMissing?: number; physicalDocumentCheckComplete?: boolean; duplicateOperationIds: number; earliestTimestamp?: string; latestTimestamp?: string };
export type AuditAggregateSnapshot = { siteId?: string; count: number; orphanCount: number; missingDocumentKeys: number; malformedDocumentKeys: number; duplicateOperationIds: number; earliestTimestamp?: string; latestTimestamp?: string };
export type RuntimeConfigSnapshot = { path: string; siteId?: string; storageBackend?: string; backendUrl?: string; backendOrigin?: string; deploymentUrl?: string; apiVersion?: string; schemaVersion?: string; parseError?: string };
export type ReconciliationSnapshot = {
  hubSites: HubSiteSnapshot[]; builderSites: BuilderSiteSnapshot[]; physicalCollections: PhysicalCollectionSnapshot[];
  revisions: RevisionSnapshot[]; audits: AuditSnapshot[]; runtimeConfigs: RuntimeConfigSnapshot[];
  revisionAggregates?: RevisionAggregateSnapshot[]; auditAggregates?: AuditAggregateSnapshot[];
};

export type ReconciliationRow = {
  hubSiteId: string; siteIdentityKey: string; siteCode: string; builderSiteId: string;
  sourceDatabase: string; safeCollectionName: string; physicalCollectionExists: boolean;
  runtimeConfigPath: string; runtimeSiteId: string; runtimeStorageBackend: string; runtimeBackendOrigin: string;
  sharePointSiteUrl: string; migrationState: string; status: string; warnings: string[]; blockers: string[];
};

export type ReconciliationReport = {
  schemaVersion: 1; generatedAt: string; readOnly: true; summary: { rows: number; warnings: number; blockers: number; exitCode: number };
  inventory: ReconciliationRow[]; findings: Array<{ severity: "info" | "warning" | "blocker"; code: string; subject: string; message: string }>;
};
