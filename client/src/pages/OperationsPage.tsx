import { useCallback, useEffect, useMemo, useState } from "react";
import { DatabaseBackup, RefreshCw, Rocket, TriangleAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { ActivityRow } from "../components/product/ActivityRow";
import { ProductPage, ProductSection } from "../components/product/ProductPage";
import { siteWorkspaceRoute } from "../config/routeManifest";
import { hubDomain, type HubAuthUser, type HubJob, type OperationsOverview } from "../domain/hubDomain";
import { canMutate, presentBackupRecoverability, presentOperationState, presentOperationTitle } from "../domain/presentation";

const titleForJob = (job: HubJob) => presentOperationTitle(job.type);

export function OperationsPage({ authUser }: { authUser: HubAuthUser }) {
  const [overview, setOverview] = useState<OperationsOverview | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setOverview(await hubDomain.listOperations());
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const jobs = overview?.jobs.data || [];
  const groups = useMemo(() => ({
    running: jobs.filter((job) => presentOperationState(job.status).state === "in-progress"),
    failed: jobs.filter((job) => presentOperationState(job.status).state === "failed"),
    recent: [...jobs].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 8)
  }), [jobs]);
  const backups = overview?.backups.data || [];
  const recoverable = backups.filter((backup) => presentBackupRecoverability(backup).recoverable).length;
  const releases = overview?.releases.data || [];

  return (
    <ProductPage title="פעולות" description="עדכונים, גיבויים, שחזורים ופעולות שדורשות מעקב." action={<button className="btn btn-secondary" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={17} />רענון</button>}>
      <div className="normal-operation-groups">
        <Link className="normal-operation-group" to="/sites"><Rocket size={20} /><span><strong>עדכונים ופריסות</strong><small>{releases.length ? `${releases.length} גרסאות מוכרות` : "פתיחת אתר לעדכון"}</small></span></Link>
        <Link className="normal-operation-group" to="/sites"><DatabaseBackup size={20} /><span><strong>גיבויים ושחזורים</strong><small>{recoverable ? `${recoverable} גיבויים מאומתים לשחזור` : "אין כרגע גיבוי מאומת לשחזור"}</small></span></Link>
        <a className="normal-operation-group normal-operation-group-muted" href="#failed"><TriangleAlert size={20} /><span><strong>פעולות שנכשלו</strong><small>{groups.failed.length ? `${groups.failed.length} דורשות טיפול` : "אין כשל פעיל"}</small></span></a>
      </div>

      {overview && [overview.jobs, overview.backups, overview.releases].some((slice) => slice.status !== "ready") ? (
        <div className="normal-inline-warning" role="status">חלק מהמידע החי לא זמין כרגע. מידע אחרון שנשמר נשאר מוצג כשאפשר.</div>
      ) : null}

      {groups.running.length ? <ProductSection title="בתהליך" description="פעולות פעילות בלבד."><div className="normal-activity-list">{groups.running.map((job) => {
        const state = presentOperationState(job.status);
        return <ActivityRow key={job._id} title={titleForJob(job)} detail="הפעולה ממשיכה ברקע" state={state.state} stateLabel={state.label} at={job.startedAt || job.createdAt} />;
      })}</div></ProductSection> : null}

      <ProductSection title="נכשל" description="פעולות שדורשות החלטה או ניסיון חוזר." className="normal-anchor-section">
        <span id="failed" className="normal-anchor-target" />
        {groups.failed.length ? <div className="normal-activity-list">{groups.failed.map((job) => {
          const state = presentOperationState(job.status);
          return <ActivityRow key={job._id} title={titleForJob(job)} detail="פתחו את האתר המתאים כדי לראות את הצעד הבא" state={state.state} stateLabel={state.label} at={job.finishedAt || job.createdAt} to={job.siteId ? siteWorkspaceRoute(job.siteId, "activity") : undefined} />;
        })}</div> : <p className="normal-empty-copy">אין פעולות שנכשלו.</p>}
      </ProductSection>

      <ProductSection title="פעילות אחרונה"><div className="normal-activity-list">{groups.recent.map((job) => {
        const state = presentOperationState(job.status);
        return <ActivityRow key={job._id} title={titleForJob(job)} state={state.state} stateLabel={state.label} at={job.finishedAt || job.startedAt || job.createdAt} />;
      })}</div>{!groups.recent.length ? <p className="normal-empty-copy">אין עדיין פעילות להצגה.</p> : null}</ProductSection>

      {canMutate(authUser.role) ? <div className="normal-advanced-link"><Link to="/releases">אפשרויות מתקדמות לעדכונים</Link><Link to="/backups">אפשרויות מתקדמות לגיבוי ושחזור</Link></div> : null}
    </ProductPage>
  );
}
