import { type ReactNode, useState } from "react";
import type { HubAuthUser } from "../domain/hubDomain";
import { LegacySidebar } from "./LegacySidebar";
import { LegacyTopBar } from "./LegacyTopBar";

export function LegacyAppShell({
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
    <div className="app-shell-bg normal-product legacy-product" dir="rtl" data-hub-shell="legacy">
      <div aria-hidden={navOpen || undefined} {...backgroundInteractionState}>
        <LegacyTopBar serverStatus={serverStatus} authUser={authUser} authChecking={authChecking} onLogout={onLogout} onOpenNav={() => setNavOpen(true)} />
        <div className="app-content-shell mx-auto flex w-full max-w-[1440px] gap-6 px-4 py-6 lg:min-h-[calc(100vh-68px)] lg:px-8">
          <LegacySidebar />
          <main className="app-main-content min-w-0 flex-1 pb-8" id="main-content">{children}</main>
        </div>
      </div>
      <LegacySidebar mobileOpen={navOpen} onMobileClose={() => setNavOpen(false)} />
    </div>
  );
}
