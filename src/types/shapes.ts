/**
 * Shape types for the Annotatr application
 */

export enum ToolType {
  ARROW = "arrow",
  LINE = "line",
  CIRCLE = "circle",
  BOX = "box",
  DIAMOND = "diamond",
  FREEHAND = "freehand",
  HIGHLIGHTER = "highlighter",
  TEXT = "text",
  // Not a drawing tool: activates selection/move mode (click a shape to
  // select, drag to move, edit its properties). See Overlay edit mode.
  SELECT = "select",
}

/**
 * Feature #131: Arrow head styles
 */
export enum ArrowHeadStyle {
  FILLED = "filled",     // Solid filled triangle
  OPEN = "open",         // Open triangle (outline only)
  DOUBLE_HEADED = "double", // Arrow heads on both ends
}

/**
 * Rendering style for shapes
 */
export enum ShapeStyle {
  CLASSIC = "classic",  // Clean strokes (default)
  SKETCHY = "sketchy",  // Hand-drawn, Excalidraw-like look (rough.js)
}

export interface Point {
  x: number;
  y: number;
}

export interface BaseShape {
  id: string;
  tool: ToolType;
  color: string;
  lineThickness: number;
  createdAt: number;
  monitorId?: string; // Feature #9: Track which monitor this shape belongs to (optional for now)
  customFadeDuration?: number; // Feature #128: Optional custom fade duration in seconds (overrides global setting)
  // Seed for the sketchy render style. Fixed at mousedown so the hand-drawn
  // wobble stays identical across preview frames and fade redraws.
  roughSeed?: number;
}

export interface ArrowShape extends BaseShape {
  tool: ToolType.ARROW;
  startPoint: Point;
  endPoint: Point;
  arrowHeadStyle?: ArrowHeadStyle; // Feature #131: Arrow head style customization
}

export interface LineShape extends BaseShape {
  tool: ToolType.LINE;
  startPoint: Point;
  endPoint: Point;
}

export interface CircleShape extends BaseShape {
  tool: ToolType.CIRCLE;
  center: Point;
  radius: number;
  radiusX: number;
  radiusY: number;
}

export interface BoxShape extends BaseShape {
  tool: ToolType.BOX;
  startPoint: Point;
  endPoint: Point;
  width: number;
  height: number;
}

export interface DiamondShape extends BaseShape {
  tool: ToolType.DIAMOND;
  // Bounding box (same as the box tool); the four rhombus vertices are the
  // midpoints of each edge, computed at draw time.
  startPoint: Point;
  endPoint: Point;
}

export interface FreehandShape extends BaseShape {
  tool: ToolType.FREEHAND;
  points: Point[];
}

export interface HighlighterShape extends BaseShape {
  tool: ToolType.HIGHLIGHTER;
  points: Point[];
  opacity: number;
}

export interface TextShape extends BaseShape {
  tool: ToolType.TEXT;
  position: Point;
  text: string;
  fontSize: number;
}

export type Shape = ArrowShape | LineShape | CircleShape | BoxShape | DiamondShape | FreehandShape | HighlighterShape | TextShape;

export interface DrawingState {
  isDrawing: boolean;
  currentTool: ToolType | null;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}
