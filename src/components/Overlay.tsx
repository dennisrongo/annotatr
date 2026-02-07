import { useEffect, useState, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ToolType, Shape, ArrowShape, CircleShape, BoxShape, FreehandShape, HighlighterShape, TextShape, Point } from "../types/shapes";
import { drawShape, redrawShapes } from "../lib/drawing";

interface DrawingState {
  isDrawing: boolean;
  currentTool: ToolType | null;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  freehandPoints: Point[]; // For freehand and highlighter
  textInput: string; // For text tool
  textPosition: Point | null; // For text tool
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
    freehandPoints: [],
    textInput: "",
    textPosition: null,
  });
  const [isVisible, setIsVisible] = useState(true);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [currentTool, setCurrentTool] = useState<ToolType | null>(null);
  const [textInputVisible, setTextInputVisible] = useState(false);
  const [textInputPosition, setTextInputPosition] = useState<Point>({ x: 0, y: 0 });
  const [textInputValue, setTextInputValue] = useState("");
  const textInputRef = useRef<HTMLInputElement>(null);

  // Default drawing settings
  const defaultColor = "#FF0000";
  const defaultLineThickness = 12;

  // Feature #17: Tool-specific visual indicators (icons, colors, labels)
  const toolIndicators: Record<ToolType, { icon: string; color: string; label: string }> = {
    [ToolType.ARROW]: { icon: "↗", color: "#3b82f6", label: "Arrow" },
    [ToolType.CIRCLE]: { icon: "○", color: "#10b981", label: "Circle" },
    [ToolType.BOX]: { icon: "□", color: "#f59e0b", label: "Box" },
    [ToolType.FREEHAND]: { icon: "✎", color: "#ef4444", label: "Freehand" },
    [ToolType.HIGHLIGHTER]: { icon: "▭", color: "#eab308", label: "Highlighter" },
    [ToolType.TEXT]: { icon: "T", color: "#8b5cf6", label: "Text" },
  };

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
   * Create freehand shape from drawing state
   */
  const createFreehandShape = useCallback((points: Point[]): FreehandShape => {
    return {
      id: generateShapeId(),
      tool: ToolType.FREEHAND,
      points: [...points],
      color: defaultColor,
      lineThickness: defaultLineThickness,
      createdAt: Date.now(),
    };
  }, [generateShapeId]);

  /**
   * Create highlighter shape from drawing state
   */
  const createHighlighterShape = useCallback((points: Point[]): HighlighterShape => {
    return {
      id: generateShapeId(),
      tool: ToolType.HIGHLIGHTER,
      points: [...points],
      color: defaultColor,
      lineThickness: defaultLineThickness,
      opacity: 0.3, // Semi-transparent
      createdAt: Date.now(),
    };
  }, [generateShapeId]);

  /**
   * Create text shape from drawing state
   */
  const createTextShape = useCallback((
    position: Point,
    text: string
  ): TextShape => {
    return {
      id: generateShapeId(),
      tool: ToolType.TEXT,
      position,
      text,
      color: defaultColor,
      lineThickness: 0, // Not used for text
      fontSize: 24, // Default font size
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

    // For text tool, show inline input at click location
    if (currentTool === ToolType.TEXT) {
      setTextInputPosition({ x: startX, y: startY });
      setTextInputValue("");
      setTextInputVisible(true);
      // Focus the input after it's rendered
      setTimeout(() => {
        textInputRef.current?.focus();
      }, 0);
      return;
    }

    // For freehand and highlighter, start tracking points
    const initialPoints = currentTool === ToolType.FREEHAND || currentTool === ToolType.HIGHLIGHTER
      ? [{ x: startX, y: startY }]
      : [];

    setDrawingState({
      isDrawing: true,
      currentTool,
      startX,
      startY,
      currentX: startX,
      currentY: startY,
      freehandPoints: initialPoints,
      textInput: "",
      textPosition: null,
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

    // For freehand and highlighter, add points to the path
    if (currentTool === ToolType.FREEHAND || currentTool === ToolType.HIGHLIGHTER) {
      const newPoint = { x: currentX, y: currentY };
      setDrawingState(prev => ({
        ...prev,
        currentX,
        currentY,
        freehandPoints: [...prev.freehandPoints, newPoint],
      }));

      // Redraw existing shapes and preview
      const context = getCanvasContext();
      if (!context) return;

      const { ctx } = context;

      // Clear and redraw all existing shapes
      redrawShapes(ctx, shapesRef.current);

      // Draw preview of current freehand path
      const previewShape = currentTool === ToolType.FREEHAND
        ? createFreehandShape([...drawingState.freehandPoints, newPoint])
        : createHighlighterShape([...drawingState.freehandPoints, newPoint]);

      drawShape(ctx, previewShape);
      return;
    }

    // For arrow, circle, box - update drawing state
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
  }, [drawingState.isDrawing, drawingState.startX, drawingState.startY, drawingState.freehandPoints, currentTool, getCanvasContext, createArrowShape, createCircleShape, createBoxShape, createFreehandShape, createHighlighterShape]);

  /**
   * Handle text input submission
   */
  const handleTextInputSubmit = useCallback(() => {
    if (!textInputValue.trim()) {
      setTextInputVisible(false);
      return;
    }

    const newTextShape = createTextShape(textInputPosition, textInputValue);
    shapesRef.current.push(newTextShape);
    console.log("Created text shape:", newTextShape);

    setTextInputVisible(false);
    setTextInputValue("");
    redrawAllShapes();
  }, [textInputValue, textInputPosition, createTextShape, redrawAllShapes]);

  /**
   * Handle text input keydown (Enter to submit, Escape to cancel)
   */
  const handleTextInputKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleTextInputSubmit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setTextInputVisible(false);
      setTextInputValue("");
    }
  }, [handleTextInputSubmit]);

  /**
   * Handle mouse up - complete shape
   */
  const handleMouseUp = useCallback(() => {
    if (!drawingState.isDrawing || !currentTool) return;

    const { startX, startY, currentX, currentY, freehandPoints } = drawingState;

    // Create the final shape
    let newShape: Shape;

    switch (currentTool) {
      case ToolType.FREEHAND:
        if (freehandPoints.length < 2) {
          console.log("Freehand path too short, not creating");
          setDrawingState({
            isDrawing: false,
            currentTool: null,
            startX: 0,
            startY: 0,
            currentX: 0,
            currentY: 0,
            freehandPoints: [],
            textInput: "",
            textPosition: null,
          });
          return;
        }
        newShape = createFreehandShape(freehandPoints);
        break;
      case ToolType.HIGHLIGHTER:
        if (freehandPoints.length < 2) {
          console.log("Highlighter path too short, not creating");
          setDrawingState({
            isDrawing: false,
            currentTool: null,
            startX: 0,
            startY: 0,
            currentX: 0,
            currentY: 0,
            freehandPoints: [],
            textInput: "",
            textPosition: null,
          });
          return;
        }
        newShape = createHighlighterShape(freehandPoints);
        break;
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
      freehandPoints: [],
      textInput: "",
      textPosition: null,
    });

    // Redraw all shapes
    redrawAllShapes();
  }, [drawingState, currentTool, createArrowShape, createCircleShape, createBoxShape, createFreehandShape, createHighlighterShape, redrawAllShapes]);

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
            freehandPoints: [],
            textInput: "",
            textPosition: null,
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
            freehandPoints: [],
            textInput: "",
            textPosition: null,
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
          freehandPoints: [],
          textInput: "",
          textPosition: null,
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

    // Feature #20: Listen for overlay dismissed event to clean up shapes
    const unlistenOverlayDismissed = listen("overlay-dismissed", () => {
      console.log("Overlay dismissed event received - cleaning up");

      // Clear all shapes
      shapesRef.current = [];

      // Clear drawing state
      setDrawingState({
        isDrawing: false,
        currentTool: null,
        startX: 0,
        startY: 0,
        currentX: 0,
        currentY: 0,
        freehandPoints: [],
        textInput: "",
        textPosition: null,
      });
      setCurrentTool(null);

      // Clear canvas
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }

      console.log("Overlay cleanup complete");
    });

    // Feature #20: Listen for clear all shapes event
    const unlistenClearShapes = listen("clear-all-shapes", () => {
      console.log("Clear all shapes event received");

      // Clear all shapes
      shapesRef.current = [];

      // Clear canvas
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }

      console.log("All shapes cleared");
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
      unlistenToolSelected.then((fn) => fn()).catch(console.error);
      unlistenOverlayDismissed.then((fn) => fn()).catch(console.error);
      unlistenClearShapes.then((fn) => fn()).catch(console.error);
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

      {/* Feature #17: Enhanced drawing tool indicator with icon and color coding */}
      {currentTool && (
        <div
          style={{
            position: "absolute",
            top: 20,
            left: 20,
            padding: "12px 16px",
            backgroundColor: toolIndicators[currentTool].color,
            color: "white",
            borderRadius: "8px",
            fontSize: "16px",
            fontWeight: "bold",
            pointerEvents: "none",
            boxShadow: "0 4px 6px rgba(0, 0, 0, 0.3)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            border: "2px solid rgba(255, 255, 255, 0.3)",
          }}
        >
          <span style={{ fontSize: "24px" }}>{toolIndicators[currentTool].icon}</span>
          <span>{toolIndicators[currentTool].label}</span>
          {isDrawingMode && (
            <span style={{ fontSize: "12px", marginLeft: "8px", opacity: 0.9 }}>
              • Active
            </span>
          )}
        </div>
      )}

      {/* Shape count indicator */}
      <div
        style={{
          position: "absolute",
          top: 20,
          right: 20,
          padding: "8px 12px",
          backgroundColor: "rgba(0, 128, 0, 0.7)",
          color: "white",
          borderRadius: "4px",
          fontSize: "12px",
          pointerEvents: "none",
        }}
      >
        Shapes: <strong>{shapesRef.current.length}</strong>
      </div>

      {/* Text input field (shown when text tool is used) */}
      {textInputVisible && (
        <input
          ref={textInputRef}
          type="text"
          value={textInputValue}
          onChange={(e) => setTextInputValue(e.target.value)}
          onKeyDown={handleTextInputKeyDown}
          onBlur={handleTextInputSubmit}
          style={{
            position: "absolute",
            left: textInputPosition.x,
            top: textInputPosition.y,
            fontSize: "24px",
            padding: "4px 8px",
            border: "2px solid #FF0000",
            borderRadius: "4px",
            outline: "none",
            backgroundColor: "rgba(255, 255, 255, 0.9)",
            color: "#000000",
            minWidth: "200px",
            zIndex: 10000,
          }}
          placeholder="Type text and press Enter..."
        />
      )}
    </div>
  );
}
