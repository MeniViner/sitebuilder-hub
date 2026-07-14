import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, BarChart3, Camera, CheckCircle2, FlaskConical, Gauge, RefreshCw } from "lucide-react";
import { EmptyState } from "../EmptyState";
import { ErrorState } from "../ErrorState";
import { LoadingState } from "../LoadingState";
import { PageHeader } from "../PageHeader";
import type {
  DashboardLabData,
  DashboardLabLoadState,
  LabCapability,
  LabChartRow,
  LabMetric,
  LabRiskItem,
  LabTone
} from "./dashboardLabTypes";
import { capabilityModeLabel, formatPercent, pct, severityLabelHe, toneClass } from "./dashboardLabUtils";
import { formatDateTime, formatNumber } from "./dashboardLabData";

export type DashboardLabConceptId = "command" | "executive" | "operations" | "analytics" | "production-candidate";

export type DashboardLabConceptOption = {
  id: DashboardLabConceptId;
  label: string;
  caption: string;
  icon: ReactNode;
};

export const dashboardLabConcepts: DashboardLabConceptOption[] = [
  { id: "production-candidate", label: "מועמד לדשבורד ראשי", caption: "כיוון סופי לבדיקה חזותית", icon: <Gauge size={16} /> },
  { id: "command", label: "Command Center", caption: "מה דורש טיפול עכשיו", icon: <AlertTriangle size={16} /> },
  { id: "executive", label: "Executive", caption: "סיפור ניהולי רגוע", icon: <CheckCircle2 size={16} /> },
  { id: "operations", label: "Operations", caption: "קוקפיט טכני לפעולה", icon: <FlaskConical size={16} /> },
  { id: "analytics", label: "Visual Analytics", caption: "גרפים בלי טרנדים מזויפים", icon: <BarChart3 size={16} /> }
];

export function DashboardLabShell({
  activeConcept,
  onConceptChange,
  qaMode = false,
  state,
  children
}: {
  activeConcept: DashboardLabConceptId;
  onConceptChange: (concept: DashboardLabConceptId) => void;
  qaMode?: boolean;
  state: DashboardLabLoadState;
  children: ReactNode;
}) {
  return (
    <div className={`dashboard-lab ${qaMode ? "dashboard-lab-qa" : ""}`}>
      {qaMode ? (
        <div className="lab-qa-strip" role="note" aria-label="מצב צילום מסך במעבדת הדשבורד">
          <span>
            <strong>מצב צילום מסך · מעבדה בלבד</strong>
            <small>מוצג מועמד לדשבורד ראשי; הדשבורד ב־#/ לא השתנה.</small>
          </span>
          <div>
            <button className="btn btn-secondary" type="button" onClick={() => void state.refresh()} disabled={state.loading}>
              <RefreshCw size={16} />
              {state.loading ? "מרענן..." : "רענון"}
            </button>
            <Link className="btn btn-secondary" to="/dashboard-lab?concept=production-candidate">
              <ArrowLeft size={16} />
              חזרה למעבדה
            </Link>
          </div>
        </div>
      ) : (
        <>
          <PageHeader
            eyebrow="Dashboard Lab"
            title="מעבדת דשבורד"
            subtitle="מסך ניסוי נפרד להשוואת כיווני דשבורד. הדשבורד הקיים נשאר בעמוד הבית."
            actions={
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-secondary" type="button" onClick={() => void state.refresh()} disabled={state.loading}>
                  <RefreshCw size={16} />
                  {state.loading ? "מרענן..." : "רענון"}
                </button>
                <Link className="btn btn-secondary" to="/dashboard-lab?concept=production-candidate&qa=1">
                  <Camera size={16} />
                  מצב צילום
                </Link>
                <Link className="btn btn-secondary" to="/">
                  <ArrowLeft size={16} />
                  דשבורד קיים
                </Link>
              </div>
            }
          />

          <div className="lab-tabs" role="tablist" aria-label="בחירת קונספט דשבורד">
            {dashboardLabConcepts.map((concept) => (
              <button
                key={concept.id}
                type="button"
                role="tab"
                aria-selected={concept.id === activeConcept}
                className={`lab-tab ${concept.id === activeConcept ? "lab-tab-active" : ""}`}
                onClick={() => onConceptChange(concept.id)}
              >
                <span className="lab-tab-icon" aria-hidden="true">{concept.icon}</span>
                <span>
                  <strong>{concept.label}</strong>
                  <small>{concept.caption}</small>
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {children}
    </div>
  );
}

export function DashboardLabState({
  state,
  conceptName,
  children
}: {
  state: DashboardLabLoadState;
  conceptName: string;
  children: (data: DashboardLabData) => ReactNode;
}) {
  if (state.loading && !state.data) {
    return <LoadingState label={`טוען ${conceptName}...`} />;
  }

  if (state.error) {
    return <ErrorState message={state.error} onRetry={() => void state.refresh()} />;
  }

  if (!state.data) {
    return <LoadingState label="מכין נתוני דשבורד..." />;
  }

  if (state.data.empty) {
    return (
      <EmptyState
        title="אין עדיין נתוני Hub להצגה"
        description="כאשר יתווספו אתרים, Jobs או סטטוסי מערכת, הקונספט הזה יציג סיכום אמיתי בלי נתוני דמו."
        action={<button className="btn btn-secondary" type="button" onClick={() => void state.refresh()}>בדיקה מחדש</button>}
      />
    );
  }

  return <>{children(state.data)}</>;
}

export function LabStatusPill({ tone, children }: { tone: LabTone; children: ReactNode }) {
  return <span className={`lab-pill ${toneClass[tone]}`}>{children}</span>;
}

export function LabPanel({
  eyebrow,
  title,
  subtitle,
  action,
  children,
  className = ""
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`lab-panel ${className}`}>
      <div className="lab-panel-header">
        <div className="min-w-0">
          {eyebrow ? <p className="lab-eyebrow">{eyebrow}</p> : null}
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {action ? <div className="lab-panel-action">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function LabMetricGrid({ metrics, compact = false }: { metrics: LabMetric[]; compact?: boolean }) {
  return (
    <div className={`lab-metric-grid ${compact ? "lab-metric-grid-compact" : ""}`}>
      {metrics.map((item) => {
        const content = (
          <>
            <span className="field-label">{item.label}</span>
            <strong className="num">{item.value}</strong>
            <small>{item.detail}</small>
          </>
        );
        return item.to ? (
          <Link key={item.key} className={`lab-metric ${toneClass[item.tone]}`} to={item.to}>{content}</Link>
        ) : (
          <div key={item.key} className={`lab-metric ${toneClass[item.tone]}`}>{content}</div>
        );
      })}
    </div>
  );
}

export function LabCapabilityStrip({ capabilities, compact = false }: { capabilities: LabCapability[]; compact?: boolean }) {
  return (
    <div className={`lab-capability-strip ${compact ? "lab-capability-strip-compact" : ""}`}>
      {capabilities.map((capability) => (
        <Link key={capability.key} className={`lab-capability ${toneClass[capability.tone]}`} to={capability.to}>
          <span className="lab-capability-mode">{capabilityModeLabel[capability.mode]}</span>
          <strong>{capability.label}</strong>
          <small>{capability.detail}</small>
        </Link>
      ))}
    </div>
  );
}

export function LabPriorityQueue({ items, limit = 5 }: { items: LabRiskItem[]; limit?: number }) {
  return (
    <div className="lab-priority-list">
      {items.slice(0, limit).map((item, index) => (
        <Link key={item.key} className={`lab-priority-item ${toneClass[item.tone]}`} to={item.to}>
          <span className="lab-priority-rank num">{index + 1}</span>
          <span className="lab-priority-copy">
            <span className="lab-priority-meta">
              <span>{severityLabelHe[item.severity]}</span>
              {item.meta ? <span className="num">{item.meta}</span> : null}
            </span>
            <strong>{item.title}</strong>
            <small>{item.description}</small>
          </span>
          <span className="lab-link-chip">{item.actionLabel}</span>
        </Link>
      ))}
    </div>
  );
}

export function LabSegmentedBar({ rows, total }: { rows: LabChartRow[]; total?: number }) {
  const sum = total ?? rows.reduce((acc, row) => acc + row.value, 0);
  return (
    <div className="lab-segmented-wrap">
      <div className="lab-segmented-bar" aria-hidden="true">
        {rows.map((row) => (
          <span key={row.key} style={{ width: `${Math.max(row.value ? 3 : 0, pct(row.value, Math.max(sum, 1)))}%`, background: row.color || "var(--accent)" }} />
        ))}
      </div>
      <div className="lab-chart-legend">
        {rows.map((row) => (
          <span key={row.key}>
            <i style={{ background: row.color || "var(--accent)" }} />
            <em>{row.label}</em>
            <b className="num">{row.formattedValue || formatNumber(row.value)}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

export function LabHorizontalBars({ rows, total, limit = 6 }: { rows: LabChartRow[]; total?: number; limit?: number }) {
  const visible = rows.slice(0, limit);
  const max = Math.max(total ?? 0, ...visible.map((row) => row.value), 1);
  return (
    <div className="lab-hbar-list">
      {visible.map((row) => {
        const bar = (
          <>
            <span className="lab-hbar-label">
              <strong>{row.label}</strong>
              <b className="num">{row.formattedValue || formatNumber(row.value)}</b>
            </span>
            <span className="lab-hbar-track" aria-hidden="true">
              <span style={{ width: `${Math.max(row.value ? 4 : 0, pct(row.value, max))}%`, background: row.color || "var(--accent)" }} />
            </span>
          </>
        );
        return row.to ? <Link key={row.key} className="lab-hbar-row" to={row.to}>{bar}</Link> : <div key={row.key} className="lab-hbar-row">{bar}</div>;
      })}
    </div>
  );
}

export function LabDonut({
  rows,
  centerValue,
  centerLabel
}: {
  rows: LabChartRow[];
  centerValue: string;
  centerLabel: string;
}) {
  const total = rows.reduce((acc, row) => acc + row.value, 0);
  let cursor = 0;
  const segments = total
    ? rows.map((row) => {
        const start = cursor;
        const end = cursor + (row.value / total) * 100;
        cursor = end;
        return `${row.color || "var(--accent)"} ${start}% ${end}%`;
      }).join(", ")
    : "var(--border) 0 100%";

  return (
    <div className="lab-donut-wrap">
      <div className="lab-donut" style={{ background: `conic-gradient(${segments})` }} aria-hidden="true">
        <span>
          <strong className="num">{centerValue}</strong>
          <small>{centerLabel}</small>
        </span>
      </div>
      <LabSegmentedBar rows={rows} total={total} />
    </div>
  );
}

export function LabActivityTimeline({ data }: { data: DashboardLabData }) {
  if (!data.recentActivity.length) {
    return <EmptyState title="אין פעילות אחרונה" description="פעילות תופיע כאן אחרי Jobs, בדיקות Health, גיבויים או פריסות." />;
  }
  return (
    <div className="lab-timeline">
      {data.recentActivity.map((item) => (
        <Link key={item.key} className={`lab-timeline-row ${toneClass[item.tone]}`} to={item.to}>
          <span className="lab-timeline-dot" aria-hidden="true" />
          <span>{item.label}</span>
          <time className="num">{formatDateTime(item.at)}</time>
        </Link>
      ))}
    </div>
  );
}

export function LabWatchlist({ data, limit = 5 }: { data: DashboardLabData; limit?: number }) {
  if (!data.watchlist.length) {
    return <EmptyState title="אין Watchlist פתוח" description="לא נמצאו אתרים עם כשל, גיבוי חסר, פער גרסה או פער הרשאות." />;
  }
  return (
    <div className="lab-watchlist">
      {data.watchlist.slice(0, limit).map((item) => (
        <Link key={item.site._id} className={`lab-watch-row ${toneClass[item.tone]}`} to={item.to}>
          <span>
            <strong>{item.site.displayName}</strong>
            <small className="num">{item.site.siteCode}</small>
          </span>
          <span>
            <b>{item.title}</b>
            <small>{item.detail}</small>
          </span>
        </Link>
      ))}
    </div>
  );
}

export function LabScoreLine({ label, value, detail, tone }: { label: string; value: number; detail: string; tone: LabTone }) {
  return (
    <div className={`lab-score-line ${toneClass[tone]}`}>
      <div>
        <strong>{label}</strong>
        <small>{detail}</small>
      </div>
      <span className="num">{formatPercent(value)}</span>
      <div className="lab-score-track" aria-hidden="true"><span style={{ width: `${Math.max(4, Math.min(100, value))}%` }} /></div>
    </div>
  );
}
