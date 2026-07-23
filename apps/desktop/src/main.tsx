import React from "react";
import ReactDOM from "react-dom/client";
import { AppShell } from "./components/AppShell";
import "./styles/tokens.css";
import "./styles/globals.css";
import "./styles/workbench.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppShell />
  </React.StrictMode>
);
