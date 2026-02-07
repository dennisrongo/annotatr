import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { saveSetting, loadSetting, loadSettings, saveSettings, testStorageConnection, initializeStorage } from "./lib/storage";

interface MonitorInfo {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scale_factor: number;
}

function App() {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [mouseCaptureEnabled, setMouseCaptureEnabled] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [selectedMonitor, setSelectedMonitor] = useState("");

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
      setMouseCaptureEnabled(false);
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

  // Feature #7: Enable mouse capture when in drawing mode
  async function enableMouseCapture() {
    try {
      await invoke("enable_mouse_capture");
      setMouseCaptureEnabled(true);
      setStatusMsg("Mouse capture ENABLED - overlay captures mouse input");
    } catch (error) {
      setStatusMsg(`Error: ${error}`);
    }
  }

  // Feature #7: Disable mouse capture (pass-through mode)
  async function disableMouseCapture() {
    try {
      await invoke("disable_mouse_capture");
      setMouseCaptureEnabled(false);
      setStatusMsg("Mouse capture DISABLED - click-through enabled");
    } catch (error) {
      setStatusMsg(`Error: ${error}`);
    }
  }

  // Feature #8: Get monitor information for multi-monitor support
  async function loadMonitorInfo() {
    try {
      const monitorList = await invoke<MonitorInfo[]>("get_monitor_info");
      setMonitors(monitorList);
      if (monitorList.length > 0 && !selectedMonitor) {
        setSelectedMonitor(monitorList[0].id);
      }
      setStatusMsg(`Loaded ${monitorList.length} monitor(s)`);
    } catch (error) {
      setStatusMsg(`Error loading monitors: ${error}`);
    }
  }

  // Feature #8: Position overlay on specific monitor
  async function positionOverlayOnMonitor(monitorId: string) {
    try {
      const monitor = monitors.find(m => m.id === monitorId);
      if (monitor) {
        await invoke("set_overlay_position", {
          monitorId: monitor.id,
          x: monitor.x,
          y: monitor.y,
        });
        setSelectedMonitor(monitorId);
        setStatusMsg(`Overlay positioned on ${monitor.name}`);
      }
    } catch (error) {
      setStatusMsg(`Error positioning overlay: ${error}`);
    }
  }

  // Load monitors on mount
  useEffect(() => {
    loadMonitorInfo();
  }, []);

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

      {/* Feature #7: Mouse Capture Controls */}
      <div className="status">
        <h2>Mouse Capture (Feature #7)</h2>
        <p className="info-text">
          When enabled, the overlay captures mouse input for drawing.
          When disabled, mouse clicks pass through to underlying applications.
        </p>
        <div className="row">
          <button
            type="button"
            onClick={enableMouseCapture}
            disabled={!overlayVisible}
            className={mouseCaptureEnabled ? "active" : ""}
          >
            Enable Mouse Capture
          </button>
          <button
            type="button"
            onClick={disableMouseCapture}
            disabled={!overlayVisible}
            className={!mouseCaptureEnabled ? "active" : ""}
          >
            Disable Mouse Capture
          </button>
        </div>
        <p className="status-msg">
          Mouse capture: <strong>{mouseCaptureEnabled ? "ENABLED" : "DISABLED"}</strong>
        </p>
        {!overlayVisible && (
          <p className="warning">⚠️ Show the overlay first to enable mouse capture</p>
        )}
      </div>

      {/* Feature #8: Multi-Monitor Positioning */}
      <div className="status">
        <h2>Multi-Monitor Support (Feature #8)</h2>
        <p className="info-text">
          Select a monitor to position the overlay window. The overlay will be
          positioned at the top-left corner of the selected monitor.
        </p>
        <div className="row">
          <button type="button" onClick={loadMonitorInfo}>
            Refresh Monitors
          </button>
        </div>
        {monitors.length > 0 && (
          <div className="monitor-list">
            <h3>Available Monitors:</h3>
            {monitors.map((monitor) => (
              <div
                key={monitor.id}
                className={`monitor-item ${selectedMonitor === monitor.id ? "selected" : ""}`}
              >
                <strong>{monitor.name}</strong>
                <br />
                <small>
                  Position: ({monitor.x}, {monitor.y}) | Size: {monitor.width}x{monitor.height}
                  | Scale: {monitor.scale_factor}x
                </small>
                <br />
                <button
                  type="button"
                  onClick={() => positionOverlayOnMonitor(monitor.id)}
                  disabled={!overlayVisible}
                >
                  Position Overlay Here
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Feature #9: Multi-Monitor Shape Confinement Info */}
      <div className="status">
        <h2>Shape Confinement (Feature #9)</h2>
        <p className="info-text">
          Shapes drawn on one monitor are confined to that monitor and won't span
          across monitor boundaries. Each shape tracks its originating monitor.
        </p>
        <div className="info-box">
          <p>✓ Shapes are tracked per-monitor</p>
          <p>✓ Shape rendering is isolated to origin monitor</p>
          <p>✓ Multi-monitor configurations supported</p>
        </div>
      </div>

      <div className="status">
        <h2>Infrastructure Status</h2>
        <ul>
          <li>✓ Tauri 2 initialized with React + TypeScript</li>
          <li>✓ IPC command handlers configured</li>
          <li>✓ Multi-window configuration (main, overlay, mini-panel)</li>
          <li>✓ Overlay window management (show/hide/focus)</li>
          <li>✓ Mouse capture controls (enable/disable)</li>
          <li>✓ Multi-monitor detection and positioning</li>
          <li>✓ Per-monitor shape confinement tracking</li>
        </ul>
      </div>
    </div>
  );
}

export default App;
