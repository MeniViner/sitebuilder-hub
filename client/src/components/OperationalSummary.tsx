import { AlertTriangle, CheckCircle2, ChevronDown, Info, ListChecks, LockKeyhole, ShieldCheck } from "lucide-react";
import { ReactNode } from "react";

export type OperationalTone = "neutral" | "info" | "success" | "warning" | "danger";

const toneIcon = {
  neutral: <Info size={16} />,
  info: <Info size={16} />,
  success: <CheckCircle2 size={16} />,
  warning: <AlertTriangle size={16} />,
  danger: <LockKeyhole size={16} />
};

function toneClass(tone: OperationalTone) {
  return `operational-tone-${tone}`;
}

export function OperationalSummary({
  title,
  purpose,
  state,
  attention,
  nextAction,
  blocked,
  tone = "info",
  attentionTone,
  blockedTone,
  actions,
  children
}: {
  title: string;
  purpose: ReactNode;
  state: ReactNode;
  attention: ReactNode;
  nextAction: ReactNode;
  blocked?: ReactNode;
  tone?: OperationalTone;
  attentionTone?: OperationalTone;
  blockedTone?: OperationalTone;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className={`operational-summary ${toneClass(tone)}`}>
      <div className="operational-summary-main">
        <div className="operational-summary-title-row">
          <span className="operational-summary-icon" aria-hidden="true">{toneIcon[tone]}</span>
          <h2>{title}</h2>
        </div>
        <p className="operational-summary-purpose">{purpose}</p>
      </div>
      {actions ? <div className="operational-summary-actions">{actions}</div> : null}
      <div className="operational-summary-grid">
        <SummaryPoint label="מצב נוכחי" tone={tone}>{state}</SummaryPoint>
        <SummaryPoint label="מה דורש תשומת לב" tone={attentionTone || (attention ? "warning" : "success")}>{attention}</SummaryPoint>
        <SummaryPoint label="מה אפשר לעשות עכשיו" tone="success">{nextAction}</SummaryPoint>
        <SummaryPoint label="מה חסום ואיך מתקנים" tone={blockedTone || (blocked ? "danger" : "neutral")}>{blocked || "אין חסימה מרכזית שמונעת עבודה במסך הזה."}</SummaryPoint>
      </div>
      {children ? <div className="operational-summary-extra">{children}</div> : null}
    </section>
  );
}

export function SummaryPoint({
  label,
  tone = "neutral",
  children
}: {
  label: string;
  tone?: OperationalTone;
  children: ReactNode;
}) {
  return (
    <div className={`summary-point ${toneClass(tone)}`}>
      <span className="summary-point-label">{label}</span>
      <div className="summary-point-body">{children}</div>
    </div>
  );
}

export function GuidedFlow({
  title,
  subtitle,
  steps,
  defaultOpen = false
}: {
  title: string;
  subtitle?: ReactNode;
  steps: Array<{ title: string; description: ReactNode; status?: "done" | "active" | "blocked" | "pending" }>;
  defaultOpen?: boolean;
}) {
  return (
    <details className="guided-flow guidance-disclosure" {...(defaultOpen ? { open: true } : {})}>
      <summary className="guidance-disclosure-summary">
        <span className="guidance-disclosure-main">
          <span className="guidance-disclosure-icon" aria-hidden="true"><ShieldCheck size={18} /></span>
          <span className="guidance-disclosure-copy">
            <span className="guidance-disclosure-title">{title}</span>
            {subtitle ? <small>{subtitle}</small> : null}
          </span>
        </span>
        <span className="guidance-disclosure-meta">
          <span>{steps.length} צעדים</span>
          <ChevronDown className="guidance-disclosure-chevron" size={16} aria-hidden="true" />
        </span>
      </summary>
      <ol className="guided-flow-steps">
        {steps.map((step, index) => (
          <li key={`${step.title}-${index}`} className={`guided-flow-step guided-flow-step-${step.status || "pending"}`}>
            <span className="guided-flow-number">{index + 1}</span>
            <div>
              <p className="guided-flow-title">{step.title}</p>
              <p className="guided-flow-description">{step.description}</p>
            </div>
          </li>
        ))}
      </ol>
    </details>
  );
}

export function ModeBoundary({
  title = "גבולות פעולה",
  items,
  defaultOpen = false
}: {
  title?: string;
  items: Array<{ label: string; description: ReactNode; tone?: OperationalTone }>;
  defaultOpen?: boolean;
}) {
  return (
    <details className="mode-boundary guidance-disclosure" {...(defaultOpen ? { open: true } : {})}>
      <summary className="guidance-disclosure-summary">
        <span className="guidance-disclosure-main">
          <span className="guidance-disclosure-icon" aria-hidden="true"><ListChecks size={16} /></span>
          <span className="guidance-disclosure-copy">
            <span className="guidance-disclosure-title">{title}</span>
          </span>
        </span>
        <span className="guidance-disclosure-meta">
          <span>{items.length} נקודות</span>
          <ChevronDown className="guidance-disclosure-chevron" size={16} aria-hidden="true" />
        </span>
      </summary>
      <div className="mode-boundary-grid">
        {items.map((item) => (
          <div key={item.label} className={`mode-boundary-item ${toneClass(item.tone || "neutral")}`}>
            <p>{item.label}</p>
            <span>{item.description}</span>
          </div>
        ))}
      </div>
    </details>
  );
}

export function AdvancedDetails({
  title = "Advanced details",
  description,
  children
}: {
  title?: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <details className="advanced-details">
      <summary>
        <span>{title}</span>
        {description ? <small>{description}</small> : null}
      </summary>
      <div className="advanced-details-body">{children}</div>
    </details>
  );
}
