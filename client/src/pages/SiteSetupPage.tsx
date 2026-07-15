import { type FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Circle, FolderPlus, Link2, LoaderCircle } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { BidiValue } from "../components/product/BidiValue";
import { HumanStatus } from "../components/product/HumanStatus";
import { ProductPage } from "../components/product/ProductPage";
import { siteWorkspaceRoute } from "../config/routeManifest";
import { hubDomain, type HubAuthUser } from "../domain/hubDomain";
import { canMutate, isSiteSetupComplete, presentSiteCondition } from "../domain/presentation";
import type { Site } from "../types/site";

type SetupStage = "details" | "destination" | "create" | "complete";
type SetupFlow = "create-new" | "track-existing";

const stages: Array<{ key: SetupStage; label: string }> = [
  { key: "details", label: "פרטים" },
  { key: "destination", label: "יעד" },
  { key: "create", label: "יצירה" },
  { key: "complete", label: "סיום" }
];

const initialForm: Partial<Site> = {
  displayName: "",
  siteCode: "",
  unitName: "",
  ownerName: "",
  ownerPersonalNumber: "",
  ownerEmail: "",
  sharePointSiteUrl: "",
  environment: "unknown",
  storageBackend: "mongo",
  siteDbLibrary: "siteDB",
  usersDbLibrary: "siteUsersDb"
};

export function SiteSetupPage({ authUser }: { authUser: HubAuthUser }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [stage, setStage] = useState<SetupStage>("details");
  const [flow, setFlow] = useState<SetupFlow>("create-new");
  const [form, setForm] = useState<Partial<Site>>(initialForm);
  const [createdSite, setCreatedSite] = useState<Site | null>(null);
  const [advancedRoute, setAdvancedRoute] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const resumeId = searchParams.get("resume");

  useEffect(() => {
    if (!resumeId) return;
    hubDomain.continueSiteSetup(resumeId).then(({ site, complete, advancedRoute: route }) => {
      setCreatedSite(site);
      setAdvancedRoute(route);
      setForm(site);
      setFlow(site.creationMode === "track-existing" ? "track-existing" : "create-new");
      setStage(complete ? "complete" : "create");
    }).catch(() => setError("לא ניתן לטעון את ההקמה השמורה."));
  }, [resumeId]);

  const activeIndex = stages.findIndex((item) => item.key === stage);
  const baseValid = Boolean(form.displayName?.trim() && form.siteCode?.trim());
  const ownerEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.ownerEmail?.trim() || "");
  const ownerValid = flow === "track-existing" || Boolean(
    form.ownerPersonalNumber?.trim() &&
    ownerEmailValid
  );
  const detailsValid = baseValid && ownerValid;
  const destinationValid = useMemo(() => {
    try {
      const url = new URL(form.sharePointSiteUrl || "");
      return ["http:", "https:"].includes(url.protocol);
    }
    catch { return false; }
  }, [form.sharePointSiteUrl]);

  const next = () => {
    setError("");
    if (stage === "details" && !detailsValid) return setError(flow === "create-new" ? "יש להזין שם, קוד, מספר אישי ודוא״ל תקין לפני שממשיכים." : "יש להזין שם וקוד אתר לפני שממשיכים.");
    if (stage === "destination" && !destinationValid) return setError("יש להזין כתובת SharePoint מלאה ותקינה.");
    const nextStage = stages[activeIndex + 1]?.key;
    if (nextStage) setStage(nextStage);
  };

  const previous = () => {
    const previousStage = stages[activeIndex - 1]?.key;
    if (previousStage) setStage(previousStage);
    else navigate("/sites");
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!canMutate(authUser.role) || createdSite) return;
    setSaving(true);
    setError("");
    try {
      const site = await hubDomain.createSite({
        ...form,
        displayName: form.displayName!.trim(),
        siteCode: form.siteCode!.trim(),
        sharePointSiteUrl: form.sharePointSiteUrl!.trim(),
        builderSiteId: form.storageBackend === "mongo" ? form.builderSiteId || form.siteCode : form.builderSiteId,
        mongoSiteId: form.storageBackend === "mongo" ? form.mongoSiteId || form.builderSiteId || form.siteCode : "",
        creationMode: flow,
        lifecycleStatus: flow === "track-existing" ? "unknown" : "planned",
        provisioningStatus: flow === "track-existing" ? "unknown" : "planned",
        status: flow === "track-existing" ? "active" : "draft",
        authoritativeAdminSource: form.storageBackend === "mongo" ? "mongo" : form.storageBackend === "txt" ? "txt" : "unknown"
      });
      setCreatedSite(site);
      setAdvancedRoute(`/advanced/sites?edit=${encodeURIComponent(site._id)}`);
      setStage(isSiteSetupComplete(site) ? "complete" : "create");
      if (flow === "track-existing") {
        try { await hubDomain.checkSite(site._id); } catch { /* The managed record remains valid when the live check is unavailable. */ }
      }
      try {
        const continuation = await hubDomain.continueSiteSetup(site._id);
        setCreatedSite(continuation.site);
        setAdvancedRoute(continuation.advancedRoute);
        setStage(continuation.complete ? "complete" : "create");
      } catch { /* Keep the persisted partial record visible even when refresh is unavailable. */ }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "שמירת האתר נכשלה");
    } finally {
      setSaving(false);
    }
  };

  if (!canMutate(authUser.role)) {
    return <ProductPage title="יצירת אתר" description="התפקיד שלך מאפשר צפייה בלבד."><div className="normal-empty-card"><h2>הפעולה אינה זמינה לצופה</h2><p>אפשר לעיין באתרים קיימים בלי לבצע שינויים.</p><Link className="btn btn-secondary mt-4" to="/sites">חזרה לאתרים</Link></div></ProductPage>;
  }

  return (
    <ProductPage title="יצירת אתר" description="ארבעה שלבים קצרים. אפשר לחזור ולהמשיך הקמה חלקית.">
      <ol className="normal-stepper" aria-label="שלבי יצירת אתר">
        {stages.map((item, index) => {
          const current = item.key === stage;
          const complete = index < activeIndex || stage === "complete";
          return <li key={item.key} className={current ? "is-current" : complete ? "is-complete" : ""} aria-current={current ? "step" : undefined}><span>{complete ? <Check size={15} /> : <Circle size={12} />}</span><strong>{item.label}</strong></li>;
        })}
      </ol>

      <form className="normal-setup-card" onSubmit={save}>
        {stage === "details" ? (
          <div className="normal-setup-stage">
            <div className="normal-choice-grid">
              <button className={flow === "create-new" ? "is-selected" : ""} type="button" onClick={() => setFlow("create-new")}><FolderPlus size={21} /><span><strong>אתר חדש</strong><small>יצירת תשתית חדשה</small></span></button>
              <button className={flow === "track-existing" ? "is-selected" : ""} type="button" onClick={() => setFlow("track-existing")}><Link2 size={21} /><span><strong>אתר קיים</strong><small>הוספה לניהול בלי לשנות אותו</small></span></button>
            </div>
            <div className="normal-form-grid">
              <label><span>שם האתר</span><input value={form.displayName || ""} onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))} aria-describedby="site-setup-details-hint" required autoFocus /></label>
              <label><span>קוד האתר</span><input dir="ltr" value={form.siteCode || ""} onChange={(event) => setForm((current) => ({ ...current, siteCode: event.target.value, builderSiteId: current.builderSiteId || event.target.value }))} placeholder="hr-portal" aria-describedby="site-setup-details-hint" required /></label>
              <label><span>יחידה</span><input value={form.unitName || ""} onChange={(event) => setForm((current) => ({ ...current, unitName: event.target.value }))} /></label>
              <label><span>שם בעל האתר</span><input value={form.ownerName || ""} onChange={(event) => setForm((current) => ({ ...current, ownerName: event.target.value }))} /></label>
              {flow === "create-new" ? <><label><span>מספר אישי של הבעלים</span><input dir="ltr" value={form.ownerPersonalNumber || ""} onChange={(event) => setForm((current) => ({ ...current, ownerPersonalNumber: event.target.value }))} aria-describedby="site-setup-details-hint" required /></label><label><span>דוא״ל של הבעלים</span><input dir="ltr" type="email" value={form.ownerEmail || ""} onChange={(event) => setForm((current) => ({ ...current, ownerEmail: event.target.value }))} aria-describedby="site-setup-details-hint" aria-invalid={Boolean(form.ownerEmail) && !ownerEmailValid} required /></label></> : null}
            </div>
            <p className="normal-form-hint" id="site-setup-details-hint">{flow === "create-new" ? "להמשך יש למלא שם, קוד, מספר אישי ודוא״ל תקין." : "להמשך יש למלא שם וקוד אתר."}</p>
          </div>
        ) : null}

        {stage === "destination" ? (
          <div className="normal-setup-stage">
            <div className="normal-form-grid normal-form-grid-wide">
              <label><span>כתובת אתר SharePoint</span><input dir="ltr" type="url" value={form.sharePointSiteUrl || ""} onChange={(event) => setForm((current) => ({ ...current, sharePointSiteUrl: event.target.value }))} placeholder="https://portal.example/sites/hr-portal" aria-invalid={Boolean(form.sharePointSiteUrl) && !destinationValid} aria-describedby="site-setup-destination-hint" required autoFocus /></label>
              <label><span>סביבה</span><select value={form.environment || "unknown"} onChange={(event) => setForm((current) => ({ ...current, environment: event.target.value as Site["environment"] }))}><option value="unknown">לא ידועה</option><option value="dev">פיתוח</option><option value="test">בדיקות</option><option value="staging">קדם־ייצור</option><option value="production">ייצור</option></select></label>
            </div>
            <fieldset className="normal-storage-choice">
              <legend>שמירת נתוני האתר</legend>
              <label><input type="radio" name="storage" checked={form.storageBackend === "mongo"} onChange={() => setForm((current) => ({ ...current, storageBackend: "mongo" }))} /><span><strong>מסד נתונים</strong><small>הבחירה המומלצת לאתר חדש</small></span></label>
              <label><input type="radio" name="storage" checked={form.storageBackend === "txt"} onChange={() => setForm((current) => ({ ...current, storageBackend: "txt" }))} /><span><strong>קבצים קיימים</strong><small>לתאימות עם אתרים ותיקים</small></span></label>
            </fieldset>
            <p className="normal-form-hint" id="site-setup-destination-hint">להמשך יש להזין כתובת מלאה שמתחילה ב־http או ב־https.</p>
          </div>
        ) : null}

        {stage === "create" ? (
          <div className="normal-setup-stage normal-setup-review">
            <div><p className="normal-eyebrow">לפני יצירה</p><h2>{createdSite ? "ההקמה נשמרה חלקית" : `יצירת ${form.displayName}`}</h2><p>{createdSite ? "אפשר להמשיך מהנקודה שנשמרה. האתר לא יסומן כמוכן עד שכל הבדיקות יסתיימו." : flow === "track-existing" ? "האתר יתווסף לניהול ותתבצע בדיקת קריאה בלבד." : "תישמר רשומת אתר ותתחיל הקמה מבוקרת. השלבים הטכניים נשארים מאחורי הקלעים."}</p></div>
            <dl><div><dt>יעד</dt><dd><BidiValue>{form.sharePointSiteUrl}</BidiValue></dd></div><div><dt>סוג</dt><dd>{flow === "track-existing" ? "אתר קיים" : "אתר חדש"}</dd></div><div><dt>נתונים</dt><dd>{form.storageBackend === "mongo" ? "מסד נתונים" : "קבצים קיימים"}</dd></div></dl>
            {createdSite ? <Link className="btn btn-primary" to={advancedRoute || `/advanced/sites?edit=${encodeURIComponent(createdSite._id)}`}>המשך הקמה</Link> : <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? <LoaderCircle className="animate-spin" size={17} /> : null}{saving ? "יוצר..." : "יצירת האתר"}</button>}
          </div>
        ) : null}

        {stage === "complete" ? (
          <div className="normal-setup-stage normal-setup-complete">
            {createdSite ? (() => { const condition = presentSiteCondition(createdSite); return <><HumanStatus state={condition.state} label={condition.label} /><h2>{condition.state === "ready" ? "האתר מוכן" : flow === "track-existing" ? "האתר נוסף לניהול" : "האתר נשמר, וההקמה עדיין בתהליך"}</h2><p>{condition.state === "ready" ? "אפשר לפתוח אותו ולעבוד." : "האתר לא מסומן כהצלחה מלאה. אפשר לפתוח אותו או להמשיך את ההקמה מהמקום שנשמר."}</p><div className="normal-complete-actions"><Link className="btn btn-primary" to={siteWorkspaceRoute(createdSite._id)}>פתיחת האתר<ArrowLeft size={16} /></Link>{condition.state !== "ready" ? <Link className="btn btn-secondary" to={advancedRoute || `/advanced/sites?edit=${encodeURIComponent(createdSite._id)}`}>המשך הקמה</Link> : null}</div></>; })() : <p>האתר נשמר.</p>}
          </div>
        ) : null}

        {error ? <div className="normal-inline-error" role="alert">{error}</div> : null}
        {stage !== "complete" && stage !== "create" ? <div className="normal-setup-actions"><button className="btn btn-secondary" type="button" onClick={previous}><ArrowRight size={16} />הקודם</button><button className="btn btn-primary" type="button" onClick={next} disabled={stage === "details" ? !detailsValid : !destinationValid}>המשך<ArrowLeft size={16} /></button></div> : stage === "create" ? <div className="normal-setup-actions"><button className="btn btn-secondary" type="button" onClick={previous}><ArrowRight size={16} />הקודם</button></div> : null}
      </form>
    </ProductPage>
  );
}
