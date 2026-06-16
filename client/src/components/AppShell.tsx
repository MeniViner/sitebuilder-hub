import { ReactNode, useState } from "react";
import type { WhoAmIResult } from "../api/sitesApi";
import { Sidebar } from "./Sidebar";
import { SystemStatusBar } from "./SystemStatusBar";
import { TopBar } from "./TopBar";

type AuthUser = NonNullable<WhoAmIResult["user"]>;

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
  const [navCollapsed, setNavCollapsed] = useState(false);

  return (
    <div className="app-shell-bg" dir="rtl">
      <TopBar authUser={authUser} authChecking={authChecking} onLogout={onLogout} onOpenNav={() => setNavOpen(true)} />
      <div className="mx-auto w-full max-w-[1520px] px-4 pt-3 lg:px-6">
        <SystemStatusBar serverStatus={serverStatus} authUser={authUser} authChecking={authChecking} />
      </div>
      <div className="app-content-shell mx-auto flex w-full max-w-[1520px] gap-5 px-4 py-5 lg:min-h-[calc(100vh-116px)] lg:px-6">
        <Sidebar collapsed={navCollapsed} onToggleCollapsed={() => setNavCollapsed((value) => !value)} />
        <Sidebar mobileOpen={navOpen} onMobileClose={() => setNavOpen(false)} />
        <main className="app-main-content min-w-0 flex-1 pb-8">{children}</main>
      </div>
    </div>
  );
}
