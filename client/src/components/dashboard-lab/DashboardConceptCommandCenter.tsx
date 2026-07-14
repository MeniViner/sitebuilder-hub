import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Cable, DatabaseBackup, FolderKanban, HeartPulse, Rocket, ShieldCheck } from "lucide-react";
import type { DashboardLabLoadState } from "./dashboardLabTypes";
import {
  DashboardLabState,
  LabCapabilityStrip,
  LabMetricGrid,
  LabPanel,
  LabPriorityQueue,
  LabScoreLine,
  LabSegmentedBar,
  LabStatusPill,
  LabWatchlist
} from "./DashboardLabShell";
import { formatNumber } from "./dashboardLabData";
import { severityLabelHe, toneClass } from "./dashboardLabUtils";

export function DashboardConceptCommandCenter({ state }: { state: DashboardLabLoadState }) {
  return (
    <DashboardLabState state={state} conceptName="Command Center">
      {(data) => (
        <div className="lab-concept lab-command">
          <section className={`lab-command-hero ${toneClass[data.overallTone]}`}>
            <div className="lab-command-story">
              <div className="lab-hero-kicker">
                <LabStatusPill tone={data.overallTone}>{severityLabelHe[data.overallSeverity]}</LabStatusPill>
                <span className="num subtle">עודכן {data.generatedAt ? new Date(data.generatedAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }) : "-"}</span>
              </div>
              <h2>{data.overallTitle}</h2>
              <p>{data.overallSubtitle}</p>
              <div className="lab-action-row">
                <Link className="btn btn-primary" to={data.primaryAction.to}>
                  <ArrowLeft size={16} />
                  {data.primaryAction.actionLabel}
                </Link>
                <Link className="btn btn-secondary" to="/diagnostics"><Cable size={16} />חיבורים</Link>
                <Link className="btn btn-secondary" to="/sites"><FolderKanban size={16} />אתרים</Link>
              </div>
            </div>

            <div className="lab-command-now">
              <span className="lab-command-now-icon" aria-hidden="true"><AlertTriangle size={22} /></span>
              <span>
                <small>Top priority</small>
                <strong>{data.primaryAction.title}</strong>
                <em>{data.primaryAction.meta || data.primaryAction.description}</em>
              </span>
            </div>
          </section>

          <LabMetricGrid metrics={data.topMetrics} />

          <LabCapabilityStrip capabilities={data.capabilityStrip.slice(0, 5)} compact />

          <div className="lab-command-grid">
            <LabPanel
              eyebrow="Priority Queue"
              title="מה דורש טיפול עכשיו"
              subtitle={`${formatNumber(data.counts.attentionItems)} סעיפים פתוחים לפי snapshot נוכחי`}
              action={<Link className="btn btn-secondary" to="/jobs">תור פעולות</Link>}
            >
              <LabPriorityQueue items={data.riskQueue} limit={5} />
            </LabPanel>

            <LabPanel
              eyebrow="Operational Summary"
              title="סיכום סיכוני צי"
              subtitle="Health, גרסאות, גיבוי והרשאות בלי להעמיס Evidence"
              action={<Link className="btn btn-secondary" to="/health"><HeartPulse size={16} />Health</Link>}
            >
              <div className="lab-command-summary">
                <LabSegmentedBar rows={data.distributions.health} total={data.counts.totalSites} />
                <div className="lab-score-stack">
                  <LabScoreLine label="Health score" value={data.healthScorePercent} detail={`${formatNumber(data.counts.failedHealthSites)} בכשל`} tone={data.counts.failedHealthSites ? "danger" : data.counts.warningHealthSites ? "warning" : "success"} />
                  <LabScoreLine label="Release adoption" value={data.releaseAdoptionPercent} detail={`Latest ${data.latestVersion}`} tone={data.counts.outdatedSites ? "warning" : "success"} />
                  <LabScoreLine label="Backup reliability" value={data.backupReliabilityPercent} detail={`${formatNumber(data.counts.backupRiskSites)} בסיכון`} tone={data.counts.backupRiskSites ? "warning" : "success"} />
                </div>
                <div className="lab-command-actions">
                  <Link to="/releases"><Rocket size={16} />גרסאות</Link>
                  <Link to="/backups"><DatabaseBackup size={16} />גיבויים</Link>
                  <Link to="/admins"><ShieldCheck size={16} />הרשאות</Link>
                </div>
              </div>
            </LabPanel>
          </div>

          <LabPanel eyebrow="Watchlist" title="אתרים לפתיחה ראשונה" subtitle="רק אתרים עם סיכון פתוח; הרשימה המלאה נשארת ב־Sites">
            <LabWatchlist data={data} limit={4} />
          </LabPanel>
        </div>
      )}
    </DashboardLabState>
  );
}
