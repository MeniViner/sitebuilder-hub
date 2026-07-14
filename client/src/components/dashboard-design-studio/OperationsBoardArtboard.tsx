import { Link } from "react-router-dom";
import { ArrowUpLeft, Blocks, Gauge, Wrench } from "lucide-react";
import type { DashboardLabData, LabDomain } from "../dashboard-lab/dashboardLabTypes";
import { formatNumber } from "../dashboard-lab/dashboardLabData";
import {
  StudioCapabilityStrip,
  StudioDomainStrip,
  StudioPriorityList
} from "./DashboardDesignStudioShell";
import {
  capabilityModeText,
  compactPriorityQueue,
  dashboardPosture,
  domainSignal,
  domainStatusLabel,
  primaryMetrics,
  selectCoreCapabilities,
  studioToneClass
} from "./designStudioUtils";

function DomainLane({ domain }: { domain: LabDomain }) {
  const blocker = domain.risks.find((risk) => risk.severity !== "clear");
  const signal = domainSignal(domain);
  const capability = domain.capabilities[0];

  return (
    <section className={`ops-board-lane ${studioToneClass[domain.tone]}`}>
      <header>
        <span>{domain.title}</span>
        <strong>{domainStatusLabel(domain.tone)}</strong>
      </header>
      <div className="ops-board-lane-signal">
        <span>{blocker ? "החסם המרכזי" : "הסיגנל המרכזי"}</span>
        <strong>{blocker?.title || signal.text}</strong>
        <small>{blocker?.description || domain.subtitle}</small>
      </div>
      <div className="ops-board-lane-metrics">
        {domain.metrics.slice(0, 2).map((metric) => (
          <span key={metric.key}>
            <small>{metric.label}</small>
            <b className="num">{metric.value}</b>
          </span>
        ))}
      </div>
      <footer>
        {capability ? <small>{capability.label}: {capabilityModeText(capability)}</small> : <small>יכולת לא נבדקה</small>}
        <Link to={domain.to}>
          {domain.actionLabel}
          <ArrowUpLeft size={14} />
        </Link>
      </footer>
    </section>
  );
}

export function OperationsBoardArtboard({ data }: { data: DashboardLabData }) {
  const posture = dashboardPosture(data);
  const priorities = compactPriorityQueue(data);
  const metrics = primaryMetrics(data);

  return (
    <article className="dstudio-artboard ops-board-artboard">
      <section className="ops-board-topline">
        <div>
          <p className="dstudio-kicker">
            <Wrench size={16} />
            לוח מפעיל · לא דשבורד Production
          </p>
          <h2>מה חסום, מה מוכן, ומה פותחים קודם</h2>
          <p>{posture.copy}</p>
        </div>
        <aside className={`ops-board-decision ${studioToneClass[posture.tone]}`}>
          <span>מצב עבודה</span>
          <strong>{posture.short}</strong>
          <small>{formatNumber(data.counts.activeJobs)} פעולות פעילות · {formatNumber(data.counts.failedJobs)} נכשלו</small>
        </aside>
      </section>

      <section className="ops-board-control-row">
        <div className="ops-board-metric-rail">
          {metrics.map((metric) => (
            <Link key={metric.key} className={`ops-board-metric ${studioToneClass[metric.tone]}`} to={metric.to || "/"}>
              <span>{metric.label}</span>
              <strong className="num">{metric.value}</strong>
              <small>{metric.detail}</small>
            </Link>
          ))}
        </div>
        <StudioCapabilityStrip capabilities={selectCoreCapabilities(data)} title="יכולות להרצה" />
      </section>

      <section className="ops-board-workspace">
        <aside className="ops-board-blockers">
          <div className="dstudio-section-heading">
            <span>
              <Blocks size={17} />
              תור טיפול
            </span>
            <small>עד 4, לפי חומרה</small>
          </div>
          <StudioPriorityList items={priorities} title="מה לפתוח עכשיו" compact />
        </aside>

        <div className="ops-board-lanes" aria-label="תחומי תפעול">
          {data.domains.map((domain) => (
            <DomainLane key={domain.key} domain={domain} />
          ))}
        </div>
      </section>

      <footer className="ops-board-footer">
        <Gauge size={16} />
        <StudioDomainStrip domains={data.domains} compact />
      </footer>
    </article>
  );
}
