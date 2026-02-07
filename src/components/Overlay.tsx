import { useEffect, useState, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ToolType, Shape, ArrowShape, CircleShape, BoxShape } from "../types/shapes";
import { drawShape, redrawShapes } from "../lib/drawing";

interface DrawingState {
  isDrawing: boolean;
  currentTool: ToolType | null;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
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
  const shapesRef = useRef<Shape[]>([]);
  const [drawingState, setDrawingState] = useState<DrawingState>({
    isDrawing: false,
    currentTool: null,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
  });
  const [isVisible, setIsVisible] = useState(true);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [currentTool, setCurrentTool] = useState<ToolType | null>(null);

  // Default drawing settings
  const defaultColor = "#FF0000";
  const defaultLineThickness = 12;

  /**
   * Generate a unique ID for shapes
   */
  const generateShapeId = useCallback(() => {
    return `shape_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  /**
   * Get canvas context with validation
   */
  const getCanvasContext = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    return { canvas, ctx };
  }, []);

  /**
   * Redraw all existing shapes
   */
  const redrawAllShapes = useCallback(() => {
    const context = getCanvasContext();
    if (!context) return;

    const { ctx } = context;
    redrawShapes(ctx, shapesRef.current);
  }, [getCanvasContext]);

  /**
   * Create arrow shape from drawing state
   */
  const createArrowShape = useCallback((
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ): ArrowShape => {
    return {
      id: generateShapeId(),
      tool: ToolType.ARROW,
      startPoint: { x: startX, y: startY },
      endPoint: { x: endX, y: endY },
      color: defaultColor,
      lineThickness: defaultLineThickness,
      createdAt: Date.now(),
    };
  }, [generateShapeId]);

  /**
   * Create circle shape from drawing state
   */
  const createCircleShape = useCallback((
    startX: number,
    startY: number,
    currentX: number,
    currentY: number
  ): CircleShape => {
    const centerX = startX;
    const centerY = startY;
    const radiusX = Math.abs(currentX - startX);
    const radiusY = Math.abs(currentY - startY);

    return {
      id: generateShapeId(),
      tool: ToolType.CIRCLE,
      center: { x: centerX, y: centerY },
      radius: Math.max(radiusX, radiusY),
      radiusX,
      radiusY,
      color: defaultColor,
      lineThickness: defaultLineThickness,
      createdAt: Date.now(),
    };
  }, [generateShapeId]);

  /**
   * Create box shape from drawing state
   */
  const createBoxShape = useCallback((
    startX: number,
    startY: number,
    currentX: number,
    currentY: number
  ): BoxShape => {
    const width = currentX - startX;
    const height = currentY - startY;

    return {
      id: generateShapeId(),
      tool: ToolType.BOX,
      startPoint: { x: startX, y: startY },
      endPoint: { x: currentX, y: currentY },
      width,
      height,
      color: defaultColor,
      lineThickness: defaultLineThickness,
      createdAt: Date.now(),
    };
  }, [generateShapeId]);

  /**
   * Handle mouse down - start drawing
   */
  const handleMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawingMode || !currentTool) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const startX = event.clientX - rect.left;
    const startY = event.clientY - rect.top;

    setDrawingState({
      isDrawing: true,
      currentTool,
      startX,
      startY,
      currentX: startX,
      currentY: startY,
    });

    console.log(`Started drawing ${currentTool} at (${startX}, ${startY})`);
  }, [isDrawingMode, currentTool]);

  /**
   * Handle mouse move - update preview
   */
  const handleMouseMove = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!drawingState.isDrawing || !currentTool) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const currentX = event.clientX - rect.left;
    const currentY = event.clientY - rect.top;

    // Update drawing state
    setDrawingState(prev => ({
      ...prev,
      currentX,
      currentY,
    }));

    // Redraw existing shapes and preview
    const context = getCanvasContext();
    if (!context) return;

    const { ctx } = context;

    // Clear and redraw all existing shapes
    redrawShapes(ctx, shapesRef.current);

    // Draw preview of current shape
    let previewShape: Shape;

    switch (currentTool) {
      case ToolType.ARROW:
        previewShape = createArrowShape(drawingState.startX, drawingState.startY, currentX, currentY);
        break;
      case ToolType.CIRCLE:
        previewShape = createCircleShape(drawingState.startX, drawingState.startY, currentX, currentY);
        break;
      case ToolType.BOX:
        previewShape = createBoxShape(drawingState.startX, drawingState.startY, currentX, currentY);
        break;
      default:
        return;
    }

    drawShape(ctx, previewShape);
  }, [drawingState.isDrawing, drawingState.startX, drawingState.startY, currentTool, getCanvasContext, createArrowShape, createCircleShape, createBoxShape]);

  /**
   * Handle mouse up - complete shape
   */
  const handleMouseUp = useCallback(() => {
    if (!drawingState.isDrawing || !currentTool) return;

    const { startX, startY, currentX, currentY } = drawingState;

    // Don't create tiny shapes from accidental clicks
    const distance = Math.sqrt(Math.pow(currentX - startX, 2) + Math.pow(currentY - startY, 2));
    if (distance < 5) {
      console.log("Shape too small, not creating");
      setDrawingState({
        isDrawing: false,
        currentTool: null,
        startX: 0,
        startY: 0,
        currentX: 0,
        currentY: 0,
      });
      return;
    }

    // Create the final shape
    let newShape: Shape;

    switch (currentTool) {
      case ToolType.ARROW:
        newShape = createArrowShape(startX, startY, currentX, currentY);
        break;
      case ToolType.CIRCLE:
        newShape = createCircleShape(startX, startY, currentX, currentY);
        break;
      case ToolType.BOX:
        newShape = createBoxShape(startX, startY, currentX, currentY);
        break;
      default:
        return;
    }

    // Add shape to collection
    shapesRef.current.push(newShape);

    console.log(`Created ${currentTool} shape:`, newShape);

    // Reset drawing state
    setDrawingState({
      isDrawing: false,
      currentTool: null,
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
    });

    // Redraw all shapes
    redrawAllShapes();
  }, [drawingState, currentTool, createArrowShape, createCircleShape, createBoxShape, redrawAllShapes]);
  const [currentTool, setCurrentTool] = useState<ToolType | null>(null);

  // Default drawing settings
  const defaultColor = "#FF0000";
  const defaultLineThickness = 12;

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
            currentX: 0,
            currentY: 0,
          });
          setCurrentTool(null);

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
            currentX: 0,
            currentY: 0,
          });
          setCurrentTool(null);
        }
      } catch (error) {
        console.error("Failed to toggle overlay:", error);
      }
    });

    // Listen for drawing mode changes
    const unlistenDrawingMode = listen<boolean>("drawing-mode-changed", (event) => {
      console.log("Drawing mode changed:", event.payload);

      // Feature #16: Update drawing mode state for cursor management
      setIsDrawingMode(event.payload);

      if (!event.payload) {
        // Clear drawing state when drawing mode is deactivated
        setDrawingState({
          isDrawing: false,
          currentTool: null,
          startX: 0,
          startY: 0,
          currentX: 0,
          currentY: 0,
        });
        setCurrentTool(null);
      }
    });

    // Listen for tool selection events
    const unlistenToolSelected = listen<string>("tool-selected", (event) => {
      console.log("Tool selected:", event.payload);
      const tool = event.payload as ToolType;

      if (Object.values(ToolType).includes(tool)) {
        setCurrentTool(tool);
        console.log(`Tool changed to: ${tool}`);
      }
    });

    // Feature #15: Handle window focus changes to ensure z-index stays on top
    const handleFocus = async () => {
      console.log("Overlay window focused - ensuring z-index");
      try {
        await invoke("ensure_on_top");
      } catch (error) {
        console.error("Failed to ensure on top:", error);
      }
    };

    // Feature #15: Handle window visibility changes to ensure z-index
    const handleVisibilityChange = async () => {
      if (document.visibilityState === "visible" && isVisible) {
        console.log("Overlay became visible - ensuring z-index");
        try {
          await invoke("ensure_on_top");
        } catch (error) {
          console.error("Failed to ensure on top:", error);
        }
      }
    };

    // Add focus and visibility listeners
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Feature #15: Periodic z-index check every 5 seconds to ensure overlay stays on top
    const zIndexCheckInterval = setInterval(async () => {
      if (isVisible) {
        try {
          await invoke("ensure_on_top");
        } catch (error) {
          console.error("Failed to ensure on top during periodic check:", error);
        }
      }
    }, 5000);

    // Cleanup listeners on unmount
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearInterval(zIndexCheckInterval);
      unlistenToggle.then((fn) => fn());
      unlistenDrawingMode.then((fn) => fn());
      unlistenToolSelected.then((fn) => fn());
    };
  }, [isVisible]);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size to match window
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      // Redraw shapes after resize
      redrawShapes(ctx, shapesRef.current);
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    return () => {
      window.removeEventListener("resize", resizeCanvas);
    };
  }, [redrawAllShapes]);

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
        // Feature #16: Change cursor based on drawing mode
        cursor: isDrawingMode ? "crosshair" : "default",
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
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
