import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { loadSettings, saveSettings, DEFAULT_SETTINGS, exportSettings, importSettings, resetSettings } from "./lib/storage";
import { ArrowHeadStyle } from "./types/shapes";

/**
 * Preset color palette for drawing tools
 */
const PRESET_COLORS = [
  "#FF0000", // Red
  "#FF8C00", // Dark Orange
  "#FFD700", // Gold
  "#00FF00", // Lime
  "#008000", // Green
  "#00FFFF", // Cyan
  "#0000FF", // Blue
  "#800080", // Purple
  "#FF00FF", // Magenta
  "#000000", // Black
  "#FFFFFF", // White
  "#808080", // Gray
];

/**
 * Settings tabs definition
 */
const SETTINGS_TABS = [
  { id: "general", label: "General", icon: "⚙️" },
  { id: "shortcuts", label: "Shortcuts", icon: "⌨️" },
  { id: "colors", label: "Colors", icon: "🎨" },
  { id: "advanced", label: "Advanced", icon: "🔧" },
];

type TabId = "general" | "shortcuts" | "colors" | "advanced";

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
   * Hide the settings window
   */
  const hideWindow = async () => {
    try {
      await invoke("hide_main_window");
    } catch (error) {
      console.error("Failed to hide window:", error);
    }
  };

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

  /**
   * Start editing a hotkey
   */
  const startEditingHotkey = (hotkeyName: string) => {
    setEditingHotkey(hotkeyName);
    setCapturedHotkey("");
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

    // Capture the main key
    const mainKey = e.key;
    if (
      !["Control", "Shift", "Alt", "Meta"].includes(mainKey) &&
      mainKey.length === 1
    ) {
      keys.push(mainKey.toUpperCase());
    } else if (
      !["Control", "Shift", "Alt", "Meta"].includes(mainKey) &&
      mainKey.length > 1
    ) {
      keys.push(mainKey);
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

    try {
      const updatedHotkeys = {
        ...hotkeys,
        [editingHotkey]: capturedHotkey,
      };
      setHotkeys(updatedHotkeys);

      await saveSettings({ hotkeys: updatedHotkeys as any });

      // Re-register hotkeys
      const settings = await loadSettings();
      await invoke("register_hotkeys", { hotkeyConfig: settings });

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

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>Annotatr Settings</h1>
        <button
          type="button"
          onClick={hideWindow}
          style={styles.closeButton}
          title="Close settings"
        >
          ×
        </button>
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        {SETTINGS_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as TabId)}
            style={{
              ...styles.tab,
              ...(activeTab === tab.id ? styles.tabActive : {}),
            }}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={styles.content}>
        {/* General Tab */}
        {activeTab === "general" && (
          <div style={styles.tabContent}>
            <h2 style={styles.sectionTitle}>Drawing Settings</h2>

            {/* Line Thickness */}
            <div style={styles.settingRow}>
              <label style={styles.label}>Line Thickness</label>
              <div style={styles.sliderContainer}>
                <span style={styles.sliderValue}>{lineThickness}px</span>
                <input
                  type="range"
                  min="1"
                  max="50"
                  step="1"
                  value={lineThickness}
                  onChange={(e) => handleLineThicknessChange(parseInt(e.target.value, 10))}
                  style={styles.slider}
                />
              </div>
            </div>

            {/* Font Size */}
            <div style={styles.settingRow}>
              <label style={styles.label}>Font Size</label>
              <div style={styles.sliderContainer}>
                <span style={styles.sliderValue}>{fontSize}pt</span>
                <input
                  type="range"
                  min="8"
                  max="72"
                  step="1"
                  value={fontSize}
                  onChange={(e) => handleFontSizeChange(parseInt(e.target.value, 10))}
                  style={styles.slider}
                />
              </div>
            </div>

            {/* Fade Duration */}
            <div style={styles.settingRow}>
              <label style={styles.label}>Fade Duration</label>
              <div style={styles.sliderContainer}>
                <span style={styles.sliderValue}>{fadeDuration}s</span>
                <input
                  type="range"
                  min="1"
                  max="60"
                  step="1"
                  value={fadeDuration}
                  onChange={(e) => handleFadeDurationChange(parseInt(e.target.value, 10))}
                  style={styles.slider}
                />
              </div>
            </div>

            {/* Panel Transparency */}
            <div style={styles.settingRow}>
              <label style={styles.label}>Panel Transparency</label>
              <div style={styles.sliderContainer}>
                <span style={styles.sliderValue}>{Math.round(panelTransparency * 100)}%</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={Math.round(panelTransparency * 100)}
                  onChange={(e) => handlePanelTransparencyChange(parseInt(e.target.value, 10) / 100)}
                  style={styles.slider}
                />
              </div>
            </div>

            <p style={styles.hint}>
              💡 Changes are saved automatically. Use the Mini Panel for quick adjustments while drawing.
            </p>
          </div>
        )}

        {/* Shortcuts Tab */}
        {activeTab === "shortcuts" && (
          <div style={styles.tabContent}>
            <h2 style={styles.sectionTitle}>Keyboard Shortcuts</h2>

            {/* Conflict Warnings */}
            {Object.keys(hotkeyConflicts).length > 0 && (
              <div style={styles.warningBox}>
                <h3 style={styles.warningTitle}>⚠️ Hotkey Conflicts Detected</h3>
                <p style={styles.warningText}>
                  The following hotkeys may conflict with system shortcuts:
                </p>
                <ul style={styles.warningList}>
                  {Object.entries(hotkeyConflicts).map(
                    ([hotkeyName, info]: [string, any]) =>
                      info.conflict && (
                        <li key={hotkeyName}>
                          <strong>{hotkeyName} ({info.hotkey})</strong>
                          : Used by system for "{info.system_function}"
                        </li>
                      )
                  )}
                </ul>
              </div>
            )}

            {/* Hotkey List */}
            <div style={styles.hotkeyList}>
              {Object.entries(hotkeys).map(([hotkeyName, hotkeyValue]: [string, string]) => (
                <div key={hotkeyName} style={styles.hotkeyItem}>
                  <span style={styles.hotkeyName}>
                    {hotkeyName
                      .replace(/([A-Z])/g, " $1")
                      .replace(/^./, (str) => str.toUpperCase())
                      .trim()}
                  </span>
                  {editingHotkey === hotkeyName ? (
                    <div style={styles.hotkeyEditContainer} tabIndex={0} onKeyDown={handleHotkeyCapture} autoFocus>
                      <code style={{
                        ...styles.hotkeyValue,
                        backgroundColor: capturedHotkey ? "#10b981" : "#fef3c7",
                        color: capturedHotkey ? "white" : "#333",
                      }}>
                        {capturedHotkey || "Press keys..."}
                      </code>
                      <button
                        type="button"
                        onClick={saveHotkey}
                        disabled={!capturedHotkey}
                        style={{
                          ...styles.iconButton,
                          backgroundColor: capturedHotkey ? "#10b981" : "#d1d5db",
                        }}
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        onClick={cancelEditingHotkey}
                        style={{...styles.iconButton, backgroundColor: "#ef4444"}}
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div style={styles.hotkeyDisplayContainer}>
                      <code style={styles.hotkeyValue}>{hotkeyValue}</code>
                      <button
                        type="button"
                        onClick={() => startEditingHotkey(hotkeyName)}
                        style={styles.editButton}
                      >
                        Edit
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <p style={styles.hint}>
              💡 Click "Edit" then press your desired key combination to change a hotkey.
            </p>
          </div>
        )}

        {/* Colors Tab */}
        {activeTab === "colors" && (
          <div style={styles.tabContent}>
            <h2 style={styles.sectionTitle}>Default Tool Colors</h2>

            <div style={styles.colorList}>
              {Object.entries(currentColorForTool).map(([tool, color]: [string, string]) => (
                <div key={tool} style={styles.colorItem}>
                  <div style={styles.colorLabel}>
                    <span
                      style={{
                        ...styles.colorPreview,
                        backgroundColor: color,
                      }}
                    />
                    <span style={{ textTransform: "capitalize" }}>{tool}</span>
                  </div>

                  <div style={styles.colorPicker}>
                    {PRESET_COLORS.slice(0, 6).map((presetColor) => (
                      <button
                        key={presetColor}
                        type="button"
                        onClick={() => handleSettingsColorSelect(tool, presetColor)}
                        style={{
                          ...styles.presetColorButton,
                          backgroundColor: presetColor,
                          border: color === presetColor ? "2px solid #2563eb" : "1px solid #ccc",
                        }}
                        title={`Set ${tool} color to ${presetColor}`}
                      />
                    ))}
                    <button
                      type="button"
                      onClick={() => openSettingsColorPicker(tool)}
                      style={styles.customColorButton}
                      title={`Select custom color for ${tool}`}
                    />
                  </div>
                </div>
              ))}
            </div>

            <p style={styles.hint}>
              💡 Click a preset color or the rainbow button to choose custom colors for each tool.
            </p>
          </div>
        )}

        {/* Advanced Tab */}
        {activeTab === "advanced" && (
          <div style={styles.tabContent}>
            <h2 style={styles.sectionTitle}>Advanced Settings</h2>

            {/* Arrow Head Style */}
            <div style={styles.advancedSection}>
              <h3 style={styles.advancedSectionTitle}>Arrow Head Style</h3>
              <div style={styles.radioGroup}>
                {Object.values(ArrowHeadStyle).map((style) => (
                  <label key={style} style={styles.radioLabel}>
                    <input
                      type="radio"
                      name="arrowHeadStyle"
                      value={style}
                      checked={arrowHeadStyle === style}
                      onChange={() => handleArrowHeadStyleChange(style)}
                      style={styles.radioInput}
                    />
                    <span>
                      {style === ArrowHeadStyle.FILLED && "Filled (solid triangle)"}
                      {style === ArrowHeadStyle.OPEN && "Open (outline only)"}
                      {style === ArrowHeadStyle.DOUBLE_HEADED && "Double-headed (both ends)"}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Import/Export */}
            <div style={styles.advancedSection}>
              <h3 style={styles.advancedSectionTitle}>Settings Management</h3>
              <div style={styles.buttonGroup}>
                <button
                  type="button"
                  onClick={handleExportSettings}
                  style={styles.actionButton}
                >
                  Export Settings
                </button>
                <button
                  type="button"
                  onClick={handleImportSettings}
                  style={styles.actionButton}
                >
                  Import Settings
                </button>
              </div>
            </div>

            {/* Reset */}
            <div style={styles.advancedSection}>
              <h3 style={styles.advancedSectionTitle}>Reset</h3>
              <button
                type="button"
                onClick={handleResetSettings}
                style={styles.resetButton}
              >
                Reset to Defaults
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        <span style={styles.footerText}>Changes are saved automatically</span>
      </div>

      {/* Hidden color input */}
      <input
        ref={settingsColorInputRef}
        type="color"
        onChange={handleSettingsCustomColorChange}
        style={styles.hiddenInput}
        value={currentColorForTool[editingColorForTool || "arrow"] || "#FF0000"}
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    backgroundColor: "#f9fafb",
    fontFamily: "Inter, system-ui, -apple-system, sans-serif",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 24px",
    backgroundColor: "white",
    borderBottom: "1px solid #e5e7eb",
  },
  title: {
    margin: 0,
    fontSize: "20px",
    fontWeight: "600",
    color: "#111827",
  },
  closeButton: {
    background: "none",
    border: "none",
    fontSize: "28px",
    cursor: "pointer",
    color: "#6b7280",
    padding: "0",
    width: "32px",
    height: "32px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "4px",
    transition: "background 0.15s",
  },
  tabs: {
    display: "flex",
    backgroundColor: "white",
    borderBottom: "1px solid #e5e7eb",
    padding: "0 24px",
  },
  tab: {
    padding: "12px 16px",
    backgroundColor: "transparent",
    color: "#6b7280",
    border: "none",
    borderRadius: "6px 6px 0 0",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "500",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    transition: "all 0.15s",
    marginBottom: "-1px",
  },
  tabActive: {
    backgroundColor: "#f9fafb",
    color: "#2563eb",
    borderBottom: "2px solid #2563eb",
  },
  content: {
    flex: 1,
    overflow: "auto",
    padding: "24px",
  },
  tabContent: {
    maxWidth: "600px",
  },
  sectionTitle: {
    fontSize: "18px",
    fontWeight: "600",
    color: "#111827",
    marginBottom: "20px",
  },
  settingRow: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    marginBottom: "20px",
    padding: "16px",
    backgroundColor: "white",
    borderRadius: "8px",
    border: "1px solid #e5e7eb",
  },
  label: {
    fontSize: "14px",
    fontWeight: "500",
    color: "#374151",
  },
  sliderContainer: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  sliderValue: {
    fontSize: "13px",
    fontWeight: "600",
    color: "#2563eb",
    minWidth: "50px",
    textAlign: "right",
  },
  slider: {
    flex: 1,
    height: "6px",
    cursor: "pointer",
  },
  hint: {
    fontSize: "13px",
    color: "#6b7280",
    fontStyle: "italic",
    marginTop: "20px",
  },
  warningBox: {
    backgroundColor: "#fef3c7",
    padding: "16px",
    borderRadius: "8px",
    marginBottom: "20px",
    border: "1px solid #f59e0b",
  },
  warningTitle: {
    fontSize: "14px",
    fontWeight: "600",
    margin: "0 0 8px 0",
    color: "#92400e",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  warningText: {
    fontSize: "13px",
    margin: "0 0 12px 0",
    color: "#78350f",
  },
  warningList: {
    margin: 0,
    paddingLeft: "20px",
    fontSize: "13px",
    color: "#78350f",
  },
  hotkeyList: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  hotkeyItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px",
    backgroundColor: "white",
    borderRadius: "8px",
    border: "1px solid #e5e7eb",
  },
  hotkeyName: {
    fontWeight: "500",
    color: "#374151",
  },
  hotkeyDisplayContainer: {
    display: "flex",
    gap: "8px",
    alignItems: "center",
  },
  hotkeyEditContainer: {
    display: "flex",
    gap: "8px",
    alignItems: "center",
  },
  hotkeyValue: {
    padding: "6px 12px",
    backgroundColor: "#f3f4f6",
    borderRadius: "4px",
    minWidth: "100px",
    textAlign: "center",
    display: "inline-block",
    fontSize: "13px",
    fontFamily: "monospace",
  },
  editButton: {
    padding: "6px 12px",
    backgroundColor: "#3b82f6",
    color: "white",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: "500",
  },
  iconButton: {
    padding: "6px 10px",
    color: "white",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "12px",
  },
  colorList: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  colorItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px",
    backgroundColor: "white",
    borderRadius: "8px",
    border: "1px solid #e5e7eb",
  },
  colorLabel: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    fontWeight: "500",
    color: "#374151",
  },
  colorPreview: {
    display: "inline-block",
    width: "24px",
    height: "24px",
    border: "1px solid #ccc",
    borderRadius: "4px",
  },
  colorPicker: {
    display: "flex",
    gap: "6px",
    alignItems: "center",
  },
  presetColorButton: {
    width: "28px",
    height: "28px",
    padding: "0",
    borderRadius: "4px",
    cursor: "pointer",
    transition: "transform 0.1s",
  },
  customColorButton: {
    width: "28px",
    height: "28px",
    padding: "0",
    backgroundColor: "linear-gradient(135deg, #ff0000 0%, #00ff00 50%, #0000ff 100%)",
    border: "1px solid #999",
    borderRadius: "4px",
    cursor: "pointer",
  },
  advancedSection: {
    marginBottom: "24px",
    padding: "16px",
    backgroundColor: "white",
    borderRadius: "8px",
    border: "1px solid #e5e7eb",
  },
  advancedSectionTitle: {
    fontSize: "14px",
    fontWeight: "600",
    margin: "0 0 12px 0",
    color: "#374151",
  },
  radioGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  radioLabel: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "14px",
    cursor: "pointer",
    color: "#374151",
  },
  radioInput: {
    cursor: "pointer",
  },
  buttonGroup: {
    display: "flex",
    gap: "10px",
  },
  actionButton: {
    padding: "10px 16px",
    backgroundColor: "#3b82f6",
    color: "white",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "500",
    transition: "background 0.15s",
  },
  resetButton: {
    padding: "10px 16px",
    backgroundColor: "#dc2626",
    color: "white",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "500",
  },
  footer: {
    padding: "12px 24px",
    backgroundColor: "white",
    borderTop: "1px solid #e5e7eb",
    textAlign: "center",
  },
  footerText: {
    fontSize: "12px",
    color: "#6b7280",
  },
  hiddenInput: {
    position: "absolute",
    width: "0",
    height: "0",
    opacity: "0",
    pointerEvents: "none",
  },
};

export default App;
