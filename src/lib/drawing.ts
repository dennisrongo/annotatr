/**
 * Drawing utilities for rendering shapes on canvas
 */

import { Shape, ArrowShape, CircleShape, BoxShape } from "../types/shapes";

/**
 * Draw an arrow shape on the canvas
 */
export function drawArrow(
  ctx: CanvasRenderingContext2D,
  shape: ArrowShape
): void {
  const { startPoint, endPoint, color, lineThickness } = shape;

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

  // Draw the arrow head
  ctx.beginPath();
  ctx.moveTo(endPoint.x, endPoint.y);
  ctx.lineTo(
    endPoint.x - headLength * Math.cos(angle - Math.PI / 6),
    endPoint.y - headLength * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    endPoint.x - headLength * Math.cos(angle + Math.PI / 6),
    endPoint.y - headLength * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
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
 * Draw any shape on the canvas
 */
export function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: Shape
): void {
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
    default:
      console.warn("Unknown shape type:", shape);
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
 */
export function redrawShapes(
  ctx: CanvasRenderingContext2D,
  shapes: Shape[]
): void {
  clearCanvas(ctx);
  shapes.forEach((shape) => drawShape(ctx, shape));
}
