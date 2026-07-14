import { Link } from "react-router-dom";
import { ArrowLeft, BriefcaseBusiness, DatabaseBackup, GitBranch, HeartPulse } from "lucide-react";
import type { DashboardLabLoadState } from "./dashboardLabTypes";
import {
  DashboardLabState,
  LabActivityTimeline,
  LabDonut,
  LabHorizontalBars,
  LabMetricGrid,
  LabPanel,
  LabScoreLine,
  LabStatusPill
} from "./DashboardLabShell";
import { formatNumber } from "./dashboardLabData";
import { toneClass } from "./dashboardLabUtils";

export function DashboardConceptExecutive({ state }: { state: DashboardLabLoadState }) {
  return (
    <DashboardLabState state={state} conceptName="Executive Overview">
      {(data) => (
        <div className="lab-concept lab-executive">
          <section className={`lab-exec-hero ${toneClass[data.overallTone]}`}>
            <div className="lab-exec-story">
              <LabStatusPill tone={data.overallTone}>{data.overallSeverity === "clear" ? "Ready" : "Needs review"}</LabStatusPill>
              <h2>{data.overallSeverity === "clear" ? "הצי נראה מוכן להמשך עבודה" : "יש סיכונים ממוקדים, לא רעש מערכת"}</h2>
              <p>{data.overallSubtitle}</p>
              <div className="lab-action-row">
                <Link className="btn btn-primary" to={data.primaryAction.to}><ArrowLeft size={16} />{data.primaryAction.actionLabel}</Link>
                <Link className="btn btn-secondary" to="/analytics">תובנות עומק</Link>
              </div>
            </div>
            <div className="lab-exec-score">
              <span className="lab-exec-score-icon" aria-hidden="true"><BriefcaseBusiness size={22} /></span>
              <strong className="num">{formatNumber(data.counts.activeSites)}</strong>
              <small>אתרים פעילים בצי</small>
              <em>{formatNumber(data.counts.attentionItems)} מוקדי תשומת לב</em>
            </div>
          </section>

          <LabMetricGrid metrics={data.executiveMetrics} />

          <div className="lab-exec-grid">
            <LabPanel eyebrow="Fleet Story" title="תמונת צי רגועה" subtitle="סיכום ניהולי בלי Evidence טכני">
              <div className="lab-exec-fleet">
                <LabDonut rows={data.distributions.health} centerValue={`${Math.round(data.healthScorePercent)}%`} centerLabel="Health" />
                <LabHorizontalBars rows={data.distributions.storage} total={data.counts.activeSites} limit={4} />
              </div>
            </LabPanel>

            <LabPanel eyebrow="Readiness" title="גרסה וגיבוי" subtitle="שני המדדים שמחליטים אם ממשיכים או עוצרים">
              <div className="lab-score-stack">
                <LabScoreLine label="Release readiness" value={data.releaseAdoptionPercent} detail={`${formatNumber(data.counts.outdatedSites)} אתרים מאחורי latest`} tone={data.counts.outdatedSites ? "warning" : "success"} />
                <LabScoreLine label="Backup reliability" value={data.backupReliabilityPercent} detail={`${formatNumber(data.counts.backupRiskSites)} אתרים בסיכון Recovery`} tone={data.counts.backupRiskSites ? "warning" : "success"} />
              </div>
              <div className="lab-exec-readiness-links">
                <Link to="/releases"><GitBranch size={16} />גרסאות</Link>
                <Link to="/backups"><DatabaseBackup size={16} />גיבויים</Link>
                <Link to="/health"><HeartPulse size={16} />תקינות</Link>
              </div>
            </LabPanel>
          </div>

          <LabPanel eyebrow="Recent Signal" title="פעילות אחרונה" subtitle="Timeline אמיתי מטיימסטמפים קיימים, לא טרנד מלאכותי">
            <LabActivityTimeline data={data} />
          </LabPanel>
        </div>
      )}
    </DashboardLabState>
  );
}
