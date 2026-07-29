import { type ReactNode, useState } from "react";
import type { HubAuthUser } from "../domain/hubDomain";
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
  const [navOpen, setNavOpen] = useState(false);
  const backgroundInteractionState = navOpen ? { inert: "" } : {};
  return (
    <div className="app-shell-bg normal-product" dir="rtl">
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
