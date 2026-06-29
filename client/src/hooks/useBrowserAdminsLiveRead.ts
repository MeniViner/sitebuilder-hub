import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrowserAdminLiveReadEvidenceResult, LiveAdminSourcesResult, sitesApi } from "../api/sitesApi";
import { Site } from "../types/site";
import { readSharePointAdminsFromBrowser } from "../utils/sharepointBrowserAdmins";

export const ADMIN_LIVE_READ_STALE_MS = 15 * 60 * 1000;

const readTimestamp = (value: unknown) => {
  if (!value) return 0;
  const time = new Date(String(value)).getTime();
  return Number.isFinite(time) ? time : 0;
};

export const shouldAutoRunAdminLiveRead = (site?: Site | null, adminData?: any, staleMs = ADMIN_LIVE_READ_STALE_MS) => {
  if (!site?._id) return false;
  const latestRead = Math.max(
    readTimestamp(adminData?.lastAdminLiveReadAt),
    readTimestamp(adminData?.lastAdminSyncAt),
    readTimestamp(adminData?.latestSnapshot?.capturedAt),
    readTimestamp(site.lastAdminLiveReadAt),
    readTimestamp(site.lastAdminSyncAt)
  );
  if (!adminData?.latestSnapshot && !latestRead) return true;
  return Date.now() - latestRead > staleMs;
};

export function useBrowserAdminsLiveRead({
  site,
  adminData,
  auto = true,
  staleMs = ADMIN_LIVE_READ_STALE_MS,
  onPersisted,
  onMessage,
  onError
}: {
  site?: Site | null;
  adminData?: any;
  auto?: boolean;
  staleMs?: number;
  onPersisted?: (summary: BrowserAdminLiveReadEvidenceResult["summary"], result: BrowserAdminLiveReadEvidenceResult) => void;
  onMessage?: (message: string) => void;
  onError?: (message: string) => void;
}) {
  const [liveData, setLiveData] = useState<LiveAdminSourcesResult | null>(null);
  const [busy, setBusy] = useState(false);
  const attemptedAutoRead = useRef<Set<string>>(new Set());

  const stale = useMemo(() => shouldAutoRunAdminLiveRead(site, adminData, staleMs), [adminData, site, staleMs]);

  const runLiveRead = useCallback(async () => {
    if (!site) throw new Error("בחר אתר לקריאת מנהלים");
    setBusy(true);
    try {
      const browserResult = await readSharePointAdminsFromBrowser(site);
      const response = await sitesApi.recordBrowserAdminLiveReadEvidence(site._id, {
        ...browserResult,
        connectorMode: "browser-sharepoint",
        targetSiteUrl: browserResult.targetSiteUrl || site.sharePointSiteUrl
      });
      setLiveData(response.data.liveRead || browserResult);
      onPersisted?.(response.data.summary, response.data);
      onMessage?.("נמשך מ־SharePoint דרך הדפדפן ונשמר ב־Mongo");
      return response.data;
    } finally {
      setBusy(false);
    }
  }, [onMessage, onPersisted, site]);

  useEffect(() => {
    if (!auto || !site?._id || busy || !stale || attemptedAutoRead.current.has(site._id)) return;
    attemptedAutoRead.current.add(site._id);
    runLiveRead().catch((error) => {
      onError?.(error instanceof Error ? error.message : "הקריאה נכשלה");
    });
  }, [auto, busy, onError, runLiveRead, site?._id, stale]);

  useEffect(() => {
    setLiveData(null);
  }, [site?._id]);

  return {
    liveData,
    setLiveData,
    busy,
    stale,
    runLiveRead
  };
}
