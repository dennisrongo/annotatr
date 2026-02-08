import { useEffect, useState, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ToolType, Shape, ArrowShape, CircleShape, BoxShape, FreehandShape, HighlighterShape, TextShape, Point } from "../types/shapes";
import { drawShape, redrawShapes } from "../lib/drawing";
import { loadSettings, Settings, DEFAULT_SETTINGS } from "../lib/storage";

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

  // Feature #30 & #31: Settings state for font size and colors
  const [settings, setSettings] = useState<Settings | null>(null);

  // Feature #9: Track current monitor ID for shape confinement
  const [currentMonitor, setCurrentMonitor] = useState<string | null>(null);

  // Feature #67: Visual feedback when hotkey triggers
  const [hotkeyFeedback, setHotkeyFeedback] = useState<{
    visible: boolean;
    tool: string;
    icon: string;
  }>({ visible: false, tool: "", icon: "" });
  const hotkeyFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Default drawing settings (fallbacks until settings load)
  const defaultColor = "#FF0000";
  const defaultLineThickness = 12;
  const defaultFontSize = 24;

  // Feature #105: Get tool-specific color from settings
  const getToolColor = useCallback((tool: ToolType | null): string => {
    if (!tool || !settings) return defaultColor;

    // Map tool type to color setting key
    const toolColorKey: Record<ToolType, keyof Settings['colors']> = {
      [ToolType.ARROW]: 'arrow',
      [ToolType.CIRCLE]: 'circle',
      [ToolType.BOX]: 'box',
      [ToolType.FREEHAND]: 'freehand',
      [ToolType.HIGHLIGHTER]: 'highlighter',
      [ToolType.TEXT]: 'text',
    };

    const colorKey = toolColorKey[tool];
    return settings.colors[colorKey] || defaultColor;
  }, [settings, defaultColor]);

  // Feature #106: Get tool-specific line thickness from settings
  const getToolLineThickness = useCallback((tool: ToolType | null): number => {
    if (!tool || !settings) return defaultLineThickness;

    // Map tool type to line thickness setting key
    const toolThicknessKey: Record<ToolType, keyof Settings['lineThickness']> = {
      [ToolType.ARROW]: 'arrow',
      [ToolType.CIRCLE]: 'circle',
      [ToolType.BOX]: 'box',
      [ToolType.FREEHAND]: 'freehand',
      [ToolType.HIGHLIGHTER]: 'highlighter',
      [ToolType.TEXT]: 'text',
    };

    const thicknessKey = toolThicknessKey[tool];
    return settings.lineThickness[thicknessKey] || defaultLineThickness;
  }, [settings, defaultLineThickness]);

  // Feature #73: Auto-fade system - track shape opacities for smooth fade-out
  const [shapeOpacities, setShapeOpacities] = useState<Record<string, number>>({});

  // Feature #128: Custom fade duration for the next shape (null = use global setting)
  const [customFadeDuration, setCustomFadeDuration] = useState<number | null>(null);

  // Feature #17: Tool-specific visual indicators (icons, colors, labels)
  const toolIndicators: Record<ToolType, { icon: string; color: string; label: string }> = {
    [ToolType.ARROW]: { icon: "↗", color: "#3b82f6", label: "Arrow" },
    [ToolType.CIRCLE]: { icon: "○", color: "#10b981", label: "Circle" },
    [ToolType.BOX]: { icon: "□", color: "#f59e0b", label: "Box" },
    [ToolType.FREEHAND]: { icon: "✎", color: "#ef4444", label: "Freehand" },
    [ToolType.HIGHLIGHTER]: { icon: "▭", color: "#eab308", label: "Highlighter" },
    [ToolType.TEXT]: { icon: "T", color: "#8b5cf6", label: "Text" },
  };

  // Feature #107: Tool-specific cursor styles
  const getToolCursor = useCallback((tool: ToolType | null, drawingMode: boolean): string => {
    // If not in drawing mode or no tool selected, use default cursor
    if (!drawingMode || !tool) {
      return "default";
    }

    // Return tool-specific cursor
    // Using CSS cursor values that provide good visual feedback
    switch (tool) {
      case ToolType.ARROW:
        return "crosshair"; // Precision cursor for arrow drawing
      case ToolType.CIRCLE:
        return "crosshair"; // Precision cursor for circle drawing
      case ToolType.BOX:
        return "crosshair"; // Precision cursor for box drawing
      case ToolType.FREEHAND:
        return "crosshair"; // Standard drawing cursor for freehand
      case ToolType.HIGHLIGHTER:
        return "crosshair"; // Standard drawing cursor for highlighter
      case ToolType.TEXT:
        return "text"; // Text cursor (I-beam) for text input
      default:
        return "crosshair";
    }
  }, []);

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
   * Feature #73: Smooth easing function for fade-out animation
   * Uses ease-out cubic for smooth deceleration
   */
  const getFadeOpacity = useCallback((age: number, fadeDuration: number): number => {
    // Start fading when shape is 80% through its lifetime
    const fadeStart = fadeDuration * 0.8;
    const fadeEnd = fadeDuration;
    const fadeDurationActual = fadeEnd - fadeStart;

    // Before fade starts, full opacity
    if (age < fadeStart) {
      return 1.0;
    }

    // After fade ends, zero opacity
    if (age >= fadeEnd) {
      return 0.0;
    }

    // During fade, use ease-out cubic: 1 - (1 - t)^3
    // t goes from 0 (start of fade) to 1 (end of fade)
    const t = (age - fadeStart) / fadeDurationActual;
    const opacity = 1 - Math.pow(1 - t, 3);

    // Invert opacity (1.0 -> 0.0)
    return 1 - opacity;
  }, []);

  /**
   * Redraw all existing shapes with opacity support
   * Feature #73: Apply smooth fade-out opacities
   */
  const redrawAllShapes = useCallback(() => {
    const context = getCanvasContext();
    if (!context) return;

    const { ctx } = context;
    redrawShapes(ctx, shapesRef.current, shapeOpacities);
  }, [getCanvasContext, shapeOpacities]);

  /**
   * Feature #120: Cleanup opacity tracking for specific shape IDs
   * Prevents memory leaks when shapes are removed
   */
  const cleanupOpacityTracking = useCallback((shapeIds: string | string[]) => {
    const idsToRemove = Array.isArray(shapeIds) ? shapeIds : [shapeIds];

    if (idsToRemove.length === 0) return;

    const newOpacities = { ...shapeOpacities };
    let cleanedCount = 0;

    idsToRemove.forEach(id => {
      if (newOpacities[id]) {
        delete newOpacities[id];
        cleanedCount++;
      }
    });

    if (cleanedCount > 0) {
      setShapeOpacities(newOpacities);
      console.log(`[Feature #120] Cleaned up opacity tracking for ${cleanedCount} shape(s)`);
    }
  }, [shapeOpacities]);

  /**
   * Feature #123: Undo the most recently created shape
   * Removes the last shape from the shapes array and redraws the canvas
   */
  const undoLastShape = useCallback(() => {
    if (shapesRef.current.length === 0) {
      console.log("[Undo] No shapes to undo");
      return;
    }

    // Remove the last shape
    const removedShape = shapesRef.current.pop();

    // Feature #120: Clean up opacity tracking using centralized function
    if (removedShape) {
      cleanupOpacityTracking(removedShape.id);
    }

    console.log(`[Undo] Removed shape: ${removedShape?.tool} (${removedShape?.id})`);
    console.log(`[Undo] Remaining shapes: ${shapesRef.current.length}`);

    // Redraw the canvas
    redrawAllShapes();
  }, [cleanupOpacityTracking, redrawAllShapes]);

  /**
   * Feature #67: Show visual feedback when a hotkey is triggered
   * Displays a brief flash notification with the tool name and icon
   */
  const showHotkeyFeedback = useCallback((tool: ToolType) => {
    // Clear any existing timer
    if (hotkeyFeedbackTimerRef.current) {
      clearTimeout(hotkeyFeedbackTimerRef.current);
    }

    // Get tool indicator
    const indicator = toolIndicators[tool];
    if (!indicator) return;

    // Show feedback
    setHotkeyFeedback({
      visible: true,
      tool: indicator.label,
      icon: indicator.icon,
    });

    // Hide after 800ms
    hotkeyFeedbackTimerRef.current = setTimeout(() => {
      setHotkeyFeedback({ visible: false, tool: "", icon: "" });
    }, 800);

    console.log(`Hotkey feedback shown for: ${indicator.label}`);
  }, [toolIndicators]);

  /**
   * Create arrow shape from drawing state
   * Feature #9: Includes monitorId for per-monitor shape confinement
   * Feature #128: Includes customFadeDuration if set
   */
  const createArrowShape = useCallback((
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ): ArrowShape => {
    const shape: ArrowShape = {
      id: generateShapeId(),
      tool: ToolType.ARROW,
      startPoint: { x: startX, y: startY },
      endPoint: { x: endX, y: endY },
      color: getToolColor(ToolType.ARROW), // Feature #105: Use tool-specific color
      lineThickness: getToolLineThickness(ToolType.ARROW), // Feature #106: Use tool-specific line thickness
      createdAt: Date.now(),
      monitorId: currentMonitor || "default", // Feature #9: Track monitor ID
    };

    // Feature #128: Add custom fade duration if set
    if (customFadeDuration !== null) {
      shape.customFadeDuration = customFadeDuration;
      console.log(`[Feature #128] Applied custom fade duration: ${customFadeDuration}s to arrow shape`);
    }

    return shape;
  }, [generateShapeId, currentMonitor, getToolColor, getToolLineThickness, customFadeDuration]);

  /**
   * Create circle shape from drawing state
   * Feature #9: Includes monitorId for per-monitor shape confinement
   * Feature #128: Includes customFadeDuration if set
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

    const shape: CircleShape = {
      id: generateShapeId(),
      tool: ToolType.CIRCLE,
      center: { x: centerX, y: centerY },
      radius: Math.max(radiusX, radiusY),
      radiusX,
      radiusY,
      color: getToolColor(ToolType.CIRCLE), // Feature #105: Use tool-specific color
      lineThickness: getToolLineThickness(ToolType.CIRCLE), // Feature #106: Use tool-specific line thickness
      createdAt: Date.now(),
      monitorId: currentMonitor || "default", // Feature #9: Track monitor ID
    };

    // Feature #128: Add custom fade duration if set
    if (customFadeDuration !== null) {
      shape.customFadeDuration = customFadeDuration;
      console.log(`[Feature #128] Applied custom fade duration: ${customFadeDuration}s to circle shape`);
    }

    return shape;
  }, [generateShapeId, currentMonitor, getToolColor, getToolLineThickness, customFadeDuration]);

  /**
   * Create box shape from drawing state
   * Feature #9: Includes monitorId for per-monitor shape confinement
   * Feature #128: Includes customFadeDuration if set
   */
  const createBoxShape = useCallback((
    startX: number,
    startY: number,
    currentX: number,
    currentY: number
  ): BoxShape => {
    const width = currentX - startX;
    const height = currentY - startY;

    const shape: BoxShape = {
      id: generateShapeId(),
      tool: ToolType.BOX,
      startPoint: { x: startX, y: startY },
      endPoint: { x: currentX, y: currentY },
      width,
      height,
      color: getToolColor(ToolType.BOX), // Feature #105: Use tool-specific color
      lineThickness: getToolLineThickness(ToolType.BOX), // Feature #106: Use tool-specific line thickness
      createdAt: Date.now(),
      monitorId: currentMonitor || "default", // Feature #9: Track monitor ID
    };

    // Feature #128: Add custom fade duration if set
    if (customFadeDuration !== null) {
      shape.customFadeDuration = customFadeDuration;
      console.log(`[Feature #128] Applied custom fade duration: ${customFadeDuration}s to box shape`);
    }

    return shape;
  }, [generateShapeId, currentMonitor, getToolColor, getToolLineThickness, customFadeDuration]);

  /**
   * Create freehand shape from drawing state
   * Feature #9: Includes monitorId for per-monitor shape confinement
   * Feature #128: Includes customFadeDuration if set
   */
  const createFreehandShape = useCallback((points: Point[]): FreehandShape => {
    const shape: FreehandShape = {
      id: generateShapeId(),
      tool: ToolType.FREEHAND,
      points: [...points],
      color: getToolColor(ToolType.FREEHAND), // Feature #105: Use tool-specific color
      lineThickness: getToolLineThickness(ToolType.FREEHAND), // Feature #106: Use tool-specific line thickness
      createdAt: Date.now(),
      monitorId: currentMonitor || "default", // Feature #9: Track monitor ID
    };

    // Feature #128: Add custom fade duration if set
    if (customFadeDuration !== null) {
      shape.customFadeDuration = customFadeDuration;
      console.log(`[Feature #128] Applied custom fade duration: ${customFadeDuration}s to freehand shape`);
    }

    return shape;
  }, [generateShapeId, currentMonitor, getToolColor, getToolLineThickness, customFadeDuration]);

  /**
   * Create highlighter shape from drawing state
   * Feature #9: Includes monitorId for per-monitor shape confinement
   * Feature #128: Includes customFadeDuration if set
   */
  const createHighlighterShape = useCallback((points: Point[]): HighlighterShape => {
    const shape: HighlighterShape = {
      id: generateShapeId(),
      tool: ToolType.HIGHLIGHTER,
      points: [...points],
      color: getToolColor(ToolType.HIGHLIGHTER), // Feature #105: Use tool-specific color
      lineThickness: getToolLineThickness(ToolType.HIGHLIGHTER), // Feature #106: Use tool-specific line thickness
      opacity: 0.3, // Semi-transparent
      createdAt: Date.now(),
      monitorId: currentMonitor || "default", // Feature #9: Track monitor ID
    };

    // Feature #128: Add custom fade duration if set
    if (customFadeDuration !== null) {
      shape.customFadeDuration = customFadeDuration;
      console.log(`[Feature #128] Applied custom fade duration: ${customFadeDuration}s to highlighter shape`);
    }

    return shape;
  }, [generateShapeId, currentMonitor, getToolColor, getToolLineThickness, customFadeDuration]);

  /**
   * Create text shape from drawing state
   * Feature #30: Uses fontSize from settings
   * Feature #31: Uses current text color from settings
   * Feature #9: Includes monitorId for per-monitor shape confinement
   * Feature #128: Includes customFadeDuration if set
   */
  const createTextShape = useCallback((
    position: Point,
    text: string
  ): TextShape => {
    // Feature #30: Get font size from settings (scaled up for visibility - 14pt in settings -> ~24px for rendering)
    const fontSize = settings ? (settings.fontSize * 1.7) : defaultFontSize;

    // Feature #105: Use tool-specific color for text
    const textColor = getToolColor(ToolType.TEXT);

    const shape: TextShape = {
      id: generateShapeId(),
      tool: ToolType.TEXT,
      position,
      text,
      color: textColor,
      lineThickness: 0, // Not used for text
      fontSize: Math.round(fontSize),
      createdAt: Date.now(),
      monitorId: currentMonitor || "default", // Feature #9: Track monitor ID
    };

    // Feature #128: Add custom fade duration if set
    if (customFadeDuration !== null) {
      shape.customFadeDuration = customFadeDuration;
      console.log(`[Feature #128] Applied custom fade duration: ${customFadeDuration}s to text shape`);
    }

    return shape;
  }, [generateShapeId, settings, defaultFontSize, currentMonitor, getToolColor, customFadeDuration]);

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

    // Feature #128: Reset custom fade duration after shape is created
    if (customFadeDuration !== null) {
      console.log(`[Feature #128] Resetting custom fade duration after text shape creation`);
      setCustomFadeDuration(null);
    }

    setTextInputVisible(false);
    setTextInputValue("");
    redrawAllShapes();
  }, [textInputValue, textInputPosition, createTextShape, redrawAllShapes, customFadeDuration]);

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

    // Feature #128: Reset custom fade duration after shape is created
    // (It applies only to the next shape drawn)
    if (customFadeDuration !== null) {
      console.log(`[Feature #128] Resetting custom fade duration after shape creation`);
      setCustomFadeDuration(null);
    }

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
  }, [drawingState, currentTool, createArrowShape, createCircleShape, createBoxShape, createFreehandShape, createHighlighterShape, redrawAllShapes, customFadeDuration]);

  useEffect(() => {
    // Feature #10 & #114: Handle Escape key to dismiss overlay or cancel drawing
    const handleKeyDown = async (event: KeyboardEvent) => {
      // Feature #123: Handle Ctrl+Z / Cmd+Z to undo last shape
      if ((event.ctrlKey || event.metaKey) && event.key === "z") {
        event.preventDefault();
        console.log("Undo hotkey pressed (Ctrl+Z / Cmd+Z)");
        undoLastShape();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();

        // Feature #114: If currently drawing, cancel the in-progress shape
        if (drawingState.isDrawing) {
          console.log("Escape key pressed - canceling in-progress drawing");
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
          // Redraw to clear any preview
          redrawAllShapes();
          return;
        }

        // Otherwise, dismiss the overlay
        console.log("Escape key pressed - dismissing overlay");
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

      // Feature #114: If currently drawing, cancel the in-progress shape
      if (drawingState.isDrawing) {
        console.log("Toggle hotkey pressed - canceling in-progress drawing");
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
        // Redraw to clear any preview
        redrawAllShapes();
        return;
      }

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

        // Feature #67: Show visual feedback when hotkey triggers
        showHotkeyFeedback(tool);
      }
    });

    // Feature #20: Listen for overlay dismissed event to clean up shapes
    const unlistenOverlayDismissed = listen("overlay-dismissed", () => {
      console.log("Overlay dismissed event received - cleaning up");

      // Feature #120: Clean up all opacity tracking before clearing shapes
      const allShapeIds = shapesRef.current.map(shape => shape.id);
      cleanupOpacityTracking(allShapeIds);

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

      // Feature #120: Clean up all opacity tracking before clearing shapes
      const allShapeIds = shapesRef.current.map(shape => shape.id);
      cleanupOpacityTracking(allShapeIds);

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

    // Feature #128: Listen for custom fade duration updates from mini panel
    const unlistenCustomFadeDuration = listen<number | null>("custom-fade-duration", (event) => {
      const duration = event.payload;
      console.log(`[Feature #128] Custom fade duration updated: ${duration === null ? "null (use global)" : duration + "s"}`);
      setCustomFadeDuration(duration);
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

    // Feature #120: Handle app shutdown cleanup
    const handleBeforeUnload = () => {
      console.log("[Feature #120] App shutting down - cleaning up resources");

      // Clean up all opacity tracking
      const allShapeIds = shapesRef.current.map(shape => shape.id);
      if (allShapeIds.length > 0) {
        cleanupOpacityTracking(allShapeIds);
      }

      // Clear all shapes
      shapesRef.current = [];

      // Clear opacity state
      setShapeOpacities({});

      console.log("[Feature #120] Shutdown cleanup complete");
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

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
      window.removeEventListener("beforeunload", handleBeforeUnload);
      clearInterval(zIndexCheckInterval);
      unlistenToggle.then((fn) => fn());
      unlistenDrawingMode.then((fn) => fn());
      unlistenToolSelected.then((fn) => fn()).catch(console.error);
      unlistenOverlayDismissed.then((fn) => fn()).catch(console.error);
      unlistenClearShapes.then((fn) => fn()).catch(console.error);
      unlistenCustomFadeDuration.then((fn) => fn()).catch(console.error);

      // Feature #67: Cleanup hotkey feedback timer
      if (hotkeyFeedbackTimerRef.current) {
        clearTimeout(hotkeyFeedbackTimerRef.current);
      }

      // Feature #120: Clean up all opacity tracking on unmount
      const allShapeIds = shapesRef.current.map(shape => shape.id);
      if (allShapeIds.length > 0) {
        cleanupOpacityTracking(allShapeIds);
      }
      console.log("[Feature #120] Cleanup complete on component unmount");
    };
  }, [isVisible, drawingState, redrawAllShapes, undoLastShape, cleanupOpacityTracking]);

  // Feature #122: Initialize canvas with DPI/Retina display support
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Feature #122: Detect display DPI and scale canvas appropriately
    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;

      // Set display size (css pixels)
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";

      // Set actual size in memory (scaled to account for extra pixel density)
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;

      // Feature #122: Normalize coordinate system to use css pixels
      ctx.scale(dpr, dpr);

      console.log(`[Feature #122] Canvas resized for DPI: ${dpr}x (${window.innerWidth}x${window.innerHeight} -> ${canvas.width}x${canvas.height})`);

      // Redraw shapes after resize
      redrawShapes(ctx, shapesRef.current);
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    return () => {
      window.removeEventListener("resize", resizeCanvas);
    };
  }, [redrawAllShapes]);

  // Feature #30 & #31: Load settings on mount to get font size and colors
  useEffect(() => {
    const loadAppSettings = async () => {
      try {
        const loadedSettings = await loadSettings();
        console.log("Loaded settings in overlay:", loadedSettings);
        setSettings(loadedSettings);
      } catch (error) {
        console.error("Failed to load settings:", error);
        // Use defaults if loading fails
        setSettings(DEFAULT_SETTINGS);
      }
    };

    loadAppSettings();
  }, []);

  // Feature #9: Initialize monitor on component mount
  useEffect(() => {
    const initializeMonitor = async () => {
      try {
        const monitorId = await invoke<string | null>("get_current_monitor");
        console.log("Initialized current monitor:", monitorId);
        setCurrentMonitor(monitorId);
      } catch (error) {
        console.error("Failed to get current monitor:", error);
        setCurrentMonitor(null);
      }
    };

    initializeMonitor();
  }, []);

  // Feature #9: Listen for monitor-changed event and filter shapes
  useEffect(() => {
    const unlistenMonitorChanged = listen<string>("monitor-changed", (event) => {
      const newMonitorId = event.payload;
      console.log("[Feature #9] Monitor changed to:", newMonitorId);

      // Update current monitor state
      setCurrentMonitor(newMonitorId);

      // Feature #120: Collect IDs of shapes that will be removed
      const shapesBefore = shapesRef.current.length;
      const removedShapeIds = shapesRef.current
        .filter(shape => shape.monitorId !== newMonitorId)
        .map(shape => shape.id);

      // Filter shapes to only show those for this monitor
      shapesRef.current = shapesRef.current.filter(
        shape => shape.monitorId === newMonitorId
      );
      const shapesAfter = shapesRef.current.length;

      // Feature #120: Clean up opacity tracking for removed shapes
      cleanupOpacityTracking(removedShapeIds);

      console.log(`[Feature #9] Filtered shapes: ${shapesBefore} -> ${shapesAfter} (removed ${shapesBefore - shapesAfter} shapes from other monitors)`);

      // Redraw with filtered shapes
      redrawAllShapes();
    });

    return () => {
      unlistenMonitorChanged.then((fn) => fn()).catch(console.error);
    };
  }, [cleanupOpacityTracking, redrawAllShapes]);

  // Feature #35 & #73: Auto-fade system with smooth opacity transitions
  // Feature #128: Support per-shape custom fade durations
  useEffect(() => {
    const fadeCheckInterval = setInterval(() => {
      const now = Date.now();
      const defaultFadeDurationMs = (settings?.fadeDuration || 10) * 1000;

      // Calculate new opacities for all shapes
      const newOpacities: Record<string, number> = {};
      const shapesToRemove: string[] = [];

      shapesRef.current.forEach(shape => {
        const age = now - shape.createdAt;

        // Feature #128: Use custom fade duration if present, otherwise use global setting
        const shapeFadeDurationMs = shape.customFadeDuration
          ? shape.customFadeDuration * 1000
          : defaultFadeDurationMs;

        // Calculate opacity using smooth easing
        const opacity = getFadeOpacity(age, shapeFadeDurationMs);
        newOpacities[shape.id] = opacity;

        // Mark for removal if completely faded
        if (opacity <= 0) {
          shapesToRemove.push(shape.id);
        }
      });

      // Update opacities state (triggers redraw with new values)
      setShapeOpacities(newOpacities);

      // Remove fully faded shapes
      if (shapesToRemove.length > 0) {
        const shapesBefore = shapesRef.current.length;
        shapesRef.current = shapesRef.current.filter(shape =>
          !shapesToRemove.includes(shape.id)
        );
        const shapesRemoved = shapesBefore - shapesRef.current.length;

        // Clean up opacities for removed shapes
        const cleanedOpacities = { ...newOpacities };
        shapesToRemove.forEach(id => delete cleanedOpacities[id]);
        setShapeOpacities(cleanedOpacities);

        console.log(`[Auto-Fade] Removed ${shapesRemoved} fully faded shape(s)`);
      }

      // Trigger redraw with updated opacities
      redrawAllShapes();
    }, 50); // Update every 50ms for smooth animation (20fps)

    return () => clearInterval(fadeCheckInterval);
  }, [settings?.fadeDuration, redrawAllShapes, getFadeOpacity]);

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
        // Feature #16 & #107: Change cursor based on drawing mode and selected tool
        cursor: getToolCursor(currentTool, isDrawingMode),
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
      {/* Feature #30 & #31: Uses font size and color from settings */}
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
            // Feature #30: Use font size from settings
            fontSize: settings ? `${Math.round(settings.fontSize * 1.7)}px` : "24px",
            padding: "4px 8px",
            // Feature #31: Use text color from settings for border
            border: `2px solid ${settings?.colors.text || "#FF0000"}`,
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

      {/* Feature #67: Visual feedback when hotkey triggers */}
      {hotkeyFeedback.visible && (
        <div
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            padding: "20px 40px",
            backgroundColor: "rgba(0, 0, 0, 0.85)",
            color: "white",
            borderRadius: "12px",
            fontSize: "24px",
            fontWeight: "bold",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
            pointerEvents: "none",
            zIndex: 10001,
            display: "flex",
            alignItems: "center",
            gap: "16px",
            animation: "fadeInOut 0.8s ease-in-out",
            border: "3px solid rgba(255, 255, 255, 0.2)",
          }}
        >
          <span style={{ fontSize: "36px" }}>{hotkeyFeedback.icon}</span>
          <span>{hotkeyFeedback.tool}</span>
          <style>
            {`
              @keyframes fadeInOut {
                0% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
                15% { opacity: 1; transform: translate(-50%, -50%) scale(1.05); }
                30% { transform: translate(-50%, -50%) scale(1); }
                70% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
                100% { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
              }
            `}
          </style>
        </div>
      )}
    </div>
  );
}
