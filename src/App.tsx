import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { loadSettings, saveSettings, DEFAULT_SETTINGS, exportSettings, importSettings, resetSettings } from "./lib/storage";
import { ArrowHeadStyle } from "./types/shapes";

/**
 * Preset color palette for drawing tools
 */
const PRESET_COLORS = [
  "#FF3B30", // Red
  "#FF9500", // Orange
  "#FFD60A", // Yellow
  "#34C759", // Green
  "#00C7BE", // Teal
  "#0A84FF", // Blue
  "#BF5AF2", // Purple
  "#FF2D55", // Pink
  "#FFFFFF", // White
  "#000000", // Black
];

type TabId = "general" | "shortcuts" | "colors" | "advanced";

/** Human-readable names for hotkey actions */
const HOTKEY_LABELS: Record<string, string> = {
  toggleDrawingMode: "Toggle Toolbar",
  arrowTool: "Arrow",
  circleTool: "Circle",
  boxTool: "Box",
  freehandTool: "Freehand",
  highlighterTool: "Highlighter",
  textTool: "Text",
};

/** macOS-style symbols for modifier/special keys */
const KEY_SYMBOLS: Record<string, string> = {
  Cmd: "⌘",
  Ctrl: "⌃",
  Shift: "⇧",
  Alt: "⌥",
  Win: "⊞",
  Space: "Space",
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  Escape: "⎋",
  Enter: "↩",
  Backspace: "⌫",
  Delete: "⌦",
  Tab: "⇥",
};

/** Render a "Ctrl+Shift+A" combo as individual keycaps */
function Keycaps({ combo }: { combo: string }) {
  return (
    <span className="st-keys">
      {combo.split("+").map((key, i) => (
        <kbd key={i} className="st-key">{KEY_SYMBOLS[key] ?? key}</kbd>
      ))}
    </span>
  );
}

/** Range slider with an accent-filled track */
function Slider({
  min, max, step, value, onChange,
}: {
  min: number; max: number; step: number; value: number;
  onChange: (value: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      className="st-slider"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseInt(e.target.value, 10))}
      style={{
        background: `linear-gradient(to right, var(--accent) ${pct}%, rgba(255,255,255,0.12) ${pct}%)`,
      }}
    />
  );
}

/** Sidebar nav icons (16x16, stroke = currentColor) */
const ICONS: Record<TabId, React.ReactNode> = {
  general: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11.3 2.2l2.5 2.5L5.5 13 2.5 13.5 3 10.5z" />
      <path d="M9.5 4l2.5 2.5" />
    </svg>
  ),
  shortcuts: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <rect x="1.75" y="4" width="12.5" height="8" rx="1.5" />
      <path d="M4.25 7h.01M7 7h.01M9.75 7h.01M12 7h.01M4.75 9.75h6.5" />
    </svg>
  ),
  colors: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <path d="M8 1.8S3.25 7.2 3.25 10.1a4.75 4.75 0 0 0 9.5 0C12.75 7.2 8 1.8 8 1.8z" />
    </svg>
  ),
  advanced: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M2 5h2.2M7.8 5H14M2 11h6.2M11.8 11H14" />
      <circle cx="6" cy="5" r="1.8" />
      <circle cx="10" cy="11" r="1.8" />
    </svg>
  ),
};

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "general", label: "Drawing" },
  { id: "shortcuts", label: "Shortcuts" },
  { id: "colors", label: "Colors" },
  { id: "advanced", label: "Advanced" },
];

function App() {
  // Active tab state
  const [activeTab, setActiveTab] = useState<TabId>("general");

  // Settings state
  const [lineThickness, setLineThickness] = useState(DEFAULT_SETTINGS.lineThickness.arrow);
  const [fontSize, setFontSize] = useState(DEFAULT_SETTINGS.fontSize);
  const [fadeDuration, setFadeDuration] = useState(DEFAULT_SETTINGS.fadeDuration);
  const [panelTransparency, setPanelTransparency] = useState(DEFAULT_SETTINGS.panelTransparency);
  const [arrowHeadStyle, setArrowHeadStyle] = useState<ArrowHeadStyle>(DEFAULT_SETTINGS.arrowHeadStyle);

  // Hotkey state
  const [hotkeys, setHotkeys] = useState<Record<string, string>>(DEFAULT_SETTINGS.hotkeys);
  const [editingHotkey, setEditingHotkey] = useState<string | null>(null);
  const [capturedHotkey, setCapturedHotkey] = useState<string>("");
  const [hotkeyConflicts, setHotkeyConflicts] = useState<Record<string, any>>({});

  // Color state
  const [currentColorForTool, setCurrentColorForTool] = useState<Record<string, string>>(DEFAULT_SETTINGS.colors);
  const [editingColorForTool, setEditingColorForTool] = useState<string | null>(null);
  const settingsColorInputRef = useRef<HTMLInputElement>(null);

  // Load settings on mount
  useEffect(() => {
    const loadAllSettings = async () => {
      try {
        const settings = await loadSettings();

        // Load line thickness (use arrow tool thickness as default)
        const thickness = typeof settings.lineThickness === 'number'
          ? settings.lineThickness
          : settings.lineThickness.arrow;
        setLineThickness(thickness);

        setFontSize(settings.fontSize);
        setFadeDuration(settings.fadeDuration);
        setPanelTransparency(settings.panelTransparency);
        setArrowHeadStyle(settings.arrowHeadStyle);
        setHotkeys(settings.hotkeys);
        setCurrentColorForTool(settings.colors);

        // Check for hotkey conflicts
        const conflictsResult = await invoke<Record<string, any>>("check_hotkey_conflicts", {
          hotkeyConfig: settings,
        });
        if (conflictsResult.has_conflicts) {
          setHotkeyConflicts(conflictsResult.conflicts);
        }
      } catch (error) {
        console.error("Failed to load settings:", error);
      }
    };
    loadAllSettings();
  }, []);

  /**
   * Handle line thickness change
   */
  const handleLineThicknessChange = async (value: number) => {
    setLineThickness(value);
    try {
      const thicknessObj = {
        arrow: value,
        circle: value,
        box: value,
        freehand: value,
        highlighter: value,
        text: value,
      };
      await saveSettings({ lineThickness: thicknessObj as any });
    } catch (error) {
      console.error("Failed to save line thickness:", error);
    }
  };

  /**
   * Handle font size change
   */
  const handleFontSizeChange = async (value: number) => {
    setFontSize(value);
    try {
      await saveSettings({ fontSize: value });
    } catch (error) {
      console.error("Failed to save font size:", error);
    }
  };

  /**
   * Handle fade duration change
   */
  const handleFadeDurationChange = async (value: number) => {
    setFadeDuration(value);
    try {
      await saveSettings({ fadeDuration: value });
    } catch (error) {
      console.error("Failed to save fade duration:", error);
    }
  };

  /**
   * Handle panel transparency change
   */
  const handlePanelTransparencyChange = async (value: number) => {
    setPanelTransparency(value);
    try {
      await saveSettings({ panelTransparency: value });
    } catch (error) {
      console.error("Failed to save panel transparency:", error);
    }
  };

  /**
   * Handle arrow head style change
   */
  const handleArrowHeadStyleChange = async (style: ArrowHeadStyle) => {
    setArrowHeadStyle(style);
    try {
      await saveSettings({ arrowHeadStyle: style });
    } catch (error) {
      console.error("Failed to save arrow head style:", error);
    }
  };

  /**
   * Helper to detect if running on macOS
   */
  const isMac = (): boolean => {
    return navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  };

  const [hotkeyError, setHotkeyError] = useState<string | null>(null);
  const hotkeyCaptureRef = useRef<HTMLDivElement>(null);

  // autoFocus is unreliable on a div — focus the capture box explicitly so
  // keystrokes register right after clicking Edit
  useEffect(() => {
    if (editingHotkey) {
      hotkeyCaptureRef.current?.focus();
    }
  }, [editingHotkey]);

  /**
   * Start editing a hotkey
   */
  const startEditingHotkey = (hotkeyName: string) => {
    setEditingHotkey(hotkeyName);
    setCapturedHotkey("");
    setHotkeyError(null);
  };

  /**
   * Cancel hotkey editing
   */
  const cancelEditingHotkey = () => {
    setEditingHotkey(null);
    setCapturedHotkey("");
  };

  /**
   * Handle keyboard input during hotkey capture
   */
  const handleHotkeyCapture = (e: React.KeyboardEvent) => {
    if (!editingHotkey) return;

    e.preventDefault();

    const keys: string[] = [];

    // Capture modifier keys
    if (e.ctrlKey) keys.push("Ctrl");
    if (e.shiftKey) keys.push("Shift");
    if (e.altKey) keys.push("Alt");
    if (e.metaKey || e.key === "Meta") keys.push(isMac() ? "Cmd" : "Win");

    // Capture the main key — but only keys the backend hotkey parser
    // supports (A-Z, 0-9, F1-F12 and the named keys below). Accepting
    // anything else would save a binding that can never register.
    const SUPPORTED_NAMED_KEYS = [
      "Space", "Enter", "Tab", "Escape", "Backspace", "Delete", "Insert",
      "Home", "End", "PageUp", "PageDown",
      "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown",
      "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",
    ];
    const mainKey = e.key === " " ? "Space" : e.key;
    if (!["Control", "Shift", "Alt", "Meta"].includes(mainKey)) {
      if (mainKey.length === 1 && /[a-zA-Z0-9]/.test(mainKey)) {
        keys.push(mainKey.toUpperCase());
      } else if (SUPPORTED_NAMED_KEYS.includes(mainKey)) {
        keys.push(mainKey);
      }
    }

    // Format as hotkey string
    if (keys.length >= 2) {
      const hotkeyString = keys.join("+");
      setCapturedHotkey(hotkeyString);
    }
  };

  /**
   * Save the edited hotkey
   */
  const saveHotkey = async () => {
    if (!editingHotkey || !capturedHotkey) return;

    const updatedHotkeys = {
      ...hotkeys,
      [editingHotkey]: capturedHotkey,
    };

    try {
      // Register FIRST: if the combo can't be registered (unparseable,
      // duplicate, taken by another app), nothing is persisted and the
      // previous bindings come back. Persisting a dead toggle binding would
      // leave the app unreachable (no Dock icon, windows start hidden).
      const settings = { ...(await loadSettings()), hotkeys: updatedHotkeys };
      await invoke("register_hotkeys", { hotkeyConfig: settings });

      setHotkeys(updatedHotkeys);
      setHotkeyError(null);
      await saveSettings({ hotkeys: updatedHotkeys as any });

      // Check for conflicts
      const conflictsResult = await invoke<Record<string, any>>("check_hotkey_conflicts", {
        hotkeyConfig: settings,
      });

      if (conflictsResult.has_conflicts) {
        setHotkeyConflicts(conflictsResult.conflicts);
      } else {
        setHotkeyConflicts({});
      }

      cancelEditingHotkey();
    } catch (error) {
      console.error("Failed to save hotkey:", error);
      setHotkeyError(String(error));
      // Restore the previous working bindings
      try {
        const previous = await loadSettings();
        await invoke("register_hotkeys", { hotkeyConfig: previous });
      } catch (restoreError) {
        console.error("Failed to restore previous hotkeys:", restoreError);
      }
      cancelEditingHotkey();
    }
  };

  /**
   * Handle tool color selection from preset
   */
  const handleSettingsColorSelect = async (tool: string, color: string) => {
    try {
      const updatedColors = {
        ...currentColorForTool,
        [tool]: color,
      };
      setCurrentColorForTool(updatedColors);

      await saveSettings({ colors: updatedColors as any });
      setEditingColorForTool(null);
    } catch (error) {
      console.error("Failed to save color:", error);
    }
  };

  /**
   * Open custom color picker for a tool
   */
  const openSettingsColorPicker = (tool: string) => {
    setEditingColorForTool(tool);
    settingsColorInputRef.current?.click();
  };

  /**
   * Handle custom color input change
   */
  const handleSettingsCustomColorChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const color = e.target.value;

    // Validate hex color format
    const hexColorRegex = /^#([0-9A-F]{3}){1,2}$/i;
    if (!hexColorRegex.test(color)) {
      console.warn("Invalid hex color format:", color);
      return;
    }

    if (editingColorForTool) {
      await handleSettingsColorSelect(editingColorForTool, color);
    }
  };

  /**
   * Reset all settings to defaults
   */
  const handleResetSettings = async () => {
    try {
      const confirmed = window.confirm(
        "Are you sure you want to reset all settings to their default values? This action cannot be undone."
      );

      if (!confirmed) return;

      await resetSettings();

      // Reload settings
      const reloadedSettings = await loadSettings();
      const thickness = typeof reloadedSettings.lineThickness === 'number'
        ? reloadedSettings.lineThickness
        : reloadedSettings.lineThickness.arrow;

      setLineThickness(thickness);
      setFontSize(reloadedSettings.fontSize);
      setFadeDuration(reloadedSettings.fadeDuration);
      setPanelTransparency(reloadedSettings.panelTransparency);
      setArrowHeadStyle(reloadedSettings.arrowHeadStyle);
      setHotkeys(reloadedSettings.hotkeys);
      setCurrentColorForTool(reloadedSettings.colors);
      setHotkeyConflicts({});

      // Re-register hotkeys
      await invoke("register_hotkeys", { hotkeyConfig: reloadedSettings });

      alert("Settings have been reset to defaults!");
    } catch (error) {
      console.error("Failed to reset settings:", error);
      alert("Failed to reset settings. Please try again.");
    }
  };

  /**
   * Export settings to JSON file
   */
  const handleExportSettings = async () => {
    try {
      await exportSettings();
      alert("Settings exported successfully!");
    } catch (error) {
      console.error("Failed to export settings:", error);
      alert("Failed to export settings. Please try again.");
    }
  };

  /**
   * Import settings from JSON file
   */
  const handleImportSettings = async () => {
    try {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/json";

      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;

        try {
          const imported = await importSettings(file);

          // Update state with imported settings
          const thickness = typeof imported.lineThickness === 'number'
            ? imported.lineThickness
            : imported.lineThickness.arrow;

          setLineThickness(thickness);
          setFontSize(imported.fontSize);
          setFadeDuration(imported.fadeDuration);
          setPanelTransparency(imported.panelTransparency);
          setArrowHeadStyle(imported.arrowHeadStyle);
          setHotkeys(imported.hotkeys);
          setCurrentColorForTool(imported.colors);

          // Re-register hotkeys
          await invoke("register_hotkeys", { hotkeyConfig: imported });

          alert("Settings imported successfully!");
        } catch (error) {
          console.error("Failed to import settings:", error);
          alert("Failed to import settings. Please check the file format.");
        }
      };

      input.click();
    } catch (error) {
      console.error("Failed to import settings:", error);
      alert("Failed to import settings. Please try again.");
    }
  };

  const conflictEntries = Object.entries(hotkeyConflicts).filter(([, info]: [string, any]) => info.conflict);

  return (
    <div className="st-app">
      <style>{CSS}</style>

      {/* Sidebar navigation */}
      <aside className="st-sidebar">
        <div className="st-brand">
          <span className="st-brand-dot" />
          <span className="st-brand-name">Annotatr</span>
        </div>

        <nav className="st-nav">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`st-nav-item${activeTab === tab.id ? " active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {ICONS[tab.id]}
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        <div className="st-sidebar-foot">Changes save automatically</div>
      </aside>

      {/* Content pane */}
      <main className="st-content">
        {/* Drawing (General) */}
        {activeTab === "general" && (
          <div className="st-page" key="general">
            <h1 className="st-page-title">Drawing</h1>

            <div className="st-card">
              <div className="st-row">
                <div>
                  <div className="st-row-label">Line thickness</div>
                  <div className="st-row-sub">Stroke width for all tools</div>
                </div>
                <div className="st-slider-wrap">
                  <span
                    className="st-dot-preview"
                    style={{
                      width: Math.min(lineThickness, 26),
                      height: Math.min(lineThickness, 26),
                      backgroundColor: currentColorForTool.arrow || "#FF3B30",
                    }}
                  />
                  <Slider min={1} max={50} step={1} value={lineThickness} onChange={handleLineThicknessChange} />
                  <span className="st-value">{lineThickness}px</span>
                </div>
              </div>

              <div className="st-row">
                <div>
                  <div className="st-row-label">Font size</div>
                  <div className="st-row-sub">Text tool annotations</div>
                </div>
                <div className="st-slider-wrap">
                  <Slider min={8} max={72} step={1} value={fontSize} onChange={handleFontSizeChange} />
                  <span className="st-value">{fontSize}pt</span>
                </div>
              </div>

              <div className="st-row">
                <div>
                  <div className="st-row-label">Fade duration</div>
                  <div className="st-row-sub">How long shapes stay on screen</div>
                </div>
                <div className="st-slider-wrap">
                  <Slider min={1} max={60} step={1} value={fadeDuration} onChange={handleFadeDurationChange} />
                  <span className="st-value">{fadeDuration}s</span>
                </div>
              </div>

              <div className="st-row">
                <div>
                  <div className="st-row-label">Toolbar opacity</div>
                  <div className="st-row-sub">Background of the floating strip</div>
                </div>
                <div className="st-slider-wrap">
                  <Slider
                    min={0}
                    max={100}
                    step={5}
                    value={Math.round(panelTransparency * 100)}
                    onChange={(v) => handlePanelTransparencyChange(v / 100)}
                  />
                  <span className="st-value">{Math.round(panelTransparency * 100)}%</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Shortcuts */}
        {activeTab === "shortcuts" && (
          <div className="st-page" key="shortcuts">
            <h1 className="st-page-title">Shortcuts</h1>

            {hotkeyError && (
              <div className="st-callout error">
                <strong>Hotkey not saved.</strong> {hotkeyError} Your previous binding is still active.
              </div>
            )}

            {conflictEntries.length > 0 && (
              <div className="st-callout warn">
                <strong>Possible system conflicts:</strong>{" "}
                {conflictEntries.map(([name, info]: [string, any], i) => (
                  <span key={name}>
                    {i > 0 && ", "}
                    {HOTKEY_LABELS[name] ?? name} ({info.hotkey}) is used for “{info.system_function}”
                  </span>
                ))}
              </div>
            )}

            <div className="st-card">
              {Object.entries(hotkeys).map(([hotkeyName, hotkeyValue]: [string, string]) => (
                <div key={hotkeyName} className="st-row">
                  <div className="st-row-label">{HOTKEY_LABELS[hotkeyName] ?? hotkeyName}</div>

                  {editingHotkey === hotkeyName ? (
                    <div
                      ref={hotkeyCaptureRef}
                      className="st-capture-wrap"
                      tabIndex={0}
                      onKeyDown={handleHotkeyCapture}
                    >
                      {capturedHotkey ? (
                        <span className="st-capture captured"><Keycaps combo={capturedHotkey} /></span>
                      ) : (
                        <span className="st-capture">Press keys…</span>
                      )}
                      <button
                        type="button"
                        className="st-btn st-btn-icon confirm"
                        onClick={saveHotkey}
                        disabled={!capturedHotkey}
                        title="Save"
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        className="st-btn st-btn-icon"
                        onClick={cancelEditingHotkey}
                        title="Cancel"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="st-hotkey-display">
                      <Keycaps combo={hotkeyValue} />
                      <button
                        type="button"
                        className="st-btn"
                        onClick={() => startEditingHotkey(hotkeyName)}
                      >
                        Edit
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <p className="st-hint">Click Edit, then press the new key combination.</p>
          </div>
        )}

        {/* Colors */}
        {activeTab === "colors" && (
          <div className="st-page" key="colors">
            <h1 className="st-page-title">Tool Colors</h1>

            <div className="st-card">
              {Object.entries(currentColorForTool).map(([tool, color]: [string, string]) => (
                <div key={tool} className="st-row">
                  <div className="st-color-name">
                    <span className="st-tip" style={{ backgroundColor: color }} />
                    <span style={{ textTransform: "capitalize" }}>{tool}</span>
                  </div>

                  <div className="st-swatches">
                    {PRESET_COLORS.slice(0, 7).map((presetColor) => (
                      <button
                        key={presetColor}
                        type="button"
                        className={`st-swatch${color.toUpperCase() === presetColor.toUpperCase() ? " selected" : ""}`}
                        style={{ backgroundColor: presetColor }}
                        onClick={() => handleSettingsColorSelect(tool, presetColor)}
                        title={presetColor}
                      />
                    ))}
                    <button
                      type="button"
                      className="st-swatch st-swatch-custom"
                      onClick={() => openSettingsColorPicker(tool)}
                      title="Custom color"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Advanced */}
        {activeTab === "advanced" && (
          <div className="st-page" key="advanced">
            <h1 className="st-page-title">Advanced</h1>

            <div className="st-card">
              <div className="st-row">
                <div>
                  <div className="st-row-label">Arrow head</div>
                  <div className="st-row-sub">Style of the arrow tool tip</div>
                </div>
                <div className="st-seg">
                  {Object.values(ArrowHeadStyle).map((style) => (
                    <button
                      key={style}
                      type="button"
                      className={arrowHeadStyle === style ? "active" : ""}
                      onClick={() => handleArrowHeadStyleChange(style)}
                    >
                      {style === ArrowHeadStyle.FILLED && "Filled"}
                      {style === ArrowHeadStyle.OPEN && "Open"}
                      {style === ArrowHeadStyle.DOUBLE_HEADED && "Double"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="st-row">
                <div>
                  <div className="st-row-label">Settings file</div>
                  <div className="st-row-sub">Back up or move your configuration</div>
                </div>
                <div className="st-btn-group">
                  <button type="button" className="st-btn" onClick={handleExportSettings}>Export…</button>
                  <button type="button" className="st-btn" onClick={handleImportSettings}>Import…</button>
                </div>
              </div>

              <div className="st-row">
                <div>
                  <div className="st-row-label">Reset</div>
                  <div className="st-row-sub">Restore every setting to its default</div>
                </div>
                <button type="button" className="st-btn st-btn-danger" onClick={handleResetSettings}>
                  Reset to Defaults
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Hidden color input */}
      <input
        ref={settingsColorInputRef}
        type="color"
        onChange={handleSettingsCustomColorChange}
        className="st-hidden-input"
        value={currentColorForTool[editingColorForTool || "arrow"] || "#FF3B30"}
      />
    </div>
  );
}

const CSS = `
:root {
  --bg-sidebar: #161618;
  --bg-content: #1f1f22;
  --card: rgba(255, 255, 255, 0.045);
  --hairline: rgba(255, 255, 255, 0.08);
  --hairline-faint: rgba(255, 255, 255, 0.055);
  --text: #f4f4f5;
  --text-dim: rgba(235, 235, 245, 0.55);
  --text-faint: rgba(235, 235, 245, 0.32);
  --accent: #ff453a;
  --mono: ui-monospace, "SF Mono", Menlo, monospace;
}

html, body, #root {
  height: 100%;
  width: 100%;
  margin: 0;
  padding: 0;
  min-width: 0;
  min-height: 0;
  display: block;
  background: var(--bg-content);
  overflow: hidden;
}

*, *::before, *::after { box-sizing: border-box; }

.st-app {
  display: flex;
  height: 100vh;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
  font-size: 13px;
  color: var(--text);
  -webkit-font-smoothing: antialiased;
  user-select: none;
  cursor: default;
}

/* ---- Sidebar ---- */
.st-sidebar {
  width: 168px;
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 1px;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--hairline);
  padding: 14px 10px 12px;
}

.st-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 8px 14px;
}

.st-brand-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 10px rgba(255, 69, 58, 0.7);
}

.st-brand-name {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.2px;
}

.st-nav { display: flex; flex-direction: column; gap: 2px; }

.st-nav-item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 7px 10px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--text-dim);
  font: inherit;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}

.st-nav-item svg { flex: none; opacity: 0.85; }
.st-nav-item:hover { background: rgba(255, 255, 255, 0.05); color: var(--text); }
.st-nav-item.active { background: var(--accent); color: #fff; }
.st-nav-item.active svg { opacity: 1; }

.st-sidebar-foot {
  margin-top: auto;
  padding: 8px 10px 0;
  font-size: 11px;
  color: var(--text-faint);
}

/* ---- Content ---- */
.st-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px 22px 26px;
}

.st-content::-webkit-scrollbar { width: 8px; }
.st-content::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.14); border-radius: 4px; }
.st-content::-webkit-scrollbar-track { background: transparent; }

.st-page { animation: st-in 0.18s ease-out; }

@keyframes st-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.st-page-title {
  margin: 2px 0 14px;
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.2px;
  color: var(--text);
}

/* ---- Cards & rows ---- */
.st-card {
  background: var(--card);
  border: 1px solid var(--hairline);
  border-radius: 10px;
  overflow: hidden;
}

.st-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;
  min-height: 52px;
}

.st-row + .st-row { border-top: 1px solid var(--hairline-faint); }

.st-row-label { font-weight: 500; }
.st-row-sub { margin-top: 2px; font-size: 11px; color: var(--text-dim); }

.st-hint { margin: 12px 2px 0; font-size: 11px; color: var(--text-faint); }

/* ---- Sliders ---- */
.st-slider-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  max-width: 280px;
  justify-content: flex-end;
}

.st-slider {
  -webkit-appearance: none;
  appearance: none;
  flex: 1;
  min-width: 110px;
  height: 4px;
  padding: 0;
  border: none;
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}

.st-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  border: none;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5), 0 0 0 0.5px rgba(0, 0, 0, 0.15);
  transition: transform 0.1s;
}

.st-slider::-webkit-slider-thumb:active { transform: scale(1.12); }

.st-value {
  font-family: var(--mono);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  background: rgba(255, 255, 255, 0.07);
  border-radius: 5px;
  padding: 3px 6px;
  min-width: 42px;
  text-align: center;
  color: var(--text);
  flex: none;
}

.st-dot-preview {
  flex: none;
  border-radius: 50%;
  transition: width 0.1s, height 0.1s;
  box-shadow: 0 0 6px rgba(0, 0, 0, 0.4);
}

/* ---- Keycaps & hotkeys ---- */
.st-keys { display: inline-flex; gap: 4px; }

.st-key {
  font-family: var(--mono);
  font-size: 11px;
  line-height: 1;
  padding: 4px 6px;
  min-width: 22px;
  text-align: center;
  color: var(--text);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.13), rgba(255, 255, 255, 0.06));
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 5px;
  box-shadow: 0 1.5px 0 rgba(0, 0, 0, 0.45);
}

.st-hotkey-display, .st-capture-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.st-capture-wrap { outline: none; }

.st-capture {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--text-dim);
  padding: 5px 10px;
  border: 1px dashed rgba(255, 69, 58, 0.55);
  border-radius: 6px;
  min-width: 96px;
  text-align: center;
  animation: st-pulse 1.2s ease-in-out infinite;
}

.st-capture.captured {
  border-style: solid;
  border-color: rgba(48, 209, 88, 0.6);
  animation: none;
}

@keyframes st-pulse {
  50% { border-color: rgba(255, 69, 58, 0.2); }
}

/* ---- Buttons ---- */
.st-btn {
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  color: var(--text);
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid var(--hairline);
  border-radius: 6px;
  padding: 5px 11px;
  cursor: pointer;
  transition: background 0.12s;
}

.st-btn:hover { background: rgba(255, 255, 255, 0.11); }
.st-btn:disabled { opacity: 0.4; cursor: default; }

.st-btn-icon {
  width: 26px;
  height: 26px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}

.st-btn-icon.confirm:not(:disabled) {
  background: rgba(48, 209, 88, 0.18);
  border-color: rgba(48, 209, 88, 0.4);
  color: #30d158;
}

.st-btn-danger {
  color: #ff6b61;
  border-color: rgba(255, 69, 58, 0.4);
  background: rgba(255, 69, 58, 0.09);
}

.st-btn-danger:hover { background: rgba(255, 69, 58, 0.16); }

.st-btn-group { display: flex; gap: 8px; }

/* ---- Callouts ---- */
.st-callout {
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.45;
  margin-bottom: 14px;
}

.st-callout.warn {
  background: rgba(255, 214, 10, 0.07);
  border: 1px solid rgba(255, 214, 10, 0.25);
  color: #f2d35e;
}

.st-callout.error {
  background: rgba(255, 69, 58, 0.08);
  border: 1px solid rgba(255, 69, 58, 0.3);
  color: #ff9489;
}

/* ---- Colors tab ---- */
.st-color-name {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 500;
}

.st-tip {
  width: 22px;
  height: 22px;
  border-radius: 7px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background-image: linear-gradient(145deg, rgba(255, 255, 255, 0.25), rgba(0, 0, 0, 0.15));
  background-blend-mode: overlay;
}

.st-swatches { display: flex; gap: 6px; align-items: center; }

.st-swatch {
  width: 20px;
  height: 20px;
  padding: 0;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.18);
  cursor: pointer;
  transition: transform 0.1s;
}

.st-swatch:hover { transform: scale(1.15); }

.st-swatch.selected {
  box-shadow: 0 0 0 2px var(--bg-content), 0 0 0 4px rgba(255, 255, 255, 0.85);
}

.st-swatch-custom {
  background: conic-gradient(#ff453a, #ffd60a, #34c759, #0a84ff, #bf5af2, #ff453a);
}

/* ---- Segmented control ---- */
.st-seg {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--hairline);
  border-radius: 8px;
}

.st-seg button {
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-dim);
  background: transparent;
  border: none;
  border-radius: 6px;
  padding: 4px 12px;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}

.st-seg button:hover { color: var(--text); }

.st-seg button.active {
  background: rgba(255, 255, 255, 0.14);
  color: var(--text);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

.st-hidden-input {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}
`;

export default App;
