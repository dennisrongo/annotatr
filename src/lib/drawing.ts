/**
 * Drawing utilities for rendering shapes on canvas
 */

import rough from "roughjs";
import { Shape, ArrowShape, LineShape, CircleShape, BoxShape, DiamondShape, FreehandShape, HighlighterShape, TextShape, ArrowHeadStyle, ShapeStyle } from "../types/shapes";

type RoughCanvas = ReturnType<typeof rough.canvas>;

// RoughCanvas wraps the canvas's one-and-only 2d context, so a single
// instance per canvas element can be reused across redraws
const roughCanvasCache = new WeakMap<HTMLCanvasElement, RoughCanvas>();

function getRoughCanvas(ctx: CanvasRenderingContext2D): RoughCanvas {
  let rc = roughCanvasCache.get(ctx.canvas);
  if (!rc) {
    rc = rough.canvas(ctx.canvas);
    roughCanvasCache.set(ctx.canvas, rc);
  }
  return rc;
}

/** Deterministic 31-bit hash so shapes without a roughSeed still render stably */
function seedFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  }
  return ((h >>> 0) % 2147483646) + 1;
}

function sketchSeed(shape: Shape): number {
  return shape.roughSeed ?? seedFromString(shape.id);
}

/** Shared rough.js options tuned to match Excalidraw's hand-drawn look */
function sketchOptions(shape: Shape) {
  return {
    stroke: shape.color,
    strokeWidth: shape.lineThickness,
    roughness: 1.5,
    bowing: 1.2,
    seed: sketchSeed(shape),
  };
}

export const SKETCHY_FONT_STACK = '"Excalifont", "Virgil", "Segoe Print", "Chalkboard SE", "Comic Sans MS", cursive';

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
 * Draw a sketchy arrow head (lines for open style, solid polygon otherwise)
 */
function drawSketchyArrowHead(
  rc: RoughCanvas,
  shape: ArrowShape,
  x: number,
  y: number,
  angle: number,
  headLength: number,
  style: ArrowHeadStyle,
  isStart: boolean = false
): void {
  const angleOffset = isStart ? Math.PI : 0;
  const finalAngle = angle + angleOffset;

  const leftX = x - headLength * Math.cos(finalAngle - Math.PI / 6);
  const leftY = y - headLength * Math.sin(finalAngle - Math.PI / 6);
  const rightX = x - headLength * Math.cos(finalAngle + Math.PI / 6);
  const rightY = y - headLength * Math.sin(finalAngle + Math.PI / 6);

  // Offset the seed so the head's wobble differs from the shaft's
  const options = { ...sketchOptions(shape), seed: sketchSeed(shape) + (isStart ? 1 : 2) };

  if (style === ArrowHeadStyle.OPEN) {
    rc.line(x, y, leftX, leftY, options);
    rc.line(x, y, rightX, rightY, options);
  } else {
    rc.polygon(
      [[x, y], [leftX, leftY], [rightX, rightY]],
      {
        ...options,
        fill: shape.color,
        fillStyle: "solid",
        strokeWidth: Math.max(1, shape.lineThickness / 2),
      }
    );
  }
}

/**
 * Draw an arrow shape on the canvas
 * Feature #131: Supports different arrow head styles
 */
export function drawArrow(
  ctx: CanvasRenderingContext2D,
  shape: ArrowShape,
  style: ShapeStyle = ShapeStyle.CLASSIC
): void {
  const { startPoint, endPoint, color, lineThickness, arrowHeadStyle = ArrowHeadStyle.FILLED } = shape;

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineThickness;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Calculate arrow parameters
  const headLength = Math.max(lineThickness * 3, 12); // Length of arrow head
  const dx = endPoint.x - startPoint.x;
  const dy = endPoint.y - startPoint.y;
  const length = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);

  // End the shaft at the base of each filled head — a shaft drawn to the tip
  // pokes out around the head. Open heads have no fill to tuck under, so the
  // shaft keeps its full length.
  const inset = Math.min(headLength * Math.cos(Math.PI / 6), length / 2);
  const insetEnd = arrowHeadStyle !== ArrowHeadStyle.OPEN;
  const insetStart = arrowHeadStyle === ArrowHeadStyle.DOUBLE_HEADED;
  const shaftStartX = insetStart ? startPoint.x + inset * Math.cos(angle) : startPoint.x;
  const shaftStartY = insetStart ? startPoint.y + inset * Math.sin(angle) : startPoint.y;
  const shaftEndX = insetEnd ? endPoint.x - inset * Math.cos(angle) : endPoint.x;
  const shaftEndY = insetEnd ? endPoint.y - inset * Math.sin(angle) : endPoint.y;

  if (style === ShapeStyle.SKETCHY) {
    const rc = getRoughCanvas(ctx);
    rc.line(shaftStartX, shaftStartY, shaftEndX, shaftEndY, sketchOptions(shape));

    if (arrowHeadStyle === ArrowHeadStyle.DOUBLE_HEADED) {
      drawSketchyArrowHead(rc, shape, endPoint.x, endPoint.y, angle, headLength, ArrowHeadStyle.FILLED, false);
      drawSketchyArrowHead(rc, shape, startPoint.x, startPoint.y, angle, headLength, ArrowHeadStyle.FILLED, true);
    } else if (arrowHeadStyle === ArrowHeadStyle.OPEN) {
      drawSketchyArrowHead(rc, shape, endPoint.x, endPoint.y, angle, headLength, ArrowHeadStyle.OPEN, false);
    } else {
      drawSketchyArrowHead(rc, shape, endPoint.x, endPoint.y, angle, headLength, ArrowHeadStyle.FILLED, false);
    }
    return;
  }

  // Draw the shaft
  ctx.beginPath();
  ctx.moveTo(shaftStartX, shaftStartY);
  ctx.lineTo(shaftEndX, shaftEndY);
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
 * Draw a straight line shape on the canvas (an arrow without the head)
 */
export function drawLine(
  ctx: CanvasRenderingContext2D,
  shape: LineShape,
  style: ShapeStyle = ShapeStyle.CLASSIC
): void {
  const { startPoint, endPoint, color, lineThickness } = shape;

  if (style === ShapeStyle.SKETCHY) {
    getRoughCanvas(ctx).line(startPoint.x, startPoint.y, endPoint.x, endPoint.y, sketchOptions(shape));
    return;
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = lineThickness;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  ctx.moveTo(startPoint.x, startPoint.y);
  ctx.lineTo(endPoint.x, endPoint.y);
  ctx.stroke();
}

/**
 * Draw a diamond/rhombus shape on the canvas.
 * The vertices are the midpoints of the bounding box edges (top, right,
 * bottom, left), matching Excalidraw's diamond.
 */
export function drawDiamond(
  ctx: CanvasRenderingContext2D,
  shape: DiamondShape,
  style: ShapeStyle = ShapeStyle.CLASSIC
): void {
  const { startPoint, endPoint, color, lineThickness } = shape;

  // Normalize the bounding box so dragging in any direction works
  const minX = Math.min(startPoint.x, endPoint.x);
  const maxX = Math.max(startPoint.x, endPoint.x);
  const minY = Math.min(startPoint.y, endPoint.y);
  const maxY = Math.max(startPoint.y, endPoint.y);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  // Vertices: top, right, bottom, left
  const top: [number, number] = [midX, minY];
  const right: [number, number] = [maxX, midY];
  const bottom: [number, number] = [midX, maxY];
  const left: [number, number] = [minX, midY];

  if (style === ShapeStyle.SKETCHY) {
    getRoughCanvas(ctx).polygon([top, right, bottom, left], sketchOptions(shape));
    return;
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = lineThickness;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  ctx.moveTo(top[0], top[1]);
  ctx.lineTo(right[0], right[1]);
  ctx.lineTo(bottom[0], bottom[1]);
  ctx.lineTo(left[0], left[1]);
  ctx.closePath();
  ctx.stroke();
}

/**
 * Draw a circle/ellipse shape on the canvas
 */
export function drawCircle(
  ctx: CanvasRenderingContext2D,
  shape: CircleShape,
  style: ShapeStyle = ShapeStyle.CLASSIC
): void {
  const { center, radiusX, radiusY, color, lineThickness } = shape;

  if (style === ShapeStyle.SKETCHY) {
    getRoughCanvas(ctx).ellipse(center.x, center.y, radiusX * 2, radiusY * 2, sketchOptions(shape));
    return;
  }

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
  shape: BoxShape,
  style: ShapeStyle = ShapeStyle.CLASSIC
): void {
  const { startPoint, width, height, color, lineThickness } = shape;

  if (style === ShapeStyle.SKETCHY) {
    // Normalize: width/height are negative when dragged up or left
    const x = width < 0 ? startPoint.x + width : startPoint.x;
    const y = height < 0 ? startPoint.y + height : startPoint.y;
    getRoughCanvas(ctx).rectangle(x, y, Math.abs(width), Math.abs(height), sketchOptions(shape));
    return;
  }

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
  shape: FreehandShape,
  style: ShapeStyle = ShapeStyle.CLASSIC
): void {
  const { points, color, lineThickness } = shape;

  if (points.length < 2) return;

  if (style === ShapeStyle.SKETCHY) {
    // Lighter roughness than the geometric shapes: the user's hand already
    // provides the wobble, rough.js just adds the sketchy stroke texture
    getRoughCanvas(ctx).curve(
      points.map((p): [number, number] => [p.x, p.y]),
      { ...sketchOptions(shape), roughness: 0.8, bowing: 0.5 }
    );
    return;
  }

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
 * The font stack a text shape is rendered with, given the shape style.
 * Centralized so drawText, the textarea, and the selection/hit geometry all
 * resolve to the SAME font — otherwise their metrics drift and the committed
 * text lands a few pixels off from where it was typed.
 */
export function textFontFamily(style: ShapeStyle = ShapeStyle.CLASSIC): string {
  return style === ShapeStyle.SKETCHY ? SKETCHY_FONT_STACK : "sans-serif";
}

/**
 * The VISIBLE (glyph) bounding box of a TextShape — where the ink actually is,
 * excluding the half-leading the line height adds above the first line and
 * below the last. The selection border and hit box wrap THIS so the border has
 * even spacing on every side instead of extra gap top/bottom from the leading.
 *
 * `position` is the top-left of the first LINE box; the glyphs sit half-leading
 * inside it. Real font metrics (TextMetrics.fontBoundingBoxAscent/Descent) are
 * used so the box matches the actual glyphs — drawText, the textarea, and the
 * selection/hit geometry all derive from the same baseline math, which keeps a
 * text block put when committed and wraps its border precisely.
 */
export function measureTextBox(
  ctx: CanvasRenderingContext2D,
  shape: TextShape,
  style: ShapeStyle = ShapeStyle.CLASSIC
): { x: number; y: number; width: number; height: number } {
  const { position, text, fontSize } = shape;
  ctx.font = `${fontSize}px ${textFontFamily(style)}`;
  const lineHeight = fontSize * 1.2;
  const lines = text.length ? text.split("\n") : [""];

  let width = 0;
  for (const line of lines) {
    width = Math.max(width, ctx.measureText(line).width);
  }

  // Real font metrics (same probe drawText uses) so the vertical extent is the
  // actual glyph area, not the fontSize approximation.
  const probe = ctx.measureText("Mg");
  const fontBoxHeight = probe.fontBoundingBoxAscent + probe.fontBoundingBoxDescent;
  const halfLeading = (lineHeight - fontBoxHeight) / 2;

  return {
    x: position.x,
    y: position.y + halfLeading,
    width,
    // Visible glyphs span from the first line's top (position.y + halfLeading)
    // through the last line's bottom: (N-1) line gaps + one font box.
    height: (lines.length - 1) * lineHeight + fontBoxHeight,
  };
}

/**
 * Draw a text shape on the canvas
 * Feature #129: Multi-line text support with line break handling
 */
export function drawText(
  ctx: CanvasRenderingContext2D,
  shape: TextShape,
  style: ShapeStyle = ShapeStyle.CLASSIC
): void {
  const { position, text, color, fontSize } = shape;

  ctx.fillStyle = color;
  ctx.font = `${fontSize}px ${textFontFamily(style)}`;
  ctx.textBaseline = "alphabetic";

  // Match the textarea's line-box layout exactly. With line-height: fontSize*1.2
  // the browser centers the font box (fontBoundingBoxAscent + Descent) inside
  // the line box, so each line's baseline sits at:
  //   lineTop + halfLeading + fontBoundingBoxAscent
  // where halfLeading = (lineHeight - fontBoxHeight) / 2. Drawing each line at
  // that same baseline makes the canvas glyphs land on the same pixels the
  // textarea showed while typing — the committed text no longer shifts.
  const probe = ctx.measureText("Mg");
  const fontBoxHeight = probe.fontBoundingBoxAscent + probe.fontBoundingBoxDescent;
  const lineHeight = fontSize * 1.2;
  const halfLeading = (lineHeight - fontBoxHeight) / 2;

  // Feature #129: Handle multi-line text
  const lines = text.split('\n');

  lines.forEach((line, index) => {
    const lineTop = position.y + index * lineHeight;
    const baseline = lineTop + halfLeading + probe.fontBoundingBoxAscent;
    ctx.fillText(line, position.x, baseline);
  });
}

/**
 * Draw any shape on the canvas
 * @param ctx - Canvas rendering context
 * @param shape - Shape to draw
 * @param opacity - Optional opacity value (0-1) for fading
 * @param style - Rendering style (classic or sketchy hand-drawn)
 */
export function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  opacity?: number,
  style: ShapeStyle = ShapeStyle.CLASSIC
): void {
  // Feature #35: Apply opacity if provided (for auto-fade)
  const previousAlpha = ctx.globalAlpha;
  if (opacity !== undefined) {
    ctx.globalAlpha = opacity;
  }

  switch (shape.tool) {
    case "arrow":
      drawArrow(ctx, shape as ArrowShape, style);
      break;
    case "line":
      drawLine(ctx, shape as LineShape, style);
      break;
    case "circle":
      drawCircle(ctx, shape as CircleShape, style);
      break;
    case "box":
      drawBox(ctx, shape as BoxShape, style);
      break;
    case "diamond":
      drawDiamond(ctx, shape as DiamondShape, style);
      break;
    case "freehand":
      drawFreehand(ctx, shape as FreehandShape, style);
      break;
    case "highlighter":
      // Intentionally style-independent: rough.js multi-stroke overlaps
      // would show as darker bands through the semi-transparent marker
      drawHighlighter(ctx, shape as HighlighterShape);
      break;
    case "text":
      drawText(ctx, shape as TextShape, style);
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
 * @param style - Rendering style (classic or sketchy hand-drawn)
 */
export function redrawShapes(
  ctx: CanvasRenderingContext2D,
  shapes: Shape[],
  opacities?: Record<string, number>,
  style: ShapeStyle = ShapeStyle.CLASSIC
): void {
  clearCanvas(ctx);
  shapes.forEach((shape) => {
    const opacity = opacities?.[shape.id];
    drawShape(ctx, shape, opacity, style);
  });
}
