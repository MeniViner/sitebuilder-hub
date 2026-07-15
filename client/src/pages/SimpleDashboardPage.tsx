import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, DatabaseBackup, FolderOpen, Plus, RefreshCw, Rocket } from "lucide-react";
import { Link } from "react-router-dom";
import { ActivityRow } from "../components/product/ActivityRow";
import { HumanStatus } from "../components/product/HumanStatus";
import { ProductPage, ProductSection } from "../components/product/ProductPage";
import { hubDomain, type HubAuthUser, type HubJob, type OperationsOverview } from "../domain/hubDomain";
import { canMutate, presentBackupRecoverability, presentOperationState, presentSiteCondition } from "../domain/presentation";
import type { Site } from "../types/site";
import { jobTypeLabel } from "../utils/format";

const operationTitle = (job: HubJob) => jobTypeLabel(job.type) || "פעולה באתר";

export function SimpleDashboardPage({ authUser }: { authUser: HubAuthUser }) {
  const [sites, setSites] = useState<Site[]>([]);
  const [operations, setOperations] = useState<OperationsOverview | null>(null);
  const [sitesError, setSitesError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setSitesError("");
    const [siteResult, operationResult] = await Promise.allSettled([hubDomain.listSites(), hubDomain.listOperations()]);
    if (siteResult.status === "fulfilled") setSites(siteResult.value.sites);
    else setSitesError(siteResult.reason instanceof Error ? siteResult.reason.message : "לא ניתן לטעון את האתרים");
    if (operationResult.status === "fulfilled") setOperations(operationResult.value);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const attentionSites = useMemo(() => sites.filter((site) => presentSiteCondition(site).state !== "ready"), [sites]);
  const needsAttention = attentionSites.slice(0, 5);
  const jobs = operations?.jobs.data || [];
  const inProgress = jobs.filter((job) => presentOperationState(job.status).state === "in-progress");
  const recent = [...jobs].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 5);
  const recoverableBackups = (operations?.backups.data || []).filter((backup) => presentBackupRecoverability(backup).recoverable).length;

  return (
    <ProductPage
      title="לוח בקרה"
      description="מה דורש תשומת לב ומה אפשר לעשות עכשיו."
      action={<button className="btn btn-secondary" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={17} />רענון</button>}
    >
      <div className="normal-metrics" aria-label="תמונת מצב">
        <article><span>אתרים מנוהלים</span><strong>{sites.length}</strong></article>
        <article><span>דורשים תשומת לב</span><strong>{attentionSites.length}</strong></article>
        <article><span>גיבויים ניתנים לשחזור</span><strong>{recoverableBackups}</strong></article>
      </div>

      {sitesError ? <div className="normal-inline-error" role="status">רשימת האתרים לא זמינה כרגע. שאר המידע נשאר מוצג.</div> : null}

      <div className="normal-dashboard-grid">
        <ProductSection title="דורש תשומת לב עכשיו" description="עד חמישה אתרים עם הצעד הבא החשוב ביותר.">
          {needsAttention.length ? (
            <div className="normal-attention-list">
              {needsAttention.map((site) => {
                const condition = presentSiteCondition(site);
                return (
                  <Link to={`/sites/${encodeURIComponent(site._id)}`} className="normal-attention-row" key={site._id}>
                    <div><strong>{site.displayName}</strong><span>{condition.reason || "נדרשת בדיקה"}</span></div>
                    <HumanStatus compact state={condition.state} label={condition.label} />
                    <ArrowLeft size={17} aria-hidden="true" />
                  </Link>
                );
              })}
            </div>
          ) : <p className="normal-empty-copy">אין כרגע אתרים שדורשים טיפול.</p>}
        </ProductSection>

        <ProductSection title="פעולות מהירות" description="הפעולות היומיומיות במקום אחד.">
          <div className="normal-quick-actions">
            {canMutate(authUser.role) ? <>
              <Link className="normal-quick-action normal-quick-action-primary" to="/sites/new"><Plus size={19} /><span><strong>יצירת אתר</strong><small>אתר חדש או קיים</small></span></Link>
              <Link className="normal-quick-action" to="/sites"><FolderOpen size={19} /><span><strong>פתיחת אתר</strong><small>חיפוש וניהול</small></span></Link>
              <Link className="normal-quick-action" to="/operations?group=updates"><Rocket size={19} /><span><strong>עדכון אתר</strong><small>גרסאות ופריסות</small></span></Link>
              <Link className="normal-quick-action" to="/operations?group=backups"><DatabaseBackup size={19} /><span><strong>יצירת גיבוי</strong><small>הגנה ושחזור</small></span></Link>
            </> : <Link className="normal-quick-action" to="/sites"><FolderOpen size={19} /><span><strong>פתיחת אתר</strong><small>חיפוש ועיון</small></span></Link>}
          </div>
        </ProductSection>
      </div>

      {inProgress.length ? (
        <ProductSection title="פעולות בתהליך">
          <div className="normal-activity-list">
            {inProgress.slice(0, 5).map((job) => {
              const state = presentOperationState(job.status);
              return <ActivityRow key={job._id} title={operationTitle(job)} detail={job.siteId ? "פעולה באתר" : "פעולה מערכתית"} state={state.state} stateLabel={state.label} at={job.startedAt || job.createdAt} to="/operations" />;
            })}
          </div>
        </ProductSection>
      ) : null}

      <ProductSection title="פעילות אחרונה" description={operations?.jobs.status === "failed" ? "הפעילות לא זמינה כרגע; שאר הדשבורד פעיל." : "חמש הפעולות האחרונות."}>
        {recent.length ? <div className="normal-activity-list">{recent.map((job) => {
          const state = presentOperationState(job.status);
          return <ActivityRow key={job._id} title={operationTitle(job)} detail={job.finishedAt ? "הפעולה הסתיימה" : undefined} state={state.state} stateLabel={state.label} at={job.finishedAt || job.startedAt || job.createdAt} to="/operations" />;
        })}</div> : <p className="normal-empty-copy">אין עדיין פעילות להצגה.</p>}
      </ProductSection>
    </ProductPage>
  );
}
