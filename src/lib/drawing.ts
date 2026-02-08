/**
 * Drawing utilities for rendering shapes on canvas
 */

import { Shape, ArrowShape, CircleShape, BoxShape, FreehandShape, HighlighterShape, TextShape, ArrowHeadStyle } from "../types/shapes";

/**
 * Draw an arrow head at the specified position
 * @param ctx - Canvas rendering context
 * @param x - X coordinate of arrow head tip
 * @param y - Y coordinate of arrow head tip
 * @param angle - Angle of arrow shaft (in radians)
 * @param headLength - Length of arrow head
 * @param color - Color of arrow head
 * @param style - Arrow head style (filled, open, or double-headed)
 * @param isStart - If true, draw head at start (for double-headed arrows)
 */
function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  headLength: number,
  color: string,
  style: ArrowHeadStyle,
  isStart: boolean = false
): void {
  // Calculate angle offset for start vs end
  const angleOffset = isStart ? Math.PI : 0;
  const finalAngle = angle + angleOffset;

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Calculate arrow head points
  const leftX = x - headLength * Math.cos(finalAngle - Math.PI / 6);
  const leftY = y - headLength * Math.sin(finalAngle - Math.PI / 6);
  const rightX = x - headLength * Math.cos(finalAngle + Math.PI / 6);
  const rightY = y - headLength * Math.sin(finalAngle + Math.PI / 6);

  if (style === ArrowHeadStyle.OPEN) {
    // Open arrow head (outline only)
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(leftX, leftY);
    ctx.moveTo(x, y);
    ctx.lineTo(rightX, rightY);
    ctx.stroke();
  } else {
    // Filled arrow head (default and double-headed)
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(leftX, leftY);
    ctx.lineTo(rightX, rightY);
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * Draw an arrow shape on the canvas
 * Feature #131: Supports different arrow head styles
 */
export function drawArrow(
  ctx: CanvasRenderingContext2D,
  shape: ArrowShape
): void {
  const { startPoint, endPoint, color, lineThickness, arrowHeadStyle = ArrowHeadStyle.FILLED } = shape;

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineThickness;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Calculate arrow parameters
  const headLength = lineThickness * 3; // Length of arrow head
  const angle = Math.atan2(endPoint.y - startPoint.y, endPoint.x - startPoint.x);

  // Draw the shaft
  ctx.beginPath();
  ctx.moveTo(startPoint.x, startPoint.y);
  ctx.lineTo(endPoint.x, endPoint.y);
  ctx.stroke();

  // Draw arrow head(s) based on style
  if (arrowHeadStyle === ArrowHeadStyle.DOUBLE_HEADED) {
    // Draw arrow heads at both ends
    drawArrowHead(ctx, endPoint.x, endPoint.y, angle, headLength, color, ArrowHeadStyle.FILLED, false);
    drawArrowHead(ctx, startPoint.x, startPoint.y, angle, headLength, color, ArrowHeadStyle.FILLED, true);
  } else if (arrowHeadStyle === ArrowHeadStyle.OPEN) {
    // Draw open arrow head at end
    drawArrowHead(ctx, endPoint.x, endPoint.y, angle, headLength, color, ArrowHeadStyle.OPEN, false);
  } else {
    // Draw filled arrow head at end (default)
    drawArrowHead(ctx, endPoint.x, endPoint.y, angle, headLength, color, ArrowHeadStyle.FILLED, false);
  }
}

/**
 * Draw a circle/ellipse shape on the canvas
 */
export function drawCircle(
  ctx: CanvasRenderingContext2D,
  shape: CircleShape
): void {
  const { center, radiusX, radiusY, color, lineThickness } = shape;

  ctx.strokeStyle = color;
  ctx.lineWidth = lineThickness;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  ctx.ellipse(center.x, center.y, radiusX, radiusY, 0, 0, 2 * Math.PI);
  ctx.stroke();
}

/**
 * Draw a box/rectangle shape on the canvas
 */
export function drawBox(
  ctx: CanvasRenderingContext2D,
  shape: BoxShape
): void {
  const { startPoint, width, height, color, lineThickness } = shape;

  ctx.strokeStyle = color;
  ctx.lineWidth = lineThickness;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.strokeRect(startPoint.x, startPoint.y, width, height);
}

/**
 * Draw a freehand shape on the canvas
 */
export function drawFreehand(
  ctx: CanvasRenderingContext2D,
  shape: FreehandShape
): void {
  const { points, color, lineThickness } = shape;

  if (points.length < 2) return;

  ctx.strokeStyle = color;
  ctx.lineWidth = lineThickness;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }

  ctx.stroke();
}

/**
 * Draw a highlighter shape on the canvas (semi-transparent)
 */
export function drawHighlighter(
  ctx: CanvasRenderingContext2D,
  shape: HighlighterShape
): void {
  const { points, color, lineThickness, opacity = 0.3 } = shape;

  if (points.length < 2) return;

  ctx.strokeStyle = color;
  ctx.lineWidth = lineThickness * 2; // Broader stroke for highlighter
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = opacity; // Semi-transparent

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }

  ctx.stroke();
  ctx.globalAlpha = 1.0; // Reset alpha
}

/**
 * Draw a text shape on the canvas
 */
export function drawText(
  ctx: CanvasRenderingContext2D,
  shape: TextShape
): void {
  const { position, text, color, fontSize } = shape;

  ctx.fillStyle = color;
  ctx.font = `${fontSize}px sans-serif`;
  ctx.textBaseline = "top";

  ctx.fillText(text, position.x, position.y);
}

/**
 * Draw any shape on the canvas
 * @param ctx - Canvas rendering context
 * @param shape - Shape to draw
 * @param opacity - Optional opacity value (0-1) for fading
 */
export function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  opacity?: number
): void {
  // Feature #35: Apply opacity if provided (for auto-fade)
  const previousAlpha = ctx.globalAlpha;
  if (opacity !== undefined) {
    ctx.globalAlpha = opacity;
  }

  switch (shape.tool) {
    case "arrow":
      drawArrow(ctx, shape as ArrowShape);
      break;
    case "circle":
      drawCircle(ctx, shape as CircleShape);
      break;
    case "box":
      drawBox(ctx, shape as BoxShape);
      break;
    case "freehand":
      drawFreehand(ctx, shape as FreehandShape);
      break;
    case "highlighter":
      drawHighlighter(ctx, shape as HighlighterShape);
      break;
    case "text":
      drawText(ctx, shape as TextShape);
      break;
    default:
      console.warn("Unknown shape type:", shape);
  }

  // Feature #35: Restore previous alpha
  if (opacity !== undefined) {
    ctx.globalAlpha = previousAlpha;
  }
}

/**
 * Clear the entire canvas
 */
export function clearCanvas(ctx: CanvasRenderingContext2D): void {
  const canvas = ctx.canvas;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

/**
 * Redraw all shapes on the canvas
 * @param ctx - Canvas rendering context
 * @param shapes - Array of shapes to redraw
 * @param opacities - Optional map of shape IDs to opacity values for fading
 */
export function redrawShapes(
  ctx: CanvasRenderingContext2D,
  shapes: Shape[],
  opacities?: Record<string, number>
): void {
  clearCanvas(ctx);
  shapes.forEach((shape) => {
    const opacity = opacities?.[shape.id];
    drawShape(ctx, shape, opacity);
  });
}
