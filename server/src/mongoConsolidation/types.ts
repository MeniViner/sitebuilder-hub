export type HubSiteSnapshot = {
  _id: string; siteIdentityKey?: string; siteCode?: string; builderSiteId?: string; mongoSiteId?: string;
  safeCollectionName?: string; mongoDatabase?: string; storageBackend?: string; status?: string; lifecycleStatus?: string;
  sharePointSiteUrl?: string; runtimeConfigStatus?: Record<string, unknown>; mongoBackendStatus?: Record<string, unknown>;
  siteDataBinding?: unknown;
};
export type BuilderSiteSnapshot = { siteId?: string; safeCollectionName?: string; siteSlug?: string; status?: string; schemaVersion?: number };
export type PhysicalCollectionSnapshot = {
  name: string; registrySiteId?: string; exists: boolean; documentCount: number; wrongSiteDocuments: number;
  invalidVersions: number; invalidDeletedAt: number; malformedIds: number; oversizedBackups: number; criticalBackups: number;
  unknownScopes: string[]; scopes: Record<string, number>; duplicateLogicalDocuments: number;
};
export type RevisionSnapshot = { siteId?: string; collectionName?: string; documentKey?: string; operation?: string; previousVersion?: number; nextVersion?: number; physicalDocumentMissing?: boolean };
export type AuditSnapshot = { siteId?: string; documentKey?: string; operation?: string };
export type RuntimeConfigSnapshot = { path: string; siteId?: string; storageBackend?: string; backendUrl?: string; backendOrigin?: string; deploymentUrl?: string; apiVersion?: string; schemaVersion?: string; parseError?: string };
export type ReconciliationSnapshot = {
  hubSites: HubSiteSnapshot[]; builderSites: BuilderSiteSnapshot[]; physicalCollections: PhysicalCollectionSnapshot[];
  revisions: RevisionSnapshot[]; audits: AuditSnapshot[]; runtimeConfigs: RuntimeConfigSnapshot[];
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
