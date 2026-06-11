import React from "react";
import ReactDOM from "react-dom/client";
import { AppShell } from "./components/AppShell";
import "./styles/globals.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppShell />
  </React.StrictMode>
);
