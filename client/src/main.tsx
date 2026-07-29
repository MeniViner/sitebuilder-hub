import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { API_BASE_URL, API_BASE_URL_SOURCE } from "./config/hubConfig";
import { clientLogger } from "./utils/logger";
import "@fontsource/heebo/hebrew-400.css";
import "@fontsource/heebo/hebrew-500.css";
import "@fontsource/heebo/hebrew-600.css";
import "@fontsource/heebo/hebrew-700.css";
import "@fontsource/heebo/hebrew-800.css";
import "./styles/index.css";

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
