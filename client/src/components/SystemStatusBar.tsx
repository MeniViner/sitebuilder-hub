import { CircleAlert, CircleCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { useOperationalStatus } from "./OperationalStatusProvider";

export function SystemStatusBar({
  serverStatus,
  authChecking = false
}: {
  serverStatus?: { mongo?: string; status?: string; serverTime?: string };
  authChecking?: boolean;
}) {
  const { status } = useOperationalStatus();
  const apiReady = status.hubApi.status === "connected" || serverStatus?.status === "ok";
  const dataReady = status.hubMongo.status === "connected" || serverStatus?.mongo === "connected";
  const ready = apiReady && dataReady;
  const Icon = ready ? CircleCheck : CircleAlert;

  return (
    <Link className={`system-status-summary-link ${ready ? "is-ready" : "is-attention"}`} to="/settings" aria-label={ready ? "המערכת זמינה" : "המערכת דורשת בדיקה"}>
      <Icon size={16} aria-hidden="true" />
      <span>{authChecking ? "בודק חיבור" : ready ? "מערכת זמינה" : "נדרשת בדיקה"}</span>
    </Link>
  );
}
