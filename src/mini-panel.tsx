import { useState } from "react";
import { emit } from "@tauri-apps/api/event";
import { ToolType } from "./types/shapes";

export default function MiniPanel() {
  const [selectedTool, setSelectedTool] = useState<string>("arrow");

  const tools = [
    { id: "arrow", label: "Arrow", hotkey: "Ctrl+Shift+A", toolType: ToolType.ARROW },
    { id: "circle", label: "Circle", hotkey: "Ctrl+Shift+C", toolType: ToolType.CIRCLE },
    { id: "box", label: "Box", hotkey: "Ctrl+Shift+B", toolType: ToolType.BOX },
    { id: "freehand", label: "Freehand", hotkey: "Ctrl+Shift+F", toolType: ToolType.FREEHAND },
    { id: "highlighter", label: "Highlighter", hotkey: "Ctrl+Shift+H", toolType: ToolType.HIGHLIGHTER },
    { id: "text", label: "Text", hotkey: "Ctrl+Shift+T", toolType: ToolType.TEXT },
  ];

  /**
   * Handle tool selection and emit event to overlay
   */
  const selectTool = async (toolId: string, toolType: ToolType) => {
    setSelectedTool(toolId);

    // Emit event to notify overlay of tool selection
    await emit("tool-selected", toolType);

    console.log(`Selected tool: ${toolId} (${toolType})`);
  };

  return (
    <div className="mini-panel">
      <div className="tool-buttons">
        {tools.map((tool) => (
          <button
            key={tool.id}
            className={`tool-button ${selectedTool === tool.id ? "active" : ""}`}
            onClick={() => selectTool(tool.id, tool.toolType)}
            title={`${tool.label} (${tool.hotkey})`}
          >
            {tool.label[0]}
          </button>
        ))}
      </div>
    </div>
  );
}
