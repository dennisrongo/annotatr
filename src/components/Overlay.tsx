import { useEffect, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface DrawingState {
  isDrawing: boolean;
  currentTool: string | null;
  startX: number;
  startY: number;
}

/**
 * Overlay Component
 * This component renders on the overlay window and handles:
 * - Escape key to dismiss overlay
 * - Drawing mode activation/deactivation
 * - Cursor changes based on drawing mode (Feature #16)
 * - Shape rendering
 */
export default function Overlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawingState, setDrawingState] = useState<DrawingState>({
    isDrawing: false,
    currentTool: null,
    startX: 0,
    startY: 0,
  });
  const [isVisible, setIsVisible] = useState(true);
  const [isDrawingMode, setIsDrawingMode] = useState(false);

  useEffect(() => {
    // Feature #10: Handle Escape key to dismiss overlay
    const handleKeyDown = async (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        console.log("Escape key pressed - dismissing overlay");
        event.preventDefault();

        try {
          // Call dismiss_overlay command
          await invoke("dismiss_overlay");

          // Clean up any active drawing state
          setDrawingState({
            isDrawing: false,
            currentTool: null,
            startX: 0,
            startY: 0,
          });

          setIsVisible(false);
        } catch (error) {
          console.error("Failed to dismiss overlay:", error);
        }
      }
    };

    // Add keyboard event listener
    window.addEventListener("keydown", handleKeyDown);

    // Listen for toggle events from hotkeys
    const unlistenToggle = listen<boolean>("toggle-overlay", async (event) => {
      console.log("Toggle overlay event received:", event.payload);

      try {
        const newState = await invoke<boolean>("toggle_overlay");
        setIsVisible(newState);

        if (!newState) {
          // Clear drawing state when hiding
          setDrawingState({
            isDrawing: false,
            currentTool: null,
            startX: 0,
            startY: 0,
          });
        }
      } catch (error) {
        console.error("Failed to toggle overlay:", error);
      }
    });

    // Listen for drawing mode changes
    const unlistenDrawingMode = listen<boolean>("drawing-mode-changed", (event) => {
      console.log("Drawing mode changed:", event.payload);

      if (!event.payload) {
        // Clear drawing state when drawing mode is deactivated
        setDrawingState({
          isDrawing: false,
          currentTool: null,
          startX: 0,
          startY: 0,
        });
      }
    });

    // Cleanup listeners on unmount
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      unlistenToggle.then((fn) => fn());
      unlistenDrawingMode.then((fn) => fn());
    };
  }, []);

  // Canvas drawing logic will be added later for features #13-#24
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size to match window
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    return () => {
      window.removeEventListener("resize", resizeCanvas);
    };
  }, []);

  if (!isVisible) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        pointerEvents: "auto",
        backgroundColor: "transparent",
        zIndex: 9999,
      }}
    >
      {/* Canvas for drawing shapes */}
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
        }}
      />

      {/* Visual indicator for overlay active */}
      <div
        style={{
          position: "absolute",
          bottom: 20,
          right: 20,
          padding: "8px 12px",
          backgroundColor: "rgba(0, 0, 0, 0.7)",
          color: "white",
          borderRadius: "4px",
          fontSize: "12px",
          pointerEvents: "none",
        }}
      >
        Overlay Active • Press <strong>Escape</strong> to dismiss
      </div>

      {/* Drawing tool indicator */}
      {drawingState.currentTool && (
        <div
          style={{
            position: "absolute",
            top: 20,
            left: 20,
            padding: "8px 12px",
            backgroundColor: "rgba(37, 99, 235, 0.9)",
            color: "white",
            borderRadius: "4px",
            fontSize: "12px",
            pointerEvents: "none",
          }}
        >
          Tool: <strong>{drawingState.currentTool}</strong>
        </div>
      )}
    </div>
  );
}
