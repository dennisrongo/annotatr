// Mini panel window entry point
// Feature #36: Mini panel window with tool selection buttons
import React from "react";
import ReactDOM from "react-dom/client";
import MiniPanel from "./components/MiniPanel";

ReactDOM.createRoot(document.getElementById("panel-root") as HTMLElement).render(
  <React.StrictMode>
    <MiniPanel />
  </React.StrictMode>
);
