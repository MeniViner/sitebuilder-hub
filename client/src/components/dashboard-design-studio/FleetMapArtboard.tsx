import { Link } from "react-router-dom";
import { ArrowUpLeft, Database, Map, ServerCog } from "lucide-react";
import type { DashboardLabData } from "../dashboard-lab/dashboardLabTypes";
import { formatNumber } from "../dashboard-lab/dashboardLabData";
import { formatDateTime } from "../../utils/format";
import {
  StudioCapabilityStrip,
  StudioDomainStrip,
  StudioSegmentedChart
} from "./DashboardDesignStudioShell";
import {
  environmentLabel,
  groupSitesByEnvironment,
  selectCoreCapabilities,
  siteIssueLabel,
  siteShape,
  siteSubline,
  siteTone,
  studioToneClass,
  topFleetSite
} from "./designStudioUtils";

export function FleetMapArtboard({ data }: { data: DashboardLabData }) {
  const groups = groupSitesByEnvironment(data.activeSites);
  const selected = topFleetSite(data);
  const visibleGroups = groups.slice(0, 6);

  return (
    <article className="dstudio-artboard fleet-map-artboard">
      <section className="fleet-map-header">
        <div>
          <p className="dstudio-kicker">
            <Map size={16} />
            מפת צי · אתרים אמיתיים מתוך ה־Hub
          </p>
          <h2>איפה נמצאים האתרים שדורשים בדיקה</h2>
          <p>הנקודות מייצגות אתרים קיימים ומקובצות לפי environment. אין כאן קשרי רשת או topology שלא קיימים בנתונים.</p>
        </div>
        <div className="fleet-map-stats">
          <span>
            <b className="num">{formatNumber(data.counts.activeSites)}</b>
            אתרים פעילים
          </span>
          <span>
            <b className="num">{formatNumber(data.counts.mongoSites)}</b>
            Mongo
          </span>
          <span>
            <b className="num">{formatNumber(data.counts.txtSites)}</b>
            TXT
          </span>
        </div>
      </section>

      <section className="fleet-map-body">
        <div className="fleet-map-canvas" aria-label="מפת אתרים לפי סביבה">
          {visibleGroups.map((group) => (
            <section key={group.environment} className="fleet-map-cluster">
              <header>
                <strong>{environmentLabel(group.environment)}</strong>
                <span className="num">{formatNumber(group.sites.length)}</span>
              </header>
              <div className="fleet-map-nodes">
                {group.sites.slice(0, 18).map((site) => (
                  <Link
                    key={site._id}
                    className={`fleet-map-node ${studioToneClass[siteTone(site)]} fleet-node-${siteShape(site)}`}
                    to={`/sites/${site._id}`}
                    title={`${site.displayName}: ${siteIssueLabel(site)}`}
                  >
                    <span>{site.storageBackend === "mongo" ? "M" : site.storageBackend === "txt" ? "T" : "?"}</span>
                    <em>{site.siteCode || site.displayName}</em>
                  </Link>
                ))}
                {group.sites.length > 18 ? <span className="fleet-map-more num">+{formatNumber(group.sites.length - 18)}</span> : null}
              </div>
            </section>
          ))}
        </div>

        <aside className="fleet-map-side">
          {selected ? (
            <section className={`fleet-map-selected ${studioToneClass[siteTone(selected)]}`}>
              <span className="fleet-map-selected-label">אתר לבדיקה ראשונה</span>
              <h3>{selected.displayName}</h3>
              <p>{siteIssueLabel(selected)}</p>
              <dl>
                <div>
                  <dt>סביבה / אחסון</dt>
                  <dd>{siteSubline(selected)}</dd>
                </div>
                <div>
                  <dt>בדיקה אחרונה</dt>
                  <dd className="num">{formatDateTime(selected.lastHealthCheckAt || selected.updatedAt)}</dd>
                </div>
              </dl>
              <Link to={`/sites/${selected._id}`}>
                פתח אתר
                <ArrowUpLeft size={15} />
              </Link>
            </section>
          ) : null}

          <section className="fleet-map-distribution">
            <div className="dstudio-section-heading">
              <span>
                <Database size={16} />
                חלוקת Health
              </span>
              <small>Snapshot נוכחי</small>
            </div>
            <StudioSegmentedChart rows={data.distributions.health} total={data.counts.totalSites} />
          </section>

          <StudioCapabilityStrip capabilities={selectCoreCapabilities(data)} title="חיבורי מקור" />
        </aside>
      </section>

      <footer className="fleet-map-footer">
        <ServerCog size={16} />
        <StudioDomainStrip domains={data.domains} compact />
      </footer>
    </article>
  );
}
