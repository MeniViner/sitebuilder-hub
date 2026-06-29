import { FormEvent, useCallback, useEffect, useState } from "react";
import { HashRouter, Route, Routes, useLocation } from "react-router-dom";
import { KeyRound, LogIn, RefreshCw, ShieldCheck } from "lucide-react";
import { Layout } from "./components/Layout";
import { AppShell } from "./components/AppShell";
import { ErrorState } from "./components/ErrorState";
import { LoadingState } from "./components/LoadingState";
import { MetadataOnlyBadge } from "./components/MetadataOnlyBadge";
import { PageHeader } from "./components/PageHeader";
import { SectionCard } from "./components/SectionCard";
import { DashboardPage } from "./pages/DashboardPage";
import { AnalyticsDashboardPage } from "./pages/AnalyticsDashboardPage";
import { SitesPage } from "./pages/SitesPage";
import { SiteDetailsPage } from "./pages/SiteDetailsPage";
import { ReleasesPage } from "./pages/ReleasesPage";
import { BackupsPage } from "./pages/BackupsPage";
import { AdminsPage } from "./pages/AdminsPage";
import { JobsPage } from "./pages/JobsPage";
import { AuditPage } from "./pages/AuditPage";
import { HealthPage } from "./pages/HealthPage";
import { MonitoringPage } from "./pages/MonitoringPage";
import { SettingsPage } from "./pages/SettingsPage";
import { DiagnosticsPage } from "./pages/DiagnosticsPage";
import { HelpPage } from "./pages/HelpPage";
import {
  AuthBootstrapStatus,
  AuthLoginResult,
  detectSharePointCurrentUser,
  getClientRuntimeMode,
  getHubPersonalNumber,
  SharePointCurrentUserResult,
  sitesApi,
  WhoAmIResult
} from "./api/sitesApi";
import { clientLogger } from "./utils/logger";

type AuthUser = NonNullable<WhoAmIResult["user"]>;

function authUserFromLogin(result: AuthLoginResult): AuthUser {
  return {
    id: `pn:${result.personalNumber}`,
    name: result.isBootstrapAdmin ? `Bootstrap Admin ${result.personalNumber}` : `Admin ${result.personalNumber}`,
    role: result.role,
    personalNumber: result.personalNumber,
    source: result.source,
    identityMode: result.identityMode,
    ownerMode: result.ownerMode,
    ownerModeReason: result.ownerModeReason,
    isBootstrapAdmin: result.isBootstrapAdmin
  };
}

function authUserFromSharePoint(result: SharePointCurrentUserResult): AuthUser | null {
  if (!result.ok || !result.user) return null;
  return {
    id: result.user.loginName || result.user.email || `sp:${result.user.id || "current"}`,
    name: result.user.personalNumber || result.user.email || result.user.loginName || result.user.title || "SharePoint user",
    role: "admin",
    source: "sharepoint",
    personalNumber: result.user.personalNumber,
    loginName: result.user.loginName,
    email: result.user.email,
    identityMode: "sharepoint-user"
  };
}

function RouteLogger() {
  const location = useLocation();

  useEffect(() => {
    clientLogger.info("router", "Route changed", {
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
      key: location.key
    });
  }, [location]);

  return null;
}

function FirstInitAuthPage({
  bootstrapStatus,
  authError,
  sharePointCurrentUser,
  onLogin,
  onRetry
}: {
  bootstrapStatus: AuthBootstrapStatus | null;
  authError: string;
  sharePointCurrentUser: SharePointCurrentUserResult | null;
  onLogin: (personalNumber: string) => Promise<void>;
  onRetry: () => Promise<void>;
}) {
  const [personalNumber, setPersonalNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clientLogger.info("ui", "Personal number login submitted", { hasPersonalNumber: Boolean(personalNumber.trim()) });
    setSubmitting(true);
    setError("");
    try {
      await onLogin(personalNumber);
    } catch (err) {
      clientLogger.error("auth", "Personal number login failed in form", { error: err });
      setError(err instanceof Error ? err.message : "שגיאה בהתחברות");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="כניסה ל־Site Builder Hub"
        subtitle="אם ה־Hub פתוח מתוך SharePoint, המערכת מנסה לזהות את המשתמש הנוכחי מהדפדפן. מספר אישי נדרש רק כאשר אין זיהוי SharePoint זמין והשרת דורש זאת."
        actions={<MetadataOnlyBadge mode="metadata" />}
        helpKey="sharepoint.currentUser"
      />

      <SectionCard title="התחברות ראשונית" subtitle="המערכת תבדוק את המספר מול רשימת המורשים ותשמור אותו לקריאות הבאות." helpKey="settings">
        {sharePointCurrentUser?.attempted && !sharePointCurrentUser.ok ? (
          <div className="mb-4 rounded-lg border p-3 text-sm" style={{ background: "var(--warning-soft)", borderColor: "color-mix(in srgb, var(--warning) 35%, var(--border))" }}>
            <p className="font-bold" style={{ color: "var(--text-strong)" }}>דרושה התחברות ל־SharePoint או בדיקת חיבור</p>
            <p className="mt-1 muted">הדפדפן לא הצליח לקרוא את `/_api/web/currentuser`. אם השרת עדיין דורש זהות בעלים, אפשר להתחבר במספר אישי או לפתוח את "בעיות וחיבורים".</p>
          </div>
        ) : null}
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="field-label" htmlFor="personal-number-login">מספר אישי</label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="personal-number-login"
                className="control num"
                placeholder="s8856096"
                autoComplete="username"
                value={personalNumber}
                onChange={(event) => setPersonalNumber(event.target.value)}
              />
              <button className="btn btn-primary" type="submit" disabled={submitting || !personalNumber.trim()}>
                <LogIn size={16} />
                {submitting ? "מתחבר..." : "כניסה"}
              </button>
            </div>
          </div>

          {error || authError ? <ErrorState message={error || authError} /> : null}

          <div className="grid gap-3 md:grid-cols-3">
            <div className="soft-panel p-4">
              <KeyRound className="mb-2" size={18} style={{ color: "var(--accent)" }} />
              <p className="field-label">Personal number auth</p>
              <p className="font-bold" style={{ color: "var(--text-strong)" }}>{bootstrapStatus?.personalNumberLoginEnabled ? "מופעל" : "לא ידוע"}</p>
            </div>
            <div className="soft-panel p-4">
              <ShieldCheck className="mb-2" size={18} style={{ color: "var(--success)" }} />
              <p className="field-label">Bootstrap admins</p>
              <p className="num font-bold" style={{ color: "var(--text-strong)" }}>{bootstrapStatus?.bootstrapAdminsConfigured ?? "-"}</p>
            </div>
            <div className="soft-panel p-4">
              <button className="btn btn-secondary w-full" type="button" onClick={onRetry} disabled={submitting}>
                <RefreshCw size={16} />
                בדיקה מחדש
              </button>
            </div>
          </div>
        </form>
      </SectionCard>
    </div>
  );
}

export default function App() {
  const [serverStatus, setServerStatus] = useState<{ status?: string; mongo?: string; serverTime?: string }>({});
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [sharePointCurrentUser, setSharePointCurrentUser] = useState<SharePointCurrentUserResult | null>(null);
  const [authBootstrapStatus, setAuthBootstrapStatus] = useState<AuthBootstrapStatus | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    clientLogger.debug("state", "Server status state changed", serverStatus);
  }, [serverStatus]);

  useEffect(() => {
    clientLogger.debug("state", "Auth user state changed", {
      authenticated: Boolean(authUser),
      userId: authUser?.id,
      role: authUser?.role,
      source: authUser?.source
    });
  }, [authUser]);

  useEffect(() => {
    clientLogger.debug("state", "Auth bootstrap status state changed", authBootstrapStatus ?? {});
  }, [authBootstrapStatus]);

  useEffect(() => {
    clientLogger.debug("state", "Auth checking state changed", { authChecking });
  }, [authChecking]);

  useEffect(() => {
    clientLogger.debug("state", "Auth error state changed", { hasAuthError: Boolean(authError), authError });
  }, [authError]);

  useEffect(() => {
    clientLogger.info("app", "Initial health check started");
    sitesApi.health()
      .then((res) => {
        clientLogger.info("app", "Initial health check completed", res.data);
        setServerStatus(res.data);
      })
      .catch((error) => {
        clientLogger.error("app", "Initial health check failed", { error });
        setServerStatus({});
      });
  }, []);

  const refreshAuth = useCallback(async () => {
    clientLogger.info("auth", "Auth refresh started");
    setAuthChecking(true);
    setAuthError("");
    const storedPersonalNumber = getHubPersonalNumber();
    const runtimeMode = getClientRuntimeMode();
    let detectedSharePointUser: SharePointCurrentUserResult | null = null;

    try {
      detectedSharePointUser = await detectSharePointCurrentUser();
      setSharePointCurrentUser(detectedSharePointUser);
      clientLogger.info("auth", "SharePoint current user detection completed", {
        mode: detectedSharePointUser.mode,
        attempted: detectedSharePointUser.attempted,
        ok: detectedSharePointUser.ok,
        status: detectedSharePointUser.status,
        loginName: detectedSharePointUser.user?.loginName
      });
    } catch (error) {
      clientLogger.warn("auth", "SharePoint current user detection failed unexpectedly", { error });
      setSharePointCurrentUser(null);
    }

    try {
      const bootstrapRes = await sitesApi.authBootstrapStatus();
      clientLogger.info("auth", "Auth bootstrap status loaded", bootstrapRes.data);
      setAuthBootstrapStatus(bootstrapRes.data);
    } catch (error) {
      clientLogger.error("auth", "Auth bootstrap status failed", { error });
      setAuthBootstrapStatus(null);
    }

    try {
      const meRes = await sitesApi.me();
      clientLogger.info("auth", "Current auth user loaded", {
        authenticated: meRes.data.authenticated,
        ownerMode: meRes.data.ownerMode,
        userId: meRes.data.user?.id,
        role: meRes.data.user?.role,
        source: meRes.data.user?.source
      });
      const sharePointUser = detectedSharePointUser ? authUserFromSharePoint(detectedSharePointUser) : null;
      const backendUser = meRes.data.user;
      if (sharePointUser && (!backendUser || backendUser.source === "dev")) {
        setAuthUser(sharePointUser);
      } else if (runtimeMode === "sharepoint-hosted" && backendUser?.source === "dev") {
        setAuthUser(null);
        setAuthError("מצב SharePoint: המשתמש לא זוהה מהדפדפן, ולכן לא מוצג Local Developer. פתחו את בעיות וחיבורים כדי לבדוק את החיבור.");
      } else {
        setAuthUser(backendUser);
      }
    } catch (err) {
      clientLogger.warn("auth", "Current auth user failed", {
        hadStoredPersonalNumber: Boolean(storedPersonalNumber),
        error: err
      });
      const sharePointUser = detectedSharePointUser ? authUserFromSharePoint(detectedSharePointUser) : null;
      if (sharePointUser) {
        setAuthUser(sharePointUser);
        setAuthError("");
      } else {
        setAuthUser(null);
        setAuthError(storedPersonalNumber ? (err instanceof Error ? err.message : "נדרשת התחברות עם מספר אישי") : "");
      }
    } finally {
      clientLogger.info("auth", "Auth refresh finished");
      setAuthChecking(false);
    }
  }, []);

  useEffect(() => {
    void refreshAuth();
  }, [refreshAuth]);

  const handleLogin = useCallback(async (personalNumber: string) => {
    clientLogger.info("auth", "Login started", { hasPersonalNumber: Boolean(personalNumber.trim()) });
    const loginRes = await sitesApi.loginPersonalNumber(personalNumber);
    clientLogger.info("auth", "Login accepted", {
      role: loginRes.data.role,
      source: loginRes.data.source,
      ownerMode: loginRes.data.ownerMode,
      isBootstrapAdmin: loginRes.data.isBootstrapAdmin,
      matchedSite: loginRes.data.matchedSite
    });
    setAuthUser(authUserFromLogin(loginRes.data));
    setAuthError("");

    try {
      const meRes = await sitesApi.me();
      clientLogger.info("auth", "Post-login user refresh completed", {
        userId: meRes.data.user?.id,
        role: meRes.data.user?.role,
        source: meRes.data.user?.source,
        ownerMode: meRes.data.ownerMode
      });
      setAuthUser(meRes.data.user ?? authUserFromLogin(loginRes.data));
    } catch (error) {
      clientLogger.warn("auth", "Post-login user refresh failed, using login result", { error });
      setAuthUser(authUserFromLogin(loginRes.data));
    }
  }, []);

  const handleLogout = useCallback(async () => {
    clientLogger.info("auth", "Logout started");
    await sitesApi.logoutPersonalNumber();
    setAuthUser(null);
    await refreshAuth();
    clientLogger.info("auth", "Logout finished");
  }, [refreshAuth]);

  const appShell = (children: JSX.Element) => (
    <HashRouter>
      <RouteLogger />
      <Layout>
        <AppShell serverStatus={serverStatus} authUser={authUser} authChecking={authChecking} onLogout={handleLogout}>
          {children}
        </AppShell>
      </Layout>
    </HashRouter>
  );

  if (authChecking) {
    return appShell(<LoadingState label="בודק הרשאות..." />);
  }

  if (!authUser) {
    return appShell(
      <FirstInitAuthPage
        bootstrapStatus={authBootstrapStatus}
        authError={authError}
        sharePointCurrentUser={sharePointCurrentUser}
        onLogin={handleLogin}
        onRetry={refreshAuth}
      />
    );
  }

  return (
    <HashRouter>
      <RouteLogger />
      <Layout>
        <AppShell serverStatus={serverStatus} authUser={authUser} authChecking={authChecking} onLogout={handleLogout}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/analytics" element={<AnalyticsDashboardPage />} />
            <Route path="/sites" element={<SitesPage authUser={authUser} />} />
            <Route path="/sites/:id" element={<SiteDetailsPage />} />
            <Route path="/releases" element={<ReleasesPage />} />
            <Route path="/backups" element={<BackupsPage />} />
            <Route path="/admins" element={<AdminsPage />} />
            <Route path="/jobs" element={<JobsPage />} />
            <Route path="/monitoring" element={<MonitoringPage />} />
            <Route path="/audit" element={<AuditPage />} />
            <Route path="/health" element={<HealthPage />} />
            <Route path="/diagnostics" element={<DiagnosticsPage />} />
            <Route path="/help" element={<HelpPage />} />
            <Route
              path="/settings"
              element={
                <SettingsPage
                  authUser={authUser}
                  authChecking={authChecking}
                  authBootstrapStatus={authBootstrapStatus}
                  authError={authError}
                  onLogin={handleLogin}
                  onLogout={handleLogout}
                  onRefreshAuth={refreshAuth}
                />
              }
            />
          </Routes>
        </AppShell>
      </Layout>
    </HashRouter>
  );
}
