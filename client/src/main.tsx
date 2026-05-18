import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { clientLogger } from "./utils/logger";
import "./styles/index.css";

clientLogger.installBrowserDiagnostics();
clientLogger.info("app", "Client bootstrapping", {
  mode: import.meta.env.MODE,
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4100/api"
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
