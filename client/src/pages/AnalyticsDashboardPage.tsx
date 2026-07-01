import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, AlertTriangle, Archive, BarChart3, CheckCircle2, Clock3, Database, Filter, GitBranch, HardDrive, PieChart, RefreshCcw, Search, ShieldAlert, SlidersHorizontal, Table2, Users } from "lucide-react";
import { Job, sitesApi } from "../api/sitesApi";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { FilterBar } from "../components/FilterBar";
import { HelpLabel } from "../components/help/HelpLabel";
import { KpiCard } from "../components/KpiCard";
import { LoadingState } from "../components/LoadingState";
import { ModeBoundary, OperationalSummary } from "../components/OperationalSummary";
import { PageHeader } from "../components/PageHeader";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { HealthBadge } from "../components/HealthBadge";
import { VersionBadge } from "../components/VersionBadge";
import { Site } from "../types/site";
import { formatDateTime, formatMb, formatNumber, healthStatusLabel, jobStatusLabel, siteStatusLabel, versionStatusLabel } from "../utils/format";

type ChartType = "bar" | "column" | "donut" | "line" | "table";
type MetricKey = "count" | "storageMb" | "backupStorageMb" | "backupCount" | "adminsCount" | "filesCount";
type FocusKey = "all" | "attention" | "outdated" | "staleBackups" | "production" | "largeStorage" | "adminHeavy" | "archived";
type GroupKey =
  | "environment"
  | "status"
  | "derivedHealthStatus"
  | "versionStatus"
  | "currentVersion"
  | "backupStatus"
  | "adminSyncStatus"
  | "unitName"
  | "ownerName"
  | "sharePointHost"
  | "siteDbLibrary"
  | "usersDbLibrary"
  | "widgetsDbTarget"
  | "storageBucket"
  | "adminsBucket"
  | "backupFreshness"
  | "deployFreshness";
type DateField = "createdAt" | "updatedAt" | "lastHealthCheckAt" | "lastDeployAt" | "lastBackupAt" | "lastAdminSyncAt";

type ChartRow = {
  key: string;
  label: string;
  value: number;
  count: number;
  sites: Site[];
};

type Filters = {
  focus: FocusKey;
  query: string;
  status: string;
  health: string;
  environment: string;
  versionStatus: string;
  backupStatus: string;
  adminSyncStatus: string;
  widgetsDbTarget: string;
  unitName: string;
  ownerName: string;
  host: string;
  dateField: DateField;
  fromDate: string;
  toDate: string;
  minStorageMb: string;
  maxStorageMb: string;
  includeArchived: boolean;
};

const chartColors = [
  "var(--accent)",
  "var(--success)",
  "var(--warning)",
  "var(--info)",
  "var(--danger)",
  "color-mix(in srgb, var(--accent) 70%, var(--success))",
  "color-mix(in srgb, var(--warning) 75%, var(--danger))",
  "color-mix(in srgb, var(--info) 65%, var(--accent))"
];

const defaultFilters: Filters = {
  focus: "all",
  query: "",
  status: "all",
  health: "all",
  environment: "all",
  versionStatus: "all",
  backupStatus: "all",
  adminSyncStatus: "all",
  widgetsDbTarget: "all",
  unitName: "all",
  ownerName: "all",
  host: "all",
  dateField: "updatedAt",
  fromDate: "",
  toDate: "",
  minStorageMb: "",
  maxStorageMb: "",
  includeArchived: false
};

const groupLabels: Record<GroupKey, string> = {
  environment: "סביבה",
  status: "סטטוס אתר",
  derivedHealthStatus: "תקינות",
  versionStatus: "מצב גרסה",
  currentVersion: "גרסה נוכחית",
  backupStatus: "מצב גיבוי",
  adminSyncStatus: "סנכרון מנהלים",
  unitName: "יחידה",
  ownerName: "בעל אתר",
  sharePointHost: "SharePoint host",
  siteDbLibrary: "ספריית siteDB",
  usersDbLibrary: "ספריית usersDb",
  widgetsDbTarget: "מיקום widgets",
  storageBucket: "טווח אחסון",
  adminsBucket: "טווח מנהלים",
  backupFreshness: "טריות גיבוי",
  deployFreshness: "טריות פריסה"
};

const metricLabels: Record<MetricKey, string> = {
  count: "מספר אתרים",
  storageMb: "אחסון רשום",
  backupStorageMb: "אחסון גיבויים",
  backupCount: "מספר גיבויים",
  adminsCount: "מספר מנהלים",
  filesCount: "מספר קבצים"
};

const metricUnits: Record<MetricKey, string> = {
  count: "אתרים",
  storageMb: "MB",
  backupStorageMb: "MB",
  backupCount: "גיבויים",
  adminsCount: "מנהלים",
  filesCount: "קבצים"
};

const chartTypeLabels: Record<ChartType, string> = {
  bar: "עמודות אופקיות",
  column: "עמודות אנכיות",
  donut: "טבעת",
  line: "קו מגמה",
  table: "טבלה"
};

const focusLabels: Record<FocusKey, string> = {
  all: "הכל",
  attention: "דורשים טיפול",
  outdated: "גרסאות מיושנות",
  staleBackups: "גיבויים חסרים/ישנים",
  production: "ייצור",
  largeStorage: "נפחים גדולים",
  adminHeavy: "הרבה מנהלים",
  archived: "ארכיון"
};

const toOptionRows = (values: string[]) =>
  values
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value, index, arr) => arr.indexOf(value) === index)
    .sort((a, b) => a.localeCompare(b, "he"));

const getHost = (site: Site) => {
  if (site.sharePointHost) return site.sharePointHost;
  try {
    return new URL(site.sharePointSiteUrl).host;
  } catch {
    return "לא מוגדר";
  }
};

const getCurrentVersion = (site: Site) =>
  site.currentVersion || site.version || "ללא גרסה";

const bucketNumber = (value: number | undefined, ranges: Array<[number, string]>, fallback: string) => {
  const numeric = Number(value || 0);
  for (const [limit, label] of ranges) {
    if (numeric <= limit) return label;
  }
  return fallback;
};

const freshnessBucket = (value?: string) => {
  if (!value) return "לא קיים";
  const ageDays = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
  if (!Number.isFinite(ageDays) || ageDays < 0) return "לא ידוע";
  if (ageDays <= 1) return "24 שעות";
  if (ageDays <= 7) return "עד שבוע";
  if (ageDays <= 30) return "עד חודש";
  if (ageDays <= 90) return "עד רבעון";
  return "ישן";
};

const groupValue = (site: Site, groupBy: GroupKey) => {
  const raw: Record<GroupKey, string> = {
    environment: site.environment || "unknown",
    status: siteStatusLabel(site.status),
    derivedHealthStatus: healthStatusLabel(site.derivedHealthStatus),
    versionStatus: versionStatusLabel(site.versionStatus),
    currentVersion: getCurrentVersion(site),
    backupStatus: site.backupStatus || "unknown",
    adminSyncStatus: site.adminSyncStatus || "unknown",
    unitName: site.unitName || "ללא יחידה",
    ownerName: site.ownerName || "ללא בעלים",
    sharePointHost: getHost(site),
    siteDbLibrary: site.siteDbLibrary || "siteDB",
    usersDbLibrary: site.usersDbLibrary || "siteUsersDb",
    widgetsDbTarget: site.widgetsDbTarget === "site" ? "siteDB" : "siteUsersDb",
    storageBucket: bucketNumber(site.storageMb, [[0, "0 MB"], [100, "1-100 MB"], [500, "101-500 MB"], [1000, "501-1,000 MB"]], "1,000+ MB"),
    adminsBucket: bucketNumber(site.adminsCount, [[0, "0"], [2, "1-2"], [5, "3-5"], [10, "6-10"]], "11+"),
    backupFreshness: freshnessBucket(site.lastBackupAt),
    deployFreshness: freshnessBucket(site.lastDeployAt)
  };
  return raw[groupBy] || "לא מוגדר";
};

const metricValue = (site: Site, metric: MetricKey) => {
  if (metric === "count") return 1;
  return Number(site[metric] || 0);
};

const formatMetricValue = (value: number, metric: MetricKey) => {
  if (metric === "storageMb" || metric === "backupStorageMb") return formatMb(Math.round(value));
  return formatNumber(Math.round(value));
};

const normalize = (value?: string | number | null) => String(value || "").trim().toLowerCase();

const matchesOption = (actual: string | undefined, expected: string) =>
  expected === "all" || normalize(actual) === normalize(expected);

const getDateValue = (site: Site, field: DateField) => {
  const value = site[field];
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const donutGradient = (rows: ChartRow[]) => {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  if (!total) return "conic-gradient(var(--border) 0 360deg)";
  let start = 0;
  const segments = rows.map((row, index) => {
    const end = start + (row.value / total) * 360;
    const segment = `${chartColors[index % chartColors.length]} ${start.toFixed(2)}deg ${end.toFixed(2)}deg`;
    start = end;
    return segment;
  });
  return `conic-gradient(${segments.join(", ")})`;
};

const chartTypeIcon = (type: ChartType) => {
  if (type === "donut") return <PieChart size={14} />;
  if (type === "line") return <Activity size={14} />;
  if (type === "table") return <Table2 size={14} />;
  return <BarChart3 size={14} />;
};

function ChartTypeSwitch({
  value,
  onChange,
  allowed = ["bar", "column", "donut", "line", "table"]
}: {
  value: ChartType;
  onChange: (value: ChartType) => void;
  allowed?: ChartType[];
}) {
  return (
    <div className="chart-type-switch" role="group" aria-label="סוג גרף">
      {allowed.map((type) => (
        <button
          key={type}
          className={`chart-type-btn ${value === type ? "chart-type-btn-active" : ""}`}
          type="button"
          onClick={() => onChange(type)}
          title={chartTypeLabels[type]}
          aria-label={chartTypeLabels[type]}
        >
          {chartTypeIcon(type)}
        </button>
      ))}
    </div>
  );
}

function MetricQuickSwitch({ value, onChange }: { value: MetricKey; onChange: (value: MetricKey) => void }) {
  const items: Array<{ key: MetricKey; label: string; icon: JSX.Element }> = [
    { key: "count", label: "אתרים", icon: <SlidersHorizontal size={13} /> },
    { key: "storageMb", label: "אחסון", icon: <HardDrive size={13} /> },
    { key: "backupCount", label: "גיבויים", icon: <Clock3 size={13} /> },
    { key: "adminsCount", label: "מנהלים", icon: <Users size={13} /> },
    { key: "filesCount", label: "קבצים", icon: <Database size={13} /> }
  ];
  return (
    <div className="metric-chip-row" role="group" aria-label="מדד מהיר">
      {items.map((item) => (
        <button
          key={item.key}
          className={`metric-chip ${value === item.key ? "metric-chip-active" : ""}`}
          type="button"
          onClick={() => onChange(item.key)}
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}

function MiniFilterButton({
  active,
  label,
  icon,
  onClick
}: {
  active: boolean;
  label: string;
  icon: JSX.Element;
  onClick: () => void;
}) {
  return (
    <button className={`mini-filter-btn ${active ? "mini-filter-btn-active" : ""}`} type="button" onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function ChartBars({ rows, metric }: { rows: ChartRow[]; metric: MetricKey }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <div className="chart-bars">
      {rows.map((row, index) => {
        const pct = Math.max(2, Math.round((row.value / max) * 100));
        return (
          <div className="chart-bar-row" key={row.key}>
            <div className="chart-bar-meta">
              <span className="chart-bar-label" title={row.label}>{row.label}</span>
              <span className="num chart-bar-value">{formatMetricValue(row.value, metric)}</span>
            </div>
            <div className="chart-bar-track">
              <div className="chart-bar-fill" style={{ width: `${pct}%`, background: chartColors[index % chartColors.length] }} />
            </div>
            <span className="num chart-bar-count">{formatNumber(row.count)} אתרים</span>
          </div>
        );
      })}
    </div>
  );
}

function ChartColumns({ rows, metric }: { rows: ChartRow[]; metric: MetricKey }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <div className="chart-columns" style={{ gridTemplateColumns: `repeat(${Math.max(1, rows.length)}, minmax(3.5rem, 1fr))` }}>
      {rows.map((row, index) => {
        const pct = Math.max(3, Math.round((row.value / max) * 100));
        return (
          <div className="chart-column-item" key={row.key}>
            <div className="chart-column-track">
              <div className="chart-column-fill" style={{ height: `${pct}%`, background: chartColors[index % chartColors.length] }} />
            </div>
            <span className="num chart-column-value">{formatMetricValue(row.value, metric)}</span>
            <span className="chart-column-label" title={row.label}>{row.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function ChartLine({ rows, metric }: { rows: ChartRow[]; metric: MetricKey }) {
  const width = 760;
  const height = 260;
  const paddingX = 42;
  const paddingY = 28;
  const max = Math.max(1, ...rows.map((row) => row.value));
  const points = rows.map((row, index) => {
    const x = rows.length === 1 ? width / 2 : paddingX + (index / (rows.length - 1)) * (width - paddingX * 2);
    const y = height - paddingY - (row.value / max) * (height - paddingY * 2);
    return { ...row, x, y };
  });
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <div className="chart-line-shell">
      <svg className="chart-line-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${metricLabels[metric]} בקו מגמה`}>
        <line x1={paddingX} x2={width - paddingX} y1={height - paddingY} y2={height - paddingY} className="chart-axis-line" />
        <line x1={paddingX} x2={paddingX} y1={paddingY} y2={height - paddingY} className="chart-axis-line" />
        <polyline points={line} className="chart-line-path" />
        {points.map((point, index) => (
          <g key={point.key}>
            <circle cx={point.x} cy={point.y} r="5" fill={chartColors[index % chartColors.length]} />
            <text x={point.x} y={Math.max(14, point.y - 10)} textAnchor="middle" className="chart-line-value">{formatMetricValue(point.value, metric)}</text>
          </g>
        ))}
      </svg>
      <div className="chart-line-labels">
        {rows.map((row) => <span key={row.key} title={row.label}>{row.label}</span>)}
      </div>
    </div>
  );
}

function ChartDonut({ rows, metric }: { rows: ChartRow[]; metric: MetricKey }) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  return (
    <div className="chart-donut-layout">
      <div className="chart-donut" style={{ background: donutGradient(rows) }}>
        <div className="chart-donut-center">
          <span className="num">{formatMetricValue(total, metric)}</span>
          <span>{metricUnits[metric]}</span>
        </div>
      </div>
      <div className="chart-legend-grid">
        {rows.map((row, index) => {
          const pct = total ? Math.round((row.value / total) * 100) : 0;
          return (
            <div className="chart-legend-item" key={row.key}>
              <span className="chart-legend-swatch" style={{ background: chartColors[index % chartColors.length] }} />
              <span className="truncate" title={row.label}>{row.label}</span>
              <span className="num muted">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChartTable({ rows, metric }: { rows: ChartRow[]; metric: MetricKey }) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const columns: DataTableColumn<ChartRow>[] = [
    { key: "label", header: "קבוצה", helpKey: "analytics", render: (row) => <span className="font-bold">{row.label}</span> },
    { key: "value", header: metricLabels[metric], helpKey: "analytics", render: (row) => <span className="num">{formatMetricValue(row.value, metric)}</span> },
    { key: "count", header: "אתרים", helpKey: "sites.registry", render: (row) => <span className="num">{formatNumber(row.count)}</span> },
    { key: "pct", header: "אחוז", helpKey: "analytics", render: (row) => <span className="num">{total ? Math.round((row.value / total) * 100) : 0}%</span> }
  ];
  return <DataTable columns={columns} rows={rows} rowKey={(row) => row.key} minWidth={680} density="dense" />;
}

function AnalyticsChart({ type, rows, metric }: { type: ChartType; rows: ChartRow[]; metric: MetricKey }) {
  if (rows.length === 0) return <EmptyState title="אין נתונים לגרף" description="שנו את הפילטרים או כללו אתרי ארכיון." />;
  if (type === "column") return <ChartColumns rows={rows} metric={metric} />;
  if (type === "donut") return <ChartDonut rows={rows} metric={metric} />;
  if (type === "line") return <ChartLine rows={rows} metric={metric} />;
  if (type === "table") return <ChartTable rows={rows} metric={metric} />;
  return <ChartBars rows={rows} metric={metric} />;
}

export function AnalyticsDashboardPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [groupBy, setGroupBy] = useState<GroupKey>("environment");
  const [metric, setMetric] = useState<MetricKey>("count");
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [versionChartType, setVersionChartType] = useState<ChartType>("bar");
  const [jobChartType, setJobChartType] = useState<ChartType>("donut");
  const [limit, setLimit] = useState(12);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [sitesRes, jobsRes] = await Promise.all([
        sitesApi.list({ includeArchived: "true" }),
        sitesApi.jobs()
      ]);
      setSites(sitesRes.data);
      setJobs(jobsRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בטעינת דשבורד גרפים");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const options = useMemo(() => ({
    units: toOptionRows(sites.map((site) => site.unitName || "")),
    owners: toOptionRows(sites.map((site) => site.ownerName || "")),
    hosts: toOptionRows(sites.map(getHost))
  }), [sites]);

  const filteredSites = useMemo(() => {
    const query = normalize(filters.query);
    const fromDate = filters.fromDate ? new Date(`${filters.fromDate}T00:00:00`) : null;
    const toDate = filters.toDate ? new Date(`${filters.toDate}T23:59:59`) : null;
    const minStorage = filters.minStorageMb.trim() ? Number(filters.minStorageMb) : null;
    const maxStorage = filters.maxStorageMb.trim() ? Number(filters.maxStorageMb) : null;

    return sites.filter((site) => {
      if (!filters.includeArchived && site.status === "archived") return false;
      if (query) {
        const haystack = [
          site.displayName,
          site.siteCode,
          site.description,
          site.unitName,
          site.ownerName,
          site.ownerPersonalNumber,
          site.ownerEmail,
          site.sharePointSiteUrl,
          getCurrentVersion(site),
          site.notes
        ].map(normalize).join(" ");
        if (!haystack.includes(query)) return false;
      }

      if (!matchesOption(site.status, filters.status)) return false;
      if (!matchesOption(site.derivedHealthStatus, filters.health)) return false;
      if (!matchesOption(site.environment || "unknown", filters.environment)) return false;
      if (!matchesOption(site.versionStatus || "unknown", filters.versionStatus)) return false;
      if (!matchesOption(site.backupStatus || "unknown", filters.backupStatus)) return false;
      if (!matchesOption(site.adminSyncStatus || "unknown", filters.adminSyncStatus)) return false;
      if (!matchesOption(site.widgetsDbTarget || "users", filters.widgetsDbTarget)) return false;
      if (!matchesOption(site.unitName || "", filters.unitName)) return false;
      if (!matchesOption(site.ownerName || "", filters.ownerName)) return false;
      if (!matchesOption(getHost(site), filters.host)) return false;
      if (filters.focus === "attention") {
        const attention = ["warning", "failed"].includes(site.status)
          || ["warning", "failed"].includes(site.derivedHealthStatus)
          || ["outdated", "failed"].includes(site.versionStatus || "unknown")
          || site.backupStatus === "failed";
        if (!attention) return false;
      }
      if (filters.focus === "outdated" && site.versionStatus !== "outdated") return false;
      if (filters.focus === "staleBackups" && !["ישן", "לא קיים"].includes(freshnessBucket(site.lastBackupAt))) return false;
      if (filters.focus === "production" && site.environment !== "production") return false;
      if (filters.focus === "largeStorage" && Number(site.storageMb || 0) < 500) return false;
      if (filters.focus === "adminHeavy" && Number(site.adminsCount || 0) < 5) return false;
      if (filters.focus === "archived" && site.status !== "archived") return false;

      const storage = Number(site.storageMb || 0);
      if (minStorage !== null && Number.isFinite(minStorage) && storage < minStorage) return false;
      if (maxStorage !== null && Number.isFinite(maxStorage) && storage > maxStorage) return false;

      const rowDate = getDateValue(site, filters.dateField);
      if (fromDate && (!rowDate || rowDate < fromDate)) return false;
      if (toDate && (!rowDate || rowDate > toDate)) return false;
      return true;
    });
  }, [filters, sites]);

  const chartRows = useMemo(() => {
    const map = new Map<string, ChartRow>();
    filteredSites.forEach((site) => {
      const label = groupValue(site, groupBy);
      const key = normalize(label) || "empty";
      const existing = map.get(key) || { key, label, value: 0, count: 0, sites: [] };
      existing.value += metricValue(site, metric);
      existing.count += 1;
      existing.sites.push(site);
      map.set(key, existing);
    });
    return Array.from(map.values())
      .sort((a, b) => b.value - a.value || b.count - a.count || a.label.localeCompare(b.label, "he"))
      .slice(0, limit);
  }, [filteredSites, groupBy, limit, metric]);

  const totalStorage = filteredSites.reduce((sum, site) => sum + Number(site.storageMb || 0), 0);
  const totalBackups = filteredSites.reduce((sum, site) => sum + Number(site.backupCount || 0), 0);
  const totalAdmins = filteredSites.reduce((sum, site) => sum + Number(site.adminsCount || 0), 0);
  const staleBackups = filteredSites.filter((site) => ["ישן", "לא קיים"].includes(freshnessBucket(site.lastBackupAt))).length;
  const activeFilterCount = Object.entries(filters).filter(([key, value]) => key !== "includeArchived" && value !== "" && value !== "all").length + (filters.includeArchived ? 1 : 0);
  const attentionSites = filteredSites.filter((site) =>
    ["warning", "failed"].includes(site.status)
    || ["warning", "failed"].includes(site.derivedHealthStatus)
    || ["outdated", "failed"].includes(site.versionStatus || "unknown")
    || site.backupStatus === "failed"
  ).length;
  const failedJobs = jobs.filter((job) => job.status === "failed").length;

  const topSites = useMemo(() => [...filteredSites]
    .sort((a, b) => metricValue(b, metric) - metricValue(a, metric))
    .slice(0, 12), [filteredSites, metric]);

  const siteColumns: DataTableColumn<Site>[] = [
    {
      key: "site",
      header: "אתר",
      helpKey: "sites.registry",
      render: (site) => (
        <div>
          <Link className="font-bold hover:underline" style={{ color: "var(--text-strong)" }} to={`/sites/${site._id}`}>{site.displayName}</Link>
          <p className="num text-xs muted">{site.siteCode}</p>
        </div>
      )
    },
    { key: "environment", header: "סביבה", helpKey: "site.environment", render: (site) => <span className="badge badge-neutral">{site.environment || "unknown"}</span> },
    { key: "status", header: "סטטוס", helpKey: "job.status", render: (site) => <StatusBadge status={site.status} /> },
    { key: "health", header: "תקינות", helpKey: "health", render: (site) => <HealthBadge status={site.derivedHealthStatus} /> },
    { key: "version", header: "גרסה", helpKey: "version.status", render: (site) => <VersionBadge status={site.versionStatus} /> },
    { key: "metric", header: metricLabels[metric], helpKey: "analytics", render: (site) => <span className="num">{formatMetricValue(metricValue(site, metric), metric)}</span> }
  ];

  const heatmapEnvironments = ["production", "staging", "test", "dev", "local", "unknown"];
  const heatmapHealth = ["healthy", "warning", "failed", "unknown"];
  const heatmapMax = Math.max(1, ...heatmapEnvironments.flatMap((env) =>
    heatmapHealth.map((health) => filteredSites.filter((site) => (site.environment || "unknown") === env && site.derivedHealthStatus === health).length)
  ));

  const versionRows = useMemo(() => {
    const map = new Map<string, ChartRow>();
    filteredSites.forEach((site) => {
      const label = getCurrentVersion(site);
      const existing = map.get(label) || { key: label, label, value: 0, count: 0, sites: [] };
      existing.value += 1;
      existing.count += 1;
      existing.sites.push(site);
      map.set(label, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [filteredSites]);

  const jobRows = useMemo(() => {
    const map = new Map<string, ChartRow>();
    jobs.forEach((job) => {
      const label = jobStatusLabel(job.status);
      const existing = map.get(label) || { key: label, label, value: 0, count: 0, sites: [] };
      existing.value += 1;
      existing.count += 1;
      map.set(label, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.value - a.value);
  }, [jobs]);

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const applyQuickView = (focus: FocusKey) => {
    setShowAdvancedFilters(false);
    if (focus === "all") {
      setFilters(defaultFilters);
      setGroupBy("environment");
      setMetric("count");
      setChartType("bar");
      return;
    }
    setFilters({ ...defaultFilters, focus, includeArchived: focus === "archived" });
    if (focus === "attention") {
      setGroupBy("derivedHealthStatus");
      setMetric("count");
      setChartType("column");
    } else if (focus === "outdated") {
      setGroupBy("currentVersion");
      setMetric("count");
      setChartType("bar");
    } else if (focus === "staleBackups") {
      setGroupBy("backupFreshness");
      setMetric("backupCount");
      setChartType("donut");
    } else if (focus === "production") {
      setGroupBy("derivedHealthStatus");
      setMetric("count");
      setChartType("column");
    } else if (focus === "largeStorage") {
      setGroupBy("storageBucket");
      setMetric("storageMb");
      setChartType("bar");
    } else if (focus === "adminHeavy") {
      setGroupBy("adminsBucket");
      setMetric("adminsCount");
      setChartType("column");
    } else if (focus === "archived") {
      setGroupBy("environment");
      setMetric("count");
      setChartType("table");
    }
  };

  const quickViews: Array<{ key: FocusKey; label: string; icon: JSX.Element }> = [
    { key: "all", label: "הכל", icon: <CheckCircle2 size={14} /> },
    { key: "attention", label: "דורשים טיפול", icon: <AlertTriangle size={14} /> },
    { key: "outdated", label: "מיושנים", icon: <GitBranch size={14} /> },
    { key: "staleBackups", label: "גיבויים", icon: <Clock3 size={14} /> },
    { key: "production", label: "ייצור", icon: <ShieldAlert size={14} /> },
    { key: "largeStorage", label: "נפחים", icon: <HardDrive size={14} /> },
    { key: "adminHeavy", label: "מנהלים", icon: <Users size={14} /> },
    { key: "archived", label: "ארכיון", icon: <Archive size={14} /> }
  ];

  if (loading) return <LoadingState label="טוען דשבורד גרפים..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="דשבורד גרפים"
        subtitle="תמונה רחבה שמראה איפה צריך תשומת לב, בלי לשנות נתונים"
        helpKey="analytics"
        actions={<button className="btn btn-secondary" type="button" onClick={load}><RefreshCcw size={15} />רענון</button>}
      />

      <OperationalSummary
        title="מפה מהירה של כל האתרים"
        purpose="המסך עוזר למצוא דפוסים: אתרים לא בריאים, גרסאות ישנות, גיבויים חסרים, נפחים גדולים ומנהלים רבים."
        state={`${formatNumber(filteredSites.length)} אתרים מוצגים · ${formatNumber(activeFilterCount)} פילטרים פעילים · ${formatNumber(jobs.length)} פעולות במערכת`}
        attention={attentionSites
          ? `${formatNumber(attentionSites)} אתרים מסוננים דורשים טיפול לפי סטטוס, תקינות, גרסה או גיבוי.`
          : failedJobs
            ? `${formatNumber(failedJobs)} פעולות נכשלו בתור הפעולות.`
            : "אין בעיה דחופה בתצוגה הנוכחית."}
        attentionTone={attentionSites || failedJobs ? "warning" : "success"}
        nextAction={attentionSites
          ? "לחצו על תצוגת דורשים טיפול ואז פתחו אתר מהרשימה."
          : staleBackups
            ? "לחצו על גיבויים כדי לראות איפה חסר גיבוי עדכני."
            : "בחרו תצוגה מהירה או קיבוץ כדי לענות על שאלה תפעולית."}
        tone={attentionSites || failedJobs ? "warning" : "success"}
      />

      <ModeBoundary
        title="מה בטוח לעשות כאן"
        items={[
          { label: "חיפוש ופילטרים", description: "קריאה בלבד. לא משנה אתרים או Jobs.", tone: "success" },
          { label: "תצוגות מהירות", description: "מסדרות את הגרפים לפי בעיות נפוצות.", tone: "info" },
          { label: "פתיחת אתר", description: "עוברת לדף האתר כדי לבצע בדיקה או פעולה מוגנת.", tone: "neutral" },
          { label: "ארכיון", description: "מוצג רק אם בוחרים לכלול רשומות ארכיון.", tone: "warning" }
        ]}
      />

      <div className="analytics-command-bar">
        <div className="analytics-command-main">
          <label className="analytics-search">
            <Search size={15} />
            <input value={filters.query} onChange={(e) => setFilter("query", e.target.value)} placeholder="חיפוש אתר, קוד, בעלים, יחידה או URL" />
          </label>
          <div className="analytics-command-actions">
            <span className="badge badge-neutral analytics-filter-count"><Filter size={13} />{formatNumber(activeFilterCount)} פילטרים</span>
            <button className="btn btn-secondary" type="button" onClick={() => setShowAdvancedFilters((value) => !value)}>
              <SlidersHorizontal size={15} />
              {showAdvancedFilters ? "סגור פילטרים" : "פילטרים מתקדמים"}
            </button>
            <button className="btn btn-secondary" type="button" onClick={() => setFilters(defaultFilters)}>נקה</button>
          </div>
        </div>
        <div className="analytics-quick-strip">
          <span className="analytics-strip-label">תצוגות מהירות</span>
          <div className="quick-view-row" aria-label="תצוגות מהירות">
            {quickViews.map((view) => (
              <button
                key={view.key}
                className={`quick-view-btn ${filters.focus === view.key ? "quick-view-btn-active" : ""}`}
                type="button"
                onClick={() => applyQuickView(view.key)}
              >
                {view.icon}
                <span>{view.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {showAdvancedFilters ? (
        <FilterBar>
          <label className="block">
            <span className="field-label"><HelpLabel helpKey="filters">סטטוס אתר</HelpLabel></span>
            <select className="control" value={filters.status} onChange={(e) => setFilter("status", e.target.value)}>
              <option value="all">הכל</option>
              {["active", "warning", "failed", "draft", "archived"].map((status) => <option key={status} value={status}>{siteStatusLabel(status)}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="field-label"><HelpLabel helpKey="health">תקינות</HelpLabel></span>
            <select className="control" value={filters.health} onChange={(e) => setFilter("health", e.target.value)}>
              <option value="all">הכל</option>
              {["healthy", "warning", "failed", "unknown"].map((status) => <option key={status} value={status}>{healthStatusLabel(status)}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="field-label"><HelpLabel helpKey="site.environment">סביבה</HelpLabel></span>
            <select className="control" value={filters.environment} onChange={(e) => setFilter("environment", e.target.value)}>
              <option value="all">הכל</option>
              {["production", "staging", "test", "dev", "local", "unknown"].map((env) => <option key={env} value={env}>{env}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="field-label"><HelpLabel helpKey="version.status">מצב גרסה</HelpLabel></span>
            <select className="control" value={filters.versionStatus} onChange={(e) => setFilter("versionStatus", e.target.value)}>
              <option value="all">הכל</option>
              {["up_to_date", "outdated", "updating", "failed", "unknown"].map((status) => <option key={status} value={status}>{versionStatusLabel(status)}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="field-label"><HelpLabel helpKey="backup">מצב גיבוי</HelpLabel></span>
            <select className="control" value={filters.backupStatus} onChange={(e) => setFilter("backupStatus", e.target.value)}>
              <option value="all">הכל</option>
              {["idle", "queued", "running", "succeeded", "failed", "unknown"].map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="field-label"><HelpLabel helpKey="site.adminSync">סנכרון מנהלים</HelpLabel></span>
            <select className="control" value={filters.adminSyncStatus} onChange={(e) => setFilter("adminSyncStatus", e.target.value)}>
              <option value="all">הכל</option>
              {["idle", "running", "succeeded", "failed", "unknown"].map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="field-label"><HelpLabel helpKey="site.connectorMode">מיקום widgets</HelpLabel></span>
            <select className="control" value={filters.widgetsDbTarget} onChange={(e) => setFilter("widgetsDbTarget", e.target.value)}>
              <option value="all">הכל</option>
              <option value="users">siteUsersDb</option>
              <option value="site">siteDB</option>
            </select>
          </label>
          <label className="block">
            <span className="field-label"><HelpLabel helpKey="site.owner">יחידה</HelpLabel></span>
            <select className="control" value={filters.unitName} onChange={(e) => setFilter("unitName", e.target.value)}>
              <option value="all">הכל</option>
              {options.units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="field-label"><HelpLabel helpKey="site.owner">בעל אתר</HelpLabel></span>
            <select className="control" value={filters.ownerName} onChange={(e) => setFilter("ownerName", e.target.value)}>
              <option value="all">הכל</option>
              {options.owners.map((owner) => <option key={owner} value={owner}>{owner}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="field-label"><HelpLabel helpKey="sharepoint.browserConnector">SharePoint host</HelpLabel></span>
            <select className="control" value={filters.host} onChange={(e) => setFilter("host", e.target.value)}>
              <option value="all">הכל</option>
              {options.hosts.map((host) => <option key={host} value={host}>{host}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 rounded-md border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <input type="checkbox" checked={filters.includeArchived} onChange={(e) => setFilter("includeArchived", e.target.checked)} />
            <span className="text-sm">כלול ארכיון</span>
          </label>
          <label className="block">
            <span className="field-label"><HelpLabel helpKey="filters">תאריך לסינון</HelpLabel></span>
            <select className="control" value={filters.dateField} onChange={(e) => setFilter("dateField", e.target.value as DateField)}>
              <option value="updatedAt">עודכן</option>
              <option value="createdAt">נוצר</option>
              <option value="lastHealthCheckAt">בדיקת תקינות</option>
              <option value="lastDeployAt">פריסה</option>
              <option value="lastBackupAt">גיבוי</option>
              <option value="lastAdminSyncAt">סנכרון מנהלים</option>
            </select>
          </label>
          <label className="block">
            <span className="field-label"><HelpLabel helpKey="filters">מתאריך</HelpLabel></span>
            <input className="control" type="date" value={filters.fromDate} onChange={(e) => setFilter("fromDate", e.target.value)} />
          </label>
          <label className="block">
            <span className="field-label"><HelpLabel helpKey="filters">עד תאריך</HelpLabel></span>
            <input className="control" type="date" value={filters.toDate} onChange={(e) => setFilter("toDate", e.target.value)} />
          </label>
          <label className="block">
            <span className="field-label"><HelpLabel helpKey="storage">אחסון מ־MB</HelpLabel></span>
            <input className="control" inputMode="numeric" value={filters.minStorageMb} onChange={(e) => setFilter("minStorageMb", e.target.value)} />
          </label>
          <label className="block">
            <span className="field-label"><HelpLabel helpKey="storage">אחסון עד MB</HelpLabel></span>
            <input className="control" inputMode="numeric" value={filters.maxStorageMb} onChange={(e) => setFilter("maxStorageMb", e.target.value)} />
          </label>
        </FilterBar>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard title="אתרים אחרי סינון" value={formatNumber(filteredSites.length)} icon={<SlidersHorizontal size={18} />} description={`מתוך ${formatNumber(sites.length)} רשומות`} tone="info" variant="inline" helpKey="filters" />
        <KpiCard title="אחסון רשום" value={formatMb(Math.round(totalStorage))} icon={<Database size={18} />} description="מבוסס metadata" tone="neutral" variant="inline" helpKey="storage" />
        <KpiCard title="מנהלים" value={formatNumber(totalAdmins)} icon={<Users size={18} />} description="סכום adminsCount" tone="info" variant="inline" helpKey="site.admins" />
        <KpiCard title="גיבויים חסרים/ישנים" value={formatNumber(staleBackups)} icon={<Activity size={18} />} description={`${formatNumber(totalBackups)} גיבויים רשומים`} tone={staleBackups ? "warning" : "success"} variant="inline" helpKey="backup.schedule" />
      </div>

      <SectionCard
        title="בונה גרפים"
        subtitle="בחרו שדה לקיבוץ ומדד. סוג הגרף והפילטרים המהירים נמצאים בתוך הגרף עצמו."
        helpKey="analytics"
        actions={<span className="badge badge-neutral"><BarChart3 size={13} />{formatNumber(chartRows.length)} קבוצות</span>}
      >
        <div className="analytics-builder-grid">
          <label className="block">
            <span className="field-label"><HelpLabel helpKey="analytics">קיבוץ לפי</HelpLabel></span>
            <select className="control" value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupKey)}>
              {(Object.keys(groupLabels) as GroupKey[]).map((key) => <option key={key} value={key}>{groupLabels[key]}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="field-label"><HelpLabel helpKey="analytics">מדד</HelpLabel></span>
            <select className="control" value={metric} onChange={(e) => setMetric(e.target.value as MetricKey)}>
              {(Object.keys(metricLabels) as MetricKey[]).map((key) => <option key={key} value={key}>{metricLabels[key]}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="field-label"><HelpLabel helpKey="analytics">Top groups</HelpLabel></span>
            <select className="control" value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
              {[6, 8, 12, 20, 50].map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        </div>

        <div className="chart-canvas mt-4">
          <div className="chart-toolbar">
            <div>
              <p className="font-bold" style={{ color: "var(--text-strong)" }}>{metricLabels[metric]} לפי {groupLabels[groupBy]}</p>
              <p className="text-xs muted">מסונן על {formatNumber(filteredSites.length)} אתרים · {focusLabels[filters.focus]}</p>
            </div>
            <div className="chart-toolbar-actions">
              <MetricQuickSwitch value={metric} onChange={setMetric} />
              <ChartTypeSwitch value={chartType} onChange={setChartType} />
            </div>
          </div>
          <div className="mini-filter-row">
            <MiniFilterButton active={filters.focus === "attention"} label="בעיות" icon={<AlertTriangle size={13} />} onClick={() => applyQuickView(filters.focus === "attention" ? "all" : "attention")} />
            <MiniFilterButton active={filters.focus === "outdated"} label="מיושן" icon={<GitBranch size={13} />} onClick={() => applyQuickView(filters.focus === "outdated" ? "all" : "outdated")} />
            <MiniFilterButton active={filters.focus === "staleBackups"} label="גיבוי" icon={<Clock3 size={13} />} onClick={() => applyQuickView(filters.focus === "staleBackups" ? "all" : "staleBackups")} />
            <MiniFilterButton active={filters.focus === "largeStorage"} label="נפח" icon={<HardDrive size={13} />} onClick={() => applyQuickView(filters.focus === "largeStorage" ? "all" : "largeStorage")} />
            <MiniFilterButton active={filters.includeArchived} label="ארכיון" icon={<Archive size={13} />} onClick={() => setFilter("includeArchived", !filters.includeArchived)} />
          </div>
          <AnalyticsChart type={chartType} rows={chartRows} metric={metric} />
        </div>
      </SectionCard>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <SectionCard
          title="תקינות לפי סביבה"
          subtitle="Heatmap לפי האתרים המסוננים"
          helpKey="health"
          actions={(
            <div className="mini-filter-row mini-filter-row-tight">
              <MiniFilterButton active={filters.health === "failed"} label="נכשל" icon={<ShieldAlert size={13} />} onClick={() => setFilter("health", filters.health === "failed" ? "all" : "failed")} />
              <MiniFilterButton active={filters.health === "warning"} label="אזהרה" icon={<AlertTriangle size={13} />} onClick={() => setFilter("health", filters.health === "warning" ? "all" : "warning")} />
              <MiniFilterButton active={filters.environment === "production"} label="Prod" icon={<Activity size={13} />} onClick={() => setFilter("environment", filters.environment === "production" ? "all" : "production")} />
            </div>
          )}
        >
          <div className="heatmap-grid" style={{ gridTemplateColumns: `9rem repeat(${heatmapHealth.length}, minmax(5rem, 1fr))` }}>
            <div />
            {heatmapHealth.map((health) => <div className="heatmap-head" key={health}>{healthStatusLabel(health)}</div>)}
            {heatmapEnvironments.map((env) => (
              <Fragment key={env}>
                <div className="heatmap-row-label" key={`${env}-label`}>{env}</div>
                {heatmapHealth.map((health) => {
                  const count = filteredSites.filter((site) => (site.environment || "unknown") === env && site.derivedHealthStatus === health).length;
                  const opacity = 0.12 + (count / heatmapMax) * 0.72;
                  return (
                    <div className="heatmap-cell" key={`${env}-${health}`} style={{ background: `color-mix(in srgb, var(--accent) ${Math.round(opacity * 100)}%, var(--surface))` }}>
                      <span className="num">{formatNumber(count)}</span>
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="גרסאות נפוצות"
          subtitle="התפלגות currentVersion / version"
          helpKey="version.current"
          actions={(
            <div className="chart-toolbar-actions">
              <div className="mini-filter-row mini-filter-row-tight">
                <MiniFilterButton active={filters.versionStatus === "outdated"} label="מיושן" icon={<GitBranch size={13} />} onClick={() => setFilter("versionStatus", filters.versionStatus === "outdated" ? "all" : "outdated")} />
              </div>
              <ChartTypeSwitch value={versionChartType} onChange={setVersionChartType} allowed={["bar", "column", "donut", "line", "table"]} />
            </div>
          )}
        >
          <AnalyticsChart type={versionChartType} rows={versionRows} metric="count" />
        </SectionCard>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <SectionCard
          title="Jobs לפי סטטוס"
          subtitle="כל ה־Jobs שה־API מחזיר כרגע"
          helpKey="job.status"
          actions={<ChartTypeSwitch value={jobChartType} onChange={setJobChartType} allowed={["bar", "column", "donut", "table"]} />}
        >
          <AnalyticsChart type={jobChartType} rows={jobRows} metric="count" />
        </SectionCard>

        <SectionCard
          title="Top sites לפי המדד הנבחר"
          subtitle="רשימת אתרים מתוך התוצאה המסוננת"
          helpKey="sites.registry"
          actions={<MetricQuickSwitch value={metric} onChange={setMetric} />}
        >
          {topSites.length ? (
            <DataTable
              columns={siteColumns}
              rows={topSites}
              rowKey={(site) => site._id}
              minWidth={980}
              density="dense"
              mobileCard={(site) => (
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link className="truncate font-bold hover:underline" style={{ color: "var(--text-strong)" }} to={`/sites/${site._id}`}>{site.displayName}</Link>
                      <p className="num text-xs muted">{site.siteCode}</p>
                    </div>
                    <span className="num badge badge-neutral">{formatMetricValue(metricValue(site, metric), metric)}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge status={site.status} />
                    <HealthBadge status={site.derivedHealthStatus} />
                    <VersionBadge status={site.versionStatus} />
                  </div>
                  <p className="num text-xs muted">{formatDateTime(site.updatedAt)}</p>
                </div>
              )}
            />
          ) : <EmptyState title="אין אתרים להצגה" description="שנו את הפילטרים כדי לראות אתרים." />}
        </SectionCard>
      </div>
    </div>
  );
}
