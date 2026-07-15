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
      <div aria-hidden={navOpen || undefined} {...backgroundInteractionState}>
        <TopBar serverStatus={serverStatus} authUser={authUser} authChecking={authChecking} onLogout={onLogout} onOpenNav={() => setNavOpen(true)} />
        <div className="app-content-shell mx-auto flex w-full max-w-[1440px] gap-6 px-4 py-6 lg:min-h-[calc(100vh-68px)] lg:px-8">
          <Sidebar />
          <main className="app-main-content min-w-0 flex-1 pb-8" id="main-content">{children}</main>
        </div>
      </div>
      <Sidebar mobileOpen={navOpen} onMobileClose={() => setNavOpen(false)} />
    </div>
  );
}
