import { Link } from "react-router-dom";
import { ArrowLeft, BarChart3, Database, DatabaseBackup, FolderKanban } from "lucide-react";
import type { DashboardLabLoadState } from "./dashboardLabTypes";
import {
  DashboardLabState,
  LabDonut,
  LabHorizontalBars,
  LabMetricGrid,
  LabPanel,
  LabScoreLine,
  LabSegmentedBar,
  LabStatusPill
} from "./DashboardLabShell";
import { formatMb, formatNumber } from "../../utils/format";
import { toneClass } from "./dashboardLabUtils";

export function DashboardConceptVisualAnalytics({ state }: { state: DashboardLabLoadState }) {
  return (
    <DashboardLabState state={state} conceptName="Visual Analytics Dashboard">
      {(data) => (
        <div className="lab-concept lab-analytics-view">
          <section className={`lab-analytics-hero ${toneClass[data.overallTone]}`}>
            <div>
              <div className="lab-hero-kicker">
                <LabStatusPill tone={data.overallTone}>Snapshot</LabStatusPill>
                <span className="subtle">קטגוריות נוכחיות בלבד</span>
              </div>
              <h2>דשבורד חזותי לצי האתרים</h2>
              <p>גרפים מתאימים לנתונים קיימים: התפלגויות, אימוץ, טריות וסיכוני snapshot.</p>
            </div>
            <div className="lab-action-row">
              <Link className="btn btn-primary" to={data.primaryAction.to}><ArrowLeft size={16} />{data.primaryAction.actionLabel}</Link>
              <Link className="btn btn-secondary" to="/analytics"><BarChart3 size={16} />תובנות</Link>
            </div>
          </section>

          <LabMetricGrid
            metrics={[
              { key: "sites", label: "אתרים", value: formatNumber(data.counts.totalSites), detail: `${formatNumber(data.counts.activeSites)} פעילים`, tone: "info", to: "/sites" },
              { key: "storage", label: "אחסון", value: formatMb(Math.round(data.counts.totalStorageMb)), detail: "לפי registry", tone: "neutral", to: "/sites" },
              { key: "health", label: "Health", value: `${Math.round(data.healthScorePercent)}%`, detail: `${formatNumber(data.counts.failedHealthSites)} בכשל`, tone: data.counts.failedHealthSites ? "danger" : "success", to: "/health" },
              { key: "backup", label: "Recovery", value: `${Math.round(data.backupReliabilityPercent)}%`, detail: `${formatNumber(data.counts.backupRiskSites)} בסיכון`, tone: data.counts.backupRiskSites ? "warning" : "success", to: "/backups" }
            ]}
          />

          <div className="lab-analytics-grid">
            <LabPanel eyebrow="Health Distribution" title="תקינות צי" subtitle="Donut מתאים כי זו התפלגות קטגורית">
              <LabDonut rows={data.distributions.health} centerValue={`${Math.round(data.healthScorePercent)}%`} centerLabel="תקין" />
            </LabPanel>

            <LabPanel eyebrow="Storage Backends" title="TXT / Mongo / Unknown" subtitle="השוואת קטגוריות מתוך Registry">
              <LabHorizontalBars rows={data.distributions.storage} total={data.counts.activeSites} />
            </LabPanel>

            <LabPanel eyebrow="Environment" title="אתרים לפי סביבה" subtitle="חתך צי לפי שדה environment">
              <LabHorizontalBars rows={data.distributions.environment} total={data.counts.activeSites} />
            </LabPanel>

            <LabPanel eyebrow="Release Adoption" title="אימוץ גרסה" subtitle={`Latest ${data.latestVersion}`}>
              <div className="lab-release-visual">
                <LabScoreLine label="Adoption" value={data.releaseAdoptionPercent} detail={`${formatNumber(data.counts.outdatedSites)} אתרים מיושנים`} tone={data.counts.outdatedSites ? "warning" : "success"} />
                <div className="lab-release-pair">
                  <Link to="/releases"><Database size={16} />גרסאות</Link>
                  <Link to="/sites"><FolderKanban size={16} />אתרים</Link>
                </div>
              </div>
            </LabPanel>

            <LabPanel eyebrow="Backup Freshness" title="טריות גיבוי" subtitle="Buckets נוכחיים, לא קו היסטורי">
              <LabHorizontalBars rows={data.distributions.backupFreshness} total={data.counts.activeSites} />
            </LabPanel>

            <LabPanel eyebrow="Risk Categories" title="איפה פתוחים סיכונים" subtitle="מדרג מתוך תור העדיפויות">
              {data.distributions.riskCategories.length ? (
                <LabHorizontalBars rows={data.distributions.riskCategories} total={Math.max(data.counts.attentionItems, 1)} />
              ) : (
                <LabSegmentedBar rows={data.distributions.domains} />
              )}
            </LabPanel>

            <LabPanel eyebrow="Jobs" title="תור פעולות" subtitle="סטטוסים נוכחיים של Jobs">
              <LabSegmentedBar rows={data.distributions.jobs} total={data.jobs.length} />
            </LabPanel>

            <LabPanel eyebrow="Recovery Readiness" title="יכולת התאוששות" subtitle="סיכום גיבויים ופעולה מהירה" action={<Link className="btn btn-secondary" to="/backups"><DatabaseBackup size={16} />Backups</Link>}>
              <LabScoreLine label="Backup reliability" value={data.backupReliabilityPercent} detail={`${formatNumber(data.counts.totalBackups)} גיבויים רשומים`} tone={data.counts.backupRiskSites ? "warning" : "success"} />
            </LabPanel>
          </div>
        </div>
      )}
    </DashboardLabState>
  );
}
