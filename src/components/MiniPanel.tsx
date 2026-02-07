import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ToolType } from "../types/shapes";

/**
 * MiniPanel Component
 * Floating toolbar with tool selection buttons for drawing shapes
 * Feature #19: Supports drag-to-reposition including off-screen placement
 */
export default function MiniPanel() {
  const [selectedTool, setSelectedTool] = useState<ToolType | null>(null);
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

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
   * Handle tool selection
   * Feature #18: Also activate overlay when a tool is selected via mini panel
   */
  const selectTool = async (tool: ToolType) => {
    setSelectedTool(tool);

    // Feature #18: Activate tool via hotkey command which handles overlay, drawing mode, and events
    try {
      await invoke("activate_tool_hotkey", { tool });
    } catch (error) {
      console.error("Failed to activate tool:", error);
    }

    console.log(`Selected tool: ${tool}, overlay and drawing mode activated`);
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
