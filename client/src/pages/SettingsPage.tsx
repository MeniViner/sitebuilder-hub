import { FormEvent, useEffect, useState } from "react";
import { Database, KeyRound, LogIn, LogOut, RefreshCw, Server, ShieldCheck } from "lucide-react";
import { AuthBootstrapStatus, OperationCapabilities, sitesApi, WhoAmIResult } from "../api/sitesApi";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { ErrorState } from "../components/ErrorState";
import { HelpLabel } from "../components/help/HelpLabel";
import { LoadingState } from "../components/LoadingState";
import { MetadataOnlyBadge } from "../components/MetadataOnlyBadge";
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
      key: "read",
      capability: "Read operations",
      available: Boolean(capabilities?.sharePoint.readAvailable),
      mode: "קריאה",
      detail: "Health, inventory, plans ו-read-only checks",
      nextStep: capabilities?.sharePoint.readAvailable ? "זמין למסכי תכנון ובדיקה" : "בדוק הרשאות קריאה או auth material"
    },
    {
      key: "write-enabled",
      capability: "Write enabled",
      available: Boolean(capabilities?.sharePoint.writeEnabled),
      mode: "כתיבה",
      detail: "Feature flag לפעולות שמשנות SharePoint",
      nextStep: capabilities?.sharePoint.writeEnabled ? "פעולות כתיבה עדיין יעברו gates" : "הפעל רק בסביבה מאושרת לכתיבה"
    },
    {
      key: "auth-material",
      capability: "Auth material",
      available: Boolean(capabilities?.sharePoint.hasAuthMaterial),
      mode: "הרשאות",
      detail: `Auth mode: ${capabilities?.sharePoint.authMode || "none"}`,
      nextStep: capabilities?.sharePoint.hasAuthMaterial ? "קיים חומר הזדהות" : "הגדר bearer/cookie לפי מדיניות הסביבה"
    },
    {
      key: "write-available",
      capability: "Write available",
      available: Boolean(capabilities?.sharePoint.writeAvailable),
      mode: "כתיבה",
      detail: "כתיבה זמינה בפועל לאחר flags והרשאות",
      nextStep: capabilities?.sharePoint.writeAvailable ? "זמין לזרימות מוגנות" : capabilities?.sharePoint.reason || "חסום לפי capabilities"
    }
  ];

  const sharePointCapabilityColumns: DataTableColumn<(typeof sharePointCapabilityRows)[number]>[] = [
    { key: "capability", header: "Capability", helpKey: "sharepoint.backendConnector", render: (row) => <span className="font-bold" style={{ color: "var(--text-strong)" }}>{row.capability}</span> },
    { key: "mode", header: "Mode", helpKey: "mode.productionSafe", render: (row) => <span className={`badge ${row.mode === "כתיבה" ? "badge-warning" : "badge-info"}`}>{row.mode}</span> },
    { key: "status", header: "Status", helpKey: "sharepoint.writeBlocked", render: (row) => <StatusToken kind={row.available ? "live" : "blocked"} label={row.available ? "זמין" : "חסום"} compact /> },
    { key: "detail", header: "Detail", helpKey: "system.env", render: (row) => <span className="text-sm muted">{row.detail}</span> },
    { key: "next", header: "Next step", helpKey: "diagnostics", render: (row) => <span className="text-sm">{row.nextStep}</span> }
  ];
  const sharePointCapabilityMobileCard = (row: (typeof sharePointCapabilityRows)[number]) => (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <p className="font-bold" style={{ color: "var(--text-strong)" }}>{row.capability}</p>
        <StatusToken kind={row.available ? "live" : "blocked"} label={row.available ? "זמין" : "חסום"} compact />
      </div>
      <span className={`badge ${row.mode === "כתיבה" ? "badge-warning" : "badge-info"}`}>{row.mode}</span>
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
    { key: "operation", header: "Operation", helpKey: "operations", render: (row) => <span className="font-bold" style={{ color: "var(--text-strong)" }}>{row.key}</span> },
    { key: "mode", header: "Read / Write", helpKey: "mode.readOnly", render: (row) => <span className={`badge ${row.writeRequired ? "badge-warning" : "badge-info"}`}>{row.writeRequired ? "דורש כתיבה" : "קריאה/תכנון"}</span> },
    { key: "status", header: "Status", helpKey: "sharepoint.writeBlocked", render: (row) => <StatusToken kind={row.available ? "writeEnabled" : "blocked"} label={row.available ? "זמין" : "חסום"} compact /> },
    { key: "blocker", header: "Blocker", helpKey: "deploy.blocker", render: (row) => <span className="text-sm muted">{row.reason || "-"}</span> },
    { key: "next", header: "Next step", helpKey: "diagnostics", render: (row) => <span className="text-sm">{row.nextStep}</span> }
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

  return (
    <div className="space-y-5">
      <PageHeader
        title="הגדרות"
        subtitle="מצב סביבה ויכולות תפעול. אין כאן פעולות כתיבה ל־SharePoint."
        helpKey="settings"
        actions={<MetadataOnlyBadge mode="metadata" />}
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

            <SectionCard title="יכולות SharePoint" subtitle="נגזר ממשתני הסביבה בצד השרת" helpKey="sharepoint.backendConnector">
              <DataTable columns={sharePointCapabilityColumns} rows={sharePointCapabilityRows} rowKey={(row) => row.key} mobileCard={sharePointCapabilityMobileCard} minWidth={860} density="dense" />
              {capabilities?.sharePoint.reason ? (
                <div className="mt-3 rounded-lg border p-3 text-sm" style={{ background: "var(--warning-soft)", borderColor: "var(--border)", color: "var(--warning)" }}>
                  {capabilities.sharePoint.reason}
                </div>
              ) : null}
            </SectionCard>
          </div>

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
