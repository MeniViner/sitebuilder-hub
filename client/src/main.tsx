import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { API_BASE_URL, API_BASE_URL_SOURCE } from "./config/hubConfig";
import { HUB_VIEW_MODE_STORAGE_KEY, resolveInitialHubViewMode } from "./config/viewMode";
import { clientLogger } from "./utils/logger";
import "@fontsource/assistant/hebrew-400.css";
import "@fontsource/assistant/hebrew-600.css";
import "@fontsource/assistant/hebrew-700.css";
import "@fontsource/heebo/hebrew-400.css";
import "@fontsource/heebo/hebrew-500.css";
import "@fontsource/heebo/hebrew-600.css";
import "@fontsource/heebo/hebrew-700.css";
import "@fontsource/heebo/hebrew-800.css";
import "./styles/tailwind.css";
import "./styles/modern.css";
import "./styles/legacy.css";
import "./styles/view-mode.css";

let storedHubViewMode: string | null = null;
try {
  storedHubViewMode = window.localStorage.getItem(HUB_VIEW_MODE_STORAGE_KEY);
} catch {
  // Browser storage can be unavailable in hardened/private contexts.
}

document.documentElement.dataset.hubUiMode = resolveInitialHubViewMode({
  search: window.location.search,
  hash: window.location.hash,
  storedPreference: storedHubViewMode
});

clientLogger.installBrowserDiagnostics();
clientLogger.info("app", "Client bootstrapping", {
  mode: import.meta.env.MODE,
  apiBaseUrl: API_BASE_URL,
  apiBaseUrlSource: API_BASE_URL_SOURCE
});

async function bootstrap() {
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("scenario")) {
    const { installScenarioTransportFromLocation } = await import("./dev/scenarioTransport");
    installScenarioTransportFromLocation();
  }

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

void bootstrap();
