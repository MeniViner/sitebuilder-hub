import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Cable, CheckCircle2, RefreshCcw, ShieldAlert } from "lucide-react";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { HelpLabel } from "../components/help/HelpLabel";
import { KpiCard } from "../components/KpiCard";
import { LinkRow } from "../components/LinkRow";
import { LoadingState } from "../components/LoadingState";
import { AdvancedDetails, GuidedFlow, ModeBoundary, OperationalSummary } from "../components/OperationalSummary";
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
const sharePoint401Explanation = "הדפדפן הוא מסלול SharePoint; השרת המקומי לא אמור להתחבר ל־SharePoint";

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
          connectorMode: "browser-sharepoint",
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
        subtitle="האם הדפדפן מחובר, האם השרת מחובר, ומה באמת חוסם פעולה"
        helpKey="diagnostics"
        actions={<button className="btn btn-secondary" type="button" onClick={() => load(siteId)}><RefreshCcw size={15} />רענון</button>}
      />

      <OperationalSummary
        title="אבחון בלי לערבב חיבורים"
        purpose="המסך מפריד בין חיבור הדפדפן ל־SharePoint לבין חיבור השרת. חיבור אחד יכול לעבוד גם כשהשני חסום."
        state={diagnostics
          ? `מצב אפליקציה: ${diagnostics.appMode} · אתר נבחר: ${diagnostics.selectedSite?.displayName || "לא נבחר"}`
          : "טוען אבחון חיבורים וזהות."}
        attention={combinedConnectorStatus.backendBlockedBy401 && browserSharePointCheck?.overall.digestWorks
          ? "הדפדפן מחובר ומוכן לפעולות דפדפן; השרת המקומי עדיין חסום ב־SharePoint."
          : browserSharePointCheck && !browserSharePointCheck.overall.digestWorks
            ? "הדפדפן לא הצליח לקבל Digest. פעולות SharePoint דרך הדפדפן חסומות עד התחברות."
            : backendSharePointCheck && !backendSharePointCheck.overall?.writeVerified
              ? "השרת אינו מסלול SharePoint. פעולות SharePoint ממשיכות דרך הדפדפן בלבד."
              : "אין חסם SharePoint ברור מהבדיקות האחרונות."}
        attentionTone={browserSharePointCheck && !browserSharePointCheck.overall.digestWorks ? "danger" : backendSharePointCheck && !backendSharePointCheck.overall?.writeVerified ? "warning" : "success"}
        nextAction={browserSharePointCheck || backendSharePointCheck
          ? "קראו קודם את המחבר המועדף ואז עברו למסך הפעולה המתאים."
          : "בחרו אתר ולחצו בדוק SharePoint עכשיו כדי לראות Browser ו־Backend זה לצד זה."}
        blocked={error ? "האבחון לא נטען. רעננו את המסך או בדקו שה־API המקומי פעיל." : undefined}
        tone={browserSharePointCheck && !browserSharePointCheck.overall.digestWorks ? "danger" : combinedConnectorStatus.backendBlockedBy401 ? "warning" : "info"}
      />

      <GuidedFlow
        title="סדר בדיקה מומלץ"
        subtitle="המטרה היא להבין מה חסום לפני שנוגעים בפריסה, שחזור או הרשאות."
        steps={[
          { title: "בחר אתר", description: "בדקו את אותו אתר שבו הפעולה נכשלה.", status: siteId ? "done" : "pending" },
          { title: "בדוק SharePoint עכשיו", description: "מריץ בדיקת דפדפן ומציג שהשרת אינו מסלול SharePoint.", status: browserSharePointCheck || backendSharePointCheck ? "done" : "active" },
          { title: "קרא את המחבר המועדף", description: "אם הדפדפן תקין, פעולות SharePoint רצות דרכו. אין fallback שרת.", status: browserSharePointCheck || backendSharePointCheck ? "active" : "pending" },
          { title: "תקן במסך המתאים", description: "פריסה, גיבוי, Health או הרשאות מטופלים במסכים שלהם.", status: "pending" }
        ]}
      />

      <ModeBoundary
        title="גבולות חיבור"
        items={[
          { label: "Browser SharePoint", description: "משתמש בהתחברות של הדפדפן. מתאים לפעולות שמוגדרות להרצה בדפדפן.", tone: "success" },
          { label: "Server SharePoint", description: "מושבת בכוונה. אין SharePoint בשרת.", tone: "neutral" },
          { label: "Mongo / Builder", description: "בודק נתוני backend ו־seed. זה לא אותו דבר כמו SharePoint hosting.", tone: "info" },
          { label: "Advanced", description: "נתיבים, headers ו־URLs מלאים מיועדים לתחקור טכני בלבד.", tone: "neutral" }
        ]}
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
            <KpiCard title="SharePoint בשרת" value="מושבת" icon={<ShieldAlert size={18} />} tone="neutral" helpKey="sharepoint.write" />
            <KpiCard title="מקור נתונים" value={diagnostics.selectedSite?.storageBackend || "unknown"} icon={<CheckCircle2 size={18} />} tone={diagnostics.selectedSite?.storageBackend === "mongo" ? "info" : diagnostics.selectedSite?.storageBackend === "txt" ? "success" : "neutral"} helpKey="mode.owner" />
          </div>

          <SectionCard title="מצב וחיבורי בסיס" subtitle="Origin, API וזהות שהשרת רואה" helpKey="system.apiBaseUrl">
            <div className="grid gap-2 md:grid-cols-2">
              <LinkRow label="כתובת הדפדפן" value={diagnostics.frontendOrigin || window.location.origin} />
              <LinkRow label="כתובת מותרת ראשית" value={diagnostics.configuredClientOrigin} />
              <LinkRow label="כתובות מותרות" value={diagnostics.configuredClientOrigins.join(", ")} />
              <LinkRow label="כתובת API" value={diagnostics.currentApiBaseUrl} />
              <LinkRow label="Mongo" value={diagnostics.mongo} />
              <LinkRow label="זיהוי משתמש" value={diagnostics.auth.currentUserDetectionResult} />
            </div>
            {diagnostics.envWarnings.length ? (
              <div className="mt-4 space-y-2">
                {diagnostics.envWarnings.map((warning) => <div key={warning} className="badge badge-warning px-3 py-2">{warning}</div>)}
              </div>
            ) : null}
          </SectionCard>

          <SectionCard
            title="בחירת אתר לבדיקת SharePoint"
            subtitle="הבדיקה תריץ Browser SharePoint Connector ותציג שהשרת אינו מחבר SharePoint."
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
            title="חיבור דפדפן ל־SharePoint"
            subtitle="בדיקות שמבוצעות ישירות מהדפדפן המחובר מול אתר היעד."
            helpKey="sharepoint.browserConnector"
          >
            {browserSharePointCheck ? (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <KpiCard title="משתמש מחובר" value={browserCurrentUser.label} icon={<CheckCircle2 size={18} />} tone={browserCurrentUser.ok ? "success" : "danger"} description={browserCurrentUser.status} helpKey="sharepoint.currentUser" />
                  <KpiCard title="קריאת בדיקה" value={browserReadTest.label} icon={<CheckCircle2 size={18} />} tone={browserReadTest.ok ? "success" : "danger"} description={browserReadTest.status} helpKey="sharepoint.read" />
                  <KpiCard title="Digest לכתיבה" value={browserDigestTest.label} icon={<CheckCircle2 size={18} />} tone={browserDigestTest.ok ? "success" : "danger"} description={`${browserDigestTest.status} · נמצא: ${boolLabel(browserSharePointCheck.digestTest.digestFound)}`} helpKey="sharepoint.digest" />
                  <KpiCard title="מסלול מומלץ" value="דפדפן" icon={<ShieldAlert size={18} />} tone={browserSharePointCheck.overall.digestWorks ? "success" : "warning"} description={browserSharePointCheck.writeCapability.message} helpKey="sharepoint.write" />
                </div>

                <div className={`rounded-lg border p-3 text-sm ${browserSharePointCheck.overall.digestWorks ? "" : "panel-warning"}`} style={{ borderColor: "var(--border)" }}>
                  <p className="font-bold" style={{ color: "var(--text-strong)" }}>{browserSharePointCheck.overall.humanExplanation}</p>
                  <p className="mt-1 muted">{browserSharePointCheck.overall.suggestedFix}</p>
                  {combinedConnectorStatus.backendBlockedBy401 && browserSharePointCheck.overall.digestWorks ? (
                    <p className="mt-2 font-bold" style={{ color: "var(--success)" }}>הדפדפן מחובר ל־SharePoint ומצליח לקבל Digest. אין SharePoint בשרת; המערכת משתמשת בחיבור דרך הדפדפן.</p>
                  ) : null}
                </div>

                <div className="grid gap-2 md:grid-cols-2">
                  <LinkRow label="אתר SharePoint שנבדק" value={browserSharePointCheck.targetSharePointSiteUrl} isUrl />
                  <LinkRow label="בדיקת משתמש" value={`${browserSharePointCheck.currentUser.url} · ${browserSharePointCheck.currentUser.status || "-"}`} />
                  <LinkRow label="בדיקת קריאה" value={`${browserSharePointCheck.readTest.url} · ${browserSharePointCheck.readTest.status || "-"}`} />
                  <LinkRow label="בדיקת Digest" value={`${browserSharePointCheck.digestTest.url} · ${browserSharePointCheck.digestTest.status || "-"}`} />
                  <LinkRow label="נמצא Digest" value={boolLabel(browserSharePointCheck.digestTest.digestFound)} />
                  <LinkRow label="תצוגה מקוצרת" value={browserSharePointCheck.digestTest.digestPreview ? `${browserSharePointCheck.digestTest.digestPreview}...` : "-"} />
                </div>
              </div>
            ) : (
              <EmptyState title="חיבור הדפדפן עדיין לא נבדק" description="לחצו על בדיקה כדי לראות משתמש מחובר, קריאה ו־Digest מהדפדפן." />
            )}
          </SectionCard>

          <SectionCard
            title="אין SharePoint בשרת"
            subtitle="השרת לא מבצע בדיקות או פעולות SharePoint. הנתונים כאן מסבירים שהמסלול מושבת בכוונה."
            helpKey="sharepoint.backendConnector"
          >
            {backendSharePointCheck ? (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <KpiCard title="משתמש בשרת" value="מושבת" icon={<CheckCircle2 size={18} />} tone="neutral" description="לא נבדק מהשרת" helpKey="sharepoint.currentUser" />
                  <KpiCard title="קריאת שרת" value="מושבת" icon={<CheckCircle2 size={18} />} tone="neutral" description="לא נשלחות בקשות GET" helpKey="sharepoint.read" />
                  <KpiCard title="Digest שרת" value="מושבת" icon={<CheckCircle2 size={18} />} tone="neutral" description="Digest נבדק בדפדפן" helpKey="sharepoint.digest" />
                  <KpiCard title="כתיבת SharePoint" value="בדפדפן בלבד" icon={<ShieldAlert size={18} />} tone="warning" helpKey="sharepoint.write" />
                </div>

                {!backendSharePointCheck.overall?.writeVerified ? (
                  <div className="rounded-lg border p-3 text-sm" style={{ background: "var(--warning-soft)", borderColor: "color-mix(in srgb, var(--warning) 35%, var(--border))" }}>
                    <p className="font-bold" style={{ color: "var(--text-strong)" }}>{backendSharePointCheck.overall?.humanExplanation || backendSharePointCheck.humanExplanation || sharePoint401Explanation}</p>
                    <p className="mt-1 muted">{backendSharePointCheck.overall?.suggestedFix || backendSharePointCheck.suggestedFix || "הריצו בדיקת Browser SharePoint מתוך משתמש מחובר."}</p>
                    {backendSharePointCheck.overall?.failedUrl ? <code className="num mt-2 block break-all text-xs">{backendSharePointCheck.overall.failedUrl}</code> : null}
                  </div>
                ) : null}

                <div className="grid gap-2 md:grid-cols-2">
                  <LinkRow label="מסלול מחבר" value={backendSharePointCheck.connectorMode || "browser-sharepoint"} />
                  <LinkRow label="אתר SharePoint שנבדק" value={backendSharePointCheck.targetSharePointSiteUrl} isUrl />
                  <LinkRow label="כתובת שנכשלה" value={backendSharePointCheck.overall?.failedUrl || "-"} />
                  <LinkRow label="סטטוס HTTP" value={backendSharePointCheck.overall?.failedStatus ? String(backendSharePointCheck.overall.failedStatus) : "-"} />
                  <LinkRow label="קוד שגיאת שרת" value={backendSharePointCheck.overall?.failedBackendErrorCode || backendSharePointCheck.errorCode || "-"} />
                  <LinkRow label="SharePoint בשרת מושבת" value={boolLabel(Boolean(backendSharePointCheck.configured?.serverSharePointDisabled))} />
                  <LinkRow label="הגדרת SharePoint שרתית" value="לא נדרשת ולא בשימוש" />
                </div>
              </div>
            ) : (
              <EmptyState title="מסלול השרת מושבת" description="לחצו על בדיקה כדי לראות שהשרת לא משמש כחיבור SharePoint ושפעולות SharePoint רצות בדפדפן." />
            )}
          </SectionCard>

          <AdvancedDetails title="Advanced: Builder backend" description="תצורת backend, credential refs וסביבות">
            <SectionCard
              title="Builder Backend"
              subtitle="הגדרות Builder backend שה־HUB מחזיר ל־Frontend בזמן ריצה. אין כאן API keys גולמיים."
              helpKey="create.backendApiUrl"
            >
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <LinkRow label="Current environment" value={diagnostics.builderBackendConfig?.currentEnvironment || "unknown"} />
                <LinkRow label="Default backend" value={diagnostics.builderBackendConfig?.defaultBuilderBackendApiUrl || "not configured"} />
                <LinkRow label="Default credential ref" value={diagnostics.builderBackendConfig?.defaultBuilderApiKeyRef || "not configured"} />
                <LinkRow label="Production/classified default" value={diagnostics.builderBackendConfig?.productionClassifiedDefaultExists ? "קיים" : "חסר"} />
              </div>
              <div className="mt-3 grid gap-2">
                {diagnostics.builderBackendConfig?.builderBackendOptions?.length ? diagnostics.builderBackendConfig.builderBackendOptions.map((option) => (
                  <div key={option.backendApiUrl} className="rounded-md border p-3 text-sm" style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-bold" style={{ color: "var(--text-strong)" }}>{option.label}</p>
                      <div className="flex flex-wrap gap-2 text-xs">
                        {option.default ? <span className="badge badge-success">default</span> : null}
                        <span className={`badge ${option.allowed ? "badge-success" : "badge-danger"}`}>{option.allowed ? "allowed" : "blocked"}</span>
                        <span className={`badge ${option.credentialConfigured ? "badge-success" : "badge-warning"}`}>{option.credentialConfigured ? "credential configured" : "credential missing"}</span>
                      </div>
                    </div>
                    <div className="mt-2 grid gap-1 md:grid-cols-2">
                      <LinkRow label="URL" value={option.backendApiUrl} />
                      <LinkRow label="Host" value={option.backendApiUrlHost} />
                      <LinkRow label="Environment" value={option.environment} />
                      <LinkRow label="Credential ref" value={option.credentialRef || "not configured"} />
                    </div>
                  </div>
                )) : (
                  <EmptyState title="לא הוגדר Builder backend" description="יש להגדיר SITE_BUILDER_DEFAULT_BACKEND_API_URL או SITE_BUILDER_BACKEND_API_URLS." />
                )}
              </div>
            </SectionCard>
          </AdvancedDetails>

          <AdvancedDetails title="Advanced: Runtime config" description="נתוני runtime config בלי לחשוף API keys">
            <SectionCard
              title="Runtime config"
              subtitle="סטטוס שמור של קובץ runtime config. API key מוצג כסטטוס בלבד, לא כערך."
              helpKey="diagnostics"
            >
            {diagnostics.runtimeConfig ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <span className={`badge ${diagnostics.runtimeConfig.status === "configured" ? "badge-success" : "badge-warning"}`}>{diagnostics.runtimeConfig.status || "unknown"}</span>
                  <span className="badge badge-neutral">API key: {diagnostics.runtimeConfig.apiKeyStatus || "unknown"}</span>
                  <span className={`badge ${diagnostics.runtimeConfig.belongsToSite ? "badge-success" : "badge-warning"}`}>{diagnostics.runtimeConfig.belongsToSite ? "שייך לאתר" : "דורש בדיקה"}</span>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <LinkRow label="Path" value={diagnostics.runtimeConfig.path || "-"} />
                  <LinkRow label="URL" value={diagnostics.runtimeConfig.url || "-"} isUrl />
                  <LinkRow label="מקור נתונים" value={diagnostics.runtimeConfig.storageBackend || "-"} />
                  <LinkRow label="Backend host" value={diagnostics.runtimeConfig.backendApiUrlHost || "-"} />
                  <LinkRow label="siteId" value={diagnostics.runtimeConfig.builderSiteId || "-"} />
                  <LinkRow label="Checked at" value={formatDateTime(diagnostics.runtimeConfig.checkedAt)} />
                </div>
                {diagnostics.runtimeConfig.warnings?.length ? <div className="badge badge-warning px-3 py-2">{diagnostics.runtimeConfig.warnings.join(" · ")}</div> : null}
              </div>
            ) : (
              <EmptyState title="אין runtime config להצגה" description="בחרו אתר כדי לראות סטטוס runtime config." />
            )}
            </SectionCard>
          </AdvancedDetails>

          <AdvancedDetails title="Advanced: Builder / Mongo" description="Registry, collection, seed docs ו־safeCollectionName">
            <SectionCard
              title="Builder / Mongo backend connector"
              subtitle="סטטוס שמור של בדיקות Builder backend, registry, safeCollectionName ו־seed docs."
              helpKey="diagnostics"
            >
            {diagnostics.builderBackend ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <span className={`badge ${diagnostics.builderBackend.backendReachable ? "badge-success" : "badge-warning"}`}>API {diagnostics.builderBackend.backendReachable ? "reachable" : "not verified"}</span>
                  <span className={`badge ${diagnostics.builderBackend.seedStatus === "ok" ? "badge-success" : "badge-warning"}`}>Seed {diagnostics.builderBackend.seedStatus || "unknown"}</span>
                  <span className="badge badge-neutral">Credential: {diagnostics.builderBackend.apiKeyConfigured ? "configured" : "missing"}</span>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <LinkRow label="Backend host" value={diagnostics.builderBackend.backendApiUrlHost || "-"} />
                  <LinkRow label="Mongo siteId" value={diagnostics.builderBackend.siteId || "-"} />
                  <LinkRow label="safeCollectionName" value={diagnostics.builderBackend.safeCollectionName || "-"} />
                  <LinkRow label="Registry" value={diagnostics.builderBackend.registryStatus || "unknown"} />
                  <LinkRow label="Collection" value={diagnostics.builderBackend.collectionStatus || "unknown"} />
                  <LinkRow label="Backups" value={diagnostics.builderBackend.backupsStatus || "unknown"} />
                  <LinkRow label="Revisions/Audit" value={diagnostics.builderBackend.revisionsAuditStatus || "unknown"} />
                  <LinkRow label="Checked at" value={formatDateTime(diagnostics.builderBackend.checkedAt)} />
                </div>
                {diagnostics.builderBackend.missingDocs?.length ? <div className="badge badge-warning px-3 py-2">Missing seed docs: {diagnostics.builderBackend.missingDocs.join(", ")}</div> : null}
                {diagnostics.builderBackend.warnings?.length ? <div className="badge badge-warning px-3 py-2">{diagnostics.builderBackend.warnings.join(" · ")}</div> : null}
              </div>
            ) : (
              <EmptyState title="אין סטטוס Builder backend" description="בחרו אתר Mongo והריצו בדיקת Mongo backend כדי לראות ראיות." />
            )}
            </SectionCard>
          </AdvancedDetails>

          <AdvancedDetails title="Advanced: נתיבי SharePoint" description="נתיבי REST ו־server-relative לאבחון טכני">
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
          </AdvancedDetails>
        </>
      ) : null}
    </div>
  );
}
