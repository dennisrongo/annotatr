import { useEffect, useState, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ToolType, Shape, ArrowShape, CircleShape, BoxShape, FreehandShape, HighlighterShape, TextShape, Point } from "../types/shapes";
import { drawShape, redrawShapes } from "../lib/drawing";
import { loadSettings, Settings, DEFAULT_SETTINGS } from "../lib/storage";
import { findShapeAtPoint, updateShapeProperty, drawSelectionIndicator } from "../lib/shapeEditing";

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

  // Feature #125: Shape editing mode
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedShape, setSelectedShape] = useState<Shape | null>(null);
  const [editPanelVisible, setEditPanelVisible] = useState(false);

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

  // Feature #73: Auto-fade system - track shape opacities for smooth fade-out.
  // Kept in refs (not state): the fade loop runs at 20fps and must not
  // re-render the component on every tick.
  const shapeOpacitiesRef = useRef<Record<string, number>>({});
  const fadeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const settingsRef = useRef<Settings | null>(null);
  settingsRef.current = settings;
  const redrawRef = useRef<() => void>(() => {});
  const isDrawingRef = useRef(false);

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
   * Feature #125: Draw selection indicator for selected shape
   */
  const redrawAllShapes = useCallback(() => {
    const context = getCanvasContext();
    if (!context) return;

    const { ctx } = context;
    redrawShapes(ctx, shapesRef.current, shapeOpacitiesRef.current);

    // Feature #125: Draw selection indicator if the selected shape still
    // exists (it may have been removed by fade-out, clear, or undo)
    if (selectedShape && isEditMode && shapesRef.current.some(s => s.id === selectedShape.id)) {
      drawSelectionIndicator(ctx, selectedShape);
    }
  }, [getCanvasContext, selectedShape, isEditMode]);
  redrawRef.current = redrawAllShapes;

  /**
   * Feature #120: Cleanup opacity tracking for specific shape IDs
   * Prevents memory leaks when shapes are removed
   */
  const cleanupOpacityTracking = useCallback((shapeIds: string | string[]) => {
    const idsToRemove = Array.isArray(shapeIds) ? shapeIds : [shapeIds];
    idsToRemove.forEach(id => {
      delete shapeOpacitiesRef.current[id];
    });
  }, []);

  /**
   * Feature #35 & #73: Auto-fade with smooth opacity transitions.
   * Feature #128: Supports per-shape custom fade durations.
   * The interval runs only while shapes exist: it starts when a shape is
   * added and clears itself once the last shape has fully faded — an idle
   * overlay does zero work.
   */
  const ensureFadeLoop = useCallback(() => {
    if (fadeIntervalRef.current !== null) return;

    fadeIntervalRef.current = setInterval(() => {
      if (shapesRef.current.length === 0) {
        clearInterval(fadeIntervalRef.current!);
        fadeIntervalRef.current = null;
        shapeOpacitiesRef.current = {};
        return;
      }

      const now = Date.now();
      const defaultFadeDurationMs = (settingsRef.current?.fadeDuration || 10) * 1000;
      const newOpacities: Record<string, number> = {};
      const shapesToRemove: string[] = [];

      shapesRef.current.forEach(shape => {
        const age = now - shape.createdAt;
        const shapeFadeDurationMs = shape.customFadeDuration
          ? shape.customFadeDuration * 1000
          : defaultFadeDurationMs;
        const opacity = getFadeOpacity(age, shapeFadeDurationMs);
        newOpacities[shape.id] = opacity;
        if (opacity <= 0) {
          shapesToRemove.push(shape.id);
        }
      });

      if (shapesToRemove.length > 0) {
        shapesRef.current = shapesRef.current.filter(shape => !shapesToRemove.includes(shape.id));
        shapesToRemove.forEach(id => delete newOpacities[id]);
      }

      shapeOpacitiesRef.current = newOpacities;
      // Skip the redraw mid-drag: it would erase the in-progress preview,
      // and every mousemove already redraws with fresh opacities
      if (!isDrawingRef.current) {
        redrawRef.current();
      }
    }, 50); // 20fps for smooth fade animation
  }, [getFadeOpacity]);

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
   * Handle mouse down - start drawing OR select shape in edit mode
   * Feature #125: In edit mode, clicking on a shape selects it for editing
   */
  const handleMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    // Feature #125: If in edit mode, try to select a shape
    if (isEditMode) {
      const hitResult = findShapeAtPoint(shapesRef.current, { x: clickX, y: clickY });

      if (hitResult.hit && hitResult.shape) {
        console.log(`[Feature #125] Selected shape: ${hitResult.shape.tool} (${hitResult.shape.id})`);
        setSelectedShape(hitResult.shape);
        setEditPanelVisible(true);
        redrawAllShapes();
      } else {
        // Clicked on empty space - deselect
        if (selectedShape) {
          console.log("[Feature #125] Deselected shape");
          setSelectedShape(null);
          setEditPanelVisible(false);
          redrawAllShapes();
        }
      }
      return;
    }

    // Normal drawing mode
    if (!isDrawingMode || !currentTool) return;

    const startX = clickX;
    const startY = clickY;

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
  }, [isDrawingMode, currentTool, isEditMode, selectedShape, redrawAllShapes]);

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
      redrawShapes(ctx, shapesRef.current, shapeOpacitiesRef.current);

      // Draw preview of current freehand path
      const previewShape = currentTool === ToolType.FREEHAND
        ? createFreehandShape([...drawingState.freehandPoints, newPoint])
        : createHighlighterShape([...drawingState.freehandPoints, newPoint]);

      drawShape(ctx, previewShape);
      return;
    }

    // For arrow, circle, box - track the cursor exactly (no snapping)
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
    redrawShapes(ctx, shapesRef.current, shapeOpacitiesRef.current);

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
    ensureFadeLoop();
    console.log("Created text shape:", newTextShape);

    // Feature #128: Reset custom fade duration after shape is created
    if (customFadeDuration !== null) {
      console.log(`[Feature #128] Resetting custom fade duration after text shape creation`);
      setCustomFadeDuration(null);
    }

    setTextInputVisible(false);
    setTextInputValue("");
    redrawAllShapes();
  }, [textInputValue, textInputPosition, createTextShape, redrawAllShapes, customFadeDuration, ensureFadeLoop]);

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
    ensureFadeLoop();

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
  }, [drawingState, currentTool, createArrowShape, createCircleShape, createBoxShape, createFreehandShape, createHighlighterShape, redrawAllShapes, customFadeDuration, ensureFadeLoop]);

  // Latest-value snapshot so the mount-once listeners below always read
  // fresh state without tearing down and resubscribing — resubscribe gaps
  // were dropping Tauri events fired mid-drag (the old effect depended on
  // drawingState, which changes on every mousemove)
  const latest = useRef({
    drawingState,
    isEditMode,
    selectedShape,
    redrawAllShapes,
    undoLastShape,
    clearAllShapes,
    cleanupOpacityTracking,
    showHotkeyFeedback,
  });
  latest.current = {
    drawingState,
    isEditMode,
    selectedShape,
    redrawAllShapes,
    undoLastShape,
    clearAllShapes,
    cleanupOpacityTracking,
    showHotkeyFeedback,
  };
  isDrawingRef.current = drawingState.isDrawing;

  const resetDrawingState = useCallback(() => {
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
  }, []);

  useEffect(() => {
    // Feature #10 & #114: Handle Escape key to dismiss overlay or cancel drawing
    const handleKeyDown = async (event: KeyboardEvent) => {
      // Keys already consumed by the text input textarea (its own handler
      // calls preventDefault before the event bubbles to window)
      if (event.defaultPrevented) return;

      // While typing in the text input, shortcuts like Cmd+Z must edit the
      // text, not delete drawn shapes
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT")) return;

      // Feature #123: Handle Ctrl+Z / Cmd+Z to undo last shape
      if ((event.ctrlKey || event.metaKey) && event.key === "z") {
        event.preventDefault();
        latest.current.undoLastShape();
        return;
      }

      // Feature #124: Handle Ctrl+Shift+X / Cmd+Shift+X to clear all shapes
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "x") {
        event.preventDefault();
        latest.current.clearAllShapes();
        return;
      }

      // Feature #125: Handle Ctrl+E / Cmd+E to toggle edit mode
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "e") {
        event.preventDefault();
        setIsEditMode(prev => {
          const newMode = !prev;
          // Clear selection when exiting edit mode
          if (!newMode) {
            setSelectedShape(null);
            setEditPanelVisible(false);
          }
          return newMode;
        });
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();

        // Feature #114: If currently drawing, cancel the in-progress shape
        if (latest.current.drawingState.isDrawing) {
          console.log("Escape key pressed - canceling in-progress drawing");
          resetDrawingState();
          // Redraw to clear any preview
          latest.current.redrawAllShapes();
          return;
        }

        // Feature #125: If in edit mode with a selected shape, deselect it
        if (latest.current.isEditMode && latest.current.selectedShape) {
          console.log("Escape key pressed - deselecting shape");
          setSelectedShape(null);
          setEditPanelVisible(false);
          latest.current.redrawAllShapes();
          return;
        }

        // Otherwise, dismiss the overlay. Rust hides the window, returns
        // activation to the previously frontmost app, and emits
        // overlay-dismissed, which performs the rest of the cleanup here.
        console.log("Escape key pressed - dismissing overlay");
        try {
          await invoke("dismiss_overlay");
          resetDrawingState();
          setCurrentTool(null);
        } catch (error) {
          console.error("Failed to dismiss overlay:", error);
        }
      }
    };

    // Add keyboard event listener
    window.addEventListener("keydown", handleKeyDown);

    // Listen for drawing mode changes
    const unlistenDrawingMode = listen<boolean>("drawing-mode-changed", (event) => {
      console.log("Drawing mode changed:", event.payload);

      // Feature #16: Update drawing mode state for cursor management
      setIsDrawingMode(event.payload);

      if (!event.payload) {
        // Clear drawing state when drawing mode is deactivated
        resetDrawingState();
        setCurrentTool(null);
      }
    });

    // Listen for tool selection events
    const unlistenToolSelected = listen<string>("tool-selected", (event) => {
      console.log("Tool selected:", event.payload);
      const tool = event.payload as ToolType;

      if (Object.values(ToolType).includes(tool)) {
        setCurrentTool(tool);

        // Feature #67: Show visual feedback when hotkey triggers
        latest.current.showHotkeyFeedback(tool);
      }
    });

    // Toolbar undo button
    const unlistenUndo = listen("undo-last-shape", () => {
      latest.current.undoLastShape();
    });

    // Settings saved anywhere (toolbar color swatch, Settings window):
    // reload so color/thickness/fade changes apply to the next shape
    const unlistenSettingsUpdated = listen("settings_updated", () => {
      loadSettings()
        .then(setSettings)
        .catch((error) => console.error("Failed to reload settings:", error));
    });

    // Feature #20: Listen for overlay dismissed event to clean up shapes.
    // The window is only hidden (never reloaded), so EVERY piece of session
    // state must reset here or it leaks into the next drawing session.
    const unlistenOverlayDismissed = listen("overlay-dismissed", () => {
      console.log("Overlay dismissed event received - cleaning up");

      // Feature #120: Clean up all opacity tracking before clearing shapes
      latest.current.cleanupOpacityTracking(shapesRef.current.map(shape => shape.id));

      // Clear all shapes and drawing state
      shapesRef.current = [];
      resetDrawingState();
      setCurrentTool(null);
      setIsEditMode(false);
      setSelectedShape(null);
      setEditPanelVisible(false);
      setTextInputVisible(false);
      setTextInputValue("");

      // Clear canvas
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    });

    // Feature #20: Listen for clear all shapes event
    const unlistenClearShapes = listen("clear-all-shapes", () => {
      // Feature #120: Clean up all opacity tracking before clearing shapes
      latest.current.cleanupOpacityTracking(shapesRef.current.map(shape => shape.id));

      // Clear all shapes
      shapesRef.current = [];

      // Clear canvas
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    });

    // Feature #128: Listen for custom fade duration updates from mini panel
    const unlistenCustomFadeDuration = listen<number | null>("custom-fade-duration", (event) => {
      const duration = event.payload;
      console.log(`[Feature #128] Custom fade duration updated: ${duration === null ? "null (use global)" : duration + "s"}`);
      setCustomFadeDuration(duration);
    });

    // Feature #15: Handle window focus changes to ensure z-index stays on top.
    // The window being hidden surfaces as visibilityState "hidden", so these
    // are no-ops while the overlay is dismissed.
    const handleFocus = () => {
      invoke("ensure_on_top").catch((error) => console.error("Failed to ensure on top:", error));
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        invoke("ensure_on_top").catch((error) => console.error("Failed to ensure on top:", error));
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Feature #15: Periodic z-index check to ensure overlay stays on top
    const zIndexCheckInterval = setInterval(() => {
      if (document.visibilityState === "visible") {
        invoke("ensure_on_top").catch((error) => console.error("Failed to ensure on top:", error));
      }
    }, 5000);

    // Cleanup listeners on unmount
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearInterval(zIndexCheckInterval);
      unlistenDrawingMode.then((fn) => fn()).catch(console.error);
      unlistenToolSelected.then((fn) => fn()).catch(console.error);
      unlistenUndo.then((fn) => fn()).catch(console.error);
      unlistenSettingsUpdated.then((fn) => fn()).catch(console.error);
      unlistenOverlayDismissed.then((fn) => fn()).catch(console.error);
      unlistenClearShapes.then((fn) => fn()).catch(console.error);
      unlistenCustomFadeDuration.then((fn) => fn()).catch(console.error);

      // Feature #67: Cleanup hotkey feedback timer
      if (hotkeyFeedbackTimerRef.current) {
        clearTimeout(hotkeyFeedbackTimerRef.current);
      }

      // Stop the fade loop
      if (fadeIntervalRef.current !== null) {
        clearInterval(fadeIntervalRef.current);
        fadeIntervalRef.current = null;
      }
    };
  }, [resetDrawingState]);

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
      redrawShapes(ctx, shapesRef.current, shapeOpacitiesRef.current);
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    return () => {
      window.removeEventListener("resize", resizeCanvas);
    };
  }, []);

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
      redrawRef.current();
    });

    return () => {
      unlistenMonitorChanged.then((fn) => fn()).catch(console.error);
    };
  }, [cleanupOpacityTracking]);

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

      {/* Feature #125: Edit mode indicator */}
      {isEditMode && (
        <div
          style={{
            position: "absolute",
            top: 20,
            left: currentTool ? 200 : 20, // Position next to tool indicator if present
            padding: "12px 16px",
            backgroundColor: "#00BFFF",
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
          <span style={{ fontSize: "24px" }}>✎</span>
          <span>Edit Mode</span>
          <span style={{ fontSize: "12px", marginLeft: "8px", opacity: 0.9 }}>
            • Click shape to edit • Ctrl+E to exit
          </span>
        </div>
      )}

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

      {/* Feature #125: Edit panel for selected shape */}
      {editPanelVisible && selectedShape && (
        <div
          style={{
            position: "absolute",
            bottom: 60,
            left: 20,
            padding: "16px",
            backgroundColor: "rgba(40, 40, 40, 0.95)",
            color: "white",
            borderRadius: "12px",
            fontSize: "14px",
            boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5)",
            zIndex: 10002,
            minWidth: "280px",
            border: "2px solid #00BFFF",
          }}
        >
          <div style={{ marginBottom: "12px", fontWeight: "bold", fontSize: "16px" }}>
            Edit {selectedShape.tool} shape
          </div>

          {/* Color picker */}
          <div style={{ marginBottom: "12px" }}>
            <label style={{ display: "block", marginBottom: "4px", fontSize: "12px", opacity: 0.8 }}>
              Color:
            </label>
            <input
              type="color"
              value={selectedShape.color}
              onChange={(e) => {
                const newColor = e.target.value;
                const shapeIndex = shapesRef.current.findIndex(s => s.id === selectedShape.id);
                if (shapeIndex !== -1) {
                  shapesRef.current[shapeIndex] = updateShapeProperty(selectedShape, "color", newColor) as Shape;
                  setSelectedShape(shapesRef.current[shapeIndex]);
                  redrawAllShapes();
                }
              }}
              style={{
                width: "100%",
                height: "36px",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            />
          </div>

          {/* Line thickness slider */}
          <div style={{ marginBottom: "12px" }}>
            <label style={{ display: "block", marginBottom: "4px", fontSize: "12px", opacity: 0.8 }}>
              Line Thickness: {selectedShape.lineThickness}px
            </label>
            <input
              type="range"
              min="2"
              max="50"
              value={selectedShape.lineThickness}
              onChange={(e) => {
                const newThickness = parseInt(e.target.value);
                const shapeIndex = shapesRef.current.findIndex(s => s.id === selectedShape.id);
                if (shapeIndex !== -1) {
                  shapesRef.current[shapeIndex] = updateShapeProperty(selectedShape, "lineThickness", newThickness) as Shape;
                  setSelectedShape(shapesRef.current[shapeIndex]);
                  redrawAllShapes();
                }
              }}
              style={{
                width: "100%",
                cursor: "pointer",
              }}
            />
          </div>

          {/* Font size (for text shapes) */}
          {selectedShape.tool === ToolType.TEXT && (
            <div style={{ marginBottom: "12px" }}>
              <label style={{ display: "block", marginBottom: "4px", fontSize: "12px", opacity: 0.8 }}>
                Font Size: {(selectedShape as TextShape).fontSize}px
              </label>
              <input
                type="range"
                min="12"
                max="72"
                value={(selectedShape as TextShape).fontSize}
                onChange={(e) => {
                  const newFontSize = parseInt(e.target.value);
                  const shapeIndex = shapesRef.current.findIndex(s => s.id === selectedShape.id);
                  if (shapeIndex !== -1) {
                    shapesRef.current[shapeIndex] = updateShapeProperty(selectedShape, "fontSize", newFontSize) as Shape;
                    setSelectedShape(shapesRef.current[shapeIndex]);
                    redrawAllShapes();
                  }
                }}
                style={{
                  width: "100%",
                  cursor: "pointer",
                }}
              />
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
            <button
              onClick={() => {
                setSelectedShape(null);
                setEditPanelVisible(false);
                redrawAllShapes();
              }}
              style={{
                flex: 1,
                padding: "8px 16px",
                backgroundColor: "#666",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "14px",
              }}
            >
              Done
            </button>
            <button
              onClick={() => {
                // The shape may already be gone (faded out, cleared, undone);
                // close the panel either way
                const shapeIndex = shapesRef.current.findIndex(s => s.id === selectedShape.id);
                if (shapeIndex !== -1) {
                  shapesRef.current.splice(shapeIndex, 1);
                  cleanupOpacityTracking(selectedShape.id);
                }
                setSelectedShape(null);
                setEditPanelVisible(false);
                redrawAllShapes();
              }}
              style={{
                flex: 1,
                padding: "8px 16px",
                backgroundColor: "#ef4444",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "14px",
              }}
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
