import { FormEvent, useEffect, useState } from "react";
import { Database, KeyRound, LogIn, LogOut, RefreshCw, Server, ShieldCheck } from "lucide-react";
import { AuthBootstrapStatus, OperationCapabilities, sitesApi, WhoAmIResult } from "../api/sitesApi";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { MetadataOnlyBadge } from "../components/MetadataOnlyBadge";
import { PageHeader } from "../components/PageHeader";
import { SectionCard } from "../components/SectionCard";
import { formatDateTime } from "../utils/format";

type AuthUser = NonNullable<WhoAmIResult["user"]>;

const authSourceLabels: Record<NonNullable<AuthUser["source"]>, string> = {
  dev: "Dev",
  "api-key": "API key",
  hardcoded: "Hardcoded",
  bootstrap: "Bootstrap",
  "site-admin": "Site admin"
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

  return (
    <div className="space-y-5">
      <PageHeader
        title="הגדרות"
        subtitle="מצב סביבה ויכולות תפעול. אין כאן פעולות כתיבה ל־SharePoint."
        actions={<MetadataOnlyBadge mode="metadata" />}
      />

      {loading ? <LoadingState /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !error ? (
        <>
          <SectionCard title="זיהוי והרשאות" subtitle="המספר האישי נשמר בדפדפן ונשלח כ־x-personal-number בקריאות API מוגנות.">
            <div className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="soft-panel p-4">
                  <KeyRound className="mb-2" size={18} style={{ color: "var(--accent)" }} />
                  <p className="field-label">Auth source</p>
                  <p className="font-bold" style={{ color: "var(--text-strong)" }}>{formatAuthSource(authUser, authChecking)}</p>
                </div>
                <div className="soft-panel p-4">
                  <ShieldCheck className="mb-2" size={18} style={{ color: "var(--success)" }} />
                  <p className="field-label">Personal number</p>
                  <p className="num font-bold" style={{ color: "var(--text-strong)" }}>{formatPersonalNumber(authUser?.personalNumber)}</p>
                </div>
                <div className="soft-panel p-4">
                  <Server className="mb-2" size={18} style={{ color: "var(--info)" }} />
                  <p className="field-label">Bootstrap admins</p>
                  <p className="num font-bold" style={{ color: "var(--text-strong)" }}>{authBootstrapStatus?.bootstrapAdminsConfigured ?? "-"}</p>
                </div>
              </div>

              <form className="soft-panel space-y-3 p-4" onSubmit={submitAuth}>
                <div>
                  <label className="field-label" htmlFor="settings-personal-number">החלפת מספר אישי</label>
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
            <SectionCard title="מצב שרת" subtitle="Health בסיסי של API ו־MongoDB">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="soft-panel p-4">
                  <Server className="mb-2" size={18} style={{ color: "var(--accent)" }} />
                  <p className="field-label">API</p>
                  <p className="font-bold" style={{ color: "var(--text-strong)" }}>{serverHealth?.status === "ok" ? "מחובר" : "לא זמין"}</p>
                </div>
                <div className="soft-panel p-4">
                  <Database className="mb-2" size={18} style={{ color: "var(--accent)" }} />
                  <p className="field-label">MongoDB</p>
                  <p className="font-bold" style={{ color: "var(--text-strong)" }}>{serverHealth?.mongo === "connected" ? "מחובר" : serverHealth?.mongo || "לא ידוע"}</p>
                </div>
                <div className="soft-panel p-4">
                  <KeyRound className="mb-2" size={18} style={{ color: "var(--warning)" }} />
                  <p className="field-label">Auth</p>
                  <p className="font-bold" style={{ color: "var(--text-strong)" }}>{formatAuthSource(authUser, authChecking)}</p>
                </div>
                <div className="soft-panel p-4">
                  <ShieldCheck className="mb-2" size={18} style={{ color: "var(--accent)" }} />
                  <p className="field-label">Server time</p>
                  <p className="num font-bold" style={{ color: "var(--text-strong)" }}>{formatDateTime(serverHealth?.serverTime)}</p>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="יכולות SharePoint" subtitle="נגזר ממשתני הסביבה בצד השרת">
              <div className="space-y-3">
                <div className="soft-panel flex items-center justify-between gap-3 p-3">
                  <span className="font-bold">Read operations</span>
                  <span className={`badge ${capabilities?.sharePoint.readAvailable ? "badge-success" : "badge-danger"}`}>{capabilities?.sharePoint.readAvailable ? "זמין" : "לא זמין"}</span>
                </div>
                <div className="soft-panel flex items-center justify-between gap-3 p-3">
                  <span className="font-bold">Write enabled</span>
                  <span className={`badge ${capabilities?.sharePoint.writeEnabled ? "badge-warning" : "badge-neutral"}`}>{capabilities?.sharePoint.writeEnabled ? "מופעל" : "כבוי"}</span>
                </div>
                <div className="soft-panel flex items-center justify-between gap-3 p-3">
                  <span className="font-bold">Auth material</span>
                  <span className={`badge ${capabilities?.sharePoint.hasAuthMaterial ? "badge-success" : "badge-warning"}`}>{capabilities?.sharePoint.hasAuthMaterial ? "קיים" : "חסר"}</span>
                </div>
                <div className="soft-panel flex items-center justify-between gap-3 p-3">
                  <span className="font-bold">Write available</span>
                  <span className={`badge ${capabilities?.sharePoint.writeAvailable ? "badge-success" : "badge-danger"}`}>{capabilities?.sharePoint.writeAvailable ? "זמין" : "לא מחובר"}</span>
                </div>
                {capabilities?.sharePoint.reason ? (
                  <div className="rounded-lg border p-3 text-sm" style={{ background: "var(--warning-soft)", borderColor: "var(--border)", color: "var(--warning)" }}>
                    {capabilities.sharePoint.reason}
                  </div>
                ) : null}
              </div>
            </SectionCard>
          </div>

          <SectionCard title="מפת פעולות" subtitle="מה זמין לקריאה ומה דורש כתיבה">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {Object.entries(capabilities?.operations || {}).map(([key, operation]) => (
                <div key={key} className="soft-panel p-4">
                  <p className="font-bold" style={{ color: "var(--text-strong)" }}>{key}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className={`badge ${operation.available ? "badge-success" : "badge-danger"}`}>{operation.available ? "זמין" : "חסום"}</span>
                    <span className={`badge ${operation.writeRequired ? "badge-warning" : "badge-info"}`}>{operation.writeRequired ? "דורש כתיבה" : "קריאה/תכנון"}</span>
                  </div>
                  {operation.reason ? <p className="mt-2 text-xs muted">{operation.reason}</p> : null}
                </div>
              ))}
            </div>
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}
