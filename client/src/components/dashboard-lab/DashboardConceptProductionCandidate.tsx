import { Link } from "react-router-dom";
import { ArrowLeft, DatabaseBackup, GitBranch, HeartPulse, ShieldCheck } from "lucide-react";
import type { DashboardLabData, DashboardLabLoadState, LabCapability, LabDomain, LabMetric, LabTone } from "./dashboardLabTypes";
import {
  DashboardLabState,
  LabHorizontalBars,
  LabPanel,
  LabPriorityQueue,
  LabScoreLine,
  LabSegmentedBar,
  LabStatusPill
} from "./DashboardLabShell";
import { formatNumber } from "./dashboardLabData";
import { formatPercent, severityLabelHe, toneClass } from "./dashboardLabUtils";

const capabilityOrder = ["api", "mongo", "browser", "write"];

const domainIcon: Record<LabDomain["key"], JSX.Element> = {
  deploy: <GitBranch size={17} />,
  recovery: <DatabaseBackup size={17} />,
  access: <ShieldCheck size={17} />,
  health: <HeartPulse size={17} />
};

function productionMetrics(data: DashboardLabData): LabMetric[] {
  return [
    {
      key: "active-sites",
      label: "אתרים פעילים",
      value: formatNumber(data.counts.activeSites),
      detail: `${formatNumber(data.counts.archivedSites)} בארכיון`,
      tone: "info",
      to: "/sites"
    },
    {
      key: "attention-items",
      label: "דורש טיפול",
      value: formatNumber(data.counts.attentionItems),
      detail: data.counts.attentionItems ? "סעיפים פתוחים" : "אין חסימה דחופה",
      tone: data.counts.attentionItems ? "warning" : "success",
      to: "/monitoring"
    },
    {
      key: "release-readiness",
      label: "מוכנות גרסה",
      value: formatPercent(data.releaseAdoptionPercent),
      detail: `${formatNumber(data.counts.outdatedSites)} מאחורי latest`,
      tone: data.counts.outdatedSites ? "warning" : "success",
      to: "/releases"
    },
    {
      key: "backup-reliability",
      label: "אמינות גיבוי",
      value: formatPercent(data.backupReliabilityPercent),
      detail: `${formatNumber(data.counts.backupRiskSites)} אתרים בסיכון`,
      tone: data.counts.backupRiskSites ? "warning" : "success",
      to: "/backups"
    }
  ];
}

function capabilityStatus(capability: LabCapability) {
  if (capability.mode === "unknown") return "not checked";
  if (capability.mode === "blocked" && capability.key !== "write") return "unavailable";
  return capability.mode;
}

function capabilitySignal(capability: LabCapability) {
  if (capability.key === "api") return capability.mode === "live" ? "Hub עונה" : "API לא זמין";
  if (capability.key === "mongo") return capability.mode === "live" ? "Mongo מחובר" : capability.mode === "unknown" ? "לא נבדק" : "Mongo לא זמין";
  if (capability.key === "browser") {
    if (capability.mode === "live") return "קריאה חיה זמינה";
    if (capability.mode === "cached") return "ראיה שמורה";
    if (capability.mode === "metadata") return "לא נבדק";
    return "דפדפן חסום";
  }
  if (capability.key === "write") return capability.mode === "live" ? "Execute זמין" : "כתיבה חסומה";
  return capability.detail;
}

function domainSignal(domain: LabDomain, data: DashboardLabData) {
  if (domain.key === "deploy") return `${formatPercent(data.releaseAdoptionPercent)} אימוץ · ${formatNumber(data.counts.outdatedSites)} מיושנים`;
  if (domain.key === "recovery") return `${formatPercent(data.backupReliabilityPercent)} אמינות · ${formatNumber(data.counts.backupRiskSites)} בסיכון`;
  if (domain.key === "access") return `${formatNumber(data.counts.adminRiskSites)} פערים · ${formatNumber(data.counts.totalAdmins)} admins`;
  return `${formatPercent(data.healthScorePercent)} תקין · ${formatNumber(data.counts.failedHealthSites)} בכשל`;
}

function domainActionLabel(domain: LabDomain) {
  if (domain.key === "deploy") return "גרסאות";
  if (domain.key === "recovery") return "גיבויים";
  if (domain.key === "access") return "הרשאות";
  return "תקינות";
}

function postureLabel(data: DashboardLabData) {
  if (data.overallSeverity === "critical") return "חסימה פתוחה";
  if (data.overallSeverity === "high") return "פעיל, דורש החלטה";
  if (data.overallSeverity === "medium") return "יציב עם מעקב";
  return "יציב כרגע";
}

function topIssueLabel(data: DashboardLabData) {
  return data.primaryAction.severity === "clear" ? "המשך פעולה" : "הדבר הבא לטיפול";
}

export function DashboardConceptProductionCandidate({ state }: { state: DashboardLabLoadState }) {
  return (
    <DashboardLabState state={state} conceptName="Production Candidate">
      {(data) => {
        const candidateMetrics = productionMetrics(data);
        const capabilities = data.capabilityStrip
          .filter((capability) => capabilityOrder.includes(capability.key))
          .sort((a, b) => capabilityOrder.indexOf(a.key) - capabilityOrder.indexOf(b.key));
        const topIssueTone: LabTone = data.primaryAction.severity === "clear" ? "success" : data.primaryAction.tone;

        return (
          <div className="lab-concept lab-production-candidate">
            <section className={`lab-candidate-hero ${toneClass[data.overallTone]}`}>
              <div className="lab-candidate-hero-main">
                <div className="lab-hero-kicker">
                  <LabStatusPill tone="info">בתוך המעבדה</LabStatusPill>
                  <span className="subtle">Production Candidate v2 · הדשבורד הראשי ב־#/ לא השתנה</span>
                </div>
                <h2>{data.overallTitle}</h2>
                <p>{data.overallSubtitle}</p>
                <div className="lab-candidate-hero-facts" aria-label="סיכום החלטה">
                  <span>
                    <small>מצב תפעולי</small>
                    <strong>{postureLabel(data)}</strong>
                  </span>
                  <span>
                    <small>{topIssueLabel(data)}</small>
                    <strong>{data.primaryAction.title}</strong>
                  </span>
                </div>
                <div className="lab-candidate-primary-action">
                  <Link className="btn btn-primary" to={data.primaryAction.to}>
                    <ArrowLeft size={16} />
                    {data.primaryAction.actionLabel}
                  </Link>
                </div>
              </div>

              <Link className={`lab-candidate-top-issue ${toneClass[topIssueTone]}`} to={data.primaryAction.to}>
                <span className="lab-candidate-issue-heading">
                  <small>{topIssueLabel(data)}</small>
                  <b>{severityLabelHe[data.primaryAction.severity]}</b>
                </span>
                <span>
                  <strong>{data.primaryAction.title}</strong>
                  <em>{data.primaryAction.description}</em>
                </span>
                <span className="lab-candidate-issue-action">{data.primaryAction.actionLabel}</span>
              </Link>
            </section>

            <div className="lab-candidate-metrics" aria-label="מדדי דשבורד ראשיים">
              {candidateMetrics.map((metric) => (
                <Link key={metric.key} className={`lab-candidate-metric ${toneClass[metric.tone]}`} to={metric.to || "/"}>
                  <span>{metric.label}</span>
                  <strong className="num">{metric.value}</strong>
                  <small>{metric.detail}</small>
                </Link>
              ))}
            </div>

            <div className="lab-candidate-capabilities" aria-label="יכולות מערכת מרכזיות">
              {capabilities.map((capability) => (
                <Link key={capability.key} className={`lab-candidate-capability ${toneClass[capability.tone]}`} to={capability.to}>
                  <span>
                    <strong>{capability.label}</strong>
                    <small>{capabilitySignal(capability)}</small>
                  </span>
                  <b className="lab-candidate-capability-status">{capabilityStatus(capability)}</b>
                </Link>
              ))}
            </div>

            <section className="lab-candidate-domains" aria-label="מוכנות לפי תחומי פעולה">
              {data.domains.map((domain) => (
                <Link key={domain.key} className={`lab-candidate-domain ${toneClass[domain.tone]}`} to={domain.to}>
                  <span className="lab-candidate-domain-icon" aria-hidden="true">{domainIcon[domain.key]}</span>
                  <span className="lab-candidate-domain-copy">
                    <strong>{domain.title}</strong>
                    <small>{domain.status}</small>
                  </span>
                  <span className="lab-candidate-domain-signal">{domainSignal(domain, data)}</span>
                  <b>{domainActionLabel(domain)}</b>
                </Link>
              ))}
            </section>

            <div className="lab-candidate-main-grid">
              <LabPanel
                eyebrow="Priority"
                title="תור טיפול קצר"
                subtitle="עד ארבע פעולות עם יעד ברור"
              >
                <LabPriorityQueue items={data.riskQueue} limit={4} />
              </LabPanel>

              <LabPanel
                eyebrow="Visual Summary"
                title="תקינות, גרסה וגיבוי"
                subtitle="Snapshot קטגורי בלבד"
              >
                <div className="lab-candidate-visual-summary">
                  <div className="lab-candidate-chart-block">
                    <div className="lab-candidate-chart-title">
                      <strong>התפלגות Health</strong>
                      <span className="num">{formatNumber(data.counts.totalSites)} אתרים</span>
                    </div>
                    <LabSegmentedBar rows={data.distributions.health} total={data.counts.totalSites} />
                  </div>

                  <LabScoreLine
                    label="אימוץ גרסה"
                    value={data.releaseAdoptionPercent}
                    detail={`${formatNumber(data.counts.outdatedSites)} אתרים מאחורי latest`}
                    tone={data.counts.outdatedSites ? "warning" : "success"}
                  />

                  <div className="lab-candidate-chart-block">
                    <div className="lab-candidate-chart-title">
                      <strong>טריות גיבוי</strong>
                      <span>לפי ראיית snapshot</span>
                    </div>
                    <LabHorizontalBars rows={data.distributions.backupFreshness} total={data.counts.activeSites} limit={4} />
                  </div>
                </div>
              </LabPanel>
            </div>
          </div>
        );
      }}
    </DashboardLabState>
  );
}
