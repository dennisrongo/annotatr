import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ToolType } from "../types/shapes";
import { loadSettings, saveSettings, DEFAULT_SETTINGS, Settings } from "../lib/storage";

/**
 * Compact horizontal toolbar (floating strip).
 * Summoned by the global toggle hotkey; floats above other apps without
 * stealing their focus. Tool clicks activate the drawing overlay; all
 * sliders/preferences live in the Settings window.
 *
 * Note: clicking any button necessarily activates the app (it's a mouse
 * click on our window). Tool clicks lead into drawing mode where that's
 * wanted; for the rest, Escape or the toggle hotkey hands focus back.
 */

/** 18x18 stroke icons, SF Symbols-style (round caps, 1.6 stroke) */
function Icon({ children, size = 18 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const TOOLS: Array<{ tool: ToolType; icon: React.ReactNode; label: string }> = [
  {
    tool: ToolType.ARROW,
    label: "Arrow",
    icon: <Icon><path d="M4 14L14 4M14 4H8M14 4v6" /></Icon>,
  },
  {
    tool: ToolType.CIRCLE,
    label: "Circle",
    icon: <Icon><circle cx="9" cy="9" r="6" /></Icon>,
  },
  {
    tool: ToolType.BOX,
    label: "Box",
    icon: <Icon><rect x="3" y="4" width="12" height="10" rx="2" /></Icon>,
  },
  {
    tool: ToolType.FREEHAND,
    label: "Freehand",
    icon: (
      <Icon>
        <path d="M11.6 3.3a1.85 1.85 0 0 1 3.1 1.3c0 .5-.2 1-.55 1.35L6.2 14 2.8 15l1-3.4z" />
        <path d="M10.4 4.6l3 3" />
      </Icon>
    ),
  },
  {
    tool: ToolType.HIGHLIGHTER,
    label: "Highlighter",
    icon: (
      <Icon>
        <path d="M10.2 3.6l4.2 4.2-5.6 5.6-4.2-4.2z" />
        <path d="M4.6 9.2L3.2 12.4l2.4 2.4 3.2-1.4" />
        <path d="M2.5 15.8h5" />
      </Icon>
    ),
  },
  {
    tool: ToolType.TEXT,
    label: "Text",
    icon: <Icon><path d="M4 4.6h10M9 4.6V14" /></Icon>,
  },
];

const ICON_UNDO = <Icon><path d="M6.4 4.6L3.6 7.4l2.8 2.8" /><path d="M3.6 7.4h7.2a3.4 3.4 0 1 1 0 6.8H8.2" /></Icon>;
const ICON_CLEAR = <Icon><path d="M4.8 4.8l8.4 8.4M13.2 4.8l-8.4 8.4" /></Icon>;
const ICON_GEAR = (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);
const ICON_POWER = <Icon><path d="M9 2.6v6" /><path d="M12.9 5a5.8 5.8 0 1 1-7.8 0" /></Icon>;
const ICON_GRIP = (
  <svg width="10" height="18" viewBox="0 0 10 18" fill="currentColor" aria-hidden="true">
    <circle cx="3" cy="5" r="1.1" />
    <circle cx="3" cy="9" r="1.1" />
    <circle cx="3" cy="13" r="1.1" />
    <circle cx="7" cy="5" r="1.1" />
    <circle cx="7" cy="9" r="1.1" />
    <circle cx="7" cy="13" r="1.1" />
  </svg>
);

export default function Toolbar() {
  const [activeTool, setActiveTool] = useState<ToolType | null>(null);
  const [colors, setColors] = useState<Settings["colors"]>(DEFAULT_SETTINGS.colors);
  const [panelOpacity, setPanelOpacity] = useState(DEFAULT_SETTINGS.panelTransparency);
  const colorInputRef = useRef<HTMLInputElement>(null);
  const activeToolRef = useRef<ToolType | null>(null);
  activeToolRef.current = activeTool;
  // True while the user is dragging the strip. Rust also moves this window
  // programmatically (cursor-monitor placement); persisting those moves
  // would permanently pin the toolbar to its first position.
  const userDragRef = useRef(false);

  // Load tool colors and panel opacity, and keep them in sync with the
  // Settings window (every save there emits "settings_updated", so dragging
  // the opacity slider live-previews on this strip)
  useEffect(() => {
    const refreshSettings = () => {
      loadSettings()
        .then((settings) => {
          setColors(settings.colors);
          setPanelOpacity(settings.panelTransparency);
        })
        .catch((error) => console.error("Failed to load settings:", error));
    };
    refreshSettings();

    const unlistenSettings = listen("settings_updated", refreshSettings);

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

    // Escape must work even when a toolbar click made this window key
    // (the overlay's own Escape handler only fires while the overlay is key)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        invoke("dismiss_overlay").catch(console.error);
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    // Persist position after the user drags the strip (debounced); moves
    // not preceded by a mousedown on the drag region are programmatic
    let moveTimer: ReturnType<typeof setTimeout> | null = null;
    const unlistenMoved = getCurrentWindow().onMoved(({ payload }) => {
      if (!userDragRef.current) return;
      if (moveTimer) clearTimeout(moveTimer);
      moveTimer = setTimeout(() => {
        userDragRef.current = false;
        invoke("save_mini_panel_position", { x: payload.x, y: payload.y, monitorId: null })
          .catch((error) => console.error("Failed to save toolbar position:", error));
      }, 500);
    });

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
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

  return (
    <div
      className="tb-root"
      data-tauri-drag-region
      onMouseDown={() => {
        userDragRef.current = true;
      }}
    >
      <style>{CSS}</style>

      <div
        className="tb-strip"
        data-tauri-drag-region
        // The opacity setting dims only the strip background; icons and
        // dividers stay legible at every level
        style={{ backgroundColor: `rgba(28, 28, 30, ${(0.94 * panelOpacity).toFixed(3)})` }}
      >
        <span className="tb-grip" data-tauri-drag-region title="Drag to move">
          {ICON_GRIP}
        </span>

        {TOOLS.map(({ tool, icon, label }) => (
          <button
            key={tool}
            type="button"
            className={`tb-btn${activeTool === tool ? " active" : ""}`}
            onClick={() => selectTool(tool)}
            title={`${label} tool`}
            aria-label={`${label} tool`}
          >
            {icon}
          </button>
        ))}

        <span className="tb-divider" />

        {/* Color swatch for the active tool (arrow when idle) */}
        <button
          type="button"
          className="tb-swatch"
          style={{ backgroundColor: swatchColor }}
          onClick={() => colorInputRef.current?.click()}
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

        <span className="tb-divider" />

        <button
          type="button"
          className="tb-btn"
          onClick={() => emit("undo-last-shape").catch(console.error)}
          title="Undo last shape"
          aria-label="Undo last shape"
        >
          {ICON_UNDO}
        </button>
        <button
          type="button"
          className="tb-btn"
          onClick={() => invoke("clear_all_shapes").catch(console.error)}
          title="Clear all shapes"
          aria-label="Clear all shapes"
        >
          {ICON_CLEAR}
        </button>

        <span className="tb-divider" />

        <button
          type="button"
          className="tb-btn"
          onClick={() => invoke("show_main_window").catch(console.error)}
          title="Settings"
          aria-label="Settings"
        >
          {ICON_GEAR}
        </button>
        <button
          type="button"
          className="tb-btn tb-quit"
          onClick={() => invoke("quit_app").catch(console.error)}
          title="Quit Annotatr"
          aria-label="Quit Annotatr"
        >
          {ICON_POWER}
        </button>
      </div>
    </div>
  );
}

const CSS = `
.tb-root {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  user-select: none;
  cursor: default;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
  -webkit-font-smoothing: antialiased;
}

.tb-strip {
  display: flex;
  align-items: center;
  gap: 2px;
  height: 44px;
  padding: 0 8px;
  border-radius: 13px;
  border: 0.5px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.38), inset 0 0.5px 0 rgba(255, 255, 255, 0.06);
  overflow: hidden;
}

.tb-grip {
  display: flex;
  align-items: center;
  padding: 0 3px;
  color: rgba(255, 255, 255, 0.32);
  cursor: grab;
}

.tb-grip svg { pointer-events: none; }

.tb-btn {
  flex: none;
  width: 32px;
  height: 32px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.82);
  background: transparent;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}

.tb-btn:hover { background: rgba(255, 255, 255, 0.09); color: #fff; }
.tb-btn:active { background: rgba(255, 255, 255, 0.14); }

.tb-btn.active {
  color: #fff;
  background: #0a84ff;
  box-shadow: inset 0 0.5px 0 rgba(255, 255, 255, 0.25), 0 1px 3px rgba(10, 132, 255, 0.4);
}

.tb-btn.active:hover { background: #1e8fff; }

.tb-quit { color: rgba(255, 118, 110, 0.9); }
.tb-quit:hover { background: rgba(255, 69, 58, 0.16); color: #ff766e; }

.tb-divider {
  flex: none;
  width: 1px;
  height: 22px;
  margin: 0 5px;
  background: rgba(255, 255, 255, 0.14);
}

.tb-swatch {
  flex: none;
  width: 26px;
  height: 26px;
  padding: 0;
  margin: 0 2px;
  border: none;
  border-radius: 8px;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.35), inset 0 -2px 4px rgba(0, 0, 0, 0.18), 0 1px 2px rgba(0, 0, 0, 0.3);
  cursor: pointer;
  transition: transform 0.1s;
}

.tb-swatch:hover { transform: scale(1.08); }
`;
