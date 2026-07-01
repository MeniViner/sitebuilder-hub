import { FormEvent, useEffect, useState } from "react";
import { Database, KeyRound, LogIn, LogOut, RefreshCw, Server, ShieldAlert, ShieldCheck } from "lucide-react";
import { AuthBootstrapStatus, OperationCapabilities, sitesApi, WhoAmIResult } from "../api/sitesApi";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { ErrorState } from "../components/ErrorState";
import { HelpLabel } from "../components/help/HelpLabel";
import { LoadingState } from "../components/LoadingState";
import { MetadataOnlyBadge } from "../components/MetadataOnlyBadge";
import { AdvancedDetails, ModeBoundary, OperationalSummary } from "../components/OperationalSummary";
import { PageHeader } from "../components/PageHeader";
import { SectionCard } from "../components/SectionCard";
import { StatusToken } from "../components/StatusToken";
import { formatDateTime } from "../utils/format";

type AuthUser = NonNullable<WhoAmIResult["user"]>;

const authSourceLabels: Record<NonNullable<AuthUser["source"]>, string> = {
  dev: "Dev",
  "api-key": "API key",
  owner: "Owner",
  bootstrap: "Bootstrap",
  "site-admin": "Site admin",
  sharepoint: "SharePoint user"
};

function formatPersonalNumber(value?: string) {
  if (!value) return "-";
  return value.startsWith("s") ? value : `s${value}`;
}

function formatAuthSource(authUser?: AuthUser | null, authChecking = false) {
  if (authChecking) return "בודק הרשאות";
  if (!authUser) return "לא מחובר";
  return authUser.source ? authSourceLabels[authUser.source] : authUser.role;
}

export function SettingsPage({
  authUser,
  authChecking = false,
  authBootstrapStatus,
  authError = "",
  onLogin,
  onLogout,
  onRefreshAuth
}: {
  authUser?: AuthUser | null;
  authChecking?: boolean;
  authBootstrapStatus?: AuthBootstrapStatus | null;
  authError?: string;
  onLogin?: (personalNumber: string) => Promise<void>;
  onLogout?: () => Promise<void>;
  onRefreshAuth?: () => Promise<void>;
}) {
  const [capabilities, setCapabilities] = useState<OperationCapabilities | null>(null);
  const [serverHealth, setServerHealth] = useState<{ status: string; mongo: string; serverTime: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [personalNumber, setPersonalNumber] = useState("");
  const [authFormLoading, setAuthFormLoading] = useState(false);
  const [authFormError, setAuthFormError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [capsRes, healthRes] = await Promise.all([
        sitesApi.operationCapabilities(),
        sitesApi.health()
      ]);
      setCapabilities(capsRes.data);
      setServerHealth(healthRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בטעינת הגדרות");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (authUser?.personalNumber) setPersonalNumber(formatPersonalNumber(authUser.personalNumber));
  }, [authUser?.personalNumber]);

  const submitAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!onLogin) return;

    setAuthFormLoading(true);
    setAuthFormError("");
    try {
      await onLogin(personalNumber);
    } catch (err) {
      setAuthFormError(err instanceof Error ? err.message : "שגיאה בהתחברות");
    } finally {
      setAuthFormLoading(false);
    }
  };

  const logout = async () => {
    if (!onLogout) return;
    setAuthFormLoading(true);
    setAuthFormError("");
    try {
      await onLogout();
    } catch (err) {
      setAuthFormError(err instanceof Error ? err.message : "שגיאה בהתנתקות");
    } finally {
      setAuthFormLoading(false);
    }
  };

  const sharePointCapabilityRows = [
    {
      key: "browser",
      capability: "Browser SharePoint",
      available: true,
      mode: "דפדפן",
      detail: "כל קריאה/כתיבה מול SharePoint רצה מהדפדפן הפעיל של המשתמש.",
      nextStep: "פתחו את הפעולה במסך הרלוונטי והריצו מקומית בדפדפן."
    },
    {
      key: "server-sharepoint",
      capability: "SharePoint בשרת",
      available: false,
      mode: "שרת",
      detail: "מושבת בכוונה. השרת לא קורא, לא כותב ולא מבקש Digest מול SharePoint.",
      nextStep: "לא מגדירים auth שרת ל־SharePoint."
    },
    {
      key: "evidence",
      capability: "Evidence",
      available: true,
      mode: "שרת",
      detail: "השרת שומר jobs, סטטוסים, audit, snapshots ו־evidence אחרי שהדפדפן סיים.",
      nextStep: "בדקו Evidence במסך הפעולה."
    },
    {
      key: "mongo",
      capability: "Mongo / Builder backend",
      available: true,
      mode: "שרת",
      detail: "פעולות Mongo ממשיכות לרוץ דרך השרת או Builder backend.",
      nextStep: "אין קשר למסלול SharePoint."
    }
  ];

  const sharePointCapabilityColumns: DataTableColumn<(typeof sharePointCapabilityRows)[number]>[] = [
    { key: "capability", header: "יכולת", helpKey: "sharepoint.backendConnector", render: (row) => <span className="font-bold" style={{ color: "var(--text-strong)" }}>{row.capability}</span> },
    { key: "mode", header: "איפה רץ", helpKey: "mode.productionSafe", render: (row) => <span className={`badge ${row.mode === "דפדפן" ? "badge-success" : row.mode === "שרת" ? "badge-neutral" : "badge-info"}`}>{row.mode}</span> },
    { key: "status", header: "מצב", helpKey: "sharepoint.writeBlocked", render: (row) => <StatusToken kind={row.available ? "live" : "blocked"} label={row.available ? "נתמך" : "מושבת"} compact /> },
    { key: "detail", header: "פירוט", helpKey: "system.env", render: (row) => <span className="text-sm muted">{row.detail}</span> },
    { key: "next", header: "מה עושים", helpKey: "diagnostics", render: (row) => <span className="text-sm">{row.nextStep}</span> }
  ];
  const sharePointCapabilityMobileCard = (row: (typeof sharePointCapabilityRows)[number]) => (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <p className="font-bold" style={{ color: "var(--text-strong)" }}>{row.capability}</p>
        <StatusToken kind={row.available ? "live" : "blocked"} label={row.available ? "זמין" : "חסום"} compact />
      </div>
      <span className={`badge ${row.mode === "דפדפן" ? "badge-success" : row.mode === "שרת" ? "badge-neutral" : "badge-info"}`}>{row.mode}</span>
      <p className="text-sm muted">{row.detail}</p>
      <p className="text-sm">{row.nextStep}</p>
    </div>
  );

  const operationRows = Object.entries(capabilities?.operations || {}).map(([key, operation]) => ({
    key,
    ...operation,
    nextStep: operation.available
      ? operation.writeRequired ? "הרצה רק דרך flow מוגן/approval" : "זמין לקריאה ותכנון"
      : operation.reason || capabilities?.sharePoint.reason || "חסום לפי capabilities"
  }));

  const operationColumns: DataTableColumn<(typeof operationRows)[number]>[] = [
    { key: "operation", header: "פעולה", helpKey: "operations", render: (row) => <span className="font-bold" style={{ color: "var(--text-strong)" }}>{row.key}</span> },
    { key: "mode", header: "קריאה / כתיבה", helpKey: "mode.readOnly", render: (row) => <span className={`badge ${row.writeRequired ? "badge-warning" : "badge-info"}`}>{row.writeRequired ? "דורש כתיבה" : "קריאה/תכנון"}</span> },
    { key: "status", header: "מצב", helpKey: "sharepoint.writeBlocked", render: (row) => <StatusToken kind={row.available ? "writeEnabled" : "blocked"} label={row.available ? "זמין" : "חסום"} compact /> },
    { key: "blocker", header: "חסם", helpKey: "deploy.blocker", render: (row) => <span className="text-sm muted">{row.reason || "-"}</span> },
    { key: "next", header: "מה עושים", helpKey: "diagnostics", render: (row) => <span className="text-sm">{row.nextStep}</span> }
  ];
  const operationMobileCard = (row: (typeof operationRows)[number]) => (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <p className="font-bold" style={{ color: "var(--text-strong)" }}>{row.key}</p>
        <StatusToken kind={row.available ? "writeEnabled" : "blocked"} label={row.available ? "זמין" : "חסום"} compact />
      </div>
      <span className={`badge ${row.writeRequired ? "badge-warning" : "badge-info"}`}>{row.writeRequired ? "דורש כתיבה" : "קריאה/תכנון"}</span>
      {row.reason ? <p className="text-sm muted">{row.reason}</p> : null}
      <p className="text-sm">{row.nextStep}</p>
    </div>
  );
  const dangerousOverrides = capabilities?.dangerousOverrides?.gates || [];
  const builderBackendConfig = capabilities?.builderBackendConfig;
  const builderBackendRows = builderBackendConfig?.builderBackendOptions || [];
  const sharePointStatusRows = (capabilities?.sharePointOperationInventory || []).map((operation) => ({
    ...operation,
    supported: operation.policy === "browser-supported",
    runsIn: operation.connectorMode === "browser-sharepoint"
      ? "דפדפן"
      : operation.connectorMode === "mongo-backend" || operation.connectorMode === "server-local"
        ? "שרת"
        : operation.connectorMode === "manual"
          ? "ידני"
          : "לא פעיל",
    lastStatus: operation.statusLabelHe || (operation.policy === "browser-supported" ? "מופעל דרך הדפדפן" : "לא פעיל"),
    lastError: operation.blockerHe || operation.currentFailureMode || "-"
  }));
  const browserSharePointOperations = sharePointStatusRows.filter((operation) => operation.connectorMode === "browser-sharepoint").length;
  const blockedOperationCount = operationRows.filter((operation) => !operation.available).length;
  const sharePointStatusColumns: DataTableColumn<(typeof sharePointStatusRows)[number]>[] = [
    { key: "name", header: "פעולה", helpKey: "operations", render: (row) => <div><p className="font-bold" style={{ color: "var(--text-strong)" }}>{row.label}</p><p className="num text-xs muted">{row.operation}</p></div> },
    { key: "supported", header: "נתמך", helpKey: "sharepoint.write", render: (row) => <StatusToken kind={row.supported ? "live" : "blocked"} label={row.supported ? "כן" : "לא"} compact /> },
    { key: "runs", header: "איפה רץ", helpKey: "sharepoint.browserConnector", render: (row) => <span className={`badge ${row.runsIn === "דפדפן" ? "badge-success" : row.runsIn === "שרת" ? "badge-info" : "badge-neutral"}`}>{row.runsIn}</span> },
    { key: "status", header: "סטטוס אחרון", helpKey: "history", render: (row) => <span className="text-sm">{row.lastStatus}</span> },
    { key: "error", header: "שגיאה / חסם אחרון", helpKey: "deploy.blocker", render: (row) => <span className="text-sm muted">{row.lastError}</span> }
  ];
  const sharePointStatusMobileCard = (row: (typeof sharePointStatusRows)[number]) => (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <p className="font-bold" style={{ color: "var(--text-strong)" }}>{row.label}</p>
        <StatusToken kind={row.supported ? "live" : "blocked"} label={row.supported ? "נתמך" : "לא"} compact />
      </div>
      <span className={`badge ${row.runsIn === "דפדפן" ? "badge-success" : row.runsIn === "שרת" ? "badge-info" : "badge-neutral"}`}>{row.runsIn}</span>
      <p className="text-sm">{row.lastStatus}</p>
      <p className="text-sm muted">{row.lastError}</p>
    </div>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="הגדרות"
        subtitle="מי מחובר, מה השרת יכול לעשות, ומה חסום לפני פעולה"
        helpKey="settings"
        actions={<MetadataOnlyBadge mode="metadata" />}
      />

      <OperationalSummary
        title="מרכז בטיחות ותצורה"
        purpose="המסך מסביר את מצב ההתחברות והיכולות. הוא לא מריץ פריסה, שחזור או שינוי הרשאות."
        state={`משתמש: ${formatAuthSource(authUser, authChecking)} · API: ${serverHealth?.status === "ok" ? "מחובר" : "לא זמין"} · ${browserSharePointOperations} פעולות SharePoint רצות בדפדפן`}
        attention={dangerousOverrides.length
          ? `${dangerousOverrides.length} חריגות בטיחות פעילות. מומלץ לכבות אותן לפני עבודה רגילה.`
          : blockedOperationCount
            ? `${blockedOperationCount} פעולות חסומות לפי יכולות הסביבה.`
            : "אין חריגת בטיחות פעילה שמוצגת כאן."}
        attentionTone={dangerousOverrides.length ? "danger" : blockedOperationCount ? "warning" : "success"}
        nextAction={!authUser
          ? "התחברו עם מספר אישי לפני עבודה במסכים מוגנים."
          : "אפשר לעבוד במסכים הרגילים. פעולות SharePoint ירוצו דרך הדפדפן וישמרו Evidence."}
        blocked={undefined}
        tone={dangerousOverrides.length ? "danger" : "success"}
      />

      <ModeBoundary
        title="מה המסך הזה עושה"
        items={[
          { label: "התחברות משתמש", description: "שומרת מספר אישי בדפדפן כדי להזדהות מול ה־API.", tone: "info" },
          { label: "בדיקת יכולות", description: "מראה מה זמין ומה חסום. לא משנה אתרים.", tone: "success" },
          { label: "SharePoint", description: "אין SharePoint בשרת. הביצוע קורה בכפתורים המקומיים בדפדפן.", tone: "success" },
          { label: "חריגות בטיחות", description: "דגלי env שמחלישים gates. הם מוצגים בבירור ולא מופעלים מכאן.", tone: dangerousOverrides.length ? "danger" : "neutral" }
        ]}
      />

      {loading ? <LoadingState /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !error ? (
        <>
          <SectionCard title="זיהוי והרשאות" subtitle="המספר האישי נשמר בדפדפן ונשלח כ־x-personal-number בקריאות API מוגנות." helpKey="sharepoint.currentUser">
            <div className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="soft-panel p-4">
                  <KeyRound className="mb-2" size={18} style={{ color: "var(--accent)" }} />
                  <p className="field-label"><HelpLabel helpKey="sharepoint.currentUser">Auth source</HelpLabel></p>
                  <p className="font-bold" style={{ color: "var(--text-strong)" }}>{formatAuthSource(authUser, authChecking)}</p>
                </div>
                <div className="soft-panel p-4">
                  <ShieldCheck className="mb-2" size={18} style={{ color: "var(--success)" }} />
                  <p className="field-label"><HelpLabel helpKey="sharepoint.currentUser">Personal number</HelpLabel></p>
                  <p className="num font-bold" style={{ color: "var(--text-strong)" }}>{formatPersonalNumber(authUser?.personalNumber)}</p>
                </div>
                <div className="soft-panel p-4">
                  <Server className="mb-2" size={18} style={{ color: "var(--info)" }} />
                  <p className="field-label"><HelpLabel helpKey="site.bootstrap">Bootstrap admins</HelpLabel></p>
                  <p className="num font-bold" style={{ color: "var(--text-strong)" }}>{authBootstrapStatus?.bootstrapAdminsConfigured ?? "-"}</p>
                </div>
              </div>

              <form className="soft-panel space-y-3 p-4" onSubmit={submitAuth}>
                <div>
                  <label className="field-label" htmlFor="settings-personal-number"><HelpLabel helpKey="sharepoint.currentUser">החלפת מספר אישי</HelpLabel></label>
                  <input
                    id="settings-personal-number"
                    className="control num"
                    placeholder="s8856096"
                    value={personalNumber}
                    onChange={(event) => setPersonalNumber(event.target.value)}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="btn btn-primary" type="submit" disabled={authFormLoading || !personalNumber.trim() || !onLogin}>
                    <LogIn size={16} />
                    {authFormLoading ? "שומר..." : "שמור והתחבר"}
                  </button>
                  <button className="btn btn-secondary" type="button" onClick={() => void onRefreshAuth?.()} disabled={authFormLoading || !onRefreshAuth}>
                    <RefreshCw size={16} />
                    רענן
                  </button>
                  {authUser?.personalNumber ? (
                    <button className="btn btn-danger" type="button" onClick={() => void logout()} disabled={authFormLoading || !onLogout}>
                      <LogOut size={16} />
                      התנתק
                    </button>
                  ) : null}
                </div>
                {authFormError || authError ? <ErrorState message={authFormError || authError} /> : null}
              </form>
            </div>
          </SectionCard>

          <div className="grid gap-5 xl:grid-cols-2">
            <SectionCard title="מצב שרת" subtitle="Health בסיסי של API ו־MongoDB" helpKey="system.apiBaseUrl">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="soft-panel p-4">
                  <Server className="mb-2" size={18} style={{ color: "var(--accent)" }} />
                  <p className="field-label"><HelpLabel helpKey="system.apiBaseUrl">API</HelpLabel></p>
                  <p className="font-bold" style={{ color: "var(--text-strong)" }}>{serverHealth?.status === "ok" ? "מחובר" : "לא זמין"}</p>
                </div>
                <div className="soft-panel p-4">
                  <Database className="mb-2" size={18} style={{ color: "var(--accent)" }} />
                  <p className="field-label"><HelpLabel helpKey="site.mongodb">MongoDB</HelpLabel></p>
                  <p className="font-bold" style={{ color: "var(--text-strong)" }}>{serverHealth?.mongo === "connected" ? "מחובר" : serverHealth?.mongo || "לא ידוע"}</p>
                </div>
                <div className="soft-panel p-4">
                  <KeyRound className="mb-2" size={18} style={{ color: "var(--warning)" }} />
                  <p className="field-label"><HelpLabel helpKey="sharepoint.currentUser">Auth</HelpLabel></p>
                  <p className="font-bold" style={{ color: "var(--text-strong)" }}>{formatAuthSource(authUser, authChecking)}</p>
                </div>
                <div className="soft-panel p-4">
                  <ShieldCheck className="mb-2" size={18} style={{ color: "var(--accent)" }} />
                  <p className="field-label"><HelpLabel helpKey="system.env">Server time</HelpLabel></p>
                  <p className="num font-bold" style={{ color: "var(--text-strong)" }}>{formatDateTime(serverHealth?.serverTime)}</p>
                </div>
              </div>
            </SectionCard>

	            <SectionCard title="מצב SharePoint" subtitle="הדוח באתר: אין SharePoint בשרת. הפעולות מול SharePoint רצות דרך הדפדפן." helpKey="sharepoint.backendConnector">
	              <DataTable columns={sharePointCapabilityColumns} rows={sharePointCapabilityRows} rowKey={(row) => row.key} mobileCard={sharePointCapabilityMobileCard} minWidth={860} density="dense" />
	              {capabilities?.sharePoint.reason ? (
	                <div className="mt-3 rounded-lg border p-3 text-sm" style={{ background: "var(--warning-soft)", borderColor: "var(--border)", color: "var(--warning)" }}>
	                  {capabilities.sharePoint.reason}
	                </div>
	              ) : null}
	            </SectionCard>
	          </div>

	          <SectionCard title="מצב SharePoint לפי פעולה" subtitle="לכל פעולה מוצג אם היא נתמכת, איפה היא רצה, ומה החסם האחרון אם קיים." helpKey="operation.map">
	            {sharePointStatusRows.length ? (
	              <DataTable columns={sharePointStatusColumns} rows={sharePointStatusRows} rowKey={(row) => row.operation} mobileCard={sharePointStatusMobileCard} minWidth={1120} density="dense" />
	            ) : (
	              <p className="text-sm muted">לא חזר inventory לפעולות SharePoint.</p>
	            )}
	          </SectionCard>

	          {/* Storage backend rules: storage-backend-aware UI marker for static coverage. */}
          <AdvancedDetails title="Advanced: מקורות נתונים ו־Builder backend" description="כללי TXT/Mongo, allowlist ו־credential refs">
            <div className="space-y-5">
          <SectionCard title="כללי מקור נתונים" subtitle="התנהגות HUB עבור אתרי TXT מול Mongo. סודות מוצגים כסטטוס או reference בלבד." helpKey="site.mongodb">
            <div className="grid gap-3 xl:grid-cols-3">
              <div className="soft-panel p-4">
                <p className="field-label">מצבים נתמכים</p>
                <p className="font-bold" style={{ color: "var(--text-strong)" }}>{capabilities?.storageBackends?.supported?.join(", ") || "txt, mongo, unknown"}</p>
              </div>
              <div className="soft-panel p-4">
                <p className="field-label">התנהגות TXT</p>
                <p className="text-sm muted">Source: {capabilities?.storageBackends?.txt?.sourceOfTruth || "SharePoint TXT files"}</p>
                <p className="text-sm muted">Backup: {capabilities?.storageBackends?.txt?.backupMode || "browser-sharepoint-file-copy"}</p>
                <p className="text-sm muted">Admins: {capabilities?.storageBackends?.txt?.adminSource || "users_data.txt"}</p>
              </div>
              <div className="soft-panel p-4">
                <p className="field-label">התנהגות Mongo</p>
                <p className="text-sm muted">Connector: {capabilities?.storageBackends?.mongo?.connectorMode || "mongo-backend"}</p>
                <p className="text-sm muted">Credential ref: {capabilities?.storageBackends?.mongo?.defaultApiKeyRef || "not configured"}</p>
                <p className="text-sm muted">מפתחות API גולמיים חשופים: {capabilities?.storageBackends?.mongo?.rawApiKeysExposed ? "כן" : "לא"}</p>
              </div>
            </div>
            <div className="mt-3 soft-panel p-4">
              <p className="field-label">כתובות Builder backend מותרות</p>
              {(capabilities?.storageBackends?.mongo?.allowedBackendApiUrls || []).length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {capabilities?.storageBackends?.mongo?.allowedBackendApiUrls?.map((url) => <span key={url} className="badge badge-neutral num">{url}</span>)}
                </div>
              ) : (
                <p className="text-sm muted">לא הוגדרה allowlist. ה־HUB עדיין יציג runtime/backend status, אבל מומלץ להגדיר SITE_BUILDER_BACKEND_API_URLS לפני שימוש מבוקר.</p>
              )}
            </div>
          </SectionCard>

          <SectionCard title="Builder Backend" subtitle="הגדרות runtime בטוחות ליצירת אתרי Mongo. לא מוצגים API keys גולמיים." helpKey="create.backendApiUrl">
            <div className="grid gap-3 xl:grid-cols-4">
              <div className="soft-panel p-4">
                <p className="field-label">Current environment</p>
                <p className="font-bold" style={{ color: "var(--text-strong)" }}>{builderBackendConfig?.currentEnvironment || "unknown"}</p>
              </div>
              <div className="soft-panel p-4">
                <p className="field-label">Default backend</p>
                <p className="num text-sm font-bold" style={{ color: "var(--text-strong)" }}>{builderBackendConfig?.defaultBuilderBackendApiUrl || "not configured"}</p>
              </div>
              <div className="soft-panel p-4">
                <p className="field-label">Default credential ref</p>
                <p className="num text-sm font-bold" style={{ color: "var(--text-strong)" }}>{builderBackendConfig?.defaultBuilderApiKeyRef || "not configured"}</p>
              </div>
              <div className="soft-panel p-4">
                <p className="field-label">Production/classified default</p>
                <p className="font-bold" style={{ color: builderBackendConfig?.productionClassifiedDefaultExists ? "var(--success)" : "var(--warning)" }}>{builderBackendConfig?.productionClassifiedDefaultExists ? "קיים" : "חסר"}</p>
              </div>
            </div>
            <div className="mt-3 grid gap-3">
              {builderBackendRows.length ? builderBackendRows.map((option) => (
                <div key={option.backendApiUrl} className="soft-panel p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-bold" style={{ color: "var(--text-strong)" }}>{option.label}</p>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {option.default ? <span className="badge badge-success">default</span> : null}
                      <span className={`badge ${option.allowed ? "badge-success" : "badge-danger"}`}>{option.allowed ? "allowed" : "blocked"}</span>
                      <span className={`badge ${option.credentialConfigured ? "badge-success" : "badge-warning"}`}>{option.credentialConfigured ? "credential configured" : "credential missing"}</span>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                    <p className="muted">URL: <span className="num">{option.backendApiUrl}</span></p>
                    <p className="muted">Host: <span className="num">{option.backendApiUrlHost}</span></p>
                    <p className="muted">Environment: {option.environment}</p>
                    <p className="muted">Credential ref: <span className="num">{option.credentialRef || "not configured"}</span></p>
                  </div>
                </div>
              )) : (
                <div className="soft-panel p-4 text-sm muted">לא מוגדר Backend של Site Builder. הגדירו SITE_BUILDER_DEFAULT_BACKEND_API_URL או SITE_BUILDER_BACKEND_API_URLS.</div>
              )}
            </div>
          </SectionCard>
            </div>
          </AdvancedDetails>

          <SectionCard title="ברירות מחדל ליצירת אתרים" subtitle="מה האשפים ימלאו אוטומטית לפני מעבר להגדרות מתקדמות." helpKey="site.createNew">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <div className="soft-panel p-4">
                <p className="field-label">Default SharePoint host/root</p>
                <p className="num font-bold" style={{ color: "var(--text-strong)" }}>portal.army.idf / sites</p>
              </div>
              <div className="soft-panel p-4">
                <p className="field-label">Default Builder backend</p>
                <p className="num text-sm font-bold" style={{ color: "var(--text-strong)" }}>{builderBackendConfig?.defaultBuilderBackendApiUrl || "not configured"}</p>
              </div>
              <div className="soft-panel p-4">
                <p className="field-label">Default credential ref</p>
                <p className="num text-sm font-bold" style={{ color: "var(--text-strong)" }}>{builderBackendConfig?.defaultBuilderApiKeyRef || "not configured"}</p>
              </div>
              <div className="soft-panel p-4">
                <p className="field-label">Default storage backend</p>
                <p className="font-bold" style={{ color: "var(--text-strong)" }}>{builderBackendConfig?.defaultStorageBackend || "unknown"}</p>
              </div>
              <div className="soft-panel p-4">
                <p className="field-label">Advanced manual fields</p>
                <p className="font-bold" style={{ color: builderBackendConfig?.advancedManualFieldsEnabled === false ? "var(--warning)" : "var(--success)" }}>{builderBackendConfig?.advancedManualFieldsEnabled === false ? "disabled" : "enabled"}</p>
              </div>
              <div className="soft-panel p-4">
                <p className="field-label">Production/local mode</p>
                <p className="font-bold" style={{ color: "var(--text-strong)" }}>{builderBackendConfig?.currentEnvironment === "production" ? "production/classified" : "local/dev capable"}</p>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="חריגות בטיחות פעילות"
            subtitle="דגלי env שפותחים חסמי ולידציה של ה־HUB. שינוי שלהם דורש restart לשרת."
            helpKey="system.env"
          >
            <div className="grid gap-3 md:grid-cols-[220px_1fr]">
              <div className="soft-panel p-4">
                <ShieldAlert className="mb-2" size={20} style={{ color: dangerousOverrides.length ? "var(--danger)" : "var(--success)" }} />
                <p className="field-label">Overrides active</p>
                <p className="num text-2xl font-bold" style={{ color: dangerousOverrides.length ? "var(--danger)" : "var(--success)" }}>
                  {dangerousOverrides.length}
                </p>
              </div>
              <div className="soft-panel p-4">
                {dangerousOverrides.length ? (
                  <div className="space-y-2">
                    {dangerousOverrides.map((override) => (
                      <div key={`${override.gate}-${override.envVar}`} className="rounded-md border p-3" style={{ borderColor: "color-mix(in srgb, var(--danger) 38%, var(--border))", background: "var(--danger-soft)" }}>
                        <p className="num text-xs font-bold" style={{ color: "var(--danger)" }}>{override.envVar}=true</p>
                        <p className="mt-1 text-sm" style={{ color: "var(--text-strong)" }}>{override.gate}</p>
                        <p className="mt-1 text-xs muted">{override.description}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm muted">אין כרגע dangerous overrides פעילים. חסמי approval/backup/artifact/SharePoint preflight עובדים לפי המדיניות הרגילה.</p>
                )}
              </div>
            </div>
          </SectionCard>

          <SectionCard title="מפת פעולות" subtitle="מה זמין לקריאה ומה דורש כתיבה" helpKey="operation.map">
            {operationRows.length ? (
              <DataTable columns={operationColumns} rows={operationRows} rowKey={(row) => row.key} mobileCard={operationMobileCard} minWidth={980} density="dense" />
            ) : (
              <p className="text-sm muted">לא חזרו capabilities לפעולות.</p>
            )}
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}
