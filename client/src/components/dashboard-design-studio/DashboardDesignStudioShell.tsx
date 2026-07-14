import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, ArrowUpLeft, CheckCircle2, Compass, RefreshCw } from "lucide-react";
import type {
  DashboardLabData,
  DashboardLabLoadState,
  LabCapability,
  LabChartRow,
  LabDomain,
  LabMetric,
  LabRiskItem,
  LabTone
} from "../dashboard-lab/dashboardLabTypes";
import { formatNumber } from "../dashboard-lab/dashboardLabData";
import { formatPercent } from "../dashboard-lab/dashboardLabUtils";
import {
  capabilityModeText,
  chartPercent,
  domainSignal,
  domainStatusLabel,
  selectCoreCapabilities,
  severityLabel,
  studioToneClass
} from "./designStudioUtils";

export type DesignStudioViewId = "morning-brief" | "operations-board" | "fleet-map" | "clean-bento";

export const designStudioViews: Array<{ id: DesignStudioViewId; label: string; description: string }> = [
  { id: "morning-brief", label: "מצב הבוקר", description: "Executive brief" },
  { id: "operations-board", label: "לוח תפעול", description: "Operator board" },
  { id: "fleet-map", label: "מפת אתרים", description: "Fleet topology" },
  { id: "clean-bento", label: "Bento נקי", description: "Analytics" }
];

export function DashboardDesignStudioShell({
  activeView,
  onViewChange,
  qaMode,
  children
}: {
  activeView: DesignStudioViewId;
  onViewChange: (view: DesignStudioViewId) => void;
  qaMode: boolean;
  children: ReactNode;
}) {
  const active = designStudioViews.find((view) => view.id === activeView) || designStudioViews[0];

  return (
    <main className={`dashboard-design-studio${qaMode ? " dstudio-qa" : ""}`} dir="rtl">
      {qaMode ? (
        <div className="dstudio-qa-label">מעבדת עיצוב · נתונים חיים · {active.label}</div>
      ) : (
        <header className="dstudio-shell-header">
          <div>
            <p className="dstudio-kicker">מעבדת עיצוב לדשבורד · לא Production</p>
            <h1>ארבעה כיווני דשבורד חדשים</h1>
            <p>מסך מחקר מנותק מה־AppShell. הדשבורד הראשי נשאר ללא שינוי.</p>
          </div>
          <nav className="dstudio-view-switcher" aria-label="בחירת ארטבורד">
            {designStudioViews.map((view) => (
              <button
                key={view.id}
                className={view.id === activeView ? "active" : ""}
                type="button"
                onClick={() => onViewChange(view.id)}
              >
                <strong>{view.label}</strong>
                <span>{view.description}</span>
              </button>
            ))}
          </nav>
        </header>
      )}
      {children}
    </main>
  );
}

export function DesignStudioState({
  type,
  state
}: {
  type: "loading" | "error" | "empty";
  state: DashboardLabLoadState;
}) {
  const isError = type === "error";
  const isEmpty = type === "empty";
  return (
    <section className="dstudio-state" aria-live="polite">
      <span className={`dstudio-state-icon ${isError ? "dstudio-tone-danger" : isEmpty ? "dstudio-tone-warning" : "dstudio-tone-info"}`}>
        {isError ? <AlertCircle size={22} /> : isEmpty ? <Compass size={22} /> : <RefreshCw size={22} />}
      </span>
      <h2>{isError ? "לא הצלחנו לטעון את נתוני הסטודיו" : isEmpty ? "אין עדיין צי אתרים להצגה" : "טוען תמונת מצב חיה"}</h2>
      <p>
        {isError
          ? state.error
          : isEmpty
            ? "הארטבורדים יופיעו כאן אחרי שה־Hub יכיר אתרים או פעולות."
            : "המסך משתמש באותו data layer של Dashboard Lab, בלי נתוני היסטוריה מומצאים."}
      </p>
      {isError ? (
        <button className="dstudio-action" type="button" onClick={() => void state.refresh()}>
          <RefreshCw size={16} />
          נסה שוב
        </button>
      ) : null}
    </section>
  );
}

export function StudioMetricStrip({ metrics, tone = "neutral" }: { metrics: LabMetric[]; tone?: LabTone }) {
  return (
    <div className="dstudio-metric-strip">
      {metrics.map((metric) => (
        <Link key={metric.key} className={`dstudio-metric ${studioToneClass[metric.tone || tone]}`} to={metric.to || "/"}>
          <span>{metric.label}</span>
          <strong className="num">{metric.value}</strong>
          <small>{metric.detail}</small>
        </Link>
      ))}
    </div>
  );
}

export function StudioMetricChips({ metrics }: { metrics: LabMetric[] }) {
  return (
    <div className="dstudio-metric-chips">
      {metrics.map((metric) => (
        <Link key={metric.key} className={`dstudio-metric-chip ${studioToneClass[metric.tone]}`} to={metric.to || "/"}>
          <span>{metric.label}</span>
          <b className="num">{metric.value}</b>
          <small>{metric.detail}</small>
        </Link>
      ))}
    </div>
  );
}

export function StudioPriorityList({
  items,
  title = "מה לפתוח קודם",
  compact = false
}: {
  items: LabRiskItem[];
  title?: string;
  compact?: boolean;
}) {
  return (
    <section className={`dstudio-priority ${compact ? "dstudio-priority-compact" : ""}`}>
      <div className="dstudio-section-heading">
        <span>{title}</span>
        <small>עד 4 פריטים · בלי raw evidence</small>
      </div>
      <div className="dstudio-priority-list">
        {items.slice(0, 4).map((item, index) => (
          <Link key={item.key} className={`dstudio-priority-row ${studioToneClass[item.tone]}`} to={item.to}>
            <span className="dstudio-priority-index num">{index + 1}</span>
            <span className="dstudio-priority-copy">
              <span>{severityLabel(item)}</span>
              <strong>{item.title}</strong>
              <small>{item.description}</small>
            </span>
            <span className="dstudio-link-label">
              {item.actionLabel}
              <ArrowUpLeft size={15} />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function StudioCapabilityStrip({
  capabilities,
  title = "מצב יכולות"
}: {
  capabilities: LabCapability[];
  title?: string;
}) {
  return (
    <section className="dstudio-capability-strip">
      <span>{title}</span>
      <div>
        {capabilities.map((capability) => (
          <Link key={capability.key} className={`dstudio-capability ${studioToneClass[capability.tone]}`} to={capability.to}>
            <i aria-hidden="true" />
            <strong>{capability.label}</strong>
            <small>{capabilityModeText(capability)}</small>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function StudioDomainStrip({
  domains,
  compact = false
}: {
  domains: LabDomain[];
  compact?: boolean;
}) {
  return (
    <div className={`dstudio-domain-strip ${compact ? "dstudio-domain-strip-compact" : ""}`}>
      {domains.map((domain) => {
        const signal = domainSignal(domain);
        return (
          <Link key={domain.key} className={`dstudio-domain-cell ${studioToneClass[domain.tone]}`} to={domain.to}>
            <span>{domain.title}</span>
            <strong>{domainStatusLabel(domain.tone)}</strong>
            <small>{signal.text}</small>
          </Link>
        );
      })}
    </div>
  );
}

export function StudioSegmentedChart({
  rows,
  total,
  label
}: {
  rows: LabChartRow[];
  total?: number;
  label?: string;
}) {
  const sum = Math.max(total ?? rows.reduce((acc, row) => acc + row.value, 0), 1);
  const visible = rows.filter((row) => row.value > 0 || rows.length <= 4);
  return (
    <div className="dstudio-segmented-chart">
      {label ? <span className="dstudio-chart-label">{label}</span> : null}
      <div className="dstudio-segmented-track" aria-hidden="true">
        {visible.map((row) => (
          <span
            key={row.key}
            className={row.tone ? studioToneClass[row.tone] : ""}
            style={{ width: `${Math.max(row.value ? 3 : 0, chartPercent(row.value, sum))}%`, backgroundColor: row.color || undefined }}
          />
        ))}
      </div>
      <div className="dstudio-chart-legend">
        {visible.map((row) => (
          <span key={row.key}>
            <i style={{ backgroundColor: row.color || undefined }} />
            <em>{row.label}</em>
            <b className="num">{row.formattedValue || formatNumber(row.value)}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

export function StudioHorizontalBars({
  rows,
  total,
  limit = 5
}: {
  rows: LabChartRow[];
  total?: number;
  limit?: number;
}) {
  const visible = rows.slice(0, limit);
  const max = Math.max(total ?? 0, ...visible.map((row) => row.value), 1);
  return (
    <div className="dstudio-bars">
      {visible.map((row) => {
        const content = (
          <>
            <span>
              <strong>{row.label}</strong>
              <b className="num">{row.formattedValue || formatNumber(row.value)}</b>
            </span>
            <i aria-hidden="true">
              <em style={{ width: `${Math.max(row.value ? 4 : 0, chartPercent(row.value, max))}%`, backgroundColor: row.color || undefined }} />
            </i>
          </>
        );
        const className = `dstudio-bar-row ${row.tone ? studioToneClass[row.tone] : ""}`;
        return row.to ? (
          <Link key={row.key} className={className} to={row.to}>{content}</Link>
        ) : (
          <div key={row.key} className={className}>{content}</div>
        );
      })}
    </div>
  );
}

export function StudioReadinessSummary({ data }: { data: DashboardLabData }) {
  const coreCapabilities = selectCoreCapabilities(data);
  return (
    <aside className="dstudio-readiness-summary">
      <div>
        <span>כשירות גרסה</span>
        <strong className="num">{formatPercent(data.releaseAdoptionPercent)}</strong>
        <small>{formatNumber(data.counts.outdatedSites)} מאחורי latest</small>
      </div>
      <div>
        <span>כשירות גיבוי</span>
        <strong className="num">{formatPercent(data.backupReliabilityPercent)}</strong>
        <small>{formatNumber(data.counts.backupRiskSites)} אתרים בסיכון</small>
      </div>
      <div>
        <span>חיבורים</span>
        <strong>{coreCapabilities.filter((capability) => capability.mode === "live").length}/{coreCapabilities.length}</strong>
        <small>יכולות live</small>
      </div>
    </aside>
  );
}

export function StudioSnapshotPanel({ data, variant = "stacked" }: { data: DashboardLabData; variant?: "stacked" | "wide" }) {
  return (
    <section className={`dstudio-snapshot-panel dstudio-snapshot-${variant}`}>
      <div className="dstudio-section-heading">
        <span>תמונת מצב חזותית</span>
        <small>Snapshot בלבד · ללא טרנדים מומצאים</small>
      </div>
      <div className="dstudio-snapshot-grid">
        <StudioSegmentedChart rows={data.distributions.health} total={data.counts.totalSites} label="Health" />
        <StudioHorizontalBars rows={data.distributions.backupFreshness} total={data.counts.activeSites} limit={4} />
        <div className="dstudio-release-block">
          <span>אימוץ גרסה</span>
          <strong className="num">{formatPercent(data.releaseAdoptionPercent)}</strong>
          <i aria-hidden="true">
            <em style={{ width: `${Math.max(4, Math.round(data.releaseAdoptionPercent))}%` }} />
          </i>
          <small>{formatNumber(data.counts.outdatedSites)} אתרים מאחורי latest · {data.latestVersion}</small>
        </div>
      </div>
    </section>
  );
}

export function StudioAllClearMark({ label = "אין חסימה מרכזית כרגע" }: { label?: string }) {
  return (
    <span className="dstudio-all-clear">
      <CheckCircle2 size={16} />
      {label}
    </span>
  );
}
