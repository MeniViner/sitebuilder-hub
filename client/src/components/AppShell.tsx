import { ReactNode } from "react";
import type { WhoAmIResult } from "../api/sitesApi";
import { Sidebar } from "./Sidebar";
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
  return (
    <div className="app-shell-bg" dir="rtl">
      <TopBar serverStatus={serverStatus} authUser={authUser} authChecking={authChecking} onLogout={onLogout} />
      <div className="mx-auto flex w-full max-w-[1520px] flex-col gap-5 px-4 py-5 lg:min-h-[calc(100vh-76px)] lg:flex-row lg:px-6">
        <Sidebar />
        <main className="min-w-0 flex-1 pb-8">{children}</main>
      </div>
    </div>
  );
}
