import { ReactNode, useState } from "react";
import type { WhoAmIResult } from "../api/sitesApi";
import { Sidebar } from "./Sidebar";
import { SystemStatusBar } from "./SystemStatusBar";
import { TopBar } from "./TopBar";

type AuthUser = NonNullable<WhoAmIResult["user"]>;
export type NavMode = "button" | "rail" | "open";

const navModeStorageKey = "sitebuilderhub.navMode";

const readInitialNavMode = (): NavMode => {
  if (typeof window === "undefined") return "button";
  const stored = window.localStorage.getItem(navModeStorageKey);
  return stored === "rail" || stored === "open" || stored === "button" ? stored : "button";
};

export function AppShell({
  children,
  serverStatus,
  authUser,
  authChecking = false,
  onLogout
}: {
  children: ReactNode;
  serverStatus?: { mongo?: string; status?: string; serverTime?: string };
  authUser?: AuthUser | null;
  authChecking?: boolean;
  onLogout?: () => void;
}) {
  const [navOpen, setNavOpen] = useState(false);
  const [navMode, setNavModeState] = useState<NavMode>(readInitialNavMode);
  const showDesktopSidebar = navMode !== "button";
  const desktopSidebarCollapsed = navMode === "rail";

  const setNavMode = (mode: NavMode) => {
    setNavModeState(mode);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(navModeStorageKey, mode);
    }
  };

  return (
    <div className="app-shell-bg" dir="rtl">
      <TopBar
        authUser={authUser}
        authChecking={authChecking}
        navMode={navMode}
        onNavModeChange={setNavMode}
        onLogout={onLogout}
        onOpenNav={() => setNavOpen(true)}
      />
      <div className="mx-auto w-full max-w-[1520px] px-4 pt-3 lg:px-6">
        <SystemStatusBar serverStatus={serverStatus} authUser={authUser} authChecking={authChecking} />
      </div>
      <div className={`app-content-shell app-content-shell-${navMode} mx-auto flex w-full max-w-[1520px] gap-5 px-4 py-5 lg:min-h-[calc(100vh-116px)] lg:px-6`}>
        <Sidebar mobileOpen={navOpen} onMobileClose={() => setNavOpen(false)} />
        {showDesktopSidebar ? (
          <Sidebar
            collapsed={desktopSidebarCollapsed}
          />
        ) : null}
        <main className="app-main-content min-w-0 flex-1 pb-8">{children}</main>
      </div>
    </div>
  );
}
