import { isValuablePlant, protectedProfile } from '../game/stock-policy'
import Phaser from 'phaser'
import type { IslandId } from '../game/model'
import type { WorldView } from '../runtime/presentation'
import { gridAt, halfHeight, halfWidth, islandForPlot, islandFromView, iso, mapFor, plotAt, plotPosition, type Point } from './geometry'

interface IslandInput {
  size(): {width:number; height:number}
  view(): WorldView|null
  toWorld(point:Point):Point
  zoom(factor:number,from:Point,to?:Point):void
  pan(delta:Point):void
  nursery():void
  market():void
  helper():void
  objectAt(point:Point):'helper'|'market'|'nursery'|'bridge'|null
  bridge():void
  inspect(plot:number):void
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
  let startIsland: IslandId | null = null
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
    return mapFor(islandFromView(input.view())).decorSlots.find(slot => {
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
      const index = plotAt({x,y},islandFromView(input.view()))
      if (index === null || visited.has(index) || input.view()?.state.plots[index]?.plant?.readySince == null) continue
      const state=input.view()!.state
      const plant=state.plots[index].plant!
      if (state.protectedPlants.includes(plant.id) || protectedProfile(state,plant.species,plant) ||
          plant.lives===1 && isValuablePlant(state,plant)) continue
      visited.add(index)
      input.pick(index)
    }
  }
  function clear(): void {
    const captured = [...points.keys()]
    points.clear()
    visited.clear()
    start = startIndex = startSlot = null
    startIsland = null
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
    startIsland = islandFromView(input.view())
    const world = input.toWorld(p)
    startSlot = decorSlot(world)
    startIndex = input.view()?.decorEditing ? null : plotAt(world,startIsland)
    canSweep = !input.view()?.shovel && startIndex !== null && input.view()?.mode === 'garden' &&
      input.view()?.state.plots[startIndex]?.plant?.readySince!=null
  }, {signal})
  canvas.addEventListener('pointermove',event => {
    const prior = points.get(event.pointerId)
    if (!prior || !start) return
    if (islandFromView(input.view()) !== startIsland) { clear(); return }
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
    } else {
      dragging = true
      input.pan({x:point.x-from.x,y:point.y-from.y})
    }
  }, {signal})
  canvas.addEventListener('pointerup',event => {
    if (!points.delete(event.pointerId)) return
    const point = position(event)
    if (points.size !== 0) return
    if (!pinch && !moved && !dragging && start && startIsland === islandFromView(input.view()) &&
      Math.hypot(point.x-start.x,point.y-start.y) < 6) {
      const world = input.toWorld(point)
      const {x,y} = gridAt(world)
      const map=mapFor(startIsland)
      const building=map.structures.find(v=>x>=v.x && x<v.x+v.width && y>=v.y && y<v.y+v.height)
      const plots=input.view()?.state.plots
      const info=plots?.findIndex((p,i)=>{
        if (p.plant?.readySince==null || islandForPlot(i)!==startIsland) return false
        const pos=plotPosition(i)
        return Math.abs(world.x-pos.x-27)<=13 && Math.abs(world.y-pos.y+47)<=13
      })??-1
      const object=input.objectAt(world)
      if (info>=0 && input.view()?.mode==='garden') input.inspect(info)
      else if (startSlot!==null && startSlot===decorSlot(world)) input.pickDecor(startSlot)
      else if (startIndex!==null && startIndex===plotAt(world,startIsland)) input.pick(startIndex)
      else if (object) input[object]()
      else if (building?.id==='greenhouse') input.nursery()
      else if (building?.id==='stall') input.market()
      else if (x===map.bridge.x && y===map.bridge.y) input.bridge()
    }
    clear()
  }, {signal})
  canvas.addEventListener('pointercancel',clear,{signal})
  canvas.addEventListener('contextmenu',event=>{
    event.preventDefault()
    const plot=plotAt(input.toWorld(position(event)),islandFromView(input.view()))
    if (plot!==null) input.inspect(plot)
  },{signal})
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
