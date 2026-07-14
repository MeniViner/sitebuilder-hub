import { Link } from "react-router-dom";
import { ArrowUpLeft, BarChart3, Grid2X2, PieChart } from "lucide-react";
import type { DashboardLabData } from "../dashboard-lab/dashboardLabTypes";
import { formatNumber } from "../dashboard-lab/dashboardLabData";
import { formatPercent } from "../dashboard-lab/dashboardLabUtils";
import {
  StudioCapabilityStrip,
  StudioDomainStrip,
  StudioHorizontalBars,
  StudioMetricChips,
  StudioSegmentedChart
} from "./DashboardDesignStudioShell";
import {
  compactPriorityQueue,
  dashboardPosture,
  primaryMetrics,
  selectCoreCapabilities,
  studioToneClass
} from "./designStudioUtils";

export function CleanBentoAnalyticsArtboard({ data }: { data: DashboardLabData }) {
  const posture = dashboardPosture(data);
  const topRisks = compactPriorityQueue(data, 3);

  return (
    <article className="dstudio-artboard clean-bento-artboard">
      <section className="clean-bento-hero">
        <div>
          <p className="dstudio-kicker">
            <Grid2X2 size={16} />
            Bento אנליטי · נתונים חיים
          </p>
          <h2>תמונת צי נקייה בלי להמציא טרנדים</h2>
          <p>{posture.copy}</p>
        </div>
        <Link className={`clean-bento-top-action ${studioToneClass[data.primaryAction.tone]}`} to={data.primaryAction.to}>
          <span>פעולה מוצעת</span>
          <strong>{data.primaryAction.title}</strong>
          <small>
            {data.primaryAction.actionLabel}
            <ArrowUpLeft size={14} />
          </small>
        </Link>
      </section>

      <StudioMetricChips metrics={primaryMetrics(data)} />

      <section className="clean-bento-grid">
        <div className="clean-bento-panel clean-bento-panel-large">
          <div className="dstudio-section-heading">
            <span>
              <PieChart size={17} />
              בריאות, גרסה וגיבוי
            </span>
            <small>שלושה snapshots בלבד</small>
          </div>
          <div className="clean-bento-chart-stack">
            <StudioSegmentedChart rows={data.distributions.health} total={data.counts.totalSites} label="Health distribution" />
            <div className="clean-bento-adoption">
              <div>
                <span>אימוץ גרסה</span>
                <strong className="num">{formatPercent(data.releaseAdoptionPercent)}</strong>
                <small>{formatNumber(data.counts.outdatedSites)} מאחורי latest</small>
              </div>
              <i aria-hidden="true">
                <em style={{ width: `${Math.max(4, Math.round(data.releaseAdoptionPercent))}%` }} />
              </i>
            </div>
            <StudioHorizontalBars rows={data.distributions.backupFreshness} total={data.counts.activeSites} limit={4} />
          </div>
        </div>

        <div className="clean-bento-panel clean-bento-risk-panel">
          <div className="dstudio-section-heading">
            <span>
              <BarChart3 size={17} />
              קטגוריות תשומת לב
            </span>
            <small>לא רשימת Activity</small>
          </div>
          {data.distributions.riskCategories.length ? (
            <StudioHorizontalBars rows={data.distributions.riskCategories} total={Math.max(data.counts.attentionItems, 1)} limit={5} />
          ) : (
            <p className="clean-bento-empty">אין כרגע קטגוריות סיכון פתוחות.</p>
          )}
        </div>

        <div className="clean-bento-panel clean-bento-priority-panel">
          <div className="dstudio-section-heading">
            <span>שלושה דברים לפתוח</span>
            <small>קצר, בלי evidence גולמי</small>
          </div>
          <div className="clean-bento-risk-list">
            {topRisks.map((risk) => (
              <Link key={risk.key} className={`clean-bento-risk ${studioToneClass[risk.tone]}`} to={risk.to}>
                <strong>{risk.title}</strong>
                <span>{risk.actionLabel}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="clean-bento-panel clean-bento-domain-panel">
          <div className="dstudio-section-heading">
            <span>כשירות תחומית</span>
            <small>Deploy / Recovery / Access / Health</small>
          </div>
          <StudioDomainStrip domains={data.domains} compact />
        </div>
      </section>

      <StudioCapabilityStrip capabilities={selectCoreCapabilities(data)} title="יכולות מקור" />
    </article>
  );
}
