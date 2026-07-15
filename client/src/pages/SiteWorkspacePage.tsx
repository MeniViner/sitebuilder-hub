import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Activity, ArrowLeft, DatabaseBackup, ExternalLink, FolderTree, MoreHorizontal, RefreshCw, Shield, UserPlus } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ProtectedActionDialog } from "../components/ProtectedActionDialog";
import { ActivityRow } from "../components/product/ActivityRow";
import { BidiValue, DateValue } from "../components/product/BidiValue";
import { HumanStatus } from "../components/product/HumanStatus";
import { ProductPage, ProductSection } from "../components/product/ProductPage";
import { resolveSiteWorkspaceArea, siteWorkspaceRoute, type SiteWorkspaceArea } from "../config/routeManifest";
import { hubDomain, type HubAuthUser, type HubBackup, type HubJob, type SiteWorkspaceData } from "../domain/hubDomain";
import { canMutate, presentBackupRecoverability, presentOperationState, presentSiteCondition } from "../domain/presentation";
import { jobTypeLabel } from "../utils/format";

const areas: Array<{ key: SiteWorkspaceArea; label: string; icon: typeof Activity }> = [
  { key: "overview", label: "סקירה", icon: Activity },
  { key: "access", label: "גישה", icon: Shield },
  { key: "structure", label: "מבנה", icon: FolderTree },
  { key: "backups", label: "גיבויים", icon: DatabaseBackup },
  { key: "activity", label: "פעילות", icon: RefreshCw }
];

const asAdminRows = (value: unknown): Array<{ id: string; name: string; email: string; personalNumber: string }> => {
  if (!value || typeof value !== "object") return [];
  const data = value as Record<string, unknown>;
  const candidates = [data.admins, data.txtAdmins, data.siteCollectionAdmins, data.ownersGroupAdmins].flatMap((item) => Array.isArray(item) ? item : []);
  const seen = new Set<string>();
  return candidates.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const admin = item as Record<string, unknown>;
    const email = String(admin.email || "");
    const personalNumber = String(admin.personalNumber || "");
    const name = String(admin.displayName || admin.name || email || personalNumber || "משתמש");
    const id = String(admin._id || admin.id || admin.loginName || email || personalNumber || `${name}-${index}`);
    if (seen.has(id)) return [];
    seen.add(id);
    return [{ id, name, email, personalNumber }];
  });
};

export function SiteWorkspacePage({ authUser }: { authUser: HubAuthUser }) {
  const { id = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeArea = resolveSiteWorkspaceArea(searchParams.get("area") || searchParams.get("tab"));
  const [data, setData] = useState<SiteWorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [backupConfirm, setBackupConfirm] = useState(false);
  const [restoreBackup, setRestoreBackup] = useState<HubBackup | null>(null);
  const [addAccessOpen, setAddAccessOpen] = useState(false);
  const [accessForm, setAccessForm] = useState({ displayName: "", personalNumber: "", email: "", reason: "" });

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try { setData(await hubDomain.getSiteWorkspace(id)); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : "טעינת האתר נכשלה"); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const setArea = (area: SiteWorkspaceArea) => {
    const next = new URLSearchParams(searchParams);
    next.delete("tab");
    if (area === "overview") next.delete("area");
    else next.set("area", area);
    setSearchParams(next, { replace: true });
  };

  const site = data?.site;
  const condition = site ? presentSiteCondition(site) : null;
  const admins = useMemo(() => {
    const live = asAdminRows(data?.access.data);
    if (live.length) return live;
    return (site?.txtAdmins || []).map((admin, index) => ({ id: admin.loginName || admin.email || admin.personalNumber || String(index), name: admin.displayName || admin.email || admin.personalNumber || "משתמש", email: admin.email || "", personalNumber: admin.personalNumber || "" }));
  }, [data?.access.data, site?.txtAdmins]);

  const runCheck = async () => {
    if (!site || !canMutate(authUser.role)) return;
    setBusy(true); setNotice("");
    try { await hubDomain.checkSite(site._id); setNotice("הבדיקה הסתיימה. הנתונים יתעדכנו כעת."); await load(); }
    catch { setNotice("הבדיקה לא הושלמה. המידע האחרון נשמר ולא הוחלף."); }
    finally { setBusy(false); }
  };

  const createBackup = async () => {
    if (!site) return;
    setBusy(true); setBackupConfirm(false); setNotice("");
    try { await hubDomain.createBackup(site._id); setNotice("הגיבוי התחיל. הוא יוצג כניתן לשחזור רק אחרי אימות מלא."); await load(); }
    catch (actionError) { setNotice(actionError instanceof Error ? actionError.message : "הגיבוי לא התחיל"); }
    finally { setBusy(false); }
  };

  const restore = async (notes: string) => {
    if (!restoreBackup) return;
    setBusy(true); setNotice("");
    try { await hubDomain.restoreBackup(restoreBackup._id, notes); setNotice("השחזור התחיל. אפשר לעקוב אחריו בפעילות."); setRestoreBackup(null); await load(); }
    catch (actionError) { setNotice(actionError instanceof Error ? actionError.message : "השחזור לא התחיל"); }
    finally { setBusy(false); }
  };

  const addAccess = async (event: FormEvent) => {
    event.preventDefault();
    if (!site) return;
    setBusy(true); setNotice("");
    try {
      await hubDomain.updateAccess({ action: "add", siteId: site._id, admin: { displayName: accessForm.displayName, personalNumber: accessForm.personalNumber, email: accessForm.email }, reason: accessForm.reason });
      setNotice("בקשת הגישה נשמרה."); setAddAccessOpen(false); setAccessForm({ displayName: "", personalNumber: "", email: "", reason: "" }); await load();
    } catch (actionError) { setNotice(actionError instanceof Error ? actionError.message : "עדכון הגישה נכשל"); }
    finally { setBusy(false); }
  };

  if (loading && !site) return <ProductPage title="טוען אתר" description="אוספים את המידע החי והמידע האחרון שנשמר."><div className="normal-skeleton-list"><span /><span /><span /></div></ProductPage>;
  if (error || !site || !condition) return <ProductPage title="האתר לא זמין" description="לא הצלחנו לפתוח את סביבת האתר."><div className="normal-empty-card"><h2>לא ניתן לטעון את האתר</h2><p>{error || "המזהה אינו מוכר"}</p><button className="btn btn-secondary mt-4" type="button" onClick={() => void load()}>נסה שוב</button></div></ProductPage>;

  const partialFailure = [data.backups, data.access, data.deployments, data.activity].some((slice) => slice.status === "failed");
  const backups = data.backups.data || [];
  const activity = data.activity.data || [];

  return (
    <ProductPage
      title={site.displayName}
      description={condition.reason || "האתר מוכן לעבודה."}
      eyebrow="אתר מנוהל"
      action={<div className="normal-header-actions"><a className="btn btn-primary" href={site.finalAppUrl || site.sharePointSiteUrl} target="_blank" rel="noreferrer">פתיחת האתר<ExternalLink size={16} /></a>{canMutate(authUser.role) ? <button className="btn btn-secondary" type="button" onClick={() => void runCheck()} disabled={busy}><RefreshCw size={16} />בדיקה עכשיו</button> : <Link className="btn btn-secondary" to={siteWorkspaceRoute(site._id, "backups")}>גיבויים</Link>}<details className="normal-row-menu"><summary aria-label={`פעולות נוספות עבור ${site.displayName}`}><MoreHorizontal size={18} /></summary><div><Link to={siteWorkspaceRoute(site._id, "backups")}>גיבויים</Link><Link to={siteWorkspaceRoute(site._id, "activity")}>פעילות</Link>{canMutate(authUser.role) ? <Link to={`/advanced/sites/${encodeURIComponent(site._id)}`}>פרטים מתקדמים</Link> : null}</div></details></div>}
    >
      <div className="normal-workspace-summary"><HumanStatus state={condition.state} label={condition.label} /><span>גרסה <BidiValue>{site.currentVersion || site.version || "לא ידועה"}</BidiValue></span><span>נבדק <DateValue value={site.lastHealthCheckAt} /></span></div>
      <nav className="normal-workspace-tabs" aria-label="אזורי האתר">
        {areas.map((area) => { const Icon = area.icon; return <button key={area.key} type="button" className={activeArea === area.key ? "is-active" : ""} aria-current={activeArea === area.key ? "page" : undefined} onClick={() => setArea(area.key)}><Icon size={17} /><span>{area.label}</span></button>; })}
      </nav>
      {partialFailure ? <div className="normal-inline-warning" role="status">חלק מהמידע החי לא זמין. המידע האחרון שהצליח להיטען נשאר מוצג.</div> : null}
      {notice ? <div className="normal-inline-warning" role="status">{notice}</div> : null}

      {activeArea === "overview" ? (
        <div className="normal-workspace-grid">
          <ProductSection title="מצב האתר" description={condition.reason || "לא נמצאה בעיה פעילה."}>
            <dl className="normal-key-facts"><div><dt>גרסה נוכחית</dt><dd><BidiValue>{site.currentVersion || site.version || "לא ידועה"}</BidiValue></dd></div><div><dt>גרסה ידועה אחרונה</dt><dd><BidiValue>{site.latestKnownVersion || site.targetVersion || "אין גרסה ידועה"}</BidiValue></dd></div><div><dt>בדיקה אחרונה</dt><dd><DateValue value={site.lastHealthCheckAt} /></dd></div></dl>
          </ProductSection>
          <ProductSection title="הפעולה הבאה"><div className="normal-next-action"><div><strong>{condition.state === "ready" ? "האתר זמין לעבודה" : "בדקו את האתר לפני פעולה נוספת"}</strong><p>{condition.state === "ready" ? "אפשר לנהל גישה, לבדוק עדכון או ליצור גיבוי." : condition.reason}</p></div><Link className="btn btn-primary" to={siteWorkspaceRoute(site._id, condition.state === "ready" ? "backups" : "activity")}>{condition.state === "ready" ? "יצירת גיבוי" : "פתיחת פעילות"}<ArrowLeft size={16} /></Link></div></ProductSection>
          <ProductSection title="בעלות"><dl className="normal-key-facts"><div><dt>בעל האתר</dt><dd>{site.ownerName || "לא הוגדר"}</dd></div><div><dt>יחידה</dt><dd>{site.unitName || "לא הוגדרה"}</dd></div><div><dt>דוא״ל</dt><dd>{site.ownerEmail ? <BidiValue>{site.ownerEmail}</BidiValue> : "לא הוגדר"}</dd></div></dl></ProductSection>
        </div>
      ) : null}

      {activeArea === "access" ? (
        <ProductSection title="גישה לאתר" description={`${admins.length} בעלי גישה ידועים`} action={canMutate(authUser.role) ? <button className="btn btn-primary" type="button" onClick={() => setAddAccessOpen((open) => !open)}><UserPlus size={16} />הוספת גישה</button> : undefined}>
          {addAccessOpen ? <form className="normal-access-form" onSubmit={addAccess}><label><span>שם</span><input value={accessForm.displayName} onChange={(event) => setAccessForm((current) => ({ ...current, displayName: event.target.value }))} required /></label><label><span>מספר אישי</span><input dir="ltr" value={accessForm.personalNumber} onChange={(event) => setAccessForm((current) => ({ ...current, personalNumber: event.target.value }))} /></label><label><span>דוא״ל</span><input dir="ltr" type="email" value={accessForm.email} onChange={(event) => setAccessForm((current) => ({ ...current, email: event.target.value }))} /></label><label><span>סיבה</span><input value={accessForm.reason} onChange={(event) => setAccessForm((current) => ({ ...current, reason: event.target.value }))} minLength={3} required /></label><button className="btn btn-primary" type="submit" disabled={busy}>שמירת גישה</button></form> : null}
          <div className="normal-access-list">{admins.map((admin) => <div key={admin.id}><span className="normal-avatar" aria-hidden="true">{admin.name.slice(0, 1)}</span><div><strong>{admin.name}</strong><small>{admin.email || admin.personalNumber ? <BidiValue>{admin.email || admin.personalNumber}</BidiValue> : "פרטים לא זמינים"}</small></div><span>מנהל אתר</span></div>)}</div>
          {!admins.length ? <p className="normal-empty-copy">לא נמצאו בעלי גישה במידע הזמין.</p> : null}
        </ProductSection>
      ) : null}

      {activeArea === "structure" ? (
        <div className="normal-workspace-grid">
          <ProductSection title="מבנה האתר" description="המיקומים והקישורים החשובים לעבודה."><dl className="normal-key-facts"><div><dt>אתר SharePoint</dt><dd><a href={site.sharePointSiteUrl} target="_blank" rel="noreferrer">פתיחה</a></dd></div><div><dt>אפליקציה</dt><dd>{site.finalAppUrl ? <a href={site.finalAppUrl} target="_blank" rel="noreferrer">פתיחה</a> : "עדיין לא הוגדרה"}</dd></div><div><dt>סביבה</dt><dd>{site.environment && site.environment !== "unknown" ? site.environment : "לא ידועה"}</dd></div></dl></ProductSection>
          <ProductSection title="מוכנות"><div className="normal-next-action"><div><strong>{site.lifecycleStatus === "ready" ? "המבנה מוכן" : "ההקמה עדיין לא הושלמה"}</strong><p>{site.lifecycleStatus === "ready" ? "נתיבי האירוח נשמרו ונבדקו." : "המשיכו את ההקמה מהנקודה שנשמרה."}</p></div>{site.lifecycleStatus !== "ready" && canMutate(authUser.role) ? <Link className="btn btn-primary" to={`/advanced/sites?edit=${encodeURIComponent(site._id)}`}>המשך הקמה</Link> : null}</div></ProductSection>
          <details className="normal-advanced-details"><summary>פרטים טכניים</summary><dl><div><dt>מזהה מנוהל</dt><dd><BidiValue>{site._id}</BidiValue></dd></div><div><dt>מזהה Builder</dt><dd>{site.builderSiteId ? <BidiValue>{site.builderSiteId}</BidiValue> : "לא הוגדר"}</dd></div><div><dt>אחסון</dt><dd><BidiValue>{site.storageBackend || "unknown"}</BidiValue></dd></div><div><dt>נתיב runtime</dt><dd>{site.runtimeConfigPath ? <BidiValue>{site.runtimeConfigPath}</BidiValue> : "לא הוגדר"}</dd></div></dl>{canMutate(authUser.role) ? <Link to={`/advanced/sites/${encodeURIComponent(site._id)}`}>פתיחת פרטים מתקדמים</Link> : null}</details>
        </div>
      ) : null}

      {activeArea === "backups" ? (
        <ProductSection title="גיבויים" description="רק גיבוי עם מטען ואימות מלא מסומן כניתן לשחזור." action={canMutate(authUser.role) ? <button className="btn btn-primary" type="button" onClick={() => setBackupConfirm(true)} disabled={busy}><DatabaseBackup size={16} />יצירת גיבוי</button> : undefined}>
          <div className="normal-backup-list">{backups.map((backup) => { const recovery = presentBackupRecoverability(backup); const state = presentOperationState(backup.status); return <article key={backup._id}><div><HumanStatus compact state={recovery.recoverable ? "succeeded" : state.state} label={recovery.label} /><strong><DateValue value={backup.createdAt} /></strong><span>{recovery.reason}</span></div><div><span>{backup.filesCount || 0} קבצים</span>{recovery.recoverable && canMutate(authUser.role) ? <button className="btn btn-secondary" type="button" onClick={() => setRestoreBackup(backup)}>שחזור</button> : null}</div></article>; })}</div>
          {!backups.length ? <p className="normal-empty-copy">אין עדיין גיבויים להצגה.</p> : null}
        </ProductSection>
      ) : null}

      {activeArea === "activity" ? (
        <ProductSection title="פעילות" description="פעולות ותוצאות, בלי פרטי תשתית."><div className="normal-activity-list">{activity.map((job: HubJob) => { const state = presentOperationState(job.status); return <ActivityRow key={job._id} title={jobTypeLabel(job.type)} detail={job.errorMessage && state.state === "failed" ? "הפעולה דורשת בדיקה" : undefined} state={state.state} stateLabel={state.label} at={job.finishedAt || job.startedAt || job.createdAt} />; })}</div>{!activity.length ? <p className="normal-empty-copy">אין עדיין פעילות להצגה.</p> : null}{canMutate(authUser.role) ? <div className="normal-advanced-link"><Link to={`/advanced/sites/${encodeURIComponent(site._id)}?tab=activity`}>פרטי פעילות מתקדמים</Link></div> : null}</ProductSection>
      ) : null}

      <ConfirmDialog open={backupConfirm} title="יצירת גיבוי" description="המערכת תתחיל גיבוי ותאמת אותו לפני שתציג אותו כניתן לשחזור." confirmLabel="התחלת גיבוי" onClose={() => setBackupConfirm(false)} onConfirm={() => void createBackup()} />
      <ProtectedActionDialog open={Boolean(restoreBackup)} title="שחזור גיבוי" description="השחזור מחליף נתונים פעילים בנתוני הגיבוי שנבחר." confirmWord="שחזור" noteLabel="סיבת השחזור" noteHint="הסיבה תישמר ביומן הפעילות." risks={["שינויים שנעשו אחרי הגיבוי עלולים להימחק.", "הפעולה תתחיל רק לאחר בדיקות הבטיחות הזמינות."]} confirmLabel="התחלת שחזור" busy={busy} onClose={() => setRestoreBackup(null)} onConfirm={(notes) => void restore(notes)} />
    </ProductPage>
  );
}
