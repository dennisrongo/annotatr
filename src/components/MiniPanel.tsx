import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { ToolType } from "../types/shapes";
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from "../lib/storage";

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

/**
 * Convert ToolType to hotkey config key
 * Example: "box" -> "boxTool", "freehand" -> "freehandTool"
 */
function toolTypeToHotkeyKey(tool: ToolType): string {
  const keyMap: Record<ToolType, string> = {
    [ToolType.ARROW]: "arrowTool",
    [ToolType.CIRCLE]: "circleTool",
    [ToolType.BOX]: "boxTool",
    [ToolType.FREEHAND]: "freehandTool",
    [ToolType.HIGHLIGHTER]: "highlighterTool",
    [ToolType.TEXT]: "textTool",
  };
  return keyMap[tool] || tool;
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

  // Feature #128: Custom fade duration for next shape state
  const [useCustomFadeDuration, setUseCustomFadeDuration] = useState(false);
  const [customFadeDuration, setCustomFadeDuration] = useState(10);

  // Feature #126: Panel transparency control state
  const [panelTransparency, setPanelTransparency] = useState(DEFAULT_SETTINGS.panelTransparency);

  // Feature #133: Panel collapsed state
  const [panelCollapsed, setPanelCollapsed] = useState(DEFAULT_SETTINGS.panelCollapsed);

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
      // Convert ToolType to hotkey config key before passing to backend
      const hotkeyKey = toolTypeToHotkeyKey(tool);
      await invoke("activate_tool_hotkey", { tool: hotkeyKey });
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
   * Feature #128: Emit custom fade duration event to overlay
   * Notifies the overlay component to use the specified duration for the next shape
   */
  const emitCustomFadeDuration = async (duration: number | null) => {
    try {
      await emit("custom-fade-duration", duration);
      console.log(`[Feature #128] Emitted custom-fade-duration event:`, duration);
    } catch (error) {
      console.error("Failed to emit custom-fade-duration event:", error);
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

      {/* Feature #133: Collapsible panel content */}
      {!panelCollapsed ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            transition: "all 0.3s ease",
            overflow: "hidden",
          }}
        >
        <ToolButton tool={ToolType.ARROW} label="Arrow" />
        <ToolButton tool={ToolType.CIRCLE} label="Circle" />
        <ToolButton tool={ToolType.BOX} label="Box" />
        <ToolButton tool={ToolType.FREEHAND} label="Freehand" />
        <ToolButton tool={ToolType.HIGHLIGHTER} label="Highlighter" />
        <ToolButton tool={ToolType.TEXT} label="Text" />

        {/* Feature #48: Settings button - opens main Settings window */}
        <button
          type="button"
          onClick={() => invoke("show_main_window")}
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

      {/* Feature #128: Custom fade duration for next shape */}
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
          Next Shape Duration
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            padding: "4px 8px",
            backgroundColor: "rgba(255, 255, 255, 0.5)",
            borderRadius: "4px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "8px",
            }}
          >
            <label
              htmlFor="custom-fade-checkbox"
              style={{
                fontSize: "11px",
                color: "#333",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                cursor: "pointer",
                flex: 1,
              }}
            >
              <input
                id="custom-fade-checkbox"
                type="checkbox"
                checked={useCustomFadeDuration}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setUseCustomFadeDuration(checked);

                  // Emit event to overlay with new value (null or current duration)
                  if (checked) {
                    emitCustomFadeDuration(customFadeDuration);
                    console.log(`[Feature #128] Custom fade duration enabled: ${customFadeDuration}s`);
                  } else {
                    emitCustomFadeDuration(null);
                    console.log(`[Feature #128] Custom fade duration disabled (using global setting)`);
                  }
                }}
                style={{
                  cursor: "pointer",
                }}
              />
              <span>Use custom duration</span>
            </label>
            {useCustomFadeDuration && (
              <span
                style={{
                  fontSize: "10px",
                  padding: "2px 6px",
                  backgroundColor: "#10b981",
                  color: "white",
                  borderRadius: "4px",
                  fontWeight: "bold",
                }}
              >
                ACTIVE
              </span>
            )}
          </div>

          {useCustomFadeDuration && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
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
                value={customFadeDuration}
                onChange={(e) => {
                  const newDuration = parseInt(e.target.value, 10);
                  setCustomFadeDuration(newDuration);
                  emitCustomFadeDuration(newDuration);
                  console.log(`[Feature #128] Custom fade duration updated: ${newDuration}s`);
                }}
                style={{
                  flex: 1,
                  height: "6px",
                  cursor: "pointer",
                }}
                aria-label="Custom fade duration for next shape"
                title={`Next shape will fade after ${customFadeDuration} seconds`}
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
                  color: "#10b981",
                  minWidth: "45px",
                  textAlign: "right",
                }}
              >
                {customFadeDuration}s
              </span>
            </div>
          )}

          <div
            style={{
              fontSize: "9px",
              color: "#666",
              textAlign: "center",
              fontStyle: "italic",
            }}
          >
            {useCustomFadeDuration
              ? `Next shape fades after ${customFadeDuration}s, then resets`
              : "Using global fade duration setting"}
          </div>
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
        </div>
      ) : (
        // Feature #133: Collapsed view - show only tool icons in a horizontal row
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            gap: "4px",
            padding: "8px 0",
            justifyContent: "center",
            transition: "all 0.3s ease",
          }}
        >
          {/* Icon-only tool buttons for collapsed mode */}
          <button
            type="button"
            onClick={() => selectTool(ToolType.ARROW)}
            style={{
              width: "32px",
              height: "32px",
              padding: "0",
              backgroundColor: selectedTool === ToolType.ARROW ? "#2563eb" : "rgba(255, 255, 255, 0.9)",
              color: selectedTool === ToolType.ARROW ? "white" : "#213547",
              border: selectedTool === ToolType.ARROW ? "1px solid #2563eb" : "1px solid transparent",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.2s",
            }}
            title="Arrow tool"
            aria-label="Arrow tool"
          >
            ↗
          </button>
          <button
            type="button"
            onClick={() => selectTool(ToolType.CIRCLE)}
            style={{
              width: "32px",
              height: "32px",
              padding: "0",
              backgroundColor: selectedTool === ToolType.CIRCLE ? "#2563eb" : "rgba(255, 255, 255, 0.9)",
              color: selectedTool === ToolType.CIRCLE ? "white" : "#213547",
              border: selectedTool === ToolType.CIRCLE ? "1px solid #2563eb" : "1px solid transparent",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.2s",
            }}
            title="Circle tool"
            aria-label="Circle tool"
          >
            ○
          </button>
          <button
            type="button"
            onClick={() => selectTool(ToolType.BOX)}
            style={{
              width: "32px",
              height: "32px",
              padding: "0",
              backgroundColor: selectedTool === ToolType.BOX ? "#2563eb" : "rgba(255, 255, 255, 0.9)",
              color: selectedTool === ToolType.BOX ? "white" : "#213547",
              border: selectedTool === ToolType.BOX ? "1px solid #2563eb" : "1px solid transparent",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.2s",
            }}
            title="Box tool"
            aria-label="Box tool"
          >
            □
          </button>
          <button
            type="button"
            onClick={() => selectTool(ToolType.FREEHAND)}
            style={{
              width: "32px",
              height: "32px",
              padding: "0",
              backgroundColor: selectedTool === ToolType.FREEHAND ? "#2563eb" : "rgba(255, 255, 255, 0.9)",
              color: selectedTool === ToolType.FREEHAND ? "white" : "#213547",
              border: selectedTool === ToolType.FREEHAND ? "1px solid #2563eb" : "1px solid transparent",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.2s",
            }}
            title="Freehand tool"
            aria-label="Freehand tool"
          >
            ✎
          </button>
          <button
            type="button"
            onClick={() => selectTool(ToolType.HIGHLIGHTER)}
            style={{
              width: "32px",
              height: "32px",
              padding: "0",
              backgroundColor: selectedTool === ToolType.HIGHLIGHTER ? "#2563eb" : "rgba(255, 255, 255, 0.9)",
              color: selectedTool === ToolType.HIGHLIGHTER ? "white" : "#213547",
              border: selectedTool === ToolType.HIGHLIGHTER ? "1px solid #2563eb" : "1px solid transparent",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.2s",
            }}
            title="Highlighter tool"
            aria-label="Highlighter tool"
          >
            🖍
          </button>
          <button
            type="button"
            onClick={() => selectTool(ToolType.TEXT)}
            style={{
              width: "32px",
              height: "32px",
              padding: "0",
              backgroundColor: selectedTool === ToolType.TEXT ? "#2563eb" : "rgba(255, 255, 255, 0.9)",
              color: selectedTool === ToolType.TEXT ? "white" : "#213547",
              border: selectedTool === ToolType.TEXT ? "1px solid #2563eb" : "1px solid transparent",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.2s",
            }}
            title="Text tool"
            aria-label="Text tool"
          >
            T
          </button>
        </div>
      )}
    </div>
  );
}
