/**
 * Shape types for the Annotatr application
 */

export enum ToolType {
  ARROW = "arrow",
  CIRCLE = "circle",
  BOX = "box",
  FREEHAND = "freehand",
  HIGHLIGHTER = "highlighter",
  TEXT = "text",
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
}

export interface ArrowShape extends BaseShape {
  tool: ToolType.ARROW;
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

export type Shape = ArrowShape | CircleShape | BoxShape;

export interface DrawingState {
  isDrawing: boolean;
  currentTool: ToolType | null;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}
