import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCcw, Search, SlidersHorizontal } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { sitesApi } from "../api/sitesApi";
import { DerivedHealthStatus, Site, SiteStatus, SitesStats } from "../types/site";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DetailsDrawer } from "../components/DetailsDrawer";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { FilterBar } from "../components/FilterBar";
import { KpiCard } from "../components/KpiCard";
import { LoadingState } from "../components/LoadingState";
import { MetadataOnlyBadge } from "../components/MetadataOnlyBadge";
import { PageHeader } from "../components/PageHeader";
import { SectionCard } from "../components/SectionCard";
import { SiteFormModal, SiteFormSaveOptions } from "../components/SiteFormModal";
import { SitesTable } from "../components/SitesTable";
import { formatMb, formatNumber } from "../utils/format";

const defaultStats: SitesStats = {
  total: 0,
  active: 0,
  warning: 0,
  failed: 0,
  archived: 0,
  totalStorageMb: 0,
  health: { healthy: 0, warning: 0, failed: 0, unknown: 0 }
};

export function SitesPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [allSites, setAllSites] = useState<Site[]>([]);
  const [stats, setStats] = useState<SitesStats>(defaultStats);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | SiteStatus>("all");
  const [healthFilter, setHealthFilter] = useState<"all" | DerivedHealthStatus>("all");
  const [versionFilter, setVersionFilter] = useState<"all" | "outdated" | "up_to_date" | "unknown">("all");
  const [sortBy, setSortBy] = useState<"updatedAt" | "createdAt" | "lastHealthCheckAt" | "displayName">("updatedAt");
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);
  const [siteToArchive, setSiteToArchive] = useState<Site | null>(null);
  const [siteToRestore, setSiteToRestore] = useState<Site | null>(null);
  const [siteToDelete, setSiteToDelete] = useState<Site | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"active" | "archive">("active");
  const [notice, setNotice] = useState("");

  const loadSites = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await sitesApi.list({ includeArchived: "true" });
      setAllSites(response.data);
      setStats(response.meta?.stats ?? defaultStats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בטעינת רשימת אתרים");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSites(); }, []);

  useEffect(() => {
    const editId = searchParams.get("edit");
    if (!editId || allSites.length === 0) return;
    const found = allSites.find((site) => site._id === editId);
    if (found) {
      setSelectedSite(found);
      setModalOpen(true);
      setSearchParams({});
    }
  }, [searchParams, allSites, setSearchParams]);

  const sites = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return allSites
      .filter((site) => activeTab === "archive" ? site.status === "archived" : site.status !== "archived")
      .filter((site) => !needle || [site.displayName, site.siteCode, site.ownerName, site.ownerPersonalNumber, site.unitName, site.ownerEmail].some((value) => (value || "").toLowerCase().includes(needle)))
      .filter((site) => (statusFilter === "all" ? true : site.status === statusFilter))
      .filter((site) => (healthFilter === "all" ? true : site.derivedHealthStatus === healthFilter))
      .filter((site) => (versionFilter === "all" ? true : (site.versionStatus || "unknown") === versionFilter))
      .sort((a, b) => {
        if (sortBy === "displayName") return a.displayName.localeCompare(b.displayName, "he");
        return new Date((b as any)[sortBy] || 0).getTime() - new Date((a as any)[sortBy] || 0).getTime();
      });
  }, [activeTab, allSites, search, statusFilter, healthFilter, versionFilter, sortBy]);

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setHealthFilter("all");
    setVersionFilter("all");
    setSortBy("updatedAt");
  };

  const activeFilterCount = [statusFilter !== "all", healthFilter !== "all", versionFilter !== "all", sortBy !== "updatedAt"].filter(Boolean).length;

  const onSave = async (payload: Partial<Site>, options: SiteFormSaveOptions) => {
    setNotice("");
    try {
      if (selectedSite) await sitesApi.update(selectedSite._id, payload);
      else {
        const created = await sitesApi.create(payload);
        if (options.flow === "track-existing" && options.runReadOnlyValidation) {
          try {
            const health = await sitesApi.runSharePointReadOnlyHealth(created.data._id);
            setNotice(`האתר נשמר והבדיקה הסתיימה: ${health.data.derivedHealthStatus}.`);
          } catch (validationError) {
            setNotice(`האתר נשמר, אבל בדיקת הקריאה נכשלה: ${validationError instanceof Error ? validationError.message : "שגיאה לא ידועה"}`);
          }
        }
        if (options.flow === "create-new" && options.bootstrapSharePoint) {
          try {
            const queued = await sitesApi.queueSiteBootstrap(created.data._id, {
              runProvisioning: true,
              runPermissionsSetup: true,
              ...(options.bootstrapOptions || {})
            });
            const job = queued.data.job;
            const approvalText = queued.data.requiresApproval ? " וממתין לאישור מתקדם" : "";
            setNotice(`רשומת האתר נשמרה ונוצר Job הקמה ${job._id}${approvalText}.`);
          } catch (queueError) {
            setNotice(`רשומת האתר נשמרה, אבל יצירת SharePoint לא הופעלה: ${queueError instanceof Error ? queueError.message : "שגיאה לא ידועה"}`);
          }
        }
      }
      setModalOpen(false);
      setSelectedSite(null);
      await loadSites();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בשמירה");
    }
  };

  const archiveSelected = async () => {
    if (!siteToArchive) return;
    await sitesApi.archive(siteToArchive._id);
    setSiteToArchive(null);
    await loadSites();
  };

  const restoreSelected = async () => {
    if (!siteToRestore) return;
    await sitesApi.restoreFromArchive(siteToRestore._id);
    setSiteToRestore(null);
    await loadSites();
  };

  const deleteSelected = async () => {
    if (!siteToDelete) return;
    await sitesApi.deletePermanently(siteToDelete._id);
    setSiteToDelete(null);
    await loadSites();
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="רשימת אתרים"
        subtitle="ניהול registry מרכזי לאתרי Site Builder. הרשומות כאן הן מקור ניהולי ב־Mongo; פעולות SharePoint מסומנות בנפרד."
        helpKey="sites.registry"
        actions={
          <>
            <MetadataOnlyBadge mode="metadata" />
            <button className="btn btn-primary" onClick={() => { setSelectedSite(null); setModalOpen(true); }} type="button"><Plus size={16} />הוסף אתר</button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard title="סה״כ רשומות" value={formatNumber(stats.total)} icon={<SlidersHorizontal size={18} />} description="אתרים רשומים ב־Hub" tone="info" variant="inline" helpKey="sites.registry" />
        <KpiCard title="פעילים" value={formatNumber(stats.active)} icon={<SlidersHorizontal size={18} />} description="סטטוס פעיל" tone="success" variant="inline" helpKey="site.active" />
        <KpiCard title="דורשים טיפול" value={formatNumber(stats.warning + stats.failed)} icon={<SlidersHorizontal size={18} />} description="warning או failed" tone={stats.warning + stats.failed ? "warning" : "success"} variant="inline" helpKey="monitoring.alert" />
        <KpiCard title="אחסון רשום" value={formatMb(stats.totalStorageMb)} icon={<SlidersHorizontal size={18} />} description="לפי metadata במערכת" tone="neutral" variant="inline" helpKey="storage" />
      </div>

      <div className="segmented-control w-fit">
        <button className={activeTab === "active" ? "active" : ""} onClick={() => { setActiveTab("active"); setStatusFilter("all"); }} type="button">אתרים פעילים</button>
        <button className={activeTab === "archive" ? "active" : ""} onClick={() => { setActiveTab("archive"); setStatusFilter("all"); }} type="button">ארכיון</button>
      </div>

      {notice ? (
        <div className="soft-panel p-3 text-sm" style={{ color: "var(--text-strong)" }}>
          {notice}
        </div>
      ) : null}

      <SectionCard
        title={activeTab === "archive" ? "ארכיון אתרים" : "ניהול אתרים"}
        subtitle="חיפוש, סינון ומיון לפי סטטוס, תקינות וגרסה"
        helpKey={activeTab === "archive" ? "site.archived" : "sites.registry"}
        actions={<button className="btn btn-secondary" onClick={loadSites} type="button"><RefreshCcw size={15} />רענן</button>}
      >
        <FilterBar actions={
          <>
            <button className="btn btn-secondary" onClick={() => setFiltersOpen(true)} type="button"><SlidersHorizontal size={15} />סינון מתקדם {activeFilterCount ? `(${activeFilterCount})` : ""}</button>
            <button className="btn btn-ghost" onClick={clearFilters} type="button">נקה סינונים</button>
          </>
        }>
          <label className="block">
            <span className="field-label">חיפוש</span>
            <div className="relative">
              <Search className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 muted" size={15} />
              <input className="control pr-9" placeholder="שם, קוד, בעלים או יחידה" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </label>
          <div className="flex flex-wrap items-end gap-2">
            {statusFilter !== "all" ? <span className="badge badge-info">סטטוס: {statusFilter}</span> : null}
            {healthFilter !== "all" ? <span className="badge badge-info">תקינות: {healthFilter}</span> : null}
            {versionFilter !== "all" ? <span className="badge badge-info">גרסה: {versionFilter}</span> : null}
            <span className="badge badge-neutral">מציג {formatNumber(sites.length)} מתוך {formatNumber(activeTab === "archive" ? stats.archived : allSites.length - stats.archived)}</span>
          </div>
        </FilterBar>

        {loading ? <LoadingState /> : null}
        {!loading && error ? <ErrorState message={error} onRetry={loadSites} /> : null}
        {!loading && !error && allSites.length === 0 ? (
          <EmptyState title="אין עדיין אתרים" description="התחל בהוספת אתר ראשון ל־registry. הפעולה אינה יוצרת אתר SharePoint." action={<button className="btn btn-primary" onClick={() => setModalOpen(true)} type="button"><Plus size={16} />הוסף אתר</button>} />
        ) : null}
        {!loading && !error && allSites.length > 0 && sites.length === 0 ? <EmptyState title="אין תוצאות" description="שנה סינונים או נקה אותם כדי לראות אתרים." /> : null}
        {!loading && !error && sites.length > 0 ? (
          <SitesTable
            sites={sites}
            onEdit={(site) => { setSelectedSite(site); setModalOpen(true); }}
            onArchive={setSiteToArchive}
            onRestore={setSiteToRestore}
            onPermanentDelete={setSiteToDelete}
            onDetails={(id) => navigate(`/sites/${id}`)}
          />
        ) : null}
      </SectionCard>

      <SiteFormModal open={modalOpen} site={selectedSite} onClose={() => setModalOpen(false)} onSave={onSave} />
      <DetailsDrawer open={filtersOpen} title="סינון מתקדם" subtitle="סטטוס, תקינות, גרסה ומיון" onClose={() => setFiltersOpen(false)}>
        <div className="space-y-4">
          <label className="block">
            <span className="field-label">סטטוס</span>
            <select className="control" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
              <option value="all">כל הסטטוסים</option>
              <option value="active">פעיל</option>
              <option value="warning">אזהרה</option>
              <option value="failed">נכשל</option>
              <option value="draft">טיוטה</option>
              <option value="archived">בארכיון</option>
            </select>
          </label>
          <label className="block">
            <span className="field-label">תקינות</span>
            <select className="control" value={healthFilter} onChange={(e) => setHealthFilter(e.target.value as any)}>
              <option value="all">כל מצבי התקינות</option>
              <option value="healthy">תקין</option>
              <option value="warning">אזהרה</option>
              <option value="failed">נכשל</option>
              <option value="unknown">לא נבדק</option>
            </select>
          </label>
          <label className="block">
            <span className="field-label">גרסה</span>
            <select className="control" value={versionFilter} onChange={(e) => setVersionFilter(e.target.value as any)}>
              <option value="all">כל הגרסאות</option>
              <option value="outdated">מיושן</option>
              <option value="up_to_date">עדכני</option>
              <option value="unknown">לא נבדק</option>
            </select>
          </label>
          <label className="block">
            <span className="field-label">מיון</span>
            <select className="control" value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
              <option value="updatedAt">עדכון אחרון</option>
              <option value="createdAt">יצירה</option>
              <option value="lastHealthCheckAt">בדיקת תקינות</option>
              <option value="displayName">שם אתר</option>
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-secondary" type="button" onClick={clearFilters}>נקה סינונים</button>
            <button className="btn btn-primary" type="button" onClick={() => setFiltersOpen(false)}>החל</button>
          </div>
        </div>
      </DetailsDrawer>
      <ConfirmDialog
        open={Boolean(siteToArchive)}
        title="להעביר לארכיון?"
        description={`הפעולה מסמנת את ${siteToArchive?.displayName || "האתר"} בארכיון של ה־Hub בלבד. לא נמחקים קבצים או נתונים מ־SharePoint.`}
        confirmLabel="העבר לארכיון"
        danger
        onClose={() => setSiteToArchive(null)}
        onConfirm={archiveSelected}
      />
      <ConfirmDialog
        open={Boolean(siteToRestore)}
        title="לשחזר מהארכיון?"
        description={`האתר ${siteToRestore?.displayName || ""} יחזור לרשימת האתרים הפעילים.`}
        confirmLabel="שחזר"
        onClose={() => setSiteToRestore(null)}
        onConfirm={restoreSelected}
      />
      <ConfirmDialog
        open={Boolean(siteToDelete)}
        title="מחיקה קבועה?"
        description={`הפעולה מוחקת את רשומת ${siteToDelete?.displayName || "האתר"} מה־Hub. היא אינה מוחקת קבצי SharePoint.`}
        confirmLabel="מחק לצמיתות"
        danger
        onClose={() => setSiteToDelete(null)}
        onConfirm={deleteSelected}
      />
    </div>
  );
}
