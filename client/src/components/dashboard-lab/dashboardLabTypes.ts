import type { Job, OperationCapabilities, OperationalStatusSnapshot } from "../../api/sitesApi";
import type { Site, SitesStats } from "../../types/site";

export type LabTone = "success" | "warning" | "danger" | "info" | "neutral";
export type LabSeverity = "critical" | "high" | "medium" | "clear";
export type LabCapabilityMode = "live" | "cached" | "metadata" | "blocked" | "unknown";

export type LabChartRow = {
  key: string;
  label: string;
  value: number;
  formattedValue?: string;
  tone?: LabTone;
  color?: string;
  to?: string;
};

export type LabMetric = {
  key: string;
  label: string;
  value: string;
  detail: string;
  tone: LabTone;
  to?: string;
};

export type LabRiskItem = {
  key: string;
  title: string;
  description: string;
  to: string;
  actionLabel: string;
  severity: LabSeverity;
  tone: LabTone;
  category: "connectivity" | "health" | "release" | "backup" | "access" | "jobs" | "data";
  meta?: string;
};

export type LabCapability = {
  key: string;
  label: string;
  detail: string;
  mode: LabCapabilityMode;
  tone: LabTone;
  to: string;
};

export type LabDomain = {
  key: "deploy" | "recovery" | "access" | "health";
  title: string;
  subtitle: string;
  status: string;
  tone: LabTone;
  to: string;
  actionLabel: string;
  metrics: LabMetric[];
  risks: LabRiskItem[];
  capabilities: LabCapability[];
};

export type LabWatchlistItem = {
  site: Site;
  title: string;
  detail: string;
  tone: LabTone;
  score: number;
  to: string;
};

export type LabActivityItem = {
  key: string;
  label: string;
  type: "site" | "health" | "backup" | "deploy" | "job";
  at: string;
  tone: LabTone;
  to: string;
};

export type DashboardLabRawData = {
  sites: Site[];
  jobs: Job[];
  stats: SitesStats;
  versionStatus: any;
  capabilities: OperationCapabilities | null;
};

export type DashboardLabData = DashboardLabRawData & {
  generatedAt: string;
  operationalStatus: OperationalStatusSnapshot;
  activeSites: Site[];
  empty: boolean;
  counts: {
    totalSites: number;
    activeSites: number;
    archivedSites: number;
    attentionItems: number;
    failedJobs: number;
    activeJobs: number;
    failedHealthSites: number;
    warningHealthSites: number;
    backupRiskSites: number;
    backupFailureSites: number;
    adminRiskSites: number;
    outdatedSites: number;
    mongoSites: number;
    txtSites: number;
    unknownStorageSites: number;
    totalAdmins: number;
    totalBackups: number;
    totalStorageMb: number;
  };
  latestVersion: string;
  releaseAdoptionPercent: number;
  healthScorePercent: number;
  backupReliabilityPercent: number;
  overallSeverity: LabSeverity;
  overallTone: LabTone;
  overallTitle: string;
  overallSubtitle: string;
  primaryAction: LabRiskItem;
  topMetrics: LabMetric[];
  executiveMetrics: LabMetric[];
  riskQueue: LabRiskItem[];
  capabilityStrip: LabCapability[];
  domains: LabDomain[];
  watchlist: LabWatchlistItem[];
  recentActivity: LabActivityItem[];
  distributions: {
    health: LabChartRow[];
    storage: LabChartRow[];
    environment: LabChartRow[];
    jobs: LabChartRow[];
    backupFreshness: LabChartRow[];
    riskCategories: LabChartRow[];
    domains: LabChartRow[];
  };
};

export type DashboardLabLoadState = {
  data: DashboardLabData | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
};
