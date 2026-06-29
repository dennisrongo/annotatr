/**
 * Feature #125: Shape Editing After Placement
 * This module provides functionality for selecting and editing existing shapes
 */

import { Shape, ArrowShape, LineShape, CircleShape, BoxShape, DiamondShape, FreehandShape, HighlighterShape, TextShape, Point, ToolType } from "../types/shapes";

/**
 * Hit detection tolerance in pixels
 * Used for determining if a click is "on" a shape
 */
const HIT_TOLERANCE = 10;

/**
 * Result of a hit detection test
 */
export interface HitResult {
  hit: boolean;
  shape: Shape | null;
  distance?: number; // Distance from click to shape (for sorting)
}

/**
 * Find the shape at a given point
 * Searches shapes in reverse order (top to bottom) and returns the first hit
 *
 * @param shapes - Array of shapes to search (topmost shapes should be at the end)
 * @param point - The point to test
 * @returns The hit result containing the shape if found
 */
export function findShapeAtPoint(shapes: Shape[], point: Point): HitResult {
  // Search in reverse order (topmost shapes first)
  for (let i = shapes.length - 1; i >= 0; i--) {
    const shape = shapes[i];
    const result = testShapeHit(shape, point);

    if (result.hit) {
      return { hit: true, shape };
    }
  }

  return { hit: false, shape: null };
}

/**
 * Test if a point hits a specific shape
 *
 * @param shape - The shape to test
 * @param point - The point to test
 * @returns Hit result with distance if applicable
 */
function testShapeHit(shape: Shape, point: Point): HitResult {
  switch (shape.tool) {
    case ToolType.ARROW:
      return testArrowHit(shape as ArrowShape, point);
    case ToolType.LINE:
      return testLineHit(shape as LineShape, point);
    case ToolType.CIRCLE:
      return testCircleHit(shape as CircleShape, point);
    case ToolType.BOX:
      return testBoxHit(shape as BoxShape, point);
    case ToolType.DIAMOND:
      return testDiamondHit(shape as DiamondShape, point);
    case ToolType.FREEHAND:
      return testFreehandHit(shape as FreehandShape, point);
    case ToolType.HIGHLIGHTER:
      return testHighlighterHit(shape as HighlighterShape, point);
    case ToolType.TEXT:
      return testTextHit(shape as TextShape, point);
    default:
      return { hit: false, shape: null };
  }
}

/**
 * Test if a point hits an arrow shape
 * Checks if point is near the arrow line or arrow head
 */
function testArrowHit(shape: ArrowShape, point: Point): HitResult {
  const { startPoint, endPoint, lineThickness } = shape;
  const tolerance = Math.max(HIT_TOLERANCE, lineThickness / 2);

  // Check if point is near the main line
  const lineDistance = pointToLineDistance(point, startPoint, endPoint);
  if (lineDistance <= tolerance) {
    return { hit: true, shape, distance: lineDistance };
  }

  // Check arrow head (roughly 20px from end point)
  const arrowLength = Math.sqrt(
    Math.pow(endPoint.x - startPoint.x, 2) +
    Math.pow(endPoint.y - startPoint.y, 2)
  );

  if (arrowLength > 20) {
    const arrowHeadSize = 20;
    const ratio = arrowHeadSize / arrowLength;

    // Arrow head base point
    const baseX = endPoint.x - (endPoint.x - startPoint.x) * ratio;
    const baseY = endPoint.y - (endPoint.y - startPoint.y) * ratio;

    // Check if point is in arrow head triangle area
    const headDistance = pointToLineDistance(point, endPoint, { x: baseX, y: baseY });
    if (headDistance <= tolerance * 1.5) {
      return { hit: true, shape, distance: headDistance };
    }
  }

  return { hit: false, shape: null };
}

/**
 * Test if a point hits a straight line shape
 */
function testLineHit(shape: LineShape, point: Point): HitResult {
  const { startPoint, endPoint, lineThickness } = shape;
  const tolerance = Math.max(HIT_TOLERANCE, lineThickness / 2);

  const distance = pointToLineDistance(point, startPoint, endPoint);
  if (distance <= tolerance) {
    return { hit: true, shape, distance };
  }

  return { hit: false, shape: null };
}

/**
 * Test if a point hits a diamond/rhombus shape (near any of its four edges)
 */
function testDiamondHit(shape: DiamondShape, point: Point): HitResult {
  const { startPoint, endPoint, lineThickness } = shape;
  const tolerance = Math.max(HIT_TOLERANCE, lineThickness / 2);

  const minX = Math.min(startPoint.x, endPoint.x);
  const maxX = Math.max(startPoint.x, endPoint.x);
  const minY = Math.min(startPoint.y, endPoint.y);
  const maxY = Math.max(startPoint.y, endPoint.y);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  const top: Point = { x: midX, y: minY };
  const right: Point = { x: maxX, y: midY };
  const bottom: Point = { x: midX, y: maxY };
  const left: Point = { x: minX, y: midY };

  const edges: [Point, Point][] = [
    [top, right],
    [right, bottom],
    [bottom, left],
    [left, top],
  ];

  let best = Infinity;
  for (const [a, b] of edges) {
    best = Math.min(best, pointToLineDistance(point, a, b));
  }

  if (best <= tolerance) {
    return { hit: true, shape, distance: best };
  }

  return { hit: false, shape: null };
}

/**
 * Test if a point hits a circle/ellipse shape
 */
function testCircleHit(shape: CircleShape, point: Point): HitResult {
  const { center, radiusX, radiusY, lineThickness } = shape;
  const tolerance = Math.max(HIT_TOLERANCE, lineThickness / 2);

  // Normalize point to ellipse coordinates
  const dx = (point.x - center.x) / radiusX;
  const dy = (point.y - center.y) / radiusY;

  // Distance from ellipse edge (ellipse equation: x²/a² + y²/b² = 1)
  const distanceFromEdge = Math.abs(Math.sqrt(dx * dx + dy * dy) - 1);

  // Convert back to pixels
  const avgRadius = (radiusX + radiusY) / 2;
  const pixelDistance = distanceFromEdge * avgRadius;

  if (pixelDistance <= tolerance) {
    return { hit: true, shape, distance: pixelDistance };
  }

  return { hit: false, shape: null };
}

/**
 * Test if a point hits a box/rectangle shape
 */
function testBoxHit(shape: BoxShape, point: Point): HitResult {
  const { startPoint, endPoint, lineThickness } = shape;
  const tolerance = Math.max(HIT_TOLERANCE, lineThickness / 2);

  // Get box bounds (accounting for negative width/height)
  const minX = Math.min(startPoint.x, endPoint.x);
  const maxX = Math.max(startPoint.x, endPoint.x);
  const minY = Math.min(startPoint.y, endPoint.y);
  const maxY = Math.max(startPoint.y, endPoint.y);

  // Check if point is on the border (not inside)
  const onLeftEdge = Math.abs(point.x - minX) <= tolerance && point.y >= minY && point.y <= maxY;
  const onRightEdge = Math.abs(point.x - maxX) <= tolerance && point.y >= minY && point.y <= maxY;
  const onTopEdge = Math.abs(point.y - minY) <= tolerance && point.x >= minX && point.x <= maxX;
  const onBottomEdge = Math.abs(point.y - maxY) <= tolerance && point.x >= minX && point.x <= maxX;

  if (onLeftEdge || onRightEdge || onTopEdge || onBottomEdge) {
    // Calculate distance to nearest edge
    const distLeft = Math.abs(point.x - minX);
    const distRight = Math.abs(point.x - maxX);
    const distTop = Math.abs(point.y - minY);
    const distBottom = Math.abs(point.y - maxY);
    const distance = Math.min(distLeft, distRight, distTop, distBottom);

    return { hit: true, shape, distance };
  }

  return { hit: false, shape: null };
}

/**
 * Test if a point hits a freehand drawing
 * Checks if point is near any segment of the freehand path
 */
function testFreehandHit(shape: FreehandShape, point: Point): HitResult {
  const { points, lineThickness } = shape;
  const tolerance = Math.max(HIT_TOLERANCE, lineThickness / 2);

  // Check each segment of the freehand path
  for (let i = 0; i < points.length - 1; i++) {
    const segmentStart = points[i];
    const segmentEnd = points[i + 1];
    const distance = pointToLineDistance(point, segmentStart, segmentEnd);

    if (distance <= tolerance) {
      return { hit: true, shape, distance };
    }
  }

  return { hit: false, shape: null };
}

/**
 * Test if a point hits a highlighter shape
 * Similar to freehand but with more tolerance
 */
function testHighlighterHit(shape: HighlighterShape, point: Point): HitResult {
  const { points, lineThickness } = shape;
  // Highlighter has more tolerance due to its semi-transparent nature
  const tolerance = Math.max(HIT_TOLERANCE * 2, lineThickness);

  // Check each segment of the highlighter path
  for (let i = 0; i < points.length - 1; i++) {
    const segmentStart = points[i];
    const segmentEnd = points[i + 1];
    const distance = pointToLineDistance(point, segmentStart, segmentEnd);

    if (distance <= tolerance) {
      return { hit: true, shape, distance };
    }
  }

  return { hit: false, shape: null };
}

/**
 * Measure a text shape's on-canvas bounding box.
 * Mirrors drawText(): `position` is the TOP-LEFT of the text (canvas
 * textBaseline="top"), lines advance at fontSize*1.2, width is the widest line.
 * Kept in sync with drawText in drawing.ts — the hit box and the selection box
 * must wrap the exact pixels the text occupies, or clicking/selecting is off.
 */
function measureTextBox(
  ctx: CanvasRenderingContext2D,
  shape: TextShape
): { x: number; y: number; width: number; height: number } {
  const { position, text, fontSize } = shape;
  ctx.font = `${fontSize}px sans-serif`;
  const lineHeight = fontSize * 1.2; // matches drawText's line spacing
  const lines = text.split("\n");
  let width = 0;
  for (const line of lines) {
    width = Math.max(width, ctx.measureText(line).width);
  }
  return {
    x: position.x,
    y: position.y, // top of the text — text is drawn downward from here
    width,
    height: Math.max(lineHeight, lines.length * lineHeight),
  };
}

/**
 * Test if a point hits a text shape
 * Uses canvas text measurement to determine hit area
 */
function testTextHit(shape: TextShape, point: Point): HitResult {
  const tolerance = HIT_TOLERANCE;

  // Create a temporary canvas to measure text
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return { hit: false, shape: null };

  const box = measureTextBox(ctx, shape);
  const minX = box.x;
  const maxX = box.x + box.width;
  const minY = box.y;
  const maxY = box.y + box.height;

  // Check if point is within or near the text bounds
  const nearText =
    point.x >= minX - tolerance &&
    point.x <= maxX + tolerance &&
    point.y >= minY - tolerance &&
    point.y <= maxY + tolerance;

  if (nearText) {
    // Calculate distance to text box
    const dx = point.x < minX ? minX - point.x : point.x > maxX ? point.x - maxX : 0;
    const dy = point.y < minY ? minY - point.y : point.y > maxY ? point.y - maxY : 0;
    const distance = Math.sqrt(dx * dx + dy * dy);

    return { hit: true, shape, distance };
  }

  return { hit: false, shape: null };
}

/**
 * Calculate the perpendicular distance from a point to a line segment
 *
 * @param point - The point to test
 * @param lineStart - Start point of the line segment
 * @param lineEnd - End point of the line segment
 * @returns The perpendicular distance
 */
function pointToLineDistance(point: Point, lineStart: Point, lineEnd: Point): number {
  const A = point.x - lineStart.x;
  const B = point.y - lineStart.y;
  const C = lineEnd.x - lineStart.x;
  const D = lineEnd.y - lineStart.y;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;

  let param = -1;

  if (lenSq !== 0) {
    param = dot / lenSq;
  }

  let xx, yy;

  if (param < 0) {
    xx = lineStart.x;
    yy = lineStart.y;
  } else if (param > 1) {
    xx = lineEnd.x;
    yy = lineEnd.y;
  } else {
    xx = lineStart.x + param * C;
    yy = lineStart.y + param * D;
  }

  const dx = point.x - xx;
  const dy = point.y - yy;

  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Update a shape's property
 * Creates a new shape object with the updated property
 *
 * @param shape - The shape to update
 * @param property - The property name to update
 * @param value - The new value
 * @returns A new shape with the updated property
 */
export function updateShapeProperty(shape: Shape, property: string, value: any): Shape {
  const newShape = { ...shape };

  switch (property) {
    case "color":
      newShape.color = value;
      break;
    case "lineThickness":
      newShape.lineThickness = value;
      break;
    case "fontSize":
      if (shape.tool === ToolType.TEXT) {
        (newShape as TextShape).fontSize = value;
      }
      break;
    case "startPoint":
    case "endPoint":
    case "center":
    case "position":
      // For position updates, handle based on shape type
      if (shape.tool === ToolType.FREEHAND || shape.tool === ToolType.HIGHLIGHTER) {
        // For freehand/highlighter, shift all points by the delta
        const currentPoints = (shape as FreehandShape | HighlighterShape).points;
        const delta = value as { dx: number; dy: number };
        (newShape as FreehandShape | HighlighterShape).points = currentPoints.map(p => ({
          x: p.x + delta.dx,
          y: p.y + delta.dy,
        }));
      } else if (
        shape.tool === ToolType.ARROW ||
        shape.tool === ToolType.LINE ||
        shape.tool === ToolType.BOX ||
        shape.tool === ToolType.DIAMOND
      ) {
        // Shapes defined by a startPoint/endPoint bounding box
        const pointShape = shape as ArrowShape | LineShape | BoxShape | DiamondShape;
        const delta = value as { dx: number; dy: number };
        (newShape as ArrowShape | LineShape | BoxShape | DiamondShape).startPoint = {
          x: pointShape.startPoint.x + delta.dx,
          y: pointShape.startPoint.y + delta.dy,
        };
        (newShape as ArrowShape | LineShape | BoxShape | DiamondShape).endPoint = {
          x: pointShape.endPoint.x + delta.dx,
          y: pointShape.endPoint.y + delta.dy,
        };
      } else if (shape.tool === ToolType.CIRCLE) {
        // For circle, move center
        const delta = value as { dx: number; dy: number };
        (newShape as CircleShape).center = {
          x: (shape as CircleShape).center.x + delta.dx,
          y: (shape as CircleShape).center.y + delta.dy,
        };
      } else if (shape.tool === ToolType.TEXT) {
        // For text, move position
        const delta = value as { dx: number; dy: number };
        (newShape as TextShape).position = {
          x: (shape as TextShape).position.x + delta.dx,
          y: (shape as TextShape).position.y + delta.dy,
        };
      }
      break;
  }

  return newShape;
}

/**
 * Draw a selection indicator around a shape
 * Shows a dashed bounding box or highlight to indicate selection
 *
 * @param ctx - The canvas rendering context
 * @param shape - The shape to highlight
 */
export function drawSelectionIndicator(ctx: CanvasRenderingContext2D, shape: Shape): void {
  ctx.save();
  ctx.strokeStyle = "#00BFFF"; // Bright cyan
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]); // Dashed line

  switch (shape.tool) {
    case ToolType.ARROW:
    case ToolType.LINE:
    case ToolType.DIAMOND: {
      const seg = shape as ArrowShape | LineShape | DiamondShape;
      // Draw selection box around the shape's bounding box
      const minX = Math.min(seg.startPoint.x, seg.endPoint.x) - 10;
      const maxX = Math.max(seg.startPoint.x, seg.endPoint.x) + 10;
      const minY = Math.min(seg.startPoint.y, seg.endPoint.y) - 10;
      const maxY = Math.max(seg.startPoint.y, seg.endPoint.y) + 10;
      ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
      break;
    }
    case ToolType.CIRCLE: {
      const circle = shape as CircleShape;
      // Draw selection circle slightly larger than the shape
      ctx.beginPath();
      ctx.ellipse(
        circle.center.x,
        circle.center.y,
        circle.radiusX + 10,
        circle.radiusY + 10,
        0,
        0,
        Math.PI * 2
      );
      ctx.stroke();
      break;
    }
    case ToolType.BOX: {
      const box = shape as BoxShape;
      // Draw selection rectangle slightly larger than the box
      const minX = Math.min(box.startPoint.x, box.endPoint.x) - 10;
      const maxX = Math.max(box.startPoint.x, box.endPoint.x) + 10;
      const minY = Math.min(box.startPoint.y, box.endPoint.y) - 10;
      const maxY = Math.max(box.startPoint.y, box.endPoint.y) + 10;
      ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
      break;
    }
    case ToolType.FREEHAND:
    case ToolType.HIGHLIGHTER: {
      const freehand = shape as FreehandShape | HighlighterShape;
      if (freehand.points.length === 0) break;
      // Draw bounding box around freehand shape
      const xs = freehand.points.map(p => p.x);
      const ys = freehand.points.map(p => p.y);
      const minX = Math.min(...xs) - 10;
      const maxX = Math.max(...xs) + 10;
      const minY = Math.min(...ys) - 10;
      const maxY = Math.max(...ys) + 10;
      ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
      break;
    }
    case ToolType.TEXT: {
      const text = shape as TextShape;
      // Wrap the text's actual on-canvas bounds (top-left origin, matches
      // drawText) so the dashed box sits around the glyphs, not a line-height
      // above them. 5px padding on every side.
      const box = measureTextBox(ctx, text);
      ctx.strokeRect(box.x - 5, box.y - 5, box.width + 10, box.height + 10);
      break;
    }
  }

  ctx.restore();
}
