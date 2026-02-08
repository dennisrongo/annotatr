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
  const textInputRef = useRef<HTMLTextAreaElement>(null);

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
   * Feature #124: Clear all shapes from the overlay at once
   * Removes all shapes from the shapes array and redraws the canvas
   * Keyboard shortcut: Ctrl+Shift+X (Windows/Linux) or Cmd+Shift+X (macOS)
   */
  const clearAllShapes = useCallback(() => {
    if (shapesRef.current.length === 0) {
      console.log("[Feature #124] No shapes to clear");
      return;
    }

    // Get all shape IDs before clearing
    const shapeIds = shapesRef.current.map(shape => shape.id);
    const shapeCount = shapesRef.current.length;

    // Clear all shapes
    shapesRef.current = [];

    // Feature #120: Clean up opacity tracking for all cleared shapes
    cleanupOpacityTracking(shapeIds);

    console.log(`[Feature #124] Cleared ${shapeCount} shape(s)`);
    console.log(`[Feature #124] Shape IDs: ${shapeIds.join(", ")}`);

    // Redraw the canvas (should now be empty)
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
   * Feature #132: Alignment guides for shape drawing
   * Detects when shapes align with center, edges, or other shapes
   */

  // Threshold distance for snapping (in pixels)
  const SNAP_THRESHOLD = 10;

  /**
   * Detect alignment with center of screen
   */
  const detectCenterAlignment = useCallback((x: number, y: number): { horizontal: boolean; vertical: boolean } => {
    const canvas = canvasRef.current;
    if (!canvas) return { horizontal: false, vertical: false };

    const centerX = canvas.width / (2 * (window.devicePixelRatio || 1));
    const centerY = canvas.height / (2 * (window.devicePixelRatio || 1));

    return {
      horizontal: Math.abs(x - centerX) < SNAP_THRESHOLD,
      vertical: Math.abs(y - centerY) < SNAP_THRESHOLD,
    };
  }, []);

  /**
   * Detect alignment with edges of screen
   */
  const detectEdgeAlignment = useCallback((x: number, y: number): { left: boolean; right: boolean; top: boolean; bottom: boolean } => {
    const canvas = canvasRef.current;
    if (!canvas) return { left: false, right: false, top: false, bottom: false };

    const width = canvas.width / (window.devicePixelRatio || 1);
    const height = canvas.height / (window.devicePixelRatio || 1);

    return {
      left: Math.abs(x) < SNAP_THRESHOLD,
      right: Math.abs(x - width) < SNAP_THRESHOLD,
      top: Math.abs(y) < SNAP_THRESHOLD,
      bottom: Math.abs(y - height) < SNAP_THRESHOLD,
    };
  }, []);

  /**
   * Detect alignment with existing shapes (centers and edges)
   */
  const detectShapeAlignment = useCallback((x: number, y: number): Array<{ x: number; y: number; type: string }> => {
    const alignments: Array<{ x: number; y: number; type: string }> = [];

    shapesRef.current.forEach(shape => {
      let shapeCenterX = 0;
      let shapeCenterY = 0;

      // Calculate center of existing shape
      switch (shape.tool) {
        case ToolType.ARROW:
          shapeCenterX = (shape.startPoint.x + shape.endPoint.x) / 2;
          shapeCenterY = (shape.startPoint.y + shape.endPoint.y) / 2;
          break;
        case ToolType.CIRCLE:
          shapeCenterX = shape.center.x;
          shapeCenterY = shape.center.y;
          break;
        case ToolType.BOX:
          shapeCenterX = (shape.startPoint.x + shape.endPoint.x) / 2;
          shapeCenterY = (shape.startPoint.y + shape.endPoint.y) / 2;
          break;
        case ToolType.FREEHAND:
        case ToolType.HIGHLIGHTER:
          if (shape.points.length > 0) {
            const sumX = shape.points.reduce((sum, p) => sum + p.x, 0);
            const sumY = shape.points.reduce((sum, p) => sum + p.y, 0);
            shapeCenterX = sumX / shape.points.length;
            shapeCenterY = sumY / shape.points.length;
          }
          break;
        case ToolType.TEXT:
          shapeCenterX = shape.position.x;
          shapeCenterY = shape.position.y;
          break;
      }

      // Check horizontal alignment with shape center
      if (Math.abs(y - shapeCenterY) < SNAP_THRESHOLD) {
        alignments.push({ x: 0, y: shapeCenterY, type: 'shape-horizontal' });
      }

      // Check vertical alignment with shape center
      if (Math.abs(x - shapeCenterX) < SNAP_THRESHOLD) {
        alignments.push({ x: shapeCenterX, y: 0, type: 'shape-vertical' });
      }
    });

    return alignments;
  }, []);

  /**
   * Draw alignment guides on canvas
   */
  const drawAlignmentGuides = useCallback((
    ctx: CanvasRenderingContext2D,
    guides: {
      centerH: boolean;
      centerV: boolean;
      edges: { left: boolean; right: boolean; top: boolean; bottom: boolean };
      shapes: Array<{ x: number; y: number; type: string }>;
      currentX: number;
      currentY: number;
    }
  ) => {
    const { centerH, centerV, edges, shapes, currentX, currentY } = guides;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const width = canvas.width / (window.devicePixelRatio || 1);
    const height = canvas.height / (window.devicePixelRatio || 1);

    // Save context state
    ctx.save();

    // Set guide style
    ctx.strokeStyle = "#00BFFF"; // Deep sky blue for visibility
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]); // Dashed line
    ctx.globalAlpha = 0.7;

    // Draw center horizontal guide
    if (centerH) {
      ctx.beginPath();
      ctx.moveTo(0, currentY);
      ctx.lineTo(width, currentY);
      ctx.stroke();
    }

    // Draw center vertical guide
    if (centerV) {
      ctx.beginPath();
      ctx.moveTo(currentX, 0);
      ctx.lineTo(currentX, height);
      ctx.stroke();
    }

    // Draw edge guides
    if (edges.left) {
      ctx.beginPath();
      ctx.moveTo(0, currentY);
      ctx.lineTo(currentX, currentY);
      ctx.stroke();
    }
    if (edges.right) {
      ctx.beginPath();
      ctx.moveTo(width, currentY);
      ctx.lineTo(currentX, currentY);
      ctx.stroke();
    }
    if (edges.top) {
      ctx.beginPath();
      ctx.moveTo(currentX, 0);
      ctx.lineTo(currentX, currentY);
      ctx.stroke();
    }
    if (edges.bottom) {
      ctx.beginPath();
      ctx.moveTo(currentX, height);
      ctx.lineTo(currentX, currentY);
      ctx.stroke();
    }

    // Draw shape alignment guides
    shapes.forEach(guide => {
      if (guide.type === 'shape-horizontal') {
        ctx.beginPath();
        ctx.moveTo(0, guide.y);
        ctx.lineTo(width, guide.y);
        ctx.stroke();
      } else if (guide.type === 'shape-vertical') {
        ctx.beginPath();
        ctx.moveTo(guide.x, 0);
        ctx.lineTo(guide.x, height);
        ctx.stroke();
      }
    });

    // Draw snap points (small circles at intersections)
    ctx.fillStyle = "#00BFFF";
    const snapRadius = 4;
    if (centerH || centerV || edges.left || edges.right || edges.top || edges.bottom || shapes.length > 0) {
      ctx.beginPath();
      ctx.arc(currentX, currentY, snapRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Restore context state
    ctx.restore();
  }, []);

  /**
   * Create arrow shape from drawing state
   * Feature #9: Includes monitorId for per-monitor shape confinement
   * Feature #128: Includes customFadeDuration if set
   * Feature #131: Includes arrow head style from settings
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
      arrowHeadStyle: settings?.arrowHeadStyle, // Feature #131: Arrow head style customization
    };

    // Feature #128: Add custom fade duration if set
    if (customFadeDuration !== null) {
      shape.customFadeDuration = customFadeDuration;
      console.log(`[Feature #128] Applied custom fade duration: ${customFadeDuration}s to arrow shape`);
    }

    return shape;
  }, [generateShapeId, currentMonitor, getToolColor, getToolLineThickness, customFadeDuration, settings]);

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
   * Feature #132: Show alignment guides during drawing
   */
  const handleMouseMove = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!drawingState.isDrawing || !currentTool) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    let currentX = event.clientX - rect.left;
    let currentY = event.clientY - rect.top;

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

    // Feature #132: Detect alignments for arrow, circle, box
    const centerAlign = detectCenterAlignment(currentX, currentY);
    const edgeAlign = detectEdgeAlignment(currentX, currentY);
    const shapeAligns = detectShapeAlignment(currentX, currentY);

    // Apply snapping to center
    let snappedX = currentX;
    let snappedY = currentY;

    if (centerAlign.horizontal) {
      const canvas = canvasRef.current;
      if (canvas) {
        snappedY = canvas.height / (2 * (window.devicePixelRatio || 1));
      }
    }
    if (centerAlign.vertical) {
      const canvas = canvasRef.current;
      if (canvas) {
        snappedX = canvas.width / (2 * (window.devicePixelRatio || 1));
      }
    }

    // Snap to shape alignments
    shapeAligns.forEach(guide => {
      if (guide.type === 'shape-horizontal') {
        snappedY = guide.y;
      } else if (guide.type === 'shape-vertical') {
        snappedX = guide.x;
      }
    });

    // For arrow, circle, box - update drawing state with snapped position
    setDrawingState(prev => ({
      ...prev,
      currentX: snappedX,
      currentY: snappedY,
    }));

    // Redraw existing shapes and preview
    const context = getCanvasContext();
    if (!context) return;

    const { ctx } = context;

    // Clear and redraw all existing shapes
    redrawShapes(ctx, shapesRef.current, shapeOpacities);

    // Draw preview of current shape
    let previewShape: Shape;

    switch (currentTool) {
      case ToolType.ARROW:
        previewShape = createArrowShape(drawingState.startX, drawingState.startY, snappedX, snappedY);
        break;
      case ToolType.CIRCLE:
        previewShape = createCircleShape(drawingState.startX, drawingState.startY, snappedX, snappedY);
        break;
      case ToolType.BOX:
        previewShape = createBoxShape(drawingState.startX, drawingState.startY, snappedX, snappedY);
        break;
      default:
        return;
    }

    drawShape(ctx, previewShape);

    // Feature #132: Draw alignment guides on top
    drawAlignmentGuides(ctx, {
      centerH: centerAlign.horizontal,
      centerV: centerAlign.vertical,
      edges: edgeAlign,
      shapes: shapeAligns,
      currentX: snappedX,
      currentY: snappedY,
    });
  }, [drawingState.isDrawing, drawingState.startX, drawingState.startY, drawingState.freehandPoints, currentTool, getCanvasContext, createArrowShape, createCircleShape, createBoxShape, createFreehandShape, createHighlighterShape, detectCenterAlignment, detectEdgeAlignment, detectShapeAlignment, drawAlignmentGuides, shapeOpacities]);

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
   * Handle text input keydown
   * Feature #129: Shift+Enter for new line, Enter to submit, Escape to cancel
   */
  const handleTextInputKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      // Enter submits the text
      event.preventDefault();
      handleTextInputSubmit();
    } else if (event.key === "Escape") {
      // Escape cancels text input
      event.preventDefault();
      setTextInputVisible(false);
      setTextInputValue("");
    }
    // Shift+Enter allows default behavior (new line)
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

      // Feature #124: Handle Ctrl+Shift+X / Cmd+Shift+X to clear all shapes
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "x") {
        event.preventDefault();
        console.log("Clear all shapes hotkey pressed (Ctrl+Shift+X / Cmd+Shift+X)");
        clearAllShapes();
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
      {/* Feature #129: Multi-line text support with textarea */}
      {textInputVisible && (
        <textarea
          ref={textInputRef}
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
            // Feature #31: Use text color from settings for border and text
            border: `2px solid ${settings?.colors.text || "#FF0000"}`,
            borderRadius: "4px",
            outline: "none",
            backgroundColor: "rgba(255, 255, 255, 0.9)",
            color: settings?.colors.text || "#FF0000",
            minWidth: "200px",
            minHeight: "60px",
            zIndex: 10000,
            resize: "both",
            overflow: "auto",
          }}
          placeholder="Type multi-line text and press Enter to submit..."
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
