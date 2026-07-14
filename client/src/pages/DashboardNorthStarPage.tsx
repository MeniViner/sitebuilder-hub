import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  DatabaseBackup,
  GitBranch,
  HeartPulse,
  Radar,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Zap
} from "lucide-react";
import { useDashboardLabData, formatNumber } from "../components/dashboard-lab/dashboardLabData";
import type { DashboardLabData, LabChartRow, LabDomain, LabRiskItem, LabTone } from "../components/dashboard-lab/dashboardLabTypes";
import { formatPercent, pct, severityLabelHe } from "../components/dashboard-lab/dashboardLabUtils";

const northStarToneColor: Record<LabTone, string> = {
  success: "#72f6b1",
  warning: "#ffd166",
  danger: "#ff5f7e",
  info: "#55d6ff",
  neutral: "#8f9bb3"
};

const domainIcon: Record<LabDomain["key"], JSX.Element> = {
  deploy: <GitBranch size={17} />,
  recovery: <DatabaseBackup size={17} />,
  access: <ShieldCheck size={17} />,
  health: <HeartPulse size={17} />
};

const capabilityOrder = ["api", "mongo", "browser", "write"];

function postureLabel(data: DashboardLabData) {
  if (data.overallSeverity === "critical") return "Critical hold";
  if (data.overallSeverity === "high") return "Controlled risk";
  if (data.overallSeverity === "medium") return "Watch posture";
  return "Operationally clear";
}

function domainSignal(domain: LabDomain, data: DashboardLabData) {
  if (domain.key === "deploy") return `${formatPercent(data.releaseAdoptionPercent)} אימוץ · ${formatNumber(data.counts.outdatedSites)} מיושנים`;
  if (domain.key === "recovery") return `${formatPercent(data.backupReliabilityPercent)} אמינות · ${formatNumber(data.counts.backupRiskSites)} בסיכון`;
  if (domain.key === "access") return `${formatNumber(data.counts.adminRiskSites)} פערים · ${formatNumber(data.counts.totalAdmins)} admins`;
  return `${formatPercent(data.healthScorePercent)} health · ${formatNumber(data.counts.failedHealthSites)} בכשל`;
}

function domainActionLabel(domain: LabDomain) {
  if (domain.key === "deploy") return "Open releases";
  if (domain.key === "recovery") return "Open recovery";
  if (domain.key === "access") return "Open access";
  return "Open health";
}

function capabilityModeLabel(mode: string) {
  if (mode === "unknown") return "not checked";
  return mode;
}

function metricModel(data: DashboardLabData) {
  const activeRatio = pct(data.counts.activeSites, Math.max(data.counts.totalSites, 1));
  const attentionRatio = Math.max(0, 100 - pct(data.counts.attentionItems, Math.max(data.counts.totalSites, 1)));
  return [
    {
      key: "active",
      label: "Active sites",
      value: formatNumber(data.counts.activeSites),
      detail: `${formatNumber(data.counts.archivedSites)} בארכיון`,
      tone: "info" as LabTone,
      percent: activeRatio,
      to: "/sites"
    },
    {
      key: "attention",
      label: "Open attention",
      value: formatNumber(data.counts.attentionItems),
      detail: data.counts.attentionItems ? "סעיפים לטיפול" : "אין חסימה דחופה",
      tone: data.counts.attentionItems ? "warning" as LabTone : "success" as LabTone,
      percent: attentionRatio,
      to: "/monitoring"
    },
    {
      key: "release",
      label: "Release readiness",
      value: formatPercent(data.releaseAdoptionPercent),
      detail: `${formatNumber(data.counts.outdatedSites)} מאחורי latest`,
      tone: data.counts.outdatedSites ? "warning" as LabTone : "success" as LabTone,
      percent: data.releaseAdoptionPercent,
      to: "/releases"
    },
    {
      key: "recovery",
      label: "Recovery confidence",
      value: formatPercent(data.backupReliabilityPercent),
      detail: `${formatNumber(data.counts.backupRiskSites)} אתרים בסיכון`,
      tone: data.counts.backupRiskSites ? "warning" as LabTone : "success" as LabTone,
      percent: data.backupReliabilityPercent,
      to: "/backups"
    }
  ];
}

function conicGradient(rows: LabChartRow[]) {
  const total = Math.max(rows.reduce((sum, row) => sum + row.value, 0), 1);
  let cursor = 0;
  const parts = rows.map((row) => {
    const start = cursor;
    const end = cursor + (row.value / total) * 360;
    cursor = end;
    return `${northStarToneColor[row.tone || "neutral"]} ${start.toFixed(1)}deg ${end.toFixed(1)}deg`;
  });
  return parts.length ? parts.join(", ") : "rgba(255,255,255,0.16) 0deg 360deg";
}

function toneClass(tone: LabTone) {
  return `northstar-tone-${tone}`;
}

function NorthStarLoading() {
  return (
    <div className="northstar-page" dir="rtl">
      <div className="northstar-aurora" aria-hidden="true" />
      <main className="northstar-loading">
        <Sparkles size={28} />
        <strong>מכין North Star Dashboard</strong>
        <span>טוען נתוני Hub אמיתיים ללא shell קיים.</span>
      </main>
    </div>
  );
}

function NorthStarError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="northstar-page" dir="rtl">
      <div className="northstar-aurora" aria-hidden="true" />
      <main className="northstar-loading northstar-error-state">
        <Zap size={28} />
        <strong>לא ניתן לטעון את תמונת המצב</strong>
        <span>{message}</span>
        <button className="northstar-ghost-button" type="button" onClick={onRetry}>
          <RefreshCw size={16} />
          נסה שוב
        </button>
      </main>
    </div>
  );
}

function NorthStarTopBar({ data, onRefresh, refreshing }: { data: DashboardLabData; onRefresh: () => void; refreshing: boolean }) {
  const capabilities = data.capabilityStrip
    .filter((capability) => capabilityOrder.includes(capability.key))
    .sort((a, b) => capabilityOrder.indexOf(a.key) - capabilityOrder.indexOf(b.key));

  return (
    <header className="northstar-top">
      <div className="northstar-brand">
        <span className="northstar-mark"><Radar size={18} /></span>
        <span>
          <strong>Site Builder Hub</strong>
          <small>North Star Dashboard · מעבדה בלבד</small>
        </span>
      </div>

      <div className="northstar-signal-row" aria-label="Context status">
        {capabilities.map((capability) => (
          <Link key={capability.key} className={`northstar-signal ${toneClass(capability.tone)}`} to={capability.to}>
            <i aria-hidden="true" />
            <span>{capability.label}</span>
            <b>{capabilityModeLabel(capability.mode)}</b>
          </Link>
        ))}
      </div>

      <nav className="northstar-actions" aria-label="North Star actions">
        <button className="northstar-ghost-button" type="button" onClick={onRefresh} disabled={refreshing}>
          <RefreshCw size={16} />
          {refreshing ? "מרענן" : "Refresh"}
        </button>
        <Link className="northstar-ghost-button" to="/dashboard-lab">
          Lab
        </Link>
        <Link className="northstar-ghost-button" to="/">
          Hub
          <ArrowLeft size={16} />
        </Link>
      </nav>
    </header>
  );
}

function OperationsPulse({ data }: { data: DashboardLabData }) {
  return (
    <div className={`northstar-pulse-chamber ${toneClass(data.overallTone)}`}>
      <div
        className="northstar-pulse-ring"
        style={{
          "--northstar-score": `${Math.max(0, Math.min(100, data.healthScorePercent))}%`,
          "--northstar-health-gradient": conicGradient(data.distributions.health)
        } as CSSProperties}
      >
        <div className="northstar-pulse-core">
          <span>Operations pulse</span>
          <strong className="num">{formatPercent(data.healthScorePercent)}</strong>
          <small>{postureLabel(data)}</small>
        </div>
      </div>

      <div className="northstar-orbit-grid" aria-label="Operations map">
        {data.domains.map((domain) => (
          <Link key={domain.key} className={`northstar-orbit-card ${toneClass(domain.tone)}`} to={domain.to}>
            <span className="northstar-orbit-icon">{domainIcon[domain.key]}</span>
            <span>
              <strong>{domain.title}</strong>
              <small>{domainSignal(domain, data)}</small>
            </span>
            <b>{domainActionLabel(domain)}</b>
          </Link>
        ))}
      </div>
    </div>
  );
}

function MetricConstellation({ data }: { data: DashboardLabData }) {
  return (
    <section className="northstar-metric-cloud" aria-label="High signal metrics">
      {metricModel(data).map((metric) => (
        <Link
          key={metric.key}
          className={`northstar-metric-node ${toneClass(metric.tone)}`}
          to={metric.to}
          style={{ "--metric-percent": `${Math.max(0, Math.min(100, metric.percent))}%` } as CSSProperties}
        >
          <span className="northstar-mini-orbit" aria-hidden="true" />
          <span>
            <small>{metric.label}</small>
            <strong className="num">{metric.value}</strong>
            <em>{metric.detail}</em>
          </span>
        </Link>
      ))}
    </section>
  );
}

function CommandQueue({ items }: { items: LabRiskItem[] }) {
  return (
    <section className="northstar-command-queue" aria-label="Priority queue">
      <div className="northstar-section-heading">
        <span>Command queue</span>
        <strong>Next actions</strong>
      </div>
      <div className="northstar-queue-list">
        {items.slice(0, 4).map((item, index) => (
          <Link key={item.key} className={`northstar-queue-item ${toneClass(item.tone)}`} to={item.to}>
            <span className="northstar-queue-rank num">{index + 1}</span>
            <span>
              <small>{severityLabelHe[item.severity]}</small>
              <strong>{item.title}</strong>
              <em>{item.description}</em>
            </span>
            <b>{item.actionLabel}</b>
          </Link>
        ))}
      </div>
    </section>
  );
}

function VisualDataObject({ data }: { data: DashboardLabData }) {
  const backupRows = data.distributions.backupFreshness.slice(0, 5);
  const backupTotal = Math.max(data.counts.activeSites, 1);
  return (
    <section className="northstar-data-object" aria-label="Visual data object">
      <div className="northstar-section-heading">
        <span>Snapshot field</span>
        <strong>Health · Release · Recovery</strong>
      </div>

      <div className="northstar-data-grid">
        <div className="northstar-health-disc">
          <div
            className="northstar-health-disc-ring"
            style={{ "--northstar-health-gradient": conicGradient(data.distributions.health) } as CSSProperties}
            aria-hidden="true"
          />
          <div>
            <strong className="num">{formatNumber(data.counts.totalSites)}</strong>
            <span>sites mapped</span>
          </div>
          <ul>
            {data.distributions.health.map((row) => (
              <li key={row.key}>
                <i style={{ background: northStarToneColor[row.tone || "neutral"] }} />
                <span>{row.label}</span>
                <b className="num">{row.formattedValue || formatNumber(row.value)}</b>
              </li>
            ))}
          </ul>
        </div>

        <div
          className="northstar-release-slab"
          style={{ "--northstar-release-percent": `${Math.max(4, Math.min(100, data.releaseAdoptionPercent))}%` } as CSSProperties}
        >
          <span>Release adoption</span>
          <strong className="num">{formatPercent(data.releaseAdoptionPercent)}</strong>
          <div className="northstar-release-rail" aria-hidden="true">
            <i />
          </div>
          <small>{formatNumber(data.counts.outdatedSites)} אתרים מאחורי latest · {data.latestVersion}</small>
        </div>

        <div className="northstar-backup-field">
          <span>Backup freshness</span>
          {backupRows.map((row) => (
            <div key={row.key} className={`northstar-freshness-lane ${toneClass(row.tone || "neutral")}`}>
              <strong>{row.label}</strong>
              <i aria-hidden="true"><b style={{ width: `${Math.max(row.value ? 6 : 0, pct(row.value, backupTotal))}%` }} /></i>
              <em className="num">{row.formattedValue || formatNumber(row.value)}</em>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function NorthStarContent({ data, onRefresh, refreshing }: { data: DashboardLabData; onRefresh: () => void; refreshing: boolean }) {
  return (
    <div className="northstar-page" dir="rtl">
      <div className="northstar-aurora" aria-hidden="true" />
      <div className="northstar-noise" aria-hidden="true" />

      <NorthStarTopBar data={data} onRefresh={onRefresh} refreshing={refreshing} />

      <main className="northstar-stage">
        <section className={`northstar-hero ${toneClass(data.overallTone)}`}>
          <div className="northstar-hero-copy">
            <span className="northstar-lab-tag">Standalone lab artboard</span>
            <h1>{data.overallTitle}</h1>
            <p>{data.overallSubtitle}</p>
            <div className="northstar-hero-action">
              <Link className="northstar-primary-action" to={data.primaryAction.to}>
                <span>
                  <small>Top risk</small>
                  <strong>{data.primaryAction.title}</strong>
                </span>
                <b>{data.primaryAction.actionLabel}</b>
              </Link>
            </div>
          </div>
          <OperationsPulse data={data} />
        </section>

        <MetricConstellation data={data} />
        <CommandQueue items={data.riskQueue} />
        <VisualDataObject data={data} />
      </main>
    </div>
  );
}

export function DashboardNorthStarPage() {
  const state = useDashboardLabData();

  if (state.loading && !state.data) return <NorthStarLoading />;
  if (state.error) return <NorthStarError message={state.error} onRetry={() => void state.refresh()} />;
  if (!state.data) return <NorthStarLoading />;

  if (state.data.empty) {
    return (
      <div className="northstar-page" dir="rtl">
        <div className="northstar-aurora" aria-hidden="true" />
        <main className="northstar-loading">
          <Sparkles size={28} />
          <strong>אין עדיין נתוני Hub להצגה</strong>
          <span>ה־North Star משתמש בנתונים אמיתיים בלבד ולא מציג דמו.</span>
          <button className="northstar-ghost-button" type="button" onClick={() => void state.refresh()}>
            <RefreshCw size={16} />
            בדיקה מחדש
          </button>
        </main>
      </div>
    );
  }

  return <NorthStarContent data={state.data} onRefresh={() => void state.refresh()} refreshing={state.loading} />;
}
