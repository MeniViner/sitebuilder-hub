import { Activity, ChevronDown, Database, KeyRound, Server, Share2, ShieldCheck, Workflow } from "lucide-react";
import type { WhoAmIResult } from "../api/sitesApi";
import { useOperationalStatus } from "./OperationalStatusProvider";
import { StatusToken, type StatusTokenKind } from "./StatusToken";

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
  if (personalNumber) {
    if (authUser.source === "dev") return `פיתוח ${personalNumber}`;
    if (authUser.source === "api-key") return `API ${personalNumber}`;
    return `${source} ${personalNumber}`;
  }
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
  const { status } = useOperationalStatus();
  const apiOk = status.hubApi.status === "connected" || serverStatus?.status === "ok";
  const mongoOk = status.hubMongo.status === "connected" || serverStatus?.mongo === "connected";
  const browserSpKind: StatusTokenKind =
    status.browserSharePoint.status === "connected"
      ? "live"
      : status.browserSharePoint.status === "failed"
        ? "blocked"
        : status.browserSharePoint.status === "refreshing"
          ? "running"
          : "neutral";
  const browserSpLabel =
    status.browserSharePoint.status === "connected"
      ? "Browser SharePoint מחובר"
      : status.browserSharePoint.status === "failed"
        ? "חיבור SharePoint דרך הדפדפן נכשל"
        : status.browserSharePoint.status === "refreshing"
          ? "מרענן Browser SharePoint"
          : "SharePoint דרך הדפדפן עדיין לא נבדק";
  const builderKind: StatusTokenKind =
    status.builderBackend.status === "reachable"
      ? "live"
      : status.builderBackend.status === "configured"
        ? "readonly"
        : status.builderBackend.status === "failed"
          ? "blocked"
          : "neutral";
  const builderLabel =
    status.builderBackend.status === "reachable"
      ? "Builder backend נגיש"
      : status.builderBackend.status === "configured"
        ? "Builder backend מוגדר"
        : status.builderBackend.status === "failed"
          ? "Builder backend נכשל"
          : status.builderBackend.status === "not_relevant"
            ? "Builder backend לא רלוונטי"
            : "Builder backend לא מוגדר";
  const authKind = authUser ? (authUser.source === "dev" || authUser.source === "api-key" ? "warning" : "live") : authChecking ? "running" : "blocked";
  const writeKind: StatusTokenKind = status.operationMode.browserSharePointWritesAvailable || status.operationMode.builderBackendMongoOperationsAvailable ? "writeEnabled" : "readonly";
  const writeLabel = status.operationMode.browserSharePointWritesAvailable || status.operationMode.builderBackendMongoOperationsAvailable ? "כתיבה זמינה" : "בדיקה ללא שינוי";

  return (
    <div className="system-status-bar" aria-label="סטטוס מערכת מרכזי">
      <details className="system-status-details">
        <summary>
          <span>פרטי מערכת</span>
          <ChevronDown size={14} aria-hidden="true" />
        </summary>
        <div className="system-status-details-panel">
          <div className="system-status-primary">
            <StatusToken compact kind="readonly" label={import.meta.env.MODE || "development"} icon={<Activity size={13} />} helpKey="site.environment" />
            <StatusToken compact kind={apiOk ? "live" : "blocked"} label={apiOk ? "API" : "API חסום"} icon={<Server size={13} />} helpKey="system.apiBaseUrl" />
            <StatusToken compact kind={mongoOk ? "live" : "warning"} label={mongoOk ? "Mongo" : "Mongo דורש בדיקה"} icon={<Database size={13} />} helpKey="site.mongodb" />
            <StatusToken compact kind={writeKind} label={writeLabel} icon={<ShieldCheck size={13} />} helpKey={writeKind === "writeEnabled" ? "sharepoint.write" : "mode.readOnly"} />
            <StatusToken compact kind={authKind} label={authLabel(authUser, authChecking)} icon={<KeyRound size={13} />} helpKey="sharepoint.currentUser" />
          </div>
          <div className="system-status-secondary">
            <StatusToken kind={browserSpKind} label={browserSpLabel} icon={<Share2 size={13} />} helpKey="sharepoint.browserConnector" />
            <StatusToken kind={builderKind} label={builderLabel} icon={<Workflow size={13} />} helpKey="create.backendApiUrl" />
            <StatusToken kind={writeKind} label={status.operationMode.label} icon={<ShieldCheck size={13} />} helpKey={writeKind === "writeEnabled" ? "sharepoint.write" : "mode.readOnly"} />
            {authUser?.source === "dev" ? <StatusToken kind="warning" label="מצב פיתוח מקומי - המשתמש אינו מזוהה מ-SharePoint" helpKey="mode.localDevOwner" /> : null}
          </div>
        </div>
      </details>
    </div>
  );
}
