import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

function App() {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  async function greet() {
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    setGreetMsg(await invoke("greet", { name }));
  }

  async function showOverlay() {
    try {
      await invoke("show_overlay");
      setOverlayVisible(true);
      setStatusMsg("Overlay shown and focused");
    } catch (error) {
      setStatusMsg(`Error: ${error}`);
    }
  }

  async function hideOverlay() {
    try {
      await invoke("hide_overlay");
      setOverlayVisible(false);
      setStatusMsg("Overlay hidden");
    } catch (error) {
      setStatusMsg(`Error: ${error}`);
    }
  }

  async function focusOverlay() {
    try {
      await invoke("focus_overlay");
      setStatusMsg("Overlay focused");
    } catch (error) {
      setStatusMsg(`Error: ${error}`);
    }
  }

  async function checkOverlayState() {
    try {
      const visible = await invoke("get_overlay_state");
      setOverlayVisible(visible as boolean);
      setStatusMsg(`Overlay state: ${visible ? "visible" : "hidden"}`);
    } catch (error) {
      setStatusMsg(`Error: ${error}`);
    }
  }

  return (
    <div className="container">
      <h1>Annotatr</h1>
      <p>A cross-platform screen annotation overlay tool</p>

      <div className="row">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          placeholder="Enter a name..."
        />
        <button type="button" onClick={() => greet()}>
          Greet
        </button>
      </div>
      <p>{greetMsg}</p>

      <div className="status">
        <h2>Overlay Window Management</h2>
        <div className="row">
          <button type="button" onClick={showOverlay}>
            Show Overlay
          </button>
          <button type="button" onClick={hideOverlay}>
            Hide Overlay
          </button>
          <button type="button" onClick={focusOverlay}>
            Focus Overlay
          </button>
          <button type="button" onClick={checkOverlayState}>
            Check State
          </button>
        </div>
        <p className="status-msg">{statusMsg}</p>
        <p>Current state: {overlayVisible ? "Visible" : "Hidden"}</p>
      </div>

      <div className="status">
        <h2>Infrastructure Status</h2>
        <ul>
          <li>✓ Tauri 2 initialized with React + TypeScript</li>
          <li>✓ IPC command handlers configured</li>
          <li>✓ Multi-window configuration (main, overlay, mini-panel)</li>
          <li>✓ Overlay window management (show/hide/focus)</li>
        </ul>
      </div>
    </div>
  );
}

export default App;
