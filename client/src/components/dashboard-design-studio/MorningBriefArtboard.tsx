import { Link } from "react-router-dom";
import { ArrowUpLeft, CalendarDays, Coffee, ShieldCheck } from "lucide-react";
import type { DashboardLabData } from "../dashboard-lab/dashboardLabTypes";
import {
  StudioCapabilityStrip,
  StudioDomainStrip,
  StudioMetricStrip,
  StudioPriorityList,
  StudioSnapshotPanel,
  StudioReadinessSummary
} from "./DashboardDesignStudioShell";
import {
  compactPriorityQueue,
  dashboardPosture,
  primaryMetrics,
  readinessLine,
  selectCoreCapabilities,
  studioToneClass
} from "./designStudioUtils";

export function MorningBriefArtboard({ data }: { data: DashboardLabData }) {
  const posture = dashboardPosture(data);
  const topIssue = data.primaryAction;
  const priorities = compactPriorityQueue(data);

  return (
    <article className="dstudio-artboard morning-brief-artboard">
      <section className="morning-brief-hero">
        <div className="morning-brief-hero-copy">
          <p className="dstudio-kicker">
            <CalendarDays size={16} />
            מצב הבוקר · מעבדת עיצוב בלבד
          </p>
          <h2>{posture.title}</h2>
          <p>{posture.copy}</p>
          <div className={`morning-brief-next ${studioToneClass[topIssue.tone]}`}>
            <span>הדבר הראשון שכדאי לפתוח</span>
            <strong>{topIssue.title}</strong>
            <small>{topIssue.description}</small>
            <Link to={topIssue.to}>
              {topIssue.actionLabel}
              <ArrowUpLeft size={15} />
            </Link>
          </div>
        </div>
        <aside className="morning-brief-note">
          <span className={`morning-brief-posture ${studioToneClass[posture.tone]}`}>
            <ShieldCheck size={18} />
            {posture.short}
          </span>
          <p>{readinessLine(data)}</p>
          <StudioReadinessSummary data={data} />
        </aside>
      </section>

      <StudioMetricStrip metrics={primaryMetrics(data)} />

      <section className="morning-brief-body">
        <div className="morning-brief-column morning-brief-column-main">
          <StudioPriorityList items={priorities} title="מה דורש החלטה" />
          <StudioCapabilityStrip capabilities={selectCoreCapabilities(data)} title="חיבורי עבודה" />
        </div>

        <div className="morning-brief-column">
          <section className="morning-brief-quiet">
            <div className="dstudio-section-heading">
              <span>כשירות לפי תחום</span>
              <small>Deploy / Recovery / Access / Health</small>
            </div>
            <StudioDomainStrip domains={data.domains} compact />
          </section>
          <StudioSnapshotPanel data={data} />
        </div>
      </section>

      <footer className="morning-brief-footer">
        <Coffee size={16} />
        <span>השפה כאן מכוונת לפתיחת יום: מה המצב, מה חשוב, ולאן נכנסים עכשיו.</span>
      </footer>
    </article>
  );
}
