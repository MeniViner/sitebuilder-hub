import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  HUB_VIEW_MODE_STORAGE_KEY,
  hubViewModeFromSearch,
  resolveHubViewMode,
  type HubViewMode,
  withoutHubViewMode
} from "../config/viewMode";

type HubViewModeContextValue = {
  mode: HubViewMode;
  source: "route-url" | "document-url" | "preference" | "default";
  setMode: (mode: HubViewMode) => void;
};

const HubViewModeContext = createContext<HubViewModeContextValue>({
  mode: "modern",
  source: "default",
  setMode: () => undefined
});

function readStoredPreference() {
  try {
    return window.localStorage.getItem(HUB_VIEW_MODE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredPreference(mode: HubViewMode) {
  try {
    window.localStorage.setItem(HUB_VIEW_MODE_STORAGE_KEY, mode);
  } catch {
    // The view remains usable when browser storage is disabled.
  }
}

function removeDocumentOverride() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("ui")) return false;
  url.searchParams.delete("ui");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  return true;
}

export function HubViewModeProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [storedPreference, setStoredPreference] = useState(readStoredPreference);
  const resolution = resolveHubViewMode({
    routeSearch: location.search,
    documentSearch: window.location.search,
    storedPreference
  });

  useLayoutEffect(() => {
    document.documentElement.dataset.hubUiMode = resolution.mode;
  }, [resolution.mode]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === HUB_VIEW_MODE_STORAGE_KEY) setStoredPreference(event.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setMode = useCallback((mode: HubViewMode) => {
    writeStoredPreference(mode);
    removeDocumentOverride();
    setStoredPreference(mode);

    if (hubViewModeFromSearch(location.search)) {
      navigate({
        pathname: location.pathname,
        search: withoutHubViewMode(location.search),
        hash: location.hash
      }, { replace: true });
    }
  }, [location.hash, location.pathname, location.search, navigate]);

  const value = useMemo<HubViewModeContextValue>(() => ({
    mode: resolution.mode,
    source: resolution.source,
    setMode
  }), [resolution.mode, resolution.source, setMode]);

  return <HubViewModeContext.Provider value={value}>{children}</HubViewModeContext.Provider>;
}

export function useHubViewMode() {
  return useContext(HubViewModeContext);
}
