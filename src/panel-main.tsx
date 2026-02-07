// Mini panel window entry point
import React from "react";
import ReactDOM from "react-dom/client";

function MiniPanel() {
  return (
    <div style={{
      display: 'flex',
      gap: '8px',
      padding: '8px',
      background: 'rgba(40, 40, 40, 0.9)',
      borderRadius: '8px'
    }}>
      <button style={{ padding: '8px 12px' }}>Arrow</button>
      <button style={{ padding: '8px 12px' }}>Circle</button>
      <button style={{ padding: '8px 12px' }}>Box</button>
      <button style={{ padding: '8px 12px' }}>Freehand</button>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("panel-root") as HTMLElement).render(
  <React.StrictMode>
    <MiniPanel />
  </React.StrictMode>
);
