import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ToolType } from "../types/shapes";
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from "../lib/storage";

/**
 * MiniPanel Component
 * Floating toolbar with tool selection buttons for drawing shapes
 * Feature #19: Supports drag-to-reposition including off-screen placement
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

export default function MiniPanel() {
  const [selectedTool, setSelectedTool] = useState<ToolType | null>(null);
  const [position, setPosition] = useState({ x: 20, y: 20 });
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
  const [showCustomColorPicker, setShowCustomColorPicker] = useState(false);
  const customColorInputRef = useRef<HTMLInputElement>(null);

  // Feature #46: Line thickness control state
  const [lineThickness, setLineThickness] = useState(DEFAULT_SETTINGS.lineThickness);

  // Feature #47: Font size control state
  const [fontSize, setFontSize] = useState(DEFAULT_SETTINGS.fontSize);

  /**
   * Feature #19: Restore panel position on mount
   * Loads saved position from storage (including off-screen positions)
   */
  useEffect(() => {
    const restorePosition = async () => {
      try {
        const result = await invoke<Record<string, any>>("restore_mini_panel_position");
        if (result && typeof result === "object") {
          const x = result.x as number;
          const y = result.y as number;
          setPosition({ x, y });
          console.log("Panel position restored:", { x, y });
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
   */
  useEffect(() => {
    const loadLineThickness = async () => {
      try {
        const settings = await loadSettings();
        setLineThickness(settings.lineThickness);
        console.log("Line thickness loaded:", settings.lineThickness);
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
        await saveSettings({ colors: updatedColors });
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
    setShowCustomColorPicker(false);
  };

  /**
   * Feature #45: Open custom color picker dialog
   * Triggers the hidden color input click
   */
  const openCustomColorPicker = () => {
    customColorInputRef.current?.click();
  };

  /**
   * Feature #46: Handle line thickness change
   * Updates line thickness and saves to settings
   */
  const handleLineThicknessChange = async (value: number) => {
    setLineThickness(value);

    // Save to persistent storage
    try {
      await saveSettings({ lineThickness: value });
      console.log(`Line thickness updated to: ${value}`);
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
   * Feature #19: Handle drag move and save
   */
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const newX = e.clientX - dragOffset.x;
        const newY = e.clientY - dragOffset.y;
        setPosition({ x: newX, y: newY });
      }
    };

    const handleMouseUp = async () => {
      if (isDragging) {
        setIsDragging(false);
        try {
          await invoke("save_mini_panel_position", {
            x: position.x,
            y: position.y,
          });
          console.log("Panel position saved:", position);
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
  }, [isDragging, dragOffset, position]);

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
          backgroundColor: isSelected ? "rgba(37, 99, 235, 0.9)" : "rgba(255, 255, 255, 0.9)",
          color: isSelected ? "white" : "black",
          border: isSelected ? "2px solid #2563eb" : "1px solid #ccc",
          borderRadius: "4px",
          cursor: "pointer",
          fontSize: "12px",
          fontWeight: isSelected ? "bold" : "normal",
          transition: "all 0.2s ease",
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
        position: "fixed",
        left: position.x,
        top: position.y,
        padding: "12px",
        backgroundColor: "rgba(240, 240, 240, 0.95)",
        borderRadius: "8px",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
        zIndex: 10000,
        minWidth: "200px",
        cursor: isDragging ? "grabbing" : "default",
        userSelect: isDragging ? "none" : "auto",
      }}
    >
      {/* Feature #19: Draggable header */}
      <div
        className="panel-header"
        style={{
          margin: "-12px -12px 12px -12px",
          padding: "8px 12px",
          backgroundColor: "rgba(220, 220, 220, 0.95)",
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
      <div
        style={{
          marginTop: "4px",
          fontSize: "9px",
          color: "#aaa",
          textAlign: "center",
        }}
      >
        Pos: ({position.x}, {position.y})
      </div>
    </div>
  );
}
