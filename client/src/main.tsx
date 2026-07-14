import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { API_BASE_URL, API_BASE_URL_SOURCE } from "./config/hubConfig";
import { clientLogger } from "./utils/logger";
import "./styles/index.css";

clientLogger.installBrowserDiagnostics();
clientLogger.info("app", "Client bootstrapping", {
  mode: import.meta.env.MODE,
  apiBaseUrl: API_BASE_URL,
  apiBaseUrlSource: API_BASE_URL_SOURCE
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
