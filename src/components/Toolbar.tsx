import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ToolType } from "../types/shapes";
import { loadSettings, saveSettings, DEFAULT_SETTINGS, Settings } from "../lib/storage";

/**
 * Compact horizontal toolbar (520x56 strip).
 * Summoned by the global toggle hotkey; floats above other apps without
 * stealing their focus. Tool clicks activate the drawing overlay; all
 * sliders/preferences live in the Settings window.
 *
 * Note: clicking any button necessarily activates the app (it's a mouse
 * click on our window). Tool clicks lead into drawing mode where that's
 * wanted; for the rest, Escape or the toggle hotkey hands focus back.
 */

const TOOLS: Array<{ tool: ToolType; icon: string; label: string }> = [
  { tool: ToolType.ARROW, icon: "↗", label: "Arrow" },
  { tool: ToolType.CIRCLE, icon: "○", label: "Circle" },
  { tool: ToolType.BOX, icon: "□", label: "Box" },
  { tool: ToolType.FREEHAND, icon: "✎", label: "Freehand" },
  { tool: ToolType.HIGHLIGHTER, icon: "▭", label: "Highlighter" },
  { tool: ToolType.TEXT, icon: "T", label: "Text" },
];

export default function Toolbar() {
  const [activeTool, setActiveTool] = useState<ToolType | null>(null);
  const [colors, setColors] = useState<Settings["colors"]>(DEFAULT_SETTINGS.colors);
  const colorInputRef = useRef<HTMLInputElement>(null);
  const activeToolRef = useRef<ToolType | null>(null);
  activeToolRef.current = activeTool;

  // Load tool colors and keep them in sync with the Settings window
  useEffect(() => {
    const refreshColors = () => {
      loadSettings()
        .then((settings) => setColors(settings.colors))
        .catch((error) => console.error("Failed to load colors:", error));
    };
    refreshColors();

    const unlistenSettings = listen("settings_updated", refreshColors);

    // Mirror tool selection (from toolbar clicks AND global hotkeys)
    const unlistenToolSelected = listen<string>("tool-selected", (event) => {
      const tool = event.payload as ToolType;
      if (Object.values(ToolType).includes(tool)) {
        setActiveTool(tool);
      }
    });

    // Drawing mode off -> no active tool
    const unlistenDrawingMode = listen<boolean>("drawing-mode-changed", (event) => {
      if (!event.payload) {
        setActiveTool(null);
      }
    });

    // Persist position after the user drags the strip (debounced)
    let moveTimer: ReturnType<typeof setTimeout> | null = null;
    const unlistenMoved = getCurrentWindow().onMoved(({ payload }) => {
      if (moveTimer) clearTimeout(moveTimer);
      moveTimer = setTimeout(() => {
        invoke("save_mini_panel_position", { x: payload.x, y: payload.y, monitorId: null })
          .catch((error) => console.error("Failed to save toolbar position:", error));
      }, 500);
    });

    return () => {
      if (moveTimer) clearTimeout(moveTimer);
      unlistenSettings.then((fn) => fn()).catch(console.error);
      unlistenToolSelected.then((fn) => fn()).catch(console.error);
      unlistenDrawingMode.then((fn) => fn()).catch(console.error);
      unlistenMoved.then((fn) => fn()).catch(console.error);
    };
  }, []);

  const selectTool = (tool: ToolType) => {
    invoke("activate_tool_hotkey", { tool })
      .catch((error) => console.error("Failed to activate tool:", error));
  };

  const swatchTool = activeTool ?? ToolType.ARROW;
  const swatchColor = colors[swatchTool] ?? DEFAULT_SETTINGS.colors.arrow;

  const changeColor = (color: string) => {
    const tool = activeToolRef.current ?? ToolType.ARROW;
    const updated = { ...colors, [tool]: color };
    setColors(updated);
    saveSettings({ colors: updated })
      .catch((error) => console.error("Failed to save color:", error));
  };

  const buttonStyle = (selected: boolean): React.CSSProperties => ({
    width: 36,
    height: 36,
    padding: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 17,
    lineHeight: 1,
    color: selected ? "#fff" : "rgba(255, 255, 255, 0.85)",
    backgroundColor: selected ? "#2563eb" : "transparent",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
  });

  const divider = (
    <div style={{ width: 1, height: 24, backgroundColor: "rgba(255, 255, 255, 0.18)", margin: "0 6px" }} />
  );

  return (
    <div
      data-tauri-drag-region
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        padding: "0 10px",
        gap: 2,
        backgroundColor: "rgba(28, 28, 30, 0.92)",
        borderRadius: 12,
        userSelect: "none",
        overflow: "hidden",
      }}
    >
      {/* Drag handle (the whole strip background drags too) */}
      <span
        data-tauri-drag-region
        style={{ color: "rgba(255, 255, 255, 0.4)", fontSize: 14, cursor: "grab", padding: "0 4px" }}
        title="Drag to move"
      >
        ⋮⋮
      </span>

      {TOOLS.map(({ tool, icon, label }) => (
        <button
          key={tool}
          type="button"
          onClick={() => selectTool(tool)}
          style={buttonStyle(activeTool === tool)}
          title={`${label} tool`}
          aria-label={`${label} tool`}
        >
          {icon}
        </button>
      ))}

      {divider}

      {/* Color swatch for the active tool (arrow when idle) */}
      <button
        type="button"
        onClick={() => colorInputRef.current?.click()}
        style={{
          ...buttonStyle(false),
          width: 30,
          height: 30,
          backgroundColor: swatchColor,
          border: "2px solid rgba(255, 255, 255, 0.6)",
          borderRadius: 6,
        }}
        title={`${swatchTool} color: ${swatchColor}`}
        aria-label="Tool color"
      />
      <input
        ref={colorInputRef}
        type="color"
        value={swatchColor}
        onChange={(e) => changeColor(e.target.value)}
        style={{ position: "absolute", width: 0, height: 0, opacity: 0, pointerEvents: "none" }}
      />

      {divider}

      <button
        type="button"
        onClick={() => emit("undo-last-shape").catch(console.error)}
        style={buttonStyle(false)}
        title="Undo last shape"
        aria-label="Undo last shape"
      >
        ↩
      </button>
      <button
        type="button"
        onClick={() => invoke("clear_all_shapes").catch(console.error)}
        style={buttonStyle(false)}
        title="Clear all shapes"
        aria-label="Clear all shapes"
      >
        ✕
      </button>

      {divider}

      <button
        type="button"
        onClick={() => invoke("show_main_window").catch(console.error)}
        style={buttonStyle(false)}
        title="Settings"
        aria-label="Settings"
      >
        ⚙
      </button>
      <button
        type="button"
        onClick={() => invoke("quit_app").catch(console.error)}
        style={{ ...buttonStyle(false), color: "rgba(255, 120, 120, 0.9)" }}
        title="Quit Annotatr"
        aria-label="Quit Annotatr"
      >
        ⏻
      </button>
    </div>
  );
}
