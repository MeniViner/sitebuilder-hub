import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Cable, CheckCircle2, RefreshCcw, ShieldAlert } from "lucide-react";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { HelpLabel } from "../components/help/HelpLabel";
import { KpiCard } from "../components/KpiCard";
import { LinkRow } from "../components/LinkRow";
import { LoadingState } from "../components/LoadingState";
import { PageHeader } from "../components/PageHeader";
import { SectionCard } from "../components/SectionCard";
import { API_BASE_URL, DiagnosticsResult, getHubPersonalNumber, SharePointDiagnosticsCheck, sitesApi } from "../api/sitesApi";
import { Site } from "../types/site";
import { formatDateTime } from "../utils/format";
import {
  BrowserSharePointDiagnosticsResult,
  combineSharePointConnectorDiagnostics,
  runBrowserSharePointDiagnostics
} from "../utils/sharepointBrowserConnector";

const boolLabel = (value?: boolean) => value ? "כן" : "לא";
const sharePoint401Explanation = "הדפדפן מחובר ל־SharePoint, אבל השרת המקומי לא מחובר";

const probeSummary = (probe?: Record<string, unknown>) => {
  if (!probe) return { ok: false, label: "לא נבדק", status: "" };
  const ok = Boolean(probe.ok);
  const status = probe.status ? `${probe.status} ${probe.statusText || ""}` : String(probe.error || "");
  return { ok, label: ok ? "תקין" : "נכשל", status };
};

export function DiagnosticsPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState("");
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResult | null>(null);
  const [browserSharePointCheck, setBrowserSharePointCheck] = useState<BrowserSharePointDiagnosticsResult | null>(null);
  const [backendSharePointCheck, setBackendSharePointCheck] = useState<SharePointDiagnosticsCheck | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = async (selectedSiteId = siteId) => {
    setLoading(true);
    setError("");
    try {
      const [sitesRes, diagnosticsRes] = await Promise.all([
        sitesApi.list({ includeArchived: "true" }),
        sitesApi.diagnostics(selectedSiteId || undefined)
      ]);
      setSites(sitesRes.data);
      setDiagnostics(diagnosticsRes.data);
      const resolvedSiteId = selectedSiteId || diagnosticsRes.data.selectedSite?._id || sitesRes.data.find((site) => site.status !== "archived")?._id || "";
      setSiteId(String(resolvedSiteId || ""));
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בטעינת אבחון");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const runSharePointCheck = async () => {
    setBusyAction("sharepoint-check");
    setMessage("");
    setError("");
    const selectedSite = sites.find((site) => site._id === siteId) || sites.find((site) => site.status !== "archived") || null;

    console.groupCollapsed("[HUB][SharePoint diagnostics] בדוק SharePoint עכשיו");
    console.log("Frontend origin:", window.location.origin);
    console.log("Current URL:", window.location.href);
    console.log("API base URL:", API_BASE_URL);
    console.log("Selected site id:", siteId);
    console.log("Selected site:", selectedSite ? { id: selectedSite._id, code: selectedSite.siteCode } : null);
    console.log("Personal number exists:", Boolean(getHubPersonalNumber()));
    console.log("Diagnostics before check:", diagnostics);
    console.log("SharePoint check before check:", { browser: browserSharePointCheck, backend: backendSharePointCheck });
    try {
      if (!selectedSite) {
        throw new Error("לא נבחר אתר לבדיקה");
      }

      const browserResult = await runBrowserSharePointDiagnostics(selectedSite);
      setBrowserSharePointCheck(browserResult);
      console.log("Target SharePoint URL:", browserResult.targetSharePointSiteUrl);
      console.log("Connector mode:", browserResult.connectorMode);
      console.log("Browser currentuser URL:", browserResult.currentUser.url, "status:", browserResult.currentUser.status);
      console.log("Browser contextinfo URL:", browserResult.digestTest.url, "status:", browserResult.digestTest.status);
      console.log("Browser digest result:", {
        digestFound: browserResult.digestTest.digestFound,
        digestPreview: browserResult.digestTest.digestPreview,
        status: browserResult.digestTest.status
      });

      let backendResult: SharePointDiagnosticsCheck | null = null;
      try {
        const result = await sitesApi.runSharePointDiagnostics(selectedSite._id);
        backendResult = result.data;
      } catch (backendError) {
        backendResult = {
          generatedAt: new Date().toISOString(),
          connectorMode: "backend-sharepoint",
          ok: false,
          errorCode: "BACKEND_DIAGNOSTICS_API_FAILED",
          humanExplanation: backendError instanceof Error ? backendError.message : String(backendError)
        };
      }
      setBackendSharePointCheck(backendResult);
      console.log("Backend diagnostics status:", {
        source: "backend",
        ok: backendResult?.ok,
        currentUserStatus: backendResult?.currentUser?.status,
        readTestStatus: backendResult?.readTest?.status,
        digestStatus: backendResult?.digestTest?.status,
        failedStatus: backendResult?.overall?.failedStatus,
        failedBackendErrorCode: backendResult?.overall?.failedBackendErrorCode
      });
      const combined = combineSharePointConnectorDiagnostics(browserResult, backendResult);
      console.log("Connector mode:", combined.preferredConnectorMode);
      console.log("Per-test result object:", {
        browser: browserResult,
        backend: backendResult,
        combined
      });
      setMessage(combined.message);
    } catch (err) {
      console.log("Backend diagnostics failed:", {
        source: "backend",
        error: err instanceof Error ? err.message : String(err)
      });
      setError(err instanceof Error ? err.message : "שגיאה בהרצת בדיקת SharePoint");
    } finally {
      console.groupEnd();
      setBusyAction("");
    }
  };

  const pathRows = useMemo(() => backendSharePointCheck?.paths?.checks || diagnostics?.paths?.checks || [], [diagnostics, backendSharePointCheck]);
  const browserCurrentUser = probeSummary(browserSharePointCheck?.currentUser);
  const browserReadTest = probeSummary(browserSharePointCheck?.readTest);
  const browserDigestTest = probeSummary(browserSharePointCheck?.digestTest);
  const backendCurrentUser = probeSummary(backendSharePointCheck?.currentUser);
  const backendReadTest = probeSummary(backendSharePointCheck?.readTest);
  const backendDigestTest = probeSummary(backendSharePointCheck?.digestTest);
  const combinedConnectorStatus = combineSharePointConnectorDiagnostics(browserSharePointCheck, backendSharePointCheck);

  const pathColumns: DataTableColumn<Record<string, string>>[] = [
    { key: "key", header: "בדיקה", helpKey: "diagnostics", render: (row) => <span className="font-bold">{row.key}</span> },
    { key: "libraryName", header: "ספרייה", helpKey: "site.environment", render: (row) => row.libraryName || "-" },
    { key: "serverRelativePath", header: "נתיב יחסי לשרת", helpKey: "site.finalDistPath", render: (row) => <code className="num block max-w-[320px] truncate text-xs muted" title={row.serverRelativePath}>{row.serverRelativePath || "-"}</code> },
    { key: "finalRestUrl", header: "URL סופי", helpKey: "sharepoint.read", render: (row) => <code className="num block max-w-[420px] truncate text-xs muted" title={row.finalRestUrl}>{row.finalRestUrl || "-"}</code> }
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="בעיות וחיבורים"
        subtitle="אבחון אחד לכל בעיות זהות, Origin, SharePoint, נתיבים ו־401."
        helpKey="diagnostics"
        actions={<button className="btn btn-secondary" type="button" onClick={() => load(siteId)}><RefreshCcw size={15} />רענון</button>}
      />

      {message ? <div className="badge badge-success px-3 py-2">{message}</div> : null}
      {loading ? <LoadingState /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={() => load(siteId)} /> : null}

      {!loading && !error && diagnostics ? (
        <>
          {diagnostics.auth.localFallbackActive ? (
            <div className="rounded-lg border p-3 text-sm" style={{ background: "var(--warning-soft)", borderColor: "color-mix(in srgb, var(--warning) 35%, var(--border))" }}>
              <div className="mb-1 flex items-center gap-2 font-bold" style={{ color: "var(--warning)" }}><AlertTriangle size={15} />מצב פיתוח מקומי</div>
              המשתמש אינו מזוהה מ־SharePoint. אם זה פתוח מתוך SharePoint, בדקו שהקריאה ל־`/_api/web/currentuser` מצליחה.
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard title="מצב אפליקציה" value={diagnostics.appMode} icon={<Cable size={18} />} tone="info" helpKey="mode.localDevOwner" />
            <KpiCard title="זהות פעילה" value={diagnostics.auth.activeBackendUser?.name || "לא ידוע"} icon={<CheckCircle2 size={18} />} tone={diagnostics.auth.activeBackendUser?.source === "sharepoint" ? "success" : diagnostics.auth.localFallbackActive ? "warning" : "neutral"} helpKey="sharepoint.currentUser" />
            <KpiCard title="SharePoint write" value={diagnostics.sharePoint.writeEnabled ? "מוגדר" : "כבוי"} icon={<ShieldAlert size={18} />} tone={diagnostics.sharePoint.writeEnabled ? "warning" : "neutral"} helpKey="sharepoint.write" />
            <KpiCard title="Owner direct" value={diagnostics.auth.ownerDirectMode ? "פעיל" : "כבוי"} icon={<CheckCircle2 size={18} />} tone={diagnostics.auth.ownerDirectMode ? "success" : "warning"} helpKey="mode.owner" />
          </div>

          <SectionCard title="מצב וחיבורי בסיס" subtitle="Origin, API וזהות שהשרת רואה" helpKey="system.apiBaseUrl">
            <div className="grid gap-2 md:grid-cols-2">
              <LinkRow label="Frontend origin" value={diagnostics.frontendOrigin || window.location.origin} />
              <LinkRow label="CLIENT_ORIGIN" value={diagnostics.configuredClientOrigin} />
              <LinkRow label="CLIENT_ORIGINS" value={diagnostics.configuredClientOrigins.join(", ")} />
              <LinkRow label="API base URL" value={diagnostics.currentApiBaseUrl} />
              <LinkRow label="Mongo" value={diagnostics.mongo} />
              <LinkRow label="Current user detection" value={diagnostics.auth.currentUserDetectionResult} />
            </div>
            {diagnostics.envWarnings.length ? (
              <div className="mt-4 space-y-2">
                {diagnostics.envWarnings.map((warning) => <div key={warning} className="badge badge-warning px-3 py-2">{warning}</div>)}
              </div>
            ) : null}
          </SectionCard>

          <SectionCard
            title="בחירת אתר לבדיקת SharePoint"
            subtitle="הבדיקה תריץ Browser SharePoint Connector וגם Backend SharePoint Connector, ותציג אותם בנפרד."
            helpKey="sharepoint.browserConnector"
            actions={<button className="btn btn-primary" type="button" disabled={busyAction === "sharepoint-check"} onClick={runSharePointCheck}><RefreshCcw size={15} />בדוק SharePoint עכשיו</button>}
          >
            <div className="mb-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
              <label className="block">
                <span className="field-label"><HelpLabel helpKey="sites.registry">אתר לבדיקה</HelpLabel></span>
                <select className="control" value={siteId} onChange={(event) => { setSiteId(event.target.value); setBrowserSharePointCheck(null); setBackendSharePointCheck(null); load(event.target.value); }}>
                  {sites.map((site) => <option key={site._id} value={site._id}>{site.displayName} ({site.siteCode}){site.status === "archived" ? " - ארכיון" : ""}</option>)}
                </select>
              </label>
              <span className="badge badge-neutral">בדיקה אחרונה: {formatDateTime(browserSharePointCheck?.generatedAt || backendSharePointCheck?.generatedAt || diagnostics.generatedAt)}</span>
            </div>
            <div className="rounded-lg border p-3 text-sm" style={{ background: "var(--surface-muted)", borderColor: "var(--border)" }}>
              <p className="font-bold" style={{ color: "var(--text-strong)" }}>מצב מחבר מועדף: {combinedConnectorStatus.preferredConnectorMode}</p>
              <p className="mt-1 muted">{combinedConnectorStatus.message}</p>
            </div>
          </SectionCard>

          <SectionCard
            title="Browser SharePoint Connector"
            subtitle="בדיקות שמבוצעות ישירות מהדפדפן עם credentials: include מול אתר היעד."
            helpKey="sharepoint.browserConnector"
          >
            {browserSharePointCheck ? (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <KpiCard title="Current user" value={browserCurrentUser.label} icon={<CheckCircle2 size={18} />} tone={browserCurrentUser.ok ? "success" : "danger"} description={browserCurrentUser.status} helpKey="sharepoint.currentUser" />
                  <KpiCard title="Read test" value={browserReadTest.label} icon={<CheckCircle2 size={18} />} tone={browserReadTest.ok ? "success" : "danger"} description={browserReadTest.status} helpKey="sharepoint.read" />
                  <KpiCard title="Digest" value={browserDigestTest.label} icon={<CheckCircle2 size={18} />} tone={browserDigestTest.ok ? "success" : "danger"} description={`${browserDigestTest.status} · Digest found: ${boolLabel(browserSharePointCheck.digestTest.digestFound)}`} helpKey="sharepoint.digest" />
                  <KpiCard title="Connector mode" value="browser-sharepoint" icon={<ShieldAlert size={18} />} tone={browserSharePointCheck.overall.digestWorks ? "success" : "warning"} description={browserSharePointCheck.writeCapability.message} helpKey="sharepoint.write" />
                </div>

                <div className={`rounded-lg border p-3 text-sm ${browserSharePointCheck.overall.digestWorks ? "" : "panel-warning"}`} style={{ borderColor: "var(--border)" }}>
                  <p className="font-bold" style={{ color: "var(--text-strong)" }}>{browserSharePointCheck.overall.humanExplanation}</p>
                  <p className="mt-1 muted">{browserSharePointCheck.overall.suggestedFix}</p>
                  {combinedConnectorStatus.backendBlockedBy401 && browserSharePointCheck.overall.digestWorks ? (
                    <p className="mt-2 font-bold" style={{ color: "var(--success)" }}>הדפדפן מחובר ל־SharePoint ומצליח לקבל Digest. השרת המקומי לא מחובר ל־SharePoint. במצב SharePoint-hosted המערכת תשתמש בחיבור דרך הדפדפן.</p>
                  ) : null}
                </div>

                <div className="grid gap-2 md:grid-cols-2">
                  <LinkRow label="Target SharePoint site" value={browserSharePointCheck.targetSharePointSiteUrl} isUrl />
                  <LinkRow label="Current user URL/status" value={`${browserSharePointCheck.currentUser.url} · ${browserSharePointCheck.currentUser.status || "-"}`} />
                  <LinkRow label="Read URL/status" value={`${browserSharePointCheck.readTest.url} · ${browserSharePointCheck.readTest.status || "-"}`} />
                  <LinkRow label="Contextinfo URL/status" value={`${browserSharePointCheck.digestTest.url} · ${browserSharePointCheck.digestTest.status || "-"}`} />
                  <LinkRow label="Digest found" value={boolLabel(browserSharePointCheck.digestTest.digestFound)} />
                  <LinkRow label="Digest preview" value={browserSharePointCheck.digestTest.digestPreview ? `${browserSharePointCheck.digestTest.digestPreview}...` : "-"} />
                </div>
              </div>
            ) : (
              <EmptyState title="Browser SharePoint עדיין לא נבדק" description="לחצו על בדיקה כדי לראות currentuser, read ו־Digest מהדפדפן." />
            )}
          </SectionCard>

          <SectionCard
            title="Backend SharePoint Connector"
            subtitle="בדיקות שמבוצעות מהשרת המקומי. כשל 401 כאן לא חוסם מצב SharePoint-hosted אם הדפדפן תקין."
            helpKey="sharepoint.backendConnector"
          >
            {backendSharePointCheck ? (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <KpiCard title="Backend current user" value={backendCurrentUser.label} icon={<CheckCircle2 size={18} />} tone={backendCurrentUser.ok ? "success" : "danger"} description={backendCurrentUser.status} helpKey="sharepoint.currentUser" />
                  <KpiCard title="Backend read" value={backendReadTest.label} icon={<CheckCircle2 size={18} />} tone={backendReadTest.ok ? "success" : "danger"} description={backendReadTest.status} helpKey="sharepoint.read" />
                  <KpiCard title="Backend digest" value={backendDigestTest.label} icon={<CheckCircle2 size={18} />} tone={backendDigestTest.ok ? "success" : "danger"} description={backendDigestTest.status} helpKey="sharepoint.digest" />
                  <KpiCard title="Backend write verified" value={boolLabel(backendSharePointCheck.overall?.writeVerified)} icon={<ShieldAlert size={18} />} tone={backendSharePointCheck.overall?.writeVerified ? "success" : "warning"} helpKey="sharepoint.write" />
                </div>

                {!backendSharePointCheck.overall?.writeVerified ? (
                  <div className="rounded-lg border p-3 text-sm" style={{ background: "var(--warning-soft)", borderColor: "color-mix(in srgb, var(--warning) 35%, var(--border))" }}>
                    <p className="font-bold" style={{ color: "var(--text-strong)" }}>{backendSharePointCheck.overall?.humanExplanation || backendSharePointCheck.humanExplanation || sharePoint401Explanation}</p>
                    <p className="mt-1 muted">{backendSharePointCheck.overall?.suggestedFix || backendSharePointCheck.suggestedFix || "בדקו Cookie / Bearer token / כתובת אתר."}</p>
                    {backendSharePointCheck.overall?.failedUrl ? <code className="num mt-2 block break-all text-xs">{backendSharePointCheck.overall.failedUrl}</code> : null}
                  </div>
                ) : null}

                <div className="grid gap-2 md:grid-cols-2">
                  <LinkRow label="Connector mode" value={backendSharePointCheck.connectorMode || "backend-sharepoint"} />
                  <LinkRow label="Target SharePoint site" value={backendSharePointCheck.targetSharePointSiteUrl} isUrl />
                  <LinkRow label="Failing URL" value={backendSharePointCheck.overall?.failedUrl || "-"} />
                  <LinkRow label="HTTP status" value={backendSharePointCheck.overall?.failedStatus ? String(backendSharePointCheck.overall.failedStatus) : "-"} />
                  <LinkRow label="Backend error code" value={backendSharePointCheck.overall?.failedBackendErrorCode || backendSharePointCheck.errorCode || "-"} />
                  <LinkRow label="SHAREPOINT_WRITE_ENABLED" value={boolLabel(Boolean(backendSharePointCheck.configured?.sharePointWriteEnabled))} />
                  <LinkRow label="Auth cookie configured" value={boolLabel(Boolean(backendSharePointCheck.configured?.sharePointAuthCookieConfigured))} />
                  <LinkRow label="Cookie names" value={Array.isArray(backendSharePointCheck.configured?.sharePointAuthCookieNames) ? (backendSharePointCheck.configured?.sharePointAuthCookieNames as string[]).join(", ") || "-" : "-"} />
                  <LinkRow label="Bearer token configured" value={boolLabel(Boolean(backendSharePointCheck.configured?.sharePointBearerTokenConfigured))} />
                  <LinkRow label="Unauthenticated write bypass" value={boolLabel(Boolean(backendSharePointCheck.configured?.unauthenticatedWriteBypassEnabled))} />
                </div>
              </div>
            ) : (
              <EmptyState title="Backend SharePoint עדיין לא נבדק" description="לחצו על בדיקה כדי לראות אם השרת המקומי מחובר ל־SharePoint." />
            )}
          </SectionCard>

          <SectionCard title="נתיבי SharePoint" subtitle="הנתיבים המחושבים לפי האתר הנבחר, כולל URL סופי וצורה מקודדת" helpKey="site.finalDistPath">
            {pathRows.length ? (
              <DataTable
                columns={pathColumns}
                rows={pathRows}
                rowKey={(row, index) => `${row.key}-${index}`}
                minWidth={980}
                mobileCard={(row) => (
                  <div className="space-y-2">
                    <p className="font-bold">{row.key}</p>
                    <p className="text-xs muted">{row.libraryName || "-"}</p>
                    <code className="num block max-w-full truncate text-xs muted" title={row.serverRelativePath}>{row.serverRelativePath || "-"}</code>
                    <code className="num block max-w-full truncate text-xs muted" title={row.finalRestUrl}>{row.finalRestUrl || "-"}</code>
                  </div>
                )}
              />
            ) : (
              <EmptyState title="אין נתיבי אתר" description="בחרו אתר פעיל כדי לראות נתיבי SharePoint." />
            )}
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}
