import { type ReactNode, useLayoutEffect, useState } from "react";
import type { HubAuthUser } from "../domain/hubDomain";
import { useHubViewMode } from "./HubViewMode";
import { LegacyAppShell } from "./LegacyAppShell";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function AppShell({
  children,
  serverStatus,
  authUser,
  authChecking = false,
  onLogout
}: {
  children: ReactNode;
  serverStatus?: { mongo?: string; status?: string; serverTime?: string };
  authUser?: HubAuthUser | null;
  authChecking?: boolean;
  onLogout?: () => void;
}) {
  const { mode } = useHubViewMode();
  const [navOpen, setNavOpen] = useState(false);
  const backgroundInteractionState = navOpen ? { inert: "" } : {};

  useLayoutEffect(() => {
    setNavOpen(false);
  }, [mode]);

  if (mode === "legacy") {
    return (
      <LegacyAppShell
        serverStatus={serverStatus}
        authUser={authUser}
        authChecking={authChecking}
        onLogout={onLogout}
      >
        {children}
      </LegacyAppShell>
    );
  }

  return (
    <div className="app-shell-bg normal-product" dir="rtl" data-hub-shell="modern">
      <div className="app-shell-frame" aria-hidden={navOpen || undefined} {...backgroundInteractionState}>
        <Sidebar authUser={authUser} onLogout={onLogout} />
        <div className="app-workspace-shell">
          <TopBar serverStatus={serverStatus} authUser={authUser} authChecking={authChecking} onLogout={onLogout} onOpenNav={() => setNavOpen(true)} />
          <div className="app-content-shell">
            <main className="app-main-content" id="main-content">{children}</main>
          </div>
        </div>
      </div>
      <Sidebar authUser={authUser} onLogout={onLogout} mobileOpen={navOpen} onMobileClose={() => setNavOpen(false)} />
    </div>
  );
}
