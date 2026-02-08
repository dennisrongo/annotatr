import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ToolType } from "../types/shapes";
import { loadSettings, saveSettings, DEFAULT_SETTINGS, exportSettings, importSettings } from "../lib/storage";

/**
 * MiniPanel Component
 * Floating toolbar with tool selection buttons for drawing shapes
 * Feature #19: Supports drag-to-reposition including off-screen placement
 * Feature #50: Can be positioned on any monitor
 */

// Feature #44: Preset color palette for drawing tools
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

// Feature #50: Monitor info interface
interface Monitor {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scale_factor: number;
}

export default function MiniPanel() {
  const [selectedTool, setSelectedTool] = useState<ToolType | null>(null);
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const [currentMonitor, setCurrentMonitor] = useState<string>("monitor_0");
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  // Feature #44: Color picker state
  const [selectedColor, setSelectedColor] = useState<string>(DEFAULT_SETTINGS.colors.arrow);
  const [currentColorForTool, setCurrentColorForTool] = useState<Record<string, string>>({
    arrow: DEFAULT_SETTINGS.colors.arrow,
    circle: DEFAULT_SETTINGS.colors.circle,
    box: DEFAULT_SETTINGS.colors.box,
    freehand: DEFAULT_SETTINGS.colors.freehand,
    highlighter: DEFAULT_SETTINGS.colors.highlighter,
    text: DEFAULT_SETTINGS.colors.text,
  });

  // Feature #45: Custom color picker state
  const customColorInputRef = useRef<HTMLInputElement>(null);

  // Feature #81: Custom color picker for settings
  const settingsColorInputRef = useRef<HTMLInputElement>(null);
  const [editingColorForTool, setEditingColorForTool] = useState<string | null>(null);

  /**
   * Feature #88: Load tool colors from settings on mount
   * Ensures that color customizations persist across app restarts
   */
  useEffect(() => {
    const loadColors = async () => {
      try {
        const settings = await loadSettings();
        setCurrentColorForTool(settings.colors);
        setSelectedColor(settings.colors.arrow); // Update selected color to match
        console.log("Tool colors loaded from storage:", settings.colors);
      } catch (error) {
        console.error("Failed to load tool colors from storage:", error);
      }
    };
    loadColors();
  }, []);

  // Feature #46: Line thickness control state (single value for all tools - UI simplicity)
  const [lineThickness, setLineThickness] = useState(DEFAULT_SETTINGS.lineThickness.arrow);

  // Feature #47: Font size control state
  const [fontSize, setFontSize] = useState(DEFAULT_SETTINGS.fontSize);

  // Feature #70: Fade duration control state
  const [fadeDuration, setFadeDuration] = useState(DEFAULT_SETTINGS.fadeDuration);

  // Feature #126: Panel transparency control state
  const [panelTransparency, setPanelTransparency] = useState(DEFAULT_SETTINGS.panelTransparency);

  // Feature #133: Panel collapsed state
  const [panelCollapsed, setPanelCollapsed] = useState(DEFAULT_SETTINGS.panelCollapsed);

  // Feature #48: Settings modal state
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Feature #63: Hotkey conflict detection state
  const [hotkeyConflicts, setHotkeyConflicts] = useState<Record<string, any>>({});

  // Feature #64: Hotkey customization state
  const [hotkeys, setHotkeys] = useState<Record<string, string>>(DEFAULT_SETTINGS.hotkeys);
  const [editingHotkey, setEditingHotkey] = useState<string | null>(null);
  const [capturedHotkey, setCapturedHotkey] = useState<string>("");

  /**
   * Feature #52: Toggle panel minimize/hide
   * Hides the Tauri window when minimized
   */
  const toggleMinimize = async () => {
    try {
      const isVisible = await invoke<boolean>("toggle_mini_panel");
      console.log(`Panel ${isVisible ? "shown" : "hidden"}`);
    } catch (error) {
      console.error("Failed to toggle panel visibility:", error);
    }
  };

  /**
   * Feature #50: Load monitor information on mount
   * Used to detect which monitor the panel is being dragged to
   */
  useEffect(() => {
    const loadMonitors = async () => {
      try {
        const monitorList = await invoke<Monitor[]>("get_monitor_info");
        setMonitors(monitorList);
        console.log("Loaded monitor info:", monitorList);
      } catch (error) {
        console.error("Failed to load monitor info:", error);
      }
    };
    loadMonitors();
  }, []);

  /**
   * Feature #50: Helper function to detect which monitor contains a position
   */
  const detectMonitorForPosition = (x: number, y: number): string => {
    for (const monitor of monitors) {
      if (
        x >= monitor.x &&
        x < monitor.x + monitor.width &&
        y >= monitor.y &&
        y < monitor.y + monitor.height
      ) {
        return monitor.id;
      }
    }
    // Default to monitor_0 if no match found
    return "monitor_0";
  };

  /**
   * Feature #19: Restore panel position on mount
   * Loads saved position from storage (including off-screen positions)
   * Feature #50: Also restores which monitor the panel was on
   */
  useEffect(() => {
    const restorePosition = async () => {
      try {
        const result = await invoke<Record<string, any>>("restore_mini_panel_position");
        if (result && typeof result === "object") {
          const x = result.x as number;
          const y = result.y as number;
          const monitorId = result.monitor_id as string || "monitor_0";
          setPosition({ x, y });
          setCurrentMonitor(monitorId);
          console.log("Panel position restored:", { x, y, monitorId });
        }
      } catch (error) {
        console.error("Failed to restore panel position:", error);
        setPosition({ x: 20, y: 20 });
      }
    };
    restorePosition();
  }, []);

  /**
   * Feature #46: Load line thickness from settings on mount
   * Feature #106: Use arrow tool thickness as the global setting for backward compatibility
   */
  useEffect(() => {
    const loadLineThickness = async () => {
      try {
        const settings = await loadSettings();
        // Feature #106: Get arrow tool's thickness as the default thickness value
        const thickness = typeof settings.lineThickness === 'number'
          ? settings.lineThickness
          : settings.lineThickness.arrow;
        setLineThickness(thickness);
        console.log("Line thickness loaded:", thickness);
      } catch (error) {
        console.error("Failed to load line thickness:", error);
      }
    };
    loadLineThickness();
  }, []);

  /**
   * Feature #47: Load font size from settings on mount
   */
  useEffect(() => {
    const loadFontSize = async () => {
      try {
        const settings = await loadSettings();
        setFontSize(settings.fontSize);
        console.log("Font size loaded:", settings.fontSize);
      } catch (error) {
        console.error("Failed to load font size:", error);
      }
    };
    loadFontSize();
  }, []);

  /**
   * Feature #70: Load fade duration from settings on mount
   */
  useEffect(() => {
    const loadFadeDuration = async () => {
      try {
        const settings = await loadSettings();
        setFadeDuration(settings.fadeDuration);
        console.log("Fade duration loaded:", settings.fadeDuration);
      } catch (error) {
        console.error("Failed to load fade duration:", error);
      }
    };
    loadFadeDuration();
  }, []);

  /**
   * Feature #126: Load panel transparency from settings on mount
   */
  useEffect(() => {
    const loadPanelTransparency = async () => {
      try {
        const settings = await loadSettings();
        setPanelTransparency(settings.panelTransparency);
        console.log("Panel transparency loaded:", settings.panelTransparency);
      } catch (error) {
        console.error("Failed to load panel transparency:", error);
      }
    };
    loadPanelTransparency();
  }, []);

  /**
   * Feature #133: Load panel collapsed state from settings on mount
   */
  useEffect(() => {
    const loadPanelCollapsed = async () => {
      try {
        const settings = await loadSettings();
        setPanelCollapsed(settings.panelCollapsed);
        console.log("Panel collapsed state loaded:", settings.panelCollapsed);
      } catch (error) {
        console.error("Failed to load panel collapsed state:", error);
      }
    };
    loadPanelCollapsed();
  }, []);

  /**
   * Feature #56, #57, #58: Register global hotkeys on mount
   * Registers shortcuts for Arrow (Ctrl+Shift+A), Circle (Ctrl+Shift+C), Box (Ctrl+Shift+B)
   */
  useEffect(() => {
    const registerHotkeys = async () => {
      try {
        const settings = await loadSettings();
        // Register all hotkeys with the backend
        await invoke("register_hotkeys", { hotkeyConfig: settings });
        console.log("Global hotkeys registered successfully:", settings.hotkeys);
      } catch (error) {
        console.error("Failed to register global hotkeys:", error);
      }
    };
    registerHotkeys();
  }, []);

  /**
   * Feature #63: Check for hotkey conflicts with system shortcuts
   * Runs on mount and displays warnings if conflicts are detected
   */
  useEffect(() => {
    const checkConflicts = async () => {
      try {
        const settings = await loadSettings();
        const conflictsResult = await invoke<Record<string, any>>("check_hotkey_conflicts", {
          hotkeyConfig: settings,
        });

        if (conflictsResult.has_conflicts) {
          setHotkeyConflicts(conflictsResult.conflicts);
          console.warn("Hotkey conflicts detected:", conflictsResult.conflicts);

          // Display console warnings for each conflict
          Object.entries(conflictsResult.conflicts).forEach(([hotkeyName, info]: [string, any]) => {
            if (info.conflict) {
              console.warn(
                `⚠️ Hotkey conflict: "${hotkeyName}" (${info.hotkey}) conflicts with system function: ${info.system_function}`
              );
            }
          });
        }
      } catch (error) {
        console.error("Failed to check hotkey conflicts:", error);
      }
    };
    checkConflicts();
  }, []);

  /**
   * Feature #64: Load hotkeys from storage on mount
   */
  useEffect(() => {
    const loadHotkeys = async () => {
      try {
        const settings = await loadSettings();
        setHotkeys(settings.hotkeys);
      } catch (error) {
        console.error("Failed to load hotkeys:", error);
      }
    };
    loadHotkeys();
  }, []);

  /**
   * Handle tool selection
   * Feature #18: Also activate overlay when a tool is selected via mini panel
   */
  const selectTool = async (tool: ToolType) => {
    setSelectedTool(tool);

    // Update selected color to match the current tool's color
    const toolColor = currentColorForTool[tool] || selectedColor;
    setSelectedColor(toolColor);

    // Feature #18: Activate tool via hotkey command which handles overlay, drawing mode, and events
    try {
      await invoke("activate_tool_hotkey", { tool });
    } catch (error) {
      console.error("Failed to activate tool:", error);
    }

    console.log(`Selected tool: ${tool}, overlay and drawing mode activated`);
  };

  /**
   * Feature #44: Handle color selection from preset palette
   * Updates the color for the current tool and saves to settings
   */
  const selectColor = async (color: string) => {
    setSelectedColor(color);

    // If a tool is selected, update its color
    if (selectedTool) {
      const updatedColors = {
        ...currentColorForTool,
        [selectedTool]: color,
      };
      setCurrentColorForTool(updatedColors);

      // Save to persistent storage
      try {
        await saveSettings({ colors: updatedColors as any });
        console.log(`Updated ${selectedTool} color to: ${color}`);
      } catch (error) {
        console.error("Failed to save color:", error);
      }
    }
  };

  /**
   * Feature #45: Handle custom color input change
   * Validates hex color and applies it to current tool
   */
  const handleCustomColorChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const color = e.target.value;

    // Validate hex color format (#RRGGBB or #RGB)
    const hexColorRegex = /^#([0-9A-F]{3}){1,2}$/i;
    if (!hexColorRegex.test(color)) {
      console.warn("Invalid hex color format:", color);
      return;
    }

    await selectColor(color);
  };

  /**
   * Feature #45: Open custom color picker dialog
   * Triggers the hidden color input click
   */
  const openCustomColorPicker = () => {
    customColorInputRef.current?.click();
  };

  /**
   * Feature #64: Start editing a hotkey
   * Sets the hotkey into edit mode for capture
   */
  const startEditingHotkey = (hotkeyName: string) => {
    setEditingHotkey(hotkeyName);
    setCapturedHotkey("");
  };

  /**
   * Feature #64: Cancel hotkey editing
   */
  const cancelEditingHotkey = () => {
    setEditingHotkey(null);
    setCapturedHotkey("");
  };

  /**
   * Feature #64: Handle keyboard input during hotkey capture
   * Captures the key combination and formats it as a hotkey string
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
      // Handle special keys like F1, Escape, etc.
      keys.push(mainKey);
    }

    // Format as hotkey string (e.g., "Ctrl+Shift+A")
    if (keys.length >= 2) {
      const hotkeyString = keys.join("+");
      setCapturedHotkey(hotkeyString);
    }
  };

  /**
   * Feature #64: Helper to detect if running on macOS
   */
  const isMac = (): boolean => {
    return navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  };

  /**
   * Feature #64: Save the edited hotkey
   * Validates the hotkey, checks for conflicts, and saves to storage
   */
  const saveHotkey = async () => {
    if (!editingHotkey || !capturedHotkey) return;

    try {
      // Update local state
      const updatedHotkeys = {
        ...hotkeys,
        [editingHotkey]: capturedHotkey,
      };
      setHotkeys(updatedHotkeys);

      // Save to persistent storage
      await saveSettings({ hotkeys: updatedHotkeys as any });
      console.log(`Updated hotkey ${editingHotkey} to: ${capturedHotkey}`);

      // Re-register hotkeys with the new configuration
      const settings = await loadSettings();
      await invoke("register_hotkeys", { hotkeyConfig: settings });
      console.log("Hotkeys re-registered with new configuration");

      // Check for conflicts with the new hotkey
      const conflictsResult = await invoke<Record<string, any>>("check_hotkey_conflicts", {
        hotkeyConfig: settings,
      });

      if (conflictsResult.has_conflicts) {
        setHotkeyConflicts(conflictsResult.conflicts);
        console.warn("Hotkey conflicts detected after update:", conflictsResult.conflicts);
      } else {
        // Clear conflicts if no conflicts exist
        setHotkeyConflicts({});
      }

      // Exit edit mode
      cancelEditingHotkey();
    } catch (error) {
      console.error("Failed to save hotkey:", error);
    }
  };

  /**
   * Feature #46: Handle line thickness change
   * Feature #106: Updates all tools' line thickness uniformly (global control)
   */
  const handleLineThicknessChange = async (value: number) => {
    setLineThickness(value);

    // Save to persistent storage - update all tools' thickness
    try {
      // Feature #106: Save line thickness for all tools
      const thicknessObj = {
        arrow: value,
        circle: value,
        box: value,
        freehand: value,
        highlighter: value,
        text: value,
      };
      await saveSettings({ lineThickness: thicknessObj as any });
      console.log(`Line thickness updated for all tools to: ${value}`);
    } catch (error) {
      console.error("Failed to save line thickness:", error);
    }
  };

  /**
   * Feature #47: Handle font size change
   * Updates font size and saves to settings
   */
  const handleFontSizeChange = async (value: number) => {
    setFontSize(value);

    // Save to persistent storage
    try {
      await saveSettings({ fontSize: value });
      console.log(`Font size updated to: ${value}`);
    } catch (error) {
      console.error("Failed to save font size:", error);
    }
  };

  /**
   * Feature #70: Handle fade duration change
   * Updates fade duration and saves to settings
   */
  const handleFadeDurationChange = async (value: number) => {
    setFadeDuration(value);

    // Save to persistent storage
    try {
      await saveSettings({ fadeDuration: value });
      console.log(`Fade duration updated to: ${value}`);
    } catch (error) {
      console.error("Failed to save fade duration:", error);
    }
  };

  /**
   * Feature #126: Handle panel transparency change
   * Updates panel transparency and saves to settings
   */
  const handlePanelTransparencyChange = async (value: number) => {
    setPanelTransparency(value);

    // Save to persistent storage
    try {
      await saveSettings({ panelTransparency: value });
      console.log(`Panel transparency updated to: ${value}`);
    } catch (error) {
      console.error("Failed to save panel transparency:", error);
    }
  };

  /**
   * Feature #133: Toggle panel collapsed state
   * Collapses panel to show only tool icons
   */
  const togglePanelCollapsed = async () => {
    const newCollapsed = !panelCollapsed;
    setPanelCollapsed(newCollapsed);

    // Save to persistent storage
    try {
      await saveSettings({ panelCollapsed: newCollapsed });
      console.log(`Panel collapsed state updated to: ${newCollapsed}`);
    } catch (error) {
      console.error("Failed to save panel collapsed state:", error);
    }
  };

  /**
   * Feature #81: Handle tool color selection from preset in settings
   * Updates the default color for a specific tool
   */
  const handleSettingsColorSelect = async (tool: string, color: string) => {
    try {
      const updatedColors = {
        ...currentColorForTool,
        [tool]: color,
      };
      setCurrentColorForTool(updatedColors);

      // Save to persistent storage
      await saveSettings({ colors: updatedColors as any });
      console.log(`Updated ${tool} default color to: ${color}`);

      // Update selected color if this tool is currently selected
      if (selectedTool === tool) {
        setSelectedColor(color);
      }

      setEditingColorForTool(null);
    } catch (error) {
      console.error("Failed to save color:", error);
    }
  };

  /**
   * Feature #81: Open custom color picker for a tool in settings
   */
  const openSettingsColorPicker = (tool: string) => {
    setEditingColorForTool(tool);
    settingsColorInputRef.current?.click();
  };

  /**
   * Feature #81: Handle custom color input change in settings
   */
  const handleSettingsCustomColorChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const color = e.target.value;

    // Validate hex color format (#RRGGBB or #RGB)
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
   * Feature #85: Handle settings save button click
   * Feature #106: Save per-tool line thickness
   */
  const handleSaveSettings = async () => {
    try {
      // Feature #106: Create per-tool line thickness object
      const thicknessObj = {
        arrow: lineThickness,
        circle: lineThickness,
        box: lineThickness,
        freehand: lineThickness,
        highlighter: lineThickness,
        text: lineThickness,
      };

      // Save all current settings to storage
      const settingsToSave = {
        colors: currentColorForTool,
        hotkeys: hotkeys,
        lineThickness: thicknessObj as any, // Feature #106: Save as object
        fontSize: fontSize,
        fadeDuration: fadeDuration,
      };

      await saveSettings(settingsToSave as any);
      console.log("Settings saved successfully:", settingsToSave);

      // Show confirmation
      alert("Settings saved successfully!");

      // Close the modal after saving
      setShowSettingsModal(false);
    } catch (error) {
      console.error("Failed to save settings:", error);
      alert("Failed to save settings. Please try again.");
    }
  };

  /**
   * Feature #86: Handle settings reset button click
   * Resets all settings to default values
   */
  const handleResetSettings = async () => {
    try {
      // Confirm with user before resetting
      const confirmed = window.confirm(
        "Are you sure you want to reset all settings to their default values? This action cannot be undone."
      );

      if (!confirmed) {
        return;
      }

      // Reset to defaults using the reset function
      await invoke("reset_settings");
      console.log("Settings reset to defaults");

      // Reload settings from storage
      const reloadedSettings = await loadSettings();

      // Feature #106: Get arrow tool thickness for display
      const thickness = typeof reloadedSettings.lineThickness === 'number'
        ? reloadedSettings.lineThickness
        : reloadedSettings.lineThickness.arrow;

      // Update all state variables with defaults
      setCurrentColorForTool(reloadedSettings.colors);
      setSelectedColor(reloadedSettings.colors.arrow);
      setHotkeys(reloadedSettings.hotkeys);
      setLineThickness(thickness); // Feature #106: Use arrow thickness
      setFontSize(reloadedSettings.fontSize);
      setFadeDuration(reloadedSettings.fadeDuration);
      setPanelTransparency(reloadedSettings.panelTransparency);

      // Clear any hotkey conflicts
      setHotkeyConflicts({});

      // Re-register hotkeys with default values
      await invoke("register_hotkeys", { hotkeyConfig: reloadedSettings });
      console.log("Hotkeys re-registered with defaults");

      // Show confirmation
      alert("Settings have been reset to defaults!");
    } catch (error) {
      console.error("Failed to reset settings:", error);
      alert("Failed to reset settings. Please try again.");
    }
  };

  /**
   * Feature #121: Export settings to a JSON file
   * Downloads current settings as a JSON file
   */
  const handleExportSettings = async () => {
    try {
      await exportSettings();
      console.log("Settings exported successfully");
      alert("Settings exported successfully!");
    } catch (error) {
      console.error("Failed to export settings:", error);
      alert("Failed to export settings. Please try again.");
    }
  };

  /**
   * Feature #121: Import settings from a JSON file
   * Reads a JSON file and applies the settings
   */
  const handleImportSettings = async () => {
    try {
      // Create a file input element
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/json";

      // Handle file selection
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) {
          return;
        }

        try {
          // Import and validate settings
          const imported = await importSettings(file);

          // Feature #106: Get arrow tool thickness for display
          const thickness = typeof imported.lineThickness === 'number'
            ? imported.lineThickness
            : imported.lineThickness.arrow;

          // Update all state variables with imported settings
          setCurrentColorForTool(imported.colors);
          setSelectedColor(imported.colors.arrow);
          setHotkeys(imported.hotkeys);
          setLineThickness(thickness); // Feature #106: Use arrow thickness
          setFontSize(imported.fontSize);
          setFadeDuration(imported.fadeDuration);
          setPanelTransparency(imported.panelTransparency);

          // Clear any hotkey conflicts
          setHotkeyConflicts({});

          // Re-register hotkeys with imported values
          await invoke("register_hotkeys", { hotkeyConfig: imported });
          console.log("Hotkeys re-registered with imported settings");

          // Show confirmation
          alert("Settings imported successfully! All settings have been updated.");

          // Close the modal after import
          setShowSettingsModal(false);
        } catch (error) {
          console.error("Failed to import settings:", error);
          alert(`Failed to import settings: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      };

      // Trigger file picker
      input.click();
    } catch (error) {
      console.error("Failed to open file picker:", error);
      alert("Failed to open file picker. Please try again.");
    }
  };

  /**
   * Feature #19: Handle drag start
   * Initiates panel dragging
   */
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.panel-header')) {
      setIsDragging(true);
      setDragOffset({
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      });
      e.preventDefault();
    }
  };

  /**
   * Feature #19 & #50: Handle drag move and save
   * Feature #50: Uses Tauri window positioning for multi-monitor support
   * Feature #50: Detects which monitor the panel is being dragged to
   */
  useEffect(() => {
    const handleMouseMove = async (e: MouseEvent) => {
      if (isDragging) {
        const newX = e.clientX - dragOffset.x;
        const newY = e.clientY - dragOffset.y;
        setPosition({ x: newX, y: newY });

        // Feature #50: Detect which monitor the panel is now on
        const newMonitor = detectMonitorForPosition(newX, newY);
        if (newMonitor !== currentMonitor) {
          setCurrentMonitor(newMonitor);
          console.log(`Panel moved to monitor: ${newMonitor}`);
        }

        // Feature #50: Move the actual Tauri window (not just CSS)
        // This allows positioning on any monitor in multi-monitor setups
        try {
          await invoke("set_mini_panel_position", {
            x: Math.round(newX),
            y: Math.round(newY),
          });
        } catch (error) {
          console.error("Failed to reposition mini panel window:", error);
        }
      }
    };

    const handleMouseUp = async () => {
      if (isDragging) {
        setIsDragging(false);
        try {
          // Feature #50: Save to persistent storage with monitor ID
          await invoke("save_mini_panel_position", {
            x: Math.round(position.x),
            y: Math.round(position.y),
            monitor_id: currentMonitor,
          });
          console.log("Panel position saved:", { ...position, monitor: currentMonitor });
        } catch (error) {
          console.error("Failed to save panel position:", error);
        }
      }
    };

    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, dragOffset, position, currentMonitor, monitors]);

  /**
   * Tool button component
   */
  const ToolButton = ({ tool, label }: { tool: ToolType; label: string }) => {
    const isSelected = selectedTool === tool;

    return (
      <button
        type="button"
        onClick={() => selectTool(tool)}
        style={{
          padding: "8px 12px",
          margin: "4px",
          backgroundColor: isSelected ? "#2563eb" : "rgba(255, 255, 255, 0.9)",
          color: isSelected ? "white" : "#213547",
          border: isSelected ? "1px solid #2563eb" : "1px solid transparent",
          borderRadius: "8px",
          cursor: "pointer",
          fontSize: "12px",
          fontWeight: isSelected ? "bold" : "500",
          fontFamily: "inherit",
          transition: "all 0.2s",
        }}
        onMouseEnter={(e) => {
          if (!isSelected) {
            e.currentTarget.style.backgroundColor = "rgba(240, 240, 240, 0.95)";
          }
        }}
        onMouseLeave={(e) => {
          if (!isSelected) {
            e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.9)";
          }
        }}
        title={`Select ${label} tool`}
      >
        {label}
      </button>
    );
  };

  /**
   * Feature #44: Color picker button component
   */
  const ColorButton = ({ color }: { color: string }) => {
    const isSelected = selectedColor === color;

    return (
      <button
        type="button"
        onClick={() => selectColor(color)}
        style={{
          width: "28px",
          height: "28px",
          margin: "3px",
          padding: "0",
          backgroundColor: color,
          border: isSelected ? "3px solid #2563eb" : "2px solid #999",
          borderRadius: "4px",
          cursor: "pointer",
          transition: "all 0.2s ease",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.2)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "scale(1.1)";
          e.currentTarget.style.borderColor = isSelected ? "#2563eb" : "#666";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "scale(1)";
          e.currentTarget.style.borderColor = isSelected ? "#2563eb" : "#999";
        }}
        title={`Select color: ${color}`}
        aria-label={`Color ${color}`}
      />
    );
  };

  return (
    <div
      ref={panelRef}
      onMouseDown={handleMouseDown}
      style={{
        // Feature #50: No CSS positioning - using Tauri window positioning instead
        // This allows the panel window to be positioned on any monitor
        padding: "12px",
        backgroundColor: `rgba(240, 240, 240, ${panelTransparency})`,
        borderRadius: "8px",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
        zIndex: 10000,
        minWidth: "200px",
        cursor: isDragging ? "grabbing" : "default",
        userSelect: isDragging ? "none" : "auto",
        height: "100vh", // Fill the window for easier dragging
      }}
    >
      {/* Feature #19: Draggable header */}
      {/* Feature #52: Added minimize button */}
      <div
        className="panel-header"
        style={{
          margin: "-12px -12px 12px -12px",
          padding: "8px 12px",
          backgroundColor: `rgba(220, 220, 220, ${panelTransparency})`,
          borderRadius: "8px 8px 0 0",
          cursor: "grab",
          borderBottom: "1px solid rgba(0, 0, 0, 0.1)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
        title="Drag to reposition panel (can be moved off-screen)"
      >
        <h3
          style={{
            margin: 0,
            fontSize: "14px",
            fontWeight: "bold",
            color: "#333",
          }}
        >
          Drawing Tools
        </h3>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          {/* Feature #133: Collapse button */}
          <button
            type="button"
            onClick={togglePanelCollapsed}
            style={{
              background: "none",
              border: "none",
              fontSize: "14px",
              cursor: "pointer",
              color: "#666",
              padding: "0 4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "color 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "#333";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "#666";
            }}
            title={panelCollapsed ? "Expand panel (show all controls)" : "Collapse panel (show only tool icons)"}
            aria-label={panelCollapsed ? "Expand panel" : "Collapse panel"}
          >
            {panelCollapsed ? "◀" : "▶"}
          </button>
          {/* Feature #52: Minimize button */}
          <button
            type="button"
            onClick={toggleMinimize}
            style={{
              background: "none",
              border: "none",
              fontSize: "16px",
              cursor: "pointer",
              color: "#666",
              padding: "0 4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "color 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "#333";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "#666";
            }}
            title="Minimize panel (hide from view)"
            aria-label="Minimize panel"
          >
            −
          </button>
          <span
            style={{
              fontSize: "12px",
              color: "#666",
            }}
            title="Drag this header to move panel (including off-screen)"
          >
            ⋮⋮
          </span>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "4px",
        }}
      >
        <ToolButton tool={ToolType.ARROW} label="Arrow" />
        <ToolButton tool={ToolType.CIRCLE} label="Circle" />
        <ToolButton tool={ToolType.BOX} label="Box" />
        <ToolButton tool={ToolType.FREEHAND} label="Freehand" />
        <ToolButton tool={ToolType.HIGHLIGHTER} label="Highlighter" />
        <ToolButton tool={ToolType.TEXT} label="Text" />

        {/* Feature #48: Settings button */}
        <button
          type="button"
          onClick={() => setShowSettingsModal(true)}
          style={{
            padding: "8px 12px",
            margin: "4px",
            backgroundColor: "#1a1a1a",
            color: "white",
            border: "1px solid transparent",
            borderRadius: "8px",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: "500",
            fontFamily: "inherit",
            transition: "border-color 0.25s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "#646cff";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "transparent";
          }}
          title="Open settings panel"
        >
          ⚙️ Settings
        </button>
      </div>

      {/* Feature #44: Color picker section */}
      <div
        style={{
          marginTop: "12px",
          paddingTop: "12px",
          borderTop: "1px solid rgba(0, 0, 0, 0.1)",
        }}
      >
        <div
          style={{
            fontSize: "11px",
            fontWeight: "bold",
            color: "#333",
            marginBottom: "6px",
            textAlign: "center",
          }}
        >
          Color
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            padding: "4px",
            backgroundColor: "rgba(255, 255, 255, 0.5)",
            borderRadius: "4px",
          }}
        >
          {PRESET_COLORS.map((color) => (
            <ColorButton key={color} color={color} />
          ))}
          {/* Feature #45: Custom color picker button */}
          <button
            type="button"
            onClick={openCustomColorPicker}
            style={{
              width: "28px",
              height: "28px",
              margin: "3px",
              padding: "0",
              backgroundColor: "linear-gradient(135deg, #ff0000 0%, #00ff00 50%, #0000ff 100%)",
              border: "2px solid #999",
              borderRadius: "4px",
              cursor: "pointer",
              transition: "all 0.2s ease",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.2)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "scale(1.1)";
              e.currentTarget.style.borderColor = "#666";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "scale(1)";
              e.currentTarget.style.borderColor = "#999";
            }}
            title="Select custom color"
            aria-label="Custom color picker"
          />
          {/* Feature #45: Hidden color input for custom color selection */}
          <input
            ref={customColorInputRef}
            type="color"
            onChange={handleCustomColorChange}
            style={{
              position: "absolute",
              width: "0",
              height: "0",
              opacity: "0",
              pointerEvents: "none",
            }}
            value={selectedColor}
          />
          {/* Feature #81: Hidden color input for settings color selection */}
          <input
            ref={settingsColorInputRef}
            type="color"
            onChange={handleSettingsCustomColorChange}
            style={{
              position: "absolute",
              width: "0",
              height: "0",
              opacity: "0",
              pointerEvents: "none",
            }}
            value={currentColorForTool[editingColorForTool || "arrow"] || "#FF0000"}
          />
        </div>
        {/* Selected color indicator */}
        <div
          style={{
            marginTop: "6px",
            fontSize: "10px",
            color: "#666",
            textAlign: "center",
          }}
        >
          Selected:{" "}
          <span
            style={{
              display: "inline-block",
              width: "12px",
              height: "12px",
              backgroundColor: selectedColor,
              border: "1px solid #999",
              borderRadius: "2px",
              marginLeft: "4px",
              verticalAlign: "middle",
            }}
          />
          <code style={{ marginLeft: "4px", fontSize: "9px" }}>{selectedColor}</code>
        </div>
      </div>

      {/* Feature #46: Line thickness control section */}
      <div
        style={{
          marginTop: "12px",
          paddingTop: "12px",
          borderTop: "1px solid rgba(0, 0, 0, 0.1)",
        }}
      >
        <div
          style={{
            fontSize: "11px",
            fontWeight: "bold",
            color: "#333",
            marginBottom: "6px",
            textAlign: "center",
          }}
        >
          Line Thickness
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "4px",
          }}
        >
          <span
            style={{
              fontSize: "10px",
              color: "#666",
              minWidth: "20px",
            }}
          >
            1
          </span>
          <input
            type="range"
            min="1"
            max="50"
            step="1"
            value={lineThickness}
            onChange={(e) => handleLineThicknessChange(parseInt(e.target.value, 10))}
            style={{
              flex: 1,
              height: "6px",
              cursor: "pointer",
            }}
            aria-label="Line thickness"
            title={`Line thickness: ${lineThickness}px`}
          />
          <span
            style={{
              fontSize: "10px",
              color: "#666",
              minWidth: "25px",
            }}
          >
            50
          </span>
          <span
            style={{
              fontSize: "11px",
              fontWeight: "bold",
              color: "#2563eb",
              minWidth: "35px",
              textAlign: "right",
            }}
          >
            {lineThickness}px
          </span>
        </div>
      </div>

      {/* Feature #47: Font size control section */}
      <div
        style={{
          marginTop: "12px",
          paddingTop: "12px",
          borderTop: "1px solid rgba(0, 0, 0, 0.1)",
        }}
      >
        <div
          style={{
            fontSize: "11px",
            fontWeight: "bold",
            color: "#333",
            marginBottom: "6px",
            textAlign: "center",
          }}
        >
          Font Size
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "4px 8px",
            backgroundColor: "rgba(255, 255, 255, 0.5)",
            borderRadius: "4px",
          }}
        >
          <span
            style={{
              fontSize: "10px",
              color: "#666",
              minWidth: "20px",
            }}
          >
            8
          </span>
          <input
            type="range"
            min="8"
            max="72"
            step="2"
            value={fontSize}
            onChange={(e) => handleFontSizeChange(parseInt(e.target.value, 10))}
            style={{
              flex: 1,
              height: "6px",
              cursor: "pointer",
            }}
            aria-label="Font size"
            title={`Font size: ${fontSize}pt`}
          />
          <span
            style={{
              fontSize: "10px",
              color: "#666",
              minWidth: "25px",
            }}
          >
            72
          </span>
          <span
            style={{
              fontSize: "11px",
              fontWeight: "bold",
              color: "#2563eb",
              minWidth: "35px",
              textAlign: "right",
            }}
          >
            {fontSize}pt
          </span>
        </div>
      </div>

      {/* Feature #70: Fade duration control section */}
      <div
        style={{
          marginTop: "12px",
          paddingTop: "12px",
          borderTop: "1px solid rgba(0, 0, 0, 0.1)",
        }}
      >
        <div
          style={{
            fontSize: "11px",
            fontWeight: "bold",
            color: "#333",
            marginBottom: "6px",
            textAlign: "center",
          }}
        >
          Auto-Fade Duration
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "4px 8px",
            backgroundColor: "rgba(255, 255, 255, 0.5)",
            borderRadius: "4px",
          }}
        >
          <span
            style={{
              fontSize: "10px",
              color: "#666",
              minWidth: "20px",
            }}
          >
            1
          </span>
          <input
            type="range"
            min="1"
            max="60"
            step="1"
            value={fadeDuration}
            onChange={(e) => handleFadeDurationChange(parseInt(e.target.value, 10))}
            style={{
              flex: 1,
              height: "6px",
              cursor: "pointer",
            }}
            aria-label="Auto-fade duration"
            title={`Shapes auto-fade after ${fadeDuration} seconds`}
          />
          <span
            style={{
              fontSize: "10px",
              color: "#666",
              minWidth: "25px",
            }}
          >
            60
          </span>
          <span
            style={{
              fontSize: "11px",
              fontWeight: "bold",
              color: "#2563eb",
              minWidth: "45px",
              textAlign: "right",
            }}
          >
            {fadeDuration}s
          </span>
        </div>
      </div>

      {/* Feature #126: Panel transparency control section */}
      <div
        style={{
          marginTop: "12px",
          paddingTop: "12px",
          borderTop: "1px solid rgba(0, 0, 0, 0.1)",
        }}
      >
        <div
          style={{
            fontSize: "11px",
            fontWeight: "bold",
            color: "#333",
            marginBottom: "6px",
            textAlign: "center",
          }}
        >
          Panel Transparency
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "4px 8px",
            backgroundColor: "rgba(255, 255, 255, 0.5)",
            borderRadius: "4px",
          }}
        >
          <span
            style={{
              fontSize: "10px",
              color: "#666",
              minWidth: "20px",
            }}
          >
            0%
          </span>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={Math.round(panelTransparency * 100)}
            onChange={(e) => handlePanelTransparencyChange(parseInt(e.target.value, 10) / 100)}
            style={{
              flex: 1,
              height: "6px",
              cursor: "pointer",
            }}
            aria-label="Panel transparency"
            title={`Panel transparency: ${Math.round(panelTransparency * 100)}%`}
          />
          <span
            style={{
              fontSize: "10px",
              color: "#666",
              minWidth: "25px",
            }}
          >
            100%
          </span>
          <span
            style={{
              fontSize: "11px",
              fontWeight: "bold",
              color: "#2563eb",
              minWidth: "45px",
              textAlign: "right",
            }}
          >
            {Math.round(panelTransparency * 100)}%
          </span>
        </div>
      </div>

      <div
        style={{
          marginTop: "12px",
          padding: "8px",
          backgroundColor: "rgba(0, 0, 0, 0.05)",
          borderRadius: "4px",
          fontSize: "11px",
          color: "#666",
          textAlign: "center",
        }}
      >
        {selectedTool ? (
          <>Active: <strong>{selectedTool}</strong></>
        ) : (
          <>Select a tool to draw</>
        )}
      </div>

      <div
        style={{
          marginTop: "8px",
          fontSize: "10px",
          color: "#999",
          textAlign: "center",
        }}
      >
        Click & drag on overlay to draw
      </div>

      {/* Feature #19: Position indicator */}
      {/* Feature #50: Also shows current monitor */}
      <div
        style={{
          marginTop: "4px",
          fontSize: "9px",
          color: "#aaa",
          textAlign: "center",
        }}
      >
        Pos: ({position.x}, {position.y}) on {currentMonitor}
      </div>

      {/* Feature #48: Settings modal */}
      {showSettingsModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10001,
          }}
          onClick={() => setShowSettingsModal(false)}
        >
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "8px",
              padding: "20px",
              minWidth: "300px",
              maxWidth: "500px",
              maxHeight: "80vh",
              overflow: "auto",
              boxShadow: "0 4px 20px rgba(0, 0, 0, 0.3)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "20px",
                paddingBottom: "10px",
                borderBottom: "2px solid #eee",
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: "18px",
                  color: "#333",
                }}
              >
                Settings
              </h2>
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "20px",
                  cursor: "pointer",
                  color: "#666",
                  padding: "0 8px",
                }}
                title="Close settings"
              >
                ×
              </button>
            </div>

            <div
              style={{
                fontSize: "14px",
                color: "#666",
                lineHeight: "1.6",
              }}
            >
              <p style={{ marginTop: 0 }}>
                Configure your Annotatr preferences. Changes are saved automatically.
              </p>

              <div
                style={{
                  backgroundColor: "#f8f9fa",
                  padding: "12px",
                  borderRadius: "4px",
                  marginTop: "15px",
                }}
              >
                <h3
                  style={{
                    fontSize: "14px",
                    margin: "0 0 10px 0",
                    color: "#333",
                  }}
                >
                  Current Settings
                </h3>
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: "20px",
                    fontSize: "13px",
                  }}
                >
                  <li><strong>Font Size:</strong> {fontSize}pt</li>
                  <li><strong>Line Thickness:</strong> {lineThickness}px</li>
                  <li><strong>Fade Duration:</strong> {fadeDuration} seconds</li>
                  <li><strong>Panel Transparency:</strong> {Math.round(panelTransparency * 100)}%</li>
                  <li><strong>Colors:</strong> Configured per tool</li>
                </ul>
              </div>

              {/* Feature #63: Hotkey conflict warnings */}
              {Object.keys(hotkeyConflicts).length > 0 && (
                <div
                  style={{
                    backgroundColor: "#fef3c7",
                    padding: "12px",
                    borderRadius: "4px",
                    marginTop: "15px",
                    border: "1px solid #f59e0b",
                  }}
                >
                  <h3
                    style={{
                      fontSize: "14px",
                      margin: "0 0 10px 0",
                      color: "#92400e",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <span>⚠️</span>
                    <span>Hotkey Conflicts Detected</span>
                  </h3>
                  <p
                    style={{
                      fontSize: "12px",
                      margin: "0 0 10px 0",
                      color: "#78350f",
                    }}
                  >
                    The following hotkeys may conflict with system shortcuts:
                  </p>
                  <ul
                    style={{
                      margin: 0,
                      paddingLeft: "20px",
                      fontSize: "12px",
                    }}
                  >
                    {Object.entries(hotkeyConflicts).map(
                      ([hotkeyName, info]: [string, any]) =>
                        info.conflict && (
                          <li key={hotkeyName} style={{ marginBottom: "8px" }}>
                            <strong style={{ color: "#92400e" }}>
                              {hotkeyName} ({info.hotkey})
                            </strong>
                            : Used by system for "{info.system_function}"
                          </li>
                        )
                    )}
                  </ul>
                  <p
                    style={{
                      fontSize: "11px",
                      margin: "10px 0 0 0",
                      color: "#78350f",
                      fontStyle: "italic",
                    }}
                  >
                    💡 You may want to change these hotkeys in Settings to avoid conflicts.
                  </p>
                </div>
              )}

              {/* Feature #64: Hotkey customization */}
              <div
                style={{
                  backgroundColor: "#f8f9fa",
                  padding: "12px",
                  borderRadius: "4px",
                  marginTop: "15px",
                }}
              >
                <h3
                  style={{
                    fontSize: "14px",
                    margin: "0 0 10px 0",
                    color: "#333",
                  }}
                >
                  Keyboard Shortcuts
                </h3>
                <div
                  style={{
                    fontSize: "12px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  {Object.entries(hotkeys).map(([hotkeyName, hotkeyValue]: [string, string]) => (
                    <div
                      key={hotkeyName}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "6px 8px",
                        backgroundColor: "white",
                        borderRadius: "4px",
                        border: "1px solid #e5e7eb",
                      }}
                    >
                      <span style={{ fontWeight: 500, color: "#374151" }}>
                        {hotkeyName
                          .replace(/([A-Z])/g, " $1")
                          .replace(/^./, (str) => str.toUpperCase())
                          .trim()}
                      </span>
                      {editingHotkey === hotkeyName ? (
                        <div
                          style={{
                            display: "flex",
                            gap: "8px",
                            alignItems: "center",
                          }}
                          tabIndex={0}
                          onKeyDown={handleHotkeyCapture}
                          autoFocus
                        >
                          <code
                            style={{
                              padding: "4px 8px",
                              backgroundColor: capturedHotkey ? "#10b981" : "#fef3c7",
                              borderRadius: "3px",
                              minWidth: "100px",
                              textAlign: "center",
                              display: "inline-block",
                            }}
                          >
                            {capturedHotkey || "Press keys..."}
                          </code>
                          <button
                            type="button"
                            onClick={saveHotkey}
                            disabled={!capturedHotkey}
                            style={{
                              padding: "4px 8px",
                              backgroundColor: capturedHotkey ? "#10b981" : "#d1d5db",
                              color: "white",
                              border: "none",
                              borderRadius: "3px",
                              cursor: capturedHotkey ? "pointer" : "not-allowed",
                              fontSize: "11px",
                            }}
                          >
                            ✓
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditingHotkey}
                            style={{
                              padding: "4px 8px",
                              backgroundColor: "#ef4444",
                              color: "white",
                              border: "none",
                              borderRadius: "3px",
                              cursor: "pointer",
                              fontSize: "11px",
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div
                          style={{
                            display: "flex",
                            gap: "8px",
                            alignItems: "center",
                          }}
                        >
                          <code
                            style={{
                              padding: "4px 8px",
                              backgroundColor: "#f3f4f6",
                              borderRadius: "3px",
                              minWidth: "100px",
                              textAlign: "center",
                              display: "inline-block",
                            }}
                          >
                            {hotkeyValue}
                          </code>
                          <button
                            type="button"
                            onClick={() => startEditingHotkey(hotkeyName)}
                            style={{
                              padding: "4px 8px",
                              backgroundColor: "#3b82f6",
                              color: "white",
                              border: "none",
                              borderRadius: "3px",
                              cursor: "pointer",
                              fontSize: "11px",
                            }}
                            title="Change hotkey"
                          >
                            Edit
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <p
                  style={{
                    fontSize: "11px",
                    margin: "10px 0 0 0",
                    color: "#6b7280",
                    fontStyle: "italic",
                  }}
                >
                  💡 Click "Edit" then press your desired key combination to change a hotkey.
                </p>
              </div>

              {/* Feature #81: Color picker for default tool colors */}
              <div
                style={{
                  backgroundColor: "#f8f9fa",
                  padding: "12px",
                  borderRadius: "4px",
                  marginTop: "15px",
                }}
              >
                <h3
                  style={{
                    fontSize: "14px",
                    margin: "0 0 10px 0",
                    color: "#333",
                  }}
                >
                  Default Tool Colors
                </h3>
                <div
                  style={{
                    fontSize: "12px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                  }}
                >
                  {Object.entries(currentColorForTool).map(([tool, color]: [string, string]) => (
                    <div
                      key={tool}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "8px",
                        backgroundColor: "white",
                        borderRadius: "4px",
                        border: "1px solid #e5e7eb",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span
                          style={{
                            display: "inline-block",
                            width: "20px",
                            height: "20px",
                            backgroundColor: color,
                            border: "1px solid #ccc",
                            borderRadius: "3px",
                          }}
                        />
                        <span style={{ fontWeight: 500, color: "#374151", textTransform: "capitalize" }}>
                          {tool}
                        </span>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: "4px",
                          alignItems: "center",
                        }}
                      >
                        {/* Preset colors */}
                        {PRESET_COLORS.slice(0, 6).map((presetColor) => (
                          <button
                            key={presetColor}
                            type="button"
                            onClick={() => handleSettingsColorSelect(tool, presetColor)}
                            style={{
                              width: "24px",
                              height: "24px",
                              padding: "0",
                              backgroundColor: presetColor,
                              border: color === presetColor ? "2px solid #2563eb" : "1px solid #ccc",
                              borderRadius: "3px",
                              cursor: "pointer",
                              transition: "transform 0.1s",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.transform = "scale(1.1)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.transform = "scale(1)";
                            }}
                            title={`Set ${tool} color to ${presetColor}`}
                          />
                        ))}

                        {/* Custom color picker button */}
                        <button
                          type="button"
                          onClick={() => openSettingsColorPicker(tool)}
                          style={{
                            width: "24px",
                            height: "24px",
                            padding: "0",
                            backgroundColor: "linear-gradient(135deg, #ff0000 0%, #00ff00 50%, #0000ff 100%)",
                            border: "1px solid #999",
                            borderRadius: "3px",
                            cursor: "pointer",
                            transition: "transform 0.1s",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = "scale(1.1)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = "scale(1)";
                          }}
                          title={`Select custom color for ${tool}`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <p
                  style={{
                    fontSize: "11px",
                    margin: "10px 0 0 0",
                    color: "#6b7280",
                    fontStyle: "italic",
                  }}
                >
                  💡 Click a preset color or the rainbow button to choose custom colors for each tool.
                </p>
              </div>

              <div
                style={{
                  marginTop: "15px",
                  fontSize: "12px",
                  color: "#999",
                }}
              >
                <p style={{ margin: 0 }}>
                  💡 Tip: Use the Mini Panel sliders to adjust font size and line thickness in real-time.
                </p>
              </div>
            </div>

            {/* Feature #85, #86: Settings modal footer with Save, Reset, and Close buttons */}
            <div
              style={{
                marginTop: "20px",
                paddingTop: "15px",
                borderTop: "1px solid #eee",
                display: "flex",
                justifyContent: "space-between",
                gap: "10px",
              }}
            >
              {/* Feature #86: Reset to defaults button */}
              <button
                type="button"
                onClick={handleResetSettings}
                style={{
                  padding: "8px 16px",
                  backgroundColor: "#dc2626",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "14px",
                  transition: "background 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#b91c1c";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#dc2626";
                }}
              >
                Reset to Defaults
              </button>

              {/* Feature #121: Export and Import buttons */}
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  type="button"
                  onClick={handleExportSettings}
                  style={{
                    padding: "8px 16px",
                    backgroundColor: "#0891b2",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "14px",
                    transition: "background 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#0e7490";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "#0891b2";
                  }}
                  title="Download settings as a JSON file"
                >
                  Export
                </button>
                <button
                  type="button"
                  onClick={handleImportSettings}
                  style={{
                    padding: "8px 16px",
                    backgroundColor: "#7c3aed",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "14px",
                    transition: "background 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#6d28d9";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "#7c3aed";
                  }}
                  title="Import settings from a JSON file"
                >
                  Import
                </button>
              </div>

              {/* Feature #85: Save and Close buttons */}
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  style={{
                    padding: "8px 16px",
                    backgroundColor: "#16a34a",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "14px",
                    transition: "background 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#15803d";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "#16a34a";
                  }}
                >
                  Save
                </button>

                <button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  style={{
                    padding: "8px 16px",
                    backgroundColor: "#6b7280",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "14px",
                    transition: "background 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#4b5563";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "#6b7280";
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
