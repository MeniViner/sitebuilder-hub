import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type {
  BuilderMongoHealthResult,
  OperationalStatusSnapshot,
  RuntimeConfigValidationResult,
  SharePointHealthResult,
  WhoAmIResult
} from "../api/sitesApi";
import { sitesApi } from "../api/sitesApi";
import {
  browserStatusFromHealth,
  browserStatusFromRuntimeConfig,
  builderStatusFromMongoHealth,
  defaultOperationalStatus,
  identityFromAuthUser,
  isNewerEvidence
} from "../utils/operationalStatus";

type AuthUser = NonNullable<WhoAmIResult["user"]>;

const storageKey = "sitebuilderHub.operationalStatus";

const readStoredStatus = () => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) as OperationalStatusSnapshot : null;
  } catch {
    return null;
  }
};

const writeStoredStatus = (status: OperationalStatusSnapshot) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(status));
  } catch {
    // localStorage may be unavailable in strict browser contexts.
  }
};

type OperationalStatusContextValue = {
  status: OperationalStatusSnapshot;
  refreshing: boolean;
  refreshStatus: () => Promise<OperationalStatusSnapshot | null>;
  recordHubHealth: (serverStatus?: { mongo?: string; status?: string; serverTime?: string }) => void;
  recordBrowserSharePointStatus: (browserSharePoint: OperationalStatusSnapshot["browserSharePoint"]) => void;
  recordBrowserSharePointHealth: (result: SharePointHealthResult) => void;
  recordRuntimeConfigEvidence: (result: RuntimeConfigValidationResult) => void;
  recordBuilderMongoHealth: (result: BuilderMongoHealthResult) => void;
  setBrowserSharePointRefreshing: (refreshing: boolean) => void;
};

const OperationalStatusContext = createContext<OperationalStatusContextValue | null>(null);

export function OperationalStatusProvider({
  children,
  serverStatus,
  authUser,
  authChecking = false
}: {
  children: ReactNode;
  serverStatus?: { mongo?: string; status?: string; serverTime?: string };
  authUser?: AuthUser | null;
  authChecking?: boolean;
}) {
  const [status, setStatus] = useState<OperationalStatusSnapshot>(() => readStoredStatus() || defaultOperationalStatus());
  const [refreshing, setRefreshing] = useState(false);
  const previousBrowserStatusRef = useRef<OperationalStatusSnapshot["browserSharePoint"] | null>(null);

  const updateStatus = useCallback((updater: (current: OperationalStatusSnapshot) => OperationalStatusSnapshot) => {
    setStatus((current) => {
      const next = updater(current);
      writeStoredStatus(next);
      return next;
    });
  }, []);

  const refreshStatus = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await sitesApi.operationalStatus();
      updateStatus(() => response.data);
      return response.data;
    } catch {
      updateStatus((current) => ({
        ...current,
        generatedAt: new Date().toISOString(),
        hubApi: {
          ...current.hubApi,
          status: "failed",
          checkedAt: new Date().toISOString(),
          message: "Hub API לא זמין"
        }
      }));
      return null;
    } finally {
      setRefreshing(false);
    }
  }, [updateStatus]);

  const recordHubHealth = useCallback((health?: { mongo?: string; status?: string; serverTime?: string }) => {
    if (!health) return;
    const checkedAt = health.serverTime || new Date().toISOString();
    updateStatus((current) => ({
      ...current,
      generatedAt: checkedAt,
      hubApi: {
        status: health.status === "ok" ? "connected" : "failed",
        checkedAt,
        message: health.status === "ok" ? "Hub API מחובר" : "Hub API לא זמין"
      },
      hubMongo: {
        status: health.mongo === "connected" ? "connected" : health.mongo === "disconnected" ? "failed" : "unknown",
        checkedAt,
        message: health.mongo === "connected" ? "Hub Mongo מחובר" : health.mongo === "disconnected" ? "Hub Mongo לא מחובר" : "מצב Hub Mongo לא ידוע"
      }
    }));
  }, [updateStatus]);

  const recordBrowserSharePointStatus = useCallback((nextBrowser: OperationalStatusSnapshot["browserSharePoint"]) => {
    updateStatus((current) => isNewerEvidence(nextBrowser.checkedAt, current.browserSharePoint.checkedAt)
      ? { ...current, generatedAt: new Date().toISOString(), browserSharePoint: nextBrowser }
      : current);
  }, [updateStatus]);

  const recordBrowserSharePointHealth = useCallback((result: SharePointHealthResult) => {
    const nextBrowser = browserStatusFromHealth(result);
    recordBrowserSharePointStatus(nextBrowser);
  }, [recordBrowserSharePointStatus]);

  const recordRuntimeConfigEvidence = useCallback((result: RuntimeConfigValidationResult) => {
    const nextBrowser = browserStatusFromRuntimeConfig(result);
    updateStatus((current) => isNewerEvidence(nextBrowser.checkedAt, current.browserSharePoint.checkedAt)
      ? { ...current, generatedAt: new Date().toISOString(), browserSharePoint: nextBrowser }
      : current);
  }, [updateStatus]);

  const recordBuilderMongoHealth = useCallback((result: BuilderMongoHealthResult) => {
    const nextBuilder = builderStatusFromMongoHealth(result);
    updateStatus((current) => isNewerEvidence(nextBuilder.checkedAt, current.builderBackend.checkedAt)
      ? {
          ...current,
          generatedAt: new Date().toISOString(),
          builderBackend: nextBuilder,
          operationMode: {
            ...current.operationMode,
            builderBackendMongoOperationsAvailable: nextBuilder.status === "configured" || nextBuilder.status === "reachable"
          }
        }
      : current);
  }, [updateStatus]);

  const setBrowserSharePointRefreshing = useCallback((isRefreshing: boolean) => {
    updateStatus((current) => ({
      ...current,
      browserSharePoint: (() => {
        if (isRefreshing) {
          if (current.browserSharePoint.status !== "refreshing") previousBrowserStatusRef.current = current.browserSharePoint;
          return {
            ...current.browserSharePoint,
            status: "refreshing" as const,
            message: "מרענן Browser SharePoint"
          };
        }
        if (current.browserSharePoint.status !== "refreshing") return current.browserSharePoint;
        const previous = previousBrowserStatusRef.current;
        previousBrowserStatusRef.current = null;
        return previous || {
          ...current.browserSharePoint,
          status: "not_checked" as const,
          message: "SharePoint דרך הדפדפן עדיין לא נבדק"
        };
      })()
    }));
  }, [updateStatus]);

  useEffect(() => {
    recordHubHealth(serverStatus);
  }, [recordHubHealth, serverStatus?.mongo, serverStatus?.serverTime, serverStatus?.status]);

  useEffect(() => {
    updateStatus((current) => ({
      ...current,
      currentIdentity: identityFromAuthUser(authUser, authChecking)
    }));
  }, [authChecking, authUser, updateStatus]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const value = useMemo<OperationalStatusContextValue>(() => ({
    status,
    refreshing,
    refreshStatus,
    recordHubHealth,
    recordBrowserSharePointStatus,
    recordBrowserSharePointHealth,
    recordRuntimeConfigEvidence,
    recordBuilderMongoHealth,
    setBrowserSharePointRefreshing
  }), [
    recordBrowserSharePointHealth,
    recordBrowserSharePointStatus,
    recordBuilderMongoHealth,
    recordHubHealth,
    recordRuntimeConfigEvidence,
    refreshStatus,
    refreshing,
    setBrowserSharePointRefreshing,
    status
  ]);

  return <OperationalStatusContext.Provider value={value}>{children}</OperationalStatusContext.Provider>;
}

export const useOperationalStatus = () => {
  const value = useContext(OperationalStatusContext);
  if (!value) throw new Error("useOperationalStatus must be used inside OperationalStatusProvider");
  return value;
};
