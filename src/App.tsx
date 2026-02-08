import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { saveSetting, loadSetting, loadSettings, testStorageConnection, initializeStorage } from "./lib/storage";

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
  const [storageStatus, setStorageStatus] = useState("Not tested");
  const [storageValue, setStorageValue] = useState("");
  const [loadedValue, setLoadedValue] = useState("");
  const [drawingMode, setDrawingMode] = useState(false);
  const [platformInfo, setPlatformInfo] = useState<any>(null);

  /**
   * Convert tool name to hotkey config key
   * Example: "box" -> "boxTool", "freehand" -> "freehandTool"
   */
  function toolNameToHotkeyKey(tool: string): string {
    const keyMap: Record<string, string> = {
      "arrow": "arrowTool",
      "circle": "circleTool",
      "box": "boxTool",
      "freehand": "freehandTool",
      "highlighter": "highlighterTool",
      "text": "textTool",
    };
    return keyMap[tool] || tool;
  }

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
      // Feature #16: Also enable drawing mode for cursor change
      await invoke("set_drawing_mode", { enabled: true });
      setDrawingMode(true);
      setStatusMsg("Mouse capture ENABLED - overlay captures mouse input, cursor changed to crosshair");
    } catch (error) {
      setStatusMsg(`Error: ${error}`);
    }
  }

  // Feature #7: Disable mouse capture (pass-through mode)
  async function disableMouseCapture() {
    try {
      await invoke("disable_mouse_capture");
      setMouseCaptureEnabled(false);
      // Feature #16: Also disable drawing mode to reset cursor
      await invoke("set_drawing_mode", { enabled: false });
      setDrawingMode(false);
      setStatusMsg("Mouse capture DISABLED - click-through enabled, cursor reset to default");
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

  // Feature #10: Dismiss overlay (Escape key handler)
  async function dismissOverlay() {
    try {
      await invoke("dismiss_overlay");
      setOverlayVisible(false);
      setMouseCaptureEnabled(false);
      setStatusMsg("Overlay dismissed - drawing state cleared");
    } catch (error) {
      setStatusMsg(`Error: ${error}`);
    }
  }

  // Feature #10: Toggle overlay visibility
  async function toggleOverlay() {
    try {
      const newState = await invoke<boolean>("toggle_overlay");
      setOverlayVisible(newState);
      setMouseCaptureEnabled(newState); // Reset mouse capture when toggling
      setStatusMsg(`Overlay toggled - now ${newState ? "visible" : "hidden"}`);
    } catch (error) {
      setStatusMsg(`Error: ${error}`);
    }
  }

  // Feature #11: Load platform information
  async function loadPlatformInfo() {
    try {
      const info = await invoke<any>("get_platform_info");
      setPlatformInfo(info);
      setStatusMsg(`Platform: ${info.platform}`);
    } catch (error) {
      console.error("Failed to load platform info:", error);
      setStatusMsg("Platform info unavailable");
    }
  }

  // Load monitors on mount
  useEffect(() => {
    loadMonitorInfo();
    loadPlatformInfo();
    // Test storage on mount
    testStorage();
  }, []);

  // Feature #1: Test local storage connection
  async function testStorage() {
    setStorageStatus("Testing...");
    try {
      const isConnected = await testStorageConnection();
      setStorageStatus(isConnected ? "✓ Connected" : "✗ Failed");
    } catch (error) {
      setStorageStatus(`✗ Error: ${error}`);
    }
  }

  // Test writing a value
  async function writeTestValue() {
    const testValue = `test_${Date.now()}`;
    try {
      await saveSetting("test_key", testValue);
      setStorageValue(testValue);
      setStatusMsg(`Wrote: ${testValue}`);
    } catch (error) {
      setStatusMsg(`Error writing: ${error}`);
    }
  }

  // Test reading a value
  async function readTestValue() {
    try {
      const value = await loadSetting<string>("test_key");
      setLoadedValue(value ?? "null");
      setStatusMsg(`Read: ${value}`);
    } catch (error) {
      setStatusMsg(`Error reading: ${error}`);
    }
  }

  // Initialize storage with defaults
  async function initStorage() {
    try {
      await initializeStorage();
      setStatusMsg("Storage initialized with defaults");
      // Load and display settings
      const settings = await loadSettings();
      console.log("Loaded settings:", settings);
      setStatusMsg(`Storage initialized. Line thickness: ${settings.lineThickness}, Font size: ${settings.fontSize}`);
    } catch (error) {
      setStatusMsg(`Error initializing: ${error}`);
    }
  }

  // Feature #18: Simulate hotkey activation (for testing)
  async function activateToolViaHotkey(tool: string) {
    try {
      // Convert tool name to hotkey config key before passing to backend
      const hotkeyKey = toolNameToHotkeyKey(tool);
      await invoke("activate_tool_hotkey", { tool: hotkeyKey });
      setOverlayVisible(true);
      setDrawingMode(true);
      setStatusMsg(`Activated ${tool} tool via hotkey - overlay shown`);
    } catch (error) {
      setStatusMsg(`Error activating tool: ${error}`);
    }
  }

  return (
    <div className="container">
      <h1>Annotatr</h1>
      <p>A cross-platform screen annotation overlay tool</p>

      {/* Feature #1: Local Storage Testing */}
      <div className="status">
        <h2>Local Storage Connection (Feature #1)</h2>
        <p className="info-text">
          Test Tauri's persistent storage API for saving and loading application settings.
        </p>
        <div className="row">
          <button type="button" onClick={testStorage}>
            Test Connection
          </button>
          <button type="button" onClick={writeTestValue}>
            Write Test Value
          </button>
          <button type="button" onClick={readTestValue}>
            Read Test Value
          </button>
          <button type="button" onClick={initStorage}>
            Initialize Defaults
          </button>
        </div>
        <p className="status-msg">
          Storage Status: <strong>{storageStatus}</strong>
        </p>
        {storageValue && <p className="status-msg">Last written: {storageValue}</p>}
        {loadedValue && <p className="status-msg">Last read: {loadedValue}</p>}
        <p className="status-msg">{statusMsg}</p>
      </div>

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

      {/* Feature #10: Dismiss Overlay (Escape Key + Toggle) */}
      <div className="status">
        <h2>Dismiss Overlay (Feature #10)</h2>
        <p className="info-text">
          Dismiss the overlay using the Escape key or toggle hotkey. This clears any active
          drawing state and hides the overlay window.
        </p>
        <div className="row">
          <button
            type="button"
            onClick={dismissOverlay}
            disabled={!overlayVisible}
            className="danger"
          >
            Dismiss Overlay (Esc)
          </button>
          <button
            type="button"
            onClick={toggleOverlay}
          >
            Toggle Overlay
          </button>
        </div>
        <p className="status-msg">
          Press <strong>Escape</strong> in the overlay window to dismiss it, or use the toggle button.
        </p>
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
        <p className="status-msg">
          {/* Feature #16: Show current cursor mode */}
          Cursor mode: <strong>{drawingMode ? "Crosshair (Drawing Mode)" : "Default (Normal)"}</strong>
        </p>
        {!overlayVisible && (
          <p className="warning">⚠️ Show the overlay first to enable mouse capture</p>
        )}
      </div>

      {/* Feature #16: Cursor Changes Test */}
      <div className="status">
        <h2>Cursor Changes (Feature #16)</h2>
        <p className="info-text">
          The cursor changes to a crosshair when drawing mode is active, and returns to default
          when drawing mode is disabled. This provides visual feedback about the current mode.
        </p>
        <div className="info-box">
          <p>✓ Cursor: <strong>crosshair</strong> when drawing mode is enabled</p>
          <p>✓ Cursor: <strong>default</strong> when drawing mode is disabled</p>
          <p>✓ Automatically synced with mouse capture state</p>
          <p>✓ Listens for drawing-mode-changed events</p>
        </div>
      </div>

      {/* Feature #17: Visual Tool Indicator */}
      <div className="status">
        <h2>Visual Tool Indicator (Feature #17)</h2>
        <p className="info-text">
          Each drawing tool has a unique visual indicator with an icon, color, and label.
          The indicator appears in the top-left corner of the overlay when a tool is active.
        </p>
        <div className="info-box">
          <p><strong>Tool Indicators:</strong></p>
          <p>↗ Arrow - Blue (#3b82f6)</p>
          <p>○ Circle - Green (#10b981)</p>
          <p>□ Box - Orange (#f59e0b)</p>
          <p>✎ Freehand - Red (#ef4444)</p>
          <p>▭ Highlighter - Yellow (#eab308)</p>
          <p>T Text - Purple (#8b5cf6)</p>
        </div>
        <p className="info-text" style={{ marginTop: "12px" }}>
          The indicator automatically updates when you switch tools via hotkeys or mini panel.
          Each tool has a distinct color and icon for easy identification.
        </p>
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

      {/* Feature #18: Overlay Activation via Hotkey or Mini Panel */}
      <div className="status">
        <h2>Overlay Activation (Feature #18)</h2>
        <p className="info-text">
          The overlay can be activated via global hotkeys or by clicking tools in the mini panel.
          When a tool is selected, the overlay automatically shows and drawing mode is enabled.
        </p>
        <div className="info-box">
          <p><strong>Activation Methods:</strong></p>
          <p>✓ <strong>Mini Panel:</strong> Click any tool button to show overlay and select tool</p>
          <p>✓ <strong>Global Hotkeys:</strong> Press tool-specific hotkey (e.g., Ctrl+Shift+A for Arrow)</p>
          <p>✓ <strong>Toggle Hotkey:</strong> Ctrl+Shift+D to toggle drawing mode on/off</p>
          <p>✓ <strong>Escape Key:</strong> Press Escape in overlay to dismiss and clean up</p>
        </div>
        <div className="row">
          <button type="button" onClick={() => activateToolViaHotkey("arrow")}>
            Simulate Arrow Hotkey (Ctrl+Shift+A)
          </button>
          <button type="button" onClick={() => activateToolViaHotkey("circle")}>
            Simulate Circle Hotkey (Ctrl+Shift+C)
          </button>
          <button type="button" onClick={() => activateToolViaHotkey("box")}>
            Simulate Box Hotkey (Ctrl+Shift+B)
          </button>
        </div>
        <p className="info-text" style={{ marginTop: "12px" }}>
          Click these buttons to simulate hotkey presses and verify the overlay activates
          with the correct tool selected. The mini panel also triggers overlay activation.
        </p>
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

      {/* Feature #11: Platform-Appropriate Overlay Implementation */}
      <div className="status">
        <h2>Platform Implementation (Feature #11)</h2>
        <p className="info-text">
          The overlay uses platform-appropriate APIs for Windows, macOS, and Linux to ensure
          optimal performance and visual integration with each operating system.
        </p>
        <div className="row">
          <button type="button" onClick={loadPlatformInfo}>
            Refresh Platform Info
          </button>
        </div>
        {platformInfo && (
          <div className="info-box platform-box">
            <h3>Detected Platform: <strong>{platformInfo.platform.toUpperCase()}</strong></h3>
            <p><strong>Implementation Details:</strong></p>
            <p className="platform-hints">{platformInfo.hints}</p>
            <p><strong>API:</strong> {platformInfo.overlay_implementation}</p>
          </div>
        )}
      </div>

      {/* Feature #12: Consistent Visual Styling Across Platforms */}
      <div className="status">
        <h2>Consistent Visual Styling (Feature #12)</h2>
        <p className="info-text">
          Despite platform differences, the overlay maintains consistent visual appearance
          across Windows, macOS, and Linux through platform-agnostic styling.
        </p>
        <div className="info-box">
          <p>✓ Consistent transparent overlay rendering</p>
          <p>✓ Unified shape rendering system (Canvas API)</p>
          <p>✓ Cross-platform color management</p>
          <p>✓ Platform-appropriate anti-aliasing</p>
          <p>✓ DPI-aware rendering on all platforms</p>
        </div>
        <div className="style-preview">
          <h3>Style Consistency Features:</h3>
          <ul>
            <li>Colors are standardized (RGB values)</li>
            <li>Line thickness uses pixel values independent of platform</li>
            <li>Text rendering uses system fonts but consistent sizing</li>
            <li>Shape algorithms are platform-independent</li>
          </ul>
        </div>
      </div>

      <div className="status">
        <h2>Infrastructure Status</h2>
        <ul>
          <li>✓ Tauri 2 initialized with React + TypeScript</li>
          <li>✓ IPC command handlers configured</li>
          <li>✓ Multi-window configuration (main, overlay, mini-panel)</li>
          <li>✓ Local storage connection established (Feature #1)</li>
          <li>✓ Storage utility functions created</li>
          <li>✓ Default settings configuration</li>
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
