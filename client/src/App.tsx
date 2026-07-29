import { FormEvent, lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import { HashRouter, Route, Routes, useLocation } from "react-router-dom";
import { KeyRound, LogIn, RefreshCw, ShieldCheck } from "lucide-react";
import { Layout } from "./components/Layout";
import { AppShell } from "./components/AppShell";
import { HubViewModeProvider } from "./components/HubViewMode";
import { ErrorState } from "./components/ErrorState";
import { LoadingState } from "./components/LoadingState";
import { MetadataOnlyBadge } from "./components/MetadataOnlyBadge";
import { OperationalStatusProvider } from "./components/OperationalStatusProvider";
import { PageHeader } from "./components/PageHeader";
import { SectionCard } from "./components/SectionCard";
import { SimpleDashboardPage } from "./pages/SimpleDashboardPage";
import { SimpleSitesPage } from "./pages/SimpleSitesPage";
import { OperationsPage } from "./pages/OperationsPage";
import { SimpleSettingsPage } from "./pages/SimpleSettingsPage";
import { ProductPage } from "./components/product/ProductPage";
import { HUB_FEATURE_POLICY } from "./config/uiMode";
import { HUB_ROUTE_MANIFEST, isRouteModeEnabled, type HubRouteDefinition } from "./config/routeManifest";
import { presentVisibleRole } from "./domain/presentation";
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

const LegacySitesPage = lazy(() => import("./pages/SitesPage").then((module) => ({ default: module.SitesPage })));
const LegacySiteDetailsPage = lazy(() => import("./pages/SiteDetailsPage").then((module) => ({ default: module.SiteDetailsPage })));
const SiteSetupPage = lazy(() => import("./pages/SiteSetupPage").then((module) => ({ default: module.SiteSetupPage })));
const SiteWorkspacePage = lazy(() => import("./pages/SiteWorkspacePage").then((module) => ({ default: module.SiteWorkspacePage })));
const ReleasesPage = lazy(() => import("./pages/ReleasesPage").then((module) => ({ default: module.ReleasesPage })));
const BackupsPage = lazy(() => import("./pages/BackupsPage").then((module) => ({ default: module.BackupsPage })));
const AdminsPage = lazy(() => import("./pages/AdminsPage").then((module) => ({ default: module.AdminsPage })));
const JobsPage = lazy(() => import("./pages/JobsPage").then((module) => ({ default: module.JobsPage })));
const AuditPage = lazy(() => import("./pages/AuditPage").then((module) => ({ default: module.AuditPage })));
const HealthPage = lazy(() => import("./pages/HealthPage").then((module) => ({ default: module.HealthPage })));
const MonitoringPage = lazy(() => import("./pages/MonitoringPage").then((module) => ({ default: module.MonitoringPage })));
const LegacySettingsPage = lazy(() => import("./pages/SettingsPage").then((module) => ({ default: module.SettingsPage })));
const DiagnosticsPage = lazy(() => import("./pages/DiagnosticsPage").then((module) => ({ default: module.DiagnosticsPage })));
const HelpPage = lazy(() => import("./pages/HelpPage").then((module) => ({ default: module.HelpPage })));
const AnalyticsDashboardPage = lazy(() => import("./pages/AnalyticsDashboardPage").then((module) => ({ default: module.AnalyticsDashboardPage })));
const DashboardLabPage = lazy(() => import("./pages/DashboardLabPage").then((module) => ({ default: module.DashboardLabPage })));
const DashboardDesignStudioPage = lazy(() => import("./pages/DashboardDesignStudioPage").then((module) => ({ default: module.DashboardDesignStudioPage })));
const DashboardNorthStarPage = lazy(() => import("./pages/DashboardNorthStarPage").then((module) => ({ default: module.DashboardNorthStarPage })));

type AuthUser = NonNullable<WhoAmIResult["user"]>;

function RouteUnavailable() {
  return (
    <ProductPage title="עמוד לא זמין" description="העמוד אינו חלק מהמצב הפעיל.">
      <div className="normal-empty-card">
        <h2>העמוד אינו פעיל במצב הנוכחי</h2>
        <p>אפשר להפעיל מצב תמיכה מתאים דרך הגדרת הסביבה.</p>
      </div>
    </ProductPage>
  );
}

function routeDefinition(id: string) {
  return HUB_ROUTE_MANIFEST.find((route) => route.id === id) as HubRouteDefinition | undefined;
}

function GatedRoute({ id, authUser, children }: { id: string; authUser: AuthUser; children: ReactNode }) {
  const route = routeDefinition(id);
  const visibleRole = presentVisibleRole(authUser.role);
  const roleAllowed = Boolean(route && (route.roles.includes(visibleRole) || (route.roles.includes("internal") && visibleRole === "admin")));
  if (!route || !isRouteModeEnabled(route.mode, HUB_FEATURE_POLICY) || !roleAllowed) {
    return <RouteUnavailable />;
  }
  return <Suspense fallback={<LoadingState />}>{children}</Suspense>;
}

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

function HubRouter({ children }: { children: ReactNode }) {
  return (
    <HashRouter>
      <RouteLogger />
      <HubViewModeProvider>
        <Layout>{children}</Layout>
      </HubViewModeProvider>
    </HashRouter>
  );
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

function AuthenticatedRoutes({
  serverStatus,
  authUser,
  authChecking,
  onLogin,
  onLogout,
  onRefreshAuth,
  authBootstrapStatus,
  authError
}: {
  serverStatus?: { mongo?: string; status?: string; serverTime?: string };
  authUser: AuthUser;
  authChecking: boolean;
  onLogin: (personalNumber: string) => Promise<void>;
  onLogout: () => Promise<void>;
  onRefreshAuth: () => Promise<void>;
  authBootstrapStatus: AuthBootstrapStatus | null;
  authError: string;
}) {
  const location = useLocation();
  const detachedLab = HUB_FEATURE_POLICY.labs && (location.pathname === "/dashboard-northstar" || location.pathname === "/dashboard-design-studio");
  const routes = (
    <Routes>
      <Route path="/" element={<SimpleDashboardPage authUser={authUser} />} />
      <Route path="/sites" element={<SimpleSitesPage authUser={authUser} />} />
      <Route path="/sites/new" element={<GatedRoute id="site-create" authUser={authUser}><SiteSetupPage authUser={authUser} /></GatedRoute>} />
      <Route path="/sites/:id" element={<GatedRoute id="site" authUser={authUser}><SiteWorkspacePage authUser={authUser} /></GatedRoute>} />
      <Route path="/operations" element={<OperationsPage authUser={authUser} />} />
      <Route
        path="/settings"
        element={
          <SimpleSettingsPage
            authUser={authUser}
            authChecking={authChecking}
            authBootstrapStatus={authBootstrapStatus}
            authError={authError}
            onLogin={onLogin}
            onLogout={onLogout}
            onRefreshAuth={onRefreshAuth}
          />
        }
      />
      <Route path="/advanced/sites" element={<GatedRoute id="advanced-sites" authUser={authUser}><LegacySitesPage authUser={authUser} /></GatedRoute>} />
      <Route path="/advanced/sites/:id" element={<GatedRoute id="advanced-site" authUser={authUser}><LegacySiteDetailsPage /></GatedRoute>} />
      <Route path="/releases" element={<GatedRoute id="releases" authUser={authUser}><ReleasesPage /></GatedRoute>} />
      <Route path="/backups" element={<GatedRoute id="backups" authUser={authUser}><BackupsPage /></GatedRoute>} />
      <Route path="/admins" element={<GatedRoute id="admins" authUser={authUser}><AdminsPage /></GatedRoute>} />
      <Route path="/monitoring" element={<GatedRoute id="monitoring" authUser={authUser}><MonitoringPage /></GatedRoute>} />
      <Route path="/health" element={<GatedRoute id="health" authUser={authUser}><HealthPage /></GatedRoute>} />
      <Route path="/analytics" element={<GatedRoute id="analytics" authUser={authUser}><AnalyticsDashboardPage /></GatedRoute>} />
      <Route path="/jobs" element={<GatedRoute id="jobs" authUser={authUser}><JobsPage /></GatedRoute>} />
      <Route path="/audit" element={<GatedRoute id="audit" authUser={authUser}><AuditPage /></GatedRoute>} />
      <Route path="/diagnostics" element={<GatedRoute id="diagnostics" authUser={authUser}><DiagnosticsPage /></GatedRoute>} />
      <Route path="/help" element={<GatedRoute id="help" authUser={authUser}><HelpPage /></GatedRoute>} />
      <Route path="/dashboard-lab" element={<GatedRoute id="dashboard-lab" authUser={authUser}><DashboardLabPage /></GatedRoute>} />
      <Route path="/dashboard-design-studio" element={<GatedRoute id="dashboard-design-studio" authUser={authUser}><DashboardDesignStudioPage /></GatedRoute>} />
      <Route path="/dashboard-northstar" element={<GatedRoute id="dashboard-northstar" authUser={authUser}><DashboardNorthStarPage /></GatedRoute>} />
      <Route
        path="/advanced/settings"
        element={<GatedRoute id="advanced-settings" authUser={authUser}><LegacySettingsPage authUser={authUser} authChecking={authChecking} authBootstrapStatus={authBootstrapStatus} authError={authError} onLogin={onLogin} onLogout={onLogout} onRefreshAuth={onRefreshAuth} /></GatedRoute>}
      />
      <Route path="*" element={<RouteUnavailable />} />
    </Routes>
  );

  return (
    <OperationalStatusProvider serverStatus={serverStatus} authUser={authUser} authChecking={authChecking}>
      {detachedLab ? routes : (
        <AppShell serverStatus={serverStatus} authUser={authUser} authChecking={authChecking} onLogout={onLogout}>
          {routes}
        </AppShell>
      )}
    </OperationalStatusProvider>
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
    <HubRouter>
      <OperationalStatusProvider serverStatus={serverStatus} authUser={authUser} authChecking={authChecking}>
        <AppShell serverStatus={serverStatus} authUser={authUser} authChecking={authChecking} onLogout={handleLogout}>
          {children}
        </AppShell>
      </OperationalStatusProvider>
    </HubRouter>
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
    <HubRouter>
      <AuthenticatedRoutes
        serverStatus={serverStatus}
        authUser={authUser}
        authChecking={authChecking}
        onLogin={handleLogin}
        onLogout={handleLogout}
        onRefreshAuth={refreshAuth}
        authBootstrapStatus={authBootstrapStatus}
        authError={authError}
      />
    </HubRouter>
  );
}
