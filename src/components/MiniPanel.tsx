import { useState, useEffect, useRef } from "react";
import { emit } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { ToolType } from "../types/shapes";

/**
 * MiniPanel Component
 * Floating toolbar with tool selection buttons for drawing shapes
 * Feature #19: Supports drag-to-reposition including off-screen placement
 */
export default function MiniPanel() {
  const [selectedTool, setSelectedTool] = useState<ToolType | null>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  /**
   * Handle tool selection
   * Feature #18: Also activate overlay when a tool is selected via mini panel
   */
  const selectTool = async (tool: ToolType) => {
    setSelectedTool(tool);

    // Feature #18: Show overlay if not already visible
    try {
      await invoke("show_overlay");
    } catch (error) {
      console.error("Failed to show overlay:", error);
    }

    // Emit event to notify overlay of tool selection
    await emit("tool-selected", tool);

    console.log(`Selected tool: ${tool}, overlay activated`);
  };

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
      style={{
        position: "fixed",
        top: 20,
        right: 20,
        padding: "12px",
        backgroundColor: "rgba(240, 240, 240, 0.95)",
        borderRadius: "8px",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
        zIndex: 10000,
        minWidth: "200px",
      }}
    >
      <h3
        style={{
          margin: "0 0 12px 0",
          fontSize: "14px",
          fontWeight: "bold",
          color: "#333",
          textAlign: "center",
        }}
      >
        Drawing Tools
      </h3>

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
    </div>
  );
}
