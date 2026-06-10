// Mini panel window entry point: compact horizontal toolbar
import React from "react";
import ReactDOM from "react-dom/client";
import Toolbar from "./components/Toolbar";

ReactDOM.createRoot(document.getElementById("panel-root") as HTMLElement).render(
  <React.StrictMode>
    <Toolbar />
  </React.StrictMode>
);
