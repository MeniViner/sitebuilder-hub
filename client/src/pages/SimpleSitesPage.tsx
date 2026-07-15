import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, MoreHorizontal, Plus, Search } from "lucide-react";
import { Link } from "react-router-dom";
import type { WhoAmIResult } from "../api/sitesApi";
import { BidiValue, DateValue } from "../components/product/BidiValue";
import { HumanStatus } from "../components/product/HumanStatus";
import { ProductPage } from "../components/product/ProductPage";
import { hubDomain } from "../domain/hubDomain";
import { canMutate, lastVerifiedBackupAt, presentSiteCondition } from "../domain/presentation";
import type { Site } from "../types/site";

type AuthUser = NonNullable<WhoAmIResult["user"]>;
type ConditionFilter = "all" | "needs-attention" | "unavailable";

export function SimpleSitesPage({ authUser }: { authUser: AuthUser }) {
  const [sites, setSites] = useState<Site[]>([]);
  const [query, setQuery] = useState("");
  const [conditionFilter, setConditionFilter] = useState<ConditionFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try { setSites((await hubDomain.listSites()).sites); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : "טעינת האתרים נכשלה"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => sites.filter((site) => {
    const condition = presentSiteCondition(site).state;
    const matchesCondition = conditionFilter === "all" || condition === conditionFilter;
    const text = `${site.displayName} ${site.siteCode} ${site.unitName || ""}`.toLowerCase();
    return matchesCondition && text.includes(query.trim().toLowerCase());
  }), [conditionFilter, query, sites]);

  return (
    <ProductPage
      title="אתרים"
      description="חיפוש, פתיחה וניהול של כל אתר."
      action={canMutate(authUser.role) ? <Link className="btn btn-primary" to="/sites/new"><Plus size={17} />יצירת אתר</Link> : undefined}
    >
      <div className="normal-site-tools">
        <label className="normal-search-field">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">חיפוש אתר</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="חיפוש לפי שם, קוד או יחידה" />
        </label>
        <label className="normal-filter-field">
          <span>מצב</span>
          <select value={conditionFilter} onChange={(event) => setConditionFilter(event.target.value as ConditionFilter)}>
            <option value="all">הכול</option>
            <option value="needs-attention">דורש תשומת לב</option>
            <option value="unavailable">לא זמין</option>
          </select>
        </label>
      </div>

      {error ? <div className="normal-inline-error" role="alert">לא ניתן לטעון את האתרים. <button type="button" onClick={() => void load()}>נסה שוב</button></div> : null}
      {loading ? <div className="normal-skeleton-list" aria-label="טוען אתרים"><span /><span /><span /></div> : null}
      {!loading && !error && !filtered.length ? <div className="normal-empty-card"><h2>לא נמצאו אתרים</h2><p>אפשר לשנות את החיפוש או את הסינון.</p></div> : null}

      <div className="normal-site-list">
        {filtered.map((site) => {
          const condition = presentSiteCondition(site);
          const verifiedBackupAt = lastVerifiedBackupAt(site);
          return (
            <article className="normal-site-summary" key={site._id}>
              <div className="normal-site-identity">
                <HumanStatus compact state={condition.state} label={condition.label} />
                <h2>{site.displayName}</h2>
                {condition.reason ? <p>{condition.reason}</p> : <p>האתר מוכן לעבודה.</p>}
              </div>
              <dl className="normal-site-facts">
                <div><dt>גרסה</dt><dd><BidiValue>{site.currentVersion || site.version || "לא ידועה"}</BidiValue></dd></div>
                <div><dt>בדיקה אחרונה</dt><dd><DateValue value={site.lastHealthCheckAt} /></dd></div>
                <div><dt>גיבוי מאומת אחרון</dt><dd>{verifiedBackupAt ? <DateValue value={verifiedBackupAt} /> : "לא אומת"}</dd></div>
              </dl>
              <div className="normal-site-actions">
                <Link className="btn btn-primary" to={`/sites/${encodeURIComponent(site._id)}`}>פתיחה<ArrowLeft size={16} /></Link>
                <details className="normal-row-menu">
                  <summary aria-label={`פעולות נוספות עבור ${site.displayName}`}><MoreHorizontal size={18} /></summary>
                  <div><Link to={`/sites/${encodeURIComponent(site._id)}?area=activity`}>פעילות</Link><Link to={`/sites/${encodeURIComponent(site._id)}?area=backups`}>גיבויים</Link></div>
                </details>
              </div>
            </article>
          );
        })}
      </div>
    </ProductPage>
  );
}
