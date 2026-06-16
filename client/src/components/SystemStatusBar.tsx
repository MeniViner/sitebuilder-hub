import { Activity, Database, KeyRound, Server } from "lucide-react";
import type { WhoAmIResult } from "../api/sitesApi";
import { StatusToken } from "./StatusToken";

type AuthUser = NonNullable<WhoAmIResult["user"]>;

const authSourceLabels: Record<NonNullable<AuthUser["source"]>, string> = {
  dev: "מצב פיתוח מקומי",
  "api-key": "API key",
  owner: "בעלים",
  bootstrap: "Bootstrap",
  "site-admin": "מנהל אתר",
  sharepoint: "משתמש SharePoint"
};

function formatPersonalNumber(value?: string) {
  if (!value) return "";
  const match = String(value).match(/s?\d{6,8}/i);
  if (!match) return "";
  const digits = match[0].replace(/\D/g, "");
  return digits ? `s${digits}` : "";
}

function extractPersonalNumber(...values: Array<string | undefined>) {
  for (const value of values) {
    const formatted = formatPersonalNumber(value);
    if (formatted) return formatted;
  }
  return "";
}

function authLabel(authUser?: AuthUser | null, authChecking = false) {
  if (authChecking) return "בודק הרשאות";
  if (!authUser) return "לא מחובר";
  const source = authUser.source ? authSourceLabels[authUser.source] : authUser.role;
  const personalNumber = extractPersonalNumber(authUser.personalNumber, authUser.loginName, authUser.email);
  if (personalNumber) return `${source} ${personalNumber}`;
  if (authUser.source === "sharepoint") return `${source}: ${authUser.loginName || authUser.name || "לא ידוע"}`;
  return personalNumber ? `${source} ${personalNumber}` : source;
}

export function SystemStatusBar({
  serverStatus,
  authUser,
  authChecking = false
}: {
  serverStatus?: { mongo?: string; status?: string; serverTime?: string };
  authUser?: AuthUser | null;
  authChecking?: boolean;
}) {
  const apiOk = serverStatus?.status === "ok";
  const mongoOk = serverStatus?.mongo === "connected";
  const authKind = authUser ? (authUser.source === "dev" || authUser.source === "api-key" ? "warning" : "live") : authChecking ? "running" : "blocked";

  return (
    <div className="system-status-bar">
      <StatusToken kind={apiOk ? "live" : "blocked"} label={apiOk ? "API מחובר" : "API לא זמין"} icon={<Server size={13} />} helpKey="system.apiBaseUrl" />
      <StatusToken kind={mongoOk ? "live" : "warning"} label={mongoOk ? "MongoDB מחובר" : "MongoDB לא מחובר"} icon={<Database size={13} />} helpKey="site.mongodb" />
      <StatusToken kind="readonly" label={import.meta.env.MODE || "development"} icon={<Activity size={13} />} helpKey="site.environment" />
      <StatusToken kind={authKind} label={authLabel(authUser, authChecking)} icon={<KeyRound size={13} />} helpKey="sharepoint.currentUser" />
      {authUser?.source === "dev" ? <StatusToken kind="warning" label="מצב פיתוח מקומי - המשתמש אינו מזוהה מ-SharePoint" helpKey="mode.localDevOwner" /> : null}
    </div>
  );
}
