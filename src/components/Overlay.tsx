import { useEffect, useState, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ToolType, Shape, ArrowShape, LineShape, CircleShape, BoxShape, DiamondShape, FreehandShape, HighlighterShape, TextShape, Point, ShapeStyle } from "../types/shapes";
import { drawShape, redrawShapes, SKETCHY_FONT_STACK } from "../lib/drawing";
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
  // Guards the text commit against firing twice for one input. A click to
  // place a new text block (or to click elsewhere) triggers BOTH the explicit
  // mousedown commit AND the textarea's blur commit. The native order is
  // mousedown -> blur, but both read React state that is mid-transition, so the
  // blur path can commit a second shape at the *click* location (the text then
  // appears to "shift" to where you clicked). The first commit flips this to
  // true; the second is suppressed. It resets when a new text input opens.
  const textCommittedRef = useRef(false);

  // Feature #30 & #31: Settings state for font size and colors
  const [settings, setSettings] = useState<Settings | null>(null);

  // Feature #9: Track current monitor ID for shape confinement
  const [currentMonitor, setCurrentMonitor] = useState<string | null>(null);

  // Feature #125: Shape editing mode
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedShape, setSelectedShape] = useState<Shape | null>(null);
  // Active drag (move) in selection mode. Kept in a ref so dragging mutates
  // shapes/redraws without triggering a re-render on every mousemove.
  const dragRef = useRef<{ shapeId: string; lastX: number; lastY: number } | null>(null);

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
      [ToolType.LINE]: 'line',
      [ToolType.CIRCLE]: 'circle',
      [ToolType.BOX]: 'box',
      [ToolType.DIAMOND]: 'diamond',
      [ToolType.FREEHAND]: 'freehand',
      [ToolType.HIGHLIGHTER]: 'highlighter',
      [ToolType.TEXT]: 'text',
      [ToolType.SELECT]: 'arrow', // Select never draws; fallback key, unused
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
      [ToolType.LINE]: 'line',
      [ToolType.CIRCLE]: 'circle',
      [ToolType.BOX]: 'box',
      [ToolType.DIAMOND]: 'diamond',
      [ToolType.FREEHAND]: 'freehand',
      [ToolType.HIGHLIGHTER]: 'highlighter',
      [ToolType.TEXT]: 'text',
      [ToolType.SELECT]: 'arrow', // Select never draws; fallback key, unused
    };

    const thicknessKey = toolThicknessKey[tool];
    // The Settings slider sets one global thickness for every tool (stored
    // per-tool, with `arrow` as the representative the slider reads). Settings
    // saved before line/diamond existed have no key for them, so fall back to
    // the global (arrow) value rather than the hardcoded default.
    const lt = settings.lineThickness;
    return lt[thicknessKey] ?? lt.arrow ?? defaultLineThickness;
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

  // Sketchy style: seed picked at mousedown so the hand-drawn wobble stays
  // identical across preview frames and on the final shape
  const sketchSeedRef = useRef(1);
  const getShapeStyle = useCallback((): ShapeStyle => {
    return settingsRef.current?.shapeStyle ?? ShapeStyle.CLASSIC;
  }, []);

  // Feature #128: Custom fade duration for the next shape (null = use global setting)
  const [customFadeDuration, setCustomFadeDuration] = useState<number | null>(null);

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
      case ToolType.LINE:
        return "crosshair"; // Precision cursor for line drawing
      case ToolType.CIRCLE:
        return "crosshair"; // Precision cursor for circle drawing
      case ToolType.BOX:
        return "crosshair"; // Precision cursor for box drawing
      case ToolType.DIAMOND:
        return "crosshair"; // Precision cursor for diamond drawing
      case ToolType.FREEHAND:
        return "crosshair"; // Standard drawing cursor for freehand
      case ToolType.HIGHLIGHTER:
        return "crosshair"; // Standard drawing cursor for highlighter
      case ToolType.TEXT:
        return "text"; // Text cursor (I-beam) for text input
      case ToolType.SELECT:
        return "default"; // Selection mode uses the move cursor (set at container level)
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
    redrawShapes(ctx, shapesRef.current, shapeOpacitiesRef.current, getShapeStyle());

    // Feature #125: Draw selection indicator around the live shape (looked up
    // by id so it tracks the shape exactly mid-drag, before selectedShape
    // state catches up). The shape may be gone via fade-out, clear, or undo.
    if (selectedShape && isEditMode) {
      const live = shapesRef.current.find(s => s.id === selectedShape.id);
      if (live) drawSelectionIndicator(ctx, live);
    }
  }, [getCanvasContext, selectedShape, isEditMode, getShapeStyle]);
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
    // "Keep on screen" mode: shapes never fade, so there is nothing to animate.
    if (settingsRef.current?.persistShapes) return;

    fadeIntervalRef.current = setInterval(() => {
      if (shapesRef.current.length === 0) {
        clearInterval(fadeIntervalRef.current!);
        fadeIntervalRef.current = null;
        shapeOpacitiesRef.current = {};
        return;
      }

      // Defensive: if the user flips to "keep on screen" while the loop is
      // mid-flight, hold everything at full opacity and stop the loop.
      if (settingsRef.current?.persistShapes) {
        clearInterval(fadeIntervalRef.current!);
        fadeIntervalRef.current = null;
        shapeOpacitiesRef.current = {};
        if (!isDrawingRef.current) redrawRef.current();
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
   * React the moment the "keep on screen" toggle flips so shapes already on
   * screen obey the new mode without waiting for the next shape to be drawn.
   */
  const prevPersistRef = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    const persist = settings?.persistShapes ?? false;
    const prev = prevPersistRef.current;
    prevPersistRef.current = persist;
    if (prev === undefined || prev === persist) return;

    if (persist) {
      // Turned ON: stop fading and restore every shape to full opacity.
      if (fadeIntervalRef.current !== null) {
        clearInterval(fadeIntervalRef.current);
        fadeIntervalRef.current = null;
      }
      shapeOpacitiesRef.current = {};
      redrawAllShapes();
    } else {
      // Turned OFF: give the held shapes a fresh fade timer so they ease out
      // from now rather than vanishing instantly for being long-expired.
      const now = Date.now();
      shapesRef.current.forEach((shape) => { shape.createdAt = now; });
      if (shapesRef.current.length > 0) ensureFadeLoop();
    }
  }, [settings?.persistShapes, ensureFadeLoop, redrawAllShapes]);

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
      roughSeed: sketchSeedRef.current,
    };

    // Feature #128: Add custom fade duration if set
    if (customFadeDuration !== null) {
      shape.customFadeDuration = customFadeDuration;
      console.log(`[Feature #128] Applied custom fade duration: ${customFadeDuration}s to arrow shape`);
    }

    return shape;
  }, [generateShapeId, currentMonitor, getToolColor, getToolLineThickness, customFadeDuration, settings]);

  /**
   * Create line shape from drawing state (a straight line, no arrow head)
   */
  const createLineShape = useCallback((
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ): LineShape => {
    const shape: LineShape = {
      id: generateShapeId(),
      tool: ToolType.LINE,
      startPoint: { x: startX, y: startY },
      endPoint: { x: endX, y: endY },
      color: getToolColor(ToolType.LINE),
      lineThickness: getToolLineThickness(ToolType.LINE),
      createdAt: Date.now(),
      monitorId: currentMonitor || "default",
      roughSeed: sketchSeedRef.current,
    };

    if (customFadeDuration !== null) {
      shape.customFadeDuration = customFadeDuration;
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
    // Start point and cursor form opposite corners of the bounding box,
    // matching how the box tool expands from the drag origin
    const centerX = (startX + currentX) / 2;
    const centerY = (startY + currentY) / 2;
    const radiusX = Math.abs(currentX - startX) / 2;
    const radiusY = Math.abs(currentY - startY) / 2;

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
      roughSeed: sketchSeedRef.current,
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
      roughSeed: sketchSeedRef.current,
    };

    // Feature #128: Add custom fade duration if set
    if (customFadeDuration !== null) {
      shape.customFadeDuration = customFadeDuration;
      console.log(`[Feature #128] Applied custom fade duration: ${customFadeDuration}s to box shape`);
    }

    return shape;
  }, [generateShapeId, currentMonitor, getToolColor, getToolLineThickness, customFadeDuration]);

  /**
   * Create diamond shape from drawing state.
   * Stores the drag bounding box; the rhombus vertices are computed at draw time.
   */
  const createDiamondShape = useCallback((
    startX: number,
    startY: number,
    currentX: number,
    currentY: number
  ): DiamondShape => {
    const shape: DiamondShape = {
      id: generateShapeId(),
      tool: ToolType.DIAMOND,
      startPoint: { x: startX, y: startY },
      endPoint: { x: currentX, y: currentY },
      color: getToolColor(ToolType.DIAMOND),
      lineThickness: getToolLineThickness(ToolType.DIAMOND),
      createdAt: Date.now(),
      monitorId: currentMonitor || "default",
      roughSeed: sketchSeedRef.current,
    };

    if (customFadeDuration !== null) {
      shape.customFadeDuration = customFadeDuration;
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
      roughSeed: sketchSeedRef.current,
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
   * Commit typed text as a shape on the overlay.
   * Shared by Enter, blur, and "click elsewhere" so text is never lost.
   * Returns true if a shape was created (non-empty text).
   */
  const commitText = useCallback((position: Point, text: string): boolean => {
    if (!text.trim()) return false;
    // A click to relocate/place a text block fires both the explicit mousedown
    // commit and the textarea blur. Suppress the second so the text isn't
    // re-committed at the click location (which made the block appear to jump).
    if (textCommittedRef.current) return false;
    textCommittedRef.current = true;

    const newTextShape = createTextShape(position, text);
    shapesRef.current.push(newTextShape);
    ensureFadeLoop();
    console.log("Created text shape:", newTextShape);

    // Feature #128: Reset custom fade duration after shape is created
    if (customFadeDuration !== null) {
      setCustomFadeDuration(null);
    }

    redrawAllShapes();
    return true;
  }, [createTextShape, ensureFadeLoop, customFadeDuration, redrawAllShapes]);

  /**
   * Handle mouse down - start drawing OR select shape in edit mode
   * Feature #125: In edit mode, clicking on a shape selects it for editing
   */
  const handleMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    // Feature #125: In selection mode (Select tool or Ctrl+E edit mode), try
    // to select a shape — and begin a drag so it can be moved.
    if (isEditMode || currentTool === ToolType.SELECT) {
      const hitResult = findShapeAtPoint(shapesRef.current, { x: clickX, y: clickY });

      if (hitResult.hit && hitResult.shape) {
        console.log(`[Feature #125] Selected shape: ${hitResult.shape.tool} (${hitResult.shape.id})`);
        setSelectedShape(hitResult.shape);
        // Start a potential drag from this point (no move happens until the
        // cursor actually moves, so a plain click just selects)
        dragRef.current = { shapeId: hitResult.shape.id, lastX: clickX, lastY: clickY };
        redrawAllShapes();
      } else {
        // Clicked on empty space - deselect
        dragRef.current = null;
        if (selectedShape) {
          console.log("[Feature #125] Deselected shape");
          setSelectedShape(null);
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
      // Commit any in-progress text first so relocating the caret keeps it.
      // commitText is guarded so the trailing blur (mousedown -> blur order)
      // won't re-commit the same block at the new click location.
      if (textInputVisible) {
        commitText(textInputPosition, textInputValue);
      }
      // Reset the commit guard for the new text block about to open
      textCommittedRef.current = false;
      setTextInputPosition({ x: startX, y: startY });
      setTextInputValue("");
      setTextInputVisible(true);
      // Focus the input after it's rendered, resetting any auto-grown height
      setTimeout(() => {
        const el = textInputRef.current;
        if (el) {
          el.style.height = "auto";
          el.focus();
        }
      }, 0);
      return;
    }

    // New drag → new sketch seed, held constant until the shape is finished
    sketchSeedRef.current = Math.floor(Math.random() * 2147483646) + 1;

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
  }, [isDrawingMode, currentTool, isEditMode, selectedShape, redrawAllShapes, textInputVisible, textInputValue, textInputPosition, commitText]);

  /**
   * Handle mouse move - update preview
   * Feature #132: Show alignment guides during drawing
   */
  const handleMouseMove = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    // Selection mode: drag the held shape to move it
    if ((isEditMode || currentTool === ToolType.SELECT) && dragRef.current) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const dx = x - dragRef.current.lastX;
      const dy = y - dragRef.current.lastY;
      if (dx !== 0 || dy !== 0) {
        const idx = shapesRef.current.findIndex(s => s.id === dragRef.current!.shapeId);
        if (idx !== -1) {
          const moved = updateShapeProperty(shapesRef.current[idx], "startPoint", { dx, dy }) as Shape;
          shapesRef.current[idx] = moved;
          dragRef.current.lastX = x;
          dragRef.current.lastY = y;
          setSelectedShape(moved);
          redrawAllShapes();
        }
      }
      return;
    }

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
      redrawShapes(ctx, shapesRef.current, shapeOpacitiesRef.current, getShapeStyle());

      // Draw preview of current freehand path
      const previewShape = currentTool === ToolType.FREEHAND
        ? createFreehandShape([...drawingState.freehandPoints, newPoint])
        : createHighlighterShape([...drawingState.freehandPoints, newPoint]);

      drawShape(ctx, previewShape, undefined, getShapeStyle());
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
    redrawShapes(ctx, shapesRef.current, shapeOpacitiesRef.current, getShapeStyle());

    // Draw preview of current shape
    let previewShape: Shape;

    switch (currentTool) {
      case ToolType.ARROW:
        previewShape = createArrowShape(drawingState.startX, drawingState.startY, currentX, currentY);
        break;
      case ToolType.LINE:
        previewShape = createLineShape(drawingState.startX, drawingState.startY, currentX, currentY);
        break;
      case ToolType.CIRCLE:
        previewShape = createCircleShape(drawingState.startX, drawingState.startY, currentX, currentY);
        break;
      case ToolType.BOX:
        previewShape = createBoxShape(drawingState.startX, drawingState.startY, currentX, currentY);
        break;
      case ToolType.DIAMOND:
        previewShape = createDiamondShape(drawingState.startX, drawingState.startY, currentX, currentY);
        break;
      default:
        return;
    }

    drawShape(ctx, previewShape, undefined, getShapeStyle());
  }, [drawingState.isDrawing, drawingState.startX, drawingState.startY, drawingState.freehandPoints, currentTool, isEditMode, getCanvasContext, createArrowShape, createLineShape, createCircleShape, createBoxShape, createDiamondShape, createFreehandShape, createHighlighterShape, getShapeStyle, redrawAllShapes]);

  /**
   * Handle text input submission
   */
  const handleTextInputSubmit = useCallback(() => {
    commitText(textInputPosition, textInputValue);
    setTextInputVisible(false);
    setTextInputValue("");
    // Allow the next text block to commit again
    textCommittedRef.current = false;
  }, [commitText, textInputPosition, textInputValue]);

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
      textCommittedRef.current = false;
    }
    // Shift+Enter allows default behavior (new line)
  }, [handleTextInputSubmit]);

  /**
   * Handle mouse up - complete shape
   */
  const handleMouseUp = useCallback(() => {
    // End any in-progress shape drag (selection mode). Runs before the
    // drawing guard below, which returns early when not drawing.
    if (dragRef.current) {
      dragRef.current = null;
    }

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
      case ToolType.LINE:
        newShape = createLineShape(startX, startY, currentX, currentY);
        break;
      case ToolType.CIRCLE:
        newShape = createCircleShape(startX, startY, currentX, currentY);
        break;
      case ToolType.BOX:
        newShape = createBoxShape(startX, startY, currentX, currentY);
        break;
      case ToolType.DIAMOND:
        newShape = createDiamondShape(startX, startY, currentX, currentY);
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
  }, [drawingState, currentTool, createArrowShape, createLineShape, createCircleShape, createBoxShape, createDiamondShape, createFreehandShape, createHighlighterShape, redrawAllShapes, customFadeDuration, ensureFadeLoop]);

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
  });
  latest.current = {
    drawingState,
    isEditMode,
    selectedShape,
    redrawAllShapes,
    undoLastShape,
    clearAllShapes,
    cleanupOpacityTracking,
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

      // Feature #124: Handle Ctrl+Shift+X / Cmd+Shift+X to clear all shapes.
      // Route through the backend so every monitor's overlay clears, not just
      // the focused one (each monitor has its own overlay window/state).
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "x") {
        event.preventDefault();
        invoke("clear_all_shapes").catch(console.error);
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
          }
          return newMode;
        });
        return;
      }

      // Feature #125: Delete the selected shape with Delete/Backspace (the
      // text-input guard above already prevents this while typing text).
      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        latest.current.isEditMode &&
        latest.current.selectedShape
      ) {
        event.preventDefault();
        const sel = latest.current.selectedShape;
        const idx = shapesRef.current.findIndex(s => s.id === sel.id);
        if (idx !== -1) {
          shapesRef.current.splice(idx, 1);
          latest.current.cleanupOpacityTracking(sel.id);
        }
        setSelectedShape(null);
        latest.current.redrawAllShapes();
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
        // Also leave selection/move mode so a fresh activation starts clean
        setIsEditMode(false);
        setSelectedShape(null);
        dragRef.current = null;
      }
    });

    // Listen for tool selection events
    const unlistenToolSelected = listen<string>("tool-selected", (event) => {
      console.log("Tool selected:", event.payload);
      const tool = event.payload as ToolType;

      if (!Object.values(ToolType).includes(tool)) return;

      setCurrentTool(tool);

      if (tool === ToolType.SELECT) {
        // The Select tool enters selection/move mode (same mode as Ctrl+E)
        setIsEditMode(true);
      } else {
        // Switching to a drawing tool leaves selection mode and drops any
        // current selection/drag.
        setIsEditMode(false);
        setSelectedShape(null);
        dragRef.current = null;
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
      setTextInputVisible(false);
      setTextInputValue("");
      textCommittedRef.current = false;

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
      redrawShapes(ctx, shapesRef.current, shapeOpacitiesRef.current, settingsRef.current?.shapeStyle ?? ShapeStyle.CLASSIC);
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

  // Feature #8/#9: Bind this overlay to its own monitor.
  // Each monitor has its own overlay window labelled "overlay_<index>"; the
  // matching monitor id is "monitor_<index>". This window only ever renders
  // and tags shapes for its own monitor, so there is no cross-monitor
  // filtering to do — every overlay's React state is independent.
  useEffect(() => {
    try {
      const label = getCurrentWindow().label; // e.g. "overlay_1"
      const monitorId = label.replace(/^overlay_/, "monitor_");
      console.log("Overlay bound to monitor:", monitorId, "(window:", label + ")");
      setCurrentMonitor(monitorId);
    } catch (error) {
      console.error("Failed to resolve overlay monitor from window label:", error);
      setCurrentMonitor(null);
    }
  }, []);

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
        // Feature #16 & #107: Change cursor based on drawing mode and selected tool.
        // In selection/move mode show the move cursor instead.
        cursor: (isEditMode || currentTool === ToolType.SELECT)
          ? "move"
          : getToolCursor(currentTool, isDrawingMode),
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

      {/* Text input field (shown when text tool is used) */}
      {/* Feature #30 & #31: Uses font size and color from settings */}
      {/* Feature #129: Multi-line text support with textarea */}
      {textInputVisible && (() => {
        // Compute the exact font metrics the committed canvas shape will use
        // (see createTextShape / drawText) so the live textarea lines up with
        // the on-canvas text pixel-for-pixel. The previous version relied on
        // the textarea's default line-height ("normal"), whose half-leading
        // pushed the glyphs ~0.1*fontSize below position.y while canvas's
        // textBaseline="top" anchors the em-box AT position.y — so on commit
        // the text jumped up by that half-leading.
        const fontSizePx = settings ? Math.round(settings.fontSize * 1.7) : defaultFontSize;
        const lineHeightPx = Math.round(fontSizePx * 1.2); // matches drawText
        // Half-leading = (lineHeight - fontSize) / 2. The textarea places the
        // em-box top this far inside its line box, so nudge the field up by it
        // to align the textarea's glyphs with canvas's top-baseline origin.
        const halfLeading = (lineHeightPx - fontSizePx) / 2;
        return (
          <textarea
            ref={textInputRef}
            value={textInputValue}
            rows={1}
            onChange={(e) => {
              setTextInputValue(e.target.value);
              // Auto-grow height so the field never shows a scrollbar
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${el.scrollHeight}px`;
            }}
            onKeyDown={handleTextInputKeyDown}
            onBlur={handleTextInputSubmit}
            style={{
              position: "absolute",
              left: textInputPosition.x,
              top: textInputPosition.y - halfLeading,
              // Feature #30: Use font size from settings
              fontSize: `${fontSizePx}px`,
              // Match the canvas line spacing exactly (drawText: fontSize*1.2)
              lineHeight: `${lineHeightPx}px`,
              // Match the canvas font so the input previews the final text
              fontFamily: settings?.shapeStyle === ShapeStyle.SKETCHY ? SKETCHY_FONT_STACK : "sans-serif",
              padding: 0,
              margin: 0,
              // Transparent, borderless field so the input previews the final
              // on-canvas text 1:1 (no white box, no frame)
              border: "none",
              borderRadius: 0,
              outline: "none",
              backgroundColor: "transparent",
              // Feature #31: Use text color from settings for text and caret
              color: settings?.colors.text || "#FF0000",
              caretColor: settings?.colors.text || "#FF0000",
              minWidth: "200px",
              zIndex: 10000,
              resize: "none",
              overflow: "hidden",
            }}
          />
        );
      })()}
    </div>
  );
}
