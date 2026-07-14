import { Link } from "react-router-dom";
import { ArrowLeft, Boxes, DatabaseBackup, GitBranch, HeartPulse, ShieldCheck } from "lucide-react";
import type { DashboardLabLoadState, LabDomain } from "./dashboardLabTypes";
import {
  DashboardLabState,
  LabCapabilityStrip,
  LabMetricGrid,
  LabPanel,
  LabPriorityQueue,
  LabSegmentedBar,
  LabStatusPill
} from "./DashboardLabShell";
import { formatNumber } from "./dashboardLabData";
import { toneClass } from "./dashboardLabUtils";

const domainIcons: Record<LabDomain["key"], JSX.Element> = {
  deploy: <GitBranch size={18} />,
  recovery: <DatabaseBackup size={18} />,
  access: <ShieldCheck size={18} />,
  health: <HeartPulse size={18} />
};

export function DashboardConceptOperationsCockpit({ state }: { state: DashboardLabLoadState }) {
  return (
    <DashboardLabState state={state} conceptName="Operations Cockpit">
      {(data) => (
        <div className="lab-concept lab-ops">
          <section className="lab-ops-header">
            <div>
              <div className="lab-hero-kicker">
                <LabStatusPill tone={data.overallTone}>{data.overallTitle}</LabStatusPill>
                <span className="num subtle">{formatNumber(data.counts.activeJobs)} Jobs פעילים</span>
              </div>
              <h2>קוקפיט פעולה לפי תחומים</h2>
              <p>Deploy, Recovery, Access ו־Health מקבלים שורות עבודה נפרדות, עם Live/Cached/Metadata גלוי.</p>
            </div>
            <Link className="btn btn-primary" to={data.primaryAction.to}><ArrowLeft size={16} />{data.primaryAction.actionLabel}</Link>
          </section>

          <LabCapabilityStrip capabilities={data.capabilityStrip} compact />

          <div className="lab-ops-domain-grid">
            {data.domains.map((domain) => (
              <section key={domain.key} className={`lab-domain ${toneClass[domain.tone]}`}>
                <div className="lab-domain-header">
                  <span className="lab-domain-icon" aria-hidden="true">{domainIcons[domain.key]}</span>
                  <span>
                    <strong>{domain.title}</strong>
                    <small>{domain.subtitle}</small>
                  </span>
                  <LabStatusPill tone={domain.tone}>{domain.status}</LabStatusPill>
                </div>

                <LabMetricGrid metrics={domain.metrics} compact />

                <div className="lab-domain-capabilities">
                  {domain.capabilities.map((capability) => (
                    <Link key={capability.key} className={`lab-domain-capability ${toneClass[capability.tone]}`} to={capability.to}>
                      <b>{capability.label}</b>
                      <small>{capability.mode}</small>
                    </Link>
                  ))}
                </div>

                <div className="lab-domain-risks">
                  {domain.risks.filter((risk) => risk.severity !== "clear").slice(0, 2).map((risk) => (
                    <Link key={risk.key} to={risk.to}>
                      <span>{risk.title}</span>
                      <small>{risk.actionLabel}</small>
                    </Link>
                  ))}
                  {domain.risks.filter((risk) => risk.severity !== "clear").length === 0 ? (
                    <span className="lab-domain-clear">אין חוסם פתוח בתחום</span>
                  ) : null}
                </div>
              </section>
            ))}
          </div>

          <div className="lab-ops-bottom-grid">
            <LabPanel eyebrow="Blockers" title="תור חסימות" subtitle="מסודר לפי חומרה; עבודה מלאה נשארת בדפי היעד">
              <LabPriorityQueue items={data.riskQueue} limit={4} />
            </LabPanel>
            <LabPanel eyebrow="Current Queue" title="Jobs לפי סטטוס" subtitle="התפלגות snapshot של התור הנוכחי" action={<Link className="btn btn-secondary" to="/jobs"><Boxes size={16} />Jobs</Link>}>
              <LabSegmentedBar rows={data.distributions.jobs} total={data.jobs.length} />
            </LabPanel>
          </div>
        </div>
      )}
    </DashboardLabState>
  );
}
