import { iso, type Point } from '../geometry'

export type Brush = string | CanvasGradient
export type Canvas = CanvasRenderingContext2D

export const at = (x: number, y: number): Point => ({ x, y })
export const raised = (x: number, y: number, h: number): Point => {
  const p = iso(x, y)
  return at(p.x, p.y - h)
}

export function polygon(ctx: Canvas, points: Point[], fill: Brush, stroke?: string, width = 1): void {
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (const point of points.slice(1)) ctx.lineTo(point.x, point.y)
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  if (stroke) {
    ctx.lineJoin = 'round'
    ctx.lineWidth = width
    ctx.strokeStyle = stroke
    ctx.stroke()
  }
}

export function line(ctx: Canvas, points: Point[], fill: string, width: number): void {
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (const point of points.slice(1)) ctx.lineTo(point.x, point.y)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.strokeStyle = fill
  ctx.lineWidth = width
  ctx.stroke()
}

export function ellipse(ctx: Canvas, x: number, y: number, rx: number, ry: number,
  fill: Brush, rotation = 0): void {
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2)
  ctx.fillStyle = fill
  ctx.fill()
}

export function gradient(ctx: Canvas, top: number, bottom: number, light: string, dark: string): CanvasGradient {
  const color = ctx.createLinearGradient(0, top, 0, bottom)
  color.addColorStop(0, light)
  color.addColorStop(1, dark)
  return color
}

export function shadow(ctx: Canvas, x: number, y: number, rx: number, ry: number, opacity = 0.3): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(rx, ry)
  const fade = ctx.createRadialGradient(0, 0, 0.15, 0, 0, 1)
  fade.addColorStop(0, `rgba(47,54,40,${opacity})`)
  fade.addColorStop(1, 'rgba(47,54,40,0)')
  ellipse(ctx, 0, 0, 1, 1, fade)
  ctx.restore()
}

export function random(seed: number): () => number {
  let state = seed
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0
    return state / 2 ** 32
  }
}

export function diamond(rx: number, ry: number, y = 0): Point[] {
  return [at(0, y - ry), at(rx, y), at(0, y + ry), at(-rx, y)]
}

export type Leaves = [light: string, middle: string, dark: string]
export const green: Leaves = ['#b4d181', '#719a54', '#406744']
export const sun: Leaves = ['#c9d477', '#8ba04a', '#526843']

export function leaf(ctx: Canvas, start: Point, end: Point, width: number, colors: Leaves = green): void {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.hypot(dx, dy)
  const nx = -dy / length * width
  const ny = dx / length * width
  ctx.beginPath()
  ctx.moveTo(start.x, start.y)
  ctx.bezierCurveTo(start.x + 0.14 * dx + nx, start.y + 0.14 * dy + ny,
    end.x - 0.12 * dx + nx, end.y - 0.12 * dy + ny, end.x, end.y)
  ctx.bezierCurveTo(end.x - 0.14 * dx - nx, end.y - 0.14 * dy - ny,
    start.x + 0.24 * dx - nx, start.y + 0.24 * dy - ny, start.x, start.y)
  ctx.fillStyle = gradient(ctx, Math.min(start.y, end.y) - 3, Math.max(start.y, end.y) + 4,
    colors[0], colors[1])
  ctx.fill()
  ctx.strokeStyle = colors[2]
  ctx.lineWidth = 1
  ctx.stroke()
  line(ctx, [start, at(start.x + dx * 0.68, start.y + dy * 0.69)], colors[0], 0.9)
}

export function box(ctx: Canvas, x: number, y: number, w: number, d: number, h: number,
  top: Brush, front: Brush, right: Brush, floor = 0): void {
  const a = raised(x, y, floor + h)
  const b = raised(x + w, y, floor + h)
  const c = raised(x + w, y + d, floor + h)
  const e = raised(x, y + d, floor + h)
  const down = (p: Point): Point => at(p.x, p.y + h)
  polygon(ctx, [e, c, down(c), down(e)], front, '#71664f', 1)
  polygon(ctx, [b, c, down(c), down(b)], right, '#71664f', 1)
  polygon(ctx, [a, b, c, e], top, '#acaa8b', 1.15)
}
