import { useState } from "react";

export default function MiniPanel() {
  const [selectedTool, setSelectedTool] = useState<string>("arrow");

  const tools = [
    { id: "arrow", label: "Arrow", hotkey: "Ctrl+Shift+A" },
    { id: "circle", label: "Circle", hotkey: "Ctrl+Shift+C" },
    { id: "box", label: "Box", hotkey: "Ctrl+Shift+B" },
    { id: "freehand", label: "Freehand", hotkey: "Ctrl+Shift+F" },
    { id: "highlighter", label: "Highlighter", hotkey: "Ctrl+Shift+H" },
    { id: "text", label: "Text", hotkey: "Ctrl+Shift+T" },
  ];

  return (
    <div className="mini-panel">
      <div className="tool-buttons">
        {tools.map((tool) => (
          <button
            key={tool.id}
            className={`tool-button ${selectedTool === tool.id ? "active" : ""}`}
            onClick={() => setSelectedTool(tool.id)}
            title={`${tool.label} (${tool.hotkey})`}
          >
            {tool.label[0]}
          </button>
        ))}
      </div>
    </div>
  );
}
