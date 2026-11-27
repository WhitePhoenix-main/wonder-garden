import Phaser from 'phaser'
import { island } from '../game/config'
import type { WorldView } from '../runtime/presentation'
import { halfHeight, halfWidth, iso, plotAt, type Point } from './geometry'

interface IslandInput {
  size(): {width:number; height:number}
  view(): WorldView|null
  toWorld(point:Point):Point
  zoom(factor:number,from:Point,to?:Point):void
  pan(delta:Point):void
  pick(plot:number):void
  pickDecor(slot:string):void
}

export function bindInput(canvas: HTMLCanvasElement, input:IslandInput): () => void {
  canvas.style.touchAction = 'none'
  canvas.style.display = 'block'
  const controller = new AbortController()
  const { signal } = controller
  const points = new Map<number, Point>()
  const visited = new Set<number>()
  let start: Point | null = null
  let startIndex: number | null = null
  let startSlot: string | null = null
  let dragging = false
  let pinch = false
  let canSweep = false
  let moved = false

  const position = (event: MouseEvent): Point => {
    const rect = canvas.getBoundingClientRect()
    const size = input.size()
    return {
      x: (event.clientX - rect.left) * size.width / rect.width,
      y: (event.clientY - rect.top) * size.height / rect.height,
    }
  }
  function decorSlot(point:Point):string|null {
    if (!input.view()?.decorEditing) return null
    return island.decorSlots.find(slot => {
      const center = iso(slot.x,slot.y)
      return Math.abs(point.x-center.x)/halfWidth + Math.abs(point.y-center.y)/halfHeight <= 1
    })?.id ?? null
  }
  function sweep(from: Point, to: Point): void {
    const a = input.toWorld(from)
    const b = input.toWorld(to)
    // Sample traversed cells in world coordinates, so a fast swipe still collects intermediate plants.
    const steps = Math.max(1, Math.ceil(Math.hypot(a.x - b.x, a.y - b.y) / (halfHeight / 4)))
    for (let i = 0; i <= steps; i++) {
      const x = Phaser.Math.Linear(a.x,b.x,i / steps)
      const y = Phaser.Math.Linear(a.y,b.y,i / steps)
      const index = plotAt({x,y})
      if (index === null || visited.has(index) || input.view()?.state.plots[index].plant?.readySince == null) continue
      visited.add(index)
      input.pick(index)
    }
  }
  function clear(): void {
    const captured = [...points.keys()]
    points.clear()
    visited.clear()
    start = startIndex = startSlot = null
    dragging = pinch = moved = canSweep = false
    for (const id of captured) {
      if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id)
    }
  }
  canvas.addEventListener('pointerdown',event => {
    if (event.button !== 0 || points.size >= 2) return
    const p = position(event)
    points.set(event.pointerId,p)
    canvas.setPointerCapture(event.pointerId)
    if (points.size > 1) {
      pinch = true
      return
    }
    start = p
    const world = input.toWorld(p)
    startSlot = decorSlot(world)
    startIndex = input.view()?.decorEditing ? null : plotAt(world)
    canSweep = startIndex !== null && input.view()?.mode === 'garden'
  }, {signal})
  canvas.addEventListener('pointermove',event => {
    const prior = points.get(event.pointerId)
    if (!prior || !start) return
    const point = position(event)
    points.set(event.pointerId,point)
    if (points.size === 2) {
      const other = [...points.entries()].find(([id]) => id !== event.pointerId)![1]
      const oldDist = Math.max(4,Math.hypot(prior.x-other.x,prior.y-other.y))
      const newDist = Math.max(4,Math.hypot(point.x-other.x,point.y-other.y))
      input.zoom(newDist / oldDist,midpoint(prior,other),midpoint(point,other))
      return
    }
    if (pinch) return
    const wasMoved = moved
    moved ||= Math.hypot(point.x-start.x,point.y-start.y) >= 6
    if (!moved) return
    const from = wasMoved ? prior : start
    if (canSweep && input.view()?.mode === 'garden') {
      sweep(from,point)
    } else if (startIndex === null) {
      dragging = true
      input.pan({x:point.x-from.x,y:point.y-from.y})
    }
  }, {signal})
  canvas.addEventListener('pointerup',event => {
    if (!points.delete(event.pointerId)) return
    const point = position(event)
    if (points.size !== 0) return
    if (!pinch && !moved && !dragging && start && Math.hypot(point.x-start.x,point.y-start.y) < 6) {
      const world = input.toWorld(point)
      if (startSlot !== null && startSlot === decorSlot(world)) input.pickDecor(startSlot)
      if (startIndex !== null && startIndex === plotAt(world)) input.pick(startIndex)
    }
    clear()
  }, {signal})
  canvas.addEventListener('pointercancel',clear,{signal})
  canvas.addEventListener('lostpointercapture',event => {
    if (points.has(event.pointerId)) clear()
  }, {signal})
  canvas.addEventListener('wheel',event => {
    event.preventDefault()
    input.zoom(event.deltaY > 0 ? 0.88 : 1.14,position(event))
  }, {signal,passive:false})
  window.addEventListener('blur',clear,{signal})
  document.addEventListener('visibilitychange',clear,{signal})
  return () => {
    clear()
    controller.abort()
  }
}

function midpoint(a: Point,b: Point): Point {
  return { x: (a.x+b.x)/2, y: (a.y+b.y)/2 }
}
