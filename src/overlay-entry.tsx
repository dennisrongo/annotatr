// Overlay window entry point
// Feature #6: Transparent overlay window for drawing annotations
import React from "react";
import ReactDOM from "react-dom/client";
import Overlay from "./components/Overlay";

ReactDOM.createRoot(document.getElementById("overlay-root") as HTMLElement).render(
  <React.StrictMode>
    <Overlay />
  </React.StrictMode>
);
